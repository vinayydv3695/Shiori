use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::torbox::{torbox_download_and_import_impl, TorboxState};
use crate::error::{Result, ShioriError};
use crate::models::ImportResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyTorboxKeyResult {
    pub valid: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendToTorboxResult {
    pub imported_path: String,
    pub filename: Option<String>,
    pub import_result: ImportResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddToTorboxQueueResult {
    pub torrent_id: i64,
}

#[tauri::command]
pub async fn verify_torbox_key(
    app_handle: tauri::AppHandle,
    state: State<'_, TorboxState>,
    api_key: String,
) -> Result<VerifyTorboxKeyResult> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err(ShioriError::Validation(
            "Torbox API key cannot be empty".to_string(),
        ));
    }

    state.service.verify_api_key(key).await?;
    state
        .service
        .save_api_key_to_store(&app_handle, Some(key.to_string()))
        .await?;

    Ok(VerifyTorboxKeyResult {
        valid: true,
        message: "Torbox API key verified and saved.".to_string(),
    })
}

#[tauri::command]
pub async fn send_to_torbox(
    app_handle: tauri::AppHandle,
    state: State<'_, TorboxState>,
    app_state: State<'_, crate::AppState>,
    magnet_link: String,
    filename_hint: Option<String>,
) -> Result<SendToTorboxResult> {
    let trimmed_link = magnet_link.trim();
    if trimmed_link.is_empty() {
        return Err(ShioriError::Validation(
            "Source link cannot be empty".to_string(),
        ));
    }

    let imported_path = torbox_download_and_import_impl(
        &app_handle,
        &state.service,
        &app_state,
        trimmed_link.to_string(),
        filename_hint,
    )
    .await?;

    let filename = std::path::Path::new(&imported_path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(ToString::to_string);

    Ok(SendToTorboxResult {
        imported_path: imported_path.clone(),
        filename,
        import_result: ImportResult {
            success: vec![imported_path],
            failed: vec![],
            duplicates: vec![],
        },
    })
}

#[tauri::command]
pub async fn get_torbox_instant(
    state: State<'_, TorboxState>,
    torrent_id: i64,
) -> Result<crate::services::torbox::TorrentInfo> {
    if torrent_id <= 0 {
        return Err(ShioriError::Validation(
            "torrent_id must be a positive integer".to_string(),
        ));
    }
    state.service.get_torrent_status(torrent_id).await
}

#[tauri::command]
pub async fn add_to_torbox_queue(
    state: State<'_, TorboxState>,
    magnet_link: String,
) -> Result<AddToTorboxQueueResult> {
    let trimmed_link = magnet_link.trim();
    if trimmed_link.is_empty() {
        return Err(ShioriError::Validation(
            "Source link cannot be empty".to_string(),
        ));
    }

    let torrent_id = state.service.add_download_target(trimmed_link).await?;
    Ok(AddToTorboxQueueResult { torrent_id })
}

#[tauri::command]
pub async fn save_torbox_key(
    app_handle: tauri::AppHandle,
    state: State<'_, TorboxState>,
    api_key: String,
) -> Result<()> {
    let normalized = api_key.trim();
    if normalized.is_empty() {
        state.service.save_api_key_to_store(&app_handle, None).await
    } else {
        state
            .service
            .save_api_key_to_store(&app_handle, Some(normalized.to_string()))
            .await
    }
}

#[tauri::command]
pub async fn get_torbox_key(
    app_handle: tauri::AppHandle,
    state: State<'_, TorboxState>,
) -> Result<Option<String>> {
    state.service.load_api_key_from_store(&app_handle).await?;
    Ok(state.service.get_api_key().await)
}

#[tauri::command]
pub async fn import_from_torbox(
    app_handle: tauri::AppHandle,
    state: State<'_, TorboxState>,
    app_state: State<'_, crate::AppState>,
    magnet_link: String,
    filename_hint: Option<String>,
) -> Result<String> {
    let response = send_to_torbox(app_handle, state, app_state, magnet_link, filename_hint).await?;
    Ok(response.imported_path)
}

#[tauri::command]
pub async fn import_existing_torbox_target(
    app_handle: tauri::AppHandle,
    state: State<'_, TorboxState>,
    app_state: State<'_, crate::AppState>,
    torrent_id: i64,
    file_id: Option<i64>,
    filename_hint: Option<String>,
) -> Result<String> {
    crate::commands::torbox::torbox_import_existing_target(
        app_handle,
        state,
        app_state,
        torrent_id,
        file_id,
        filename_hint,
    )
    .await
}

#[tauri::command]
pub async fn resolve_torbox_download(
    state: State<'_, TorboxState>,
    torrent_id: i64,
    file_id: Option<i64>,
) -> Result<String> {
    if torrent_id <= 0 {
        return Err(ShioriError::Validation(
            "torrent_id must be a positive integer".to_string(),
        ));
    }
    state.service.get_download_link(torrent_id, file_id).await
}

#[tauri::command]
pub async fn wait_for_torbox_completion(
    state: State<'_, TorboxState>,
    torrent_id: i64,
    max_wait_seconds: Option<u64>,
) -> Result<crate::services::torbox::TorrentInfo> {
    if torrent_id <= 0 {
        return Err(ShioriError::Validation(
            "torrent_id must be a positive integer".to_string(),
        ));
    }

    let wait_seconds = max_wait_seconds.unwrap_or(900).clamp(5, 1800);
    state.service.wait_for_completion(torrent_id, wait_seconds).await
}
