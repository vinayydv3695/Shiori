use crate::services::cartography_service::{BookMap, BookMapPin, CartographyService};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_book_maps(state: State<'_, AppState>, book_id: i64) -> Result<Vec<BookMap>, String> {
    let conn = state.db.get_connection().map_err(|e| e.to_string())?;
    CartographyService::get_book_maps(&conn, book_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_book_map(
    state: State<'_, AppState>,
    book_id: i64,
    title: String,
    image_url: String,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<BookMap, String> {
    let conn = state.db.get_connection().map_err(|e| e.to_string())?;
    CartographyService::add_book_map(&conn, book_id, &title, &image_url, width, height, false)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_book_map(state: State<'_, AppState>, map_id: i64) -> Result<(), String> {
    let conn = state.db.get_connection().map_err(|e| e.to_string())?;
    CartographyService::delete_book_map(&conn, map_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_map_pins(state: State<'_, AppState>, map_id: i64) -> Result<Vec<BookMapPin>, String> {
    let conn = state.db.get_connection().map_err(|e| e.to_string())?;
    CartographyService::get_map_pins(&conn, map_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_map_pin(
    state: State<'_, AppState>,
    pin_id: Option<i64>,
    map_id: i64,
    book_id: i64,
    label: String,
    notes: Option<String>,
    chapter_index: Option<i32>,
    x_percent: f64,
    y_percent: f64,
    color: Option<String>,
) -> Result<BookMapPin, String> {
    let conn = state.db.get_connection().map_err(|e| e.to_string())?;
    CartographyService::save_map_pin(
        &conn,
        pin_id,
        map_id,
        book_id,
        &label,
        notes.as_deref(),
        chapter_index,
        x_percent,
        y_percent,
        color.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_map_pin(state: State<'_, AppState>, pin_id: i64) -> Result<(), String> {
    let conn = state.db.get_connection().map_err(|e| e.to_string())?;
    CartographyService::delete_map_pin(&conn, pin_id).map_err(|e| e.to_string())
}
