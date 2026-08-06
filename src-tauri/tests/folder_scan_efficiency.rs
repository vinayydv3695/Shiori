//! Slice S-B: cheap-first import ordering & folder-scan efficiency.
//!
//! Regression coverage for the audit fixes:
//!   - `scan_and_import_folder` pre-filters paths already known to the library
//!     (books + deleted_books tombstones) BEFORE hashing/extraction, so a
//!     rescan of an imported folder costs one query, not a full re-parse.
//!   - `import_single_book` runs the cheapest dedup checks first: a known path
//!     returns Ok(true) without ever touching the file on disk — even if the
//!     file was corrupted after import.
//!   - Tombstoned files in a scanned folder are still skipped silently.

use shiori::{
    db::Database,
    models::{Author, Book, Tag},
    services::library_service,
};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

fn create_temp_db_and_covers(label: &str) -> (Database, PathBuf) {
    let temp_dir = std::env::temp_dir().join(format!(
        "shiori_scan_eff_{}_{}",
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

fn make_book(file_path: &Path, uuid: &str, file_hash: &str) -> Book {
    Book {
        id: None,
        uuid: uuid.to_string(),
        title: "Scan Test Book".to_string(),
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
            name: "Scan".to_string(),
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
        // ponytail: slice 2/3 will populate is_managed/origin/managed_relpath.
        is_managed: false,
        origin: None,
        managed_relpath: None,
        is_wishlist: false,
        in_trash: false,
        deleted_at: None,
    }
}

/// Build a minimal but valid EPUB (mimetype stored first, container.xml,
/// content.opf with manifest+spine, one chapter) — parseable by the `epub`
/// crate that `metadata_service` uses.
fn write_minimal_epub(path: &Path) {
    let file = fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let stored: zip::write::FileOptions<()> = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Stored);
    let deflated: zip::write::FileOptions<()> = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("mimetype", stored).unwrap();
    zip.write_all(b"application/epub+zip").unwrap();

    zip.start_file("META-INF/container.xml", deflated).unwrap();
    zip.write_all(
        b"<?xml version=\"1.0\"?><container version=\"1.0\" \
          xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\">\
          <rootfiles><rootfile full-path=\"OEBPS/content.opf\" \
          media-type=\"application/oebps-package+xml\"/></rootfiles></container>",
    )
    .unwrap();

    zip.start_file("OEBPS/content.opf", deflated).unwrap();
    zip.write_all(
        br#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:test-valid-epub</dc:identifier>
    <dc:title>Valid Test EPUB</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>Test Author</dc:creator>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>"#,
    )
    .unwrap();

    zip.start_file("OEBPS/chapter1.xhtml", deflated).unwrap();
    zip.write_all(
        b"<html xmlns=\"http://www.w3.org/1999/xhtml\"><head><title>Chapter 1</title></head>\
          <body><p>Hello world.</p></body></html>",
    )
    .unwrap();

    zip.finish().unwrap();
}

// ── (a) pre-filter: already-imported + new file → exactly 1 insert ──────────

#[test]
fn folder_scan_prefilters_known_paths_before_importing() {
    let (db, temp_dir) = create_temp_db_and_covers("prefilter");

    let scan_dir = temp_dir.join("scan");
    fs::create_dir_all(&scan_dir).unwrap();
    let existing_file = scan_dir.join("existing.txt");
    fs::write(&existing_file, b"already imported").unwrap();
    let new_file = scan_dir.join("new.txt");
    fs::write(&new_file, b"brand new book").unwrap();

    // Seed the library with a book whose path lives inside the scan folder.
    library_service::add_book(
        &db,
        make_book(&existing_file, "uuid-existing", "hash-existing"),
    )
    .expect("seed book");

    let covers_dir = temp_dir.join("covers");
    let scan_dir_str = scan_dir.to_string_lossy().to_string();

    // First scan: only the new file is inserted; the known one is skipped
    // silently (not even surfaced as a duplicate).
    let result =
        library_service::scan_and_import_folder(&db, &scan_dir_str, &covers_dir).unwrap();
    assert_eq!(
        result.success.len(),
        1,
        "exactly one new book must be imported"
    );
    assert_eq!(result.success[0], new_file.to_string_lossy().to_string());
    assert!(
        result.duplicates.is_empty(),
        "known path must be pre-filtered, not reported as duplicate"
    );
    assert!(result.failed.is_empty());
    assert!(result.previously_deleted.is_empty());

    let books = library_service::get_all_books(&db, 10, 0).unwrap();
    assert_eq!(books.len(), 2, "seeded book untouched + one new book");

    // Second scan: everything is known → zero inserts, zero work reported.
    let result2 =
        library_service::scan_and_import_folder(&db, &scan_dir_str, &covers_dir).unwrap();
    assert_eq!(result2.success.len(), 0, "rescan must insert nothing");
    assert!(result2.duplicates.is_empty());
    assert!(result2.failed.is_empty());
    assert_eq!(
        library_service::get_all_books(&db, 10, 0).unwrap().len(),
        2,
        "book count unchanged after rescan"
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

// ── (b) corrupt-after-import duplicate returns Ok(true) ────────────────────

#[test]
fn reimport_of_corrupted_known_file_is_duplicate_not_error() {
    let (db, temp_dir) = create_temp_db_and_covers("corrupt_dup");
    let covers_dir = temp_dir.join("covers");

    // Import a genuinely valid EPUB (extraction succeeds).
    let epub = temp_dir.join("book.epub");
    write_minimal_epub(&epub);
    let epub_str = epub.to_string_lossy().to_string();
    let is_dup = library_service::import_single_book(&db, &epub_str, &covers_dir).unwrap();
    assert!(!is_dup, "first import of a valid epub is a new book");

    // Truncate the file on disk — extraction would now fail.
    fs::write(&epub, b"").unwrap();

    // Re-import: the known-path check short-circuits BEFORE hashing/extraction.
    let is_dup = library_service::import_single_book(&db, &epub_str, &covers_dir).unwrap();
    assert!(
        is_dup,
        "corrupted-but-known file must dedup via the path check, not error"
    );

    // Extraction error behavior for genuinely NEW files is unchanged: a new
    // path pointing at the same corrupt bytes still errors.
    let corrupt_new = temp_dir.join("never_imported.epub");
    fs::write(&corrupt_new, b"").unwrap();
    let corrupt_new_str = corrupt_new.to_string_lossy().to_string();
    assert!(
        library_service::import_single_book(&db, &corrupt_new_str, &covers_dir).is_err(),
        "genuinely new corrupted file must still surface the extraction error"
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

// ── (c) tombstoned file in a scanned folder is still skipped ───────────────

#[test]
fn folder_scan_skips_tombstoned_paths() {
    let (db, temp_dir) = create_temp_db_and_covers("tombstone_scan");

    // Recycle bin OFF → delete_book leaves a tombstone and keeps the file.
    let conn = db.get_connection().unwrap();
    conn.execute(
        "UPDATE user_preferences SET enable_recycle_bin = 0 WHERE id = 1",
        rusqlite::params![],
    )
    .unwrap();

    let scan_dir = temp_dir.join("scan");
    fs::create_dir_all(&scan_dir).unwrap();
    let tombstoned_file = scan_dir.join("gone.txt");
    fs::write(&tombstoned_file, b"tombstoned content").unwrap();

    let book_id = library_service::add_book(
        &db,
        make_book(&tombstoned_file, "uuid-tomb", "hash-tomb"),
    )
    .expect("add book");
    library_service::delete_book(&db, book_id, &temp_dir).expect("permanent delete");

    // Sanity: the tombstone exists and the file is still on disk.
    let path_str = tombstoned_file.to_string_lossy().to_string();
    let tomb_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM deleted_books WHERE file_path = ?1",
            rusqlite::params![path_str],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(tomb_count, 1);
    assert!(tombstoned_file.exists(), "file must still be on disk");

    // Scan the folder: the tombstoned path is pre-filtered (skipped silently),
    // and the file must NOT be re-imported.
    let covers_dir = temp_dir.join("covers");
    let result = library_service::scan_and_import_folder(
        &db,
        &scan_dir.to_string_lossy().to_string(),
        &covers_dir,
    )
    .unwrap();
    assert_eq!(result.success.len(), 0, "tombstoned file must not re-import");
    assert!(result.failed.is_empty());
    assert!(
        result.previously_deleted.is_empty(),
        "folder scans skip tombstones silently"
    );
    assert_eq!(
        library_service::get_all_books(&db, 10, 0).unwrap().len(),
        0,
        "no book rows may appear for the tombstoned file"
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

// ── (d) unit test for the pre-filter helper ─────────────────────────────────

#[test]
fn load_known_paths_returns_books_and_tombstones() {
    let (db, temp_dir) = create_temp_db_and_covers("known_paths");
    let conn = db.get_connection().unwrap();
    conn.execute(
        "UPDATE user_preferences SET enable_recycle_bin = 0 WHERE id = 1",
        rusqlite::params![],
    )
    .unwrap();

    let live_file = temp_dir.join("live.txt");
    fs::write(&live_file, b"live").unwrap();
    let gone_file = temp_dir.join("gone.txt");
    fs::write(&gone_file, b"gone").unwrap();
    let live_path = live_file.to_string_lossy().to_string();
    let gone_path = gone_file.to_string_lossy().to_string();

    library_service::add_book(&db, make_book(&live_file, "uuid-live", "hash-live")).unwrap();
    let gone_id = library_service::add_book(&db, make_book(&gone_file, "uuid-gone", "hash-gone"))
        .unwrap();
    library_service::delete_book(&db, gone_id, &temp_dir).unwrap();

    let known = library_service::load_known_paths(&db).unwrap();
    assert!(
        known.contains(&live_path),
        "live book path must be in the known set"
    );
    assert!(
        known.contains(&gone_path),
        "tombstoned path must be in the known set"
    );

    // Filtering behavior: known paths drop out, unknown paths survive.
    let candidates = vec![
        (live_path.clone(), "txt".to_string()),
        (gone_path.clone(), "txt".to_string()),
        ("/tmp/unknown.txt".to_string(), "txt".to_string()),
    ];
    let filtered: Vec<(String, String)> = candidates
        .into_iter()
        .filter(|(p, _)| !known.contains(p))
        .collect();
    assert_eq!(
        filtered.len(),
        1,
        "only the unknown path survives the pre-filter"
    );
    assert_eq!(filtered[0].0, "/tmp/unknown.txt");

    let _ = fs::remove_dir_all(&temp_dir);
}
