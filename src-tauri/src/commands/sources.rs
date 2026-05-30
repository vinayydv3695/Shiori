use std::path::PathBuf;
use std::time::Instant;

use tauri::State;
use tauri_plugin_store::StoreExt;

use crate::error::{Result, ShioriError};
use crate::sources::{
    Chapter, ContentType, Page, SearchResponse, SearchResult, SourceMeta, SourceSearchDiagnostics,
};













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

// ─── ToonGod Cloudflare bypass config ─────────────────────────────────────────

use crate::sources::toongod::{ToonGodConfig, ToonGodSource};

#[tauri::command]
pub async fn toongod_get_config(
    app_handle: tauri::AppHandle,
) -> Result<ToonGodConfig> {
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

    Ok(ToonGodConfig { cf_clearance, flaresolverr_url })
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
        Some(v) if !v.trim().is_empty() => store.set("toongod.cf_clearance", serde_json::json!(v.trim())),
        _ => { let _ = store.delete("toongod.cf_clearance"); }
    }

    match config.flaresolverr_url.as_deref() {
        Some(v) if !v.trim().is_empty() => store.set("toongod.flaresolverr_url", serde_json::json!(v.trim())),
        _ => { let _ = store.delete("toongod.flaresolverr_url"); }
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
    
    let mut all_results = Vec::new();
    
    for source in registry.get_all() {
        let meta = source.meta();
        if meta.supports_download && meta.supports_search {
            if let Ok(mut results) = source.search_with_meta(&query, 1, 75).await {
                all_results.append(&mut results.items);
            }
        }
    }
    
    Ok(all_results)
}
