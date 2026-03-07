use crate::error::Result;
use crate::services::manga_service::{MangaMetadata, MangaService};
use crate::utils::validate;
use std::sync::Arc;
use tauri::State;

/// Global manga service state
pub struct MangaState {
    pub service: Arc<MangaService>,
}

impl MangaState {
    pub fn new() -> Self {
        Self {
            service: Arc::new(MangaService::new()),
        }
    }
}

// ==================== Manga Reader Commands ====================

#[tauri::command]
pub fn open_manga(
    book_id: i64,
    path: String,
    state: State<MangaState>,
) -> Result<MangaMetadata> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_safe_path(&path, "path")?;
    state.service.open(book_id, &path)
}

#[tauri::command]
pub async fn get_manga_page(
    book_id: i64,
    page_index: usize,
    max_dimension: u32,
    state: State<'_, MangaState>,
) -> Result<tauri::ipc::Response> {
    validate::require_positive_id(book_id, "book_id")?;
    let bytes = state.service.get_page(book_id, page_index, max_dimension).await?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn preload_manga_pages(
    book_id: i64,
    page_indices: Vec<usize>,
    max_dimension: u32,
    state: State<'_, MangaState>,
) -> Result<()> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty_vec(&page_indices, "page_indices")?;
    state.service.preload_pages(book_id, &page_indices, max_dimension).await
}

#[tauri::command]
pub fn get_manga_page_dimensions(
    book_id: i64,
    page_indices: Vec<usize>,
    state: State<MangaState>,
) -> Result<Vec<(u32, u32)>> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty_vec(&page_indices, "page_indices")?;
    state.service.get_page_dimensions(book_id, &page_indices)
}

#[tauri::command]
pub fn close_manga(
    book_id: i64,
    state: State<MangaState>,
) -> Result<()> {
    validate::require_positive_id(book_id, "book_id")?;
    state.service.close(book_id);
    Ok(())
}

#[tauri::command]
pub async fn get_manga_page_path(
    book_id: i64,
    page_index: usize,
    max_dimension: u32,
    state: State<'_, MangaState>,
) -> Result<String> {
    validate::require_positive_id(book_id, "book_id")?;
    let bytes = state.service.get_page(book_id, page_index, max_dimension).await?;
    
    let mut dir = std::env::temp_dir();
    dir.push("shiori");
    dir.push("manga-pages");
    std::fs::create_dir_all(&dir).map_err(|e| crate::error::ShioriError::Io(e))?;
    
    let filename = format!("manga-{}-{}-{}.img", book_id, page_index, max_dimension);
    let final_path = dir.join(&filename);
    
    // If file already exists with correct size, skip writing
    if final_path.exists() {
        if let Ok(meta) = std::fs::metadata(&final_path) {
            if meta.len() == bytes.len() as u64 {
                return Ok(final_path.to_string_lossy().into_owned());
            }
        }
    }
    
    // Write atomically
    let tmp_path = dir.join(format!("{}.tmp", filename));
    std::fs::write(&tmp_path, &bytes).map_err(|e| crate::error::ShioriError::Io(e))?;
    std::fs::rename(&tmp_path, &final_path).map_err(|e| crate::error::ShioriError::Io(e))?;
    
    Ok(final_path.to_string_lossy().into_owned())
}
