use std::sync::Arc;
use tauri::{Manager, State};
use crate::error::{Result, ShioriError};
use crate::services::torbox::{TorboxService, TorrentInfo};

pub struct TorboxState {
    pub service: Arc<TorboxService>,
}

impl TorboxState {
    pub fn new() -> Result<Self> {
        Ok(Self {
            service: Arc::new(TorboxService::new()?),
        })
    }
}

pub async fn torbox_download_and_import_impl(
    app_handle: &tauri::AppHandle,
    service: &TorboxService,
    app_state: &crate::AppState,
    source_link: String,
    filename_hint: Option<String>,
) -> Result<String> {
    use crate::services::library_service;

    // Add magnet URI or torrent URL to Torbox
    let torrent_id = service.add_download_target(&source_link).await?;

    // Wait for completion (max 5 minutes)
    let info = service.wait_for_completion(torrent_id, 300).await?;

    // Get download link
    let file_id = info.files.as_ref().and_then(|f| f.first().map(|x| x.id));
    let download_url = service.get_download_link(torrent_id, file_id).await?;

    // Determine filename
    let filename = filename_hint
        .or_else(|| info.files.as_ref().and_then(|f| f.first().map(|x| x.name.clone())))
        .unwrap_or_else(|| format!("{}.epub", info.name));

    // Get downloads directory
    let downloads_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::ShioriError::Other(format!("Failed to get app dir: {}", e)))?
        .join("downloads");

    std::fs::create_dir_all(&downloads_dir)?;
    let dest_path = downloads_dir.join(&filename);

    // Download the file
    service.download_file(&download_url, &dest_path).await?;

    let path_str = dest_path.to_string_lossy().to_string();

    let extension = std::path::Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let import_result = if extension == "cbz" || extension == "cbr" {
        library_service::import_manga(&app_state.db, vec![path_str.clone()], &app_state.covers_dir)?
    } else {
        library_service::import_books(&app_state.db, vec![path_str.clone()], &app_state.covers_dir)?
    };

    if let Some((failed_path, reason)) = import_result.failed.first() {
        return Err(crate::error::ShioriError::Other(format!(
            "Downloaded file could not be imported ({}): {}",
            failed_path, reason
        )));
    }

    if let Some(imported_path) = import_result.success.first() {
        return Ok(imported_path.clone());
    }

    if let Some(duplicate_path) = import_result.duplicates.first() {
        return Ok(duplicate_path.clone());
    }

    Ok(path_str)
}

#[tauri::command]
pub async fn torbox_set_api_key(
    app_handle: tauri::AppHandle,
    state: State<'_, TorboxState>,
    api_key: Option<String>,
) -> Result<()> {
    state.service.save_api_key_to_store(&app_handle, api_key).await
}

#[tauri::command]
pub async fn torbox_get_api_key(
    state: State<'_, TorboxState>,
) -> Result<Option<String>> {
    Ok(state.service.get_api_key().await)
}

#[tauri::command]
pub async fn torbox_add_magnet(
    state: State<'_, TorboxState>,
    magnet: String,
) -> Result<i64> {
    state.service.add_magnet(&magnet).await
}

#[tauri::command]
pub async fn torbox_get_status(
    state: State<'_, TorboxState>,
    torrent_id: i64,
) -> Result<TorrentInfo> {
    state.service.get_torrent_status(torrent_id).await
}

#[tauri::command]
pub async fn torbox_get_download_link(
    state: State<'_, TorboxState>,
    torrent_id: i64,
    file_id: Option<i64>,
) -> Result<String> {
    state.service.get_download_link(torrent_id, file_id).await
}

#[tauri::command]
pub async fn torbox_download_and_import(
    app_handle: tauri::AppHandle,
    state: State<'_, TorboxState>,
    app_state: State<'_, crate::AppState>,
    magnet: String,
    filename_hint: Option<String>,
) -> Result<String> {
    torbox_download_and_import_impl(&app_handle, &state.service, &app_state, magnet, filename_hint).await
}

#[tauri::command]
pub async fn torbox_import_existing_target(
    app_handle: tauri::AppHandle,
    state: State<'_, TorboxState>,
    app_state: State<'_, crate::AppState>,
    torrent_id: i64,
    file_id: Option<i64>,
    filename_hint: Option<String>,
) -> Result<String> {
    use crate::services::library_service;

    if torrent_id <= 0 {
        return Err(ShioriError::Validation(
            "torrent_id must be a positive integer".to_string(),
        ));
    }

    let info = state.service.wait_for_completion(torrent_id, 300).await?;
    let selected_file_id = file_id.or_else(|| info.files.as_ref().and_then(|f| f.first().map(|x| x.id)));
    let download_url = state.service.get_download_link(torrent_id, selected_file_id).await?;

    let fallback_name = if info.name.trim().is_empty() {
        format!("torbox-{}", torrent_id)
    } else {
        info.name.clone()
    };

    let source_name = info
        .files
        .as_ref()
        .and_then(|files| {
            selected_file_id
                .and_then(|fid| files.iter().find(|f| f.id == fid))
                .or_else(|| files.first())
                .map(|f| f.name.clone())
        })
        .unwrap_or_else(|| fallback_name.clone());

    let mut filename = filename_hint.unwrap_or(source_name);
    let has_extension = std::path::Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| !e.is_empty())
        .unwrap_or(false);
    if !has_extension {
        filename.push_str(".epub");
    }

    let downloads_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| ShioriError::Other(format!("Failed to get app dir: {}", e)))?
        .join("downloads");

    std::fs::create_dir_all(&downloads_dir)?;
    let dest_path = downloads_dir.join(&filename);

    state.service.download_file(&download_url, &dest_path).await?;

    let path_str = dest_path.to_string_lossy().to_string();
    let extension = std::path::Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let import_result = if extension == "cbz" || extension == "cbr" {
        library_service::import_manga(&app_state.db, vec![path_str.clone()], &app_state.covers_dir)?
    } else {
        library_service::import_books(&app_state.db, vec![path_str.clone()], &app_state.covers_dir)?
    };

    if let Some((failed_path, reason)) = import_result.failed.first() {
        return Err(ShioriError::Other(format!(
            "Downloaded file could not be imported ({}): {}",
            failed_path, reason
        )));
    }

    if let Some(imported_path) = import_result.success.first() {
        return Ok(imported_path.clone());
    }

    if let Some(duplicate_path) = import_result.duplicates.first() {
        return Ok(duplicate_path.clone());
    }

    Ok(path_str)
}
