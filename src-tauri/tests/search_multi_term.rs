//! Multi-term FTS search (Slice S-C, item 3).
//!
//! The query builder now splits the user query into quoted, AND-joined terms
//! with a prefix on the last term, so "harry pott" matches "Harry Potter"
//! books instead of the exact (never-matching) phrase "harry pott". Also
//! covers the v45 lowercase format filter end-to-end.

use shiori::db::Database;
use shiori::models::{Book, SearchQuery};
use shiori::services::library_service::add_book;
use shiori::services::search_service::search;

use std::fs;

fn create_temp_db(name: &str) -> (Database, std::path::PathBuf) {
    let temp_dir = std::env::temp_dir().join(format!(
        "shiori_search_multi_{}_{}",
        name,
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let db_path = temp_dir.join("test.db");
    let db = Database::new(&db_path).unwrap();
    (db, temp_dir)
}

fn test_book(uuid: &str, title: &str, format: &str, notes: &str) -> Book {
    Book {
        id: None,
        uuid: uuid.to_string(),
        title: title.to_string(),
        sort_title: None,
        isbn: None,
        isbn13: None,
        publisher: None,
        pubdate: None,
        series: None,
        series_index: None,
        rating: None,
        file_path: format!("/tmp/{}.{}", uuid, format),
        file_format: format.to_string(),
        file_size: Some(1024),
        file_hash: Some(format!("hash-{}", uuid)),
        cover_path: None,
        page_count: None,
        word_count: None,
        language: "eng".to_string(),
        added_date: "2024-01-01T00:00:00Z".to_string(),
        modified_date: "2024-01-01T00:00:00Z".to_string(),
        last_opened: None,
        notes: Some(notes.to_string()),
        online_metadata_fetched: false,
        metadata_source: None,
        metadata_last_sync: None,
        anilist_id: None,
        is_favorite: false,
        is_wishlist: false,
        in_trash: false,
        deleted_at: None,
        reading_status: "planning".to_string(),
        domain: Some("books".to_string()),
        metadata_locked: None,
        is_managed: false,
        origin: None,
        managed_relpath: None,
        authors: vec![],
        tags: vec![],
    }
}

/// "harry pott" (multi-term, incomplete last word) must match the Harry
/// Potter book via per-term AND + prefix, not the exact phrase.
#[test]
fn multi_term_query_matches_books_with_all_terms() {
    let (db, _temp_dir) = create_temp_db("multi_term");
    add_book(&db, test_book("mt-1", "Harry Potter and the Sorcerer's Stone", "epub", "First book")).unwrap();
    add_book(&db, test_book("mt-2", "Harry Potter and the Chamber of Secrets", "epub", "Second book")).unwrap();
    add_book(&db, test_book("mt-3", "The Complete Manga Collection", "cbz", "Comics only")).unwrap();
    add_book(&db, test_book("mt-4", "Potted Plants Monthly", "pdf", "Gardening")).unwrap();

    let mut query = SearchQuery::default();
    query.query = Some("harry pott".to_string());
    query.limit = Some(10);

    let result = search(&db, query).unwrap();
    let titles: Vec<&str> = result.books.iter().map(|b| b.title.as_str()).collect();
    assert_eq!(
        titles,
        vec![
            "Harry Potter and the Sorcerer's Stone",
            "Harry Potter and the Chamber of Secrets"
        ],
        "'harry pott' must match both Harry Potter books (AND terms + prefix)"
    );
}

/// Single term with prefix still works for typeahead ("manga" → manga books).
#[test]
fn single_term_prefix_matches() {
    let (db, _temp_dir) = create_temp_db("single_term");
    add_book(&db, test_book("st-1", "Manga Masterclass", "cbz", "Art")).unwrap();
    add_book(&db, test_book("st-2", "Cooking Basics", "epub", "Food")).unwrap();

    let mut query = SearchQuery::default();
    query.query = Some("manga".to_string());
    query.limit = Some(10);

    let result = search(&db, query).unwrap();
    assert_eq!(result.books.len(), 1);
    assert_eq!(result.books[0].title, "Manga Masterclass");
}

/// Format filter: stored formats are lowercase post-v45, so the search must
/// find them with a plain IN comparison (no LOWER() on the column).
#[test]
fn format_filter_finds_lowercased_formats() {
    let (db, _temp_dir) = create_temp_db("format_filter");
    add_book(&db, test_book("ff-1", "Epub Novel", "epub", "Fiction")).unwrap();
    add_book(&db, test_book("ff-2", "Pdf Manual", "pdf", "Docs")).unwrap();

    let mut query = SearchQuery::default();
    query.formats = Some(vec!["EPUB".to_string()]); // uppercase user input
    query.limit = Some(10);

    let result = search(&db, query).unwrap();
    assert_eq!(result.books.len(), 1);
    assert_eq!(result.books[0].title, "Epub Novel");
}

/// Domain filter (empty-grid fix): the Books view must show epub/pdf books
/// with a NULL or 'books' domain but exclude manga-format files, and the Manga
/// view must include both domain-tagged manga and cbz/cbr/zip files whatever
/// their stored domain says.
#[test]
fn domain_filter_partitions_books_and_manga() {
    let (db, _temp_dir) = create_temp_db("domain_filter");

    let mut novel = test_book("dm-1", "Novel One", "epub", "Fiction");
    novel.domain = Some("books".to_string());
    add_book(&db, novel).unwrap();

    let mut comic = test_book("dm-2", "Comic Two", "cbz", "Pictures");
    comic.domain = Some("comics".to_string());
    add_book(&db, comic).unwrap();

    let mut legacy = test_book("dm-3", "Legacy Three", "pdf", "Old");
    legacy.domain = None; // pre-domain imports carry a NULL domain
    add_book(&db, legacy).unwrap();

    let mut mystery = test_book("dm-4", "Mystery Four", "cbz", "Also cbz");
    mystery.domain = Some("books".to_string()); // cbz imported as a regular book
    add_book(&db, mystery).unwrap();

    // Books domain: NULL/'books' domain AND non-manga formats.
    let mut q = SearchQuery::default();
    q.domain = Some("books".to_string());
    q.limit = Some(10);
    let result = search(&db, q).unwrap();
    let mut titles: Vec<&str> = result.books.iter().map(|b| b.title.as_str()).collect();
    titles.sort_unstable();
    assert_eq!(
        titles,
        vec!["Legacy Three", "Novel One"],
        "books domain must include NULL-domain books and exclude cbz"
    );

    // Manga domain: domain-tagged manga/comics OR manga-like formats.
    let mut q = SearchQuery::default();
    q.domain = Some("manga_comics".to_string());
    q.limit = Some(10);
    let result = search(&db, q).unwrap();
    let mut titles: Vec<&str> = result.books.iter().map(|b| b.title.as_str()).collect();
    titles.sort_unstable();
    assert_eq!(
        titles,
        vec!["Comic Two", "Mystery Four"],
        "manga domain must include cbz even when stored domain is 'books'"
    );
}
