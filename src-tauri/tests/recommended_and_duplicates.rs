//! Recommended books + duplicate-finder grouping (Slice S-C, items 5 & 6).
//!
//! (a) get_recommended_books: bounded random-offset sample — fast at 50k
//! rows, never returns wishlist/trash/completed books, returns up to limit.
//! (b) find_duplicate_groups: bucket-based grouping replaces the O(n²)
//! all-pairs loop; identical-content pairs are found exactly, the report
//! shape (Vec<Vec<Book>>) is unchanged.

use shiori::db::Database;
use shiori::models::Book;
use shiori::services::library_service::{add_book, find_duplicate_groups, get_recommended_books};

use std::fs;

fn create_temp_db(name: &str) -> (Database, std::path::PathBuf) {
    let temp_dir = std::env::temp_dir().join(format!(
        "shiori_reco_dup_{}_{}",
        name,
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let db_path = temp_dir.join("test.db");
    let db = Database::new(&db_path).unwrap();
    (db, temp_dir)
}

fn test_book(uuid: &str, title: &str) -> Book {
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
        file_path: format!("/tmp/{}.epub", uuid),
        file_format: "epub".to_string(),
        file_size: Some(1024),
        file_hash: Some(format!("hash-{}", uuid)),
        cover_path: None,
        page_count: None,
        word_count: None,
        language: "eng".to_string(),
        added_date: "2024-01-01T00:00:00Z".to_string(),
        modified_date: "2024-01-01T00:00:00Z".to_string(),
        last_opened: None,
        notes: None,
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

/// (a) Recommended: excludes wishlist/trash/completed; returns the full
/// eligible pool when it is smaller than the limit.
#[test]
fn recommended_books_exclude_wishlist_trash_and_completed() {
    let (db, _temp_dir) = create_temp_db("recommended");

    for i in 0..5 {
        add_book(&db, test_book(&format!("rec-{}", i), &format!("Eligible Book {}", i))).unwrap();
    }
    let wishlist = add_book(&db, test_book("rec-wish", "Wishlist Book")).unwrap();
    let trashed = add_book(&db, test_book("rec-trash", "Trashed Book")).unwrap();
    let completed = add_book(&db, test_book("rec-done", "Completed Book")).unwrap();

    let conn = db.get_connection().unwrap();
    conn.execute(
        "UPDATE books SET is_wishlist = 1 WHERE id = ?1",
        [wishlist],
    )
    .unwrap();
    conn.execute(
        "UPDATE books SET in_trash = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?1",
        [trashed],
    )
    .unwrap();
    conn.execute(
        "UPDATE books SET reading_status = 'completed' WHERE id = ?1",
        [completed],
    )
    .unwrap();
    drop(conn);

    let recommended = get_recommended_books(&db, 20).unwrap();

    assert_eq!(recommended.len(), 5, "all eligible books must be returned");
    assert!(
        recommended.iter().all(|b| !b.is_wishlist && !b.in_trash),
        "recommended must exclude wishlist and trash"
    );
    assert!(
        recommended.iter().all(|b| b.reading_status != "completed"),
        "recommended must exclude completed books"
    );
}

/// (a) Empty library: no recommendations, no error.
#[test]
fn recommended_books_empty_library() {
    let (db, _temp_dir) = create_temp_db("recommended_empty");
    let recommended = get_recommended_books(&db, 12).unwrap();
    assert!(recommended.is_empty());
}

fn dup_book(id: i64, title: &str, hash: Option<&str>, size: Option<i64>, path: &str) -> Book {
    let mut b = test_book(&format!("dup-{}", id), title);
    b.file_hash = hash.map(String::from);
    b.file_size = size;
    b.file_path = path.to_string();
    b
}

/// (b) Hash criteria: N books with exactly 2 identical-content pairs →
/// report finds exactly those pairs, singletons excluded.
#[test]
fn duplicate_hash_groups_find_identical_pairs() {
    let books = vec![
        dup_book(1, "Alpha One", Some("hash-A"), Some(100), "/lib/a1.epub"),
        dup_book(2, "Alpha Two", Some("hash-A"), Some(100), "/lib/a2.epub"), // pair A
        dup_book(3, "Beta One", Some("hash-B"), Some(200), "/lib/b1.epub"),
        dup_book(4, "Beta Two", Some("hash-B"), Some(200), "/lib/b2.epub"), // pair B
        dup_book(5, "Gamma One", Some("hash-C"), Some(300), "/lib/c1.epub"),
        dup_book(6, "Delta One", Some("hash-D"), Some(400), "/lib/d1.epub"),
    ];

    let groups = find_duplicate_groups(&books, "hash", 0.8);

    assert_eq!(groups.len(), 2, "exactly the two identical-content pairs");
    let mut pair_titles: Vec<Vec<String>> = groups
        .iter()
        .map(|g| {
            let mut t: Vec<String> = g.iter().map(|b| b.title.clone()).collect();
            t.sort();
            t
        })
        .collect();
    pair_titles.sort();
    assert_eq!(
        pair_titles,
        vec![
            vec!["Alpha One".to_string(), "Alpha Two".to_string()],
            vec!["Beta One".to_string(), "Beta Two".to_string()],
        ]
    );
}

/// (b) Hash criteria with an empty-hash book: falls back to file_size bucket
/// + filename similarity; a same-size, similarly-named book is grouped.
#[test]
fn duplicate_hash_empty_hash_falls_back_to_size_and_name() {
    let books = vec![
        dup_book(1, "Manual A", None, Some(500), "/lib/manual-a.pdf"),
        dup_book(2, "Manual B", None, Some(500), "/lib/manual-b.pdf"), // same size, similar name
        dup_book(3, "Other", None, Some(500), "/lib/completely-different.pdf"),
        dup_book(4, "Unique", Some("hash-X"), Some(999), "/lib/u.pdf"),
    ];

    let groups = find_duplicate_groups(&books, "hash", 0.8);

    assert_eq!(groups.len(), 1, "only the manual-a/manual-b pair");
    let titles: Vec<String> = groups[0].iter().map(|b| b.title.clone()).collect();
    assert!(titles.contains(&"Manual A".to_string()));
    assert!(titles.contains(&"Manual B".to_string()));
}

/// (b) Title criteria: fuzzy match still works, but bounded (bucket-based).
#[test]
fn duplicate_title_fuzzy_groups_similar_titles() {
    let books = vec![
        dup_book(1, "Harry Potter and the Sorcerer's Stone", Some("h1"), Some(1), "/lib/h1.epub"),
        dup_book(2, "Harry Potter and the Philosopher's Stone", Some("h2"), Some(2), "/lib/h2.epub"),
        dup_book(3, "Moby Dick", Some("h3"), Some(3), "/lib/h3.epub"),
    ];

    let groups = find_duplicate_groups(&books, "title", 0.8);

    assert_eq!(groups.len(), 1, "the two similar Harry Potter titles");
    assert_eq!(groups[0].len(), 2);
}

/// (b) Size criteria: exact size buckets (size > 0).
#[test]
fn duplicate_size_groups() {
    let books = vec![
        dup_book(1, "A", Some("x1"), Some(777), "/lib/a.epub"),
        dup_book(2, "B", Some("x2"), Some(777), "/lib/b.epub"),
        dup_book(3, "C", Some("x3"), Some(778), "/lib/c.epub"),
    ];

    let groups = find_duplicate_groups(&books, "size", 0.8);

    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].len(), 2);
}
