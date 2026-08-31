//! Tests for chunk-safe hydration in library_service:
//! - `get_books_by_ids` hydrates authors/tags per 500-id chunk (K3-002)
//! - `get_books_by_paths` is batched instead of N+1, preserving input order (K3-023)
//!
//! Uses a temp-dir Database per test, following tests/ingest.rs conventions.

use shiori::{db::Database, services::library_service};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

fn create_temp_db(label: &str) -> (Database, PathBuf) {
    let temp_dir =
        std::env::temp_dir().join(format!("shiori_hydration_{}_{}", std::process::id(), label));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let db_path = temp_dir.join("test.db");
    let db = Database::new(&db_path).unwrap();
    (db, temp_dir)
}

/// Insert a book row directly (fast bulk setup). Returns the new id.
fn insert_book(conn: &rusqlite::Connection, file_path: &str, title: &str, domain: &str) -> i64 {
    conn.execute(
        "INSERT INTO books (uuid, title, file_path, file_format, language,
                            added_date, modified_date, reading_status, domain)
         VALUES (?1, ?2, ?3, ?4, 'en', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'Unread', ?5)",
        rusqlite::params![
            format!("uuid-{}", file_path),
            title,
            file_path,
            "epub",
            domain
        ],
    )
    .unwrap();
    conn.last_insert_rowid()
}

/// Attach one author + one tag to a book (author/tag IDs get reused).
fn attach_author_and_tag(conn: &rusqlite::Connection, book_id: i64, ix: i64) {
    conn.execute(
        "INSERT OR IGNORE INTO authors (name) VALUES (?1)",
        rusqlite::params![format!("Author {ix}")],
    )
    .unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO tags (name) VALUES (?1)",
        rusqlite::params![format!("Tag {ix}")],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO books_authors (book_id, author_id, author_order)
         SELECT ?1, id, 0 FROM authors WHERE name = ?2",
        rusqlite::params![book_id, format!("Author {ix}")],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO books_tags (book_id, tag_id)
         SELECT ?1, id FROM tags WHERE name = ?2",
        rusqlite::params![book_id, format!("Tag {ix}")],
    )
    .unwrap();
}

#[test]
fn test_get_books_by_ids_1200_ordered_with_hydration() {
    let (db, _dir) = create_temp_db("ids1200");
    let conn = db.get_connection().unwrap();

    // Insert 1200 books, each with a unique author + tag.
    let mut ids = Vec::with_capacity(1200);
    for i in 0..1200 {
        let id = insert_book(
            &conn,
            &format!("/books/{i}.epub"),
            &format!("Title {i}"),
            "books",
        );
        attach_author_and_tag(&conn, id, i);
        ids.push(id);
    }

    // Ask for the ids in a deliberately scrambled order (chunk-boundary stress).
    let mut requested: Vec<i64> = (0..1200usize).map(|i| ids[(i * 7) % 1200]).collect();
    requested.extend((0..1200usize).map(|i| ids[(i * 7 + 3) % 1200]));

    let books = library_service::get_books_by_ids(&db, &requested).unwrap();

    assert_eq!(books.len(), requested.len(), "all requested ids returned");
    let unique: HashSet<i64> = books.iter().filter_map(|b| b.id).collect();
    assert_eq!(unique.len(), 1200, "no duplicate books");
    for (book, want_id) in books.iter().zip(requested.iter()) {
        assert_eq!(book.id, Some(*want_id), "order preserved per input chunk");
        assert_eq!(
            book.authors.len(),
            1,
            "authors hydrated for id {:?}",
            book.id
        );
        assert_eq!(book.tags.len(), 1, "tags hydrated for id {:?}", book.id);
    }
}

#[test]
fn test_get_books_by_ids_under_500_unchanged() {
    let (db, _dir) = create_temp_db("idsUnder500");
    let conn = db.get_connection().unwrap();

    let mut ids = Vec::new();
    for i in 0..40 {
        let id = insert_book(
            &conn,
            &format!("/books/{i}.epub"),
            &format!("Title {i}"),
            "books",
        );
        attach_author_and_tag(&conn, id, i);
        ids.push(id);
    }

    let books = library_service::get_books_by_ids(&db, &ids).unwrap();
    assert_eq!(books.len(), 40);
    for (book, want_id) in books.iter().zip(ids.iter()) {
        assert_eq!(book.id, Some(*want_id));
        assert_eq!(book.authors.len(), 1);
        assert_eq!(book.tags.len(), 1);
    }
}

#[test]
fn test_get_books_by_paths_300_input_order_with_hydration() {
    let (db, _dir) = create_temp_db("paths300");
    let conn = db.get_connection().unwrap();

    // 300 books: 299 plain + 1 manga_comics behind a manga_series entry.
    let mut inserted_paths = Vec::with_capacity(300);
    let mut manga_book_id = 0;
    for i in 0..300 {
        let path = format!("/lib/{i}.epub");
        let domain = if i == 299 { "manga_comics" } else { "books" };
        let id = insert_book(&conn, &path, &format!("Title {i}"), domain);
        attach_author_and_tag(&conn, id, i);
        if i == 299 {
            manga_book_id = id;
        }
        inserted_paths.push(path);
    }
    conn.execute(
        "INSERT INTO manga_series (title, status) VALUES ('Saga X', 'ongoing')",
        [],
    )
    .unwrap();
    let series_id: i64 = conn
        .query_row(
            "SELECT id FROM manga_series WHERE title = 'Saga X'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    conn.execute(
        "UPDATE books SET manga_series_id = ?1 WHERE id = ?2",
        rusqlite::params![series_id, manga_book_id],
    )
    .unwrap();

    // Scramble input order and sprinkle three missing paths.
    let mut missing: Vec<String> = (0..3).map(|i| format!("/lib/missing_{i}.epub")).collect();
    let mut requested: Vec<String> = (0..300usize)
        .map(|i| inserted_paths[(i * 13) % 300].clone())
        .collect();
    requested.extend(missing.drain(..));

    let books = library_service::get_books_by_paths(&db, requested.clone()).unwrap();

    assert_eq!(books.len(), 300, "missing paths are skipped");
    for (book, path) in books.iter().zip(requested.iter()) {
        assert_eq!(&book.file_path, path, "input path order preserved");
        assert_eq!(book.authors.len(), 1, "authors hydrated for {path}");
        assert_eq!(book.tags.len(), 1, "tags hydrated for {path}");
    }

    // Manga book (last requested path that exists) got its series backfill.
    let manga = books
        .iter()
        .find(|b| b.file_path == "/lib/299.epub")
        .expect("manga book present");
    assert_eq!(manga.domain.as_deref(), Some("manga_comics"));
    assert_eq!(
        manga.series.as_deref(),
        Some("Saga X"),
        "manga_series title hydrated"
    );
}

#[test]
fn test_get_books_by_paths_empty_ok() {
    let (db, _dir) = create_temp_db("pathsEmpty");
    let books = library_service::get_books_by_paths(&db, Vec::new()).unwrap();
    assert!(books.is_empty());
}
