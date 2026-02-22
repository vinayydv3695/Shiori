use crate::error::ShioriResult;
use crate::services::cache::CacheStats;
use crate::services::renderer::{BookMetadata, Chapter, SearchResult, TocEntry};
use crate::services::rendering_service::RenderingService;
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
pub fn open_book_renderer(
    book_id: i64,
    path: String,
    format: String,
    state: State<RenderingState>,
) -> ShioriResult<BookMetadata> {
    println!("\n=== OPEN_BOOK_RENDERER ===");
    println!("book_id: {}", book_id);
    println!("path: {}", path);
    println!("format: {}", format);

    let result = state.service.open_book(book_id, &path, &format);

    match &result {
        Ok(metadata) => {
            println!("✅ SUCCESS");
            println!("title: {}", metadata.title);
            println!("chapters: {}", metadata.total_chapters);
        }
        Err(e) => {
            println!("❌ ERROR: {}", e);
        }
    }
    println!("=========================\n");

    result
}

#[tauri::command]
pub fn close_book_renderer(book_id: i64, state: State<RenderingState>) -> ShioriResult<()> {
    state.service.close_book(book_id);
    Ok(())
}

#[tauri::command]
pub fn get_book_toc(book_id: i64, state: State<RenderingState>) -> ShioriResult<Vec<TocEntry>> {
    state.service.get_toc(book_id)
}

#[tauri::command]
pub fn get_book_chapter(
    book_id: i64,
    chapter_index: usize,
    state: State<RenderingState>,
) -> ShioriResult<Chapter> {
    println!(
        "[get_book_chapter] book_id: {}, chapter_index: {}",
        book_id, chapter_index
    );
    let result = state.service.get_chapter(book_id, chapter_index);

    match &result {
        Ok(chapter) => println!("[get_book_chapter] ✅ Got chapter: {}", chapter.title),
        Err(e) => println!("[get_book_chapter] ❌ Error: {}", e),
    }

    result
}

#[tauri::command]
pub fn get_book_chapter_count(book_id: i64, state: State<RenderingState>) -> ShioriResult<usize> {
    state.service.get_chapter_count(book_id)
}

#[tauri::command]
pub fn search_in_book(
    book_id: i64,
    query: String,
    state: State<RenderingState>,
) -> ShioriResult<Vec<SearchResult>> {
    state.service.search_book(book_id, &query)
}

#[tauri::command]
pub fn get_epub_resource(
    book_id: i64,
    resource_path: String,
    state: State<RenderingState>,
) -> ShioriResult<Vec<u8>> {
    state.service.get_epub_resource(book_id, &resource_path)
}

// ==================== Cache Management Commands ====================

#[tauri::command]
pub fn get_renderer_cache_stats(state: State<RenderingState>) -> ShioriResult<CacheStats> {
    Ok(state.service.get_cache_stats())
}

#[tauri::command]
pub fn clear_renderer_cache(state: State<RenderingState>) -> ShioriResult<()> {
    state.service.clear_all_caches();
    Ok(())
}

#[tauri::command]
pub fn render_pdf_page(
    book_id: i64,
    page_index: usize,
    scale: f32,
    state: State<RenderingState>,
) -> ShioriResult<Vec<u8>> {
    state.service.render_page(book_id, page_index, scale)
}

#[tauri::command]
pub fn get_pdf_page_dimensions(
    book_id: i64,
    page_index: usize,
    state: State<RenderingState>,
) -> ShioriResult<(f32, f32)> {
    state.service.get_page_dimensions(book_id, page_index)
}
