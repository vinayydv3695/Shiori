use crate::error::Result;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{Manager, State};
use tokio::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct MigrationResult {
    pub success: bool,
    pub moved_count: usize,
    pub failed_count: usize,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn migrate_library(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    target: Option<String>,
) -> Result<MigrationResult> {
    let target_dir = if let Some(t) = target {
        PathBuf::from(t)
    } else {
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?
            .join("library")
    };

    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).await.map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;
    }

    let conn = state.db.get_connection()?;
    let books: Vec<(i32, String)> = {
        let mut stmt = conn.prepare("SELECT id, file_path FROM books")?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        let mut result = Vec::new();
        for row in rows {
            if let Ok(b) = row {
                result.push(b);
            }
        }
        result
    };

    let mut moved_count = 0;
    let mut failed_count = 0;
    let mut errors = Vec::new();

    for (id, file_path) in books {
        let path = Path::new(&file_path);
        if !path.starts_with(&target_dir) {
            if let Some(file_name) = path.file_name() {
                let new_path = target_dir.join(file_name);
                
                // Copy first, then remove original to be safe
                match fs::copy(&path, &new_path).await {
                    Ok(_) => {
                        match fs::remove_file(&path).await {
                            Ok(_) => {
                                // Update DB
                                let _ = conn.execute(
                                    "UPDATE books SET file_path = ? WHERE id = ?",
                                    (new_path.to_string_lossy().to_string(), id),
                                );
                                moved_count += 1;
                            }
                            Err(e) => {
                                // If we copied but couldn't delete, it's partially failed, but we still updated the path?
                                // Let's just update the DB anyway.
                                let _ = conn.execute(
                                    "UPDATE books SET file_path = ? WHERE id = ?",
                                    (new_path.to_string_lossy().to_string(), id),
                                );
                                moved_count += 1;
                                log::warn!("Moved file but could not delete original: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        failed_count += 1;
                        errors.push(format!("Failed to move {}: {}", file_path, e));
                    }
                }
            }
        }
    }

    Ok(MigrationResult {
        success: failed_count == 0,
        moved_count,
        failed_count,
        errors,
    })
}
