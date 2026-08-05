//! SAF (Android Storage Access Framework) bridge for Mode B managed books.
//!
//! Services are AppHandle-free by design, so the SAF tree handle lives in a
//! process-global [`OnceLock`] installed once at app setup on Android (see
//! `lib.rs`). On desktop/tests the global is never set and every caller
//! degrades to local-filesystem-only behaviour — exactly the pre-Mode-B
//! semantics. Unit tests can exercise SAF-aware paths by passing a
//! [`SafTree`] fake directly (see `ingest_service::SafPush` and
//! [`build_migrate_report`]).

use std::path::Path;
use std::sync::OnceLock;

use crate::db::Database;
use crate::error::Result;
use crate::models::MigrateReport;

/// Operations against a user-chosen SAF tree URI. Implemented on Android by
/// the local android-saf plugin (`create_file_in_tree` /
/// `write_document` / `delete_file_in_tree`); desktop builds never install
/// an implementation.
pub trait SafTree: Send + Sync {
    /// Create a new document inside `tree_uri` and return its document URI.
    fn create_file(&self, tree_uri: &str, file_name: &str, mime_type: &str) -> Result<String>;
    /// Write the bytes of a local file into an existing document URI.
    fn write_document(&self, doc_uri: &str, local_path: &Path) -> Result<()>;
    /// Delete the document at `relpath` inside `tree_uri` (idempotent —
    /// a missing document counts as success, mirroring
    /// `remove_managed_book_file`).
    fn delete_file(&self, tree_uri: &str, relpath: &str) -> Result<()>;
}

static SAF_TREE: OnceLock<Box<dyn SafTree>> = OnceLock::new();

/// Install the process-wide SAF tree handle (Android setup only).
/// Fails if already installed — a second install is a programming error.
pub fn set_saf_tree(tree: Box<dyn SafTree>) -> Result<()> {
    SAF_TREE
        .set(tree)
        .map_err(|_| crate::error::ShioriError::Other("SAF tree already installed".to_string()))
}

/// The installed SAF tree handle, if any (Android only).
pub fn saf_tree() -> Option<&'static dyn SafTree> {
    SAF_TREE.get().map(|b| b.as_ref())
}

/// Best-effort MIME type for a managed book file name, keyed by extension.
/// Falls back to `application/octet-stream` for anything unknown.
pub fn mime_for_file_name(file_name: &str) -> &'static str {
    let ext = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "epub" => "application/epub+zip",
        "pdf" => "application/pdf",
        "cbz" => "application/vnd.comicbook+zip",
        "cbr" => "application/vnd.comicbook-rar",
        "mobi" => "application/x-mobi8-ebook",
        "azw3" | "azw" => "application/vnd.amazon.ebook",
        "fb2" => "application/x-fictionbook+xml",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "txt" => "text/plain",
        "html" | "htm" => "text/html",
        "md" => "text/markdown",
        "djvu" => "image/vnd.djvu",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
}

/// One-time Mode A → Mode B migration: copy every managed book's local file
/// into the SAF tree under its `managed_relpath`.
///
/// Each row's `file_path` is the source of truth for the local copy (for
/// managed books it is `root.join(managed_relpath)` — the app Library dir in
/// Mode A, the local mirror in Mode B). Per-file failures are recorded in
/// the report and never abort the run. The preference flip
/// (`library_mode='saf'` + `library_root_uri`) happens only when every file
/// migrated cleanly — otherwise the app stays in Mode A and the UI can show
/// the failures (the local mirror still holds every file, so nothing is lost
/// either way).
///
/// Factorable behind [`SafTree`] so the whole report builder is unit-testable
/// with a fake (no Android device required).
pub fn build_migrate_report(db: &Database, uri: &str, tree: &dyn SafTree) -> Result<MigrateReport> {
    let conn = db.get_connection()?;

    let rows: Vec<(String, String)> = {
        let mut stmt = conn.prepare(
            "SELECT managed_relpath, file_path FROM books \
             WHERE is_managed = 1 AND managed_relpath IS NOT NULL AND managed_relpath != ''",
        )?;
        let mapped = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        mapped.collect::<std::result::Result<Vec<_>, _>>()?
    };

    let mut report = MigrateReport {
        migrated: 0,
        failed: Vec::new(),
    };

    for (relpath, local_path) in rows {
        let local = Path::new(&local_path);
        if !local.is_file() {
            report.failed.push((relpath, "local file missing".to_string()));
            continue;
        }
        match tree.create_file(uri, &relpath, mime_for_file_name(&relpath)) {
            Ok(doc_uri) => match tree.write_document(&doc_uri, local) {
                Ok(()) => report.migrated += 1,
                Err(e) => report.failed.push((relpath, format!("write: {e}"))),
            },
            Err(e) => report.failed.push((relpath, format!("create: {e}"))),
        }
    }

    if report.failed.is_empty() {
        conn.execute(
            "UPDATE user_preferences SET library_mode = 'saf', library_root_uri = ?1 WHERE id = 1",
            [uri],
        )?;
        log::info!(
            "[saf] migrated {} managed book(s) to SAF tree {}; library_mode → 'saf'",
            report.migrated,
            uri
        );
    } else {
        log::warn!(
            "[saf] migration to SAF tree {} finished with {}/{} failures — \
             keeping library_mode = 'app'",
            uri,
            report.failed.len(),
            report.migrated + report.failed.len() as u64
        );
    }

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::sync::{Arc, Mutex};

    /// Fake SAF tree: records calls, fails on demand.
    #[derive(Default)]
    pub struct FakeSafTree {
        pub calls: Mutex<Vec<String>>,
        pub fail_create: Mutex<bool>,
        pub fail_write: Mutex<bool>,
    }

    impl SafTree for FakeSafTree {
        fn create_file(&self, tree_uri: &str, file_name: &str, _mime: &str) -> Result<String> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("create:{tree_uri}/{file_name}"));
            if *self.fail_create.lock().unwrap() {
                return Err(crate::error::ShioriError::Other(
                    "fake create failure".to_string(),
                ));
            }
            Ok(format!("content://fake/doc/{file_name}"))
        }
        fn write_document(&self, _doc_uri: &str, _local_path: &Path) -> Result<()> {
            self.calls.lock().unwrap().push("write".to_string());
            if *self.fail_write.lock().unwrap() {
                return Err(crate::error::ShioriError::Other(
                    "fake write failure".to_string(),
                ));
            }
            Ok(())
        }
        fn delete_file(&self, tree_uri: &str, relpath: &str) -> Result<()> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("delete:{tree_uri}/{relpath}"));
            Ok(())
        }
    }

    impl FakeSafTree {
        pub fn shared() -> Arc<FakeSafTree> {
            Arc::new(FakeSafTree::default())
        }
    }

    fn insert_managed_book(
        conn: &rusqlite::Connection,
        title: &str,
        relpath: &str,
        local_path: &str,
    ) {
        conn.execute(
            "INSERT INTO books (uuid, title, file_path, file_format, is_managed, origin, managed_relpath) \
             VALUES (?1, ?2, ?3, 'pdf', 1, 'open_with', ?4)",
            rusqlite::params![format!("uuid-{title}"), title, local_path, relpath],
        )
        .unwrap();
    }

    #[test]
    fn migrate_report_moves_files_and_flips_mode() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Database::new(&tmp.path().join("test.db")).unwrap();
        let conn = db.get_connection().unwrap();
        let app_dir = tmp.path().join("app");
        let lib_dir = app_dir.join("Library");
        std::fs::create_dir_all(&lib_dir).unwrap();

        insert_managed_book(&conn, "a", "a.pdf", lib_dir.join("a.pdf").to_str().unwrap());
        insert_managed_book(&conn, "b", "b.pdf", lib_dir.join("b.pdf").to_str().unwrap());
        std::fs::write(lib_dir.join("a.pdf"), b"aaa").unwrap();
        std::fs::write(lib_dir.join("b.pdf"), b"bbb").unwrap();

        let tree = FakeSafTree::shared();
        let report = build_migrate_report(&db, "content://tree/1", tree.as_ref())
            .unwrap();

        assert_eq!(report.migrated, 2);
        assert!(report.failed.is_empty());
        assert_eq!(tree.calls.lock().unwrap().len(), 4); // 2 × (create + write)

        let (mode, uri): (String, String) = conn
            .query_row(
                "SELECT library_mode, library_root_uri FROM user_preferences WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(mode, "saf");
        assert_eq!(uri, "content://tree/1");
    }

    #[test]
    fn migrate_report_records_failures_and_keeps_mode() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Database::new(&tmp.path().join("test.db")).unwrap();
        let conn = db.get_connection().unwrap();
        let app_dir = tmp.path().join("app");
        let lib_dir = app_dir.join("Library");
        std::fs::create_dir_all(&lib_dir).unwrap();

        // Present + readable local file.
        insert_managed_book(&conn, "a", "a.pdf", lib_dir.join("a.pdf").to_str().unwrap());
        std::fs::write(lib_dir.join("a.pdf"), b"aaa").unwrap();
        // Local file missing → must be reported, not fatal.
        insert_managed_book(&conn, "b", "b.pdf", lib_dir.join("b.pdf").to_str().unwrap());

        let tree = FakeSafTree::shared();
        let report = build_migrate_report(&db, "content://tree/2", tree.as_ref())
            .unwrap();

        assert_eq!(report.migrated, 1);
        assert_eq!(report.failed.len(), 1);
        assert_eq!(report.failed[0].0, "b.pdf");
        assert!(report.failed[0].1.contains("missing"));

        // Failures → mode must stay 'app'.
        let mode: String = conn
            .query_row(
                "SELECT library_mode FROM user_preferences WHERE id = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(mode, "app");
    }

    #[test]
    fn migrate_report_continues_after_write_failure() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Database::new(&tmp.path().join("test.db")).unwrap();
        let conn = db.get_connection().unwrap();
        let app_dir = tmp.path().join("app");
        let lib_dir = app_dir.join("Library");
        std::fs::create_dir_all(&lib_dir).unwrap();

        insert_managed_book(&conn, "a", "a.pdf", lib_dir.join("a.pdf").to_str().unwrap());
        insert_managed_book(&conn, "b", "b.pdf", lib_dir.join("b.pdf").to_str().unwrap());
        std::fs::write(lib_dir.join("a.pdf"), b"aaa").unwrap();
        std::fs::write(lib_dir.join("b.pdf"), b"bbb").unwrap();

        let tree = FakeSafTree::shared();
        *tree.fail_write.lock().unwrap() = true;
        let report = build_migrate_report(&db, "content://tree/3", tree.as_ref())
            .unwrap();

        assert_eq!(report.migrated, 0);
        assert_eq!(report.failed.len(), 2); // both failed at write, run continued
    }

    #[test]
    fn mime_for_file_name_maps_known_and_unknown() {
        assert_eq!(mime_for_file_name("x.epub"), "application/epub+zip");
        assert_eq!(mime_for_file_name("x.PDF"), "application/pdf");
        assert_eq!(mime_for_file_name("x.unknown"), "application/octet-stream");
    }
}
