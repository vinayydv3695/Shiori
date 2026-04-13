use std::sync::Arc;
use tauri::{Manager, State};
use crate::error::Result;
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
    magnet: String,
    filename_hint: Option<String>,
) -> Result<String> {
    use crate::models::Book;
    use crate::services::library_service;
    use crate::services::metadata_service;
    use uuid::Uuid;

    // Add magnet to Torbox
    let torrent_id = service.add_magnet(&magnet).await?;

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

    // Import to library
    let path_str = dest_path.to_string_lossy().to_string();

    // Extract basic metadata
    let title = std::path::Path::new(&filename)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| filename.clone());

    let format = std::path::Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("unknown")
        .to_lowercase();

    let file_size = std::fs::metadata(&dest_path).ok().map(|m| m.len() as i64);
    let book_uuid = Uuid::new_v4().to_string();

    // Try to extract cover
    let cover_path = metadata_service::extract_cover(&path_str, &book_uuid, &app_state.covers_dir)
        .ok()
        .flatten();

    let new_book = Book {
        id: None,
        uuid: book_uuid,
        title,
        sort_title: None,
        isbn: None,
        isbn13: None,
        publisher: None,
        pubdate: None,
        series: None,
        series_index: None,
        rating: None,
        file_path: path_str.clone(),
        file_format: format,
        file_size,
        file_hash: None,
        cover_path,
        page_count: None,
        word_count: None,
        language: "eng".to_string(),
        added_date: chrono::Utc::now().to_rfc3339(),
        modified_date: chrono::Utc::now().to_rfc3339(),
        last_opened: None,
        notes: None,
        online_metadata_fetched: false,
        metadata_source: None,
        metadata_last_sync: None,
        anilist_id: None,
        is_favorite: false,
        reading_status: "planning".to_string(),
        domain: Some("books".to_string()),
        metadata_locked: None,
        authors: vec![],
        tags: vec![],
    };

    let _book_id = library_service::add_book(&app_state.db, new_book)?;

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
