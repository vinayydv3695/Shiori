use crate::error::Result;
use crate::services::cache::CacheStats;
use crate::services::renderer::{BookMetadata, Chapter, SearchResult, TocEntry};
use crate::services::rendering_service::RenderingService;
use crate::utils::validate;
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

    println!("\n=== OPEN_BOOK_RENDERER ===");
    println!("book_id: {}", book_id);
    println!("path: {}", path);
    println!("format: {}", format);

    let service = state.service.clone();
    let result = tokio::task::spawn_blocking(move || {
        service.open_book(book_id, &path, &format)
    })
    .await
    .unwrap_or_else(|e| Err(crate::error::ShioriError::Other(format!("Task panicked: {}", e))));

    match &result {
        Ok(metadata) => {
            println!("SUCCESS");
            println!("title: {}", metadata.title);
            println!("chapters: {}", metadata.total_chapters);
        }
        Err(e) => {
            println!("ERROR: {}", e);
        }
    }
    println!("=========================\n");

    result
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
pub async fn get_book_toc(book_id: i64, state: State<'_, RenderingState>) -> Result<Vec<TocEntry>> {
    validate::require_positive_id(book_id, "book_id")?;
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.get_toc(book_id))
        .await
        .unwrap_or_else(|e| Err(crate::error::ShioriError::Other(format!("Task panicked: {}", e))))
}

#[tauri::command]
pub async fn get_book_chapter(
    book_id: i64,
    chapter_index: usize,
    state: State<'_, RenderingState>,
) -> Result<Chapter> {
    validate::require_positive_id(book_id, "book_id")?;
    println!(
        "[get_book_chapter] book_id: {}, chapter_index: {}",
        book_id, chapter_index
    );
    let service = state.service.clone();
    let result = tokio::task::spawn_blocking(move || {
        service.get_chapter(book_id, chapter_index)
    })
    .await
    .unwrap_or_else(|e| Err(crate::error::ShioriError::Other(format!("Task panicked: {}", e))));

    match &result {
        Ok(chapter) => println!("[get_book_chapter] Got chapter: {}", chapter.title),
        Err(e) => println!("[get_book_chapter] Error: {}", e),
    }

    result
}

#[tauri::command]
pub async fn get_book_chapter_count(book_id: i64, state: State<'_, RenderingState>) -> Result<usize> {
    validate::require_positive_id(book_id, "book_id")?;
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.get_chapter_count(book_id))
        .await
        .unwrap_or_else(|e| Err(crate::error::ShioriError::Other(format!("Task panicked: {}", e))))
}

#[tauri::command]
pub async fn search_in_book(
    book_id: i64,
    query: String,
    state: State<'_, RenderingState>,
) -> Result<Vec<SearchResult>> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty(&query, "query")?;
    validate::require_max_length(&query, 500, "query")?;
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.search_book(book_id, &query))
        .await
        .unwrap_or_else(|e| Err(crate::error::ShioriError::Other(format!("Task panicked: {}", e))))
}

#[tauri::command]
pub async fn get_epub_resource(
    book_id: i64,
    resource_path: String,
    state: State<'_, RenderingState>,
) -> Result<Vec<u8>> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty(&resource_path, "resource_path")?;
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.get_epub_resource(book_id, &resource_path))
        .await
        .unwrap_or_else(|e| Err(crate::error::ShioriError::Other(format!("Task panicked: {}", e))))
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
    state: State<'_, RenderingState>,
) -> Result<Vec<u8>> {
    validate::require_positive_id(book_id, "book_id")?;
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.render_page(book_id, page_index, scale))
        .await
        .unwrap_or_else(|e| Err(crate::error::ShioriError::Other(format!("Task panicked: {}", e))))
}

#[tauri::command]
pub async fn get_pdf_page_dimensions(
    book_id: i64,
    page_index: usize,
    state: State<'_, RenderingState>,
) -> Result<(f32, f32)> {
    validate::require_positive_id(book_id, "book_id")?;
    let service = state.service.clone();
    tokio::task::spawn_blocking(move || service.get_page_dimensions(book_id, page_index))
        .await
        .unwrap_or_else(|e| Err(crate::error::ShioriError::Other(format!("Task panicked: {}", e))))
}
