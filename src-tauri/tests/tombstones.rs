//! Integration tests for deletion tombstones (Slice 1).
//!
//! A permanently removed book leaves a `deleted_books` tombstone so
//! re-importing the same file is rejected until `clear_tombstone` lifts the
//! block. Managed books (is_managed=1) skip the tombstone and get their file
//! removed from the library root instead.

use shiori::{
    db::Database,
    error::ShioriError,
    models::{Author, Book, Tag},
    services::library_service,
};
use std::fs;
use std::path::{Path, PathBuf};

fn create_temp_db(label: &str) -> (Database, PathBuf) {
    let temp_dir = std::env::temp_dir().join(format!(
        "shiori_tombstones_{}_{}",
        std::process::id(),
        label
    ));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let db_path = temp_dir.join("test.db");
    let db = Database::new(&db_path).unwrap();
    (db, temp_dir)
}

fn set_recycle_bin(db: &Database, enabled: bool) {
    let conn = db.get_connection().unwrap();
    conn.execute(
        "UPDATE user_preferences SET enable_recycle_bin = ?1 WHERE id = 1",
        rusqlite::params![if enabled { 1 } else { 0 }],
    )
    .unwrap();
}

fn make_book(file_path: &Path, uuid: &str, file_hash: &str) -> Book {
    Book {
        id: None,
        uuid: uuid.to_string(),
        title: "Tombstone Test Book".to_string(),
        sort_title: None,
        authors: vec![Author {
            id: None,
            name: "Test Author".to_string(),
            sort_name: None,
            link: None,
        }],
        isbn: None,
        isbn13: None,
        publisher: None,
        pubdate: None,
        series: None,
        series_index: None,
        rating: None,
        tags: vec![Tag {
            id: None,
            name: "Tombstone".to_string(),
            color: None,
        }],
        file_path: file_path.to_string_lossy().to_string(),
        file_format: "txt".to_string(),
        file_size: Some(12),
        file_hash: Some(file_hash.to_string()),
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
        reading_status: "planning".to_string(),
        domain: Some("books".to_string()),
        metadata_locked: None,
        // Slice 2/3 will populate origin for real imports; tests set
        // is_managed/managed_relpath explicitly when needed.
        is_managed: false,
        origin: None,
        managed_relpath: None,
        is_wishlist: false,
        in_trash: false,
        deleted_at: None,
    }
}

fn tombstone_count_and_reason(db: &Database, file_path: &str) -> (i64, String) {
    let conn = db.get_connection().unwrap();
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM deleted_books WHERE file_path = ?1",
            rusqlite::params![file_path],
            |r| r.get(0),
        )
        .unwrap();
    let reason: String = conn
        .query_row(
            "SELECT COALESCE(MAX(reason), '') FROM deleted_books WHERE file_path = ?1",
            rusqlite::params![file_path],
            |r| r.get(0),
        )
        .unwrap();
    (count, reason)
}

#[test]
fn permanent_delete_writes_user_delete_tombstone() {
    let (db, temp_dir) = create_temp_db("user_delete");
    set_recycle_bin(&db, false);

    let book_file = temp_dir.join("book.txt");
    fs::write(&book_file, b"hello tombstone").unwrap();

    let book_id = library_service::add_book(&db, make_book(&book_file, "uuid-a", "hash-a"))
        .expect("add book");
    library_service::delete_book(&db, book_id, &temp_dir).expect("permanent delete");

    // Book row is gone, tombstone remains with the user_delete reason.
    assert!(library_service::get_book_by_id(&db, book_id).is_err());
    let path_str = book_file.to_string_lossy().to_string();
    let (count, reason) = tombstone_count_and_reason(&db, &path_str);
    assert_eq!(count, 1, "permanent delete must leave exactly one tombstone");
    assert_eq!(reason, "user_delete");

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn import_single_book_rejects_tombstoned_path() {
    let (db, temp_dir) = create_temp_db("import_reject");
    set_recycle_bin(&db, false);

    let book_file = temp_dir.join("book.txt");
    fs::write(&book_file, b"hello tombstone").unwrap();
    let path_str = book_file.to_string_lossy().to_string();

    let book_id = library_service::add_book(&db, make_book(&book_file, "uuid-b", "hash-b"))
        .expect("add book");
    library_service::delete_book(&db, book_id, &temp_dir).expect("permanent delete");

    let covers_dir = temp_dir.join("covers");
    fs::create_dir_all(&covers_dir).unwrap();

    let err = library_service::import_single_book(&db, &path_str, &covers_dir)
        .expect_err("import of a tombstoned path must fail");
    assert!(
        matches!(err, ShioriError::TombstonedBook(ref p) if p == &path_str),
        "expected TombstonedBook, got {:?}",
        err
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn add_book_rejects_tombstoned_path() {
    let (db, temp_dir) = create_temp_db("add_reject");
    set_recycle_bin(&db, false);

    let book_file = temp_dir.join("book.txt");
    fs::write(&book_file, b"hello tombstone").unwrap();
    let path_str = book_file.to_string_lossy().to_string();

    let book_id = library_service::add_book(&db, make_book(&book_file, "uuid-c", "hash-c"))
        .expect("add book");
    library_service::delete_book(&db, book_id, &temp_dir).expect("permanent delete");

    let err = library_service::add_book(&db, make_book(&book_file, "uuid-c2", "hash-c2"))
        .expect_err("add_book on a tombstoned path must fail");
    assert!(
        matches!(err, ShioriError::TombstonedBook(ref p) if p == &path_str),
        "expected TombstonedBook, got {:?}",
        err
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn clear_tombstone_allows_reimport() {
    let (db, temp_dir) = create_temp_db("clear_tombstone");
    set_recycle_bin(&db, false);

    let book_file = temp_dir.join("book.txt");
    fs::write(&book_file, b"hello tombstone").unwrap();
    let path_str = book_file.to_string_lossy().to_string();

    let book_id = library_service::add_book(&db, make_book(&book_file, "uuid-d", "hash-d"))
        .expect("add book");
    library_service::delete_book(&db, book_id, &temp_dir).expect("permanent delete");

    let covers_dir = temp_dir.join("covers");
    fs::create_dir_all(&covers_dir).unwrap();

    // Forget the deletion (by path + hash), then the same file imports again.
    library_service::clear_tombstone(&db, &path_str, Some("hash-d")).expect("clear tombstone");
    let is_duplicate = library_service::import_single_book(&db, &path_str, &covers_dir)
        .expect("import after clear_tombstone must succeed");
    assert!(!is_duplicate, "re-import must not be flagged as a duplicate");

    let books = library_service::get_all_books(&db, 10, 0).expect("list books");
    assert_eq!(books.len(), 1, "re-imported book must be back in the library");

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn empty_trash_writes_trash_purge_tombstones() {
    let (db, temp_dir) = create_temp_db("trash_purge");
    // Recycle bin stays ON (default) — delete moves to trash, empty_trash purges.

    let book_file = temp_dir.join("trashed.txt");
    fs::write(&book_file, b"trash me").unwrap();
    let path_str = book_file.to_string_lossy().to_string();

    let book_id = library_service::add_book(&db, make_book(&book_file, "uuid-e", "hash-e"))
        .expect("add book");
    library_service::delete_book(&db, book_id, &temp_dir).expect("move to trash");

    let converted_root = temp_dir.join("converted");
    library_service::empty_trash(&db, &converted_root).expect("empty trash");

    assert!(library_service::get_book_by_id(&db, book_id).is_err());
    let (count, reason) = tombstone_count_and_reason(&db, &path_str);
    assert_eq!(count, 1, "trash purge must leave exactly one tombstone");
    assert_eq!(reason, "trash_purge");

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn managed_book_file_removed_without_tombstone() {
    let (db, temp_dir) = create_temp_db("managed");
    set_recycle_bin(&db, false);

    // Library root is {temp}/Library (Mode A); the managed file lives inside.
    let managed_dir = temp_dir.join("Library").join("books");
    fs::create_dir_all(&managed_dir).unwrap();
    let managed_file = managed_dir.join("managed.txt");
    fs::write(&managed_file, b"managed content").unwrap();

    let mut book = make_book(&managed_file, "uuid-f", "hash-f");
    book.is_managed = true;
    book.origin = Some("scanned".to_string());
    book.managed_relpath = Some("books/managed.txt".to_string());

    let book_id = library_service::add_book(&db, book).expect("add managed book");
    library_service::delete_book(&db, book_id, &temp_dir).expect("permanent delete");

    assert!(
        !managed_file.exists(),
        "managed book file must be removed from the library root"
    );
    let path_str = managed_file.to_string_lossy().to_string();
    let (count, _) = tombstone_count_and_reason(&db, &path_str);
    assert_eq!(count, 0, "managed books must not leave tombstones");

    let _ = fs::remove_dir_all(&temp_dir);
}
