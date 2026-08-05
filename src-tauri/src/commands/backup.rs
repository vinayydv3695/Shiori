use crate::error::Result;
use crate::models::{BackupSelection, RestoreReport, RestoreSelection, RestoreSummary};
use crate::services::backup_service;
use crate::AppState;
use tauri::{Manager, State};

#[tauri::command]
pub fn create_backup(
    app_handle: tauri::AppHandle,
    state: State<AppState>,
    backup_path: String,
    selection: BackupSelection,
    frontend_settings: Option<String>,
) -> Result<backup_service::BackupInfo> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| {
        crate::error::ShioriError::Other(format!("Failed to get app data dir: {}", e))
    })?;

    backup_service::create_backup(
        &state.db,
        &app_data_dir,
        &std::path::Path::new(&backup_path),
        &selection,
        frontend_settings.as_deref(),
    )
}

#[tauri::command]
pub fn restore_backup(
    app_handle: tauri::AppHandle,
    state: State<AppState>,
    backup_path: String,
    selection: Option<RestoreSelection>,
) -> Result<RestoreSummary> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| {
        crate::error::ShioriError::Other(format!("Failed to get app data dir: {}", e))
    })?;

    let selection = selection.unwrap_or_default();

    // Subset-of-full is not supported: the snapshot ATTACH path would copy
    // backup-side book ids and never re-link children by uuid/hash (that only
    // happens on the per-category JSON path). Reject with a clear error before
    // touching the database.
    backup_service::validate_restore_selection(&std::path::Path::new(&backup_path), &selection)?;

    let report = backup_service::restore_backup(
        &state.db,
        &app_data_dir,
        &std::path::Path::new(&backup_path),
        &selection,
    )?;

    Ok(summarize(&state.db, report))
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

#[tauri::command]
pub fn get_backup_info(backup_path: String) -> Result<backup_service::BackupInfo> {
    backup_service::get_backup_info(&std::path::Path::new(&backup_path))
}
