use crate::services::metadata_service;
use crate::services::manga_metadata_service::{MangaMetadataService, parse_manga_title};
use crate::services::book_metadata_service::BookMetadataService;
use crate::{error::Result, models::Metadata};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn extract_metadata(file_path: String) -> Result<Metadata> {
    metadata_service::extract_from_file(&file_path)
}

// ═══════════════════════════════════════════════════════════
// MANGA METADATA COMMANDS (AniList API)
// ═══════════════════════════════════════════════════════════

#[tauri::command]
pub async fn search_manga_metadata(
    service: State<'_, Arc<MangaMetadataService>>,
    title: String,
) -> std::result::Result<Vec<crate::services::manga_metadata_service::MangaMetadata>, String> {
    service.search_manga(&title).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_manga_metadata_by_id(
    service: State<'_, Arc<MangaMetadataService>>,
    anilist_id: i64,
) -> std::result::Result<crate::services::manga_metadata_service::MangaMetadata, String> {
    service.get_manga_by_id(anilist_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn parse_manga_filename(filename: String) -> std::result::Result<String, String> {
    Ok(parse_manga_title(&filename))
}

// ═══════════════════════════════════════════════════════════
// BOOK METADATA COMMANDS (Open Library API)
// ═══════════════════════════════════════════════════════════

#[tauri::command]
pub async fn search_book_metadata(
    service: State<'_, Arc<BookMetadataService>>,
    title: String,
    author: Option<String>,
) -> std::result::Result<Vec<crate::services::book_metadata_service::BookMetadata>, String> {
    service.search_book(&title, author.as_deref()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_book_by_isbn(
    service: State<'_, Arc<BookMetadataService>>,
    isbn: String,
) -> std::result::Result<Option<crate::services::book_metadata_service::BookMetadata>, String> {
    service.search_by_isbn(&isbn).await.map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════
// METADATA ENRICHMENT (Background)
// ═══════════════════════════════════════════════════════════

/// Auto-fetch metadata for a book/manga
#[tauri::command]
pub async fn enrich_book_metadata(
    app_state: State<'_, crate::AppState>,
    manga_service: State<'_, Arc<MangaMetadataService>>,
    book_service: State<'_, Arc<BookMetadataService>>,
    book_id: i64,
) -> std::result::Result<bool, String> {
    use crate::services::library_service;
    
    let book = {
        let db = app_state.db.lock().unwrap();
        library_service::get_book_by_id(&db, book_id).map_err(|e| e.to_string())?
    };

    let is_manga = matches!(book.file_format.to_lowercase().as_str(), "cbz" | "cbr");

    if is_manga {
        let parsed_title = parse_manga_title(&book.title);
        log::info!("[enrich_book_metadata] Searching manga: {}", parsed_title);
        
        match manga_service.search_manga(&parsed_title).await {
            Ok(results) if !results.is_empty() => {
                let metadata = &results[0];
                log::info!("[enrich_book_metadata] Found: {} (ID: {})", 
                    metadata.title_romaji, metadata.anilist_id);

                // Download and save cover
                if let Ok(cover_bytes) = manga_service.download_cover(&metadata.cover_url_extra_large).await {
                    let app_dir = std::env::var("APPDATA")
                        .or_else(|_| std::env::var("HOME").map(|h| format!("{}/.local/share", h)))
                        .map_err(|_| "Failed to get app data dir".to_string())?;
                    
                    let covers_dir = std::path::Path::new(&app_dir).join("com.tauri.shiori").join("covers");
                    let _ = tokio::fs::create_dir_all(&covers_dir).await;

                    let cover_path = covers_dir.join(format!("{}_anilist.jpg", book.uuid));
                    let _ = tokio::fs::write(&cover_path, &cover_bytes).await;
                    
                    log::info!("[enrich_book_metadata] ✅ Saved API cover");
                }

                Ok(true)
            }
            _ => Ok(false),
        }
    } else {
        // Book workflow - try ISBN first
        if let Some(isbn) = book.isbn.or(book.isbn13) {
            log::info!("[enrich_book_metadata] Searching by ISBN: {}", isbn);
            
            if let Ok(Some(_metadata)) = book_service.search_by_isbn(&isbn).await {
                log::info!("[enrich_book_metadata] ✅ Found book metadata");
                return Ok(true);
            }
        }
        
        // Fallback to title search
        let author = book.authors.first().map(|a| a.name.clone());
        match book_service.search_book(&book.title, author.as_deref()).await {
            Ok(results) if !results.is_empty() => Ok(true),
            _ => Ok(false),
        }
    }
}
