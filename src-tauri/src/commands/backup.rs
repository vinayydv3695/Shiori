use crate::error::Result;
use crate::services::backup_service;
use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBackupOptions {
    pub include_books: bool,
    pub frontend_settings: Option<String>,
}

#[tauri::command]
pub fn create_backup(
    app_handle: tauri::AppHandle,
    state: State<AppState>,
    backup_path: String,
    options: CreateBackupOptions,
) -> Result<backup_service::BackupInfo> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| {
        crate::error::ShioriError::Other(format!("Failed to get app data dir: {}", e))
    })?;

    backup_service::create_backup(
        &state.db,
        &app_data_dir,
        &std::path::Path::new(&backup_path),
        options.include_books,
        options.frontend_settings.as_deref(),
    )
}

#[tauri::command]
pub fn restore_backup(
    app_handle: tauri::AppHandle,
    state: State<AppState>,
    backup_path: String,
) -> Result<backup_service::RestoreInfo> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| {
        crate::error::ShioriError::Other(format!("Failed to get app data dir: {}", e))
    })?;

    backup_service::restore_backup(
        &state.db,
        &app_data_dir,
        &std::path::Path::new(&backup_path),
    )
}

#[tauri::command]
pub fn get_backup_info(backup_path: String) -> Result<backup_service::BackupInfo> {
    backup_service::get_backup_info(&std::path::Path::new(&backup_path))
}
