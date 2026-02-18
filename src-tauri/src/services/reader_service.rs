use crate::error::ShioriResult;
use crate::models::{Annotation, ReaderSettings, ReadingProgress};
use chrono::Utc;
use rusqlite::{params, Connection};

pub struct ReaderService;

impl ReaderService {
    // ==================== Reading Progress ====================

    pub fn get_reading_progress(
        conn: &Connection,
        book_id: i64,
    ) -> ShioriResult<Option<ReadingProgress>> {
        let mut stmt = conn.prepare(
            "SELECT id, book_id, current_location, progress_percent, current_page, total_pages, last_read
             FROM reading_progress
             WHERE book_id = ?1"
        )?;

        let result = stmt.query_row(params![book_id], |row| {
            Ok(ReadingProgress {
                id: row.get(0)?,
                book_id: row.get(1)?,
                current_location: row.get(2)?,
                progress_percent: row.get(3)?,
                current_page: row.get(4)?,
                total_pages: row.get(5)?,
                last_read: row.get(6)?,
            })
        });

        match result {
            Ok(progress) => Ok(Some(progress)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn save_reading_progress(
        conn: &Connection,
        book_id: i64,
        current_location: &str,
        progress_percent: f64,
        current_page: Option<i32>,
        total_pages: Option<i32>,
    ) -> ShioriResult<ReadingProgress> {
        let now = Utc::now().to_rfc3339();

        // Check if progress exists
        let existing = Self::get_reading_progress(conn, book_id)?;

        let id = if let Some(existing_progress) = existing {
            // Update existing
            conn.execute(
                "UPDATE reading_progress 
                 SET current_location = ?1, progress_percent = ?2, current_page = ?3, 
                     total_pages = ?4, last_read = ?5
                 WHERE book_id = ?6",
                params![
                    current_location,
                    progress_percent,
                    current_page,
                    total_pages,
                    now,
                    book_id
                ],
            )?;
            existing_progress.id
        } else {
            // Insert new
            conn.execute(
                "INSERT INTO reading_progress (book_id, current_location, progress_percent, current_page, total_pages, last_read)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    book_id,
                    current_location,
                    progress_percent,
                    current_page,
                    total_pages,
                    now
                ],
            )?;
            Some(conn.last_insert_rowid())
        };

        // Update last_opened in books table
        conn.execute(
            "UPDATE books SET last_opened = ?1 WHERE id = ?2",
            params![now, book_id],
        )?;

        Ok(ReadingProgress {
            id,
            book_id,
            current_location: current_location.to_string(),
            progress_percent,
            current_page,
            total_pages,
            last_read: now,
        })
    }

    // ==================== Annotations ====================

    pub fn get_annotations(conn: &Connection, book_id: i64) -> ShioriResult<Vec<Annotation>> {
        let mut stmt = conn.prepare(
            "SELECT id, book_id, type, location, cfi_range, selected_text, 
                    note_content, color, created_at, updated_at
             FROM annotations
             WHERE book_id = ?1
             ORDER BY created_at DESC",
        )?;

        let annotations = stmt
            .query_map(params![book_id], |row| {
                Ok(Annotation {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    annotation_type: row.get(2)?,
                    location: row.get(3)?,
                    cfi_range: row.get(4)?,
                    selected_text: row.get(5)?,
                    note_content: row.get(6)?,
                    color: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(annotations)
    }

    pub fn create_annotation(
        conn: &Connection,
        book_id: i64,
        annotation_type: &str,
        location: &str,
        cfi_range: Option<&str>,
        selected_text: Option<&str>,
        note_content: Option<&str>,
        color: &str,
    ) -> ShioriResult<Annotation> {
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO annotations 
             (book_id, type, location, cfi_range, selected_text, note_content, color, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                book_id,
                annotation_type,
                location,
                cfi_range,
                selected_text,
                note_content,
                color,
                now,
                now
            ],
        )?;

        let id = conn.last_insert_rowid();

        Ok(Annotation {
            id: Some(id),
            book_id,
            annotation_type: annotation_type.to_string(),
            location: location.to_string(),
            cfi_range: cfi_range.map(String::from),
            selected_text: selected_text.map(String::from),
            note_content: note_content.map(String::from),
            color: color.to_string(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_annotation(
        conn: &Connection,
        id: i64,
        note_content: Option<&str>,
        color: Option<&str>,
    ) -> ShioriResult<()> {
        let now = Utc::now().to_rfc3339();

        // Build dynamic query based on what's being updated
        if let Some(content) = note_content {
            conn.execute(
                "UPDATE annotations SET note_content = ?1, updated_at = ?2 WHERE id = ?3",
                params![content, now, id],
            )?;
        }

        if let Some(c) = color {
            conn.execute(
                "UPDATE annotations SET color = ?1, updated_at = ?2 WHERE id = ?3",
                params![c, now, id],
            )?;
        }

        Ok(())
    }

    pub fn delete_annotation(conn: &Connection, id: i64) -> ShioriResult<()> {
        conn.execute("DELETE FROM annotations WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ==================== Reader Settings ====================

    pub fn get_reader_settings(conn: &Connection, user_id: &str) -> ShioriResult<ReaderSettings> {
        let mut stmt = conn.prepare(
            "SELECT user_id, font_family, font_size, line_height, theme, page_mode, margin_size, updated_at
             FROM reader_settings
             WHERE user_id = ?1"
        )?;

        let result = stmt.query_row(params![user_id], |row| {
            Ok(ReaderSettings {
                id: None, // reader_settings uses user_id as primary key, no separate id column
                user_id: row.get(0)?,
                font_family: row.get(1)?,
                font_size: row.get(2)?,
                line_height: row.get(3)?,
                theme: row.get(4)?,
                page_mode: row.get(5)?,
                margin_size: row.get(6)?,
                updated_at: row.get(7)?,
            })
        });

        match result {
            Ok(settings) => Ok(settings),
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                // Return default settings
                Ok(ReaderSettings {
                    id: None,
                    user_id: user_id.to_string(),
                    font_family: "serif".to_string(),
                    font_size: 16,
                    line_height: 1.6,
                    theme: "light".to_string(),
                    page_mode: "paginated".to_string(),
                    margin_size: 2,
                    updated_at: Utc::now().to_rfc3339(),
                })
            }
            Err(e) => Err(e.into()),
        }
    }

    pub fn save_reader_settings(
        conn: &Connection,
        user_id: &str,
        font_family: &str,
        font_size: i32,
        line_height: f64,
        theme: &str,
        page_mode: &str,
        margin_size: i32,
    ) -> ShioriResult<ReaderSettings> {
        let now = Utc::now().to_rfc3339();

        // Check if settings exist
        let existing = conn
            .query_row(
                "SELECT user_id FROM reader_settings WHERE user_id = ?1",
                params![user_id],
                |row| row.get::<_, String>(0),
            )
            .ok();

        if existing.is_some() {
            // Update existing
            conn.execute(
                "UPDATE reader_settings 
                 SET font_family = ?1, font_size = ?2, line_height = ?3, theme = ?4, 
                     page_mode = ?5, margin_size = ?6, updated_at = ?7
                 WHERE user_id = ?8",
                params![
                    font_family,
                    font_size,
                    line_height,
                    theme,
                    page_mode,
                    margin_size,
                    now,
                    user_id
                ],
            )?;
        } else {
            // Insert new
            conn.execute(
                "INSERT INTO reader_settings 
                 (user_id, font_family, font_size, line_height, theme, page_mode, margin_size, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    user_id,
                    font_family,
                    font_size,
                    line_height,
                    theme,
                    page_mode,
                    margin_size,
                    now
                ],
            )?;
        }

        Ok(ReaderSettings {
            id: None, // reader_settings uses user_id as primary key, no separate id column
            user_id: user_id.to_string(),
            font_family: font_family.to_string(),
            font_size,
            line_height,
            theme: theme.to_string(),
            page_mode: page_mode.to_string(),
            margin_size,
            updated_at: now,
        })
    }
}
