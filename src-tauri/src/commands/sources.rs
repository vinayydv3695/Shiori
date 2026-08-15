use std::io::Write;
use std::path::PathBuf;
use std::time::Instant;

use tauri::{Emitter, Manager, State};
use tauri_plugin_store::StoreExt;

use serde::Serialize;

use crate::error::{Result, ShioriError};
use crate::sources::annas_archive::{AnnasArchiveConfig, AnnasArchiveSource, DownloadType};
use crate::sources::{
    Chapter, ContentType, Page, SearchResponse, SearchResult, SourceError, SourceHealth, SourceMeta,
    SourceSearchDiagnostics,
};

/// Guard helper: fetch a source from the registry and verify it is enabled.
/// Disabled sources fail with [`SourceError::SourceDisabled`] so the frontend
/// can show the enable hint instead of a raw network error.
///
/// Free function over `&SourceRegistry` (no tauri `State`) so it is
/// unit-testable without a Tauri runtime.
fn ensure_enabled(
    registry: &crate::sources::registry::SourceRegistry,
    source_id: &str,
) -> Result<std::sync::Arc<dyn crate::sources::Source>> {
    let source = registry
        .get(source_id)
        .ok_or_else(|| ShioriError::Validation(format!("Unknown source: {}", source_id)))?;
    if !registry.is_enabled(source_id) {
        return Err(SourceError::SourceDisabled.into());
    }
    Ok(source)
}

async fn get_enabled_source(
    state: &State<'_, crate::AppState>,
    source_id: &str,
) -> Result<std::sync::Arc<dyn crate::sources::Source>> {
    let registry = state.plugin_registry.read().await;
    ensure_enabled(&registry, source_id)
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

/// Enable or disable a source in the backend registry. The frontend keeps
/// its own mirror of the flag; this is the authoritative one.
#[tauri::command]
pub async fn source_set_enabled(
    state: State<'_, crate::AppState>,
    source_id: String,
    enabled: bool,
) -> Result<bool> {
    let mut registry = state.plugin_registry.write().await;
    registry.set_enabled(&source_id, enabled)?;
    log::info!("[sources] {} {} {}", source_id, if enabled { "enabled" } else { "disabled" }, "by user");
    Ok(enabled)
}

/// Probe a source's health. Wrapped in a 15s timeout: a hanging probe is
/// reported as `Unavailable` rather than blocking the caller.
#[tauri::command]
pub async fn source_health(
    state: State<'_, crate::AppState>,
    source_id: String,
) -> Result<SourceHealth> {
    let source = {
        let registry = state.plugin_registry.read().await;
        registry
            .get(&source_id)
            .ok_or_else(|| ShioriError::Validation(format!("Unknown source: {}", source_id)))?
    };

    match tokio::time::timeout(std::time::Duration::from_secs(15), source.health_check()).await {
        Ok(Ok(health)) => Ok(health),
        Ok(Err(e)) => {
            log::warn!("[sources] health_check for {} failed: {}", source_id, e);
            Ok(SourceHealth::Unavailable)
        }
        Err(_) => {
            log::warn!("[sources] health_check for {} timed out", source_id);
            Ok(SourceHealth::Unavailable)
        }
    }
}

#[tauri::command]
pub async fn plugin_search(
    state: State<'_, crate::AppState>,
    source_id: String,
    query: String,
    page: Option<u32>,
) -> Result<Vec<SearchResult>> {
    let source = get_enabled_source(&state, &source_id).await?;

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
    let source = get_enabled_source(&state, &source_id).await?;

    let source_meta = source.meta();
    let started = Instant::now();
    let mut response = source
        .search_with_meta(&query, page.unwrap_or(1), limit.unwrap_or(20))
        .await?;
    let duration_ms = started.elapsed().as_millis() as u64;

    if response.diagnostics.is_none() {
        response.diagnostics = Some(SourceSearchDiagnostics {
            source_id: source_id.clone(),
            source_name: Some(source_meta.name),
            selected_mirror: None,
            selected_base: None,
            attempted_mirrors: vec![],
            duration_ms,
            result_count: response.items.len() as u32,
            retries_used: None,
        });
    }

    Ok(response)
}

#[tauri::command]
pub async fn plugin_browse(
    state: State<'_, crate::AppState>,
    source_id: String,
    mode: String,
    page: Option<u32>,
    limit: Option<u32>,
    genres: Option<Vec<String>>,
    types: Option<Vec<String>>,
) -> Result<Vec<SearchResult>> {
    let source = get_enabled_source(&state, &source_id).await?;

    source
        .browse(&mode, page.unwrap_or(1), limit.unwrap_or(20), genres, types)
        .await
}

#[tauri::command]
pub async fn plugin_get_chapters(
    state: State<'_, crate::AppState>,
    source_id: String,
    content_id: String,
) -> Result<Vec<Chapter>> {
    let source = get_enabled_source(&state, &source_id).await?;

    source.get_chapters(&content_id).await
}

#[tauri::command]
pub async fn plugin_get_pages(
    state: State<'_, crate::AppState>,
    source_id: String,
    chapter_id: String,
) -> Result<Vec<Page>> {
    let source = get_enabled_source(&state, &source_id).await?;

    source.get_pages(&chapter_id).await
}

#[tauri::command]
pub async fn plugin_download_chapter(
    app_handle: tauri::AppHandle,
    state: State<'_, crate::AppState>,
    source_id: String,
    chapter_id: String,
    dest_dir: String,
) -> Result<Vec<String>> {
    crate::utils::validate::require_safe_path(&dest_dir, "dest_dir")?;

    let registry = state.plugin_registry.read().await;
    let source = ensure_enabled(&registry, &source_id)?;

    let _download_guard =
        crate::ActiveDownloads::increment(app_handle.state::<crate::ActiveDownloads>());

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
        if idx > 0 && source_id != "mangafire" {
            // Rate limiting: sleep 250ms between page downloads to prevent hammering the source
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }

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
pub async fn proxy_manga_image(
    state: State<'_, crate::AppState>,
    source_id: String,
    image_url: String,
) -> Result<Vec<u8>> {
    // Same enable gate as every other source command: a disabled source must
    // not keep serving images.
    let registry = state.plugin_registry.read().await;
    ensure_enabled(&registry, &source_id)?;

    let user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

    // Determine referer based on source
    let referer = match source_id.as_str() {
        "toongod" => Some("https://www.toongod.org/"),
        "toonily" => Some("https://toonily.com/"),
        "toontop" => Some("https://toontop.io/"),
        "manhwaread" => Some("https://manhwaread.com/"),
        "mangadex" => Some("https://mangadex.org/"),
        "weebrook" => Some("https://weebrook.com/"),
        "manhwahub" => Some("https://manhwahub.net/"),
        "libgen" => Some("https://libgen.li/"),
        "mangafire" => Some("https://mangafire.to/"),
        _ => None,
    };

    static HTTP_CLIENT: once_cell::sync::Lazy<reqwest::Client> = once_cell::sync::Lazy::new(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .unwrap_or_default()
    });

    let mut response = crate::guarded_get_with(&HTTP_CLIENT, &image_url, |req| {
        let req = req
            .header("User-Agent", user_agent)
            .header(
                "Accept",
                "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            )
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("Sec-Fetch-Dest", "image")
            .header("Sec-Fetch-Mode", "no-cors")
            .header("Sec-Fetch-Site", "cross-site");
        if let Some(ref_url) = referer {
            req.header("Referer", ref_url)
        } else {
            req
        }
    })
    .await
    .map_err(|e| ShioriError::Other(format!("Failed to fetch image: {}", e)))?;

    if !response.status().is_success() {
        return Err(ShioriError::Other(format!(
            "Image fetch failed with status {}",
            response.status()
        )));
    }

    // Cap the body at 25MB to avoid memory exhaustion.
    let mut bytes = Vec::new();
    let max_body: usize = 25 * 1024 * 1024; // 25MB
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to read image bytes: {}", e)))?
    {
        if bytes.len() + chunk.len() > max_body {
            return Err(ShioriError::Other(
                "Image too large (exceeds 25MB limit)".to_string(),
            ));
        }
        bytes.extend_from_slice(&chunk);
    }

    Ok(bytes)
}

// ─── ToonGod Cloudflare bypass config ─────────────────────────────────────────

use crate::sources::toongod::{ToonGodConfig, ToonGodSource};

#[tauri::command]
pub async fn toongod_get_config(app_handle: tauri::AppHandle) -> Result<ToonGodConfig> {
    let store = app_handle
        .store("sources.json")
        .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

    let cf_clearance = store
        .get("toongod.cf_clearance")
        .and_then(|v| v.as_str().map(ToString::to_string))
        .filter(|s| !s.is_empty());

    let flaresolverr_url = store
        .get("toongod.flaresolverr_url")
        .and_then(|v| v.as_str().map(ToString::to_string))
        .filter(|s| !s.is_empty());

    Ok(ToonGodConfig {
        cf_clearance,
        flaresolverr_url,
    })
}

#[tauri::command]
pub async fn toongod_set_config(
    app_handle: tauri::AppHandle,
    state: State<'_, crate::AppState>,
    config: ToonGodConfig,
) -> Result<()> {
    // Persist to store
    let store = app_handle
        .store("sources.json")
        .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

    match config.cf_clearance.as_deref() {
        Some(v) if !v.trim().is_empty() => {
            store.set("toongod.cf_clearance", serde_json::json!(v.trim()))
        }
        _ => {
            let _ = store.delete("toongod.cf_clearance");
        }
    }

    match config.flaresolverr_url.as_deref() {
        Some(v) if !v.trim().is_empty() => {
            store.set("toongod.flaresolverr_url", serde_json::json!(v.trim()))
        }
        _ => {
            let _ = store.delete("toongod.flaresolverr_url");
        }
    }

    store
        .save()
        .map_err(|e| ShioriError::Other(format!("Failed to save ToonGod config: {}", e)))?;

    // Apply to live source instance
    let registry = state.plugin_registry.read().await;
    if let Some(source_arc) = registry.get("toongod") {
        if let Some(tg) = source_arc.as_any().downcast_ref::<ToonGodSource>() {
            tg.set_config(config).await;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn search_manga_sources(
    state: tauri::State<'_, crate::AppState>,
    query: String,
) -> Result<Vec<crate::sources::SearchResult>> {
    let registry = state.plugin_registry.read().await;

    let mut tasks = Vec::new();

    for source in registry.get_all() {
        let meta = source.meta();
        if meta.supports_download
            && meta.supports_search
            && registry.is_enabled(&meta.id)
        {
            let source_clone = source.clone();
            let query_clone = query.clone();
            tasks.push(tokio::spawn(async move {
                source_clone.search_with_meta(&query_clone, 1, 200).await
            }));
        }
    }

    let results = futures::future::join_all(tasks).await;
    let mut all_results = Vec::new();

    for res in results {
        if let Ok(Ok(mut r)) = res {
            all_results.append(&mut r.items);
        }
    }

    Ok(all_results)
}

#[derive(Clone, serde::Serialize)]
pub struct MangaDownloadProgress {
    pub chapter_id: String,
    pub chapter_title: String,
    pub pages_downloaded: usize,
    pub total_pages: usize,
}

/// Per-source Referer header, kept in lockstep with the shiori-proxy referer
/// map in lib.rs — the backend downloader must authenticate against the same
/// hotlink-protected image hosts as the UI's image proxy.
fn download_referer_for(source_id: &str) -> Option<&'static str> {
    match source_id {
        "toongod" => Some("https://www.toongod.org/"),
        "toonily" => Some("https://toonily.com/"),
        "toontop" => Some("https://toontop.io/"),
        "manhwaread" => Some("https://manhwaread.com/"),
        "mangadex" => Some("https://mangadex.org/"),
        "weebrook" => Some("https://weebrook.com/"),
        "manhwahub" => Some("https://manhwahub.net/"),
        "mangafire" => Some("https://mangafire.to/"),
        "libgen" => Some("https://libgen.li/"),
        _ => None,
    }
}

#[tauri::command]
pub async fn download_manga_chapter_as_cbz(
    app_handle: tauri::AppHandle,
    state: State<'_, crate::AppState>,
    source_id: String,
    manga_title: String,
    chapter_id: String,
    chapter_title: String,
) -> Result<String> {
    let registry = state.plugin_registry.read().await;
    let source = ensure_enabled(&registry, &source_id)?;

    let pages = source.get_pages(&chapter_id).await?;

    let _download_guard =
        crate::ActiveDownloads::increment(app_handle.state::<crate::ActiveDownloads>());

    let store = app_handle
        .store("preferences.json")
        .map_err(|e| ShioriError::Other(e.to_string()))?;
    let downloads_dir = if let Some(path_val) = store.get("defaultImportPath") {
        if let Some(path_str) = path_val.as_str() {
            if !path_str.is_empty() && !path_str.starts_with("content://") {
                std::path::PathBuf::from(path_str).join("Online Manga")
            } else {
                app_handle
                    .path()
                    .download_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."))
                    .join("Shiori Downloads")
            }
        } else {
            app_handle
                .path()
                .download_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("Shiori Downloads")
        }
    } else {
        app_handle
            .path()
            .download_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .join("Shiori Downloads")
    };

    tokio::fs::create_dir_all(&downloads_dir).await?;

    // Sanitize filename
    let safe_manga =
        manga_title.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-', "_");
    let safe_chap =
        chapter_title.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-', "_");
    let filename = format!("{} - {}.cbz", safe_manga, safe_chap);
    let cbz_path = downloads_dir.join(&filename);

    let file = std::fs::File::create(&cbz_path)?;
    let mut zip = zip::ZipWriter::new(file);
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

    let mut downloaded = 0;
    let total = pages.len();

    let user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
    let referer = download_referer_for(&source_id);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| ShioriError::Other(format!("Failed to build client: {}", e)))?;

    for (idx, page) in pages.iter().enumerate() {
        // SSRF guard — same check as the shiori-proxy handler in lib.rs; never
        // fetch private/loopback hosts even if a source returns a bad URL.
        if !crate::is_safe_url(&page.url) {
            return Err(ShioriError::Other(format!(
                "Refusing to download image from unsafe URL: {}",
                page.url
            )));
        }

        let mut req = client
            .get(&page.url)
            .header("User-Agent", user_agent)
            .header(
                "Accept",
                "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            )
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("Sec-Fetch-Dest", "image")
            .header("Sec-Fetch-Mode", "no-cors")
            .header("Sec-Fetch-Site", "cross-site");
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

        let bytes_vec = bytes.to_vec();

        let ext = crate::conversion::utils::detect_image_format(&bytes_vec)
            .map(|(_, ext)| ext)
            .unwrap_or("jpg");

        let file_name = format!("{:03}.{}", idx + 1, ext);
        let opts = options.clone();

        // Use spawn_blocking for zip writing since it's synchronous IO
        let mut zip_clone = zip;
        zip = tokio::task::spawn_blocking(move || -> Result<zip::ZipWriter<std::fs::File>> {
            zip_clone
                .start_file(file_name, opts)
                .map_err(|e| ShioriError::Other(format!("Zip error: {}", e)))?;
            zip_clone
                .write_all(&bytes_vec)
                .map_err(|e| ShioriError::Other(format!("Write error: {}", e)))?;
            Ok(zip_clone)
        })
        .await
        .map_err(|e| ShioriError::Other(format!("Task error: {}", e)))??;

        downloaded += 1;
        let _ = app_handle.emit(
            "online-manga-download-progress",
            MangaDownloadProgress {
                chapter_id: chapter_id.clone(),
                chapter_title: chapter_title.clone(),
                pages_downloaded: downloaded,
                total_pages: total,
            },
        );

        // Small delay to prevent rate-limiting and connection exhaustion
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }

    tokio::task::spawn_blocking(move || -> Result<()> {
        zip.finish()
            .map_err(|e| ShioriError::Other(format!("Failed to finish zip: {}", e)))?;
        Ok(())
    })
    .await
    .map_err(|e| ShioriError::Other(format!("Task error: {}", e)))??;
    Ok(cbz_path.to_string_lossy().to_string())
}

// ─── Anna's Archive downloads & config ────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOptionDto {
    pub url: String,
    pub download_type: String,
    pub label: Option<String>,
}

/// True when a torrent URL points at an Anna collection/shard bucket rather
/// than a single book: managed datasets, zlib/pilimi bulk torrents, and
/// external libgen shard torrents (f_/nf_/c_/s_ buckets).
pub fn is_anna_dataset_torrent(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();

    let managed_dataset = lower.contains("/managed_by_aa/")
        || lower.contains("/zlib/")
        || lower.contains("pilimi-zlib")
        || lower.contains("annas_archive_data__");

    // Anna external libgen shard torrents (f_*.torrent / nf_*.torrent /
    // c_*.torrent / s_*.torrent) are collection buckets, not single-book torrents.
    let libgen_shard = lower.contains("/dyn/small_file/torrents/external/libgen_")
        && (lower.contains("/f_")
            || lower.contains("/nf_")
            || lower.contains("/c_")
            || lower.contains("/s_"));

    managed_dataset || libgen_shard
}

fn anna_source_from_registry(
    registry: &crate::sources::registry::SourceRegistry,
) -> Result<std::sync::Arc<dyn crate::sources::Source>> {
    registry
        .get("annas-archive")
        .ok_or_else(|| ShioriError::Validation("Unknown source: annas-archive".to_string()))
}

#[tauri::command]
pub async fn annas_archive_get_torrent_links(
    state: State<'_, crate::AppState>,
    content_id: String,
) -> Result<Vec<DownloadOptionDto>> {
    let registry = state.plugin_registry.read().await;
    let source = anna_source_from_registry(&registry)?;

    let source = source
        .as_any()
        .downcast_ref::<AnnasArchiveSource>()
        .ok_or_else(|| ShioriError::Other("Anna source type mismatch".to_string()))?;

    let options = source.get_download_options(&content_id).await?;

    let mut filtered = options;
    filtered.sort_by_key(|option| match option.download_type {
        DownloadType::Magnet => 0u8,
        DownloadType::Torrent => 1u8,
        DownloadType::Direct => 2u8,
        DownloadType::External => 3u8,
    });

    if filtered.is_empty() {
        return Err(ShioriError::Other(
            "No download links found for this book on Anna's Archive".to_string(),
        ));
    }

    Ok(filtered
        .into_iter()
        .map(|option| DownloadOptionDto {
            url: option.url,
            download_type: option.download_type.as_str().to_string(),
            label: option.label,
        })
        .collect())
}

#[tauri::command]
pub async fn annas_archive_send_to_torbox(
    app_handle: tauri::AppHandle,
    state: State<'_, crate::AppState>,
    torbox_state: State<'_, crate::commands::torbox::TorboxState>,
    content_id: String,
    filename_hint: Option<String>,
) -> Result<String> {
    let registry = state.plugin_registry.read().await;
    let source = anna_source_from_registry(&registry)?;

    let source = source
        .as_any()
        .downcast_ref::<AnnasArchiveSource>()
        .ok_or_else(|| ShioriError::Other("Anna source type mismatch".to_string()))?;

    let options = source.get_download_options(&content_id).await?;

    let has_any_torrentish = options.iter().any(|option| {
        matches!(option.download_type, DownloadType::Magnet | DownloadType::Torrent)
    });

    let mut candidate_urls = options
        .iter()
        .filter(|option| match option.download_type {
            DownloadType::Magnet => true,
            DownloadType::Torrent => !is_anna_dataset_torrent(&option.url),
            _ => false,
        })
        .map(|option| option.url.clone())
        .collect::<Vec<_>>();

    candidate_urls.sort_by_key(|url| {
        if url.to_ascii_lowercase().starts_with("magnet:") {
            0u8
        } else {
            1u8
        }
    });

    let mut seen = std::collections::HashSet::new();
    candidate_urls.retain(|url| seen.insert(url.clone()));

    if candidate_urls.is_empty() {
        if has_any_torrentish {
            // No per-book magnet/torrent — fall back to the dataset-shard
            // extraction flow: add the shard torrent, select the file matching
            // the book's md5, download and import it.
            let dataset_urls = options
                .iter()
                .filter(|option| {
                    matches!(option.download_type, DownloadType::Torrent)
                        && is_anna_dataset_torrent(&option.url)
                })
                .map(|option| option.url.clone())
                .collect::<Vec<_>>();

            if !dataset_urls.is_empty() {
                let md5 = content_id.strip_prefix("anna-").unwrap_or(&content_id);
                return crate::commands::torbox::dataset_shard_extract_and_import(
                    &app_handle,
                    &torbox_state.service,
                    &state,
                    dataset_urls,
                    md5,
                    filename_hint,
                )
                .await;
            }

            return Err(ShioriError::Other(
                "Only Anna collection/shard torrents were found for this result (no per-book magnet/torrent). Use View Details for manual download."
                    .to_string(),
            ));
        }
        return Err(ShioriError::Other(
            "No magnet or torrent links found for this book on Anna's Archive".to_string(),
        ));
    }

    let mut attempt_errors = Vec::new();

    for candidate_url in candidate_urls {
        match crate::services::debrid::resolve_and_import(
            &app_handle,
            &torbox_state.service,
            &state,
            crate::services::debrid::DebridResolveRequest {
                provider: "torbox".to_string(),
                candidate_links: vec![candidate_url.clone()],
                filename_hint: filename_hint.clone(),
                // Dead magnets shouldn't stall the candidate loop for 15min;
                // 5min per attempt is enough to fail fast and move on.
                max_wait_secs: Some(300),
            },
        )
        .await
        {
            Ok(response) => return Ok(response.imported_path),
            Err(err) => {
                let mut short_url = candidate_url.clone();
                if short_url.len() > 110 {
                    short_url.truncate(110);
                    short_url.push_str("...");
                }
                attempt_errors.push(format!("{} => {}", short_url, err));
            }
        }
    }

    Err(ShioriError::Other(format!(
        "All Anna candidates failed in Torbox. {}",
        attempt_errors.join(" | ")
    )))
}

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnasArchiveBookSources {
    pub has_direct: bool,
    pub has_magnet: bool,
    pub has_libgen_shard: bool,
    pub has_zlib_shard: bool,
}

#[tauri::command]
pub async fn annas_archive_book_sources(
    state: State<'_, crate::AppState>,
    content_id: String,
) -> Result<AnnasArchiveBookSources> {
    let registry = state.plugin_registry.read().await;
    let source = anna_source_from_registry(&registry)?;

    let source = source
        .as_any()
        .downcast_ref::<AnnasArchiveSource>()
        .ok_or_else(|| ShioriError::Other("Anna source type mismatch".to_string()))?;

    let options = source.get_download_options(&content_id).await?;

    let mut out = AnnasArchiveBookSources::default();
    for option in options {
        match option.download_type {
            DownloadType::Direct => out.has_direct = true,
            DownloadType::Magnet => out.has_magnet = true,
            DownloadType::Torrent => {
                if is_anna_dataset_torrent(&option.url) {
                    if option.url.contains("managed_by_aa") {
                        out.has_zlib_shard = true;
                    } else {
                        out.has_libgen_shard = true;
                    }
                }
            }
            DownloadType::External => {}
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn anna_archive_get_config(app_handle: tauri::AppHandle) -> Result<AnnasArchiveConfig> {
    let store = app_handle
        .store("sources.json")
        .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

    let read = |key: &str| -> Option<String> {
        store
            .get(key)
            .and_then(|v| v.as_str().map(ToString::to_string))
            .filter(|s| !s.is_empty())
    };

    Ok(AnnasArchiveConfig {
        base_url: read("annas-archive.baseUrl"),
        auth_key: read("annas-archive.authKey"),
        membership_key: read("annas-archive.membershipKey"),
        auth_cookie: read("annas-archive.authCookie"),
        api_key: read("annas-archive.apiKey"),
    })
}

#[tauri::command]
pub async fn anna_archive_set_config(
    app_handle: tauri::AppHandle,
    state: State<'_, crate::AppState>,
    config: AnnasArchiveConfig,
) -> Result<()> {
    // Persist to store
    let store = app_handle
        .store("sources.json")
        .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

    let write_key = |key: &str, value: &Option<String>| match value.as_deref() {
        Some(v) if !v.trim().is_empty() => {
            store.set(key, serde_json::json!(v.trim()));
        }
        _ => {
            let _ = store.delete(key);
        }
    };

    write_key("annas-archive.baseUrl", &config.base_url);
    write_key("annas-archive.authKey", &config.auth_key);
    write_key("annas-archive.membershipKey", &config.membership_key);
    write_key("annas-archive.authCookie", &config.auth_cookie);
    write_key("annas-archive.apiKey", &config.api_key);

    store
        .save()
        .map_err(|e| ShioriError::Other(format!("Failed to save source config: {}", e)))?;

    // Apply to live source instance
    let registry = state.plugin_registry.read().await;
    if let Some(source_arc) = registry.get("annas-archive") {
        if let Some(source) = source_arc.as_any().downcast_ref::<AnnasArchiveSource>() {
            source.set_config(config).await;
        }
    }

    Ok(())
}

fn parse_content_disposition_filename(value: &str) -> Option<String> {
    // Prefer the RFC 5987 form: filename*=UTF-8''<url-encoded>
    for part in value.split(';') {
        let part = part.trim();
        if let Some(rest) = part.strip_prefix("filename*=") {
            let rest = rest.trim().trim_matches('"');
            let encoded = rest.rsplit("''").next().unwrap_or(rest);
            let decoded = urlencoding::decode(encoded).ok()?.to_string();
            if !decoded.is_empty() {
                return Some(decoded);
            }
        }
    }
    // Fallback: plain filename="..."
    for part in value.split(';') {
        let part = part.trim();
        if let Some(rest) = part.strip_prefix("filename=") {
            let rest = rest.trim().trim_matches('"').trim();
            if !rest.is_empty() {
                return Some(rest.to_string());
            }
        }
    }
    None
}

fn download_blocked_message(cookie_configured: bool) -> String {
    if cookie_configured {
        "Download blocked (received HTML instead of ebook). Your Anna's Archive session cookie was rejected or expired — refresh it in your browser (log out and back in at annas-archive.org) and re-save it in Settings → Online Sources → Anna's Archive. Or use 'View Details' to download manually, or set up Torbox for torrent downloads.".to_string()
    } else {
        "Download blocked (received HTML instead of ebook). Anna's Archive requires a logged-in session for downloads. Add your session cookie in Settings → Online Sources → Anna's Archive → Configure (paste it from your browser devtools after logging in at annas-archive.org). Or use 'View Details' to download manually, or set up Torbox for torrent downloads.".to_string()
    }
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_control() || c == '/' || c == '\\' {
                '-'
            } else {
                c
            }
        })
        .collect::<String>()
        .trim()
        .trim_end_matches(['.', ' '])
        .to_string()
}

#[tauri::command]
pub async fn annas_archive_download(
    app_handle: tauri::AppHandle,
    state: State<'_, crate::AppState>,
    content_id: String,
    title_hint: Option<String>,
) -> Result<String> {
    use std::time::Duration;

    let registry = state.plugin_registry.read().await;
    let source = anna_source_from_registry(&registry)?;

    let source = source
        .as_any()
        .downcast_ref::<AnnasArchiveSource>()
        .ok_or_else(|| ShioriError::Other("Anna source type mismatch".to_string()))?;

    source.load_config_from_store(&app_handle).await?;
    let anna_config = source.get_config().await;
    let cookie_configured = anna_config
        .auth_cookie
        .as_deref()
        .map(str::trim)
        .is_some_and(|c| !c.is_empty());

    // Get download options from the detail page
    let options = source.get_download_options(&content_id).await?;

    if options.is_empty() {
        return Err(ShioriError::Other(
            "No download links found. Use 'View Details' to download manually in your browser."
                .to_string(),
        ));
    }

    // Prefer direct > external; torrents/magnets are handled by Torbox instead.
    let direct_option = options
        .iter()
        .find(|o| matches!(o.download_type, DownloadType::Direct));
    let external_option = options
        .iter()
        .find(|o| matches!(o.download_type, DownloadType::External));
    let has_magnet_or_torrent = options.iter().any(|o| {
        matches!(o.download_type, DownloadType::Magnet | DownloadType::Torrent)
    });

    let download_url = if let Some(opt) = direct_option {
        opt.url.clone()
    } else if let Some(opt) = external_option {
        opt.url.clone()
    } else if has_magnet_or_torrent {
        return Err(ShioriError::Other(
            "Only torrent downloads available. Set up Torbox in Settings → Online Sources, then use the 'Torbox' button. Or use 'View Details' to download manually."
                .to_string(),
        ));
    } else {
        return Err(ShioriError::Other(
            "No direct download available. Use 'View Details' to download manually in your browser."
                .to_string(),
        ));
    };

    // Download the file
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| ShioriError::Other(format!("Failed to create download client: {}", e)))?;

    let mut request = client.get(&download_url);
    if let Some(api_key) = anna_config.api_key {
        request = request
            .header("x-rapidapi-host", "annas-archive-api.p.rapidapi.com")
            .header("x-rapidapi-key", api_key);
    }
    if let Some(cookie) = anna_config
        .auth_cookie
        .as_deref()
        .map(str::trim)
        .filter(|c| !c.is_empty())
    {
        request = request.header(reqwest::header::COOKIE, cookie);
    }

    let response = request
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
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if content_type.contains("text/html") {
        return Err(ShioriError::Other(download_blocked_message(cookie_configured)));
    }

    // Filename: Content-Disposition (handling the filename*= UTF-8'' form) →
    // URL last segment → sanitized title hint.
    let filename = response
        .headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .and_then(parse_content_disposition_filename)
        .or_else(|| {
            download_url.split('/').next_back().filter(|s| s.contains('.')).and_then(|s| {
                urlencoding::decode(s)
                    .map(|d| d.to_string())
                    .ok()
                    .filter(|d| !d.is_empty())
            })
        })
        .unwrap_or_else(|| {
            let title = title_hint.clone().unwrap_or_else(|| content_id.clone());
            let safe_title: String = title
                .chars()
                .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_')
                .collect();
            format!("{}.epub", safe_title.trim())
        });
    let filename = sanitize_filename(&filename);

    let bytes = response
        .bytes()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to read download: {}", e)))?;

    // Validate file content - check magic bytes
    if bytes.len() < 4 {
        return Err(ShioriError::Other(
            "Downloaded file is too small to be valid. Use 'View Details' to download manually."
                .to_string(),
        ));
    }

    // Check for HTML content even if Content-Type was wrong
    let starts_with_html = bytes.starts_with(b"<!DOCTYPE")
        || bytes.starts_with(b"<!doctype")
        || bytes.starts_with(b"<html")
        || bytes.starts_with(b"<HTML");

    if starts_with_html {
        return Err(ShioriError::Other(download_blocked_message(cookie_configured)));
    }

    // Determine actual format from file magic bytes
    let detected_format = if bytes.starts_with(&[0x50, 0x4B, 0x03, 0x04]) {
        // ZIP magic bytes - could be EPUB, CBZ, DOCX, etc.
        if filename.to_lowercase().ends_with(".cbz") {
            "cbz".to_string()
        } else {
            "epub".to_string() // Assume EPUB for ZIP files from book sources
        }
    } else if bytes.starts_with(b"%PDF") {
        "pdf".to_string()
    } else if bytes.len() > 68 && &bytes[60..68] == b"BOOKMOBI" {
        "mobi".to_string()
    } else {
        // Use extension from filename
        std::path::Path::new(&filename)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_else(|| "unknown".to_string())
    };

    // Ensure filename has the correct extension
    let final_filename = if detected_format != "unknown"
        && !filename.to_lowercase().ends_with(&format!(".{}", detected_format))
    {
        let stem = std::path::Path::new(&filename)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| filename.trim_end_matches('.').to_string());
        format!("{}.{}", stem, detected_format)
    } else {
        filename
    };

    // Save into <defaultImportPath>/Online Books/ with app_data_dir fallback
    let prefs = crate::commands::preferences::get_user_preferences(state.clone()).await?;
    let downloads_dir = if !prefs.default_import_path.is_empty()
        && !prefs.default_import_path.starts_with("content://")
    {
        std::path::PathBuf::from(&prefs.default_import_path).join("Online Books")
    } else {
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| {
                ShioriError::Other(format!("Failed to get app dir: {}", e))
            })?
            .join("downloads")
    };
    std::fs::create_dir_all(&downloads_dir)?;
    let dest_path = downloads_dir.join(&final_filename);
    std::fs::write(&dest_path, &bytes)?;

    Ok(dest_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sources::registry::SourceRegistry;

    struct DummySource;

    #[async_trait::async_trait]
    impl crate::sources::Source for DummySource {
        fn as_any(&self) -> &dyn std::any::Any {
            self
        }
        fn meta(&self) -> SourceMeta {
            SourceMeta {
                id: "dummy".into(),
                name: "Dummy".into(),
                base_url: "https://dummy.test".into(),
                version: "1.0.0".into(),
                content_type: ContentType::Manga,
                supports_search: true,
                supports_download: false,
                requires_api_key: false,
                nsfw: false,
            }
        }
        async fn search(&self, _q: &str, _p: u32) -> Result<Vec<SearchResult>> {
            Ok(vec![])
        }
        async fn get_chapters(&self, _id: &str) -> Result<Vec<Chapter>> {
            Ok(vec![])
        }
        async fn get_pages(&self, _id: &str) -> Result<Vec<Page>> {
            Ok(vec![])
        }
    }

    fn registry_with_dummy() -> SourceRegistry {
        let mut r = SourceRegistry::new();
        r.register(std::sync::Arc::new(DummySource));
        r
    }

    #[test]
    fn ensure_enabled_unknown_id_errors() {
        let r = registry_with_dummy();
        let err = match ensure_enabled(&r, "nope") {
            Err(e) => e,
            Ok(_) => panic!("expected error for unknown id"),
        };
        match err {
            ShioriError::Validation(_) => {}
            other => panic!("expected Validation, got {other:?}"),
        }
    }

    #[test]
    fn ensure_enabled_disabled_source_errors_with_source_disabled() {
        let mut r = registry_with_dummy();
        r.set_enabled("dummy", false).unwrap();
        let err = match ensure_enabled(&r, "dummy") {
            Err(e) => e,
            Ok(_) => panic!("expected error for disabled source"),
        };
        match err {
            ShioriError::Source(SourceError::SourceDisabled) => {}
            other => panic!("expected Source(SourceDisabled), got {other:?}"),
        }
    }

    #[test]
    fn ensure_enabled_enabled_source_returns_arc() {
        let r = registry_with_dummy();
        let source = ensure_enabled(&r, "dummy").expect("enabled source resolves");
        assert_eq!(source.meta().id, "dummy");
    }

    #[test]
    fn source_error_serializes_kind_source_and_source_kind() {
        let e: ShioriError = SourceError::CloudflareChallenge.into();
        let json = serde_json::to_string(&e).unwrap();
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["kind"], "source");
        assert_eq!(v["sourceKind"], "cloudflareChallenge");
        assert!(
            v["message"].as_str().unwrap().contains("Cloudflare"),
            "frontend matches on the word Cloudflare"
        );
    }
}
