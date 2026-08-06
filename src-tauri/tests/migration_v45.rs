//! Migration v45: query-layer indexes, file_format normalization, and the
//! FTS write-amplification fix (books_au WHEN clause + junction reindex
//! triggers).
//!
//! Covers: (a) fresh DB gets the four new indexes, (b) a pre-v45 DB upgrade
//! lowercases stored file_formats, (c) the books_au trigger no longer churns
//! books_fts on reading_status/last_opened updates but still reindexes on
//! title changes, (d) author/tag junction edits reindex the affected book.

use shiori::db::Database;
use shiori::models::{Book, SearchQuery};
use shiori::services::library_service::{add_book, get_books_by_domain};
use shiori::services::search_service::search;

use std::fs;

fn create_temp_db(name: &str) -> (Database, std::path::PathBuf) {
    let temp_dir = std::env::temp_dir().join(format!(
        "shiori_migration_v45_{}_{}",
        name,
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let db_path = temp_dir.join("test.db");
    let db = Database::new(&db_path).unwrap();
    (db, temp_dir)
}

fn test_book(uuid: &str, title: &str, format: &str) -> Book {
    Book {
        id: None,
        uuid: uuid.to_string(),
        title: title.to_string(),
        sort_title: None,
        isbn: None,
        isbn13: None,
        publisher: Some("Publisher".to_string()),
        pubdate: None,
        series: None,
        series_index: None,
        rating: None,
        file_path: format!("/tmp/{}.{}", uuid, format),
        file_format: format.to_string(),
        file_size: Some(1024),
        file_hash: Some(format!("hash-{}", uuid)),
        cover_path: None,
        page_count: None,
        word_count: None,
        language: "eng".to_string(),
        added_date: "2024-01-01T00:00:00Z".to_string(),
        modified_date: "2024-01-01T00:00:00Z".to_string(),
        last_opened: None,
        notes: Some("Some notes".to_string()),
        online_metadata_fetched: false,
        metadata_source: None,
        metadata_last_sync: None,
        anilist_id: None,
        is_favorite: false,
        is_wishlist: false,
        in_trash: false,
        deleted_at: None,
        reading_status: "planning".to_string(),
        domain: Some("books".to_string()),
        metadata_locked: None,
        is_managed: false,
        origin: None,
        managed_relpath: None,
        authors: vec![],
        tags: vec![],
    }
}

fn index_exists(conn: &rusqlite::Connection, table: &str, index: &str) -> bool {
    let mut stmt = conn
        .prepare(&format!("PRAGMA index_list({})", table))
        .unwrap();
    let names: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .collect::<std::result::Result<_, _>>()
        .unwrap();
    names.iter().any(|n| n == index)
}

/// (a) Fresh DB: all four v45 indexes exist, and v30's redundant
/// idx_books_domain (same columns as idx_books_domain_added) is gone.
#[test]
fn fresh_db_has_v45_indexes() {
    let (db, _temp_dir) = create_temp_db("fresh_indexes");
    let conn = db.get_connection().unwrap();

    for (table, index) in [
        ("books", "idx_books_domain_added"),
        ("books", "idx_books_reading_status_modified"),
        ("books", "idx_books_in_trash"),
        ("reading_progress", "idx_reading_progress_last_read"),
    ] {
        assert!(index_exists(&conn, table, index), "missing index {}", index);
    }
    assert!(
        !index_exists(&conn, "books", "idx_books_domain"),
        "v45 must drop v30's redundant idx_books_domain"
    );
}

/// (e) Domain-filtered listing still returns the correct rows after the
/// v30 index is dropped — idx_books_domain_added's leftmost prefix serves
/// the domain-only filter.
#[test]
fn domain_listing_works_without_old_index() {
    let (db, _temp_dir) = create_temp_db("domain_listing");

    let mut book = test_book("dom-1", "Domain Book", "epub");
    book.domain = Some("books".to_string());
    let books_id = add_book(&db, book).unwrap();

    let mut manga = test_book("dom-2", "Manga Book", "cbz");
    manga.domain = Some("manga".to_string());
    let manga_id = add_book(&db, manga).unwrap();

    // add_book's INSERT doesn't write domain (scan paths derive it); set it
    // directly so the domain filter is exercised.
    let conn = db.get_connection().unwrap();
    conn.execute(
        "UPDATE books SET domain = 'books' WHERE id = ?1",
        [books_id],
    )
    .unwrap();
    conn.execute(
        "UPDATE books SET domain = 'manga' WHERE id = ?1",
        [manga_id],
    )
    .unwrap();

    let books = get_books_by_domain(&db, "books", 10, 0).unwrap();
    assert_eq!(books.len(), 1);
    assert_eq!(books[0].id.unwrap(), books_id);
    assert_eq!(get_books_by_domain(&db, "manga", 10, 0).unwrap().len(), 1);
}

/// (f) Upgrade path: a pre-v45 DB carrying v30's idx_books_domain loses it
/// when v45 runs (DROP ... IF EXISTS — idempotent).
#[test]
fn v45_upgrade_drops_existing_domain_index() {
    let (db, temp_dir) = create_temp_db("upgrade_drop_index");
    {
        let conn = db.get_connection().unwrap();
        conn.pragma_update(None, "user_version", 44).unwrap();
        // Recreate what v30 left behind on a real pre-v45 DB.
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_books_domain ON books(domain, added_date DESC);",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO books (uuid, title, file_path, file_format, domain)
             VALUES ('dom-up-1', 'Upgrade', '/tmp/u.epub', 'epub', 'books')",
            [],
        )
        .unwrap();
    }

    let reopened = Database::new(temp_dir.join("test.db")).unwrap();
    let conn = reopened.get_connection().unwrap();
    assert!(index_exists(&conn, "books", "idx_books_domain_added"));
    assert!(
        !index_exists(&conn, "books", "idx_books_domain"),
        "v45 must drop the pre-existing v30 index"
    );
    let books = get_books_by_domain(&reopened, "books", 10, 0).unwrap();
    assert_eq!(books.len(), 1);
    assert_eq!(books[0].uuid, "dom-up-1");
}

/// (g) add_book normalizes an uppercase file_format to lowercase so the
/// search format filter (lowercase compare, no LOWER()) can find the book.
#[test]
fn add_book_lowercases_uppercase_format() {
    let (db, _temp_dir) = create_temp_db("add_book_lowercase");
    let id = add_book(&db, test_book("fmt-add-1", "Uppercase Ext", "EPUB")).unwrap();

    let conn = db.get_connection().unwrap();
    let stored: String = conn
        .query_row(
            "SELECT file_format FROM books WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(stored, "epub", "add_book must store lowercased file_format");

    // Search by format (any case) finds it via the lowercase comparison.
    let res = search(
        &db,
        SearchQuery {
            formats: Some(vec!["EPUB".to_string()]),
            limit: Some(10),
            offset: Some(0),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(res.total, 1, "format search must find the added book");
    assert_eq!(res.books[0].id.unwrap(), id);
}

/// (b) Pre-v45 DB upgrade: stored file_formats are lowercased so the search
/// format filter can use the index without LOWER() on the column.
#[test]
fn existing_db_upgrade_lowercases_formats() {
    let (db, temp_dir) = create_temp_db("upgrade_formats");

    // Simulate a pre-v45 DB: user_version forced back below 45, then insert
    // a book with an uppercase format (as old imports could produce).
    {
        let conn = db.get_connection().unwrap();
        conn.pragma_update(None, "user_version", 44).unwrap();
        conn.execute(
            "INSERT INTO books (uuid, title, file_path, file_format)
             VALUES ('fmt-up-1', 'Uppercase', '/tmp/up.PDF', 'PDF')",
            [],
        )
        .unwrap();
    }

    // Reopen: v45 runs, backfill lowercases the stored format.
    let reopened = Database::new(temp_dir.join("test.db")).unwrap();
    let conn = reopened.get_connection().unwrap();
    let fmt: String = conn
        .query_row(
            "SELECT file_format FROM books WHERE uuid = 'fmt-up-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(fmt, "pdf", "v45 must lowercase stored file_formats");

    // And a second reopen is a no-op (idempotent; value stays lowercase).
    let reopened2 = Database::new(temp_dir.join("test.db")).unwrap();
    let conn2 = reopened2.get_connection().unwrap();
    let fmt2: String = conn2
        .query_row(
            "SELECT file_format FROM books WHERE uuid = 'fmt-up-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(fmt2, "pdf");
}

type FtsRow = (String, String, String, String, String, String);

fn fts_row(conn: &rusqlite::Connection, book_id: i64) -> Option<FtsRow> {
    // COALESCE: FTS columns are NULL when a book has no authors/tags etc.
    conn.query_row(
        "SELECT COALESCE(title,''), COALESCE(authors,''), COALESCE(publisher,''),
                COALESCE(description,''), COALESCE(tags,''), COALESCE(isbn,'')
         FROM books_fts WHERE rowid = ?1",
        [book_id],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        },
    )
    .ok()
}

/// (c) The hot progress-save path (UPDATE books SET last_opened,
/// reading_status) must NOT churn books_fts; a title change must reindex.
#[test]
fn reading_status_update_does_not_churn_fts() {
    let (db, _temp_dir) = create_temp_db("fts_when");
    let id = add_book(&db, test_book("fts-when-1", "Original Title", "epub")).unwrap();

    let conn = db.get_connection().unwrap();
    let before = fts_row(&conn, id).expect("book should be FTS-indexed after insert");

    // Mirrors reader_service::save_reading_progress's UPDATE on the books row.
    conn.execute(
        "UPDATE books SET last_opened = '2024-02-01T00:00:00Z', reading_status = 'reading' WHERE id = ?1",
        [id],
    )
    .unwrap();
    let after = fts_row(&conn, id).expect("FTS row must survive a non-FTS update");
    assert_eq!(before, after, "books_fts must not change on last_opened/reading_status updates");

    // A real FTS-relevant change still reindexes.
    conn.execute(
        "UPDATE books SET title = 'Renamed Title' WHERE id = ?1",
        [id],
    )
    .unwrap();
    let renamed = fts_row(&conn, id).expect("FTS row must exist after title update");
    assert_eq!(renamed.0, "Renamed Title", "title update must reindex books_fts");
    assert_eq!(renamed.1, before.1, "unrelated FTS columns must be preserved");
    assert_eq!(renamed.3, before.3, "description (notes) must be preserved");
}

/// (d) Author/tag junction edits reindex the affected book (no such triggers
/// existed before v45 — FTS author/tag data went stale on edit).
#[test]
fn author_and_tag_changes_reindex_fts() {
    let (db, _temp_dir) = create_temp_db("fts_junction");
    let id = add_book(&db, test_book("fts-junction-1", "Junction Book", "epub")).unwrap();

    let conn = db.get_connection().unwrap();
    let before = fts_row(&conn, id).expect("book should be FTS-indexed after insert");
    assert_eq!(before.1, "", "no authors yet");

    // Add an author the way add_book does (books_authors insert).
    conn.execute("INSERT INTO authors (name) VALUES ('Rowling')", [])
        .unwrap();
    let author_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO books_authors (book_id, author_id) VALUES (?1, ?2)",
        [id, author_id],
    )
    .unwrap();
    let with_author = fts_row(&conn, id).unwrap();
    assert!(
        with_author.1.contains("Rowling"),
        "author insert must reindex books_fts, got: {:?}",
        with_author.1
    );

    // Remove the author: FTS authors column clears again.
    conn.execute("DELETE FROM books_authors WHERE book_id = ?1", [id])
        .unwrap();
    let cleared = fts_row(&conn, id).unwrap();
    assert_eq!(cleared.1, "", "author delete must reindex books_fts");

    // Same for tags.
    conn.execute("INSERT INTO tags (name) VALUES ('Fantasy')", [])
        .unwrap();
    let tag_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO books_tags (book_id, tag_id) VALUES (?1, ?2)",
        [id, tag_id],
    )
    .unwrap();
    let with_tag = fts_row(&conn, id).unwrap();
    assert!(
        with_tag.4.contains("Fantasy"),
        "tag insert must reindex books_fts, got: {:?}",
        with_tag.4
    );
}
