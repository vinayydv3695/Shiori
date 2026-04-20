use std::path::PathBuf;

use tauri::{Manager, State};
use tauri_plugin_store::StoreExt;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResponse, SearchResult, SourceMeta};
use crate::sources::annas_archive::{AnnasArchiveConfig, AnnasArchiveSource};
use crate::sources::network::TorrentNetworkConfig;
use crate::sources::rutracker::{RutrackerConfig, RutrackerSource};

#[tauri::command]
pub async fn anna_archive_get_config(
    state: State<'_, crate::AppState>,
) -> Result<AnnasArchiveConfig> {
    let source = {
        let registry = state.plugin_registry.read().await;
        registry
            .get("anna-archive")
            .ok_or_else(|| ShioriError::Validation("Unknown source: anna-archive".to_string()))?
    };

    let source = source
        .as_any()
        .downcast_ref::<AnnasArchiveSource>()
        .ok_or_else(|| ShioriError::Other("Anna source type mismatch".to_string()))?;

    Ok(source.get_config().await)
}

#[tauri::command]
pub async fn anna_archive_set_config(
    app_handle: tauri::AppHandle,
    state: State<'_, crate::AppState>,
    config: AnnasArchiveConfig,
) -> Result<()> {
    let source = {
        let registry = state.plugin_registry.read().await;
        registry
            .get("anna-archive")
            .ok_or_else(|| ShioriError::Validation("Unknown source: anna-archive".to_string()))?
    };

    let source = source
        .as_any()
        .downcast_ref::<AnnasArchiveSource>()
        .ok_or_else(|| ShioriError::Other("Anna source type mismatch".to_string()))?;

    source.save_config_to_store(&app_handle, config).await
}

#[tauri::command]
pub async fn rutracker_get_config(
    state: State<'_, crate::AppState>,
) -> Result<RutrackerConfig> {
    let source = {
        let registry = state.plugin_registry.read().await;
        registry
            .get("rutracker")
            .ok_or_else(|| ShioriError::Validation("Unknown source: rutracker".to_string()))?
    };

    let source = source
        .as_any()
        .downcast_ref::<RutrackerSource>()
        .ok_or_else(|| ShioriError::Other("RuTracker source type mismatch".to_string()))?;

    Ok(source.get_config().await)
}

#[tauri::command]
pub async fn rutracker_set_config(
    app_handle: tauri::AppHandle,
    state: State<'_, crate::AppState>,
    config: RutrackerConfig,
) -> Result<()> {
    let source = {
        let registry = state.plugin_registry.read().await;
        registry
            .get("rutracker")
            .ok_or_else(|| ShioriError::Validation("Unknown source: rutracker".to_string()))?
    };

    let source = source
        .as_any()
        .downcast_ref::<RutrackerSource>()
        .ok_or_else(|| ShioriError::Other("RuTracker source type mismatch".to_string()))?;

    let store = app_handle
        .store("sources.json")
        .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

    match config.base_url.as_ref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
        Some(value) => {
            store.set("rutracker.base_url", serde_json::json!(value));
        }
        None => {
            let _ = store.delete("rutracker.base_url");
        }
    }

    match config.cookie.as_ref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
        Some(value) => {
            store.set("rutracker.cookie", serde_json::json!(value));
        }
        None => {
            let _ = store.delete("rutracker.cookie");
        }
    }

    store
        .save()
        .map_err(|e| ShioriError::Other(format!("Failed to save source config: {}", e)))?;

    source.set_config(config).await;
    Ok(())
}

#[tauri::command]
pub async fn torrent_network_get_config(
    app_handle: tauri::AppHandle,
) -> Result<TorrentNetworkConfig> {
    TorrentNetworkConfig::load_from_store(&app_handle)
}

#[tauri::command]
pub async fn torrent_network_set_config(
    app_handle: tauri::AppHandle,
    config: TorrentNetworkConfig,
) -> Result<()> {
    let normalized = config.normalized();
    TorrentNetworkConfig::save_to_store(&app_handle, &normalized)?;
    Ok(())
}

#[tauri::command]
pub async fn list_sources(state: State<'_, crate::AppState>) -> Result<Vec<SourceMeta>> {
    let registry = state.plugin_registry.read().await;
    Ok(registry.list())
}

#[tauri::command]
pub async fn list_sources_by_type(
    state: State<'_, crate::AppState>,
    content_type: String,
) -> Result<Vec<SourceMeta>> {
    let normalized = content_type.trim().to_ascii_lowercase();
    let parsed = match normalized.as_str() {
        "manga" => ContentType::Manga,
        "book" => ContentType::Book,
        _ => {
            return Err(ShioriError::Validation(format!(
                "Unsupported content type: {}",
                content_type
            )))
        }
    };

    let registry = state.plugin_registry.read().await;
    Ok(registry.list_by_type(parsed))
}

#[tauri::command]
pub async fn plugin_search(
    state: State<'_, crate::AppState>,
    source_id: String,
    query: String,
    page: Option<u32>,
) -> Result<Vec<SearchResult>> {
    let source = {
        let registry = state.plugin_registry.read().await;
        registry
            .get(&source_id)
            .ok_or_else(|| ShioriError::Validation(format!("Unknown source: {}", source_id)))?
    };

    source.search(&query, page.unwrap_or(1)).await
}

#[tauri::command]
pub async fn plugin_search_with_meta(
    state: State<'_, crate::AppState>,
    source_id: String,
    query: String,
    page: Option<u32>,
    limit: Option<u32>,
) -> Result<SearchResponse> {
    let source = {
        let registry = state.plugin_registry.read().await;
        registry
            .get(&source_id)
            .ok_or_else(|| ShioriError::Validation(format!("Unknown source: {}", source_id)))?
    };

    source
        .search_with_meta(&query, page.unwrap_or(1), limit.unwrap_or(20))
        .await
}

#[tauri::command]
pub async fn plugin_browse(
    state: State<'_, crate::AppState>,
    source_id: String,
    mode: String,
    page: Option<u32>,
    limit: Option<u32>,
) -> Result<Vec<SearchResult>> {
    let source = {
        let registry = state.plugin_registry.read().await;
        registry
            .get(&source_id)
            .ok_or_else(|| ShioriError::Validation(format!("Unknown source: {}", source_id)))?
    };

    source
        .browse(&mode, page.unwrap_or(1), limit.unwrap_or(20))
        .await
}

#[tauri::command]
pub async fn plugin_get_chapters(
    state: State<'_, crate::AppState>,
    source_id: String,
    content_id: String,
) -> Result<Vec<Chapter>> {
    let source = {
        let registry = state.plugin_registry.read().await;
        registry
            .get(&source_id)
            .ok_or_else(|| ShioriError::Validation(format!("Unknown source: {}", source_id)))?
    };

    source.get_chapters(&content_id).await
}

#[tauri::command]
pub async fn plugin_get_pages(
    state: State<'_, crate::AppState>,
    source_id: String,
    chapter_id: String,
) -> Result<Vec<Page>> {
    let source = {
        let registry = state.plugin_registry.read().await;
        registry
            .get(&source_id)
            .ok_or_else(|| ShioriError::Validation(format!("Unknown source: {}", source_id)))?
    };

    source.get_pages(&chapter_id).await
}

#[tauri::command]
pub async fn plugin_download_chapter(
    state: State<'_, crate::AppState>,
    source_id: String,
    chapter_id: String,
    dest_dir: String,
) -> Result<Vec<String>> {
    let source = {
        let registry = state.plugin_registry.read().await;
        registry
            .get(&source_id)
            .ok_or_else(|| ShioriError::Validation(format!("Unknown source: {}", source_id)))?
    };

    let pages = source.get_pages(&chapter_id).await?;
    let dest = PathBuf::from(dest_dir);
    tokio::fs::create_dir_all(&dest).await?;

    let user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    
    let referer = match source_id.as_str() {
        "toongod" => Some("https://www.toongod.org/"),
        "mangadex" => Some("https://mangadex.org/"),
        _ => None,
    };

    let client = reqwest::Client::builder()
        .user_agent(user_agent)
        .build()
        .map_err(|e| ShioriError::Other(format!("Failed to create download client: {}", e)))?;

    let mut written = Vec::new();
    for (idx, page) in pages.iter().enumerate() {
        let mut req = client.get(&page.url);
        if let Some(ref_url) = referer {
            req = req.header("Referer", ref_url);
        }

        let response = req
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Failed to download page {}: {}", idx, e)))?;

        if !response.status().is_success() {
            return Err(ShioriError::Other(format!(
                "Page {} download failed with status {}",
                idx,
                response.status()
            )));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| ShioriError::Other(format!("Failed reading page {} bytes: {}", idx, e)))?;

        let file_path = dest.join(format!("{:03}.jpg", idx + 1));
        tokio::fs::write(&file_path, &bytes).await?;
        written.push(file_path.to_string_lossy().to_string());
    }

    Ok(written)
}

#[tauri::command]
pub async fn set_source_config(
    app_handle: tauri::AppHandle,
    source_id: String,
    key: String,
    value: String,
) -> Result<bool> {
    let store = app_handle
        .store("sources.json")
        .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

    let storage_key = format!("{}.{}", source_id, key);
    store.set(storage_key, serde_json::Value::String(value.clone()));
    store
        .save()
        .map_err(|e| ShioriError::Other(format!("Failed to save source config: {}", e)))?;

    Ok(true)
}

#[tauri::command]
pub async fn annas_archive_download(
    app_handle: tauri::AppHandle,
    state: State<'_, crate::AppState>,
    content_id: String,
    title_hint: Option<String>,
) -> Result<String> {
    use crate::models::Book;
    use crate::services::library_service;
    use crate::services::metadata_service;
    use uuid::Uuid;

    // Create Anna's Archive source
    let source = AnnasArchiveSource::new()?;
    source.load_config_from_store(&app_handle).await?;
    
    // Get download options from the detail page
    let options = source.get_download_options(&content_id).await?;
    
    if options.is_empty() {
        return Err(ShioriError::Other(
            "No download links found. Use 'View Details' to download manually in your browser.".to_string()
        ));
    }
    
    // Find a direct download option (prefer direct > external > torrent/magnet)
    let direct_option = options.iter().find(|o| {
        matches!(o.download_type, crate::sources::annas_archive::DownloadType::Direct)
    });
    
    let external_option = options.iter().find(|o| {
        matches!(o.download_type, crate::sources::annas_archive::DownloadType::External)
    });
    
    // Check for magnet/torrent options
    let has_magnet = options.iter().any(|o| {
        matches!(o.download_type, crate::sources::annas_archive::DownloadType::Magnet | 
                 crate::sources::annas_archive::DownloadType::Torrent)
    });
    
    // Get the download URL
    let download_url = if let Some(opt) = direct_option {
        opt.url.clone()
    } else if let Some(opt) = external_option {
        opt.url.clone()
    } else if has_magnet {
        return Err(ShioriError::Other(
            "Only torrent downloads available. Set up Torbox in Settings → Online Sources, then use the 'Torbox' button. Or use 'View Details' to download manually.".to_string()
        ));
    } else {
        return Err(ShioriError::Other(
            "No direct download available. Use 'View Details' to download manually in your browser.".to_string()
        ));
    };
    
    // Download the file
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| ShioriError::Other(format!("Failed to create download client: {}", e)))?;
    
    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| ShioriError::Other(format!("Download request failed: {}", e)))?;
    
    if !response.status().is_success() {
        return Err(ShioriError::Other(format!(
            "Download failed (status {}). Use 'View Details' to download manually.",
            response.status()
        )));
    }
    
    // Check Content-Type to see if we got an actual file or an HTML page
    let content_type = response.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    
    if content_type.contains("text/html") {
        return Err(ShioriError::Other(
            "Download blocked (received HTML page instead of file). This source requires browser authentication. Use 'View Details' to download manually, or set up Torbox for automatic torrent downloads.".to_string()
        ));
    }
    
    // Try to get filename from Content-Disposition header
    let filename = response.headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| {
            // Handle both filename= and filename*= formats
            s.split("filename=").nth(1)
                .or_else(|| s.split("filename*=").nth(1))
                .map(|f| {
                    // Remove quotes and any encoding prefix (e.g., UTF-8'')
                    let cleaned = f.trim_matches('"').trim_matches('\'');
                    if let Some(pos) = cleaned.find("''") {
                        cleaned[pos + 2..].to_string()
                    } else {
                        cleaned.to_string()
                    }
                })
        })
        .and_then(|f| urlencoding::decode(&f).ok().map(|s| s.to_string()))
        .or_else(|| {
            // Try to extract from URL
            download_url.split('/').last()
                .filter(|s| s.contains('.'))
                .and_then(|s| urlencoding::decode(s).ok().map(|d| d.to_string()))
        })
        .unwrap_or_else(|| {
            let title = title_hint.clone().unwrap_or_else(|| content_id.clone());
            let safe_title: String = title.chars()
                .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_')
                .collect();
            format!("{}.epub", safe_title)
        });
    
    let bytes = response.bytes().await
        .map_err(|e| ShioriError::Other(format!("Failed to read download: {}", e)))?;
    
    // Validate file content - check magic bytes
    if bytes.len() < 4 {
        return Err(ShioriError::Other(
            "Downloaded file is too small to be valid. Use 'View Details' to download manually.".to_string()
        ));
    }
    
    // Check for HTML content even if Content-Type was wrong
    let starts_with_html = bytes.starts_with(b"<!DOCTYPE") || 
                           bytes.starts_with(b"<!doctype") ||
                           bytes.starts_with(b"<html") ||
                           bytes.starts_with(b"<HTML");
    
    if starts_with_html {
        return Err(ShioriError::Other(
            "Download blocked (received HTML instead of ebook). This source requires browser authentication. Use 'View Details' to download manually, or set up Torbox for torrent downloads.".to_string()
        ));
    }
    
    // Determine actual format from file magic bytes
    let detected_format = if bytes.starts_with(&[0x50, 0x4B, 0x03, 0x04]) {
        // ZIP magic bytes - could be EPUB, CBZ, DOCX, etc.
        if filename.to_lowercase().ends_with(".cbz") {
            "cbz"
        } else {
            "epub" // Assume EPUB for ZIP files from book sources
        }
    } else if bytes.starts_with(b"%PDF") {
        "pdf"
    } else if bytes.len() > 68 && &bytes[60..68] == b"BOOKMOBI" {
        "mobi"
    } else {
        // Use extension from filename
        std::path::Path::new(&filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("unknown")
    };
    
    // Ensure filename has correct extension
    let final_filename = if !filename.to_lowercase().ends_with(&format!(".{}", detected_format)) {
        format!("{}.{}", filename.trim_end_matches(|c: char| c == '.' || c.is_alphabetic()), detected_format)
    } else {
        filename.clone()
    };
    
    // Save to downloads directory
    let downloads_dir = app_handle.path()
        .app_data_dir()
        .map_err(|e| ShioriError::Other(format!("Failed to get app dir: {}", e)))?
        .join("downloads");
    
    std::fs::create_dir_all(&downloads_dir)?;
    let dest_path = downloads_dir.join(&final_filename);
    std::fs::write(&dest_path, &bytes)?;
    
    // Import to library
    let path_str = dest_path.to_string_lossy().to_string();
    
    let title = std::path::Path::new(&final_filename)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .or(title_hint.clone())
        .unwrap_or_else(|| final_filename.clone());
    
    let file_size = bytes.len() as i64;
    let book_uuid = Uuid::new_v4().to_string();
    
    let cover_path = metadata_service::extract_cover(&path_str, &book_uuid, &state.covers_dir)
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
        file_format: detected_format.to_string(),
        file_size: Some(file_size),
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
    
    library_service::add_book(&state.db, new_book)?;
    
    Ok(path_str)
}

#[tauri::command]
pub async fn proxy_manga_image(
    source_id: String,
    image_url: String,
) -> Result<Vec<u8>> {
    let user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    
    // Determine referer based on source
    let referer = match source_id.as_str() {
        "toongod" => Some("https://www.toongod.org/"),
        "mangadex" => Some("https://mangadex.org/"),
        _ => None,
    };

    let mut req = reqwest::Client::new()
        .get(&image_url)
        .header("User-Agent", user_agent);
    
    if let Some(ref_url) = referer {
        req = req.header("Referer", ref_url);
    }

    let response = req
        .send()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to fetch image: {}", e)))?;

    if !response.status().is_success() {
        return Err(ShioriError::Other(format!(
            "Image fetch failed with status {}",
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to read image bytes: {}", e)))?;

    Ok(bytes.to_vec())
}
