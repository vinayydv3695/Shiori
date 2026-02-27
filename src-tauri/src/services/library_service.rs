use crate::db::Database;
use crate::error::{Result, ShioriError};
use crate::models::{Author, Book, ImportResult, Tag};
use crate::services::metadata_service;
use crate::utils::file::{calculate_file_hash, get_file_size};
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
     b.online_metadata_fetched, b.metadata_source, b.metadata_last_sync, b.anilist_id";

/// Map a single row (using the BOOK_COLUMNS order) into a Book with empty authors/tags.
fn book_from_row(row: &rusqlite::Row) -> rusqlite::Result<Book> {
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
        "SELECT {} FROM books b ORDER BY b.added_date DESC LIMIT ?1 OFFSET ?2",
        BOOK_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;

    let mut books: Vec<Book> = stmt
        .query_map(params![limit, offset], book_from_row)?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    attach_authors_and_tags(&conn, &mut books)?;

    Ok(books)
}

pub fn get_total_books(db: &Database) -> Result<i64> {
    let conn = db.get_connection()?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM books", [], |row| row.get(0))?;
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
                           file_hash, cover_path, page_count, word_count, language, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
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

    // Use a transaction so book + authors + tags are updated atomically
    let tx = conn.transaction()?;

    tx.execute(
        "UPDATE books SET 
            title = ?1, sort_title = ?2, isbn = ?3, isbn13 = ?4, publisher = ?5,
            pubdate = ?6, series = ?7, series_index = ?8, rating = ?9, language = ?10,
            notes = ?11, modified_date = CURRENT_TIMESTAMP
         WHERE id = ?12",
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
            book_id,
        ],
    )?;

    // Update authors
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

    // Update tags
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

    let rows_affected = conn.execute("DELETE FROM books WHERE id = ?1", params![id])?;
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
    let tx = conn.transaction()?;

    let mut deleted_count = 0;
    for id in ids {
        let rows = tx.execute("DELETE FROM books WHERE id = ?1", params![id])?;
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

pub fn import_books(db: &Database, paths: Vec<String>) -> Result<ImportResult> {
    let mut result = ImportResult {
        success: vec![],
        failed: vec![],
        duplicates: vec![],
    };

    for path in paths {
        match import_single_book(db, &path) {
            Ok(is_duplicate) => {
                if is_duplicate {
                    result.duplicates.push(path);
                } else {
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

fn import_single_book(db: &Database, path: &str) -> Result<bool> {
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
    let cover_path = metadata_service::extract_cover(path, &book_uuid)
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
    };

    add_book(db, book)?;
    Ok(false) // Not a duplicate
}

pub fn scan_and_import_folder(db: &Database, folder_path: &str) -> Result<ImportResult> {
    let supported_formats = vec!["epub", "pdf", "mobi", "azw3", "txt", "fb2", "djvu"];
    let mut book_paths = Vec::new();

    // Recursively scan folder for book files
    for entry in WalkDir::new(folder_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if supported_formats.contains(&ext_str.as_str()) {
                    if let Some(path_str) = entry.path().to_str() {
                        book_paths.push(path_str.to_string());
                    }
                }
            }
        }
    }

    log::info!("Found {} book files in {}", book_paths.len(), folder_path);

    // Import all found books
    import_books(db, book_paths)
}

// ═══════════════════════════════════════════════════════════
// DOMAIN-SEPARATED IMPORT (Books vs Manga)
// ═══════════════════════════════════════════════════════════

const BOOK_FORMATS: &[&str] = &["epub", "pdf", "mobi", "azw3", "fb2", "txt", "docx", "html"];
const MANGA_FORMATS: &[&str] = &["cbz", "cbr"];

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
        _ => {}
    }
    Ok(())
}

/// Import manga files (CBZ/CBR only) — rejects non-manga formats
pub fn import_manga(db: &Database, paths: Vec<String>) -> Result<ImportResult> {
    let mut result = ImportResult {
        success: vec![],
        failed: vec![],
        duplicates: vec![],
    };

    for path in paths {
        // Validate domain first
        if let Err(e) = validate_domain(&path, "manga") {
            result.failed.push((path, e.to_string()));
            continue;
        }

        match import_single_book(db, &path) {
            Ok(is_duplicate) => {
                if is_duplicate {
                    result.duplicates.push(path);
                } else {
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
pub fn scan_folder_for_manga(db: &Database, folder_path: &str) -> Result<ImportResult> {
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
    import_manga(db, manga_paths)
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
        "books" => "WHERE b.file_format NOT IN ('cbz', 'cbr')",
        "manga" => "WHERE b.file_format IN ('cbz', 'cbr')",
        _ => "",
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
        "books" => "SELECT COUNT(*) FROM books WHERE file_format NOT IN ('cbz', 'cbr')",
        "manga" => "SELECT COUNT(*) FROM books WHERE file_format IN ('cbz', 'cbr')",
        _ => "SELECT COUNT(*) FROM books",
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
