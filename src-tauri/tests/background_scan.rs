//! Background directory scan (K3-001) — the scan pipeline must ingest every
//! supported file through the same idempotent import path the commands use:
//! 10 supported files → 10 rows, unsupported skipped, corrupt file → counted
//! failure without aborting, rescan → no duplicates, and delete/update still
//! transactional. Also covers the v49 books_authors composite index
//! migration (K3-022).

use shiori::{
    commands::library::allowed_extensions,
    db::Database,
    services::library_service::{self, ScanFileOutcome},
};
use std::fs;
use std::path::{Path, PathBuf};

fn create_temp_db(label: &str, name: &str) -> (Database, PathBuf) {
    let temp_dir = std::env::temp_dir().join(format!(
        "shiori_background_scan_{}_{}",
        std::process::id(),
        label
    ));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let db_path = temp_dir.join(name);
    let covers_dir = temp_dir.join("covers");
    fs::create_dir_all(&covers_dir).unwrap();

    let db = Database::new(&db_path).unwrap();
    (db, temp_dir)
}

fn make_scan_dir(label: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "shiori_scan_files_{}_{}",
        std::process::id(),
        label
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

/// A plain .txt is a supported book format that imports without any content
/// parsing (metadata falls back to the filename) — fast and deterministic.
fn write_txt(dir: &Path, name: &str) -> PathBuf {
    let path = dir.join(name);
    fs::write(&path, format!("content of {}", name)).unwrap();
    path
}

/// Garbage bytes with a supported extension — metadata extraction must fail
/// and the scan must count one failure without aborting.
fn write_corrupt_pdf(path: &Path) {
    fs::write(path, b"this is not a real pdf at all - lopdf will choke").unwrap();
}

/// Mirror of the command's WalkDir filter (extension allow-list).
fn collect_supported(dir: &Path, allowed: &'static [&'static str]) -> Vec<String> {
    let mut files = Vec::new();
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if allowed.contains(&ext.as_str()) {
            files.push(path.to_string_lossy().to_string());
        }
    }
    files.sort();
    files
}

fn count_live_books(db: &Database) -> i64 {
    let conn = db.get_connection().unwrap();
    conn.query_row(
        "SELECT COUNT(*) FROM books WHERE in_trash = 0",
        [],
        |r| r.get(0),
    )
    .unwrap()
}

// ── audit 1: fresh DB + scan dir of 10 supported books → 10 records ──────

#[test]
fn scan_indexes_all_supported_files() {
    let (db, temp_dir) = create_temp_db("all", "test.db");
    let covers_dir = temp_dir.join("covers");
    let scan_dir = make_scan_dir("all");

    let mut files = Vec::new();
    for i in 0..10 {
        files.push(
            write_txt(&scan_dir, &format!("Book {}.txt", i))
                .to_string_lossy()
                .to_string(),
        );
    }

    let outcomes = library_service::ingest_directory_scan(&db, &covers_dir, &files);

    assert_eq!(outcomes.len(), 10);
    for outcome in &outcomes {
        match outcome {
            ScanFileOutcome::Inserted { book_id } => {
                assert!(*book_id > 0, "inserted rows carry a real book id");
            }
            other => panic!("expected Inserted, got {:?}", other),
        }
    }
    assert_eq!(count_live_books(&db), 10);

    // The on-disk file paths are what landed in the library.
    let conn = db.get_connection().unwrap();
    let mut stmt = conn
        .prepare("SELECT file_path FROM books WHERE in_trash = 0 ORDER BY file_path")
        .unwrap();
    let paths: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(paths, files);
}

// ── audit 2: unsupported extensions are skipped ──────────────────────────

#[test]
fn scan_skips_unsupported_extensions() {
    let (db, temp_dir) = create_temp_db("unsupported", "test.db");
    let covers_dir = temp_dir.join("covers");
    let scan_dir = make_scan_dir("unsupported");

    for i in 0..8 {
        write_txt(&scan_dir, &format!("Book {}.txt", i));
    }
    fs::write(scan_dir.join("setup.exe"), b"not a book").unwrap();
    fs::write(scan_dir.join("notes.xyz"), b"not a book").unwrap();

    let allowed = allowed_extensions("books");
    let files = collect_supported(&scan_dir, allowed);
    assert_eq!(files.len(), 8, "only supported extensions pass the filter");

    let outcomes = library_service::ingest_directory_scan(&db, &covers_dir, &files);
    assert_eq!(
        outcomes
            .iter()
            .filter(|o| matches!(o, ScanFileOutcome::Inserted { .. }))
            .count(),
        8
    );
    assert_eq!(count_live_books(&db), 8, "unsupported files never become rows");
}

// ── audit 3: corrupt book → scan completes, failure counted, others in ───

#[test]
fn scan_survives_corrupt_file() {
    let (db, temp_dir) = create_temp_db("corrupt", "test.db");
    let covers_dir = temp_dir.join("covers");
    let scan_dir = make_scan_dir("corrupt");

    let mut files = Vec::new();
    for i in 0..9 {
        files.push(
            write_txt(&scan_dir, &format!("Book {}.txt", i))
                .to_string_lossy()
                .to_string(),
        );
    }
    let corrupt = scan_dir.join("Broken.pdf");
    write_corrupt_pdf(&corrupt);
    files.push(corrupt.to_string_lossy().to_string());

    let outcomes = library_service::ingest_directory_scan(&db, &covers_dir, &files);

    assert_eq!(outcomes.len(), 10);
    let inserted = outcomes
        .iter()
        .filter(|o| matches!(o, ScanFileOutcome::Inserted { .. }))
        .count();
    let failed: Vec<_> = outcomes
        .iter()
        .filter_map(|o| match o {
            ScanFileOutcome::Failed { error } => Some(error.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(inserted, 9, "healthy files still import");
    assert_eq!(failed.len(), 1, "one reported failure, no abort");
    assert!(!failed[0].is_empty());
    assert_eq!(count_live_books(&db), 9);
}

// ── audit 4: rescan → no duplicates ──────────────────────────────────────

#[test]
fn rescan_never_duplicates() {
    let (db, temp_dir) = create_temp_db("rescan", "test.db");
    let covers_dir = temp_dir.join("covers");
    let scan_dir = make_scan_dir("rescan");

    let mut files = Vec::new();
    for i in 0..10 {
        files.push(
            write_txt(&scan_dir, &format!("Book {}.txt", i))
                .to_string_lossy()
                .to_string(),
        );
    }

    let first = library_service::ingest_directory_scan(&db, &covers_dir, &files);
    assert_eq!(count_live_books(&db), 10);

    let second = library_service::ingest_directory_scan(&db, &covers_dir, &files);

    assert!(
        second
            .iter()
            .all(|o| matches!(o, ScanFileOutcome::AlreadyIndexed)),
        "rescan of an unchanged folder re-indexes nothing: {:?}",
        second
    );
    assert_eq!(count_live_books(&db), 10, "no duplicate rows on rescan");
    assert_eq!(first.len(), second.len());
}

// ── audit 5: delete_books / update_book stay transactional on scan rows ──

#[test]
fn delete_and_update_work_on_scanned_books() {
    let (db, temp_dir) = create_temp_db("mutate", "test.db");
    let covers_dir = temp_dir.join("covers");
    let scan_dir = make_scan_dir("mutate");

    let mut files = Vec::new();
    for i in 0..10 {
        files.push(
            write_txt(&scan_dir, &format!("Book {}.txt", i))
                .to_string_lossy()
                .to_string(),
        );
    }
    let outcomes = library_service::ingest_directory_scan(&db, &covers_dir, &files);
    let ids: Vec<i64> = outcomes
        .iter()
        .map(|o| match o {
            ScanFileOutcome::Inserted { book_id } => *book_id,
            _ => panic!("expected Inserted"),
        })
        .collect();

    // update_book: change the title, watch it persist.
    let mut book = library_service::get_book_by_id(&db, ids[0]).unwrap();
    book.title = "Renamed by test".to_string();
    library_service::update_book(&db, book).unwrap();
    let reloaded = library_service::get_book_by_id(&db, ids[0]).unwrap();
    assert_eq!(reloaded.title, "Renamed by test");

    // delete_books: transaction removes exactly the requested ids.
    let to_delete = vec![ids[1], ids[2]];
    library_service::delete_books(&db, to_delete.clone(), &covers_dir).unwrap();
    assert_eq!(count_live_books(&db), 8);
    let conn = db.get_connection().unwrap();
    let remaining: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM books WHERE id IN (?1, ?2) AND in_trash = 0",
            rusqlite::params![to_delete[0], to_delete[1]],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(remaining, 0, "deleted ids are no longer live");

    // Deleting again is a no-op through the transaction, not an error.
    library_service::delete_books(&db, to_delete, &covers_dir).unwrap();
    assert_eq!(count_live_books(&db), 8);
}

// ── K3-022: v49 books_authors composite index migration ──────────────────

#[test]
fn v49_index_migration_runs_once_on_fresh_db() {
    let (db, temp_dir) = create_temp_db("v49", "test.db");

    // Index exists with exactly (book_id, author_order) in that order.
    let conn = db.get_connection().unwrap();
    let mut stmt = conn
        .prepare("PRAGMA index_list('books_authors')")
        .unwrap();
    let index_names: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(1))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert!(
        index_names.contains(&"idx_books_authors_book_order".to_string()),
        "v49 index missing from {:?}",
        index_names
    );

    let mut stmt = conn
        .prepare("PRAGMA index_info('idx_books_authors_book_order')")
        .unwrap();
    let columns: Vec<(i64, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(2)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(columns, vec![(0, "book_id".to_string()), (1, "author_order".to_string())]);

    // Ladder recorded it exactly once.
    let v49_rows: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM schema_migrations WHERE version = 49",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(v49_rows, 1);

    // Reopening the same DB is idempotent — no duplicate migration rows.
    let db2 = Database::new(&temp_dir.join("test.db")).unwrap();
    let conn2 = db2.get_connection().unwrap();
    let v49_rows_after_reopen: i64 = conn2
        .query_row(
            "SELECT COUNT(*) FROM schema_migrations WHERE version = 49",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(v49_rows_after_reopen, 1);
}