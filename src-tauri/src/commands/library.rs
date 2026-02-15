use tauri::State;
use crate::{AppState, error::Result, models::{Book, Author, Tag, ImportResult}};
use crate::services::library_service;
use rusqlite::params;

#[tauri::command]
pub fn get_books(state: State<AppState>) -> Result<Vec<Book>> {
    let db = state.db.lock().unwrap();
    library_service::get_all_books(&db)
}

#[tauri::command]
pub fn get_book(state: State<AppState>, id: i64) -> Result<Book> {
    let db = state.db.lock().unwrap();
    library_service::get_book_by_id(&db, id)
}

#[tauri::command]
pub fn add_book(state: State<AppState>, book: Book) -> Result<i64> {
    let db = state.db.lock().unwrap();
    library_service::add_book(&db, book)
}

#[tauri::command]
pub fn update_book(state: State<AppState>, book: Book) -> Result<()> {
    let db = state.db.lock().unwrap();
    library_service::update_book(&db, book)
}

#[tauri::command]
pub fn delete_book(state: State<AppState>, id: i64) -> Result<()> {
    let db = state.db.lock().unwrap();
    library_service::delete_book(&db, id)
}

#[tauri::command]
pub async fn import_books(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<ImportResult> {
    let db = state.db.lock().unwrap();
    library_service::import_books(&db, paths).await
}
