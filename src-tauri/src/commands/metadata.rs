use crate::error::{Result, ShioriError};
use crate::models::Metadata;
use crate::services::book_metadata_service::BookMetadataService;
use crate::services::manga_metadata_service::{parse_manga_title, MangaMetadataService};
use crate::services::metadata_service;
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
    include_nsfw: bool,
) -> Result<Vec<crate::services::manga_metadata_service::MangaMetadata>> {
    validate::require_non_empty(&title, "title")?;
    validate::require_max_length(&title, 500, "title")?;
    service.search_manga(&title, include_nsfw).await
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
    use crate::services::manga_metadata_service::parse_manga_title;
    use crate::services::online::provider::{ItemType, MetadataQuery};
    use crate::services::online::worker::MetadataJob;

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
            MetadataQuery::TitleAuthor {
                title: book.title.clone(),
                author,
            }
        }
    };

    let item_type = if is_manga {
        ItemType::Manga
    } else {
        ItemType::Book
    };

    let job = MetadataJob {
        item_id: book_id,
        item_type,
        query,
        force_refresh: true, // Manual refresh skips local cache checks
    };

    metadata_state
        .sender
        .send(job)
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to dispatch metadata job: {}", e)))?;

    log::info!(
        "[enrich_book_metadata] Dispatched background fetch for book {} ({:?})",
        book_id,
        item_type
    );

    // We return true immediately; the frontend should subscribe to Tauri events (or poll)
    Ok(true)
}

// ═══════════════════════════════════════════════════════════
// PREVIEW COVER
// ═══════════════════════════════════════════════════════════

#[tauri::command]
pub async fn preview_cover_url(url: String) -> Result<Vec<u8>> {
    validate::require_non_empty(&url, "url")?;

    // Safety measures: 10 second timeout, 5MB size limit
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| ShioriError::Other(format!("Failed to build HTTP client: {}", e)))?;

    let mut response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to download cover: {}", e)))?;

    if !response.status().is_success() {
        return Err(ShioriError::Other(format!(
            "Cover download failed with status: {}",
            response.status()
        )));
    }

    // Read bytes in chunks to enforce size limit
    let mut bytes = Vec::new();
    let max_size: usize = 5 * 1024 * 1024; // 5MB

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to read cover chunk: {}", e)))?
    {
        if bytes.len() + chunk.len() > max_size {
            return Err(ShioriError::Other(
                "Cover file too large (exceeds 5MB limit)".to_string(),
            ));
        }
        bytes.extend_from_slice(&chunk);
    }

    Ok(bytes)
}

// ═══════════════════════════════════════════════════════════
// APPLY SELECTED METADATA (Direct)
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct SelectedMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub authors: Vec<String>,
    pub genres: Vec<String>, // Applied as tags
    pub cover_url: Option<String>,
    pub publisher: Option<String>,
    pub publish_date: Option<String>,
    pub page_count: Option<i32>,
    pub isbn: Option<String>,
    pub isbn13: Option<String>,
    pub anilist_id: Option<String>,
    pub open_library_id: Option<String>,
    pub status: Option<String>,
}

/// Apply selected metadata directly to a book without re-searching
#[tauri::command]
pub async fn apply_selected_metadata(
    app_state: State<'_, crate::AppState>,
    book_id: i64,
    metadata: SelectedMetadata,
) -> Result<bool> {
    use crate::services::library_service;

    validate::require_positive_id(book_id, "book_id")?;

    let db = &app_state.db;
    let mut book = library_service::get_book_by_id(db, book_id)?;

    let is_locked = |field: &str| -> bool {
        book.metadata_locked
            .as_ref()
            .and_then(|locks| locks.get(field))
            .copied()
            .unwrap_or(false)
    };

    if let Some(title) = &metadata.title {
        if !title.is_empty() && !is_locked("title") {
            book.title = title.clone();
        }
    }
    if let Some(desc) = &metadata.description {
        if !is_locked("description") {
            book.notes = Some(desc.clone());
        }
    }
    if let Some(publisher) = &metadata.publisher {
        if !is_locked("publisher") {
            book.publisher = Some(publisher.clone());
        }
    }
    if let Some(pubdate) = &metadata.publish_date {
        if !is_locked("publish_date") {
            book.pubdate = Some(pubdate.clone());
        }
    }
    if let Some(pages) = metadata.page_count {
        if !is_locked("page_count") {
            book.page_count = Some(pages);
        }
    }
    if let Some(isbn) = &metadata.isbn {
        if !is_locked("isbn") {
            book.isbn = Some(isbn.clone());
        }
    }
    if let Some(isbn13) = &metadata.isbn13 {
        if !is_locked("isbn") {
            book.isbn13 = Some(isbn13.clone());
        }
    }
    if let Some(anilist_id) = &metadata.anilist_id {
        book.anilist_id = Some(anilist_id.clone());
    }

    if !metadata.authors.is_empty() && !is_locked("author") {
        book.authors = metadata
            .authors
            .iter()
            .map(|name| crate::models::Author {
                id: None,
                name: name.clone(),
                sort_name: None,
                link: None,
            })
            .collect();
    }

    if !metadata.genres.is_empty() && !is_locked("tags") {
        book.tags = metadata
            .genres
            .iter()
            .map(|g| crate::models::Tag {
                id: None,
                name: g.clone(),
                color: None,
            })
            .collect();
    }

    book.online_metadata_fetched = true;
    book.metadata_source = Some(
        if metadata.anilist_id.is_some() {
            "anilist"
        } else {
            "openlibrary"
        }
        .to_string(),
    );
    book.metadata_last_sync = Some(chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string());

    library_service::update_book(db, book)?;

    let conn = db.get_connection()?;
    conn.execute(
        "UPDATE books SET 
            online_metadata_fetched = 1,
            metadata_source = ?1,
            metadata_last_sync = ?2
         WHERE id = ?3",
        rusqlite::params![
            if metadata.anilist_id.is_some() {
                "anilist"
            } else {
                "openlibrary"
            },
            chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            book_id,
        ],
    )?;

    if let Some(cover_url) = &metadata.cover_url {
        if !cover_url.is_empty() {
            let url = cover_url.clone();
            let db_clone = db.clone();
            let book_id_clone = book_id;
            let covers_dir = app_state.covers_dir.clone();

            tauri::async_runtime::spawn(async move {
                if let Ok(response) = reqwest::get(&url).await {
                    if !response.status().is_success() {
                        log::error!(
                            "[apply_selected_metadata] Cover download failed with status: {}",
                            response.status()
                        );
                        return;
                    }

                    let content_type = response
                        .headers()
                        .get(reqwest::header::CONTENT_TYPE)
                        .and_then(|ct| ct.to_str().ok())
                        .unwrap_or("image/jpeg");

                    let mut ext = match content_type {
                        ct if ct.contains("png") => "png",
                        ct if ct.contains("webp") => "webp",
                        ct if ct.contains("gif") => "gif",
                        _ => "jpg",
                    };

                    if let Ok(bytes) = response.bytes().await {
                        if bytes.len() > 10 * 1024 * 1024 {
                            log::error!(
                                "[apply_selected_metadata] Cover too large: {} bytes",
                                bytes.len()
                            );
                            return;
                        }

                        if bytes.starts_with(b"\x89PNG") {
                            ext = "png";
                        } else if bytes.len() > 12
                            && bytes.starts_with(b"RIFF")
                            && &bytes[8..12] == b"WEBP"
                        {
                            ext = "webp";
                        } else if bytes.starts_with(b"GIF8") {
                            ext = "gif";
                        }

                        if let Ok(conn) = db_clone.get_connection() {
                            if let Ok(uuid) = conn.query_row(
                                "SELECT uuid FROM books WHERE id = ?1",
                                rusqlite::params![book_id_clone],
                                |row| row.get::<_, String>(0),
                            ) {
                                if let Err(e) = std::fs::create_dir_all(&covers_dir) {
                                    log::error!(
                                        "[apply_selected_metadata] Failed to create covers dir: {}",
                                        e
                                    );
                                    return;
                                }

                                let cover_path = covers_dir.join(format!("{}.{}", uuid, ext));

                                if std::fs::write(&cover_path, &bytes).is_ok() {
                                    let _ = conn.execute(
                                        "UPDATE books SET cover_path = ?1 WHERE id = ?2",
                                        rusqlite::params![
                                            cover_path.to_string_lossy().to_string(),
                                            book_id_clone
                                        ],
                                    );
                                    log::info!(
                                        "[apply_selected_metadata] Cover downloaded for book {}",
                                        book_id_clone
                                    );
                                } else {
                                    log::error!(
                                        "[apply_selected_metadata] Failed to write cover file"
                                    );
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    log::info!(
        "[apply_selected_metadata] Applied selected metadata to book {}",
        book_id
    );
    Ok(true)
}

fn normalize_series_status(status: &str) -> Option<&'static str> {
    match status.trim().to_uppercase().as_str() {
        "FINISHED" | "COMPLETED" => Some("completed"),
        "RELEASING" | "ONGOING" => Some("ongoing"),
        "HIATUS" => Some("hiatus"),
        "CANCELLED" | "CANCELED" => Some("cancelled"),
        _ => None,
    }
}

#[tauri::command]
pub async fn apply_selected_series_metadata(
    app_state: State<'_, crate::AppState>,
    series_id: i64,
    metadata: SelectedMetadata,
) -> Result<bool> {
    validate::require_positive_id(series_id, "series_id")?;

    let db = &app_state.db;

    {
        let conn = db.get_connection()?;

        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM manga_series WHERE id = ?1",
            rusqlite::params![series_id],
            |row| row.get(0),
        )?;

        if !exists {
            return Err(ShioriError::BookNotFound(format!(
                "Manga series with id {} not found",
                series_id
            )));
        }

        if let Some(title) = metadata
            .title
            .as_ref()
            .map(|t| t.trim())
            .filter(|t| !t.is_empty())
        {
            conn.execute(
                "UPDATE manga_series SET title = ?1, sort_title = ?2 WHERE id = ?3",
                rusqlite::params![title, title.to_lowercase(), series_id],
            )?;

            conn.execute(
                "UPDATE books SET series = ?1 WHERE manga_series_id = ?2",
                rusqlite::params![title, series_id],
            )?;
        }

        if let Some(status) = metadata
            .status
            .as_ref()
            .and_then(|s| normalize_series_status(s))
        {
            conn.execute(
                "UPDATE manga_series SET status = ?1 WHERE id = ?2",
                rusqlite::params![status, series_id],
            )?;
        }
    }

    if let Some(cover_url) = metadata
        .cover_url
        .as_ref()
        .map(|u| u.trim())
        .filter(|u| !u.is_empty())
    {
        let response = reqwest::get(cover_url)
            .await
            .map_err(|e| ShioriError::Other(format!("Failed to download series cover: {}", e)))?;

        if !response.status().is_success() {
            return Err(ShioriError::Other(format!(
                "Series cover download failed with status: {}",
                response.status()
            )));
        }

        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|ct| ct.to_str().ok())
            .unwrap_or("image/jpeg");

        let mut ext = match content_type {
            ct if ct.contains("png") => "png",
            ct if ct.contains("webp") => "webp",
            ct if ct.contains("gif") => "gif",
            _ => "jpg",
        };

        let bytes = response
            .bytes()
            .await
            .map_err(|e| ShioriError::Other(format!("Failed reading series cover bytes: {}", e)))?;

        if bytes.len() > 10 * 1024 * 1024 {
            return Err(ShioriError::Other(
                "Series cover too large (max 10MB)".to_string(),
            ));
        }

        if bytes.starts_with(b"\x89PNG") {
            ext = "png";
        } else if bytes.len() > 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
            ext = "webp";
        } else if bytes.starts_with(b"GIF8") {
            ext = "gif";
        }

        std::fs::create_dir_all(&app_state.covers_dir)
            .map_err(|e| ShioriError::Other(format!("Failed to create covers dir: {}", e)))?;

        let cover_path = app_state
            .covers_dir
            .join(format!("series-{}.{}", series_id, ext));

        std::fs::write(&cover_path, &bytes)
            .map_err(|e| ShioriError::Other(format!("Failed to write series cover: {}", e)))?;

        let cover_path_str = cover_path.to_string_lossy().to_string();
        let conn = db.get_connection()?;

        conn.execute(
            "UPDATE manga_series SET cover_path = ?1 WHERE id = ?2",
            rusqlite::params![cover_path_str, series_id],
        )?;

        conn.execute(
            "UPDATE books
             SET cover_path = ?1
             WHERE id = (
                SELECT id FROM books
                WHERE manga_series_id = ?2
                ORDER BY series_index ASC NULLS LAST, added_date ASC
                LIMIT 1
             )",
            rusqlite::params![cover_path.to_string_lossy().to_string(), series_id],
        )?;
    }

    log::info!(
        "[apply_selected_series_metadata] Applied metadata to series {}",
        series_id
    );
    Ok(true)
}
