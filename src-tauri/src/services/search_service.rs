use crate::db::Database;
use crate::error::Result;
use crate::models::{Author, Book, SearchQuery, SearchResult, Tag};
use crate::services::library_service;
use rusqlite::params;

pub fn search(db: &Database, query: SearchQuery) -> Result<SearchResult> {
    let conn = db.get_connection();

    // Build SQL query
    let mut sql = String::from("SELECT DISTINCT b.id FROM books b");
    let mut where_clauses = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    // Full-text search
    if let Some(ref q) = query.query {
        if !q.is_empty() {
            sql.push_str(" JOIN books_fts fts ON b.id = fts.rowid");
            where_clauses.push("books_fts MATCH ?");
            params_vec.push(Box::new(q.clone()));
        }
    }

    // Filter by authors
    if let Some(ref authors) = query.authors {
        if !authors.is_empty() {
            sql.push_str(" JOIN books_authors ba ON b.id = ba.book_id");
            sql.push_str(" JOIN authors a ON ba.author_id = a.id");
            let placeholders = authors.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            where_clauses.push(&format!("a.name IN ({})", placeholders));
            for author in authors {
                params_vec.push(Box::new(author.clone()));
            }
        }
    }

    // Filter by tags
    if let Some(ref tags) = query.tags {
        if !tags.is_empty() {
            sql.push_str(" JOIN books_tags bt ON b.id = bt.book_id");
            sql.push_str(" JOIN tags t ON bt.tag_id = t.id");
            let placeholders = tags.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            where_clauses.push(&format!("t.name IN ({})", placeholders));
            for tag in tags {
                params_vec.push(Box::new(tag.clone()));
            }
        }
    }

    // Filter by formats
    if let Some(ref formats) = query.formats {
        if !formats.is_empty() {
            let placeholders = formats.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            where_clauses.push(&format!("b.file_format IN ({})", placeholders));
            for format in formats {
                params_vec.push(Box::new(format.clone()));
            }
        }
    }

    // Filter by series
    if let Some(ref series) = query.series {
        where_clauses.push("b.series = ?");
        params_vec.push(Box::new(series.clone()));
    }

    // Filter by rating
    if let Some(min_rating) = query.min_rating {
        where_clauses.push("b.rating >= ?");
        params_vec.push(Box::new(min_rating));
    }

    // Add WHERE clauses
    if !where_clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&where_clauses.join(" AND "));
    }

    // Add ORDER BY
    sql.push_str(" ORDER BY b.added_date DESC");

    // Add LIMIT and OFFSET
    if let Some(limit) = query.limit {
        sql.push_str(" LIMIT ?");
        params_vec.push(Box::new(limit));
    }
    if let Some(offset) = query.offset {
        sql.push_str(" OFFSET ?");
        params_vec.push(Box::new(offset));
    }

    // Execute query
    let mut stmt = conn.prepare(&sql)?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    let book_ids: Vec<i64> = stmt
        .query_map(params_refs.as_slice(), |row| row.get(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    // Fetch full book details
    let mut books = Vec::new();
    for id in &book_ids {
        if let Ok(book) = library_service::get_book_by_id(db, *id) {
            books.push(book);
        }
    }

    Ok(SearchResult {
        total: books.len(),
        books,
        query: query.query.unwrap_or_default(),
    })
}
