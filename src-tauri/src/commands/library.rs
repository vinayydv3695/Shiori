use crate::services::library_service;
use crate::{
    error::Result,
    models::{Book, ImportResult},
    AppState,
};
use tauri::State;

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
pub fn import_books(state: State<'_, AppState>, paths: Vec<String>) -> Result<ImportResult> {
    let db = state.db.lock().unwrap();
    library_service::import_books(&db, paths)
}

#[tauri::command]
pub fn scan_folder_for_books(
    state: State<'_, AppState>,
    folder_path: String,
) -> Result<ImportResult> {
    let db = state.db.lock().unwrap();
    library_service::scan_and_import_folder(&db, &folder_path)
}
