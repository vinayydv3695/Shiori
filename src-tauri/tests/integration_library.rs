use shiori::{
    db::Database,
    services::{library_service, search_service},
    models::{SearchQuery},
};
use std::fs;
use std::path::PathBuf;

fn create_temp_db_and_covers() -> (Database, PathBuf, PathBuf) {
    let temp_dir = std::env::temp_dir().join(format!("shiori_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let db_path = temp_dir.join("test.db");
    let covers_dir = temp_dir.join("covers");
    fs::create_dir_all(&covers_dir).unwrap();

    let db = Database::new(&db_path).unwrap();
    (db, db_path, covers_dir)
}

#[test]
fn test_library_scan_and_search_flow() {
    let (db, _db_path, covers_dir) = create_temp_db_and_covers();

    // Create a dummy manga folder
    let manga_dir = std::env::temp_dir().join(format!("shiori_manga_{}", std::process::id()));
    let _ = fs::remove_dir_all(&manga_dir);
    fs::create_dir_all(&manga_dir).unwrap();

    // Create some chapter files (cbz)
    let chapter1_path = manga_dir.join("Chapter 1.cbz");
    fs::write(&chapter1_path, "dummy cbz data").unwrap();

    let chapter2_path = manga_dir.join("Chapter 2.cbz");
    fs::write(&chapter2_path, "dummy cbz data").unwrap();

    // 1. Scan folder
    let import_result = library_service::scan_folder_for_manga(
        &db,
        &manga_dir.to_string_lossy(),
        &covers_dir,
    ).expect("Failed to scan folder");

    assert_eq!(import_result.success.len(), 1, "Should import 1 manga series");

    // 2. Verify imported successfully
    let books = library_service::get_all_books(&db, 10, 0).expect("Failed to get books");
    assert_eq!(books.len(), 1);
    let book = &books[0];
    
    // Check if domain is manga
    assert_eq!(book.domain.as_deref(), Some("manga"));

    // 3. Verify FTS5 indexing works
    let query = SearchQuery {
        query: Some("Chapter".to_string()),
        limit: Some(10),
        offset: Some(0),
        ..Default::default()
    };
    
    let search_result = search_service::search(&db, query).expect("Failed to search");
    assert_eq!(search_result.books.len(), 1, "FTS5 search should return the manga");
    assert_eq!(search_result.books[0].id, book.id);

    // 4. Verify cleanup/delete
    library_service::delete_book(&db, book.id.unwrap()).expect("Failed to move book to trash");
    library_service::permanent_delete_book(&db, book.id.unwrap()).expect("Failed to delete book");

    let final_books = library_service::get_all_books(&db, 10, 0).expect("Failed to get books");
    assert_eq!(final_books.len(), 0, "Book should be deleted");

    // Cleanup
    let _ = fs::remove_dir_all(manga_dir);
}
