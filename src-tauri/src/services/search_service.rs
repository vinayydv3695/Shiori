use crate::db::Database;
use crate::error::Result;
use crate::models::{SearchQuery, SearchResult};
use crate::services::library_service;
use rusqlite::types::Value;

/// Upper bound for frontend-supplied LIMIT values; anything above is clamped.
const MAX_LIMIT: i64 = 1000;

pub fn build_search_query(query: &SearchQuery) -> (String, Vec<Value>, String, Vec<Value>) {
    let mut from_sql = String::from(" FROM books b");
    let mut where_clauses: Vec<String> = Vec::new();
    let mut base_params: Vec<Value> = Vec::new();

    // Full-text search
    if let Some(ref q) = query.query {
        if !q.is_empty() {
            // FTS5 MATCH syntax: barewords match tokens, "…" is a phrase,
            // `term*` is a prefix query, AND/OR/NOT/NEAR combine, `+`/`-`
            // require/exclude terms, `column: term` filters by column.
            //
            // The user query is split into whitespace-separated terms, each
            // term is quoted (embedded quotes doubled, per FTS5 escaping) and
            // joined with AND, so "harry pott" matches books containing BOTH
            // terms instead of the exact phrase "harry pott" (which matched
            // nothing). Quoting also neutralizes operator injection: a query
            // like `foo OR bar` is treated as literal terms, never as an OR
            // expression. The LAST term gets a prefix `*` so typeahead
            // ("harry pot") still matches full words ("harry potter").
            let terms: Vec<String> = q
                .split_whitespace()
                .map(|t| t.trim_matches('"').replace('"', "\"\""))
                .filter(|t| !t.is_empty())
                .collect();
            let fts_query = if terms.is_empty() {
                // Degenerate input (only quotes/whitespace): keep a harmless
                // quoted empty-phrase match rather than a bare MATCH.
                format!("\"{}\"", q.replace('"', "\"\""))
            } else {
                let mut parts: Vec<String> = terms.iter().map(|t| format!("\"{}\"", t)).collect();
                if let Some(last) = parts.last_mut() {
                    last.push('*');
                }
                parts.join(" AND ")
            };
            from_sql.push_str(" JOIN books_fts fts ON b.id = fts.rowid");
            where_clauses.push("books_fts MATCH ?".to_string());
            base_params.push(Value::Text(fts_query));
        }
    }

    // Filter by domain (books vs manga/comics)
    if let Some(ref domain) = query.domain {
        if domain == "manga" || domain == "manga_comics" {
            where_clauses.push(
                "(b.domain IN ('manga', 'comics', 'manga_comics', 'online-manga') OR b.file_format IN ('cbz', 'cbr', 'zip', 'rar', '7z', 'online-manga'))".to_string()
            );
        } else if domain == "books" {
            where_clauses.push(
                "((b.domain IS NULL OR b.domain NOT IN ('manga', 'comics', 'manga_comics', 'online-manga')) AND (b.file_format IS NULL OR b.file_format NOT IN ('cbz', 'cbr', 'zip', 'rar', '7z', 'online-manga')))".to_string()
            );
        }
    }

    // Filter by authors
    if let Some(ref authors) = query.authors {
        if !authors.is_empty() {
            from_sql.push_str(" JOIN books_authors ba ON b.id = ba.book_id");
            from_sql.push_str(" JOIN authors a ON ba.author_id = a.id");
            let placeholders = authors.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            where_clauses.push(format!("a.name IN ({})", placeholders));
            for author in authors {
                base_params.push(Value::Text(author.clone()));
            }
        }
    }

    // Filter by tags
    if let Some(ref tags) = query.tags {
        if !tags.is_empty() {
            from_sql.push_str(" JOIN books_tags bt ON b.id = bt.book_id");
            from_sql.push_str(" JOIN tags t ON bt.tag_id = t.id");
            let placeholders = tags.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            where_clauses.push(format!("t.name IN ({})", placeholders));
            for tag in tags {
                base_params.push(Value::Text(tag.clone()));
            }
        }
    }

    // Filter by formats
    if let Some(ref formats) = query.formats {
        if !formats.is_empty() {
            let placeholders = formats.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            // v45 lowercased all stored file_format values, so compare the
            // lowercased param directly against the column and let SQLite use
            // idx_books_format / idx_books_format_date. LOWER(b.file_format)
            // would defeat the index.
            where_clauses.push(format!("b.file_format IN ({})", placeholders));
            for format in formats {
                base_params.push(Value::Text(format.to_lowercase().clone()));
            }
        }
    }

    // Filter by languages
    if let Some(ref languages) = query.languages {
        if !languages.is_empty() {
            let placeholders = languages.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            where_clauses.push(format!("b.language IN ({})", placeholders));
            for language in languages {
                base_params.push(Value::Text(language.clone()));
            }
        }
    }

    // Filter by publishers
    if let Some(ref publishers) = query.publishers {
        if !publishers.is_empty() {
            let placeholders = publishers.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            where_clauses.push(format!("b.publisher IN ({})", placeholders));
            for publisher in publishers {
                base_params.push(Value::Text(publisher.clone()));
            }
        }
    }

    // Filter by series (single or multi)
    if let Some(ref series_list) = query.series_list {
        if !series_list.is_empty() {
            let placeholders = series_list
                .iter()
                .map(|_| "?")
                .collect::<Vec<_>>()
                .join(",");
            where_clauses.push(format!("b.series IN ({})", placeholders));
            for series in series_list {
                base_params.push(Value::Text(series.clone()));
            }
        }
    } else if let Some(ref series) = query.series {
        if !series.is_empty() {
            where_clauses.push("b.series = ?".to_string());
            base_params.push(Value::Text(series.clone()));
        }
    }

    // Filter by identifiers (ISBN/ISBN13)
    if let Some(ref isbns) = query.isbns {
        if !isbns.is_empty() {
            let placeholders = isbns.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            where_clauses.push(format!("b.isbn IN ({})", placeholders));
            for isbn in isbns {
                base_params.push(Value::Text(isbn.clone()));
            }
        }
    }

    if let Some(ref isbn13s) = query.isbn13s {
        if !isbn13s.is_empty() {
            let placeholders = isbn13s.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            where_clauses.push(format!("b.isbn13 IN ({})", placeholders));
            for isbn13 in isbn13s {
                base_params.push(Value::Text(isbn13.clone()));
            }
        }
    }

    // Filter by rating range
    if let Some(min_rating) = query.min_rating {
        where_clauses.push("COALESCE(b.rating, 0) >= ?".to_string());
        base_params.push(Value::Integer(min_rating as i64));
    }

    if let Some(max_rating) = query.max_rating {
        where_clauses.push("COALESCE(b.rating, 0) <= ?".to_string());
        base_params.push(Value::Integer(max_rating as i64));
    }

    // Filter by added date range
    if let Some(ref date_from) = query.date_from {
        if !date_from.is_empty() {
            where_clauses.push("b.added_date >= ?".to_string());
            base_params.push(Value::Text(date_from.clone()));
        }
    }

    if let Some(ref date_to) = query.date_to {
        if !date_to.is_empty() {
            where_clauses.push("b.added_date <= ?".to_string());
            base_params.push(Value::Text(date_to.clone()));
        }
    }

    // Filter by in_trash
    if let Some(in_trash) = query.in_trash {
        where_clauses.push(if in_trash { "b.in_trash = 1".to_string() } else { "b.in_trash = 0".to_string() });
    } else {
        where_clauses.push("b.in_trash = 0".to_string());
    }

    // Filter by reading status
    if let Some(ref statuses) = query.reading_status {
        if !statuses.is_empty() {
            let placeholders = statuses.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            where_clauses.push(format!("b.reading_status IN ({})", placeholders));
            for status in statuses {
                base_params.push(Value::Text(status.clone()));
            }
        }
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", where_clauses.join(" AND "))
    };

    // Count total matches (without page limit/offset)
    let count_sql = format!("SELECT COUNT(DISTINCT b.id){}{}", from_sql, where_sql);

    let mut order_clause = String::from("ORDER BY b.added_date DESC");

    if let Some(ref sort_by) = query.sort_by {
        let order_dir = match query
            .sort_order
            .as_deref()
            .unwrap_or("desc")
            .to_lowercase()
            .as_str()
        {
            "asc" => "ASC",
            _ => "DESC",
        };

        match sort_by.as_str() {
            "title" => {
                order_clause = format!("ORDER BY b.title {}", order_dir);
            }
            "pubdate" => {
                order_clause = format!("ORDER BY b.pubdate {} NULLS LAST", order_dir);
            }
            "rating" => {
                order_clause = format!("ORDER BY b.rating {} NULLS LAST", order_dir);
            }
            "author" => {
                // Batched author name: one grouped pass over books_authors/
                // authors (attached as a LEFT JOIN) instead of a correlated
                // MIN(a.name) subquery evaluated once per candidate row.
                from_sql.push_str(
                    " LEFT JOIN (SELECT ba.book_id AS am_book_id, MIN(a.name) AS author_name \
                     FROM books_authors ba JOIN authors a ON a.id = ba.author_id \
                     GROUP BY ba.book_id) am ON am.am_book_id = b.id",
                );
                order_clause = format!("ORDER BY am.author_name {} NULLS LAST", order_dir);
            }
            "added_date" | _ => {
                order_clause = format!("ORDER BY b.added_date {}", order_dir);
            }
        }
    }

    // Build paged IDs query
    let mut ids_sql = format!(
        "SELECT DISTINCT b.id{}{} {}",
        from_sql, where_sql, order_clause
    );
    let mut page_params = base_params.clone();

    if let Some(limit) = query.limit {
        ids_sql.push_str(" LIMIT ?");
        page_params.push(Value::Integer(limit.clamp(0, MAX_LIMIT)));
    }

    // SQLite requires LIMIT before OFFSET. If caller provides OFFSET alone, use LIMIT -1.
    if let Some(offset) = query.offset {
        if query.limit.is_none() {
            ids_sql.push_str(" LIMIT -1");
        }
        ids_sql.push_str(" OFFSET ?");
        page_params.push(Value::Integer(offset));
    }

    (count_sql, base_params, ids_sql, page_params)
}

pub fn search(db: &Database, query: SearchQuery) -> Result<SearchResult> {
    let conn = db.get_connection()?;
    let (count_sql, base_params, ids_sql, page_params) = build_search_query(&query);

    let count_params_refs: Vec<&dyn rusqlite::ToSql> = base_params
        .iter()
        .map(|v| v as &dyn rusqlite::ToSql)
        .collect();
    let total_matches: i64 =
        conn.query_row(&count_sql, count_params_refs.as_slice(), |row| row.get(0))?;

    // Execute paged IDs query
    let mut stmt = conn.prepare(&ids_sql)?;
    let page_params_refs: Vec<&dyn rusqlite::ToSql> = page_params
        .iter()
        .map(|v| v as &dyn rusqlite::ToSql)
        .collect();

    let book_ids: Vec<i64> = stmt
        .query_map(page_params_refs.as_slice(), |row| row.get(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    // Hydrate page books in one batched query (preserves order)
    let books = library_service::get_books_by_ids(db, &book_ids)?;

    Ok(SearchResult {
        total: total_matches.max(0) as usize,
        books,
        query: query.query.clone().unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_search_query_empty() {
        let query = SearchQuery::default();
        let (count_sql, base_params, ids_sql, page_params) = build_search_query(&query);

        assert_eq!(count_sql, "SELECT COUNT(DISTINCT b.id) FROM books b WHERE b.in_trash = 0");
        assert!(base_params.is_empty());
        assert!(ids_sql.contains("ORDER BY b.added_date DESC"));
        assert!(page_params.is_empty());
    }

    #[test]
    fn test_build_search_query_fts() {
        let mut query = SearchQuery::default();
        query.query = Some("manga".to_string());
        
        let (count_sql, base_params, _ids_sql, _page_params) = build_search_query(&query);
        assert!(count_sql.contains("JOIN books_fts fts"));
        assert!(count_sql.contains("books_fts MATCH ?"));
        assert_eq!(base_params.len(), 1);
        // Single term: quoted + prefix so typeahead matches full words.
        assert_eq!(base_params[0], Value::Text("\"manga\"*".to_string()));
    }

    #[test]
    fn test_build_search_query_multi_term() {
        let mut query = SearchQuery::default();
        query.query = Some("harry pott".to_string());

        let (count_sql, base_params, _ids_sql, _page_params) = build_search_query(&query);
        assert!(count_sql.contains("books_fts MATCH ?"));
        assert_eq!(base_params.len(), 1);
        // Terms are quoted individually, AND-joined; last term is a prefix.
        assert_eq!(
            base_params[0],
            Value::Text("\"harry\" AND \"pott\"*".to_string())
        );
    }

    #[test]
    fn test_build_search_query_fts_operator_injection_neutralized() {
        let mut query = SearchQuery::default();
        query.query = Some("foo OR bar".to_string());

        let (_count_sql, base_params, _ids_sql, _page_params) = build_search_query(&query);
        // OR must not survive as an FTS operator — every term (including the
        // word "OR" itself) is quoted and AND-joined as a literal term.
        assert_eq!(
            base_params[0],
            Value::Text("\"foo\" AND \"OR\" AND \"bar\"*".to_string())
        );
    }

    #[test]
    fn test_build_search_query_format_filter_uses_index() {
        let mut query = SearchQuery::default();
        query.formats = Some(vec!["EPUB".to_string(), "PDF".to_string()]);

        let (count_sql, base_params, _ids_sql, _page_params) = build_search_query(&query);
        // No LOWER() on the column — the stored (v45-lowercased) value is
        // compared directly so idx_books_format can be used.
        assert!(count_sql.contains("b.file_format IN (?,?)"), "{count_sql}");
        assert!(!count_sql.contains("LOWER(b.file_format)"), "{count_sql}");
        assert_eq!(base_params.len(), 2);
        assert_eq!(base_params[0], Value::Text("epub".to_string()));
        assert_eq!(base_params[1], Value::Text("pdf".to_string()));
    }

    #[test]
    fn test_build_search_query_author_sort_is_batched() {
        let mut query = SearchQuery::default();
        query.sort_by = Some("author".to_string());
        query.sort_order = Some("asc".to_string());

        let (_count_sql, _base_params, ids_sql, _page_params) = build_search_query(&query);
        // Correlated MIN(a.name) subquery must be gone; a grouped LEFT JOIN
        // (batched over the whole candidate set) replaces it.
        assert!(!ids_sql.contains("SELECT MIN(a.name)"), "{ids_sql}");
        assert!(ids_sql.contains("LEFT JOIN (SELECT ba.book_id AS am_book_id, MIN(a.name)"), "{ids_sql}");
        assert!(ids_sql.contains("ORDER BY am.author_name ASC NULLS LAST"), "{ids_sql}");
    }

    #[test]
    fn test_build_search_query_limit_clamped() {
        // Over-limit values are clamped to MAX_LIMIT; 0 and negatives clamp to 0.
        let mut query = SearchQuery::default();
        query.limit = Some(5000);
        let (_count_sql, _base_params, ids_sql, page_params) = build_search_query(&query);
        assert!(ids_sql.contains("LIMIT ?"));
        assert_eq!(page_params[0], Value::Integer(1000));

        let mut query = SearchQuery::default();
        query.limit = Some(0);
        let (_count_sql, _base_params, ids_sql, page_params) = build_search_query(&query);
        assert!(ids_sql.contains("LIMIT ?"));
        assert_eq!(page_params[0], Value::Integer(0));

        let mut query = SearchQuery::default();
        query.limit = Some(-5);
        let (_count_sql, _base_params, ids_sql, page_params) = build_search_query(&query);
        assert!(ids_sql.contains("LIMIT ?"));
        assert_eq!(page_params[0], Value::Integer(0));
    }

    /// Seed a temp-file Database (initialize_schema + ALL migrations) with a
    /// representative library: 3000 books, 60 authors, 40 tags and junction
    /// rows — enough rows + ANALYZE stats for the planner to pick real plans.
    fn seed_search_db() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::new(&dir.path().join("test.db")).expect("db init");
        let conn = db.get_connection().expect("conn");

        let formats = ["epub", "pdf", "mobi", "cbz", "fb2", "txt"];
        let languages = ["eng", "deu", "spa", "fra", "jpn", "cmn", "kor", "por"];
        let publishers = ["Pub 0", "Pub 1", "Pub 2", "Pub 3", "Pub 4", "Pub 5", "Pub 6",
            "Pub 7", "Pub 8", "Pub 9", "Pub 10", "Pub 11"];
        let series = ["Series 0", "Series 1", "Series 2", "Series 3", "Series 4",
            "Series 5", "Series 6", "Series 7", "Series 8", "Series 9"];
        let statuses = ["planning", "reading", "completed", "dropped", "on_hold"];

        conn.execute_batch("BEGIN").unwrap();
        {
            let mut ins = conn
                .prepare(
                    "INSERT INTO books (uuid, title, isbn, publisher, pubdate, series, rating,\
                     file_path, file_format, language, added_date, reading_status, in_trash)\
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                )
                .unwrap();
            for i in 0..3000 {
                let year = 2018 + (i % 8);
                ins.execute(rusqlite::params![
                    format!("uuid-{i}"),
                    format!("Book title {i} fantasy saga"),
                    format!("isbn-{i}"),
                    publishers[i % 12],
                    format!("{year}-01-01"),
                    if i % 4 == 0 { None } else { Some(series[i % 10]) },
                    if i % 10 == 0 { None } else { Some((i % 11) as i64) },
                    format!("/books/file_{i}.{}", formats[i % 6]),
                    formats[i % 6],
                    languages[i % 8],
                    format!("{year}-{:02}-{:02}", (i / 8) % 12 + 1, (i % 28) + 1),
                    statuses[i % 5],
                    if i % 50 == 0 { 1 } else { 0 },
                ])
                .unwrap();
            }
        }
        for a in 0..60 {
            conn.execute("INSERT INTO authors (name) VALUES (?1)", [format!("Author {a}")])
                .unwrap();
        }
        for t in 0..40 {
            conn.execute("INSERT INTO tags (name) VALUES (?1)", [format!("tag{t}")])
                .unwrap();
        }
        {
            let mut ins_a = conn
                .prepare("INSERT INTO books_authors (book_id, author_id) VALUES (?1, ?2)")
                .unwrap();
            let mut ins_t = conn
                .prepare("INSERT INTO books_tags (book_id, tag_id) VALUES (?1, ?2)")
                .unwrap();
            for i in 1..=3000 {
                ins_a.execute(rusqlite::params![i, i % 60 + 1]).unwrap();
                ins_a.execute(rusqlite::params![i, (i * 7 + 3) % 60 + 1]).unwrap();
                ins_t.execute(rusqlite::params![i, i % 40 + 1]).unwrap();
                ins_t.execute(rusqlite::params![i, (i * 13 + 5) % 40 + 1]).unwrap();
                ins_t.execute(rusqlite::params![i, (i * 29 + 11) % 40 + 1]).unwrap();
            }
        }
        conn.execute_batch("COMMIT").unwrap();
        conn.execute_batch("ANALYZE").unwrap();
        (dir, db)
    }

    /// Run EXPLAIN QUERY PLAN and return the detail column of every row.
    fn explain_plan(conn: &rusqlite::Connection, sql: &str, params: &[rusqlite::types::Value]) -> Vec<String> {
        let param_refs: Vec<&dyn rusqlite::ToSql> =
            params.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
        let mut stmt = conn.prepare(&format!("EXPLAIN QUERY PLAN {sql}")).unwrap();
        stmt.query_map(param_refs.as_slice(), |row| row.get::<_, String>(3))
            .unwrap()
            .map(|r| r.unwrap())
            .collect()
    }

    #[test]
    fn filter_queries_use_indexes() {
        let (_dir, db) = seed_search_db();
        let conn = db.get_connection().unwrap();

        let mut shapes: Vec<(&str, SearchQuery)> = Vec::new();

        // 1. authors + tags + series (count)
        let mut q = SearchQuery::default();
        q.authors = Some(vec!["Author 13".to_string()]);
        q.tags = Some(vec!["tag7".to_string()]);
        q.series_list = Some(vec!["Series 3".to_string()]);
        shapes.push(("authors+tags+series (count)", q));

        // 2. format + language + status (count)
        let mut q = SearchQuery::default();
        q.formats = Some(vec!["epub".to_string(), "pdf".to_string()]);
        q.languages = Some(vec!["eng".to_string()]);
        q.reading_status = Some(vec!["reading".to_string()]);
        shapes.push(("format+language+status (count)", q));

        // 3. format + language + status (ids, ORDER BY added_date DESC LIMIT 100)
        let mut q = SearchQuery::default();
        q.formats = Some(vec!["epub".to_string(), "pdf".to_string()]);
        q.languages = Some(vec!["eng".to_string()]);
        q.reading_status = Some(vec!["reading".to_string()]);
        q.limit = Some(100);
        shapes.push(("format+language+status (ids, sorted)", q));

        // 4. publisher only (count)
        let mut q = SearchQuery::default();
        q.publishers = Some(vec!["Pub 5".to_string()]);
        shapes.push(("publisher (count)", q));

        // 5. top-rated + added-date range (count + sorted ids)
        let mut q = SearchQuery::default();
        q.min_rating = Some(7.0);
        q.date_from = Some("2020-01-01".to_string());
        q.limit = Some(100);
        shapes.push(("rating>=7 + date>=2020 (count)", q));

        // 6. FTS title search (count)
        let mut q = SearchQuery::default();
        q.query = Some("fantasy".to_string());
        shapes.push(("fts title (count)", q));

        for (name, sq) in &shapes {
            let (count_sql, base_params, ids_sql, page_params) = build_search_query(sq);
            println!("\n=== {name} ===");
            println!("count:");
            let count_plan = explain_plan(&conn, &count_sql, &base_params);
            for line in &count_plan {
                println!("  {line}");
            }
            let ids_plan;
            if ids_sql != count_sql {
                println!("ids:");
                ids_plan = explain_plan(&conn, &ids_sql, &page_params);
                for line in &ids_plan {
                    println!("  {line}");
                }
            } else {
                ids_plan = Vec::new();
            }
            // Regression guards: the shapes below must never full-scan `books`.
            // (Backed by the v48 composite indexes; a bare SCAN means the
            // planner found nothing to search and we regressed.)
            match *name {
                "publisher (count)" => {
                    assert!(
                        !count_plan.iter().any(|p| p.contains("SCAN b")),
                        "publisher filter must use an index: {count_plan:?}"
                    );
                }
                "rating>=7 + date>=2020 (count)" => {
                    // Seed-DB planner picks a scan for the bare COUNT (both
                    // ranges are ~40-60% selective at 3000 rows; SQLite skips
                    // indexes for such estimates). The sorted-ids variant must
                    // not scan — on real 10k+ libraries the rating index also
                    // serves this shape directly.
                    assert!(
                        !ids_plan.iter().any(|p| p.contains("SCAN b")),
                        "rating/date ids query must use an index: {ids_plan:?}"
                    );
                }
                "format+language+status (ids, sorted)" => {
                    assert!(
                        ids_plan
                            .iter()
                            .any(|p| p.contains("idx_books_status_format_lang")),
                        "status+format+language should use the composite index: {ids_plan:?}"
                    );
                }
                _ => {}
            }
        }
    }

    #[test]
    fn test_build_search_query_filters() {
        let mut query = SearchQuery::default();
        query.authors = Some(vec!["Author A".to_string()]);
        query.tags = Some(vec!["Action".to_string()]);
        query.in_trash = Some(true);
        query.limit = Some(10);
        query.offset = Some(20);

        let (count_sql, base_params, ids_sql, page_params) = build_search_query(&query);
        
        // Count should not have limit/offset
        assert!(count_sql.contains("JOIN books_authors"));
        assert!(count_sql.contains("a.name IN (?)"));
        assert!(count_sql.contains("t.name IN (?)"));
        assert!(count_sql.contains("b.in_trash = 1"));
        assert!(!count_sql.contains("LIMIT"));
        
        assert_eq!(base_params.len(), 2); // 1 author, 1 tag

        // IDs query should have limit and offset
        assert!(ids_sql.contains("LIMIT ?"));
        assert!(ids_sql.contains("OFFSET ?"));
        assert_eq!(page_params.len(), 4); // author, tag, limit, offset
        assert_eq!(page_params[2], Value::Integer(10));
        assert_eq!(page_params[3], Value::Integer(20));
    }
}
