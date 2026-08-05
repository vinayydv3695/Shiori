//! Integration tests for `empty_trash`'s orphan cleanup of the `converted/`
//! output dir (Task A2).
//!
//! convert_book writes converted EPUBs to `{app_data_dir}/converted/conv_<uuid>/`
//! and auto-imports them, so a book row's `file_path` points inside those dirs.
//! After emptying the trash we must remove only `conv_*` dirs that NO book row
//! references — referenced files (even ones whose book is still in the library,
//! not trash) must never be deleted.

use shiori::{
    db::Database,
    models::{Author, Book, Tag},
    services::library_service,
};
use std::fs;
use std::path::{Path, PathBuf};

fn create_temp_db_and_covers(label: &str) -> (Database, PathBuf) {
    let temp_dir = std::env::temp_dir().join(format!(
        "shiori_empty_trash_cleanup_{}_{}",
        std::process::id(),
        label
    ));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let db_path = temp_dir.join("test.db");
    let covers_dir = temp_dir.join("covers");
    fs::create_dir_all(&covers_dir).unwrap();

    let db = Database::new(&db_path).unwrap();
    (db, temp_dir)
}

fn make_book(file_path: &Path, uuid: &str) -> Book {
    Book {
        id: None,
        uuid: uuid.to_string(),
        title: "Converted Book".to_string(),
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
            name: "Converted".to_string(),
            color: None,
        }],
        file_path: file_path.to_string_lossy().to_string(),
        file_format: "epub".to_string(),
        file_size: Some(10),
        file_hash: Some(format!("hash-{}", uuid)),
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
        // ponytail: slice 2/3 will populate is_managed/origin/managed_relpath.
        is_managed: false,
        origin: None,
        managed_relpath: None,
        is_wishlist: false,
        in_trash: false,
        deleted_at: None,
    }
}

#[test]
fn empty_trash_removes_only_unreferenced_converted_dirs() {
    let (db, temp_dir) = create_temp_db_and_covers("main");
    // covers_dir = {temp}/covers → converted root is its sibling {temp}/converted.
    let converted_root = temp_dir.join("converted");

    // 1. A converted dir referenced by a book that stays in the library.
    let keep_dir = converted_root.join("conv_keep");
    let keep_file = keep_dir.join("keep.epub");
    fs::create_dir_all(&keep_dir).unwrap();
    fs::write(&keep_file, b"referenced epub").unwrap();

    // 2. A converted dir referenced by a book currently in the trash — after
    //    emptying, that row is gone, so the dir becomes unreferenced and must
    //    be swept.
    let trashed_dir = converted_root.join("conv_trashed");
    let trashed_file = trashed_dir.join("trashed.epub");
    fs::create_dir_all(&trashed_dir).unwrap();
    fs::write(&trashed_file, b"trashed epub").unwrap();

    // 3. A converted dir with no book row at all — pure orphan.
    let orphan_dir = converted_root.join("conv_orphan");
    fs::create_dir_all(&orphan_dir).unwrap();
    fs::write(orphan_dir.join("orphan.epub"), b"orphan epub").unwrap();

    // 4. A non-conv dir that must never be touched.
    let unrelated_dir = converted_root.join("not_a_conv_dir");
    fs::create_dir_all(&unrelated_dir).unwrap();
    fs::write(unrelated_dir.join("note.txt"), b"unrelated").unwrap();

    let keep_book_id = library_service::add_book(&db, make_book(&keep_file, "uuid-keep"))
        .expect("add referenced book");
    let trashed_book_id = library_service::add_book(&db, make_book(&trashed_file, "uuid-trashed"))
        .expect("add trashed book");
    library_service::delete_book(&db, trashed_book_id).expect("move book to trash");

    // Sanity: the trashed book is in trash, the keep book is not.
    let trashed = library_service::get_book_by_id(&db, trashed_book_id).unwrap();
    assert!(trashed.in_trash);
    let keep = library_service::get_book_by_id(&db, keep_book_id).unwrap();
    assert!(!keep.in_trash);

    library_service::empty_trash(&db, &converted_root).expect("empty_trash");

    // Trash rows are gone, keep book intact.
    assert!(
        library_service::get_book_by_id(&db, trashed_book_id).is_err(),
        "trashed book row must be deleted"
    );
    assert!(library_service::get_book_by_id(&db, keep_book_id).is_ok());

    // Referenced dir kept, orphans gone, unrelated dir untouched.
    assert!(
        keep_file.exists(),
        "referenced converted file must never be deleted"
    );
    assert!(
        keep_dir.exists(),
        "referenced converted dir must never be deleted"
    );
    assert!(
        !trashed_dir.exists(),
        "dir of a trashed book becomes unreferenced after empty_trash and must be removed"
    );
    assert!(
        !orphan_dir.exists(),
        "unreferenced converted dir must be removed"
    );
    assert!(
        unrelated_dir.exists(),
        "non-conv dirs must never be touched"
    );

    // Second run is a no-op (nothing left to sweep) and must not error.
    library_service::empty_trash(&db, &converted_root).expect("idempotent empty_trash");
    assert!(!orphan_dir.exists());

    // Cleanup
    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn empty_trash_with_missing_converted_root_is_noop() {
    let (db, temp_dir) = create_temp_db_and_covers("missing_root");
    let missing = temp_dir.join("converted_never_created");

    // No panic, no error — read_dir simply finds nothing.
    library_service::empty_trash(&db, &missing).expect("missing converted root is fine");
    assert!(!missing.exists());

    let _ = fs::remove_dir_all(&temp_dir);
}
