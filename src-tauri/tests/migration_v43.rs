//! Migration v43: tombstoned deletion + managed books foundation.
//!
//! Covers: (a) fresh DB schema version and new columns/table, (b) book
//! round-trip of the managed fields via add_book/get_book, (c) deleted_books
//! insert + select.

use shiori::db::Database;
use shiori::models::Book;
use shiori::services::library_service::{add_book, get_book_by_id};

use std::fs;

fn create_temp_db(name: &str) -> (Database, std::path::PathBuf) {
    let temp_dir = std::env::temp_dir().join(format!(
        "shiori_migration_v43_{}_{}",
        name,
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let db_path = temp_dir.join("test.db");
    let db = Database::new(&db_path).unwrap();
    (db, temp_dir)
}

#[test]
fn fresh_db_has_v43_schema() {
    let (db, _temp_dir) = create_temp_db("fresh_schema");
    let conn = db.get_connection().unwrap();

    // (a) schema version == 43 (schema_migrations is the source of truth for
    // v31+; PRAGMA user_version is stuck at 30 by a pre-existing quirk).
    let version: i32 = conn
        .query_row(
            "SELECT MAX(version) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(version, 43, "schema_migrations max version should be 43");

    // deleted_books table exists
    let tbl_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='deleted_books'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(tbl_count, 1, "deleted_books table should exist");

    // books has the 3 new columns
    let mut stmt = conn.prepare("PRAGMA table_info(books)").unwrap();
    let mut cols: Vec<String> = Vec::new();
    let mut rows = stmt.query([]).unwrap();
    while let Some(row) = rows.next().unwrap() {
        cols.push(row.get::<_, String>(1).unwrap());
    }
    for col in ["is_managed", "origin", "managed_relpath"] {
        assert!(cols.iter().any(|c| c == col), "books missing column {}", col);
    }

    // ... with defaults (is_managed=0, origin NULL, managed_relpath NULL)
    conn.execute(
        "INSERT INTO books (uuid, title, file_path, file_format)
         VALUES ('v43-defaults', 'Defaults', '/tmp/defaults.epub', 'epub')",
        [],
    )
    .unwrap();
    let (is_managed, origin, managed_relpath): (i64, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT is_managed, origin, managed_relpath FROM books WHERE uuid = 'v43-defaults'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(is_managed, 0, "is_managed default should be 0");
    assert_eq!(origin, None, "origin default should be NULL");
    assert_eq!(managed_relpath, None, "managed_relpath default should be NULL");
}

#[test]
fn managed_fields_round_trip_through_add_and_get() {
    let (db, _temp_dir) = create_temp_db("roundtrip");

    let book = Book {
        id: None,
        uuid: "v43-roundtrip".to_string(),
        title: "Round Trip".to_string(),
        sort_title: None,
        isbn: None,
        isbn13: None,
        publisher: None,
        pubdate: None,
        series: None,
        series_index: None,
        rating: None,
        file_path: "/tmp/open_with/x.epub".to_string(),
        file_format: "epub".to_string(),
        file_size: Some(1024),
        file_hash: Some("roundtrip-hash".to_string()),
        cover_path: None,
        page_count: None,
        word_count: None,
        language: "eng".to_string(),
        added_date: "2024-01-01T00:00:00Z".to_string(),
        modified_date: "2024-01-01T00:00:00Z".to_string(),
        last_opened: None,
        notes: None,
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
        is_managed: true,
        origin: Some("open_with".to_string()),
        managed_relpath: Some("x.epub".to_string()),
        authors: vec![],
        tags: vec![],
    };

    let id = add_book(&db, book.clone()).expect("add_book failed");
    let fetched = get_book_by_id(&db, id).expect("get_book_by_id failed");

    assert_eq!(fetched.is_managed, true, "is_managed should round-trip");
    assert_eq!(
        fetched.origin.as_deref(),
        Some("open_with"),
        "origin should round-trip"
    );
    assert_eq!(
        fetched.managed_relpath.as_deref(),
        Some("x.epub"),
        "managed_relpath should round-trip"
    );
}

#[test]
fn deleted_books_accepts_insert_and_select() {
    let (db, _temp_dir) = create_temp_db("deleted_books");
    let conn = db.get_connection().unwrap();

    conn.execute(
        "INSERT INTO deleted_books (file_hash, file_path, reason) VALUES (?1, ?2, ?3)",
        ["hash-123", "/tmp/gone.epub", "user_delete"],
    )
    .unwrap();

    let (id, file_hash, file_path, reason, deleted_at): (
        i64,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
    ) = conn
        .query_row(
            "SELECT id, file_hash, file_path, reason, deleted_at FROM deleted_books",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .unwrap();

    assert!(id > 0, "deleted_books id should be assigned");
    assert_eq!(file_hash.as_deref(), Some("hash-123"));
    assert_eq!(file_path.as_deref(), Some("/tmp/gone.epub"));
    assert_eq!(reason.as_deref(), Some("user_delete"));
    assert!(!deleted_at.is_empty(), "deleted_at should default to a timestamp");
}
