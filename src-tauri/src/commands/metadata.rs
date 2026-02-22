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

/// Auto-fetch metadata for a book/manga by dispatching to the background worker
#[tauri::command]
pub async fn enrich_book_metadata(
    app_state: State<'_, crate::AppState>,
    metadata_state: State<'_, crate::MetadataState>,
    book_id: i64,
) -> std::result::Result<bool, String> {
    use crate::services::library_service;
    use crate::services::online::provider::{MetadataQuery, ItemType};
    use crate::services::online::worker::MetadataJob;
    use crate::services::manga_metadata_service::parse_manga_title;

    let book = {
        let db = app_state.db.lock().unwrap();
        library_service::get_book_by_id(&db, book_id).map_err(|e| e.to_string())?
    };

    let is_manga = matches!(book.file_format.to_lowercase().as_str(), "cbz" | "cbr");

    let query = if is_manga {
        let parsed_title = parse_manga_title(&book.title);
        MetadataQuery::Title(parsed_title)
    } else {
        if let Some(isbn) = book.isbn.or(book.isbn13) {
            MetadataQuery::Isbn(isbn)
        } else {
            let author = book.authors.first().map(|a| a.name.clone());
            MetadataQuery::TitleAuthor { title: book.title.clone(), author }
        }
    };

    let item_type = if is_manga { ItemType::Manga } else { ItemType::Book };

    let job = MetadataJob {
        item_id: book_id,
        item_type,
        query,
        force_refresh: true, // Manual refresh skips local cache checks
    };

    metadata_state.sender.send(job).await.map_err(|e| format!("Failed to dispatch metadata job: {}", e))?;

    log::info!("[enrich_book_metadata] Dispatched background fetch for book {} ({:?})", book_id, item_type);
    
    // We return true immediately; the frontend should subscribe to Tauri events (or poll)
    Ok(true)
}
