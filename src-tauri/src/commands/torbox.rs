use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};

use crate::error::{Result, ShioriError};
use crate::models::ImportResult;
use crate::services::torbox::{TorboxService, TorrentInfo};

pub struct TorboxState {
    pub service: Arc<TorboxService>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TorboxLocalDownloadProgress {
    torrent_id: i64,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    progress: Option<f64>,
    phase: String,
    file_index: usize,
    file_total: usize,
    file_name: Option<String>,
}

fn emit_local_download_progress(
    app_handle: &tauri::AppHandle,
    torrent_id: i64,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    progress: Option<f64>,
    phase: &str,
    file_index: usize,
    file_total: usize,
    file_name: Option<String>,
) {
    let payload = TorboxLocalDownloadProgress {
        torrent_id,
        downloaded_bytes,
        total_bytes,
        progress,
        phase: phase.to_string(),
        file_index,
        file_total,
        file_name,
    };

    let _ = app_handle.emit("torbox:local-download-progress", payload);
}

impl TorboxState {
    pub fn new() -> Result<Self> {
        Ok(Self {
            service: Arc::new(TorboxService::new()?),
        })
    }
}

fn is_importable_file_name(name: &str) -> bool {
    let supported_exts = ["cbz", "cbr", "zip", "epub", "pdf", "mobi", "azw3", "docx"];
    std::path::Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            supported_exts
                .iter()
                .any(|supported| ext.eq_ignore_ascii_case(supported))
        })
        .unwrap_or(false)
}

fn collect_importable_files(
    info: &TorrentInfo,
    preferred_file_id: Option<i64>,
) -> Result<Vec<(Option<i64>, String)>> {
    let files = match info.files.as_ref() {
        Some(files) => files,
        None => {
            let fallback = if info.name.trim().is_empty() {
                "torbox-download".to_string()
            } else {
                info.name.clone()
            };
            return Ok(vec![(None, fallback)]);
        }
    };

    if files.is_empty() {
        let fallback = if info.name.trim().is_empty() {
            "torbox-download".to_string()
        } else {
            info.name.clone()
        };
        return Ok(vec![(None, fallback)]);
    }

    if let Some(fid) = preferred_file_id {
        if let Some(file) = files
            .iter()
            .find(|f| f.id == fid && is_importable_file_name(&f.name))
        {
            return Ok(vec![(Some(file.id), file.name.clone())]);
        }

        return Err(ShioriError::Other(
            "Selected Torbox file is not importable. Supported formats: cbz, cbr, zip, epub, pdf, mobi, azw3, docx"
                .to_string(),
        ));
    }

    let selected = files
        .iter()
        .filter(|f| is_importable_file_name(&f.name))
        .map(|f| (Some(f.id), f.name.clone()))
        .collect::<Vec<_>>();

    if selected.is_empty() {
        return Err(ShioriError::Other(
            "No importable files found in Torbox target. Supported formats: cbz, cbr, zip, epub, pdf, mobi, azw3, docx"
                .to_string(),
        ));
    }

    Ok(selected)
}

async fn finalize_import_from_target(
    app_handle: &tauri::AppHandle,
    service: &TorboxService,
    app_state: &crate::AppState,
    target_id: i64,
    info: &TorrentInfo,
    file_id: Option<i64>,
    filename_hint: Option<String>,
) -> Result<String> {
    use crate::services::library_service;

    let selected_files = collect_importable_files(info, file_id)?;
    let total_files = selected_files.len();

    let mut user_download_dir: Option<String> = None;
    if let Ok(conn) = app_state.db.get_connection() {
        if let Ok(mut stmt) =
            conn.prepare("SELECT default_manga_path, default_import_path FROM user_preferences WHERE id = 1")
        {
            if let Ok(mut rows) = stmt.query([]) {
                if let Ok(Some(row)) = rows.next() {
                    let manga_path: Option<String> = row.get(0).unwrap_or(None);
                    let import_path: Option<String> = row.get(1).unwrap_or(None);
                    user_download_dir = manga_path
                        .filter(|p| !p.trim().is_empty())
                        .or_else(|| import_path.filter(|p| !p.trim().is_empty()));
                }
            }
        }
    }

    let _download_guard = crate::ActiveDownloads::increment(app_handle.state::<crate::ActiveDownloads>());

    let downloads_dir = if let Some(path) = user_download_dir.filter(|p| !p.starts_with("content://")) {
        std::path::PathBuf::from(path).join("Torbox Downloads")
    } else {
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| ShioriError::Other(format!("Failed to get app dir: {}", e)))?
            .join("downloads")
    };

    std::fs::create_dir_all(&downloads_dir)?;

    let mut first_imported_path: Option<String> = None;

    for (idx, (chosen_file_id, source_name)) in selected_files.iter().enumerate() {
        let file_index = idx + 1;
        let file_name = source_name.clone();
        let download_url = service
            .get_download_link(target_id, *chosen_file_id)
            .await?;

        let default_extension = std::path::Path::new(source_name)
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_else(|| "epub".to_string());

        let mut filename = if total_files == 1 {
            filename_hint.clone().unwrap_or_else(|| source_name.clone())
        } else {
            source_name.clone()
        };

        let has_extension = std::path::Path::new(&filename)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| !e.is_empty())
            .unwrap_or(false);
        if !has_extension {
            filename.push('.');
            filename.push_str(&default_extension);
        }

        let dest_path = downloads_dir.join(&filename);
        let mut last_emitted_percent: i64 = -1;
        let mut last_emitted_bytes: u64 = 0;

        service
            .download_file_with_progress(
                &download_url,
                &dest_path,
                |downloaded_bytes, total_bytes| {
                    let progress = total_bytes
                        .filter(|total| *total > 0)
                        .map(|total| (downloaded_bytes as f64 / total as f64) * 100.0)
                        .map(|pct| pct.clamp(0.0, 100.0));

                    let should_emit = if let Some(pct) = progress {
                        let rounded = pct.floor() as i64;
                        if rounded > last_emitted_percent {
                            last_emitted_percent = rounded;
                            true
                        } else {
                            false
                        }
                    } else {
                        let delta = downloaded_bytes.saturating_sub(last_emitted_bytes);
                        if delta >= 512 * 1024 {
                            last_emitted_bytes = downloaded_bytes;
                            true
                        } else {
                            false
                        }
                    };

                    if should_emit {
                        emit_local_download_progress(
                            app_handle,
                            target_id,
                            downloaded_bytes,
                            total_bytes,
                            progress,
                            "downloading",
                            file_index,
                            total_files,
                            Some(file_name.clone()),
                        );
                    }
                },
            )
            .await?;

        emit_local_download_progress(
            app_handle,
            target_id,
            0,
            None,
            Some(100.0),
            "importing",
            file_index,
            total_files,
            Some(file_name.clone()),
        );

        let path_str = dest_path.to_string_lossy().to_string();
        let extension = std::path::Path::new(&filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        if extension == "zip" {
            let extract_dir = downloads_dir.join(filename.trim_end_matches(".zip"));
            std::fs::create_dir_all(&extract_dir)?;

            let file = std::fs::File::open(&dest_path)?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| ShioriError::Other(format!("Failed to open zip: {}", e)))?;

            for i in 0..archive.len() {
                let mut file = archive.by_index(i).unwrap();
                let outpath = match file.enclosed_name() {
                    Some(path) => extract_dir.join(path),
                    None => continue,
                };
                if (*file.name()).ends_with('/') {
                    std::fs::create_dir_all(&outpath)?;
                } else {
                    if let Some(p) = outpath.parent() {
                        std::fs::create_dir_all(p)?;
                    }
                    let mut outfile = std::fs::File::create(&outpath)?;
                    std::io::copy(&mut file, &mut outfile)?;
                }
            }

            let _ = std::fs::remove_file(&dest_path);

            let mut import_result = library_service::scan_folder_for_manga(
                &app_state.db,
                &extract_dir.to_string_lossy(),
                &app_state.covers_dir,
            )?;

            if import_result.success.is_empty() {
                import_result = library_service::scan_folder_for_comics(
                    &app_state.db,
                    &extract_dir.to_string_lossy(),
                    &app_state.covers_dir,
                )?;
            }

            if let Some((failed_path, reason)) = import_result.failed.first() {
                return Err(ShioriError::Other(format!(
                    "Extracted folder could not be imported ({}): {}",
                    failed_path, reason
                )));
            }

            if let Some(imported_path) = import_result.success.first() {
                if first_imported_path.is_none() {
                    first_imported_path = Some(imported_path.clone());
                }
            } else if let Some(duplicate_path) = import_result.duplicates.first() {
                if first_imported_path.is_none() {
                    first_imported_path = Some(duplicate_path.clone());
                }
            } else if first_imported_path.is_none() {
                first_imported_path = Some(extract_dir.to_string_lossy().to_string());
            }

            continue;
        }

        let import_result = if extension == "cbz" || extension == "cbr" {
            library_service::import_manga(
                &app_state.db,
                vec![path_str.clone()],
                &app_state.covers_dir,
            )?
        } else {
            library_service::import_books(
                &app_state.db,
                vec![path_str.clone()],
                &app_state.covers_dir,
            )?
        };

        if let Some((failed_path, reason)) = import_result.failed.first() {
            return Err(ShioriError::Other(format!(
                "Downloaded file could not be imported ({}): {}",
                failed_path, reason
            )));
        }

        if let Some(imported_path) = import_result.success.first() {
            if first_imported_path.is_none() {
                first_imported_path = Some(imported_path.clone());
            }
        } else if let Some(duplicate_path) = import_result.duplicates.first() {
            if first_imported_path.is_none() {
                first_imported_path = Some(duplicate_path.clone());
            }
        } else if first_imported_path.is_none() {
            first_imported_path = Some(path_str);
        }
    }

    emit_local_download_progress(
        app_handle,
        target_id,
        0,
        None,
        Some(100.0),
        "completed",
        total_files,
        total_files,
        None,
    );

    first_imported_path.ok_or_else(|| {
        ShioriError::Other(
            "Torbox download finished but no file path was produced for import".to_string(),
        )
    })
}

pub async fn torbox_download_and_import_impl(
    app_handle: &tauri::AppHandle,
    service: &TorboxService,
    app_state: &crate::AppState,
    source_link: String,
    filename_hint: Option<String>,
) -> Result<String> {
    let torrent_id = service.add_download_target(&source_link).await?;

    // Wait for completion (max 15 minutes)
    let info = service.wait_for_completion(torrent_id, 900).await?;

    finalize_import_from_target(
        app_handle,
        service,
        app_state,
        torrent_id,
        &info,
        None,
        filename_hint,
    )
    .await
}

#[tauri::command]
pub async fn torbox_set_api_key(
    app_handle: tauri::AppHandle,
    state: State<'_, TorboxState>,
    api_key: Option<String>,
) -> Result<()> {
    state
        .service
        .save_api_key_to_store(&app_handle, api_key)
        .await
}

#[tauri::command]
pub async fn torbox_get_api_key(state: State<'_, TorboxState>) -> Result<Option<String>> {
    Ok(state.service.get_api_key().await)
}

#[tauri::command]
pub async fn torbox_add_magnet(state: State<'_, TorboxState>, magnet: String) -> Result<i64> {
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
    torbox_download_and_import_impl(
        &app_handle,
        &state.service,
        &app_state,
        magnet,
        filename_hint,
    )
    .await
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
    if torrent_id <= 0 {
        return Err(ShioriError::Validation(
            "torrent_id must be a positive integer".to_string(),
        ));
    }

    let info = state.service.wait_for_completion(torrent_id, 900).await?;

    finalize_import_from_target(
        &app_handle,
        &state.service,
        &app_state,
        torrent_id,
        &info,
        file_id,
        filename_hint,
    )
    .await
}

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
    state
        .service
        .wait_for_completion(torrent_id, wait_seconds)
        .await
}
