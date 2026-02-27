use crate::error::Result;
use crate::models::Doodle;
use crate::utils::validate;
use crate::AppState;
use tauri::State;

/// Save doodle strokes for a specific book page.
/// Uses UPSERT (INSERT OR REPLACE) to handle both create and update.
#[tauri::command]
pub fn save_doodle(
    book_id: i64,
    page_number: String,
    strokes_json: String,
    state: State<AppState>,
) -> Result<Doodle> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty(&page_number, "page_number")?;
    let conn = state.db.get_connection()?;

    // Enforce 5MB size limit per doodle entry
    if strokes_json.len() > 5 * 1024 * 1024 {
        return Err(crate::error::ShioriError::Other(
            "Doodle data exceeds 5MB limit. Please clear some strokes.".into(),
        ));
    }

    conn.execute(
        "INSERT INTO doodles (book_id, page_number, strokes_json)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(book_id, page_number)
         DO UPDATE SET strokes_json = excluded.strokes_json,
                       updated_at = CURRENT_TIMESTAMP",
        rusqlite::params![book_id, page_number, strokes_json],
    )?;

    // Return the saved doodle
    let doodle = conn.query_row(
        "SELECT id, book_id, page_number, strokes_json, created_at, updated_at
         FROM doodles WHERE book_id = ?1 AND page_number = ?2",
        rusqlite::params![book_id, page_number],
        |row| {
            Ok(Doodle {
                id: Some(row.get(0)?),
                book_id: row.get(1)?,
                page_number: row.get(2)?,
                strokes_json: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )?;

    Ok(doodle)
}

/// Get doodle strokes for a specific book page.
#[tauri::command]
pub fn get_doodle(
    book_id: i64,
    page_number: String,
    state: State<AppState>,
) -> Result<Option<Doodle>> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty(&page_number, "page_number")?;
    let conn = state.db.get_connection()?;

    let result = conn.query_row(
        "SELECT id, book_id, page_number, strokes_json, created_at, updated_at
         FROM doodles WHERE book_id = ?1 AND page_number = ?2",
        rusqlite::params![book_id, page_number],
        |row| {
            Ok(Doodle {
                id: Some(row.get(0)?),
                book_id: row.get(1)?,
                page_number: row.get(2)?,
                strokes_json: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    );

    match result {
        Ok(doodle) => Ok(Some(doodle)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Delete doodle for a specific book page.
#[tauri::command]
pub fn delete_doodle(book_id: i64, page_number: String, state: State<AppState>) -> Result<()> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty(&page_number, "page_number")?;
    let conn = state.db.get_connection()?;

    conn.execute(
        "DELETE FROM doodles WHERE book_id = ?1 AND page_number = ?2",
        rusqlite::params![book_id, page_number],
    )?;

    Ok(())
}

/// Delete all doodles for a book.
#[tauri::command]
pub fn delete_book_doodles(book_id: i64, state: State<AppState>) -> Result<i64> {
    validate::require_positive_id(book_id, "book_id")?;
    let conn = state.db.get_connection()?;

    let deleted = conn.execute(
        "DELETE FROM doodles WHERE book_id = ?1",
        rusqlite::params![book_id],
    )?;

    Ok(deleted as i64)
}
