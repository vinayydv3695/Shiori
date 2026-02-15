use crate::db::Database;
use crate::error::{Result, ShioriError};
use crate::models::{Book, Author, Tag, ImportResult};
use crate::services::metadata_service;
use crate::utils::file::{calculate_file_hash, get_file_size};
use rusqlite::params;
use uuid::Uuid;

pub fn get_all_books(db: &Database) -> Result<Vec<Book>> {
    let conn = db.get_connection();
    
    let mut stmt = conn.prepare(
        "SELECT id, uuid, title, sort_title, isbn, isbn13, publisher, pubdate, 
                series, series_index, rating, file_path, file_format, file_size, 
                file_hash, cover_path, page_count, word_count, language, 
                added_date, modified_date, last_opened, notes
         FROM books
         ORDER BY added_date DESC"
    )?;

    let books_iter = stmt.query_map([], |row| {
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
            authors: vec![],
            tags: vec![],
        })
    })?;

    let mut books = Vec::new();
    for book_result in books_iter {
        let mut book = book_result?;
        book.authors = get_authors_for_book(conn, book.id.unwrap())?;
        book.tags = get_tags_for_book(conn, book.id.unwrap())?;
        books.push(book);
    }

    Ok(books)
}

pub fn get_book_by_id(db: &Database, id: i64) -> Result<Book> {
    let conn = db.get_connection();
    
    let mut book: Book = conn.query_row(
        "SELECT id, uuid, title, sort_title, isbn, isbn13, publisher, pubdate, 
                series, series_index, rating, file_path, file_format, file_size, 
                file_hash, cover_path, page_count, word_count, language, 
                added_date, modified_date, last_opened, notes
         FROM books WHERE id = ?1",
        params![id],
        |row| {
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
                authors: vec![],
                tags: vec![],
            })
        },
    ).map_err(|_| ShioriError::BookNotFound(id.to_string()))?;

    book.authors = get_authors_for_book(conn, id)?;
    book.tags = get_tags_for_book(conn, id)?;

    Ok(book)
}

pub fn add_book(db: &Database, mut book: Book) -> Result<i64> {
    let conn = db.get_connection();
    
    // Generate UUID if not provided
    if book.uuid.is_empty() {
        book.uuid = Uuid::new_v4().to_string();
    }

    // Check for duplicates by file hash
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

    // Insert book
    conn.execute(
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

    let book_id = conn.last_insert_rowid();

    // Add authors
    for author in &book.authors {
        let author_id = get_or_create_author(conn, &author.name)?;
        conn.execute(
            "INSERT INTO books_authors (book_id, author_id) VALUES (?1, ?2)",
            params![book_id, author_id],
        )?;
    }

    // Add tags
    for tag in &book.tags {
        if let Some(tag_id) = tag.id {
            conn.execute(
                "INSERT INTO books_tags (book_id, tag_id) VALUES (?1, ?2)",
                params![book_id, tag_id],
            )?;
        }
    }

    Ok(book_id)
}

pub fn update_book(db: &Database, book: Book) -> Result<()> {
    let conn = db.get_connection();
    
    let book_id = book.id.ok_or(ShioriError::Other("Book ID required for update".to_string()))?;

    conn.execute(
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
    conn.execute("DELETE FROM books_authors WHERE book_id = ?1", params![book_id])?;
    for author in &book.authors {
        let author_id = get_or_create_author(conn, &author.name)?;
        conn.execute(
            "INSERT INTO books_authors (book_id, author_id) VALUES (?1, ?2)",
            params![book_id, author_id],
        )?;
    }

    // Update tags
    conn.execute("DELETE FROM books_tags WHERE book_id = ?1", params![book_id])?;
    for tag in &book.tags {
        if let Some(tag_id) = tag.id {
            conn.execute(
                "INSERT INTO books_tags (book_id, tag_id) VALUES (?1, ?2)",
                params![book_id, tag_id],
            )?;
        }
    }

    Ok(())
}

pub fn delete_book(db: &Database, id: i64) -> Result<()> {
    let conn = db.get_connection();
    
    let rows_affected = conn.execute("DELETE FROM books WHERE id = ?1", params![id])?;
    
    if rows_affected == 0 {
        return Err(ShioriError::BookNotFound(id.to_string()));
    }

    Ok(())
}

pub async fn import_books(db: &Database, paths: Vec<String>) -> Result<ImportResult> {
    let mut result = ImportResult {
        success: vec![],
        failed: vec![],
        duplicates: vec![],
    };

    for path in paths {
        match import_single_book(db, &path).await {
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

async fn import_single_book(db: &Database, path: &str) -> Result<bool> {
    // Extract metadata
    let metadata = metadata_service::extract_from_file(path)?;
    
    // Calculate file hash
    let file_hash = calculate_file_hash(path)?;
    
    // Check for duplicates
    let conn = db.get_connection();
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

    // Create book
    let book = Book {
        id: None,
        uuid: Uuid::new_v4().to_string(),
        title: metadata.title.unwrap_or_else(|| "Unknown Title".to_string()),
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
        cover_path: None,
        page_count: metadata.page_count,
        word_count: None,
        language: metadata.language.unwrap_or_else(|| "eng".to_string()),
        added_date: chrono::Utc::now().to_rfc3339(),
        modified_date: chrono::Utc::now().to_rfc3339(),
        last_opened: None,
        notes: None,
        authors: metadata.authors.iter().map(|name| Author {
            id: None,
            name: name.clone(),
            sort_name: None,
            link: None,
        }).collect(),
        tags: vec![],
    };

    add_book(db, book)?;
    Ok(false) // Not a duplicate
}

fn get_authors_for_book(conn: &rusqlite::Connection, book_id: i64) -> Result<Vec<Author>> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.name, a.sort_name, a.link
         FROM authors a
         JOIN books_authors ba ON a.id = ba.author_id
         WHERE ba.book_id = ?1
         ORDER BY ba.author_order"
    )?;

    let authors = stmt.query_map(params![book_id], |row| {
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
         WHERE bt.book_id = ?1"
    )?;

    let tags = stmt.query_map(params![book_id], |row| {
        Ok(Tag {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            color: row.get(2)?,
        })
    })?
    .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(tags)
}

fn get_or_create_author(conn: &rusqlite::Connection, name: &str) -> Result<i64> {
    // Try to find existing author
    match conn.query_row(
        "SELECT id FROM authors WHERE name = ?1",
        params![name],
        |row| row.get::<_, i64>(0),
    ) {
        Ok(id) => Ok(id),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Create new author
            conn.execute(
                "INSERT INTO authors (name) VALUES (?1)",
                params![name],
            )?;
            Ok(conn.last_insert_rowid())
        }
        Err(e) => Err(e.into()),
    }
}
