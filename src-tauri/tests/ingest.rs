//! Integration tests for Slice 2 — "Open with Shiori" managed ingestion.
//!
//! The ingest pipeline (`services::ingest_service::ingest_opened_file`) is
//! platform-agnostic: it consumes a local readable file + the original
//! url/name. These tests exercise the full lifecycle against a temp DB:
//! unsupported ext → status, import → managed row + file in library root,
//! re-open → duplicate, delete (recycle off) → managed file removed with NO
//! tombstone, tombstoned file → previously_deleted, and the import_manga /
//! import_comics tombstone surfacing fix.

use shiori::{
    db::Database,
    services::{ingest_service, library_service},
};
use std::fs;
use std::path::{Path, PathBuf};

fn create_temp_db(label: &str) -> (Database, PathBuf) {
    let temp_dir = std::env::temp_dir().join(format!(
        "shiori_ingest_{}_{}",
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

fn set_recycle_bin(db: &Database, enabled: bool) {
    let conn = db.get_connection().unwrap();
    conn.execute(
        "UPDATE user_preferences SET enable_recycle_bin = ?1 WHERE id = 1",
        rusqlite::params![if enabled { 1 } else { 0 }],
    )
    .unwrap();
}

fn insert_tombstone(db: &Database, file_hash: &str, file_path: &str) {
    let conn = db.get_connection().unwrap();
    conn.execute(
        "INSERT INTO deleted_books (file_hash, file_path, reason) VALUES (?1, ?2, 'user_delete')",
        rusqlite::params![file_hash, file_path],
    )
    .unwrap();
}

/// Write a minimal-but-valid PDF (lopdf) — real enough for
/// metadata_service::extract_from_file and extract_cover (no images → no
/// cover, which is fine).
fn write_minimal_pdf(path: &Path, title: &str) {
    use lopdf::{dictionary, Document, Object};
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let page_id = doc.add_object(Object::Dictionary(dictionary! {
        "Type" => "Page",
        "Parent" => pages_id,
        "MediaBox" => Object::Array(vec![
            Object::Integer(0),
            Object::Integer(0),
            Object::Integer(200),
            Object::Integer(200),
        ]),
    }));
    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => Object::Array(vec![Object::Reference(page_id)]),
            "Count" => 1,
        }),
    );
    doc.trailer.set("Root", pages_id);
    // Inline Info dict (not a reference): metadata_service's
    // extract_pdf_metadata reads `trailer.get(b"Info").as_dict()` without
    // dereferencing, so a reference would silently yield no title.
    doc.trailer.set(
        "Info",
        Object::Dictionary(dictionary! {
            "Title" => Object::string_literal(title),
            "Author" => Object::string_literal("Ingest Test Author"),
        }),
    );
    doc.compress();
    doc.save(path).unwrap();
}

/// Write a minimal CBZ: a zip containing one (fake) image entry — enough for
/// extract_cbz_metadata to count it as a valid comic archive.
fn write_minimal_cbz(path: &Path) {
    use std::io::Write;
    let file = fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    zip.start_file("00001.jpg", zip::write::SimpleFileOptions::default())
        .unwrap();
    zip.write_all(b"not really a jpeg, but the name counts")
        .unwrap();
    zip.finish().unwrap();
}

// ── (a) unsupported extension → status "unsupported" ──────────────────────

#[test]
fn ingest_unsupported_extension_returns_unsupported_status() {
    let (db, temp_dir) = create_temp_db("unsupported");
    let covers_dir = temp_dir.join("covers");

    let source = temp_dir.join("notes.txt");
    fs::write(&source, b"just some text notes").unwrap();

    let result = ingest_service::ingest_opened_file(
        &db,
        &covers_dir,
        &temp_dir,
        &source.to_string_lossy(),
        &source,
        "notes.txt",
        false,
        None,
    )
    .unwrap();

    assert_eq!(result.status, "unsupported");
    assert!(result.book_id.is_none());

    // Nothing was imported, no managed file was created.
    let conn = db.get_connection().unwrap();
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 0);
    assert!(!temp_dir.join("Library").exists() || fs::read_dir(temp_dir.join("Library")).unwrap().count() == 0);
}

// ── (b) real file → imported as a managed book ────────────────────────────

#[test]
fn ingest_imports_file_as_managed_book() {
    let (db, temp_dir) = create_temp_db("imported");
    let covers_dir = temp_dir.join("covers");

    let source = temp_dir.join("opened").join("The Test Book.pdf");
    fs::create_dir_all(source.parent().unwrap()).unwrap();
    write_minimal_pdf(&source, "The Test Book");
    let source_bytes = fs::read(&source).unwrap();

    let result = ingest_service::ingest_opened_file(
        &db,
        &covers_dir,
        &temp_dir,
        &source.to_string_lossy(),
        &source,
        "The Test Book.pdf",
        false,
        None,
    )
    .unwrap();

    assert_eq!(result.status, "imported");
    let book_id = result.book_id.expect("imported result carries book_id");
    assert_eq!(result.title.as_deref(), Some("The Test Book"));

    // Row: managed fields + origin + domain routing.
    let conn = db.get_connection().unwrap();
    let (is_managed, origin, managed_relpath, file_path, file_format, domain): (i64, Option<String>, Option<String>, String, String, Option<String>) = conn
        .query_row(
            "SELECT is_managed, origin, managed_relpath, file_path, file_format, domain FROM books WHERE id = ?1",
            rusqlite::params![book_id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                ))
            },
        )
        .unwrap();

    assert_eq!(is_managed, 1);
    assert_eq!(origin.as_deref(), Some("open_with"));
    let rel = managed_relpath.expect("managed_relpath is set");
    assert!(rel.ends_with(".pdf"), "rel = {}", rel);
    assert_eq!(file_path, temp_dir.join("Library").join(&rel).to_string_lossy());
    assert_eq!(file_format, "pdf");
    assert_eq!(domain.as_deref(), Some("books"));

    // The file physically exists under the managed library root with the
    // exact bytes of the opened file.
    let managed_file = temp_dir.join("Library").join(&rel);
    assert!(managed_file.is_file(), "managed file exists at {:?}", managed_file);
    assert_eq!(fs::read(&managed_file).unwrap(), source_bytes);
}

// ── (c) same file again → duplicate ───────────────────────────────────────

#[test]
fn ingest_same_file_again_is_duplicate() {
    let (db, temp_dir) = create_temp_db("duplicate");
    let covers_dir = temp_dir.join("covers");

    let source = temp_dir.join("Dup Book.pdf");
    write_minimal_pdf(&source, "Dup Book");

    let first = ingest_service::ingest_opened_file(
        &db,
        &covers_dir,
        &temp_dir,
        &source.to_string_lossy(),
        &source,
        "Dup Book.pdf",
        false,
        None,
    )
    .unwrap();
    assert_eq!(first.status, "imported");

    // Re-opening the same file (same hash — e.g. a fresh content:// URI on
    // Android) must be reported as a duplicate, not imported twice.
    let second = ingest_service::ingest_opened_file(
        &db,
        &covers_dir,
        &temp_dir,
        &source.to_string_lossy(),
        &source,
        "Dup Book.pdf",
        false,
        None,
    )
    .unwrap();
    assert_eq!(second.status, "duplicate");
    assert!(second.book_id.is_none());

    let conn = db.get_connection().unwrap();
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1, "only one book row after a duplicate re-open");
}

// ── (d) delete (recycle off) → managed file removed, NO tombstone ─────────

#[test]
fn delete_managed_book_removes_file_and_leaves_no_tombstone() {
    let (db, temp_dir) = create_temp_db("delete_managed");
    let covers_dir = temp_dir.join("covers");

    let source = temp_dir.join("Doomed.pdf");
    write_minimal_pdf(&source, "Doomed");
    let source_hash = shiori::utils::file::calculate_file_hash(&source.to_string_lossy()).unwrap();

    let result = ingest_service::ingest_opened_file(
        &db,
        &covers_dir,
        &temp_dir,
        &source.to_string_lossy(),
        &source,
        "Doomed.pdf",
        false,
        None,
    )
    .unwrap();
    let book_id = result.book_id.unwrap();

    let conn = db.get_connection().unwrap();
    let rel: String = conn
        .query_row(
            "SELECT managed_relpath FROM books WHERE id = ?1",
            rusqlite::params![book_id],
            |r| r.get(0),
        )
        .unwrap();
    let managed_file = temp_dir.join("Library").join(&rel);
    assert!(managed_file.is_file());

    // Permanent delete (recycle bin OFF): managed books skip the tombstone
    // and get their file removed from the library root.
    set_recycle_bin(&db, false);
    library_service::delete_book(&db, book_id, &temp_dir).unwrap();

    assert!(
        !managed_file.exists(),
        "managed file removed from library root: {:?}",
        managed_file
    );
    let tombstone_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM deleted_books", [], |r| r.get(0))
        .unwrap();
    assert_eq!(tombstone_count, 0, "managed delete must not leave a tombstone");
    let book_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
        .unwrap();
    assert_eq!(book_count, 0);
    let _ = source_hash; // (hash tombstoning is covered by the next test)
}

// ── (e) tombstoned file → previously_deleted ──────────────────────────────

#[test]
fn ingest_tombstoned_file_is_previously_deleted() {
    let (db, temp_dir) = create_temp_db("tombstoned");
    let covers_dir = temp_dir.join("covers");

    let source = temp_dir.join("Ghost.pdf");
    write_minimal_pdf(&source, "Ghost");
    let source_hash = shiori::utils::file::calculate_file_hash(&source.to_string_lossy()).unwrap();

    // Simulate a previously-permanently-deleted (non-managed) import: the
    // tombstone matches by hash — exactly what a re-open of the same file
    // would hit on Android (fresh content:// URI, same content).
    insert_tombstone(&db, &source_hash, "/old/import/path/Ghost.pdf");

    let result = ingest_service::ingest_opened_file(
        &db,
        &covers_dir,
        &temp_dir,
        &source.to_string_lossy(),
        &source,
        "Ghost.pdf",
        false,
        None,
    )
    .unwrap();

    assert_eq!(result.status, "previously_deleted");
    assert!(result.book_id.is_none());

    // The tombstone is NOT auto-cleared — the frontend decides.
    let conn = db.get_connection().unwrap();
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM deleted_books", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);

    // Nothing imported, no managed file.
    let books: i64 = conn
        .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
        .unwrap();
    assert_eq!(books, 0);
    let library = temp_dir.join("Library");
    assert!(!library.exists() || fs::read_dir(&library).unwrap().count() == 0);
}

// ── (f) import_comics surfaces tombstoned paths in previously_deleted ─────

#[test]
fn import_comics_tombstoned_path_lands_in_previously_deleted() {
    let (db, temp_dir) = create_temp_db("comics_tombstone");
    let covers_dir = temp_dir.join("covers");

    let comic = temp_dir.join("issue-1.cbz");
    write_minimal_cbz(&comic);
    let comic_hash =
        shiori::utils::file::calculate_file_hash(&comic.to_string_lossy()).unwrap();
    insert_tombstone(&db, &comic_hash, &comic.to_string_lossy());

    let result = library_service::import_comics(
        &db,
        vec![comic.to_string_lossy().to_string()],
        &covers_dir,
    )
    .unwrap();

    // Designer-flagged fix: a tombstoned path must surface in
    // previously_deleted — NOT as a generic failure.
    assert!(
        result.previously_deleted.contains(&comic.to_string_lossy().to_string()),
        "previously_deleted = {:?}, failed = {:?}",
        result.previously_deleted,
        result.failed
    );
    assert!(result.failed.is_empty());
    assert!(result.success.is_empty());
    assert!(result.duplicates.is_empty());
}

// ── import_manga parity (same fix, manga domain) ──────────────────────────

#[test]
fn import_manga_tombstoned_path_lands_in_previously_deleted() {
    let (db, temp_dir) = create_temp_db("manga_tombstone");
    let covers_dir = temp_dir.join("covers");

    let manga = temp_dir.join("chapter-3.cbz");
    write_minimal_cbz(&manga);
    let manga_hash =
        shiori::utils::file::calculate_file_hash(&manga.to_string_lossy()).unwrap();
    insert_tombstone(&db, &manga_hash, &manga.to_string_lossy());

    let result = library_service::import_manga(
        &db,
        vec![manga.to_string_lossy().to_string()],
        &covers_dir,
    )
    .unwrap();

    assert!(
        result.previously_deleted.contains(&manga.to_string_lossy().to_string()),
        "previously_deleted = {:?}, failed = {:?}",
        result.previously_deleted,
        result.failed
    );
    assert!(result.failed.is_empty());
}

// ── staging cleanup: cleanup_source removes the temp copy ─────────────────

#[test]
fn ingest_cleans_up_staging_file_when_requested() {
    let (db, temp_dir) = create_temp_db("cleanup");
    let covers_dir = temp_dir.join("covers");

    let source = temp_dir.join("staged.pdf");
    write_minimal_pdf(&source, "Staged");
    let staged = temp_dir.join("staging").join("staged.pdf");
    fs::create_dir_all(staged.parent().unwrap()).unwrap();
    fs::copy(&source, &staged).unwrap();

    // Android flow: the android-saf copy_document staging file is removed
    // after a successful ingest.
    let result = ingest_service::ingest_opened_file(
        &db,
        &covers_dir,
        &temp_dir,
        "content://provider/document/staged.pdf",
        &staged,
        "staged.pdf",
        true, // cleanup_source
        None,
    )
    .unwrap();
    assert_eq!(result.status, "imported");
    assert!(!staged.exists(), "staging file removed after ingest");
}

// ── staging cleanup when the copy phase hard-fails (reviewer finding) ─────

#[test]
fn ingest_resolve_failure_still_cleans_up_staging_file() {
    let (db, temp_dir) = create_temp_db("resolve_fail");
    let covers_dir = temp_dir.join("covers");

    let source = temp_dir.join("staged.pdf");
    write_minimal_pdf(&source, "Staged");
    let staged = temp_dir.join("staging").join("staged.pdf");
    fs::create_dir_all(staged.parent().unwrap()).unwrap();
    fs::copy(&source, &staged).unwrap();

    // Force library_root::resolve_library_root to fail: the Library dir it
    // must create is blocked by a same-named FILE, so create_dir_all errors.
    // This is the unguarded `?` exit the reviewer flagged — the Android
    // content:// staging file must still be cleaned up.
    fs::write(temp_dir.join("Library"), b"not a directory").unwrap();

    let result = ingest_service::ingest_opened_file(
        &db,
        &covers_dir,
        &temp_dir,
        "content://provider/document/staged.pdf",
        &staged,
        "staged.pdf",
        true, // cleanup_source
        None,
    );
    assert!(result.is_err(), "ingest must fail: {:?}", result);
    assert!(
        !staged.exists(),
        "staging file cleaned up even when resolve_library_root fails"
    );
}
