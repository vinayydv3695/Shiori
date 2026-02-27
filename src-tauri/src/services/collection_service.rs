use crate::error::Result;
use crate::models::{Book, Collection, SmartRule};
use chrono::Utc;
use rusqlite::{params, Connection, Row};
use serde_json;

pub struct CollectionService;

impl CollectionService {
    // ==================== Collection CRUD ====================

    pub fn get_collections(conn: &Connection) -> Result<Vec<Collection>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, parent_id, is_smart, smart_rules, icon, color, 
                    sort_order, created_at, updated_at
             FROM collections
             ORDER BY sort_order ASC, name ASC",
        )?;

        let collections = stmt
            .query_map([], |row| Self::collection_from_row(row))?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        // Calculate book counts for each collection
        let mut collections_with_counts = Vec::new();
        for mut collection in collections {
            collection.book_count = Some(Self::get_book_count(conn, collection.id.unwrap())?);
            collections_with_counts.push(collection);
        }

        Ok(collections_with_counts)
    }

    pub fn get_collection(conn: &Connection, id: i64) -> Result<Collection> {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, parent_id, is_smart, smart_rules, icon, color,
                    sort_order, created_at, updated_at
             FROM collections
             WHERE id = ?1",
        )?;

        let mut collection = stmt.query_row(params![id], |row| Self::collection_from_row(row))?;
        collection.book_count = Some(Self::get_book_count(conn, id)?);

        Ok(collection)
    }

    pub fn create_collection(
        conn: &Connection,
        name: &str,
        description: Option<&str>,
        parent_id: Option<i64>,
        is_smart: bool,
        smart_rules: Option<&str>,
        icon: Option<&str>,
        color: Option<&str>,
    ) -> Result<Collection> {
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO collections (name, description, parent_id, is_smart, smart_rules, icon, color, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![name, description, parent_id, is_smart, smart_rules, icon, color, now, now],
        )?;

        let id = conn.last_insert_rowid();
        Self::get_collection(conn, id)
    }

    pub fn update_collection(
        conn: &Connection,
        id: i64,
        name: &str,
        description: Option<&str>,
        parent_id: Option<i64>,
        smart_rules: Option<&str>,
        icon: Option<&str>,
        color: Option<&str>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE collections 
             SET name = ?1, description = ?2, parent_id = ?3, smart_rules = ?4, 
                 icon = ?5, color = ?6, updated_at = ?7
             WHERE id = ?8",
            params![
                name,
                description,
                parent_id,
                smart_rules,
                icon,
                color,
                now,
                id
            ],
        )?;

        Ok(())
    }

    pub fn delete_collection(conn: &Connection, id: i64) -> Result<()> {
        conn.execute("DELETE FROM collections WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ==================== Book Management ====================

    pub fn add_book_to_collection(
        conn: &Connection,
        collection_id: i64,
        book_id: i64,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();

        // Check if collection is smart
        let is_smart: i64 = conn.query_row(
            "SELECT is_smart FROM collections WHERE id = ?1",
            params![collection_id],
            |row| row.get(0),
        )?;

        if is_smart == 1 {
            return Err(crate::error::ShioriError::InvalidOperation(
                "Cannot manually add books to smart collections".to_string(),
            ));
        }

        conn.execute(
            "INSERT OR IGNORE INTO collections_books (collection_id, book_id, added_at)
             VALUES (?1, ?2, ?3)",
            params![collection_id, book_id, now],
        )?;

        Ok(())
    }

    pub fn remove_book_from_collection(
        conn: &Connection,
        collection_id: i64,
        book_id: i64,
    ) -> Result<()> {
        conn.execute(
            "DELETE FROM collections_books WHERE collection_id = ?1 AND book_id = ?2",
            params![collection_id, book_id],
        )?;

        Ok(())
    }

    pub fn add_books_to_collection(
        conn: &Connection,
        collection_id: i64,
        book_ids: Vec<i64>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();

        let tx = conn.unchecked_transaction()?;

        for book_id in book_ids {
            tx.execute(
                "INSERT OR IGNORE INTO collections_books (collection_id, book_id, added_at)
                 VALUES (?1, ?2, ?3)",
                params![collection_id, book_id, now],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    pub fn get_collection_books(conn: &Connection, collection_id: i64) -> Result<Vec<Book>> {
        // Check if smart collection
        let collection = Self::get_collection(conn, collection_id)?;

        if collection.is_smart {
            // Parse smart rules and build query
            if let Some(rules_json) = &collection.smart_rules {
                Self::get_books_by_smart_rules(conn, rules_json)
            } else {
                Ok(Vec::new())
            }
        } else {
            // Get books from junction table
            Self::get_books_from_junction(conn, collection_id)
        }
    }

    fn get_books_from_junction(conn: &Connection, collection_id: i64) -> Result<Vec<Book>> {
        let mut stmt = conn.prepare(
            "SELECT b.id, b.uuid, b.title, b.sort_title, b.isbn, b.isbn13, b.publisher, 
                    b.pubdate, b.series, b.series_index, b.rating, b.file_path, b.file_format,
                    b.file_size, b.file_hash, b.cover_path, b.page_count, b.word_count,
                    b.language, b.added_date, b.modified_date, b.last_opened, b.notes,
                    b.online_metadata_fetched, b.metadata_source, b.metadata_last_sync, b.anilist_id
             FROM books b
             JOIN collections_books cb ON b.id = cb.book_id
             WHERE cb.collection_id = ?1
             ORDER BY cb.sort_order ASC, b.title ASC",
        )?;

        let books = stmt
            .query_map(params![collection_id], |row| {
                Ok(Book {
                    id: row.get(0)?,
                    uuid: row.get(1)?,
                    title: row.get(2)?,
                    sort_title: row.get(3)?,
                    isbn: row.get(4)?,
                    isbn13: row.get(5)?,
                    publisher: row.get(6)?,
                    pubdate: row.get(7)?,
                    series: row.get(8)?,
                    series_index: row.get(9)?,
                    rating: row.get(10)?,
                    file_path: row.get(11)?,
                    file_format: row.get(12)?,
                    file_size: row.get(13)?,
                    file_hash: row.get(14)?,
                    cover_path: row.get(15)?,
                    page_count: row.get(16)?,
                    word_count: row.get(17)?,
                    language: row.get(18)?,
                    added_date: row.get(19)?,
                    modified_date: row.get(20)?,
                    last_opened: row.get(21)?,
                    notes: row.get(22)?,
                    online_metadata_fetched: row.get::<_, i64>(23).unwrap_or(0) != 0,
                    metadata_source: row.get(24).ok().flatten(),
                    metadata_last_sync: row.get(25).ok().flatten(),
                    anilist_id: row.get(26).ok().flatten(),
                    authors: Vec::new(),
                    tags: Vec::new(),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        // TODO: Load authors and tags for each book
        Ok(books)
    }

    fn get_books_by_smart_rules(conn: &Connection, rules_json: &str) -> Result<Vec<Book>> {
        let rules: Vec<SmartRule> = serde_json::from_str(rules_json).map_err(|e| {
            crate::error::ShioriError::InvalidOperation(format!("Invalid smart rules: {}", e))
        })?;

        if rules.is_empty() {
            return Ok(Vec::new());
        }

        // Build WHERE clause based on rules
        let mut where_clauses = Vec::new();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        for rule in rules {
            let clause = match (rule.field.as_str(), rule.operator.as_str()) {
                ("format", "equals") => {
                    params_vec.push(Box::new(rule.value.clone()));
                    "b.file_format = ?".to_string()
                }
                ("rating", "greater_than") => {
                    if let Ok(val) = rule.value.parse::<i32>() {
                        params_vec.push(Box::new(val));
                        "b.rating > ?".to_string()
                    } else {
                        continue;
                    }
                }
                ("series", "equals") => {
                    params_vec.push(Box::new(rule.value.clone()));
                    "b.series = ?".to_string()
                }
                ("tag", "contains") => {
                    params_vec.push(Box::new(rule.value.clone()));
                    "EXISTS (SELECT 1 FROM books_tags bt JOIN tags t ON bt.tag_id = t.id WHERE bt.book_id = b.id AND t.name = ?)".to_string()
                }
                ("author", "contains") => {
                    params_vec.push(Box::new(rule.value.clone()));
                    "EXISTS (SELECT 1 FROM books_authors ba JOIN authors a ON ba.author_id = a.id WHERE ba.book_id = b.id AND a.name LIKE '%' || ? || '%')".to_string()
                }
                _ => continue,
            };

            where_clauses.push(clause);
        }

        if where_clauses.is_empty() {
            return Ok(Vec::new());
        }

        // Combine with AND or OR based on match_type (default: all/AND)
        let connector = " AND ";
        let where_sql = where_clauses.join(connector);

        let query = format!(
            "SELECT b.id, b.uuid, b.title, b.sort_title, b.isbn, b.isbn13, b.publisher,
                    b.pubdate, b.series, b.series_index, b.rating, b.file_path, b.file_format,
                    b.file_size, b.file_hash, b.cover_path, b.page_count, b.word_count,
                    b.language, b.added_date, b.modified_date, b.last_opened, b.notes,
                    b.online_metadata_fetched, b.metadata_source, b.metadata_last_sync, b.anilist_id
             FROM books b
             WHERE {}
             ORDER BY b.title ASC",
            where_sql
        );

        let mut stmt = conn.prepare(&query)?;

        let books = stmt
            .query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
                Ok(Book {
                    id: row.get(0)?,
                    uuid: row.get(1)?,
                    title: row.get(2)?,
                    sort_title: row.get(3)?,
                    isbn: row.get(4)?,
                    isbn13: row.get(5)?,
                    publisher: row.get(6)?,
                    pubdate: row.get(7)?,
                    series: row.get(8)?,
                    series_index: row.get(9)?,
                    rating: row.get(10)?,
                    file_path: row.get(11)?,
                    file_format: row.get(12)?,
                    file_size: row.get(13)?,
                    file_hash: row.get(14)?,
                    cover_path: row.get(15)?,
                    page_count: row.get(16)?,
                    word_count: row.get(17)?,
                    language: row.get(18)?,
                    added_date: row.get(19)?,
                    modified_date: row.get(20)?,
                    last_opened: row.get(21)?,
                    notes: row.get(22)?,
                    online_metadata_fetched: row.get::<_, i64>(23).unwrap_or(0) != 0,
                    metadata_source: row.get(24).ok().flatten(),
                    metadata_last_sync: row.get(25).ok().flatten(),
                    anilist_id: row.get(26).ok().flatten(),
                    authors: Vec::new(),
                    tags: Vec::new(),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(books)
    }

    // ==================== Helpers ====================

    fn collection_from_row(row: &Row) -> rusqlite::Result<Collection> {
        Ok(Collection {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            parent_id: row.get(3)?,
            is_smart: row.get::<_, i64>(4)? == 1,
            smart_rules: row.get(5)?,
            icon: row.get(6)?,
            color: row.get(7)?,
            sort_order: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
            book_count: None,
            children: Vec::new(),
        })
    }

    fn get_book_count(conn: &Connection, collection_id: i64) -> Result<i64> {
        let collection = conn.query_row(
            "SELECT is_smart, smart_rules FROM collections WHERE id = ?1",
            params![collection_id],
            |row| Ok((row.get::<_, i64>(0)? == 1, row.get::<_, Option<String>>(1)?)),
        )?;

        if collection.0 {
            // Smart collection - count books matching rules
            if let Some(rules) = collection.1 {
                let books = Self::get_books_by_smart_rules(conn, &rules)?;
                Ok(books.len() as i64)
            } else {
                Ok(0)
            }
        } else {
            // Manual collection - count from junction
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM collections_books WHERE collection_id = ?1",
                params![collection_id],
                |row| row.get(0),
            )?;
            Ok(count)
        }
    }

    pub fn get_nested_collections(conn: &Connection) -> Result<Vec<Collection>> {
        // Get all collections
        let all_collections = Self::get_collections(conn)?;

        // Build tree structure
        let mut root_collections = Vec::new();
        let mut collection_map: std::collections::HashMap<i64, Collection> = all_collections
            .into_iter()
            .map(|c| (c.id.unwrap(), c))
            .collect();

        let ids: Vec<i64> = collection_map.keys().cloned().collect();

        for id in ids {
            let collection = collection_map.remove(&id).unwrap();
            if let Some(parent_id) = collection.parent_id {
                if let Some(parent) = collection_map.get_mut(&parent_id) {
                    parent.children.push(collection);
                } else {
                    root_collections.push(collection);
                }
            } else {
                root_collections.push(collection);
            }
        }

        Ok(root_collections)
    }
}
