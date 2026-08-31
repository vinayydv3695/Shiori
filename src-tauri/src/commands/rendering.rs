use crate::error::Result;
use crate::services::cache::CacheStats;
use crate::services::renderer::{BookMetadata, Chapter, SearchResult, TocEntry};
use crate::services::rendering_service::RenderingService;
use crate::utils::validate;
use crate::AppState;
use std::sync::Arc;
use tauri::State;

/// Global rendering service state
/// Note: RenderingService is already thread-safe internally with Arc<Mutex<HashMap>>
/// so we don't need to wrap it in another Mutex
pub struct RenderingState {
    pub service: Arc<RenderingService>,
}

impl RenderingState {
    pub fn new(cache_size_mb: usize) -> Self {
        Self {
            service: Arc::new(RenderingService::new(cache_size_mb)),
        }
    }
}

// ==================== Book Rendering Commands ====================

#[tauri::command]
pub async fn open_book_renderer(
    book_id: i64,
    path: String,
    format: String,
    state: State<'_, RenderingState>,
) -> Result<BookMetadata> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_safe_path(&path, "path")?;
    validate::require_non_empty(&format, "format")?;

    log::debug!(
        "[open_book_renderer] book_id={} path={} format={}",
        book_id,
        path,
        format
    );

    let service = state.service.clone();
    // Async service variant runs the blocking adapter load on the Tokio
    // blocking thread pool (no extra spawn_blocking wrapper here — that
    // would be a nested offload).
    service.open_book_async(book_id, &path, &format).await
}

#[tauri::command]
pub async fn close_book_renderer(book_id: i64, state: State<'_, RenderingState>) -> Result<()> {
    validate::require_positive_id(book_id, "book_id")?;
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || {
        service.close_book(book_id);
    })
    .await
    .unwrap_or(());
    Ok(())
}

#[tauri::command]
pub async fn get_book_toc(
    book_id: i64,
    app_state: State<'_, AppState>,
    state: State<'_, RenderingState>,
) -> Result<Vec<TocEntry>> {
    validate::require_positive_id(book_id, "book_id")?;
    let service = state.service.clone();
    let db = app_state.inner().db.clone();
    tokio::task::spawn_blocking(move || {
        let _ = service.open_if_needed(&db, book_id);
        service.get_toc(book_id)
    })
    .await
    .unwrap_or_else(|e| {
        Err(crate::error::ShioriError::Other(format!(
            "Task panicked: {}",
            e
        )))
    })
}

#[tauri::command]
pub async fn get_book_chapter(
    book_id: i64,
    chapter_index: usize,
    app_state: State<'_, AppState>,
    state: State<'_, RenderingState>,
) -> Result<Chapter> {
    validate::require_positive_id(book_id, "book_id")?;
    log::debug!(
        "[get_book_chapter] book_id={} chapter_index={}",
        book_id,
        chapter_index
    );
    let service = state.service.clone();
    let db = app_state.inner().db.clone();
    tokio::task::spawn_blocking(move || {
        let _ = service.open_if_needed(&db, book_id);
        service.get_chapter(book_id, chapter_index)
    })
    .await
    .unwrap_or_else(|e| {
        Err(crate::error::ShioriError::Other(format!(
            "Task panicked: {}",
            e
        )))
    })
}

#[tauri::command]
pub async fn get_book_chapter_count(
    book_id: i64,
    app_state: State<'_, AppState>,
    state: State<'_, RenderingState>,
) -> Result<usize> {
    validate::require_positive_id(book_id, "book_id")?;
    let service = state.service.clone();
    let db = app_state.inner().db.clone();
    tokio::task::spawn_blocking(move || {
        let _ = service.open_if_needed(&db, book_id);
        service.get_chapter_count(book_id)
    })
    .await
    .unwrap_or_else(|e| {
        Err(crate::error::ShioriError::Other(format!(
            "Task panicked: {}",
            e
        )))
    })
}

#[tauri::command]
pub async fn search_in_book(
    book_id: i64,
    query: String,
    app_state: State<'_, AppState>,
    state: State<'_, RenderingState>,
) -> Result<Vec<SearchResult>> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty(&query, "query")?;
    validate::require_max_length(&query, 500, "query")?;
    let service = state.service.clone();
    let db = app_state.inner().db.clone();
    tokio::task::spawn_blocking(move || {
        let _ = service.open_if_needed(&db, book_id);
        service.search_book(book_id, &query)
    })
    .await
    .unwrap_or_else(|e| {
        Err(crate::error::ShioriError::Other(format!(
            "Task panicked: {}",
            e
        )))
    })
}

#[tauri::command]
pub async fn get_epub_resource(
    book_id: i64,
    resource_path: String,
    app_state: State<'_, AppState>,
    state: State<'_, RenderingState>,
) -> Result<Vec<u8>> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty(&resource_path, "resource_path")?;
    let service = state.service.clone();
    let db = app_state.inner().db.clone();
    tokio::task::spawn_blocking(move || {
        let _ = service.open_if_needed(&db, book_id);
        service.get_epub_resource(book_id, &resource_path)
    })
    .await
    .unwrap_or_else(|e| {
        Err(crate::error::ShioriError::Other(format!(
            "Task panicked: {}",
            e
        )))
    })
}

/// Intrinsic (path, width, height) for EPUB image resources, so the reader can
/// reserve layout space and images don't reflow/jump the scroll when they decode.
#[tauri::command]
pub async fn get_epub_image_sizes(
    book_id: i64,
    paths: Vec<String>,
    app_state: State<'_, AppState>,
    state: State<'_, RenderingState>,
) -> Result<Vec<(String, u32, u32)>> {
    validate::require_positive_id(book_id, "book_id")?;
    if paths.is_empty() {
        return Ok(Vec::new());
    }
    let service = state.service.clone();
    let db = app_state.inner().db.clone();
    tokio::task::spawn_blocking(move || {
        let _ = service.open_if_needed(&db, book_id);
        Ok(service.get_epub_image_sizes(book_id, &paths))
    })
    .await
    .unwrap_or_else(|e| {
        Err(crate::error::ShioriError::Other(format!(
            "Task panicked: {}",
            e
        )))
    })
}

// ==================== Cache Management Commands ====================

#[tauri::command]
pub fn get_renderer_cache_stats(state: State<RenderingState>) -> Result<CacheStats> {
    Ok(state.service.get_cache_stats())
}

#[tauri::command]
pub fn clear_renderer_cache(state: State<RenderingState>) -> Result<()> {
    state.service.clear_all_caches();
    Ok(())
}

#[tauri::command]
pub async fn render_pdf_page(
    book_id: i64,
    page_index: usize,
    scale: f32,
    app_state: State<'_, AppState>,
    state: State<'_, RenderingState>,
) -> Result<Vec<u8>> {
    validate::require_positive_id(book_id, "book_id")?;
    let service = state.service.clone();
    let db = app_state.inner().db.clone();
    // Lazy-open is a sync service call; run it on the blocking pool, then
    // render via the async variant (itself spawn_blocking) — never nested.
    tokio::task::spawn_blocking({
        let service = service.clone();
        move || {
            let _ = service.open_if_needed(&db, book_id);
        }
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(format!("Task panicked: {}", e)))?;

    service.render_page_async(book_id, page_index, scale).await
}

#[tauri::command]
pub async fn get_pdf_page_dimensions(
    book_id: i64,
    page_index: usize,
    app_state: State<'_, AppState>,
    state: State<'_, RenderingState>,
) -> Result<(f32, f32)> {
    validate::require_positive_id(book_id, "book_id")?;
    let service = state.service.clone();
    let db = app_state.inner().db.clone();
    tokio::task::spawn_blocking(move || {
        let _ = service.open_if_needed(&db, book_id);
        service.get_page_dimensions(book_id, page_index)
    })
    .await
    .unwrap_or_else(|e| {
        Err(crate::error::ShioriError::Other(format!(
            "Task panicked: {}",
            e
        )))
    })
}
