//! Security-hardening regression tests for backup/restore path validation.
//!
//! Covers: (a) crafted zip-slip archives never write outside the extraction
//! roots; (b) non-managed manifest `file_path` values that are relative or
//! empty are skipped with error entries; (c) a valid absolute `file_path`
//! with an existing parent still restores (same-machine restore preserved);
//! (d) a missing parent dir is skipped, never created; (e) managed
//! `managed_relpath` traversal is refused while normal relpaths restore under
//! the managed root; (f) the legit Everything round-trip is unchanged; (g)
//! backslash-traversal entries are rejected too.

use shiori::db::Database;
use shiori::models::{BackupCategory, BackupSelection, ConflictPolicy, RestoreSelection};
use shiori::services::backup_service;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

struct TestEnv {
    db: Database,
    app_data_dir: PathBuf,
    backup_path: PathBuf,
    temp_dir: PathBuf,
}

impl TestEnv {
    fn new() -> TestEnv {
        let temp_dir = std::env::temp_dir().join(format!(
            "shiori_hardening_test_{}_{}",
            std::process::id(),
            rand_suffix()
        ));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();
        let db = Database::new(temp_dir.join("test.db")).unwrap();
        let app_data_dir = temp_dir.join("appdata");
        fs::create_dir_all(&app_data_dir).unwrap();
        TestEnv {
            db,
            app_data_dir,
            backup_path: temp_dir.join("backup.zip"),
            temp_dir,
        }
    }

    fn conn(&self) -> r2d2::PooledConnection<r2d2_sqlite::SqliteConnectionManager> {
        self.db.get_connection().unwrap()
    }
}

fn rand_suffix() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:x}", nanos)
}

fn insert_book(
    env: &TestEnv,
    uuid: &str,
    file_path: &str,
    is_managed: bool,
    managed_relpath: Option<&str>,
) {
    env.conn()
        .execute(
            "INSERT INTO books (uuid, title, file_path, file_format, is_managed, managed_relpath, language)
             VALUES (?1, 'Test Book', ?2, 'epub', ?3, ?4, 'eng')",
            rusqlite::params![uuid, file_path, is_managed, managed_relpath],
        )
        .unwrap();
}

fn count_rows(env: &TestEnv, table: &str) -> i64 {
    env.conn()
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
        .unwrap()
}

/// Hand-build a subset-style archive: manifest.json + arbitrary entries.
fn build_zip(
    env: &TestEnv,
    name: &str,
    manifest: &serde_json::Value,
    entries: &[(&str, &[u8])],
) -> PathBuf {
    let path = env.temp_dir.join(name);
    let file = fs::File::create(&path).unwrap();
    let mut zip = zip::ZipWriter::new(std::io::BufWriter::new(file));
    let opts = zip::write::SimpleFileOptions::default();
    zip.start_file("manifest.json", opts).unwrap();
    zip.write_all(manifest.to_string().as_bytes()).unwrap();
    for (entry, data) in entries {
        zip.start_file(entry, opts).unwrap();
        zip.write_all(data).unwrap();
    }
    zip.finish().unwrap();
    path
}

fn books_restore() -> RestoreSelection {
    RestoreSelection {
        categories: vec![BackupCategory::Books],
        conflict_policy: ConflictPolicy::Overwrite,
        include_credentials: false,
    }
}

/// (a) Crafted archive with traversal/absolute entry names: restore completes,
/// NOTHING is written outside the extraction roots, and every rejected entry
/// is counted in `skipped_invalid_paths`.
#[test]
fn test_crafted_zip_slip_entries_never_extract() {
    let env = TestEnv::new();

    // Full-snapshot archive (empty library.db is a valid SQLite database —
    // the ATTACH merge finds no tables and touches nothing). The file-tree
    // extraction sites are what this test exercises.
    let manifest = serde_json::json!({
        "version": "1.0",
        "created_at": "2024-01-01T00:00:00Z",
        "app_version": "test",
        "book_count": 0,
        "annotation_count": 0,
        "shelf_count": 0,
        "includes_books": false,
        "total_size_bytes": 0
    });
    let zip_path = build_zip(
        &env,
        "crafted.zip",
        &manifest,
        &[
            ("database/library.db", b""), // empty but valid SQLite → full-snapshot path
            ("covers/../../evil.txt", b"EVIL"),
            ("books//etc/cron.d/x", b"EVIL"),
            ("books/../escape.txt", b"EVIL"),
            ("books//tmp/abs.txt", b"EVIL"),
            ("sessions/../out", b"EVIL"),
            ("covers/ok_cover.jpg", b"JPG"),
            ("books/u-ok.epub", b"OK-BOOK"),
        ],
    );

    let report = backup_service::restore_backup(
        &env.db,
        &env.app_data_dir,
        &zip_path,
        &RestoreSelection {
            categories: vec![BackupCategory::Covers, BackupCategory::Books],
            conflict_policy: ConflictPolicy::Overwrite,
            include_credentials: false,
        },
    )
    .expect("crafted restore completes");

    // Every evil entry was rejected and reported.
    assert_eq!(report.skipped_invalid_paths, 4, "all 4 evil entries rejected");
    assert!(
        report.errors.iter().any(|e| e.contains("unsafe archive entry")),
        "rejections must be reported in errors: {:?}",
        report.errors
    );

    // Nothing escaped the extraction roots.
    assert!(!env.temp_dir.join("evil.txt").exists(), "covers/../../evil.txt escaped");
    assert!(!env.app_data_dir.join("storage/escape.txt").exists(), "books/../escape.txt escaped");
    assert!(!env.temp_dir.join("out").exists(), "sessions/../out escaped");
    assert!(
        !Path::new("/etc/cron.d/x").exists(),
        "books//etc/cron.d/x must not write"
    );
    assert!(
        !Path::new("/tmp/abs.txt").exists(),
        "books//tmp/abs.txt must not write"
    );

    // Legit entries still restore.
    assert!(env.app_data_dir.join("covers/ok_cover.jpg").exists());
    assert!(env.app_data_dir.join("storage/books/u-ok.epub").exists());
    assert_eq!(report.restored.get("covers"), Some(&1));
    assert_eq!(report.restored.get("books"), Some(&1));
}

/// (b) Non-managed manifest `file_path` "../relative.epub" and "" → skipped
/// with error entries, nothing written.
#[test]
fn test_non_managed_invalid_file_paths_skipped() {
    let env = TestEnv::new();
    insert_book(&env, "u-r1", "../relative.epub", false, None);
    insert_book(&env, "u-r2", "", false, None);

    let manifest = serde_json::json!({
        "version": "2.0",
        "schema_version": 2,
        "categories": ["books"],
        "book_files": {
            "u-r1": "books/u-r1.epub",
            "u-r2": "books/u-r2.epub"
        }
    });
    let zip_path = build_zip(
        &env,
        "relpaths.zip",
        &manifest,
        &[("books/u-r1.epub", b"R1"), ("books/u-r2.epub", b"R2")],
    );

    let report = backup_service::restore_backup(&env.db, &env.app_data_dir, &zip_path, &books_restore())
        .expect("restore completes");

    assert_eq!(report.skipped_invalid_paths, 2, "both invalid paths skipped");
    assert!(
        report.errors.iter().any(|e| e.contains("u-r1") && e.contains("../relative.epub")),
        "u-r1 must be reported: {:?}",
        report.errors
    );
    assert!(
        report.errors.iter().any(|e| e.contains("u-r2")),
        "u-r2 must be reported: {:?}",
        report.errors
    );
    assert!(
        report.restored.get("books").is_none(),
        "nothing may be restored"
    );
    assert!(!env.temp_dir.join("relative.epub").exists());
}

/// (c) Non-managed book with a valid absolute `file_path` whose parent EXISTS
/// → restored to its original path (same-machine restore feature preserved).
#[test]
fn test_non_managed_existing_parent_restored() {
    let env = TestEnv::new();
    fs::create_dir_all(env.app_data_dir.join("books_here")).unwrap();
    let target = env.app_data_dir.join("books_here/book_c.epub");
    insert_book(&env, "u-c", target.to_str().unwrap(), false, None);

    let manifest = serde_json::json!({
        "version": "2.0",
        "schema_version": 2,
        "categories": ["books"],
        "book_files": { "u-c": "books/u-c.epub" }
    });
    let zip_path = build_zip(&env, "valid.zip", &manifest, &[("books/u-c.epub", b"CONTENT-C")]);

    let report = backup_service::restore_backup(&env.db, &env.app_data_dir, &zip_path, &books_restore())
        .expect("restore completes");

    assert_eq!(report.restored.get("books"), Some(&1));
    assert_eq!(report.skipped, 0);
    assert_eq!(report.skipped_invalid_paths, 0);
    assert_eq!(fs::read(&target).unwrap(), b"CONTENT-C");
}

/// (d) Non-managed book whose parent does NOT exist → skipped, no crash, and
/// the missing directory is NOT created from manifest data.
#[test]
fn test_non_managed_missing_parent_skipped() {
    let env = TestEnv::new();
    let ghost = env.app_data_dir.join("ghost_dir/book_d.epub");
    insert_book(&env, "u-d", ghost.to_str().unwrap(), false, None);

    let manifest = serde_json::json!({
        "version": "2.0",
        "schema_version": 2,
        "categories": ["books"],
        "book_files": { "u-d": "books/u-d.epub" }
    });
    let zip_path = build_zip(&env, "ghost.zip", &manifest, &[("books/u-d.epub", b"D")]);

    let report = backup_service::restore_backup(&env.db, &env.app_data_dir, &zip_path, &books_restore())
        .expect("restore completes without crashing");

    assert_eq!(report.skipped_invalid_paths, 1);
    assert!(
        report.errors.iter().any(|e| e.contains("ghost_dir")),
        "missing parent must be reported: {:?}",
        report.errors
    );
    assert!(
        !env.app_data_dir.join("ghost_dir").exists(),
        "parent dir must not be created from manifest data"
    );
    assert!(report.restored.get("books").is_none());
}

/// (e) Managed `managed_relpath: "../escape"` → refused (canonicalized parent
/// escapes the canonical managed root); a normal relpath → restored under the
/// managed root even when its subdirectory doesn't exist yet.
#[test]
fn test_managed_relpath_escape_refused_normal_restored() {
    let env = TestEnv::new();
    insert_book(&env, "u-e1", "/tmp/unused1.epub", true, Some("../escape"));
    insert_book(&env, "u-e2", "/tmp/unused2.epub", true, Some("sub/book_e2.epub"));

    let manifest = serde_json::json!({
        "version": "2.0",
        "schema_version": 2,
        "categories": ["books"],
        "book_files": {
            "u-e1": "books/u-e1.epub",
            "u-e2": "books/u-e2.epub"
        }
    });
    let zip_path = build_zip(
        &env,
        "managed.zip",
        &manifest,
        &[("books/u-e1.epub", b"E1"), ("books/u-e2.epub", b"E2")],
    );

    let report = backup_service::restore_backup(&env.db, &env.app_data_dir, &zip_path, &books_restore())
        .expect("restore completes");

    assert_eq!(report.skipped_invalid_paths, 1, "escape relpath refused");
    assert!(
        report.errors.iter().any(|e| e.contains("u-e1") && e.contains("escapes")),
        "escape must be reported: {:?}",
        report.errors
    );
    assert!(
        !env.app_data_dir.join("escape").exists(),
        "../escape must not be written outside the managed root"
    );

    // Normal managed relpath restored under the managed root (dirs created).
    let managed = env.app_data_dir.join("Library/sub/book_e2.epub");
    assert!(managed.exists(), "managed book restored under the managed root");
    assert_eq!(fs::read(&managed).unwrap(), b"E2");
    assert_eq!(report.restored.get("books"), Some(&1));
}

/// (f) Legit Everything backup → restore → identical counts (regression:
/// hardening must not change the happy path).
#[test]
fn test_everything_round_trip_unchanged() {
    let src = TestEnv::new();
    insert_book(&src, "u-1", "/tmp/one.epub", false, None);
    insert_book(&src, "u-2", "/tmp/two.epub", false, None);
    {
        let conn = src.conn();
        let book1: i64 = conn
            .query_row("SELECT id FROM books WHERE uuid = 'u-1'", [], |r| r.get(0))
            .unwrap();
        conn.execute(
            "INSERT INTO annotations (book_id, type, location, color, created_at, updated_at)
             VALUES (?1, 'highlight', 'loc-1', '#FFEB3B', '2024-01-01', '2024-01-01')",
            rusqlite::params![book1],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO shelves (name, created_at) VALUES ('Favorites', '2024-01-01')",
            [],
        )
        .unwrap();
        let shelf_id: i64 = conn
            .query_row("SELECT id FROM shelves WHERE name = 'Favorites'", [], |r| r.get(0))
            .unwrap();
        conn.execute(
            "INSERT INTO shelf_books (shelf_id, book_id, added_at) VALUES (?1, ?2, '2024-01-01')",
            rusqlite::params![shelf_id, book1],
        )
        .unwrap();
    }
    fs::create_dir_all(src.app_data_dir.join("covers")).unwrap();
    fs::write(src.app_data_dir.join("covers/c1.jpg"), b"COVER").unwrap();

    backup_service::create_backup(
        &src.db,
        &src.app_data_dir,
        &src.backup_path,
        &BackupSelection::default(),
        None,
    )
    .expect("everything backup");

    let dst = TestEnv::new();
    let report = backup_service::restore_backup(
        &dst.db,
        &dst.app_data_dir,
        &src.backup_path,
        &RestoreSelection::default(),
    )
    .expect("everything restore");

    assert_eq!(count_rows(&dst, "books"), 2);
    assert_eq!(count_rows(&dst, "annotations"), 1);
    assert_eq!(count_rows(&dst, "shelves"), 1);
    assert_eq!(count_rows(&dst, "shelf_books"), 1);
    assert_eq!(report.skipped, 0);
    assert_eq!(report.skipped_invalid_paths, 0);
    assert_eq!(
        fs::read(dst.app_data_dir.join("covers/c1.jpg")).unwrap(),
        b"COVER",
        "covers still restore through the full path"
    );
}

/// (g) Backslash traversal entries are rejected too: `..\` after a forward-
/// slash prefix is caught by the `\` → `/` normalization in
/// `safe_archive_rel_path`, at both the covers site and the books site.
#[test]
fn test_backslash_traversal_rejected() {
    let env = TestEnv::new();
    insert_book(&env, "u-g", env.app_data_dir.join("g.epub").to_str().unwrap(), false, None);

    let manifest = serde_json::json!({
        "version": "2.0",
        "schema_version": 2,
        "categories": ["covers", "books"],
        "book_files": { "u-g": "books/..\\evil2.txt" }
    });
    let zip_path = build_zip(
        &env,
        "backslash.zip",
        &manifest,
        &[
            ("covers/..\\evil.txt", b"EVIL"),
            ("covers\\..\\evil.txt", b"EVIL"),
            ("books/..\\evil2.txt", b"EVIL"),
        ],
    );

    let report = backup_service::restore_backup(
        &env.db,
        &env.app_data_dir,
        &zip_path,
        &RestoreSelection {
            categories: vec![BackupCategory::Covers, BackupCategory::Books],
            conflict_policy: ConflictPolicy::Overwrite,
            include_credentials: false,
        },
    )
    .expect("restore completes");

    assert!(report.skipped_invalid_paths >= 2, "backslash traversal rejected");
    assert!(
        report.errors.iter().any(|e| e.contains("unsafe archive entry")),
        "rejections must be reported: {:?}",
        report.errors
    );
    assert!(!env.app_data_dir.join("evil.txt").exists());
    assert!(!env.app_data_dir.join("evil2.txt").exists());
    assert!(!env.temp_dir.join("evil.txt").exists());
}
