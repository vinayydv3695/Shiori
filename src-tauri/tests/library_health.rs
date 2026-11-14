use shiori::services::library_health_service::{HealthBook, LibraryHealthReport, UnreadableBook};

#[test]
fn health_report_uses_frontend_contract() {
    let report = LibraryHealthReport {
        checked: 1,
        skipped: 2,
        missing: vec![],
        unreadable: vec![UnreadableBook {
            book: HealthBook { id: 42, title: "Book".into(), file_path: "/book.epub".into() },
            reason: "Path is not a regular file".into(),
        }],
    };
    let value = serde_json::to_value(report).unwrap();
    assert_eq!(value["checked"], 1);
    assert_eq!(value["skipped"], 2);
    assert_eq!(value["unreadable"][0]["id"], 42);
    assert_eq!(value["unreadable"][0]["filePath"], "/book.epub");
    assert!(value["unreadable"][0].get("book").is_none());
}
