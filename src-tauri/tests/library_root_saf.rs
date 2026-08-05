//! Slice 3 (Mode B) — SAF library-root tests.
//!
//! Covers, against a fresh temp DB:
//! (a) migration v44 applied — `library_mode`/`library_root_uri` columns
//!     exist with defaults `'app'` / `NULL`;
//! (b) `set_library_mode('app')` → resolve returns the app Library dir;
//!     `'saf'` + uri → `resolve_managed_root` returns `Saf` with the local
//!     mirror under `app_data_dir`, and switching back to `'app'` clears the
//!     uri;
//! (c) `resolve_library_root` in saf mode returns the local mirror path
//!     (no panic, no fallback-to-app warn path);
//! (d) migration report shape with a fake SAF tree (no device required);
//! (e) SAF-aware ingest push + SAF-aware managed delete through the bridge.

use shiori::{
    commands::library_root::set_library_mode_impl,
    db::Database,
    error::Result,
    services::{ingest_service, library_root, library_service, saf},
};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Recording fake SAF tree — records every call.
#[derive(Default)]
struct FakeTree {
    calls: Mutex<Vec<String>>,
}

impl saf::SafTree for FakeTree {
    fn create_file(&self, tree_uri: &str, file_name: &str, _mime: &str) -> Result<String> {
        self.calls
            .lock()
            .unwrap()
            .push(format!("create:{tree_uri}/{file_name}"));
        Ok(format!("content://fake/doc/{file_name}"))
    }
    fn write_document(&self, _doc_uri: &str, _local_path: &Path) -> Result<()> {
        self.calls.lock().unwrap().push("write".to_string());
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

// So the process-global bridge can hold a handle we keep for inspection.
struct GlobalTree(Arc<FakeTree>);

impl saf::SafTree for GlobalTree {
    fn create_file(&self, tree_uri: &str, file_name: &str, mime: &str) -> Result<String> {
        self.0.create_file(tree_uri, file_name, mime)
    }
    fn write_document(&self, doc_uri: &str, local_path: &Path) -> Result<()> {
        self.0.write_document(doc_uri, local_path)
    }
    fn delete_file(&self, tree_uri: &str, relpath: &str) -> Result<()> {
        self.0.delete_file(tree_uri, relpath)
    }
}

fn temp_db(label: &str) -> (Database, PathBuf) {
    let tmp = std::env::temp_dir().join(format!(
        "shiori_library_root_saf_{}_{}",
        std::process::id(),
        label
    ));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).unwrap();
    (Database::new(&tmp.join("test.db")).unwrap(), tmp)
}

fn pref_mode(db: &Database) -> (String, Option<String>) {
    let conn = db.get_connection().unwrap();
    conn.query_row(
        "SELECT library_mode, library_root_uri FROM user_preferences WHERE id = 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .unwrap()
}

fn insert_managed_book(conn: &rusqlite::Connection, uuid: &str, rel: &str, local: &Path) {
    conn.execute(
        "INSERT INTO books (uuid, title, file_path, file_format, is_managed, origin, managed_relpath) \
         VALUES (?1, ?2, ?3, 'pdf', 1, 'open_with', ?4)",
        rusqlite::params![uuid, uuid, local.to_str().unwrap(), rel],
    )
    .unwrap();
}

// ── (a) migration v44: columns exist on a fresh DB ─────────────────────────

#[test]
fn v44_columns_exist_with_defaults() {
    let (db, _tmp) = temp_db("v44");
    let (mode, uri) = pref_mode(&db);
    assert_eq!(mode, "app");
    assert!(uri.is_none(), "library_root_uri must default to NULL");
}

// ── (b) set_library_mode round-trips through preferences ──────────────────

#[test]
fn set_library_mode_app_and_saf_round_trip() {
    let (db, tmp) = temp_db("modes");

    set_library_mode_impl(&db, "app", None).unwrap();
    let (mode, uri) = pref_mode(&db);
    assert_eq!(mode, "app");
    assert!(uri.is_none());

    set_library_mode_impl(&db, "saf", Some("content://tree/primary%3AShiori")).unwrap();
    let (mode, uri) = pref_mode(&db);
    assert_eq!(mode, "saf");
    assert_eq!(uri.as_deref(), Some("content://tree/primary%3AShiori"));

    // Back to app clears the stored uri.
    set_library_mode_impl(&db, "app", None).unwrap();
    let (mode, uri) = pref_mode(&db);
    assert_eq!(mode, "app");
    assert!(uri.is_none());

    // saf without a uri is rejected.
    assert!(set_library_mode_impl(&db, "saf", None).is_err());
    assert!(set_library_mode_impl(&db, "saf", Some("")).is_err());

    // Unknown modes are rejected.
    assert!(set_library_mode_impl(&db, "cloud", None).is_err());

    let _ = tmp;
}

// ── (b)+(c) resolve_managed_root / resolve_library_root in both modes ──────

#[test]
fn resolve_managed_root_modes() {
    let (db, tmp) = temp_db("resolve");

    set_library_mode_impl(&db, "app", None).unwrap();
    match library_root::resolve_managed_root(&db, &tmp).unwrap() {
        library_root::ManagedRoot::AppDir(p) => assert_eq!(p, tmp.join("Library")),
        other => panic!("expected AppDir, got {other:?}"),
    }
    assert_eq!(
        library_root::resolve_library_root(&db, &tmp).unwrap(),
        tmp.join("Library")
    );

    set_library_mode_impl(&db, "saf", Some("content://tree/1")).unwrap();
    match library_root::resolve_managed_root(&db, &tmp).unwrap() {
        library_root::ManagedRoot::Saf { uri, local_cache } => {
            assert_eq!(uri, "content://tree/1");
            assert_eq!(local_cache, tmp.join("Library"));
            assert!(local_cache.is_dir(), "local mirror must be created");
        }
        other => panic!("expected Saf, got {other:?}"),
    }
    // resolve_library_root returns the local mirror — no fallback-to-app.
    assert_eq!(
        library_root::resolve_library_root(&db, &tmp).unwrap(),
        tmp.join("Library")
    );
}

// ── (d) migration report shape with a fake tree ────────────────────────────

#[test]
fn migrate_report_shape_with_fake_tree() {
    let (db, tmp) = temp_db("migrate");
    let conn = db.get_connection().unwrap();
    let lib = tmp.join("Library");
    std::fs::create_dir_all(&lib).unwrap();

    // Two managed books with real files, one managed book with a missing file.
    insert_managed_book(&conn, "m1", "m1.epub", &lib.join("m1.epub"));
    insert_managed_book(&conn, "m2", "m2.pdf", &lib.join("m2.pdf"));
    insert_managed_book(&conn, "m3", "m3.cbz", &lib.join("m3.cbz"));
    std::fs::write(lib.join("m1.epub"), b"epub-bytes").unwrap();
    std::fs::write(lib.join("m2.pdf"), b"pdf-bytes").unwrap();

    let tree = Arc::new(FakeTree::default());
    let report =
        saf::build_migrate_report(&db, "content://tree/mig", tree.as_ref()).unwrap();

    // Shape: { migrated, failed: [ [relpath, error], ... ] }
    assert_eq!(report.migrated, 2);
    assert_eq!(report.failed.len(), 1);
    assert_eq!(report.failed[0].0, "m3.cbz");
    assert!(report.failed[0].1.contains("missing"));

    // Failures present → mode stays 'app' (migration not complete).
    assert_eq!(pref_mode(&db).0, "app");

    // Calls: create+write per successful file; nothing for the missing one.
    let calls = tree.calls.lock().unwrap().clone();
    assert_eq!(
        calls,
        vec![
            "create:content://tree/mig/m1.epub".to_string(),
            "write".to_string(),
            "create:content://tree/mig/m2.pdf".to_string(),
            "write".to_string(),
        ]
    );
}

#[test]
fn migrate_report_flips_mode_when_clean() {
    let (db, tmp) = temp_db("migrate_clean");
    let conn = db.get_connection().unwrap();
    let lib = tmp.join("Library");
    std::fs::create_dir_all(&lib).unwrap();

    insert_managed_book(&conn, "m1", "m1.pdf", &lib.join("m1.pdf"));
    std::fs::write(lib.join("m1.pdf"), b"pdf").unwrap();

    let tree = Arc::new(FakeTree::default());
    let report = saf::build_migrate_report(&db, "content://tree/clean", tree.as_ref()).unwrap();
    assert_eq!(report.migrated, 1);
    assert!(report.failed.is_empty());
    let (mode, uri) = pref_mode(&db);
    assert_eq!(mode, "saf");
    assert_eq!(uri.as_deref(), Some("content://tree/clean"));
}

// ── (e) SAF-aware ingest push + SAF-aware managed delete ───────────────────

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

#[test]
fn ingest_pushes_to_saf_tree_when_saf_push_given() {
    let (db, tmp) = temp_db("ingest_saf");
    let covers = tmp.join("covers");
    std::fs::create_dir_all(&covers).unwrap();

    let source = tmp.join("opened.pdf");
    write_minimal_pdf(&source, "SAF Push Test");

    let tree = Arc::new(FakeTree::default());
    let push = ingest_service::SafPush {
        tree_uri: "content://tree/ingest",
        tree: tree.as_ref(),
    };
    let result = ingest_service::ingest_opened_file(
        &db,
        &covers,
        &tmp,
        &source.to_string_lossy(),
        &source,
        "opened.pdf",
        false,
        Some(push),
    )
    .unwrap();

    assert_eq!(result.status, "imported");
    // Local mirror copy + SAF create + SAF write.
    let calls = tree.calls.lock().unwrap().clone();
    assert_eq!(calls.len(), 2, "expected create+write, got {calls:?}");
    assert!(calls[0].starts_with("create:content://tree/ingest/"));
    assert_eq!(calls[1], "write");
}

#[test]
fn managed_delete_removes_local_mirror_and_saf_copy() {
    let (db, tmp) = temp_db("delete_saf");
    let conn = db.get_connection().unwrap();
    conn.execute(
        "UPDATE user_preferences SET enable_recycle_bin = 0 WHERE id = 1",
        [],
    )
    .unwrap();
    set_library_mode_impl(&db, "saf", Some("content://tree/del")).unwrap();

    let lib = tmp.join("Library");
    std::fs::create_dir_all(&lib).unwrap();
    let rel = "book-uuid.pdf";
    std::fs::write(lib.join(rel), b"managed").unwrap();

    insert_managed_book(&conn, "b1", rel, &lib.join(rel));
    let book_id: i64 = conn
        .query_row("SELECT id FROM books WHERE uuid = 'b1'", [], |r| r.get(0))
        .unwrap();

    // Install the process-global bridge (exactly once per test binary); the
    // GlobalTree wrapper keeps a handle we can inspect afterwards.
    let tree = Arc::new(FakeTree::default());
    saf::set_saf_tree(Box::new(GlobalTree(Arc::clone(&tree)))).unwrap();

    library_service::delete_book(&db, book_id, &tmp).unwrap();

    // Local mirror file gone, book row gone.
    assert!(!lib.join(rel).exists());
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 0);

    // The bridge saw the SAF delete with the stored tree uri + relpath.
    let calls = tree.calls.lock().unwrap().clone();
    assert_eq!(
        calls,
        vec!["delete:content://tree/del/book-uuid.pdf".to_string()]
    );
}
