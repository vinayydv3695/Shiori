use crate::services::tag_service;
use crate::{error::Result, models::Tag, AppState};
use tauri::State;

#[tauri::command]
pub fn get_tags(state: State<AppState>) -> Result<Vec<Tag>> {
    let db = state.db.lock().unwrap();
    tag_service::get_all_tags(&db)
}

#[tauri::command]
pub fn create_tag(state: State<AppState>, name: String, color: Option<String>) -> Result<i64> {
    let db = state.db.lock().unwrap();
    tag_service::create_tag(&db, name, color)
}

#[tauri::command]
pub fn add_tag_to_book(state: State<AppState>, book_id: i64, tag_id: i64) -> Result<()> {
    let db = state.db.lock().unwrap();
    tag_service::add_tag_to_book(&db, book_id, tag_id)
}

#[tauri::command]
pub fn remove_tag_from_book(state: State<AppState>, book_id: i64, tag_id: i64) -> Result<()> {
    let db = state.db.lock().unwrap();
    tag_service::remove_tag_from_book(&db, book_id, tag_id)
}
