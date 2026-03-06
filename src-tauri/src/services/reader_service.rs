use crate::error::Result;
use crate::models::{
    Annotation, AnnotationCategory, AnnotationExportData, AnnotationExportOptions,
    AnnotationSearchResult, BookReadingStats, DailyReadingStats, ReaderSettings, ReadingGoal,
    ReadingProgress, ReadingSession, ReadingStreak,
};
use chrono::Utc;
use rusqlite::{params, Connection};

pub struct ReaderService;

impl ReaderService {
    // ==================== Reading Progress ====================

    pub fn get_reading_progress(
        conn: &Connection,
        book_id: i64,
    ) -> Result<Option<ReadingProgress>> {
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
    ) -> Result<ReadingProgress> {
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

    pub fn get_annotations(conn: &Connection, book_id: i64) -> Result<Vec<Annotation>> {
        let mut stmt = conn.prepare(
            "SELECT id, book_id, type, location, cfi_range, selected_text, 
                    note_content, color, category_id, chapter_title, created_at, updated_at
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
                    category_id: row.get(8)?,
                    chapter_title: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

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
        category_id: Option<i64>,
        chapter_title: Option<&str>,
    ) -> Result<Annotation> {
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO annotations 
             (book_id, type, location, cfi_range, selected_text, note_content, color, category_id, chapter_title, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                book_id,
                annotation_type,
                location,
                cfi_range,
                selected_text,
                note_content,
                color,
                category_id,
                chapter_title,
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
            category_id,
            chapter_title: chapter_title.map(String::from),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_annotation(
        conn: &Connection,
        id: i64,
        note_content: Option<&str>,
        color: Option<&str>,
        category_id: Option<i64>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();

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

        if let Some(cat_id) = category_id {
            conn.execute(
                "UPDATE annotations SET category_id = ?1, updated_at = ?2 WHERE id = ?3",
                params![cat_id, now, id],
            )?;
        }

        Ok(())
    }

    pub fn delete_annotation(conn: &Connection, id: i64) -> Result<()> {
        conn.execute("DELETE FROM annotations WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ==================== Annotation Categories ====================

    pub fn get_annotation_categories(conn: &Connection) -> Result<Vec<AnnotationCategory>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, color, icon, sort_order, created_at
             FROM annotation_categories
             ORDER BY sort_order ASC",
        )?;

        let categories = stmt
            .query_map([], |row| {
                Ok(AnnotationCategory {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                    icon: row.get(3)?,
                    sort_order: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(categories)
    }

    pub fn create_annotation_category(
        conn: &Connection,
        name: &str,
        color: &str,
        icon: Option<&str>,
    ) -> Result<AnnotationCategory> {
        let now = Utc::now().to_rfc3339();

        let max_order: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), 0) FROM annotation_categories",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        conn.execute(
            "INSERT INTO annotation_categories (name, color, icon, sort_order, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![name, color, icon, max_order + 1, now],
        )?;

        let id = conn.last_insert_rowid();

        Ok(AnnotationCategory {
            id: Some(id),
            name: name.to_string(),
            color: color.to_string(),
            icon: icon.map(String::from),
            sort_order: max_order + 1,
            created_at: now,
        })
    }

    pub fn update_annotation_category(
        conn: &Connection,
        id: i64,
        name: Option<&str>,
        color: Option<&str>,
        icon: Option<&str>,
    ) -> Result<()> {
        if let Some(n) = name {
            conn.execute(
                "UPDATE annotation_categories SET name = ?1 WHERE id = ?2",
                params![n, id],
            )?;
        }
        if let Some(c) = color {
            conn.execute(
                "UPDATE annotation_categories SET color = ?1 WHERE id = ?2",
                params![c, id],
            )?;
        }
        if let Some(i) = icon {
            conn.execute(
                "UPDATE annotation_categories SET icon = ?1 WHERE id = ?2",
                params![i, id],
            )?;
        }
        Ok(())
    }

    pub fn delete_annotation_category(conn: &Connection, id: i64) -> Result<()> {
        conn.execute(
            "UPDATE annotations SET category_id = NULL WHERE category_id = ?1",
            params![id],
        )?;
        conn.execute(
            "DELETE FROM annotation_categories WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    // ==================== Global Annotation Search ====================

    pub fn search_annotations_global(
        conn: &Connection,
        query: &str,
        book_id: Option<i64>,
        annotation_type: Option<&str>,
        category_id: Option<i64>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AnnotationSearchResult>> {
        let fts_query = format!("\"{}\"", query.replace('"', "\"\""));

        let sql = r#"
            SELECT a.id, a.book_id, a.type, a.location, a.cfi_range, a.selected_text,
                   a.note_content, a.color, a.category_id, a.chapter_title, a.created_at, a.updated_at,
                   b.title,
                   COALESCE(
                       (SELECT GROUP_CONCAT(au.name, ', ') FROM authors au
                        JOIN books_authors ba ON au.id = ba.author_id
                        WHERE ba.book_id = b.id), ''
                   ) as author_names
            FROM annotations a
            JOIN annotations_fts fts ON a.id = fts.rowid
            JOIN books b ON a.book_id = b.id
            WHERE annotations_fts MATCH ?1
              AND (?2 IS NULL OR a.book_id = ?2)
              AND (?3 IS NULL OR a.type = ?3)
              AND (?4 IS NULL OR a.category_id = ?4)
            ORDER BY a.created_at DESC
            LIMIT ?5 OFFSET ?6
        "#;

        let mut stmt = conn.prepare(sql)?;
        let results = stmt
            .query_map(
                params![
                    fts_query,
                    book_id,
                    annotation_type,
                    category_id,
                    limit,
                    offset
                ],
                |row| {
                    Ok(AnnotationSearchResult {
                        annotation: Annotation {
                            id: row.get(0)?,
                            book_id: row.get(1)?,
                            annotation_type: row.get(2)?,
                            location: row.get(3)?,
                            cfi_range: row.get(4)?,
                            selected_text: row.get(5)?,
                            note_content: row.get(6)?,
                            color: row.get(7)?,
                            category_id: row.get(8)?,
                            chapter_title: row.get(9)?,
                            created_at: row.get(10)?,
                            updated_at: row.get(11)?,
                        },
                        book_title: row.get(12)?,
                        book_author: row.get(13)?,
                    })
                },
            )?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(results)
    }

    pub fn get_all_annotations(
        conn: &Connection,
        book_id: Option<i64>,
        annotation_type: Option<&str>,
        category_id: Option<i64>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AnnotationSearchResult>> {
        let sql = r#"
            SELECT a.id, a.book_id, a.type, a.location, a.cfi_range, a.selected_text,
                   a.note_content, a.color, a.category_id, a.chapter_title, a.created_at, a.updated_at,
                   b.title,
                   COALESCE(
                       (SELECT GROUP_CONCAT(au.name, ', ') FROM authors au
                        JOIN books_authors ba ON au.id = ba.author_id
                        WHERE ba.book_id = b.id), ''
                   ) as author_names
            FROM annotations a
            JOIN books b ON a.book_id = b.id
            WHERE (?1 IS NULL OR a.book_id = ?1)
              AND (?2 IS NULL OR a.type = ?2)
              AND (?3 IS NULL OR a.category_id = ?3)
            ORDER BY a.created_at DESC
            LIMIT ?4 OFFSET ?5
        "#;

        let mut stmt = conn.prepare(sql)?;
        let results = stmt
            .query_map(
                params![book_id, annotation_type, category_id, limit, offset],
                |row| {
                    Ok(AnnotationSearchResult {
                        annotation: Annotation {
                            id: row.get(0)?,
                            book_id: row.get(1)?,
                            annotation_type: row.get(2)?,
                            location: row.get(3)?,
                            cfi_range: row.get(4)?,
                            selected_text: row.get(5)?,
                            note_content: row.get(6)?,
                            color: row.get(7)?,
                            category_id: row.get(8)?,
                            chapter_title: row.get(9)?,
                            created_at: row.get(10)?,
                            updated_at: row.get(11)?,
                        },
                        book_title: row.get(12)?,
                        book_author: row.get(13)?,
                    })
                },
            )?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(results)
    }

    // ==================== Annotation Export ====================

    pub fn export_annotations(
        conn: &Connection,
        options: &AnnotationExportOptions,
    ) -> Result<AnnotationExportData> {
        let results = Self::get_all_annotations(conn, options.book_id, None, None, 10000, 0)?;

        let filtered: Vec<&AnnotationSearchResult> = results
            .iter()
            .filter(|r| {
                if let Some(ref types) = options.annotation_types {
                    if !types.contains(&r.annotation.annotation_type) {
                        return false;
                    }
                }
                if let Some(ref cats) = options.category_ids {
                    if let Some(cat_id) = r.annotation.category_id {
                        if !cats.contains(&cat_id) {
                            return false;
                        }
                    } else {
                        return false;
                    }
                }
                true
            })
            .collect();

        let annotation_count = filtered.len();

        let content = match options.format.as_str() {
            "json" => Self::export_as_json(&filtered, options.include_book_info),
            "text" => Self::export_as_text(&filtered, options.include_book_info),
            _ => Self::export_as_markdown(&filtered, options.include_book_info),
        };

        Ok(AnnotationExportData {
            content,
            format: options.format.clone(),
            annotation_count,
        })
    }

    fn export_as_markdown(
        annotations: &[&AnnotationSearchResult],
        include_book_info: bool,
    ) -> String {
        let mut output = String::from("# Annotations Export\n\n");
        let mut current_book = String::new();

        for result in annotations {
            if include_book_info && result.book_title != current_book {
                current_book = result.book_title.clone();
                output.push_str(&format!("## {}\n", result.book_title));
                if !result.book_author.is_empty() {
                    output.push_str(&format!("*by {}*\n", result.book_author));
                }
                output.push('\n');
            }

            if let Some(ref chapter) = result.annotation.chapter_title {
                output.push_str(&format!("### {}\n\n", chapter));
            }

            match result.annotation.annotation_type.as_str() {
                "highlight" => {
                    if let Some(ref text) = result.annotation.selected_text {
                        output.push_str(&format!("> {}\n\n", text));
                    }
                }
                "note" => {
                    if let Some(ref text) = result.annotation.selected_text {
                        output.push_str(&format!("> {}\n\n", text));
                    }
                    if let Some(ref note) = result.annotation.note_content {
                        output.push_str(&format!("**Note:** {}\n\n", note));
                    }
                }
                "bookmark" => {
                    output.push_str(&format!("Bookmark at {}\n\n", result.annotation.location));
                }
                _ => {}
            }

            output.push_str(&format!("*{}*\n\n---\n\n", result.annotation.created_at));
        }

        output
    }

    fn export_as_json(annotations: &[&AnnotationSearchResult], include_book_info: bool) -> String {
        let items: Vec<serde_json::Value> = annotations
            .iter()
            .map(|r| {
                let mut obj = serde_json::json!({
                    "type": r.annotation.annotation_type,
                    "text": r.annotation.selected_text,
                    "note": r.annotation.note_content,
                    "color": r.annotation.color,
                    "location": r.annotation.location,
                    "chapter": r.annotation.chapter_title,
                    "created_at": r.annotation.created_at,
                });
                if include_book_info {
                    obj["book_title"] = serde_json::json!(r.book_title);
                    obj["book_author"] = serde_json::json!(r.book_author);
                }
                obj
            })
            .collect();

        serde_json::to_string_pretty(&items).unwrap_or_else(|_| "[]".to_string())
    }

    fn export_as_text(annotations: &[&AnnotationSearchResult], include_book_info: bool) -> String {
        let mut output = String::from("ANNOTATIONS EXPORT\n==================\n\n");
        let mut current_book = String::new();

        for result in annotations {
            if include_book_info && result.book_title != current_book {
                current_book = result.book_title.clone();
                output.push_str(&format!("{}\n", result.book_title));
                if !result.book_author.is_empty() {
                    output.push_str(&format!("by {}\n", result.book_author));
                }
                output.push_str(&"-".repeat(40));
                output.push('\n');
            }

            let type_label = match result.annotation.annotation_type.as_str() {
                "highlight" => "HIGHLIGHT",
                "note" => "NOTE",
                "bookmark" => "BOOKMARK",
                other => other,
            };

            output.push_str(&format!("[{}] ", type_label));

            if let Some(ref text) = result.annotation.selected_text {
                output.push_str(&format!("\"{}\"", text));
            }

            if let Some(ref note) = result.annotation.note_content {
                output.push_str(&format!("\n  Note: {}", note));
            }

            output.push_str(&format!("\n  Date: {}\n\n", result.annotation.created_at));
        }

        output
    }

    // ==================== Reading Sessions & Statistics ====================

    pub fn start_reading_session(
        conn: &Connection,
        book_id: i64,
        pages_start: Option<i32>,
    ) -> Result<ReadingSession> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO reading_sessions (id, book_id, started_at, duration_seconds, pages_start, created_at)
             VALUES (?1, ?2, ?3, 0, ?4, ?5)",
            params![id, book_id, now, pages_start, now],
        )?;

        Ok(ReadingSession {
            id,
            book_id,
            started_at: now.clone(),
            ended_at: None,
            duration_seconds: 0,
            pages_start,
            pages_end: None,
            created_at: now,
        })
    }

    pub fn end_reading_session(
        conn: &Connection,
        session_id: &str,
        pages_end: Option<i32>,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE reading_sessions SET ended_at = ?1, pages_end = ?2 WHERE id = ?3 AND ended_at IS NULL",
            params![now, pages_end, session_id],
        )?;

        Ok(())
    }

    pub fn heartbeat_reading_session(
        conn: &Connection,
        session_id: &str,
        duration_seconds: i64,
    ) -> Result<()> {
        conn.execute(
            "UPDATE reading_sessions SET duration_seconds = ?1 WHERE id = ?2 AND ended_at IS NULL",
            params![duration_seconds, session_id],
        )?;

        Ok(())
    }

    pub fn get_daily_reading_stats(conn: &Connection, days: i32) -> Result<Vec<DailyReadingStats>> {
        let sql = r#"
            SELECT
                date(started_at) as read_date,
                SUM(duration_seconds) as total_seconds,
                COUNT(DISTINCT book_id) as books_count,
                COUNT(*) as sessions_count
            FROM reading_sessions
            WHERE started_at >= date('now', ?1 || ' days')
              AND duration_seconds > 0
            GROUP BY date(started_at)
            ORDER BY read_date ASC
        "#;

        let days_param = format!("-{}", days);
        let mut stmt = conn.prepare(sql)?;
        let results = stmt
            .query_map(params![days_param], |row| {
                Ok(DailyReadingStats {
                    date: row.get(0)?,
                    total_seconds: row.get(1)?,
                    books_count: row.get(2)?,
                    sessions_count: row.get(3)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(results)
    }

    pub fn get_book_reading_stats(conn: &Connection, book_id: i64) -> Result<BookReadingStats> {
        let sql = r#"
            SELECT
                COALESCE(SUM(duration_seconds), 0) as total_seconds,
                COUNT(*) as sessions_count,
                MAX(started_at) as last_read,
                CASE WHEN COUNT(*) > 0
                    THEN CAST(SUM(duration_seconds) AS REAL) / COUNT(*) / 60.0
                    ELSE 0.0
                END as average_session_minutes
            FROM reading_sessions
            WHERE book_id = ?1 AND duration_seconds > 0
        "#;

        let result = conn.query_row(sql, params![book_id], |row| {
            Ok(BookReadingStats {
                book_id,
                total_seconds: row.get(0)?,
                sessions_count: row.get(1)?,
                last_read: row.get(2)?,
                average_session_minutes: row.get(3)?,
            })
        })?;

        Ok(result)
    }

    pub fn get_reading_streak(conn: &Connection) -> Result<ReadingStreak> {
        let total_days: i32 = conn.query_row(
            "SELECT COUNT(DISTINCT date(started_at)) FROM reading_sessions WHERE duration_seconds > 0",
            [],
            |row| row.get(0),
        )?;

        let current_streak: i32 = conn.query_row(
            r#"
            WITH RECURSIVE dates AS (
                SELECT date('now') as d
                UNION ALL
                SELECT date(d, '-1 day') FROM dates
                WHERE EXISTS (
                    SELECT 1 FROM reading_sessions
                    WHERE date(started_at) = date(dates.d, '-1 day')
                      AND duration_seconds > 0
                )
            )
            SELECT COUNT(*) FROM dates
            WHERE EXISTS (
                SELECT 1 FROM reading_sessions
                WHERE date(started_at) = dates.d AND duration_seconds > 0
            )
            "#,
            [],
            |row| row.get(0),
        )?;

        let longest_streak: i32 = conn.query_row(
            r#"
            WITH reading_days AS (
                SELECT DISTINCT date(started_at) as d
                FROM reading_sessions
                WHERE duration_seconds > 0
            ),
            numbered AS (
                SELECT d, ROW_NUMBER() OVER (ORDER BY d) as rn
                FROM reading_days
            ),
            groups AS (
                SELECT d, date(d, '-' || rn || ' days') as grp
                FROM numbered
            )
            SELECT COALESCE(MAX(streak_len), 0) FROM (
                SELECT COUNT(*) as streak_len FROM groups GROUP BY grp
            )
            "#,
            [],
            |row| row.get(0),
        )?;

        Ok(ReadingStreak {
            current_streak,
            longest_streak,
            total_reading_days: total_days,
        })
    }

    pub fn get_reading_goal(conn: &Connection) -> Result<ReadingGoal> {
        let result = conn.query_row(
            "SELECT id, daily_minutes_target, is_active, created_at, updated_at
             FROM reading_goals WHERE is_active = 1 ORDER BY id DESC LIMIT 1",
            [],
            |row| {
                Ok(ReadingGoal {
                    id: row.get(0)?,
                    daily_minutes_target: row.get(1)?,
                    is_active: row.get::<_, i32>(2)? != 0,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        );

        match result {
            Ok(goal) => Ok(goal),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(ReadingGoal {
                id: None,
                daily_minutes_target: 30,
                is_active: true,
                created_at: Utc::now().to_rfc3339(),
                updated_at: Utc::now().to_rfc3339(),
            }),
            Err(e) => Err(e.into()),
        }
    }

    pub fn update_reading_goal(
        conn: &Connection,
        daily_minutes_target: i32,
    ) -> Result<ReadingGoal> {
        let now = Utc::now().to_rfc3339();

        let updated = conn.execute(
            "UPDATE reading_goals SET daily_minutes_target = ?1, updated_at = ?2 WHERE is_active = 1",
            params![daily_minutes_target, now],
        )?;

        if updated == 0 {
            conn.execute(
                "INSERT INTO reading_goals (daily_minutes_target, is_active, created_at, updated_at)
                 VALUES (?1, 1, ?2, ?3)",
                params![daily_minutes_target, now, now],
            )?;
        }

        Self::get_reading_goal(conn)
    }

    pub fn get_today_reading_time(conn: &Connection) -> Result<i64> {
        let seconds: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(duration_seconds), 0)
                 FROM reading_sessions
                 WHERE date(started_at) = date('now') AND duration_seconds > 0",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(seconds)
    }

    // ==================== Reader Settings ====================

    pub fn get_reader_settings(conn: &Connection, user_id: &str) -> Result<ReaderSettings> {
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
    ) -> Result<ReaderSettings> {
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
