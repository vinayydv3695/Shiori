use crate::db::Database;
use crate::error::{Result, ShioriError};
use crate::models::{Author, Book, ImportResult, Tag};
use crate::services::metadata_service;
use crate::utils::file::{calculate_file_hash, get_file_size};
use rayon::prelude::*;
use rusqlite::params;
use std::collections::HashMap;
use uuid::Uuid;
use walkdir::WalkDir;

/// Base SELECT columns for the books table — used by all list/get queries.
const BOOK_COLUMNS: &str =
    "b.id, b.uuid, b.title, b.sort_title, b.isbn, b.isbn13, b.publisher, b.pubdate, 
     b.series, b.series_index, b.rating, b.file_path, b.file_format, b.file_size, 
     b.file_hash, b.cover_path, b.page_count, b.word_count, b.language, 
     b.added_date, b.modified_date, b.last_opened, b.notes,
     b.online_metadata_fetched, b.metadata_source, b.metadata_last_sync, b.anilist_id,
     b.is_favorite, b.reading_status, b.domain, b.metadata_locked, b.is_wishlist, b.in_trash, b.deleted_at";

/// Map a single row (using the BOOK_COLUMNS order) into a Book with empty authors/tags.
fn book_from_row(row: &rusqlite::Row) -> rusqlite::Result<Book> {
    let metadata_locked_json: Option<String> = row.get(30).ok().flatten();
    let metadata_locked = metadata_locked_json.and_then(|json| serde_json::from_str(&json).ok());

    Ok(Book {
        id: Some(row.get(0)?),
        uuid: row.get(1)?,
        title: row.get(2)?,
        sort_title: row.get(3)?,
        isbn: row.get(4)?,
        isbn13: row.get(5)?,
        publisher: row.get(6)?,
        pubdate: row.get(7)?,
        series: row.get(8)?,
        series_index: row.get(9)?,
        rating: row.get(10)?,
        file_path: row.get(11)?,
        file_format: row.get(12)?,
        file_size: row.get(13)?,
        file_hash: row.get(14)?,
        cover_path: row.get(15)?,
        page_count: row.get(16)?,
        word_count: row.get(17)?,
        language: row.get(18)?,
        added_date: row.get(19)?,
        modified_date: row.get(20)?,
        last_opened: row.get(21)?,
        notes: row.get(22)?,
        online_metadata_fetched: row.get::<_, i64>(23).unwrap_or(0) != 0,
        metadata_source: row.get(24).ok().flatten(),
        metadata_last_sync: row.get(25).ok().flatten(),
        anilist_id: row.get(26).ok().flatten(),
        is_favorite: row.get::<_, i64>(27).unwrap_or(0) != 0,
        reading_status: row.get(28)?,
        domain: row.get(29).ok().flatten(),
        metadata_locked,
        is_wishlist: row.get::<_, i64>(31).unwrap_or(0) != 0,
        in_trash: row.get::<_, i64>(32).unwrap_or(0) != 0,
        deleted_at: row.get(33).ok().flatten(),
        authors: vec![],
        tags: vec![],
    })
}

/// Batch-load authors and tags for a set of book IDs (eliminates N+1 queries).
/// Mutates the books in-place to attach their authors and tags.
fn attach_authors_and_tags(conn: &rusqlite::Connection, books: &mut [Book]) -> Result<()> {
    if books.is_empty() {
        return Ok(());
    }

    let book_ids: Vec<i64> = books.iter().filter_map(|b| b.id).collect();

    // Build a placeholder string like "?1, ?2, ?3"
    let placeholders: String = book_ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect::<Vec<_>>()
        .join(", ");

    // --- Batch fetch authors ---
    let author_sql = format!(
        "SELECT ba.book_id, a.id, a.name, a.sort_name, a.link
         FROM books_authors ba
         JOIN authors a ON a.id = ba.author_id
         WHERE ba.book_id IN ({})
         ORDER BY ba.book_id, ba.author_order",
        placeholders
    );
    let mut author_stmt = conn.prepare(&author_sql)?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = book_ids
        .iter()
        .map(|id| id as &dyn rusqlite::ToSql)
        .collect();
    let author_rows = author_stmt.query_map(params_refs.as_slice(), |row| {
        Ok((
            row.get::<_, i64>(0)?, // book_id
            Author {
                id: Some(row.get(1)?),
                name: row.get(2)?,
                sort_name: row.get(3)?,
                link: row.get(4)?,
            },
        ))
    })?;

    let mut authors_map: HashMap<i64, Vec<Author>> = HashMap::new();
    for row in author_rows {
        let (book_id, author) = row?;
        authors_map.entry(book_id).or_default().push(author);
    }

    // --- Batch fetch tags ---
    let tag_sql = format!(
        "SELECT bt.book_id, t.id, t.name, t.color
         FROM books_tags bt
         JOIN tags t ON t.id = bt.tag_id
         WHERE bt.book_id IN ({})
         ORDER BY bt.book_id",
        placeholders
    );
    let mut tag_stmt = conn.prepare(&tag_sql)?;
    let tag_rows = tag_stmt.query_map(params_refs.as_slice(), |row| {
        Ok((
            row.get::<_, i64>(0)?, // book_id
            Tag {
                id: Some(row.get(1)?),
                name: row.get(2)?,
                color: row.get(3)?,
            },
        ))
    })?;

    let mut tags_map: HashMap<i64, Vec<Tag>> = HashMap::new();
    for row in tag_rows {
        let (book_id, tag) = row?;
        tags_map.entry(book_id).or_default().push(tag);
    }

    // --- Attach to books ---
    for book in books.iter_mut() {
        if let Some(bid) = book.id {
            if let Some(authors) = authors_map.remove(&bid) {
                book.authors = authors;
            }
            if let Some(tags) = tags_map.remove(&bid) {
                book.tags = tags;
            }
        }
    }

    Ok(())
}

pub fn get_all_books(db: &Database, limit: u32, offset: u32) -> Result<Vec<Book>> {
    let conn = db.get_connection()?;

    let sql = format!(
        "SELECT {} FROM books b WHERE b.in_trash = 0 ORDER BY b.added_date DESC LIMIT ?1 OFFSET ?2",
        BOOK_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;

    let mut books: Vec<Book> = stmt
        .query_map(params![limit, offset], book_from_row)?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    attach_authors_and_tags(&conn, &mut books)?;

    Ok(books)
}

/// Batch fetch books by IDs and preserve the input ID order.
/// Eliminates N+1 `get_book_by_id` calls for paged search results.
pub fn get_books_by_ids(db: &Database, ids: &[i64]) -> Result<Vec<Book>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let conn = db.get_connection()?;
    let mut books: Vec<Book> = Vec::with_capacity(ids.len());

    // SQLite on Android (and older versions) limits bound parameters to 999.
    // Chunk requests into batches of 500 to stay safely under the limit.
    for chunk in ids.chunks(500) {
        let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let sql = format!(
            "SELECT {} FROM books b WHERE b.id IN ({})",
            BOOK_COLUMNS, placeholders
        );

        let mut stmt = conn.prepare(&sql)?;
        let chunk_books: Vec<Book> = stmt
            .query_map(rusqlite::params_from_iter(chunk.iter()), book_from_row)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        
        books.extend(chunk_books);
    }

    attach_authors_and_tags(&conn, &mut books)?;

    let mut by_id: HashMap<i64, Book> = books
        .into_iter()
        .filter_map(|b| b.id.map(|id| (id, b)))
        .collect();

    let mut ordered = Vec::with_capacity(ids.len());
    for id in ids {
        if let Some(book) = by_id.remove(id) {
            ordered.push(book);
        }
    }

    Ok(ordered)
}

pub fn get_total_books(db: &Database) -> Result<i64> {
    let conn = db.get_connection()?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM books WHERE in_trash = 0", [], |row| row.get(0))?;
    Ok(count)
}

pub fn get_book_by_id(db: &Database, id: i64) -> Result<Book> {
    let conn = db.get_connection()?;

    let sql = format!("SELECT {} FROM books b WHERE b.id = ?1", BOOK_COLUMNS);
    let mut book: Book = conn
        .query_row(&sql, params![id], book_from_row)
        .map_err(|_| ShioriError::BookNotFound(id.to_string()))?;

    book.authors = get_authors_for_book(&conn, id)?;
    book.tags = get_tags_for_book(&conn, id)?;

    Ok(book)
}

pub fn add_book(db: &Database, mut book: Book) -> Result<i64> {
    let mut conn = db.get_connection()?;

    // Generate UUID if not provided
    if book.uuid.is_empty() {
        book.uuid = Uuid::new_v4().to_string();
    }

    // Check for duplicates by file hash (before starting transaction)
    if let Some(ref hash) = book.file_hash {
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM books WHERE file_hash = ?1)",
            params![hash],
            |row| row.get(0),
        )?;

        if exists {
            return Err(ShioriError::DuplicateBook(hash.clone()));
        }
    }

    // Use a transaction so book + authors + tags are inserted atomically
    let tx = conn.transaction()?;

    // Insert book
    tx.execute(
        "INSERT INTO books (uuid, title, sort_title, isbn, isbn13, publisher, pubdate,
                           series, series_index, rating, file_path, file_format, file_size,
                           file_hash, cover_path, page_count, word_count, language, notes, reading_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
        params![
            book.uuid,
            book.title,
            book.sort_title,
            book.isbn,
            book.isbn13,
            book.publisher,
            book.pubdate,
            book.series,
            book.series_index,
            book.rating,
            book.file_path,
            book.file_format,
            book.file_size,
            book.file_hash,
            book.cover_path,
            book.page_count,
            book.word_count,
            book.language,
            book.notes,
            book.reading_status,
        ],
    )?;

    let book_id = tx.last_insert_rowid();

    // Add authors
    for author in &book.authors {
        let author_id = get_or_create_author_tx(&tx, &author.name)?;
        tx.execute(
            "INSERT INTO books_authors (book_id, author_id) VALUES (?1, ?2)",
            params![book_id, author_id],
        )?;
    }

    // Add tags
    for tag in &book.tags {
        if let Some(tag_id) = tag.id {
            tx.execute(
                "INSERT INTO books_tags (book_id, tag_id) VALUES (?1, ?2)",
                params![book_id, tag_id],
            )?;
        }
    }

    tx.commit()?;
    Ok(book_id)
}

pub fn update_book(db: &Database, book: Book) -> Result<()> {
    let mut conn = db.get_connection()?;

    let book_id = book.id.ok_or(ShioriError::Other(
        "Book ID required for update".to_string(),
    ))?;

    let metadata_locked_json = book
        .metadata_locked
        .as_ref()
        .and_then(|locks| serde_json::to_string(locks).ok());

    let tx = conn.transaction()?;

    tx.execute(
        "UPDATE books SET 
            title = ?1, sort_title = ?2, isbn = ?3, isbn13 = ?4, publisher = ?5,
            pubdate = ?6, series = ?7, series_index = ?8, rating = ?9, language = ?10,
            notes = ?11, reading_status = ?12, metadata_locked = ?13, modified_date = CURRENT_TIMESTAMP
         WHERE id = ?14",
        params![
            book.title,
            book.sort_title,
            book.isbn,
            book.isbn13,
            book.publisher,
            book.pubdate,
            book.series,
            book.series_index,
            book.rating,
            book.language,
            book.notes,
            book.reading_status,
            metadata_locked_json,
            book_id,
        ],
    )?;

    tx.execute(
        "DELETE FROM books_authors WHERE book_id = ?1",
        params![book_id],
    )?;
    for author in &book.authors {
        let author_id = get_or_create_author_tx(&tx, &author.name)?;
        tx.execute(
            "INSERT INTO books_authors (book_id, author_id) VALUES (?1, ?2)",
            params![book_id, author_id],
        )?;
    }

    tx.execute(
        "DELETE FROM books_tags WHERE book_id = ?1",
        params![book_id],
    )?;
    for tag in &book.tags {
        if let Some(tag_id) = tag.id {
            tx.execute(
                "INSERT INTO books_tags (book_id, tag_id) VALUES (?1, ?2)",
                params![book_id, tag_id],
            )?;
        }
    }

    tx.commit()?;
    Ok(())
}

pub fn delete_book(db: &Database, id: i64) -> Result<()> {
    log::info!("[delete_book] Attempting to delete book with id: {}", id);
    let conn = db.get_connection()?;

    // First check if book exists
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM books WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;

    log::info!("[delete_book] Book exists: {}", exists);

    if !exists {
        log::warn!("[delete_book] Book with id {} not found", id);
        return Err(ShioriError::BookNotFound(id.to_string()));
    }

    // Check foreign keys status
    let fk_enabled: i32 = conn.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
    log::info!("[delete_book] Foreign keys enabled: {}", fk_enabled);

    let enable_recycle_bin: bool = conn
        .query_row(
            "SELECT enable_recycle_bin FROM user_preferences WHERE id = 1",
            [],
            |row| row.get::<_, i32>(0).map(|v| v != 0),
        )
        .unwrap_or(true);

    let rows_affected = if enable_recycle_bin {
        conn.execute(
            "UPDATE books SET in_trash = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![id],
        )?
    } else {
        conn.execute("DELETE FROM books WHERE id = ?1", params![id])?
    };

    log::info!("[delete_book] Rows affected: {}", rows_affected);

    if rows_affected == 0 {
        log::error!("[delete_book] Delete failed - no rows affected but book exists!");
        return Err(ShioriError::BookNotFound(id.to_string()));
    }

    log::info!("[delete_book] Successfully deleted book with id: {}", id);
    Ok(())
}

pub fn delete_books(db: &Database, ids: Vec<i64>) -> Result<()> {
    log::info!(
        "[delete_books] Attempting to delete {} books: {:?}",
        ids.len(),
        ids
    );
    let mut conn = db.get_connection()?;
    
    let enable_recycle_bin: bool = conn
        .query_row(
            "SELECT enable_recycle_bin FROM user_preferences WHERE id = 1",
            [],
            |row| row.get::<_, i32>(0).map(|v| v != 0),
        )
        .unwrap_or(true);

    let tx = conn.transaction()?;

    let mut deleted_count = 0;
    for id in ids {
        let rows = if enable_recycle_bin {
            tx.execute(
                "UPDATE books SET in_trash = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![id],
            )?
        } else {
            tx.execute("DELETE FROM books WHERE id = ?1", params![id])?
        };
        
        log::info!(
            "[delete_books] Deleted book id {} - rows affected: {}",
            id,
            rows
        );
        deleted_count += rows;
    }

    log::info!("[delete_books] Total rows deleted: {}", deleted_count);
    tx.commit()?;
    log::info!("[delete_books] Transaction committed successfully");
    Ok(())
}

pub fn restore_book(db: &Database, id: i64) -> Result<()> {
    log::info!("[restore_book] Attempting to restore book with id: {}", id);
    let conn = db.get_connection()?;
    let rows_affected = conn.execute(
        "UPDATE books SET in_trash = 0, deleted_at = NULL WHERE id = ?1",
        params![id],
    )?;
    log::info!("[restore_book] Rows affected: {}", rows_affected);
    Ok(())
}

pub fn permanent_delete_book(db: &Database, id: i64) -> Result<()> {
    log::info!("[permanent_delete_book] Attempting to permanently delete book with id: {}", id);
    let conn = db.get_connection()?;
    let rows_affected = conn.execute("DELETE FROM books WHERE id = ?1 AND in_trash = 1", params![id])?;
    log::info!("[permanent_delete_book] Rows affected: {}", rows_affected);
    Ok(())
}

pub fn empty_trash(db: &Database) -> Result<()> {
    log::info!("[empty_trash] Attempting to empty trash");
    let conn = db.get_connection()?;
    let rows_affected = conn.execute("DELETE FROM books WHERE in_trash = 1", [])?;
    log::info!("[empty_trash] Rows affected: {}", rows_affected);
    Ok(())
}

pub fn clean_recycle_bin(db: &Database) -> Result<()> {
    log::info!("[clean_recycle_bin] Deleting items in trash older than 7 days");
    let conn = db.get_connection()?;
    let rows_affected = conn.execute(
        "DELETE FROM books WHERE in_trash = 1 AND deleted_at <= datetime('now', '-7 days')",
        [],
    )?;
    log::info!("[clean_recycle_bin] Rows affected: {}", rows_affected);
    Ok(())
}

pub fn cleanup_database(db: &Database, covers_dir: &std::path::Path) -> Result<(usize, usize)> {
    log::info!("[cleanup_database] Starting database cleanup");
    let mut conn = db.get_connection()?;
    let tx = conn.transaction()?;

    // 1. Delete books whose file_path does not exist
    let mut missing_ids = Vec::new();
    {
        let mut stmt = tx.prepare("SELECT id, file_path FROM books")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?;

        for row in rows {
            if let Ok((id, file_path)) = row {
                if !std::path::Path::new(&file_path).exists() {
                    missing_ids.push(id);
                }
            }
        }
    }

    let mut deleted_books = 0;
    for id in &missing_ids {
        let rows = tx.execute("DELETE FROM books WHERE id = ?1", params![id])?;
        deleted_books += rows;
    }

    tx.commit()?;
    log::info!("[cleanup_database] Deleted {} missing books", deleted_books);

    // 2. Delete unused covers
    let mut deleted_covers = 0;
    if covers_dir.exists() {
        let conn = db.get_connection()?;
        let mut stmt = conn.prepare("SELECT cover_path FROM books WHERE cover_path IS NOT NULL")?;
        let active_covers: std::collections::HashSet<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .filter_map(|r| r.ok())
            .collect();

        if let Ok(entries) = std::fs::read_dir(covers_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let path_str = path.to_string_lossy().to_string();
                    // Just check if any book has exactly this path
                    if !active_covers.contains(&path_str) {
                        if let Err(e) = std::fs::remove_file(&path) {
                            log::warn!("Failed to delete unused cover {:?}: {}", path, e);
                        } else {
                            deleted_covers += 1;
                        }
                    }
                }
            }
        }
    }
    
    log::info!("[cleanup_database] Deleted {} unused covers", deleted_covers);
    
    // 3. Clear renderer cache (we can just call clear_renderer_cache logic here, but it's separate so we'll leave it or we can just empty the cache dir)
    // We'll stick to books and covers for now as requested.

    Ok((deleted_books as usize, deleted_covers))
}

pub fn import_books(
    db: &Database,
    paths: Vec<String>,
    covers_dir: &std::path::Path,
) -> Result<ImportResult> {
    let mut result = ImportResult {
        success: vec![],
        failed: vec![],
        duplicates: vec![],
    };

    for path in paths {
        match import_single_book(db, &path, covers_dir) {
            Ok(is_duplicate) => {
                if is_duplicate {
                    result.duplicates.push(path);
                } else {
                    let conn = db.get_connection()?;
                    conn.execute(
                        "UPDATE books SET domain = 'books' WHERE file_path = ?1",
                        params![path],
                    )?;
                    result.success.push(path);
                }
            }
            Err(e) => {
                result.failed.push((path, e.to_string()));
            }
        }
    }

    Ok(result)
}

pub fn import_single_book(db: &Database, path: &str, covers_dir: &std::path::Path) -> Result<bool> {
    // Extract metadata
    let metadata = metadata_service::extract_from_file(path)?;

    // Calculate file hash
    let file_hash = calculate_file_hash(path)?;

    // Check for duplicates
    let conn = db.get_connection()?;
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM books WHERE file_hash = ?1)",
        params![file_hash],
        |row| row.get(0),
    )?;

    if exists {
        return Ok(true); // Is duplicate
    }

    // Get file extension
    let file_format = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("unknown")
        .to_lowercase();

    // Generate UUID for the book
    let book_uuid = Uuid::new_v4().to_string();

    // Extract cover image (if available)
    let cover_path = metadata_service::extract_cover(path, &book_uuid, covers_dir)
        .ok()
        .flatten();

    // Create book
    let book = Book {
        id: None,
        uuid: book_uuid,
        title: metadata
            .title
            .unwrap_or_else(|| "Unknown Title".to_string()),
        sort_title: None,
        isbn: metadata.isbn,
        isbn13: None,
        publisher: metadata.publisher,
        pubdate: metadata.pubdate,
        series: None,
        series_index: None,
        rating: None,
        file_path: path.to_string(),
        file_format,
        file_size: Some(get_file_size(path)?),
        file_hash: Some(file_hash),
        cover_path,
        page_count: metadata.page_count,
        word_count: None,
        language: metadata.language.unwrap_or_else(|| "eng".to_string()),
        added_date: chrono::Utc::now().to_rfc3339(),
        modified_date: chrono::Utc::now().to_rfc3339(),
        last_opened: None,
        notes: None,
        authors: metadata
            .authors
            .iter()
            .map(|name| Author {
                id: None,
                name: name.clone(),
                sort_name: None,
                link: None,
            })
            .collect(),
        tags: vec![],
        online_metadata_fetched: false,
        metadata_source: None,
        metadata_last_sync: None,
        anilist_id: None,
        is_favorite: false,
        is_wishlist: false,
        in_trash: false,
        deleted_at: None,
        reading_status: "planning".to_string(),
        domain: None,
        metadata_locked: None,
    };

    add_book(db, book)?;
    Ok(false) // Not a duplicate
}

struct PreprocessedBook {
    path: String,
    book: Book,
}

pub fn scan_and_import_folder(
    db: &Database,
    folder_path: &str,
    covers_dir: &std::path::Path,
) -> Result<ImportResult> {
    let mut all_paths = Vec::new();

    for entry in WalkDir::new(folder_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if BOOK_FORMATS.contains(&ext_str.as_str())
                    || MANGA_FORMATS.contains(&ext_str.as_str())
                    || COMICS_FORMATS.contains(&ext_str.as_str())
                {
                    if let Some(path_str) = entry.path().to_str() {
                        all_paths.push((path_str.to_string(), ext_str));
                    }
                }
            }
        }
    }

    log::info!(
        "Found {} supported files in {}",
        all_paths.len(),
        folder_path
    );

    let mut result = ImportResult {
        success: vec![],
        failed: vec![],
        duplicates: vec![],
    };

    if all_paths.is_empty() {
        return Ok(result);
    }

    let preprocessed: Vec<std::result::Result<PreprocessedBook, (String, String)>> = all_paths
        .into_par_iter()
        .map(|(path, ext_str)| {
            let domain = if BOOK_FORMATS.contains(&ext_str.as_str()) {
                "books"
            } else if MANGA_FORMATS.contains(&ext_str.as_str()) {
                "manga"
            } else {
                "comics"
            };

            let file_hash = match calculate_file_hash(&path) {
                Ok(h) => h,
                Err(e) => return Err((path, format!("Hash error: {}", e))),
            };

            let metadata = match metadata_service::extract_from_file(&path) {
                Ok(m) => m,
                Err(_) => crate::models::Metadata {
                    title: None,
                    authors: vec![],
                    publisher: None,
                    pubdate: None,
                    isbn: None,
                    page_count: None,
                    language: None,
                    description: None,
                },
            };

            let book_uuid = Uuid::new_v4().to_string();
            let cover_path = metadata_service::extract_cover(&path, &book_uuid, covers_dir)
                .ok()
                .flatten();
            let file_size = get_file_size(&path).unwrap_or(0);

            let book = Book {
                id: None,
                uuid: book_uuid,
                title: metadata.title.unwrap_or_else(|| {
                    std::path::Path::new(&path)
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string()
                }),
                sort_title: None,
                isbn: metadata.isbn,
                isbn13: None,
                publisher: metadata.publisher,
                pubdate: metadata.pubdate,
                series: None,
                series_index: None,
                rating: None,
                file_path: path.clone(),
                file_format: ext_str,
                file_size: Some(file_size),
                file_hash: Some(file_hash),
                cover_path,
                page_count: metadata.page_count,
                word_count: None,
                language: metadata.language.unwrap_or_else(|| "eng".to_string()),
                added_date: chrono::Utc::now().to_rfc3339(),
                modified_date: chrono::Utc::now().to_rfc3339(),
                last_opened: None,
                notes: None,
                authors: metadata
                    .authors
                    .into_iter()
                    .map(|name| Author {
                        id: None,
                        name,
                        sort_name: None,
                        link: None,
                    })
                    .collect(),
                tags: vec![],
                online_metadata_fetched: false,
                metadata_source: None,
                metadata_last_sync: None,
                anilist_id: None,
                is_favorite: false,
                is_wishlist: false,
                in_trash: false,
                deleted_at: None,
                reading_status: "planning".to_string(),
                domain: Some(domain.to_string()),
                metadata_locked: None,
            };

            Ok(PreprocessedBook { path, book })
        })
        .collect();

    let mut conn = db.get_connection()?;
    let tx = conn.transaction()?;

    for res in preprocessed {
        match res {
            Ok(pre) => {
                let exists: bool = tx
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM books WHERE file_hash = ?1)",
                        rusqlite::params![pre.book.file_hash],
                        |row| row.get(0),
                    )
                    .unwrap_or(false);

                if exists {
                    result.duplicates.push(pre.path);
                } else {
                    let mut book = pre.book;
                    if book.uuid.is_empty() {
                        book.uuid = Uuid::new_v4().to_string();
                    }

                    let insert_res = tx.execute(
                        "INSERT INTO books (uuid, title, sort_title, isbn, isbn13, publisher, pubdate,
                                           series, series_index, rating, file_path, file_format, file_size,
                                           file_hash, cover_path, page_count, word_count, language, notes, reading_status, domain, is_wishlist)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
                        rusqlite::params![
                            book.uuid, book.title, book.sort_title, book.isbn, book.isbn13, book.publisher, book.pubdate,
                            book.series, book.series_index, book.rating, book.file_path, book.file_format, book.file_size,
                            book.file_hash, book.cover_path, book.page_count, book.word_count, book.language, book.notes,
                            book.reading_status, book.domain, book.is_wishlist,
                        ],
                    );

                    match insert_res {
                        Ok(_) => {
                            let book_id = tx.last_insert_rowid();
                            for author in &book.authors {
                                if let Ok(author_id) =
                                    crate::services::library_service::get_or_create_author_tx(
                                        &tx,
                                        &author.name,
                                    )
                                {
                                    let _ = tx.execute(
                                        "INSERT INTO books_authors (book_id, author_id) VALUES (?1, ?2)",
                                        rusqlite::params![book_id, author_id],
                                    );
                                }
                            }
                            result.success.push(book.file_path);
                        }
                        Err(e) => {
                            result.failed.push((book.file_path, e.to_string()));
                        }
                    }
                }
            }
            Err((path, err)) => {
                result.failed.push((path, err));
            }
        }
    }

    tx.commit()?;
    Ok(result)
}

// ═══════════════════════════════════════════════════════════
// DOMAIN-SEPARATED IMPORT (Books vs Manga)
// ═══════════════════════════════════════════════════════════

const BOOK_FORMATS: &[&str] = &["epub", "pdf", "mobi", "azw3", "fb2", "txt", "docx", "html"];
const MANGA_FORMATS: &[&str] = &["cbz", "cbr", "zip"];
const COMICS_FORMATS: &[&str] = &["cbz", "cbr", "zip"];

/// Validate that a file belongs to the expected domain
fn validate_domain(path: &str, domain: &str) -> Result<()> {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match domain {
        "books" => {
            if MANGA_FORMATS.contains(&ext.as_str()) {
                return Err(ShioriError::Other(format!(
                    "This file is a manga archive (.{}). Import it from the Manga tab instead.",
                    ext
                )));
            }
            if !BOOK_FORMATS.contains(&ext.as_str()) {
                return Err(ShioriError::UnsupportedFormat {
                    format: ext.clone(),
                    path: path.to_string(),
                });
            }
        }
        "manga" => {
            if BOOK_FORMATS.contains(&ext.as_str()) {
                return Err(ShioriError::Other(format!(
                    "{} files are eBooks, not manga. Import from the Books tab instead.",
                    ext.to_uppercase()
                )));
            }
            if !MANGA_FORMATS.contains(&ext.as_str()) {
                return Err(ShioriError::UnsupportedFormat {
                    format: ext.clone(),
                    path: path.to_string(),
                });
            }
        }
        "comics" => {
            if BOOK_FORMATS.contains(&ext.as_str()) {
                return Err(ShioriError::Other(format!(
                    "{} files are eBooks, not comics. Import from the Books tab instead.",
                    ext.to_uppercase()
                )));
            }
            if !COMICS_FORMATS.contains(&ext.as_str()) {
                return Err(ShioriError::UnsupportedFormat {
                    format: ext.clone(),
                    path: path.to_string(),
                });
            }
        }
        _ => {}
    }
    Ok(())
}

/// Import manga files (CBZ/CBR only) — rejects non-manga formats
pub fn import_manga(
    db: &Database,
    paths: Vec<String>,
    covers_dir: &std::path::Path,
) -> Result<ImportResult> {
    let mut result = ImportResult {
        success: vec![],
        failed: vec![],
        duplicates: vec![],
    };

    for path in paths {
        if let Err(e) = validate_domain(&path, "manga") {
            result.failed.push((path, e.to_string()));
            continue;
        }

        match import_single_book(db, &path, covers_dir) {
            Ok(is_duplicate) => {
                if is_duplicate {
                    result.duplicates.push(path);
                } else {
                    let conn = db.get_connection()?;
                    conn.execute(
                        "UPDATE books SET domain = 'manga' WHERE file_path = ?1",
                        params![path],
                    )?;
                    result.success.push(path);
                }
            }
            Err(e) => {
                result.failed.push((path, e.to_string()));
            }
        }
    }

    Ok(result)
}

/// Scan a folder for manga files (CBZ/CBR only)
pub fn scan_folder_for_manga(
    db: &Database,
    folder_path: &str,
    covers_dir: &std::path::Path,
) -> Result<ImportResult> {
    let mut manga_paths = Vec::new();

    for entry in WalkDir::new(folder_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if MANGA_FORMATS.contains(&ext_str.as_str()) {
                    if let Some(path_str) = entry.path().to_str() {
                        manga_paths.push(path_str.to_string());
                    }
                }
            }
        }
    }

    log::info!("Found {} manga files in {}", manga_paths.len(), folder_path);
    import_manga(db, manga_paths, covers_dir)
}

pub fn import_comics(
    db: &Database,
    paths: Vec<String>,
    covers_dir: &std::path::Path,
) -> Result<ImportResult> {
    let mut result = ImportResult {
        success: vec![],
        failed: vec![],
        duplicates: vec![],
    };

    for path in paths {
        if let Err(e) = validate_domain(&path, "comics") {
            result.failed.push((path, e.to_string()));
            continue;
        }

        match import_single_book(db, &path, covers_dir) {
            Ok(is_duplicate) => {
                if is_duplicate {
                    result.duplicates.push(path);
                } else {
                    let conn = db.get_connection()?;
                    conn.execute(
                        "UPDATE books SET domain = 'comics' WHERE file_path = ?1",
                        params![path],
                    )?;
                    result.success.push(path);
                }
            }
            Err(e) => {
                result.failed.push((path, e.to_string()));
            }
        }
    }

    Ok(result)
}

pub fn scan_folder_for_comics(
    db: &Database,
    folder_path: &str,
    covers_dir: &std::path::Path,
) -> Result<ImportResult> {
    let mut comics_paths = Vec::new();

    for entry in WalkDir::new(folder_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if COMICS_FORMATS.contains(&ext_str.as_str()) {
                    if let Some(path_str) = entry.path().to_str() {
                        comics_paths.push(path_str.to_string());
                    }
                }
            }
        }
    }

    log::info!(
        "Found {} comics files in {}",
        comics_paths.len(),
        folder_path
    );
    import_comics(db, comics_paths, covers_dir)
}

/// Get books filtered by domain
pub fn get_books_by_domain(
    db: &Database,
    domain: &str,
    limit: u32,
    offset: u32,
) -> Result<Vec<Book>> {
    let conn = db.get_connection()?;

    let where_clause = match domain {
        "books" => "WHERE b.domain = 'books' AND b.in_trash = 0",
        "manga" => "WHERE b.domain = 'manga' AND b.in_trash = 0",
        "comics" => "WHERE b.domain = 'comics' AND b.in_trash = 0",
        _ => "WHERE b.in_trash = 0",
    };

    let sql = format!(
        "SELECT {} FROM books b {} ORDER BY b.added_date DESC LIMIT ?1 OFFSET ?2",
        BOOK_COLUMNS, where_clause
    );

    let mut stmt = conn.prepare(&sql)?;

    let mut books: Vec<Book> = stmt
        .query_map(params![limit, offset], book_from_row)?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    attach_authors_and_tags(&conn, &mut books)?;

    Ok(books)
}

pub fn get_total_books_by_domain(db: &Database, domain: &str) -> Result<i64> {
    let conn = db.get_connection()?;
    let query = match domain {
        "books" => "SELECT COUNT(*) FROM books WHERE domain = 'books' AND in_trash = 0",
        "manga" => "SELECT COUNT(*) FROM books WHERE domain = 'manga' AND in_trash = 0",
        "comics" => "SELECT COUNT(*) FROM books WHERE domain = 'comics' AND in_trash = 0",
        _ => "SELECT COUNT(*) FROM books WHERE in_trash = 0",
    };
    let count: i64 = conn.query_row(query, [], |row| row.get(0))?;
    Ok(count)
}

fn get_authors_for_book(conn: &rusqlite::Connection, book_id: i64) -> Result<Vec<Author>> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.name, a.sort_name, a.link
         FROM authors a
         JOIN books_authors ba ON a.id = ba.author_id
         WHERE ba.book_id = ?1
         ORDER BY ba.author_order",
    )?;

    let authors = stmt
        .query_map(params![book_id], |row| {
            Ok(Author {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                sort_name: row.get(2)?,
                link: row.get(3)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(authors)
}

fn get_tags_for_book(conn: &rusqlite::Connection, book_id: i64) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color
         FROM tags t
         JOIN books_tags bt ON t.id = bt.tag_id
         WHERE bt.book_id = ?1",
    )?;

    let tags = stmt
        .query_map(params![book_id], |row| {
            Ok(Tag {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                color: row.get(2)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(tags)
}

/// Transaction-compatible version (Transaction derefs to Connection)
fn get_or_create_author_tx(tx: &rusqlite::Transaction, name: &str) -> Result<i64> {
    get_or_create_author_impl(tx, name)
}

fn get_or_create_author_impl(conn: &rusqlite::Connection, name: &str) -> Result<i64> {
    // Try to find existing author
    match conn.query_row(
        "SELECT id FROM authors WHERE name = ?1",
        params![name],
        |row| row.get::<_, i64>(0),
    ) {
        Ok(id) => Ok(id),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Create new author
            conn.execute("INSERT INTO authors (name) VALUES (?1)", params![name])?;
            Ok(conn.last_insert_rowid())
        }
        Err(e) => Err(e.into()),
    }
}

pub fn reset_database(db: &Database) -> Result<()> {
    let mut conn = db.get_connection()?;
    let tx = conn.transaction()?;

    // Disable foreign keys temporarily for a cleaner drop
    tx.execute("PRAGMA foreign_keys = OFF", [])?;

    // Tables to reset
    let tables = vec![
        "collections_books",
        "collections",
        "books_authors",
        "books_tags",
        "authors",
        "tags",
        "reading_progress",
        "annotations",
        "rss_articles",
        "rss_feeds",
        "books",
    ];

    for table in tables {
        tx.execute(&format!("DELETE FROM {}", table), [])?;
    }

    // Re-enable foreign keys
    tx.execute("PRAGMA foreign_keys = ON", [])?;

    tx.commit()?;
    log::info!("[reset_database] Database has been reset successfully.");
    Ok(())
}

pub fn update_reading_status(db: &Database, book_id: i64, status: &str) -> Result<()> {
    let valid = ["planning", "reading", "completed", "on_hold", "dropped"];
    if !valid.contains(&status) {
        return Err(ShioriError::Validation(format!(
            "Invalid reading status: {}",
            status
        )));
    }
    let conn = db.get_connection()?;
    conn.execute(
        "UPDATE books SET reading_status = ?1, modified_date = CURRENT_TIMESTAMP WHERE id = ?2",
        params![status, book_id],
    )?;
    Ok(())
}

pub fn get_books_by_reading_status(
    db: &Database,
    status: &str,
    limit: u32,
    offset: u32,
) -> Result<Vec<Book>> {
    let conn = db.get_connection()?;
    let sql = format!(
        "SELECT {} FROM books b WHERE b.reading_status = ?1 ORDER BY b.modified_date DESC LIMIT ?2 OFFSET ?3",
        BOOK_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut books: Vec<Book> = stmt
        .query_map(params![status, limit, offset], book_from_row)?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    attach_authors_and_tags(&conn, &mut books)?;
    Ok(books)
}
const BOOK_SUMMARY_COLUMNS: &str =
    "b.id, b.uuid, b.title, b.sort_title, b.file_path, b.file_format, b.file_size,
     b.cover_path, b.added_date, b.is_favorite, b.reading_status, b.domain, 
     b.manga_series_id, b.series_index, b.is_wishlist, b.in_trash, b.deleted_at";

fn book_summary_from_row(row: &rusqlite::Row) -> rusqlite::Result<crate::models::BookSummary> {
    Ok(crate::models::BookSummary {
        id: Some(row.get(0)?),
        uuid: row.get(1)?,
        title: row.get(2)?,
        sort_title: row.get(3)?,
        file_path: row.get(4)?,
        file_format: row.get(5)?,
        file_size: row.get(6)?,
        cover_path: row.get(7)?,
        added_date: row.get(8)?,
        is_favorite: row.get::<_, i64>(9).unwrap_or(0) != 0,
        reading_status: row.get(10)?,
        domain: row.get(11).ok().flatten(),
        manga_series_id: row.get(12).ok().flatten(),
        series_index: row.get(13)?,
        is_wishlist: row.get::<_, i64>(14).unwrap_or(0) != 0,
        in_trash: row.get::<_, i64>(15).unwrap_or(0) != 0,
        deleted_at: row.get(16).ok().flatten(),
        notes: None,
    })
}

pub fn get_book_summaries(
    db: &Database,
    limit: u32,
    offset: u32,
) -> Result<Vec<crate::models::BookSummary>> {
    let conn = db.get_connection()?;
    let sql = format!(
        "SELECT {} FROM books b ORDER BY b.added_date DESC LIMIT ?1 OFFSET ?2",
        BOOK_SUMMARY_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;
    let summaries: Vec<crate::models::BookSummary> = stmt
        .query_map(rusqlite::params![limit, offset], book_summary_from_row)?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(summaries)
}

pub fn get_book_summaries_by_domain(
    db: &Database,
    domain: &str,
    limit: u32,
    offset: u32,
) -> Result<Vec<crate::models::BookSummary>> {
    let conn = db.get_connection()?;
    let where_clause = match domain {
        "books" => "WHERE b.domain = 'books'",
        "manga" => "WHERE b.domain = 'manga'",
        "comics" => "WHERE b.domain = 'comics'",
        _ => "",
    };
    let sql = format!(
        "SELECT {} FROM books b {} ORDER BY b.added_date DESC LIMIT ?1 OFFSET ?2",
        BOOK_SUMMARY_COLUMNS, where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let summaries: Vec<crate::models::BookSummary> = stmt
        .query_map(rusqlite::params![limit, offset], book_summary_from_row)?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(summaries)
}

pub fn get_library_stats(db: &Database) -> Result<crate::models::LibraryStats> {
    let conn = db.get_connection()?;
    let sql = "SELECT 
        COALESCE(SUM(CASE WHEN domain = 'books' THEN 1 ELSE 0 END), 0) as total_books,
        COALESCE(SUM(CASE WHEN domain IN ('manga', 'comics', 'manga_comics') THEN 1 ELSE 0 END), 0) as total_manga,
        COALESCE(SUM(file_size), 0) as total_size_bytes
    FROM books";

    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([])?;

    if let Some(row) = rows.next()? {
        Ok(crate::models::LibraryStats {
            total_books: row.get(0)?,
            total_manga: row.get(1)?,
            total_size_bytes: row.get(2)?,
        })
    } else {
        Ok(crate::models::LibraryStats {
            total_books: 0,
            total_manga: 0,
            total_size_bytes: 0,
        })
    }
}

pub fn get_thumbnail_path(
    db: &Database,
    book_id: i64,
    covers_dir: &std::path::Path,
) -> Result<Option<String>> {
    let conn = db.get_connection()?;
    let cover_path: Option<String> = conn.query_row(
        "SELECT cover_path FROM books WHERE id = ?1",
        [book_id],
        |row| row.get(0),
    )?;

    let cover_path_str = match cover_path {
        Some(p) => p,
        None => return Ok(None),
    };

    let original_path = std::path::Path::new(&cover_path_str);
    if !original_path.exists() {
        return Ok(None);
    }

    let thumb_dir = covers_dir.join("thumbnails");
    if !thumb_dir.exists() {
        std::fs::create_dir_all(&thumb_dir).ok();
    }

    let thumb_path = thumb_dir.join(format!("{}.jpg", book_id));

    if thumb_path.exists() {
        return Ok(Some(thumb_path.to_string_lossy().to_string()));
    }

    // Generate thumbnail
    if let Ok(img) = image::open(&original_path) {
        let thumb = img.thumbnail(200, 300);
        if thumb.save(&thumb_path).is_ok() {
            return Ok(Some(thumb_path.to_string_lossy().to_string()));
        }
    }

    // Fallback to original
    Ok(Some(cover_path_str))
}

pub fn get_recommended_books(db: &Database, limit: u32) -> Result<Vec<crate::models::BookSummary>> {
    let conn = db.get_connection()?;
    let sql = format!(
        "
        SELECT DISTINCT {} FROM books b 
        JOIN books_authors ba ON b.id = ba.book_id
        WHERE b.id NOT IN (SELECT id FROM books WHERE reading_status IN ('completed', 'favorite'))
        AND ba.author_id IN (
            SELECT ba2.author_id FROM books b2 
            JOIN books_authors ba2 ON b2.id = ba2.book_id
            WHERE b2.reading_status IN ('completed', 'favorite')
        )
        ORDER BY RANDOM() LIMIT ?1
    ",
        BOOK_SUMMARY_COLUMNS
    );

    let mut stmt = conn.prepare(&sql)?;
    let books = stmt
        .query_map([limit], book_summary_from_row)?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    // Fallback if no recommendations found via author
    if books.is_empty() {
        let fallback_sql = format!(
            "
            SELECT {} FROM books b 
            WHERE b.reading_status != 'completed'
            ORDER BY RANDOM() LIMIT ?1
        ",
            BOOK_SUMMARY_COLUMNS
        );
        let mut fallback_stmt = conn.prepare(&fallback_sql)?;
        let fallback_books = fallback_stmt
            .query_map([limit], book_summary_from_row)?
            .filter_map(|r| r.ok())
            .collect::<Vec<_>>();
        return Ok(fallback_books);
    }

    Ok(books)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn setup_test_db() -> (Database, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test_lib.db");
        let db = Database::new(&db_path).unwrap();
        (db, dir)
    }

    fn create_test_book() -> Book {
        Book {
            id: None,
            uuid: Uuid::new_v4().to_string(),
            title: "Test Book".to_string(),
            sort_title: None,
            authors: vec![
                Author { id: None, name: "Author 1".to_string(), sort_name: None, link: None },
                Author { id: None, name: "Author 2".to_string(), sort_name: None, link: None },
            ],
            isbn: Some("1234567890".to_string()),
            isbn13: None,
            publisher: Some("Test Publisher".to_string()),
            pubdate: Some("2023-01-01".to_string()),
            series: Some("Test Series".to_string()),
            series_index: Some(1.0),
            rating: Some(4),
            tags: vec![
                Tag { id: None, name: "Fiction".to_string(), color: None },
                Tag { id: None, name: "Sci-Fi".to_string(), color: None },
            ],
            file_path: "/dummy/path/test.epub".to_string(),
            file_format: "epub".to_string(),
            file_size: Some(1024),
            file_hash: Some("dummyhash".to_string()),
            cover_path: None,
            page_count: Some(300),
            word_count: None,
            language: "en".to_string(),
            added_date: "2023-10-01T12:00:00Z".to_string(),
            modified_date: "2023-10-01T12:00:00Z".to_string(),
            last_opened: None,
            notes: None,
            online_metadata_fetched: false,
            metadata_source: None,
            metadata_last_sync: None,
            anilist_id: None,
            is_favorite: false,
            reading_status: "Unread".to_string(),
            domain: Some("books".to_string()),
            metadata_locked: None,
            is_wishlist: false,
            in_trash: false,
            deleted_at: None,
        }
    }

    #[test]
    fn test_add_and_get_book() {
        let (db, _dir) = setup_test_db();
        let book = create_test_book();
        
        let id = add_book(&db, book.clone()).expect("Failed to add book");
        assert!(id > 0);

        let fetched_book = get_book_by_id(&db, id).expect("Failed to get book");
        assert_eq!(fetched_book.title, book.title);
        assert_eq!(fetched_book.authors.len(), book.authors.len());
        assert_eq!(fetched_book.authors[0].name, book.authors[0].name);
    }

    #[test]
    fn test_update_book() {
        let (db, _dir) = setup_test_db();
        let book = create_test_book();
        let id = add_book(&db, book).unwrap();

        let mut fetched_book = get_book_by_id(&db, id).unwrap();
        fetched_book.title = "Updated Title".to_string();
        fetched_book.authors.push(Author { id: None, name: "Author 3".to_string(), sort_name: None, link: None });
        
        update_book(&db, fetched_book.clone()).expect("Failed to update book");
        
        let updated_book = get_book_by_id(&db, id).unwrap();
        assert_eq!(updated_book.title, "Updated Title");
        assert_eq!(updated_book.authors.len(), 3);
    }

    #[test]
    fn test_delete_and_restore_book() {
        let (db, _dir) = setup_test_db();
        let book = create_test_book();
        let id = add_book(&db, book).unwrap();

        // Move to trash
        delete_book(&db, id).expect("Failed to delete book");
        
        let deleted_book = get_book_by_id(&db, id).unwrap();
        assert!(deleted_book.in_trash);
        assert!(deleted_book.deleted_at.is_some());

        // Restore
        restore_book(&db, id).expect("Failed to restore book");
        let restored_book = get_book_by_id(&db, id).unwrap();
        assert!(!restored_book.in_trash);
        assert!(restored_book.deleted_at.is_none());
    }

    #[test]
    fn test_get_total_books() {
        let (db, _dir) = setup_test_db();
        
        assert_eq!(get_total_books(&db).unwrap(), 0);
        
        let book1 = create_test_book();
        let mut book2 = create_test_book();
        book2.uuid = Uuid::new_v4().to_string();
        book2.file_path = "/dummy/path/test2.epub".to_string();
        book2.file_hash = Some("dummyhash2".to_string());

        add_book(&db, book1).unwrap();
        add_book(&db, book2).unwrap();
        
        assert_eq!(get_total_books(&db).unwrap(), 2);
    }
}
