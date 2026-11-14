use serde_json::{json, Value};
use shiori::{db::Database, services::export_service::import_library_metadata};

fn record(path: &str) -> Value {
    json!({"title":"Ignored", "authors":"Ignored", "isbn":"new-isbn",
        "publisher":"new-publisher", "pubdate":"2026", "series":"new-series",
        "series_index":2.0, "rating":8.0, "file_format":"epub", "file_path":path,
        "language":"en", "tags":"", "added_date":"2026-01-01"})
}

#[test]
fn existing_json_export_roundtrip() {
    use shiori::services::export_service::{export_library, ExportFormat, ExportOptions};
    let dir = tempfile::tempdir().unwrap();
    let db = Database::new(dir.path().join("library.db")).unwrap();
    db.get_connection().unwrap().execute(
        "INSERT INTO books(uuid,title,file_path,file_format) VALUES ('roundtrip-book','Original','/not-on-disk.epub','epub')", [],
    ).unwrap();
    let path = dir.path().join("export.json").to_str().unwrap().to_owned();
    export_library(
        &db,
        ExportOptions {
            format: ExportFormat::Json,
            include_metadata: true,
            include_shelves: true,
            include_reading_progress: true,
            file_path: path.clone(),
        },
    )
    .unwrap();
    let preview = import_library_metadata(&db, &path, None).unwrap();
    assert_eq!(
        (preview.total, preview.matched, preview.would_update),
        (1, 1, 0)
    );
    assert_eq!(
        import_library_metadata(&db, &path, Some(&preview.fingerprint))
            .unwrap()
            .updated,
        0
    );
}

#[test]
fn preview_apply_idempotence_and_stale_input() {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::new(dir.path().join("library.db")).unwrap();
    let source = dir.path().join("source.epub");
    std::fs::write(&source, b"untouched").unwrap();
    let source = source.to_str().unwrap();
    db.get_connection().unwrap().execute(
        "INSERT INTO books (uuid,title,file_path,file_format,isbn,rating,series_index,language) VALUES ('preview-book','Original',?1,'epub','existing',0,0,'')",
        [source],
    ).unwrap();
    let input = dir.path().join("metadata.json");
    let bytes = serde_json::to_vec(&vec![record(source), record("/missing.epub")]).unwrap();
    std::fs::write(&input, &bytes).unwrap();
    let path = input.to_str().unwrap();
    let preview = import_library_metadata(&db, path, None).unwrap();
    assert_eq!(
        (
            preview.matched,
            preview.unmatched,
            preview.would_update,
            preview.updated
        ),
        (1, 1, 1, 0)
    );
    let before: Option<String> = db
        .get_connection()
        .unwrap()
        .query_row(
            "SELECT publisher FROM books WHERE file_path=?1",
            [source],
            |r| r.get(0),
        )
        .unwrap();
    assert!(before.is_none());
    let applied = import_library_metadata(&db, path, Some(&preview.fingerprint)).unwrap();
    assert_eq!(applied.updated, 1);
    let values: (String, String, f64, f64, String) = db
        .get_connection()
        .unwrap()
        .query_row(
            "SELECT title,isbn,rating,series_index,publisher FROM books WHERE file_path=?1",
            [source],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .unwrap();
    assert_eq!(
        values,
        (
            "Original".into(),
            "existing".into(),
            0.0,
            0.0,
            "new-publisher".into()
        )
    );
    assert_eq!(
        import_library_metadata(&db, path, Some(&preview.fingerprint))
            .unwrap()
            .updated,
        0
    );
    assert_eq!(std::fs::read(source).unwrap(), b"untouched");
    std::fs::write(&input, b"[]").unwrap();
    assert!(import_library_metadata(&db, path, Some(&preview.fingerprint)).is_err());
}

#[test]
fn rejects_invalid_input() {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::new(dir.path().join("library.db")).unwrap();
    let input = dir.path().join("metadata.json");
    assert!(import_library_metadata(&db, dir.path().to_str().unwrap(), None).is_err());
    let mut bad_rating = record("a");
    bad_rating["rating"] = json!(11);
    let mut long_string = record("a");
    long_string["isbn"] = json!("x".repeat(16385));
    for value in [
        json!([record("a"), record("a")]),
        json!([bad_rating]),
        json!([long_string]),
        json!([{}]),
    ] {
        std::fs::write(&input, serde_json::to_vec(&value).unwrap()).unwrap();
        assert!(import_library_metadata(&db, input.to_str().unwrap(), None).is_err());
    }
    std::fs::write(&input, b"[").unwrap();
    assert!(import_library_metadata(&db, input.to_str().unwrap(), None).is_err());
    std::fs::File::create(&input)
        .unwrap()
        .set_len(32 * 1024 * 1024 + 1)
        .unwrap();
    assert!(import_library_metadata(&db, input.to_str().unwrap(), None).is_err());
}

#[test]
fn sql_failure_rolls_back_all_updates() {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::new(dir.path().join("library.db")).unwrap();
    db.get_connection().unwrap().execute_batch(
        "INSERT INTO books(uuid,title,file_path,file_format) VALUES ('rollback-a','A','a','epub'),('rollback-b','B','b','epub');
         CREATE TRIGGER reject_metadata BEFORE UPDATE ON books WHEN OLD.file_path='b'
         BEGIN SELECT RAISE(ABORT,'test failure'); END;"
    ).unwrap();
    let input = dir.path().join("metadata.json");
    std::fs::write(
        &input,
        serde_json::to_vec(&vec![record("a"), record("b")]).unwrap(),
    )
    .unwrap();
    let preview = import_library_metadata(&db, input.to_str().unwrap(), None).unwrap();
    assert!(
        import_library_metadata(&db, input.to_str().unwrap(), Some(&preview.fingerprint)).is_err()
    );
    let count: i64 = db
        .get_connection()
        .unwrap()
        .query_row(
            "SELECT count(*) FROM books WHERE publisher='new-publisher'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 0);
}
