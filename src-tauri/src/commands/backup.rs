use crate::error::Result;
use crate::models::{BackupSelection, RestoreReport, RestoreSelection, RestoreSummary};
use crate::services::backup_service;
use crate::AppState;
use std::sync::Arc;
use tauri::{Emitter, Manager, State};

/// Backup is heavy (VACUUM INTO + zipping covers/books), so it runs off the
/// main thread. A sync command here blocks the UI thread for the whole backup —
/// on Windows the window goes "Not Responding" and on Android it risks an ANR.
#[tauri::command]
pub async fn create_backup(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    backup_path: String,
    selection: BackupSelection,
    frontend_settings: Option<String>,
) -> Result<backup_service::BackupInfo> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| {
        crate::error::ShioriError::Other(format!("Failed to get app data dir: {}", e))
    })?;
    let db = state.db.clone();

    let app_handle_for_progress = app_handle.clone();
    let progress_cb: backup_service::BackupProgressCallback = Arc::new(move |payload| {
        let _ = app_handle_for_progress.emit("backup:progress", payload);
    });

    tauri::async_runtime::spawn_blocking(move || {
        backup_service::create_backup_with_progress(
            &db,
            &app_data_dir,
            std::path::Path::new(&backup_path),
            &selection,
            frontend_settings.as_deref(),
            Some(&progress_cb),
        )
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(format!("Backup task failed: {}", e)))?
}

#[tauri::command]
pub async fn restore_backup(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    backup_path: String,
    selection: Option<RestoreSelection>,
) -> Result<RestoreSummary> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| {
        crate::error::ShioriError::Other(format!("Failed to get app data dir: {}", e))
    })?;
    let db = state.db.clone();
    let selection = selection.unwrap_or_default();

    // Subset-of-full is not supported: the snapshot ATTACH path would copy
    // backup-side book ids and never re-link children by uuid/hash (that only
    // happens on the per-category JSON path). Reject with a clear error before
    // touching the database.
    let selection_owned = selection.clone();
    let path_for_validate = backup_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        backup_service::validate_restore_selection(std::path::Path::new(&path_for_validate), &selection_owned)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(format!("Restore validation task failed: {}", e)))??;

    let app_handle_for_progress = app_handle.clone();
    let progress_cb: backup_service::RestoreProgressCallback = Arc::new(move |payload| {
        let _ = app_handle_for_progress.emit("restore:progress", payload);
    });

    let db_for_summary = db.clone();
    let report = tauri::async_runtime::spawn_blocking(move || {
        backup_service::restore_backup_with_progress(
            &db,
            &app_data_dir,
            std::path::Path::new(&backup_path),
            &selection,
            Some(&progress_cb),
        )
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(format!("Restore task failed: {}", e)))??;

    Ok(summarize(&db_for_summary, report))
}

/// Wrap the service report with the legacy counters the frontend still reads
/// (books/annotations/shelves restored = post-restore row counts).
fn summarize(db: &crate::db::Database, report: RestoreReport) -> RestoreSummary {
    let count = |sql: &str| -> usize {
        match db.get_connection() {
            Ok(c) => c
                .query_row(sql, [], |row| row.get::<_, usize>(0))
                .unwrap_or(0),
            Err(_) => 0,
        }
    };
    let covers_restored = report.restored.get("covers").copied().unwrap_or(0) as usize;
    let settings_restored = report.frontend_settings.is_some();
    RestoreSummary {
        report,
        books_restored: count("SELECT COUNT(*) FROM books"),
        annotations_restored: count("SELECT COUNT(*) FROM annotations"),
        shelves_restored: count("SELECT COUNT(*) FROM shelves"),
        covers_restored,
        settings_restored,
    }
}

/// Reading a large archive's central directory can take a while for big
/// backups (many covers/books), so run it off the main thread too.
#[tauri::command]
pub async fn get_backup_info(backup_path: String) -> Result<backup_service::BackupInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        backup_service::get_backup_info(std::path::Path::new(&backup_path))
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(format!("Backup info task failed: {}", e)))?
}
