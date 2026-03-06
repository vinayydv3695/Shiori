use crate::error::Result;
use crate::models::{
    Annotation, AnnotationCategory, AnnotationExportData, AnnotationExportOptions,
    AnnotationSearchResult, BookReadingStats, DailyReadingStats, ReaderSettings, ReadingGoal,
    ReadingProgress, ReadingSession, ReadingStreak,
};
use crate::services::format_detector;
use crate::services::reader_service::ReaderService;
use crate::utils::validate;
use crate::AppState;
use std::path::Path;
use tauri::State;

// ==================== Reading Progress Commands ====================

#[tauri::command]
pub fn get_reading_progress(
    book_id: i64,
    state: State<AppState>,
) -> Result<Option<ReadingProgress>> {
    validate::require_positive_id(book_id, "book_id")?;
    let conn = state.db.get_connection()?;
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
) -> Result<ReadingProgress> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty(&current_location, "current_location")?;
    let conn = state.db.get_connection()?;
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
pub fn get_annotations(book_id: i64, state: State<AppState>) -> Result<Vec<Annotation>> {
    validate::require_positive_id(book_id, "book_id")?;
    let conn = state.db.get_connection()?;
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
    category_id: Option<i64>,
    chapter_title: Option<String>,
    state: State<AppState>,
) -> Result<Annotation> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty(&annotation_type, "annotation_type")?;
    validate::require_non_empty(&location, "location")?;
    validate::require_non_empty(&color, "color")?;
    validate::require_max_length(&color, 50, "color")?;
    let conn = state.db.get_connection()?;
    ReaderService::create_annotation(
        &conn,
        book_id,
        &annotation_type,
        &location,
        cfi_range.as_deref(),
        selected_text.as_deref(),
        note_content.as_deref(),
        &color,
        category_id,
        chapter_title.as_deref(),
    )
}

#[tauri::command]
pub fn update_annotation(
    id: i64,
    note_content: Option<String>,
    color: Option<String>,
    category_id: Option<i64>,
    state: State<AppState>,
) -> Result<()> {
    validate::require_positive_id(id, "id")?;
    if let Some(ref c) = color {
        validate::require_max_length(c, 50, "color")?;
    }
    let conn = state.db.get_connection()?;
    ReaderService::update_annotation(&conn, id, note_content.as_deref(), color.as_deref(), category_id)
}

#[tauri::command]
pub fn delete_annotation(id: i64, state: State<AppState>) -> Result<()> {
    validate::require_positive_id(id, "id")?;
    let conn = state.db.get_connection()?;
    ReaderService::delete_annotation(&conn, id)
}

#[tauri::command]
pub fn get_annotation_categories(state: State<AppState>) -> Result<Vec<AnnotationCategory>> {
    let conn = state.db.get_connection()?;
    ReaderService::get_annotation_categories(&conn)
}

#[tauri::command]
pub fn create_annotation_category(
    name: String,
    color: String,
    icon: Option<String>,
    state: State<AppState>,
) -> Result<AnnotationCategory> {
    validate::require_non_empty(&name, "name")?;
    validate::require_non_empty(&color, "color")?;
    let conn = state.db.get_connection()?;
    ReaderService::create_annotation_category(&conn, &name, &color, icon.as_deref())
}

#[tauri::command]
pub fn update_annotation_category(
    id: i64,
    name: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    state: State<AppState>,
) -> Result<()> {
    validate::require_positive_id(id, "id")?;
    let conn = state.db.get_connection()?;
    ReaderService::update_annotation_category(
        &conn,
        id,
        name.as_deref(),
        color.as_deref(),
        icon.as_deref(),
    )
}

#[tauri::command]
pub fn delete_annotation_category(id: i64, state: State<AppState>) -> Result<()> {
    validate::require_positive_id(id, "id")?;
    let conn = state.db.get_connection()?;
    ReaderService::delete_annotation_category(&conn, id)
}

#[tauri::command]
pub fn search_annotations_global(
    query: String,
    book_id: Option<i64>,
    annotation_type: Option<String>,
    category_id: Option<i64>,
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<AnnotationSearchResult>> {
    validate::require_non_empty(&query, "query")?;
    let conn = state.db.get_connection()?;
    ReaderService::search_annotations_global(
        &conn,
        &query,
        book_id,
        annotation_type.as_deref(),
        category_id,
        limit.unwrap_or(50),
        offset.unwrap_or(0),
    )
}

#[tauri::command]
pub fn get_all_annotations(
    book_id: Option<i64>,
    annotation_type: Option<String>,
    category_id: Option<i64>,
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<AnnotationSearchResult>> {
    let conn = state.db.get_connection()?;
    ReaderService::get_all_annotations(
        &conn,
        book_id,
        annotation_type.as_deref(),
        category_id,
        limit.unwrap_or(50),
        offset.unwrap_or(0),
    )
}

#[tauri::command]
pub fn export_annotations(
    options: AnnotationExportOptions,
    state: State<AppState>,
) -> Result<AnnotationExportData> {
    let conn = state.db.get_connection()?;
    ReaderService::export_annotations(&conn, &options)
}

// ==================== Reader Settings Commands ====================

#[tauri::command]
pub fn get_reader_settings(
    user_id: String,
    state: State<AppState>,
) -> Result<ReaderSettings> {
    validate::require_non_empty(&user_id, "user_id")?;
    let conn = state.db.get_connection()?;
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
) -> Result<ReaderSettings> {
    validate::require_non_empty(&user_id, "user_id")?;
    validate::require_non_empty(&font_family, "font_family")?;
    validate::require_non_empty(&theme, "theme")?;
    validate::require_non_empty(&page_mode, "page_mode")?;
    let conn = state.db.get_connection()?;
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
pub fn get_book_file_path(book_id: i64, state: State<AppState>) -> Result<String> {
    validate::require_positive_id(book_id, "book_id")?;
    let conn = state.db.get_connection()?;
    let file_path: String = conn.query_row(
        "SELECT file_path FROM books WHERE id = ?1",
        rusqlite::params![book_id],
        |row| row.get::<_, String>(0),
    )?;
    Ok(file_path)
}

// ==================== Format Detection Commands ====================

#[tauri::command]
pub async fn detect_book_format(path: String) -> Result<String> {
    validate::require_safe_path(&path, "path")?;
    format_detector::detect_format(Path::new(&path)).await
}

#[tauri::command]
pub async fn validate_book_file(path: String, format: String) -> Result<bool> {
    validate::require_safe_path(&path, "path")?;
    validate::require_non_empty(&format, "format")?;
    format_detector::validate_file_integrity(Path::new(&path), &format).await
}

// ==================== Reading Session & Statistics Commands ====================

#[tauri::command]
pub fn start_reading_session(
    book_id: i64,
    pages_start: Option<i32>,
    state: State<AppState>,
) -> Result<ReadingSession> {
    validate::require_positive_id(book_id, "book_id")?;
    let conn = state.db.get_connection()?;
    ReaderService::start_reading_session(&conn, book_id, pages_start)
}

#[tauri::command]
pub fn end_reading_session(
    session_id: String,
    pages_end: Option<i32>,
    state: State<AppState>,
) -> Result<()> {
    validate::require_non_empty(&session_id, "session_id")?;
    let conn = state.db.get_connection()?;
    ReaderService::end_reading_session(&conn, &session_id, pages_end)
}

#[tauri::command]
pub fn heartbeat_reading_session(
    session_id: String,
    duration_seconds: i64,
    state: State<AppState>,
) -> Result<()> {
    validate::require_non_empty(&session_id, "session_id")?;
    let conn = state.db.get_connection()?;
    ReaderService::heartbeat_reading_session(&conn, &session_id, duration_seconds)
}

#[tauri::command]
pub fn get_daily_reading_stats(
    days: Option<i32>,
    state: State<AppState>,
) -> Result<Vec<DailyReadingStats>> {
    let conn = state.db.get_connection()?;
    ReaderService::get_daily_reading_stats(&conn, days.unwrap_or(30))
}

#[tauri::command]
pub fn get_book_reading_stats(
    book_id: i64,
    state: State<AppState>,
) -> Result<BookReadingStats> {
    validate::require_positive_id(book_id, "book_id")?;
    let conn = state.db.get_connection()?;
    ReaderService::get_book_reading_stats(&conn, book_id)
}

#[tauri::command]
pub fn get_reading_streak(state: State<AppState>) -> Result<ReadingStreak> {
    let conn = state.db.get_connection()?;
    ReaderService::get_reading_streak(&conn)
}

#[tauri::command]
pub fn get_reading_goal(state: State<AppState>) -> Result<ReadingGoal> {
    let conn = state.db.get_connection()?;
    ReaderService::get_reading_goal(&conn)
}

#[tauri::command]
pub fn update_reading_goal(
    daily_minutes_target: i32,
    state: State<AppState>,
) -> Result<ReadingGoal> {
    let conn = state.db.get_connection()?;
    ReaderService::update_reading_goal(&conn, daily_minutes_target)
}

#[tauri::command]
pub fn get_today_reading_time(state: State<AppState>) -> Result<i64> {
    let conn = state.db.get_connection()?;
    ReaderService::get_today_reading_time(&conn)
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

