use crate::db::Database;
use crate::error::Result;
use crate::models::{SearchQuery, SearchResult};
use crate::services::library_service;
use rusqlite::types::Value;

pub fn search(db: &Database, query: SearchQuery) -> Result<SearchResult> {
    let conn = db.get_connection()?;

    // Build FROM + WHERE once, reuse for both count and page query.
    let mut from_sql = String::from(" FROM books b");
    let mut where_clauses: Vec<String> = Vec::new();
    let mut base_params: Vec<Value> = Vec::new();

    // Full-text search
    if let Some(ref q) = query.query {
        if !q.is_empty() {
            from_sql.push_str(" JOIN books_fts fts ON b.id = fts.rowid");
            where_clauses.push("books_fts MATCH ?".to_string());
            base_params.push(Value::Text(q.clone()));
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
            where_clauses.push(format!("b.file_format IN ({})", placeholders));
            for format in formats {
                base_params.push(Value::Text(format.clone()));
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
            let placeholders = series_list.iter().map(|_| "?").collect::<Vec<_>>().join(",");
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
        where_clauses.push("b.rating >= ?".to_string());
        base_params.push(Value::Integer(min_rating as i64));
    }

    if let Some(max_rating) = query.max_rating {
        where_clauses.push("b.rating <= ?".to_string());
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
    let count_params_refs: Vec<&dyn rusqlite::ToSql> = base_params.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    let total_matches: i64 = conn.query_row(&count_sql, count_params_refs.as_slice(), |row| row.get(0))?;

    // Build paged IDs query
    let mut ids_sql = format!("SELECT DISTINCT b.id{}{} ORDER BY b.added_date DESC", from_sql, where_sql);
    let mut page_params = base_params.clone();

    if let Some(limit) = query.limit {
        ids_sql.push_str(" LIMIT ?");
        page_params.push(Value::Integer(limit));
    }

    // SQLite requires LIMIT before OFFSET. If caller provides OFFSET alone, use LIMIT -1.
    if let Some(offset) = query.offset {
        if query.limit.is_none() {
            ids_sql.push_str(" LIMIT -1");
        }
        ids_sql.push_str(" OFFSET ?");
        page_params.push(Value::Integer(offset));
    }

    // Execute paged IDs query
    let mut stmt = conn.prepare(&ids_sql)?;
    let page_params_refs: Vec<&dyn rusqlite::ToSql> = page_params.iter().map(|v| v as &dyn rusqlite::ToSql).collect();

    let book_ids: Vec<i64> = stmt
        .query_map(page_params_refs.as_slice(), |row| row.get(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    // Hydrate page books in one batched query (preserves order)
    let books = library_service::get_books_by_ids(db, &book_ids)?;

    Ok(SearchResult {
        total: total_matches.max(0) as usize,
        books,
        query: query.query.unwrap_or_default(),
    })
}
