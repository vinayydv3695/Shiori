//! Integration tests for the backup service (Slice 4: selective backup).
//!
//! Covers: (a) Everything backup → restore → identical counts; (b) subset
//! restore re-links children by uuid; (c) conflict policies; (d) v1 manifests
//! restore as Everything; (e) credentials redaction; (f) unresolvable book
//! files are recorded and skipped.

use shiori::db::Database;
use shiori::models::{
    BackupCategory, BackupSelection, ConflictPolicy, RestoreReport, RestoreSelection,
};
use shiori::services::backup_service;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

struct TestEnv {
    db: Database,
    app_data_dir: PathBuf,
    backup_path: PathBuf,
}

impl TestEnv {
    fn new() -> TestEnv {
        let temp_dir = std::env::temp_dir().join(format!(
            "shiori_backup_test_{}_{}",
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
        }
    }

    /// Borrow a pooled connection (Derefs to rusqlite::Connection).
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

fn insert_book(env: &TestEnv, uuid: &str, title: &str, file_path: &str, file_hash: Option<&str>) {
    let conn = env.conn();
    conn.execute(
        "INSERT INTO books (uuid, title, file_path, file_format, file_hash, is_managed, language)
         VALUES (?1, ?2, ?3, 'epub', ?4, 0, 'eng')",
        rusqlite::params![uuid, title, file_path, file_hash],
    )
    .unwrap();
}

fn book_id_by_uuid(env: &TestEnv, uuid: &str) -> i64 {
    env.conn()
        .query_row("SELECT id FROM books WHERE uuid = ?1", rusqlite::params![uuid], |r| {
            r.get(0)
        })
        .unwrap()
}

fn count_rows(env: &TestEnv, table: &str) -> i64 {
    env.conn()
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
        .unwrap()
}

fn everything_selection() -> BackupSelection {
    BackupSelection::default()
}

fn cat_selection(cats: &[BackupCategory]) -> BackupSelection {
    BackupSelection {
        categories: cats.to_vec(),
        include_credentials: false,
        include_books: false,
        frontend_settings: false,
    }
}

fn restore_selection(cats: &[BackupCategory], policy: ConflictPolicy) -> RestoreSelection {
    RestoreSelection {
        categories: cats.to_vec(),
        conflict_policy: policy,
        include_credentials: false,
    }
}

/// (a) Everything backup → restore onto a fresh DB → identical counts.
#[test]
fn test_everything_backup_restore_counts() {
    let src = TestEnv::new();
    insert_book(&src, "u-1", "Book One", "/tmp/one.epub", Some("h1"));
    insert_book(&src, "u-2", "Book Two", "/tmp/two.epub", Some("h2"));
    {
        let conn = src.conn();
        let book1 = book_id_by_uuid(&src, "u-1");
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

    let info = backup_service::create_backup(
        &src.db,
        &src.app_data_dir,
        &src.backup_path,
        &everything_selection(),
        None,
    )
    .expect("everything backup");
    assert_eq!(info.schema_version, 2);
    assert_eq!(info.book_count, 2);
    assert!(info.categories.contains(&"library".to_string()));

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
}

/// (b) Annotations-only backup → restore onto a library with the SAME uuids
/// but DIFFERENT ids → annotations re-link to the right books.
#[test]
fn test_annotations_subset_restore_relinks_by_uuid() {
    let src = TestEnv::new();
    insert_book(&src, "u-1", "Book One", "/tmp/one.epub", Some("h1"));
    {
        let conn = src.conn();
        let book1 = book_id_by_uuid(&src, "u-1");
        conn.execute(
            "INSERT INTO annotations (book_id, type, location, note_content, color, created_at, updated_at)
             VALUES (?1, 'note', 'loc-9', 'my note', '#FFEB3B', '2024-02-02', '2024-02-02')",
            rusqlite::params![book1],
        )
        .unwrap();
    }

    backup_service::create_backup(
        &src.db,
        &src.app_data_dir,
        &src.backup_path,
        &cat_selection(&[BackupCategory::Annotations]),
        None,
    )
    .expect("annotations backup");

    // Target library: same uuid but different id (dummy book first).
    let dst = TestEnv::new();
    insert_book(&dst, "dummy", "Dummy", "/tmp/dummy.epub", Some("hd"));
    insert_book(&dst, "u-1", "Book One (target)", "/tmp/one-target.epub", Some("h1"));

    let report = backup_service::restore_backup(
        &dst.db,
        &dst.app_data_dir,
        &src.backup_path,
        &restore_selection(&[BackupCategory::Annotations], ConflictPolicy::Skip),
    )
    .expect("annotations restore");

    let target_book_id = book_id_by_uuid(&dst, "u-1");
    assert_ne!(target_book_id, 1, "target book should have a different id");
    let ann_book_id: i64 = dst
        .conn()
        .query_row("SELECT book_id FROM annotations LIMIT 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(ann_book_id, target_book_id, "annotation re-linked to target book");
    let note: String = dst
        .conn()
        .query_row("SELECT note_content FROM annotations LIMIT 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(note, "my note");
    // The 5 default annotation_categories already exist in the target (Skip
    // policy) — they are reported as skipped, the annotation itself restored.
    assert_eq!(report.restored.get("annotations"), Some(&1));
    assert_eq!(report.skipped, 5);
}

/// (c) Conflict policies on the Library category:
/// skip → no duplicate, original untouched; overwrite → values replaced;
/// keep_both → new rows with new ids/uuids.
#[test]
fn test_conflict_policies() {
    let src = TestEnv::new();
    insert_book(&src, "u-1", "Original Title", "/tmp/orig.epub", Some("h1"));
    backup_service::create_backup(
        &src.db,
        &src.app_data_dir,
        &src.backup_path,
        &cat_selection(&[BackupCategory::Library]),
        None,
    )
    .expect("library backup");

    // ── Skip ──
    let dst = TestEnv::new();
    insert_book(&dst, "u-1", "Existing Title", "/tmp/existing.epub", Some("h1"));
    insert_book(&dst, "u-2", "Only In Target", "/tmp/target-only.epub", Some("h2"));
    backup_service::restore_backup(
        &dst.db,
        &dst.app_data_dir,
        &src.backup_path,
        &restore_selection(&[BackupCategory::Library], ConflictPolicy::Skip),
    )
    .expect("skip restore");
    assert_eq!(count_rows(&dst, "books"), 2, "skip must not duplicate");
    let title: String = dst
        .conn()
        .query_row("SELECT title FROM books WHERE uuid = 'u-1'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(title, "Existing Title", "skip keeps existing row");

    // ── Overwrite ──
    backup_service::restore_backup(
        &dst.db,
        &dst.app_data_dir,
        &src.backup_path,
        &restore_selection(&[BackupCategory::Library], ConflictPolicy::Overwrite),
    )
    .expect("overwrite restore");
    assert_eq!(count_rows(&dst, "books"), 2, "overwrite must not duplicate");
    let title: String = dst
        .conn()
        .query_row("SELECT title FROM books WHERE uuid = 'u-1'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(title, "Original Title", "overwrite replaces values");
    let u2_title: String = dst
        .conn()
        .query_row("SELECT title FROM books WHERE uuid = 'u-2'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(u2_title, "Only In Target", "overwrite leaves unrelated rows");

    // ── KeepBoth ──
    backup_service::restore_backup(
        &dst.db,
        &dst.app_data_dir,
        &src.backup_path,
        &restore_selection(&[BackupCategory::Library], ConflictPolicy::KeepBoth),
    )
    .expect("keep_both restore");
    assert_eq!(count_rows(&dst, "books"), 3, "keep_both inserts new rows");
    let uuids: Vec<String> = dst
        .conn()
        .prepare("SELECT uuid FROM books WHERE title = 'Original Title'")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<std::result::Result<_, _>>()
        .unwrap();
    assert_eq!(uuids.len(), 2, "two copies of the original book");
    assert_ne!(uuids[0], uuids[1], "keep_both books get fresh uuids");
}

/// (d) Hand-crafted v1 manifest (no categories/schema_version) restores as
/// Everything via the legacy ATTACH path.
#[test]
fn test_v1_manifest_restores_as_everything() {
    let src = TestEnv::new();
    insert_book(&src, "u-1", "V1 Book", "/tmp/v1.epub", Some("hv1"));

    // Build a v1-style archive by hand: manifest with only v1 fields +
    // database/library.db (VACUUM INTO snapshot).
    let v1_path = src.app_data_dir.join("v1_backup.zip");
    {
        let conn = src.conn();
        let snapshot = src.app_data_dir.join("v1_library.db");
        conn.execute_batch(&format!(
            "VACUUM INTO '{}'",
            snapshot.display().to_string().replace('\'', "''")
        ))
        .unwrap();

        let file = fs::File::create(&v1_path).unwrap();
        let mut zip = zip::ZipWriter::new(std::io::BufWriter::new(file));
        let options = zip::write::SimpleFileOptions::default();
        let manifest = serde_json::json!({
            "version": "1.0",
            "created_at": "2024-01-01T00:00:00Z",
            "app_version": "0.1.0",
            "book_count": 1,
            "annotation_count": 0,
            "shelf_count": 0,
            "includes_books": false,
            "total_size_bytes": 0
        });
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(manifest.to_string().as_bytes()).unwrap();
        zip.start_file("database/library.db", options).unwrap();
        zip.write_all(&fs::read(&snapshot).unwrap()).unwrap();
        zip.finish().unwrap();
    }

    // get_backup_info must parse a v1 manifest.
    let info = backup_service::get_backup_info(&v1_path).expect("v1 manifest parses");
    assert_eq!(info.schema_version, 0, "v1 manifest has no schema_version");
    assert!(info.categories.is_empty(), "v1 manifest has no categories");

    let dst = TestEnv::new();
    let report = backup_service::restore_backup(
        &dst.db,
        &dst.app_data_dir,
        &v1_path,
        &RestoreSelection::default(),
    )
    .expect("v1 restore");
    assert_eq!(count_rows(&dst, "books"), 1, "v1 restore is Everything");
    assert_eq!(report.skipped, 0);
}

/// (e) Credentials redacted by default; restored only with include_credentials.
#[test]
fn test_credentials_redaction() {
    // Source with credentials.
    let src = TestEnv::new();
    fs::create_dir_all(&src.app_data_dir).unwrap();
    fs::write(
        src.app_data_dir.join("sources.json"),
        r#"{"torbox.api_key":"super-secret","toongod.flaresolverr_url":"http://fs:8191"}"#,
    )
    .unwrap();

    // Backup WITHOUT credentials → redacted, no api key in the archive.
    let redacted_sel = BackupSelection {
        categories: vec![BackupCategory::Sources],
        include_credentials: false,
        include_books: false,
        frontend_settings: false,
    };
    backup_service::create_backup(&src.db, &src.app_data_dir, &src.backup_path, &redacted_sel, None)
        .expect("sources backup (redacted)");

    {
        let file = fs::File::open(&src.backup_path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut content = String::new();
        archive
            .by_name("category_sources.json")
            .unwrap()
            .read_to_string(&mut content)
            .unwrap();
        let json: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(json["redacted"], serde_json::Value::Bool(true));
        assert!(
            json["store"].get("torbox.api_key").is_none(),
            "api key must be redacted"
        );
        assert_eq!(
            json["store"]["toongod.flaresolverr_url"],
            serde_json::Value::String("http://fs:8191".to_string()),
            "non-credential keys survive"
        );
    }

    // Restore (without credentials) → api key absent.
    let dst = TestEnv::new();
    backup_service::restore_backup(
        &dst.db,
        &dst.app_data_dir,
        &src.backup_path,
        &restore_selection(&[BackupCategory::Sources], ConflictPolicy::Overwrite),
    )
    .expect("sources restore (redacted)");
    let restored: String = fs::read_to_string(dst.app_data_dir.join("sources.json")).unwrap();
    assert!(!restored.contains("super-secret"), "redacted restore has no key");
    assert!(restored.contains("flaresolverr_url"));

    // Backup WITH credentials → key present; restore with include_credentials
    // → key written.
    let cred_sel = BackupSelection {
        categories: vec![BackupCategory::Sources],
        include_credentials: true,
        include_books: false,
        frontend_settings: false,
    };
    let cred_path = dst.app_data_dir.join("cred.zip");
    backup_service::create_backup(&src.db, &src.app_data_dir, &cred_path, &cred_sel, None)
        .expect("sources backup (with credentials)");
    {
        let file = fs::File::open(&cred_path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut content = String::new();
        archive
            .by_name("category_sources.json")
            .unwrap()
            .read_to_string(&mut content)
            .unwrap();
        let json: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(json["redacted"], serde_json::Value::Bool(false));
        assert_eq!(
            json["store"]["torbox.api_key"],
            serde_json::Value::String("super-secret".to_string())
        );
    }
    let dst2 = TestEnv::new();
    let sel = RestoreSelection {
        categories: vec![BackupCategory::Sources],
        conflict_policy: ConflictPolicy::Overwrite,
        include_credentials: true,
    };
    backup_service::restore_backup(&dst2.db, &dst2.app_data_dir, &cred_path, &sel)
        .expect("sources restore (with credentials)");
    let restored: String = fs::read_to_string(dst2.app_data_dir.join("sources.json")).unwrap();
    assert!(restored.contains("super-secret"), "credentials restored");
}

/// (f) Unresolvable book file → recorded in skipped_files, backup succeeds.
#[test]
fn test_unresolvable_book_file_skipped() {
    let src = TestEnv::new();
    let missing = src.app_data_dir.join("does_not_exist.epub");
    insert_book(&src, "u-1", "Ghost Book", missing.to_str().unwrap(), Some("hghost"));

    let sel = cat_selection(&[BackupCategory::Library, BackupCategory::Books]);
    let info = backup_service::create_backup(&src.db, &src.app_data_dir, &src.backup_path, &sel, None)
        .expect("backup with unresolvable file succeeds");
    assert_eq!(info.skipped_files.len(), 1);
    assert!(info.skipped_files[0].ends_with("does_not_exist.epub"));
    assert!(info.book_files.is_empty(), "no book files zipped");
}

/// Preferences singleton: overwrite replaces fields, skip keeps them.
#[test]
fn test_preferences_restore_policy() {
    let src = TestEnv::new();
    {
        let conn = src.conn();
        conn.execute(
            "UPDATE user_preferences SET theme = 'sepia', auto_start = 1 WHERE id = 1",
            [],
        )
        .unwrap();
    }
    backup_service::create_backup(
        &src.db,
        &src.app_data_dir,
        &src.backup_path,
        &cat_selection(&[BackupCategory::Preferences]),
        None,
    )
    .expect("preferences backup");

    // Skip: existing row untouched.
    let dst = TestEnv::new();
    backup_service::restore_backup(
        &dst.db,
        &dst.app_data_dir,
        &src.backup_path,
        &restore_selection(&[BackupCategory::Preferences], ConflictPolicy::Skip),
    )
    .expect("preferences skip restore");
    let theme: String = dst
        .conn()
        .query_row("SELECT theme FROM user_preferences WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(theme, "black", "skip keeps existing preferences");

    // Overwrite: fields replaced on the singleton row.
    backup_service::restore_backup(
        &dst.db,
        &dst.app_data_dir,
        &src.backup_path,
        &restore_selection(&[BackupCategory::Preferences], ConflictPolicy::Overwrite),
    )
    .expect("preferences overwrite restore");
    let theme: String = dst
        .conn()
        .query_row("SELECT theme FROM user_preferences WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(theme, "sepia", "overwrite replaces preference fields");
}

/// (g) Full restore must cover EVERY table the baseline restore touched —
/// including the orphan tables that no category maps to (reading_goals,
/// shares, conversion_*, cover_cache, book/manga_preference_overrides,
/// library_settings, onboarding_state, metadata_cache, doodles). Regression:
/// the category filter in the full-snapshot path silently dropped them.
#[test]
fn test_full_restore_covers_all_baseline_tables() {
    let src = TestEnv::new();
    insert_book(&src, "u-1", "Book One", "/tmp/one.epub", Some("h1"));
    let book1 = book_id_by_uuid(&src, "u-1");
    {
        let conn = src.conn();
        // Orphan tables (no category mapping) — the regression set.
        conn.execute(
            "INSERT INTO reading_goals (daily_minutes_target, is_active) VALUES (45, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO shares (token, book_id, format, expires_at) VALUES ('tok-1', ?1, 'epub', '2025-01-01')",
            rusqlite::params![book1],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO share_access_log (share_token, accessed_at) VALUES ('tok-1', '2025-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO conversion_jobs (id, book_id, source_format, target_format, source_path, target_path, status)
             VALUES ('cj-1', ?1, 'epub', 'pdf', '/tmp/a.epub', '/tmp/a.pdf', 'completed')",
            rusqlite::params![book1],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO conversion_profiles (name, source_format, target_format)
             VALUES ('profile-1', 'epub', 'pdf')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO cover_cache (book_id, size, file_path, file_size, width, height)
             VALUES (?1, 'thumb', '/tmp/c.jpg', 100, 50, 75)",
            rusqlite::params![book1],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO book_preference_overrides (book_id, font_family) VALUES (?1, 'Georgia')",
            rusqlite::params![book1],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO manga_preference_overrides (book_id, mode) VALUES (?1, 'rtl')",
            rusqlite::params![book1],
        )
        .unwrap();
        conn.execute("UPDATE library_settings SET default_sort_field = 'title' WHERE id = 1", [])
            .unwrap();
        conn.execute("UPDATE conversion_settings SET default_output_format = 'mobi' WHERE id = 1", [])
            .unwrap();
        conn.execute("UPDATE onboarding_state SET completed = 1 WHERE id = 1", []).unwrap();
        conn.execute(
            "INSERT INTO metadata_cache (provider, query_hash, response_json, expires_at)
             VALUES ('openlibrary', 'q1', '{}', '2025-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO doodles (book_id, page_number, strokes_json) VALUES (?1, 'p1', '[]')",
            rusqlite::params![book1],
        )
        .unwrap();
        // Mapped tables that must also round-trip through the full path.
        conn.execute("UPDATE user_preferences SET theme = 'sepia' WHERE id = 1", []).unwrap();
        conn.execute("UPDATE rss_settings SET auto_download = 1 WHERE id = 1", []).unwrap();
    }

    // Pre-restore counts per baseline table (only tables that exist in the DB;
    // `tts_preferences` was never a real table).
    let mut pre_counts: Vec<(&str, i64)> = Vec::new();
    for table in backup_service::FULL_TABLES {
        let exists: bool = src
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                rusqlite::params![table],
                |r| {
                    let c: i32 = r.get(0)?;
                    Ok(c > 0)
                },
            )
            .unwrap();
        if exists {
            pre_counts.push((table, count_rows(&src, table)));
        }
    }
    // Sanity: the orphan tables were actually exercised.
    assert!(pre_counts.iter().any(|(t, _)| *t == "reading_goals"));
    assert!(pre_counts.iter().any(|(t, _)| *t == "conversion_jobs"));
    assert!(pre_counts.iter().any(|(t, _)| *t == "doodles"));

    backup_service::create_backup(
        &src.db,
        &src.app_data_dir,
        &src.backup_path,
        &everything_selection(),
        None,
    )
    .expect("full backup");

    let dst = TestEnv::new();
    backup_service::restore_backup(
        &dst.db,
        &dst.app_data_dir,
        &src.backup_path,
        &RestoreSelection::default(),
    )
    .expect("full restore");

    // Every baseline table has its rows back (counts equal pre/post).
    for (table, pre) in pre_counts {
        assert_eq!(
            count_rows(&dst, table),
            pre,
            "table '{table}' lost rows on full restore"
        );
    }

    // Value round-trips for the singleton tables — count equality alone is not
    // enough, a fresh DB already carries their default row.
    let theme: String = dst
        .conn()
        .query_row("SELECT theme FROM user_preferences WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(theme, "sepia");
    let completed: i64 = dst
        .conn()
        .query_row("SELECT completed FROM onboarding_state WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(completed, 1);
    let fmt: String = dst
        .conn()
        .query_row("SELECT default_output_format FROM conversion_settings WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(fmt, "mobi");
    let sort: String = dst
        .conn()
        .query_row("SELECT default_sort_field FROM library_settings WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(sort, "title");
    let auto: i64 = dst
        .conn()
        .query_row("SELECT auto_download FROM rss_settings WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(auto, 1);
    let goals: i64 = dst
        .conn()
        .query_row("SELECT COUNT(*) FROM reading_goals", [], |r| r.get(0))
        .unwrap();
    assert_eq!(goals, 2);
}

/// (h) A subset selection against a FULL archive is rejected at the command
/// layer (`validate_restore_selection`) instead of silently re-inserting child
/// rows with backup-side book ids. Subset-of-subset and Everything-of-full
/// stay allowed.
#[test]
fn test_subset_restore_of_full_archive_rejected() {
    let src = TestEnv::new();
    insert_book(&src, "u-1", "Book One", "/tmp/one.epub", Some("h1"));
    backup_service::create_backup(
        &src.db,
        &src.app_data_dir,
        &src.backup_path,
        &everything_selection(),
        None,
    )
    .expect("full backup");

    let err = backup_service::validate_restore_selection(
        &src.backup_path,
        &restore_selection(&[BackupCategory::Progress], ConflictPolicy::Overwrite),
    )
    .expect_err("subset-of-full must be rejected");
    let msg = err.to_string();
    assert!(
        msg.contains("full") && msg.contains("subset"),
        "unhelpful error message: {msg}"
    );

    // Same selection against a SUBSET archive is allowed.
    let subset_path = src.app_data_dir.join("subset.zip");
    backup_service::create_backup(
        &src.db,
        &src.app_data_dir,
        &subset_path,
        &cat_selection(&[BackupCategory::Progress]),
        None,
    )
    .expect("subset backup");
    backup_service::validate_restore_selection(
        &subset_path,
        &restore_selection(&[BackupCategory::Progress], ConflictPolicy::Overwrite),
    )
    .expect("subset-of-subset is allowed");

    // Everything restore of the full archive is allowed.
    backup_service::validate_restore_selection(&src.backup_path, &RestoreSelection::default())
        .expect("everything restore of full archive is allowed");
}

// Silence unused-import warnings for helpers used across tests.
#[allow(dead_code)]
fn _unused(_: &RestoreReport) {}
#[allow(dead_code)]
fn _path(_: &Path) {}

// ─── Transactional-restore tests ────────────────────────────────────────────

/// Build a full-snapshot archive (manifest.json + database/library.db) from
/// `src`'s database via VACUUM INTO — the same shape create_backup produces
/// for Everything backups.
fn build_full_archive(src: &TestEnv, zip_path: &Path) {
    let temp_dir = std::env::temp_dir().join(format!("shiori_backup_snap_{}_{}", std::process::id(), rand_suffix()));
    fs::create_dir_all(&temp_dir).unwrap();
    let snap = temp_dir.join("library.db");
    {
        let conn = src.conn();
        conn.execute_batch(&format!(
            "VACUUM INTO '{}'",
            snap.display().to_string().replace('\'', "''")
        ))
        .unwrap();
    }

    let file = fs::File::create(zip_path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default();
    zip.start_file("manifest.json", opts).unwrap();
    zip.write_all(
        br#"{"version":"2.0","created_at":"2025-01-01T00:00:00Z","app_version":"test","book_count":2,"annotation_count":1,"shelf_count":0,"includes_books":false,"total_size_bytes":0,"schema_version":2,"categories":["library","annotations","progress","preferences","sources","rss","covers","books"],"category_counts":{},"skipped_files":[],"book_files":{}}"#,
    )
    .unwrap();
    zip.start_file("database/library.db", opts).unwrap();
    zip.write_all(&fs::read(&snap).unwrap()).unwrap();
    zip.finish().unwrap();
    let _ = fs::remove_dir_all(&temp_dir);
}

/// Rewrite `src_zip` to `out_zip` with `entry_name` replaced by garbage.
fn corrupt_zip_entry(src_zip: &Path, out_zip: &Path, entry_name: &str) {
    let file = fs::File::open(src_zip).unwrap();
    let mut archive = zip::ZipArchive::new(file).unwrap();
    let out = fs::File::create(out_zip).unwrap();
    let mut w = zip::ZipWriter::new(out);
    let opts = zip::write::SimpleFileOptions::default();
    for i in 0..archive.len() {
        let mut f = archive.by_index(i).unwrap();
        let name = f.name().to_string();
        w.start_file(&name, opts).unwrap();
        if name == entry_name {
            w.write_all(b"{ this is not valid json !!!").unwrap();
        } else {
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).unwrap();
            w.write_all(&buf).unwrap();
        }
    }
    w.finish().unwrap();
}

/// Full-snapshot restore must be atomic: a mid-restore failure (here: the
/// backup's annotations row violates the live table's CHECK constraint, so the
/// INSERT fails after books were already DELETEd) rolls back EVERY table — the
/// library is not left half-wiped.
#[test]
fn test_full_restore_failure_rolls_back() {
    let main = TestEnv::new();
    insert_book(&main, "u-main", "Main Book", "/tmp/main.epub", Some("h-main"));
    {
        let conn = main.conn();
        let book_id = book_id_by_uuid(&main, "u-main");
        conn.execute(
            "INSERT INTO annotations (book_id, type, location, created_at) VALUES (?1, 'highlight', 'loc-1', '2025-01-01')",
            rusqlite::params![book_id],
        )
        .unwrap();
    }

    // Backup DB: two books + an annotations row with an illegal `type`.
    // `ignore_check_constraints` lets the corrupt row INTO the backup so the
    // RESTORE side (which has the constraint active) fails mid-way.
    let bkp = TestEnv::new();
    insert_book(&bkp, "u-b1", "Backup Book 1", "/tmp/b1.epub", Some("h-b1"));
    insert_book(&bkp, "u-b2", "Backup Book 2", "/tmp/b2.epub", Some("h-b2"));
    {
        let conn = bkp.conn();
        conn.execute_batch("PRAGMA ignore_check_constraints = ON;").unwrap();
        let book_id = book_id_by_uuid(&bkp, "u-b1");
        conn.execute(
            "INSERT INTO annotations (book_id, type, location, created_at) VALUES (?1, 'bogus', 'loc-x', '2025-01-01')",
            rusqlite::params![book_id],
        )
        .unwrap();
        conn.execute_batch("PRAGMA ignore_check_constraints = OFF;").unwrap();
    }

    let zip_path = main.backup_path.with_extension("full.zip");
    build_full_archive(&bkp, &zip_path);

    let err = backup_service::restore_backup(
        &main.db,
        &main.app_data_dir,
        &zip_path,
        &RestoreSelection::default(),
    )
    .expect_err("restore must fail on the corrupt annotations row");
    assert!(
        err.to_string().contains("CHECK") || err.to_string().contains("annotations"),
        "unexpected error: {err}"
    );

    // Rolled back: original book + annotation intact, backup rows not present.
    assert_eq!(count_rows(&main, "books"), 1, "books table was half-restored");
    assert_eq!(count_rows(&main, "annotations"), 1, "annotations were wiped");
    let title: String = main
        .conn()
        .query_row(
            "SELECT title FROM books WHERE uuid = 'u-main'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(title, "Main Book");
    let ty: String = main
        .conn()
        .query_row("SELECT type FROM annotations", [], |r| r.get(0))
        .unwrap();
    assert_eq!(ty, "highlight");
}

/// Subset restore must be atomic too: a corrupt category JSON mid-restore
/// rolls back the categories that already imported (no half-imported library).
#[test]
fn test_subset_restore_failure_rolls_back() {
    let src = TestEnv::new();
    insert_book(&src, "u-1", "Book One", "/tmp/one.epub", Some("h1"));
    backup_service::create_backup(
        &src.db,
        &src.app_data_dir,
        &src.backup_path,
        &cat_selection(&[BackupCategory::Library, BackupCategory::Annotations]),
        None,
    )
    .expect("subset backup");

    // Corrupt the Annotations JSON so the restore fails AFTER Library imports.
    let corrupt_path = src.backup_path.with_extension("corrupt.zip");
    corrupt_zip_entry(&src.backup_path, &corrupt_path, "category_annotations.json");

    let dst = TestEnv::new();
    let err = backup_service::restore_backup(
        &dst.db,
        &dst.app_data_dir,
        &corrupt_path,
        &restore_selection(
            &[BackupCategory::Library, BackupCategory::Annotations],
            ConflictPolicy::Overwrite,
        ),
    )
    .expect_err("restore must fail on the corrupt annotations JSON");
    assert!(
        err.to_string().contains("Serialization") || err.to_string().contains("category_annotations"),
        "unexpected error: {err}"
    );

    // The Library category imported before the failure must be rolled back.
    assert_eq!(count_rows(&dst, "books"), 0, "library rows leaked from failed restore");
    assert_eq!(count_rows(&dst, "authors"), 0);
    assert_eq!(count_rows(&dst, "annotations"), 0);
}
