use crate::services::metadata_service;
use crate::services::manga_metadata_service::{MangaMetadataService, parse_manga_title};
use crate::services::book_metadata_service::BookMetadataService;
use crate::error::{Result, ShioriError};
use crate::models::Metadata;
use crate::utils::validate;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn extract_metadata(file_path: String) -> Result<Metadata> {
    validate::require_safe_path(&file_path, "file_path")?;
    metadata_service::extract_from_file(&file_path)
}

// ═══════════════════════════════════════════════════════════
// MANGA METADATA COMMANDS (AniList API)
// ═══════════════════════════════════════════════════════════

#[tauri::command]
pub async fn search_manga_metadata(
    service: State<'_, Arc<MangaMetadataService>>,
    title: String,
) -> Result<Vec<crate::services::manga_metadata_service::MangaMetadata>> {
    validate::require_non_empty(&title, "title")?;
    validate::require_max_length(&title, 500, "title")?;
    service.search_manga(&title).await
}

#[tauri::command]
pub async fn get_manga_metadata_by_id(
    service: State<'_, Arc<MangaMetadataService>>,
    anilist_id: i64,
) -> Result<crate::services::manga_metadata_service::MangaMetadata> {
    validate::require_positive_id(anilist_id, "anilist_id")?;
    service.get_manga_by_id(anilist_id).await
}

#[tauri::command]
pub fn parse_manga_filename(filename: String) -> Result<String> {
    validate::require_non_empty(&filename, "filename")?;
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
) -> Result<Vec<crate::services::book_metadata_service::BookMetadata>> {
    validate::require_non_empty(&title, "title")?;
    validate::require_max_length(&title, 500, "title")?;
    service.search_book(&title, author.as_deref()).await
}

#[tauri::command]
pub async fn search_book_by_isbn(
    service: State<'_, Arc<BookMetadataService>>,
    isbn: String,
) -> Result<Option<crate::services::book_metadata_service::BookMetadata>> {
    validate::require_non_empty(&isbn, "isbn")?;
    validate::require_max_length(&isbn, 20, "isbn")?;
    service.search_by_isbn(&isbn).await
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
) -> Result<bool> {
    validate::require_positive_id(book_id, "book_id")?;
    use crate::services::library_service;
    use crate::services::online::provider::{MetadataQuery, ItemType};
    use crate::services::online::worker::MetadataJob;
    use crate::services::manga_metadata_service::parse_manga_title;

    let book = {
        let db = &app_state.db;
        library_service::get_book_by_id(db, book_id)?
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

    metadata_state.sender.send(job).await
        .map_err(|e| ShioriError::Other(format!("Failed to dispatch metadata job: {}", e)))?;

    log::info!("[enrich_book_metadata] Dispatched background fetch for book {} ({:?})", book_id, item_type);
    
    // We return true immediately; the frontend should subscribe to Tauri events (or poll)
    Ok(true)
}
