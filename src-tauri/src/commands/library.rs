use crate::services::library_service;
use crate::{
    error::Result,
    models::{Book, ImportResult},
    AppState,
};
use tauri::State;

#[tauri::command]
pub fn get_books(state: State<AppState>, limit: u32, offset: u32) -> Result<Vec<Book>> {
    let db = state.db.lock().unwrap();
    library_service::get_all_books(&db, limit, offset)
}

#[tauri::command]
pub fn get_total_books(state: State<AppState>) -> Result<i64> {
    let db = state.db.lock().unwrap();
    library_service::get_total_books(&db)
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
pub fn delete_books(state: State<AppState>, ids: Vec<i64>) -> Result<()> {
    log::info!(
        "[command::delete_books] Received request to delete {} books: {:?}",
        ids.len(),
        ids
    );
    let mut db = state.db.lock().unwrap();
    let ids_clone = ids.clone();
    let result = library_service::delete_books(&mut db, ids);
    match &result {
        Ok(_) => log::info!(
            "[command::delete_books] Successfully deleted {} books",
            ids_clone.len()
        ),
        Err(e) => log::error!("[command::delete_books] Failed to delete books: {:?}", e),
    }
    result
}

#[tauri::command]
pub fn delete_book(state: State<AppState>, id: i64) -> Result<()> {
    log::info!(
        "[command::delete_book] Received request to delete book id: {}",
        id
    );
    let db = state.db.lock().unwrap();
    let result = library_service::delete_book(&db, id);
    match &result {
        Ok(_) => log::info!(
            "[command::delete_book] Successfully deleted book id: {}",
            id
        ),
        Err(e) => log::error!(
            "[command::delete_book] Failed to delete book id {}: {:?}",
            id,
            e
        ),
    }
    result
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

#[tauri::command]
pub fn import_manga(state: State<'_, AppState>, paths: Vec<String>) -> Result<ImportResult> {
    let db = state.db.lock().unwrap();
    library_service::import_manga(&db, paths)
}

#[tauri::command]
pub fn scan_folder_for_manga(
    state: State<'_, AppState>,
    folder_path: String,
) -> Result<ImportResult> {
    let db = state.db.lock().unwrap();
    library_service::scan_folder_for_manga(&db, &folder_path)
}

#[tauri::command]
pub fn get_books_by_domain(state: State<'_, AppState>, domain: String, limit: u32, offset: u32) -> Result<Vec<Book>> {
    let db = state.db.lock().unwrap();
    library_service::get_books_by_domain(&db, &domain, limit, offset)
}

#[tauri::command]
pub fn get_total_books_by_domain(state: State<'_, AppState>, domain: String) -> Result<i64> {
    let db = state.db.lock().unwrap();
    library_service::get_total_books_by_domain(&db, &domain)
}

#[tauri::command]
pub fn reset_database(state: State<'_, AppState>) -> Result<()> {
    let db = state.db.lock().unwrap();
    library_service::reset_database(&db)
}
