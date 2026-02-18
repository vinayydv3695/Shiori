use crate::error::ShioriResult;
use crate::services::cache::CacheStats;
use crate::services::renderer::{BookMetadata, Chapter, SearchResult, TocEntry};
use crate::services::rendering_service::RenderingService;
use std::sync::Mutex;
use tauri::State;

/// Global rendering service state
pub struct RenderingState {
    pub service: Mutex<RenderingService>,
}

impl RenderingState {
    pub fn new(cache_size_mb: usize) -> Self {
        Self {
            service: Mutex::new(RenderingService::new(cache_size_mb)),
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
    let service = state.service.lock().unwrap();
    service.open_book(book_id, &path, &format)
}

#[tauri::command]
pub fn close_book_renderer(book_id: i64, state: State<RenderingState>) -> ShioriResult<()> {
    let service = state.service.lock().unwrap();
    service.close_book(book_id);
    Ok(())
}

#[tauri::command]
pub fn get_book_toc(book_id: i64, state: State<RenderingState>) -> ShioriResult<Vec<TocEntry>> {
    let service = state.service.lock().unwrap();
    service.get_toc(book_id)
}

#[tauri::command]
pub fn get_book_chapter(
    book_id: i64,
    chapter_index: usize,
    state: State<RenderingState>,
) -> ShioriResult<Chapter> {
    let service = state.service.lock().unwrap();
    service.get_chapter(book_id, chapter_index)
}

#[tauri::command]
pub fn get_book_chapter_count(book_id: i64, state: State<RenderingState>) -> ShioriResult<usize> {
    let service = state.service.lock().unwrap();
    service.get_chapter_count(book_id)
}

#[tauri::command]
pub fn search_in_book(
    book_id: i64,
    query: String,
    state: State<RenderingState>,
) -> ShioriResult<Vec<SearchResult>> {
    let service = state.service.lock().unwrap();
    service.search_book(book_id, &query)
}

// ==================== Cache Management Commands ====================

#[tauri::command]
pub fn get_renderer_cache_stats(state: State<RenderingState>) -> ShioriResult<CacheStats> {
    let service = state.service.lock().unwrap();
    Ok(service.get_cache_stats())
}

#[tauri::command]
pub fn clear_renderer_cache(state: State<RenderingState>) -> ShioriResult<()> {
    let service = state.service.lock().unwrap();
    service.clear_all_caches();
    Ok(())
}
