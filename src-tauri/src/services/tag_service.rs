use crate::db::Database;
use crate::error::{Result, ShioriError};
use crate::models::Tag;
use rusqlite::params;

pub fn get_all_tags(db: &Database) -> Result<Vec<Tag>> {
    let conn = db.get_connection();

    let mut stmt = conn.prepare("SELECT id, name, color FROM tags ORDER BY name")?;

    let tags = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                color: row.get(2)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(tags)
}

pub fn create_tag(db: &Database, name: String, color: Option<String>) -> Result<i64> {
    let conn = db.get_connection();

    conn.execute(
        "INSERT INTO tags (name, color) VALUES (?1, ?2)",
        params![name, color],
    )?;

    Ok(conn.last_insert_rowid())
}

pub fn add_tag_to_book(db: &Database, book_id: i64, tag_id: i64) -> Result<()> {
    let conn = db.get_connection();

    conn.execute(
        "INSERT OR IGNORE INTO books_tags (book_id, tag_id) VALUES (?1, ?2)",
        params![book_id, tag_id],
    )?;

    Ok(())
}

pub fn remove_tag_from_book(db: &Database, book_id: i64, tag_id: i64) -> Result<()> {
    let conn = db.get_connection();

    conn.execute(
        "DELETE FROM books_tags WHERE book_id = ?1 AND tag_id = ?2",
        params![book_id, tag_id],
    )?;

    Ok(())
}
