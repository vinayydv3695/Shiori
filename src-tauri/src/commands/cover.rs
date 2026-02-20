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

/// Get raw cover bytes by book ID (for direct IPC streaming, avoids 403 errors)
#[tauri::command]
pub async fn get_book_cover_bytes(
    service: State<'_, Arc<CoverService>>,
    book_id: String,
    title: String,
    authors: Option<Vec<String>>,
) -> Result<tauri::ipc::Response, String> {
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
    
    let bytes = tokio::fs::read(&cover_set.medium).await
        .map_err(|e| format!("Failed to read cover image: {}", e))?;
        
    Ok(tauri::ipc::Response::new(bytes))
}

/// Get raw cover bytes by numeric database ID (useful for frontend fetching)
#[tauri::command]
pub async fn get_cover_by_id(
    app_state: State<'_, crate::AppState>,
    service: State<'_, Arc<CoverService>>,
    id: i64,
) -> Result<tauri::ipc::Response, String> {
    let book = {
        let db = app_state.db.lock().unwrap();
        crate::services::library_service::get_book_by_id(&db, id).map_err(|e| e.to_string())?
    };

    // First, try to use the extracted cover from database if it exists
    if let Some(cover_path) = &book.cover_path {
        if let Ok(bytes) = tokio::fs::read(cover_path).await {
            log::debug!("[get_cover_by_id] Using extracted cover from: {}", cover_path);
            return Ok(tauri::ipc::Response::new(bytes));
        } else {
            log::warn!("[get_cover_by_id] Cover path exists but file not found: {}", cover_path);
        }
    }

    // Fallback: Generate or get cover from CoverService
    log::debug!("[get_cover_by_id] No extracted cover, using CoverService for book: {}", book.title);
    let uuid = Uuid::parse_str(&book.uuid)
        .map_err(|e| format!("Invalid book UUID: {}", e))?;

    let metadata = BookMetadata {
        title: book.title.clone(),
        authors: book.authors.iter().map(|a| a.name.clone()).collect(),
        ..Default::default()
    };

    let cover_set = service.get_or_generate_cover(uuid, None, &metadata)
        .await
        .map_err(|e| e.to_string())?;

    let bytes = tokio::fs::read(&cover_set.medium).await
        .map_err(|e| format!("Failed to read cover image: {}", e))?;

    Ok(tauri::ipc::Response::new(bytes))
}

/// Clear cover cache
#[tauri::command]
pub async fn clear_cover_cache(
    service: State<'_, Arc<CoverService>>,
) -> Result<(), String> {
    service.inner().clear_cache().await;
    Ok(())
}
