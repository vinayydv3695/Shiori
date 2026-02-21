use crate::error::ShioriResult;
use crate::models::{Annotation, ReaderSettings, ReadingProgress};
use crate::services::format_detector;
use crate::services::reader_service::ReaderService;
use crate::AppState;
use std::path::Path;
use tauri::State;

// ==================== Reading Progress Commands ====================

#[tauri::command]
pub fn get_reading_progress(
    book_id: i64,
    state: State<AppState>,
) -> ShioriResult<Option<ReadingProgress>> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    ReaderService::get_reading_progress(&conn, book_id)
}

#[tauri::command]
pub fn save_reading_progress(
    book_id: i64,
    current_location: String,
    progress_percent: f64,
    current_page: Option<i32>,
    total_pages: Option<i32>,
    state: State<AppState>,
) -> ShioriResult<ReadingProgress> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    ReaderService::save_reading_progress(
        &conn,
        book_id,
        &current_location,
        progress_percent,
        current_page,
        total_pages,
    )
}

// ==================== Annotation Commands ====================

#[tauri::command]
pub fn get_annotations(book_id: i64, state: State<AppState>) -> ShioriResult<Vec<Annotation>> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    ReaderService::get_annotations(&conn, book_id)
}

#[tauri::command]
pub fn create_annotation(
    book_id: i64,
    annotation_type: String,
    location: String,
    cfi_range: Option<String>,
    selected_text: Option<String>,
    note_content: Option<String>,
    color: String,
    state: State<AppState>,
) -> ShioriResult<Annotation> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    ReaderService::create_annotation(
        &conn,
        book_id,
        &annotation_type,
        &location,
        cfi_range.as_deref(),
        selected_text.as_deref(),
        note_content.as_deref(),
        &color,
    )
}

#[tauri::command]
pub fn update_annotation(
    id: i64,
    note_content: Option<String>,
    color: Option<String>,
    state: State<AppState>,
) -> ShioriResult<()> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    ReaderService::update_annotation(&conn, id, note_content.as_deref(), color.as_deref())
}

#[tauri::command]
pub fn delete_annotation(id: i64, state: State<AppState>) -> ShioriResult<()> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    ReaderService::delete_annotation(&conn, id)
}

// ==================== Reader Settings Commands ====================

#[tauri::command]
pub fn get_reader_settings(
    user_id: String,
    state: State<AppState>,
) -> ShioriResult<ReaderSettings> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    ReaderService::get_reader_settings(&conn, &user_id)
}

#[tauri::command]
pub fn save_reader_settings(
    user_id: String,
    font_family: String,
    font_size: i32,
    line_height: f64,
    theme: String,
    page_mode: String,
    margin_size: i32,
    state: State<AppState>,
) -> ShioriResult<ReaderSettings> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    ReaderService::save_reader_settings(
        &conn,
        &user_id,
        &font_family,
        font_size,
        line_height,
        &theme,
        &page_mode,
        margin_size,
    )
}

// ==================== Book Access Command ====================

#[tauri::command]
pub fn get_book_file_path(book_id: i64, state: State<AppState>) -> ShioriResult<String> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    let file_path: String = conn.query_row(
        "SELECT file_path FROM books WHERE id = ?1",
        rusqlite::params![book_id],
        |row| row.get::<_, String>(0),
    )?;
    Ok(file_path)
}

// ==================== Format Detection Commands ====================

#[tauri::command]
pub async fn detect_book_format(path: String) -> ShioriResult<String> {
    format_detector::detect_format(Path::new(&path)).await
}

#[tauri::command]
pub async fn validate_book_file(path: String, format: String) -> ShioriResult<bool> {
    format_detector::validate_file_integrity(Path::new(&path), &format).await
}

// ==================== Error Information Commands ====================

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct ErrorDetails {
    pub user_message: String,
    pub recovery_suggestions: Vec<String>,
    pub technical_details: String,
}

#[tauri::command]
pub fn get_error_details(error_message: String) -> ErrorDetails {
    // This is a helper for frontend to get structured error info
    // In practice, errors should already include this info
    ErrorDetails {
        user_message: error_message.clone(),
        recovery_suggestions: vec![
            "Try restarting the application".to_string(),
            "Check file permissions".to_string(),
        ],
        technical_details: error_message,
    }
}

