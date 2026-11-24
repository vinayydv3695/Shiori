use shiori::{db::Database, services::library_service};
use std::time::Instant;

#[test]
fn home_scale() {
    let path = std::env::temp_dir().join(format!("shiori-home-{}.db", std::process::id()));
    let db = Database::new(&path).unwrap();
    db.initialize_schema().unwrap();
    let mut conn = db.get_connection().unwrap();
    let tx = conn.transaction().unwrap();
    tx.execute_batch(
        "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<50000)
         INSERT INTO books(id,uuid,title,file_path,reading_status,domain,file_format,in_trash,last_opened,modified_date)
         SELECT i, 'home-'||i, 'Book '||i, '/home-scale/'||i,
         CASE i%3 WHEN 0 THEN 'reading' WHEN 1 THEN 'completed' ELSE 'on_hold' END,
         CASE i%4 WHEN 0 THEN 'books' WHEN 1 THEN 'manga' ELSE NULL END,
         CASE i%4 WHEN 2 THEN 'CBZ' WHEN 3 THEN '' ELSE 'epub' END,
         i%7=0, '2026-01-01', '2026-01-01' FROM n;",
    ).unwrap();
    tx.commit().unwrap();
    let order =
        "reading_status = ?1 ORDER BY last_opened DESC, modified_date DESC, id DESC LIMIT 50";
    for (label, predicate) in [("baseline", ""), ("indexed", "in_trash = 0 AND ")] {
        let sql = format!("SELECT id FROM books WHERE {predicate}{order}");
        let plan: Vec<String> = conn
            .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
            .unwrap()
            .query_map(["reading"], |r| r.get(3))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        let start = Instant::now();
        let rows: Vec<i64> = conn
            .prepare(&sql)
            .unwrap()
            .query_map(["reading"], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        println!(
            "{label}: rows={} elapsed={:?} plan={plan:?}",
            rows.len(),
            start.elapsed()
        );
        assert_eq!(rows.len(), 50);
        if label == "indexed" {
            assert!(plan
                .iter()
                .any(|p| p.contains("idx_books_home_status_order")));
            assert!(!plan.iter().any(|p| p.contains("TEMP B-TREE")));
        }
    }
    for status in ["reading", "completed", "on_hold"] {
        for domain in ["books", "manga_comics"] {
            let predicate = if domain == "books" {
                "in_trash=0 AND (domain='books' OR (domain IS NULL AND file_format=''))"
            } else {
                "in_trash=0 AND (domain='manga' OR (domain IS NULL AND file_format='CBZ'))"
            };
            let sql = format!("SELECT id FROM books WHERE {predicate} AND {order} OFFSET 7");
            let plan: Vec<String> = conn
                .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
                .unwrap()
                .query_map([status], |r| r.get(3))
                .unwrap()
                .map(Result::unwrap)
                .collect();
            assert!(plan.iter().any(|p| p.contains("idx_books_home_status_order")));
            assert!(!plan.iter().any(|p| p.contains("TEMP B-TREE")));
            let expected: Vec<i64> = conn
                .prepare(&sql)
                .unwrap()
                .query_map([status], |r| r.get(0))
                .unwrap()
                .map(Result::unwrap)
                .collect();
            let start = Instant::now();
            let books = library_service::get_books_by_reading_status_for_domain(
                &db,
                status,
                50,
                7,
                Some(domain),
            )
            .unwrap();
            println!(
                "service {status}/{domain}: rows={} elapsed={:?}",
                books.len(),
                start.elapsed()
            );
            assert_eq!(
                books.iter().map(|b| b.id.unwrap()).collect::<Vec<_>>(),
                expected
            );
        }
        let expected: Vec<i64> = conn
            .prepare(&format!("SELECT id FROM books WHERE {order}"))
            .unwrap()
            .query_map([status], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        let old = library_service::get_books_by_reading_status(&db, status, 50, 0).unwrap();
        assert_eq!(
            old.iter().map(|b| b.id.unwrap()).collect::<Vec<_>>(),
            expected
        );
        assert!(library_service::get_books_by_reading_status_for_domain(
            &db,
            status,
            0,
            0,
            Some("books")
        )
        .unwrap()
        .is_empty());
    }
    drop(conn);
    drop(db);
    std::fs::remove_file(path).unwrap();
}
