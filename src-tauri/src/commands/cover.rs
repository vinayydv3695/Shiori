use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::error::ShioriError;
use crate::services::cover_service::CoverService;
use crate::services::format_adapter::BookMetadata;

/// Generate cover for a book
#[tauri::command]
pub async fn generate_cover(
    service: State<'_, Arc<CoverService>>,
    book_id: String,
    title: String,
    authors: Option<Vec<String>>,
) -> crate::error::Result<String> {
    let uuid = Uuid::parse_str(&book_id)
        .map_err(|e| ShioriError::Other(format!("Invalid book ID: {}", e)))?;
    
    let metadata = BookMetadata {
        title,
        authors: authors.unwrap_or_default(),
        ..Default::default()
    };
    
    let cover_set = service.get_or_generate_cover(uuid, None, &metadata)
        .await
        .map_err(|e| ShioriError::Other(e.to_string()))?;
    
    Ok(cover_set.medium.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_book_cover(
    service: State<'_, Arc<CoverService>>,
    book_id: String,
    title: String,
    authors: Option<Vec<String>>,
) -> crate::error::Result<String> {
    let uuid = Uuid::parse_str(&book_id)
        .map_err(|e| ShioriError::Other(format!("Invalid book ID: {}", e)))?;
    
    let metadata = BookMetadata {
        title,
        authors: authors.unwrap_or_default(),
        ..Default::default()
    };
    
    let cover_set = service.get_or_generate_cover(uuid, None, &metadata)
        .await
        .map_err(|e| ShioriError::Other(e.to_string()))?;
    
    Ok(cover_set.medium.to_string_lossy().to_string())
}

/// Get raw cover bytes by book ID (for direct IPC streaming, avoids 403 errors)
#[tauri::command]
pub async fn get_book_cover_bytes(
    service: State<'_, Arc<CoverService>>,
    book_id: String,
    title: String,
    authors: Option<Vec<String>>,
) -> crate::error::Result<tauri::ipc::Response> {
    let uuid = Uuid::parse_str(&book_id)
        .map_err(|e| ShioriError::Other(format!("Invalid book ID: {}", e)))?;
    
    let metadata = BookMetadata {
        title,
        authors: authors.unwrap_or_default(),
        ..Default::default()
    };
    
    let cover_set = service.get_or_generate_cover(uuid, None, &metadata)
        .await
        .map_err(|e| ShioriError::Other(e.to_string()))?;
    
    let bytes = tokio::fs::read(&cover_set.medium).await
        .map_err(|e| ShioriError::Io(e))?;
        
    Ok(tauri::ipc::Response::new(bytes))
}

/// Get raw cover bytes by numeric database ID (useful for frontend fetching)
#[tauri::command]
pub async fn get_cover_by_id(
    app_state: State<'_, crate::AppState>,
    service: State<'_, Arc<CoverService>>,
    id: i64,
) -> crate::error::Result<tauri::ipc::Response> {
    let book = {
        let db = &app_state.db;
        crate::services::library_service::get_book_by_id(db, id)?
    };

    // First, try to use the extracted cover from database if it exists
    if let Some(cover_path) = &book.cover_path {
        if let Ok(bytes) = tokio::fs::read(cover_path).await {
            log::debug!("[get_cover_by_id] Using extracted cover from: {}", cover_path);
            return Ok(tauri::ipc::Response::new(bytes));
        } else {
            log::warn!("[get_cover_by_id] Cover path exists but file not found: {}", cover_path);
        }
    }

    // Fallback: Generate or get cover from CoverService
    log::debug!("[get_cover_by_id] No extracted cover, using CoverService for book: {}", book.title);
    let uuid = Uuid::parse_str(&book.uuid)
        .map_err(|e| ShioriError::Other(format!("Invalid book UUID: {}", e)))?;

    let metadata = BookMetadata {
        title: book.title.clone(),
        authors: book.authors.iter().map(|a| a.name.clone()).collect(),
        ..Default::default()
    };

    let cover_set = service.get_or_generate_cover(uuid, None, &metadata)
        .await
        .map_err(|e| ShioriError::Other(e.to_string()))?;

    let bytes = tokio::fs::read(&cover_set.medium).await
        .map_err(|e| ShioriError::Io(e))?;

    Ok(tauri::ipc::Response::new(bytes))
}

/// Get cover file path by numeric database ID (returns path string instead of bytes)
#[tauri::command]
pub async fn get_cover_path_by_id(
    app_state: State<'_, crate::AppState>,
    service: State<'_, Arc<CoverService>>,
    id: i64,
) -> crate::error::Result<Option<String>> {
    let book = {
        let db = &app_state.db;
        crate::services::library_service::get_book_by_id(db, id)?
    };
    
    // Try extracted cover path first
    if let Some(cover_path) = &book.cover_path {
        if std::path::Path::new(cover_path).exists() {
            return Ok(Some(cover_path.clone()));
        }
    }
    
    // Fallback: Generate cover via CoverService
    let uuid = Uuid::parse_str(&book.uuid)
        .map_err(|e| ShioriError::Other(format!("Invalid book UUID: {}", e)))?;
    let metadata = BookMetadata {
        title: book.title.clone(),
        authors: book.authors.iter().map(|a| a.name.clone()).collect(),
        ..Default::default()
    };
    let cover_set = service.get_or_generate_cover(uuid, None, &metadata)
        .await
        .map_err(|e| ShioriError::Other(e.to_string()))?;
    
    Ok(Some(cover_set.medium.to_string_lossy().to_string()))
}

/// Batch-resolve cover file paths for multiple book IDs in a single SQL query.
/// Returns a map of { bookId (as string) -> absoluteFilePath }.
/// IDs whose cover file doesn't exist on disk are omitted so the caller can
/// fall back to the generated-cover service per-book if needed.
///
/// Capped at 200 IDs per call — the virtual grid only shows ~20-40 rows at once,
/// so a single batch call per scroll position is sufficient.
#[tauri::command]
pub async fn get_cover_paths_batch(
    app_state: State<'_, crate::AppState>,
    ids: Vec<i64>,
) -> crate::error::Result<std::collections::HashMap<String, String>> {
    if ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    // Cap to 200 IDs to avoid unbounded query sizes
    let capped: Vec<i64> = ids.into_iter().take(200).collect();

    let db = &app_state.db;
    let conn = db.get_connection()?;

    // Build parameterised IN clause: (?1,?2,?3,...)
    let placeholders: String = capped
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect::<Vec<_>>()
        .join(",");

    let sql = format!(
        "SELECT id, cover_path FROM books WHERE id IN ({}) AND cover_path IS NOT NULL",
        placeholders
    );

    let mut stmt = conn.prepare(&sql)
        .map_err(|e| crate::error::ShioriError::Database(e))?;

    // Build rusqlite params from the Vec<i64>
    use rusqlite::types::ToSql;
    let params: Vec<&dyn ToSql> = capped.iter().map(|id| id as &dyn ToSql).collect();

    let rows = stmt.query_map(params.as_slice(), |row| {
        let id: i64 = row.get(0)?;
        let path: String = row.get(1)?;
        Ok((id, path))
    }).map_err(|e| crate::error::ShioriError::Database(e))?;

    let mut result = std::collections::HashMap::with_capacity(capped.len());
    for row in rows {
        if let Ok((id, path)) = row {
            // Only include if the file actually exists on disk
            if std::path::Path::new(&path).exists() {
                result.insert(id.to_string(), path);
            }
        }
    }

    Ok(result)
}

/// Clear cover cache
#[tauri::command]
pub async fn clear_cover_cache(
    service: State<'_, Arc<CoverService>>,
) -> crate::error::Result<()> {
    service.inner().clear_cache().await;
    Ok(())
}
