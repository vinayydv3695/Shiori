use crate::error::Result;
use crate::models::{MangaSeries, MangaVolume};
use crate::services::manga_service::{MangaMetadata, MangaService};
use crate::utils::validate;
use crate::AppState;
use regex::Regex;
use std::sync::Arc;
use tauri::State;
use lazy_static::lazy_static;

/// Global manga service state
pub struct MangaState {
    pub service: Arc<MangaService>,
}

impl MangaState {
    pub fn new() -> Self {
        Self {
            service: Arc::new(MangaService::new()),
        }
    }
}

// ==================== Manga Reader Commands ====================

#[tauri::command]
pub fn open_manga(
    book_id: i64,
    path: String,
    state: State<MangaState>,
) -> Result<MangaMetadata> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_safe_path(&path, "path")?;
    state.service.open(book_id, &path)
}

#[tauri::command]
pub async fn get_manga_page(
    book_id: i64,
    page_index: usize,
    max_dimension: u32,
    state: State<'_, MangaState>,
) -> Result<tauri::ipc::Response> {
    validate::require_positive_id(book_id, "book_id")?;
    let bytes = state.service.get_page(book_id, page_index, max_dimension).await?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn preload_manga_pages(
    book_id: i64,
    page_indices: Vec<usize>,
    max_dimension: u32,
    state: State<'_, MangaState>,
) -> Result<()> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty_vec(&page_indices, "page_indices")?;
    state.service.preload_pages(book_id, &page_indices, max_dimension).await
}

#[tauri::command]
pub fn get_manga_page_dimensions(
    book_id: i64,
    page_indices: Vec<usize>,
    state: State<MangaState>,
) -> Result<Vec<(u32, u32)>> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty_vec(&page_indices, "page_indices")?;
    state.service.get_page_dimensions(book_id, &page_indices)
}

#[tauri::command]
pub fn close_manga(
    book_id: i64,
    state: State<MangaState>,
) -> Result<()> {
    validate::require_positive_id(book_id, "book_id")?;
    state.service.close(book_id);
    Ok(())
}

#[tauri::command]
pub async fn get_manga_page_path(
    book_id: i64,
    page_index: usize,
    max_dimension: u32,
    state: State<'_, MangaState>,
) -> Result<String> {
    validate::require_positive_id(book_id, "book_id")?;
    let bytes = state.service.get_page(book_id, page_index, max_dimension).await?;
    
    let mut dir = std::env::temp_dir();
    dir.push("shiori");
    dir.push("manga-pages");
    std::fs::create_dir_all(&dir).map_err(|e| crate::error::ShioriError::Io(e))?;
    
    let filename = format!("manga-{}-{}-{}.img", book_id, page_index, max_dimension);
    let final_path = dir.join(&filename);
    
    // If file already exists with correct size, skip writing
    if final_path.exists() {
        if let Ok(meta) = std::fs::metadata(&final_path) {
            if meta.len() == bytes.len() as u64 {
                return Ok(final_path.to_string_lossy().into_owned());
            }
        }
    }
    
    // Write atomically
    let tmp_path = dir.join(format!("{}.tmp", filename));
    std::fs::write(&tmp_path, &bytes).map_err(|e| crate::error::ShioriError::Io(e))?;
    std::fs::rename(&tmp_path, &final_path).map_err(|e| crate::error::ShioriError::Io(e))?;
    
    Ok(final_path.to_string_lossy().into_owned())
}

// ==================== Manga Series Management Commands ====================

lazy_static! {
    static ref MANGA_VOLUME_REGEX: Regex = Regex::new(
        r"^(?:\[[^\]]+\]\s*)?(.*?)\s*[-_#]?\s*(?:Vol\.?|Volume|v|Bk\.?|Book|Ch\.?|Chapter|Ep\.?|Episode|#)?\s*(\d+(?:\.\d+)?)\s*(?:\((?:Digital|Scan|Web)?\s*\)?\s*)?(?:\((?:\d{4})\))?.*$"
    ).expect("Invalid regex pattern for manga volume parsing");
}

#[tauri::command]
pub fn get_manga_series_list(
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<MangaSeries>> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    
    validate::require_positive_id(limit, "limit")?;
    validate::require_positive_id(offset, "offset")?;

    let db = &state.db;
    let conn = db.get_connection()?;

    let mut stmt = conn.prepare(
        "SELECT id, title, sort_title, cover_path, status, added_date 
         FROM manga_series 
         ORDER BY added_date DESC 
         LIMIT ? OFFSET ?"
    )?;

    let series_iter = stmt.query_map([limit, offset], |row| {
        Ok(MangaSeries {
            id: row.get(0)?,
            title: row.get(1)?,
            sort_title: row.get(2)?,
            cover_path: row.get(3)?,
            status: row.get(4)?,
            added_date: row.get(5)?,
        })
    })?;

    let mut series_list = Vec::new();
    for series_result in series_iter {
        series_list.push(series_result?);
    }

    Ok(series_list)
}

#[tauri::command]
pub fn get_series_volumes(
    series_id: i64,
    state: State<AppState>,
) -> Result<Vec<MangaVolume>> {
    validate::require_positive_id(series_id, "series_id")?;

    let db = &state.db;
    let conn = db.get_connection()?;

    let exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM manga_series WHERE id = ?",
        [series_id],
        |row| row.get(0),
    )?;

    if !exists {
        return Err(crate::error::ShioriError::BookNotFound(format!(
            "Manga series with id {} not found",
            series_id
        )));
    }

    let mut stmt = conn.prepare(
        "SELECT id, manga_series_id, book_id, volume_number 
         FROM books 
         WHERE manga_series_id = ? 
         ORDER BY volume_number ASC NULLS LAST, added_date ASC"
    )?;

    let volumes_iter = stmt.query_map([series_id], |row| {
        Ok(MangaVolume {
            id: row.get(0)?,
            manga_series_id: row.get(1)?,
            book_id: row.get(2)?,
            volume_number: row.get(3)?,
        })
    })?;

    let mut volumes = Vec::new();
    for vol_result in volumes_iter {
        volumes.push(vol_result?);
    }

    Ok(volumes)
}

#[tauri::command]
pub async fn auto_group_manga_volumes(state: State<'_, AppState>) -> Result<usize> {
    let db = &state.db;
    let conn = db.get_connection()?;

    let mut stmt = conn.prepare(
        "SELECT id, title FROM books 
         WHERE domain IN ('manga', 'comic') AND manga_series_id IS NULL 
         ORDER BY title ASC"
    )?;

    let books_to_process: Vec<(i64, String)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|e| crate::error::ShioriError::from(e))?;

    let mut grouped_count = 0;

    for (book_id, title) in books_to_process {
        if let Some(captures) = MANGA_VOLUME_REGEX.captures(&title) {
            if let (Some(series_name_match), Some(volume_match)) =
                (captures.get(1), captures.get(2))
            {
                let series_name = series_name_match.as_str().trim().to_string();
                let volume_num = volume_match
                    .as_str()
                    .parse::<f32>()
                    .unwrap_or(0.0)
                    .round() as i32;

                if !series_name.is_empty() && volume_num > 0 {
                    let series_id: Option<i64> = conn
                        .query_row(
                            "SELECT id FROM manga_series WHERE title = ?",
                            [&series_name],
                            |row| row.get(0),
                        )
                        .ok();

                    let series_id = if let Some(sid) = series_id {
                        sid
                    } else {
                        conn.execute(
                            "INSERT INTO manga_series (title, sort_title, status, added_date) 
                             VALUES (?, ?, 'ongoing', CURRENT_TIMESTAMP)",
                            [&series_name, &series_name],
                        )?;
                        conn.last_insert_rowid()
                    };

                    conn.execute(
                        "UPDATE books SET manga_series_id = ?, series = ?, series_index = ? WHERE id = ?",
                        rusqlite::params![series_id, &series_name, volume_num, book_id],
                    )?;

                    grouped_count += 1;
                }
            }
        }
    }

    Ok(grouped_count)
}

#[tauri::command]
pub fn create_manga_series(
    title: String,
    state: State<AppState>,
) -> Result<i64> {
    let title = title.trim();
    if title.is_empty() {
        return Err(crate::error::ShioriError::Validation(
            "Series title cannot be empty".to_string(),
        ));
    }

    let db = &state.db;
    let conn = db.get_connection()?;

    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM manga_series WHERE title = ?",
            [title],
            |row| row.get(0),
        )
        .ok();

    if let Some(id) = existing {
        return Ok(id);
    }

    conn.execute(
        "INSERT INTO manga_series (title, sort_title, status, added_date) 
         VALUES (?, ?, 'ongoing', CURRENT_TIMESTAMP)",
        [title, title],
    )?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn assign_book_to_series(
    book_id: i64,
    series_title: String,
    chapter_number: Option<i32>,
    state: State<AppState>,
) -> Result<()> {
    validate::require_positive_id(book_id, "book_id")?;
    
    let series_title = series_title.trim();
    if series_title.is_empty() {
        return Err(crate::error::ShioriError::Validation(
            "Series title cannot be empty".to_string(),
        ));
    }

    let db = &state.db;
    let conn = db.get_connection()?;

    let series_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM manga_series WHERE title = ?",
            [series_title],
            |row| row.get(0),
        )
        .ok();

    let series_id = if let Some(sid) = series_id {
        sid
    } else {
        conn.execute(
            "INSERT INTO manga_series (title, sort_title, status, added_date) 
             VALUES (?, ?, 'ongoing', CURRENT_TIMESTAMP)",
            [series_title, series_title],
        )?;
        conn.last_insert_rowid()
    };

    conn.execute(
        "UPDATE books SET manga_series_id = ?, series = ?, series_index = ? WHERE id = ?",
        rusqlite::params![series_id, series_title, chapter_number, book_id],
    )?;

    Ok(())
}

#[tauri::command]
pub fn remove_book_from_series(
    book_id: i64,
    state: State<AppState>,
) -> Result<()> {
    validate::require_positive_id(book_id, "book_id")?;

    let db = &state.db;
    let conn = db.get_connection()?;

    conn.execute(
        "UPDATE books SET manga_series_id = NULL, series = NULL, series_index = NULL WHERE id = ?",
        [book_id],
    )?;

    Ok(())
}
