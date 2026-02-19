use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::services::cover_service::CoverService;
use crate::services::format_adapter::BookMetadata;

/// Generate cover for a book
#[tauri::command]
pub async fn generate_cover(
    service: State<'_, Arc<CoverService>>,
    book_id: String,
    title: String,
    authors: Option<Vec<String>>,
) -> Result<String, String> {
    let uuid = Uuid::parse_str(&book_id)
        .map_err(|e| format!("Invalid book ID: {}", e))?;
    
    let metadata = BookMetadata {
        title,
        authors: authors.unwrap_or_default(),
        ..Default::default()
    };
    
    let cover_set = service.get_or_generate_cover(uuid, None, &metadata)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(cover_set.medium.to_string_lossy().to_string())
}

/// Get cover by book ID (from cache or generate)
#[tauri::command]
pub async fn get_book_cover(
    service: State<'_, Arc<CoverService>>,
    book_id: String,
    title: String,
    authors: Option<Vec<String>>,
) -> Result<String, String> {
    let uuid = Uuid::parse_str(&book_id)
        .map_err(|e| format!("Invalid book ID: {}", e))?;
    
    let metadata = BookMetadata {
        title,
        authors: authors.unwrap_or_default(),
        ..Default::default()
    };
    
    let cover_set = service.get_or_generate_cover(uuid, None, &metadata)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(cover_set.medium.to_string_lossy().to_string())
}

/// Clear cover cache
#[tauri::command]
pub async fn clear_cover_cache(
    service: State<'_, Arc<CoverService>>,
) -> Result<(), String> {
    service.inner().clear_cache().await;
    Ok(())
}
