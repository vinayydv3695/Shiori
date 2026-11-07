use crate::error::Result;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookMap {
    pub id: i64,
    pub book_id: i64,
    pub title: String,
    pub image_url: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub is_auto_extracted: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookMapPin {
    pub id: i64,
    pub map_id: i64,
    pub book_id: i64,
    pub label: String,
    pub notes: Option<String>,
    pub chapter_index: Option<i32>,
    pub x_percent: f64,
    pub y_percent: f64,
    pub color: String,
    pub created_at: String,
}

pub struct CartographyService;

impl CartographyService {
    pub fn get_book_maps(conn: &Connection, book_id: i64) -> Result<Vec<BookMap>> {
        let mut stmt = conn.prepare(
            "SELECT id, book_id, title, image_url, width, height, is_auto_extracted, created_at
             FROM book_maps WHERE book_id = ?1 ORDER BY is_auto_extracted ASC, id ASC",
        )?;

        let maps = stmt
            .query_map(params![book_id], |row| {
                Ok(BookMap {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    title: row.get(2)?,
                    image_url: row.get(3)?,
                    width: row.get(4)?,
                    height: row.get(5)?,
                    is_auto_extracted: row.get::<_, i32>(6)? != 0,
                    created_at: row.get(7)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(maps)
    }

    pub fn add_book_map(
        conn: &Connection,
        book_id: i64,
        title: &str,
        image_url: &str,
        width: Option<u32>,
        height: Option<u32>,
        is_auto_extracted: bool,
    ) -> Result<BookMap> {
        // Prevent duplicate image URLs for the same book
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM book_maps WHERE book_id = ?1 AND image_url = ?2",
                params![book_id, image_url],
                |r| r.get(0),
            )
            .optional()?;

        let id = match existing {
            Some(id) => id,
            None => {
                conn.execute(
                    "INSERT INTO book_maps (book_id, title, image_url, width, height, is_auto_extracted)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        book_id,
                        title,
                        image_url,
                        width,
                        height,
                        if is_auto_extracted { 1 } else { 0 }
                    ],
                )?;
                conn.last_insert_rowid()
            }
        };

        let now = chrono::Utc::now().to_rfc3339();
        Ok(BookMap {
            id,
            book_id,
            title: title.to_string(),
            image_url: image_url.to_string(),
            width,
            height,
            is_auto_extracted,
            created_at: now,
        })
    }

    pub fn delete_book_map(conn: &Connection, map_id: i64) -> Result<()> {
        conn.execute("DELETE FROM book_maps WHERE id = ?1", params![map_id])?;
        Ok(())
    }

    pub fn get_map_pins(conn: &Connection, map_id: i64) -> Result<Vec<BookMapPin>> {
        let mut stmt = conn.prepare(
            "SELECT id, map_id, book_id, label, notes, chapter_index, x_percent, y_percent, color, created_at
             FROM book_map_pins WHERE map_id = ?1 ORDER BY created_at ASC",
        )?;

        let pins = stmt
            .query_map(params![map_id], |row| {
                Ok(BookMapPin {
                    id: row.get(0)?,
                    map_id: row.get(1)?,
                    book_id: row.get(2)?,
                    label: row.get(3)?,
                    notes: row.get(4)?,
                    chapter_index: row.get(5)?,
                    x_percent: row.get(6)?,
                    y_percent: row.get(7)?,
                    color: row.get(8)?,
                    created_at: row.get(9)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(pins)
    }

    pub fn save_map_pin(
        conn: &Connection,
        pin_id: Option<i64>,
        map_id: i64,
        book_id: i64,
        label: &str,
        notes: Option<&str>,
        chapter_index: Option<i32>,
        x_percent: f64,
        y_percent: f64,
        color: Option<&str>,
    ) -> Result<BookMapPin> {
        let pin_color = color.unwrap_or("#ef4444");

        let id = match pin_id {
            Some(existing_id) => {
                conn.execute(
                    "UPDATE book_map_pins
                     SET label = ?1, notes = ?2, chapter_index = ?3, x_percent = ?4, y_percent = ?5, color = ?6
                     WHERE id = ?7",
                    params![
                        label,
                        notes,
                        chapter_index,
                        x_percent,
                        y_percent,
                        pin_color,
                        existing_id
                    ],
                )?;
                existing_id
            }
            None => {
                conn.execute(
                    "INSERT INTO book_map_pins (map_id, book_id, label, notes, chapter_index, x_percent, y_percent, color)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        map_id,
                        book_id,
                        label,
                        notes,
                        chapter_index,
                        x_percent,
                        y_percent,
                        pin_color
                    ],
                )?;
                conn.last_insert_rowid()
            }
        };

        let now = chrono::Utc::now().to_rfc3339();
        Ok(BookMapPin {
            id,
            map_id,
            book_id,
            label: label.to_string(),
            notes: notes.map(|s| s.to_string()),
            chapter_index,
            x_percent,
            y_percent,
            color: pin_color.to_string(),
            created_at: now,
        })
    }

    pub fn delete_map_pin(conn: &Connection, pin_id: i64) -> Result<()> {
        conn.execute("DELETE FROM book_map_pins WHERE id = ?1", params![pin_id])?;
        Ok(())
    }
}
