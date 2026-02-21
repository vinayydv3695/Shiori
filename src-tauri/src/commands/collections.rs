use crate::error::ShioriResult;
use crate::models::{Book, Collection};
use crate::services::collection_service::CollectionService;
use crate::AppState;
use tauri::State;

// ==================== Collection CRUD Commands ====================

#[tauri::command]
pub fn get_collections(state: State<AppState>) -> ShioriResult<Vec<Collection>> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    CollectionService::get_collections(&conn)
}

#[tauri::command]
pub fn get_collection(id: i64, state: State<AppState>) -> ShioriResult<Collection> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    CollectionService::get_collection(&conn, id)
}

#[tauri::command]
pub fn create_collection(
    name: String,
    description: Option<String>,
    parent_id: Option<i64>,
    is_smart: bool,
    smart_rules: Option<String>,
    icon: Option<String>,
    color: Option<String>,
    state: State<AppState>,
) -> ShioriResult<Collection> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    CollectionService::create_collection(
        &conn,
        &name,
        description.as_deref(),
        parent_id,
        is_smart,
        smart_rules.as_deref(),
        icon.as_deref(),
        color.as_deref(),
    )
}

#[tauri::command]
pub fn update_collection(
    id: i64,
    name: String,
    description: Option<String>,
    parent_id: Option<i64>,
    smart_rules: Option<String>,
    icon: Option<String>,
    color: Option<String>,
    state: State<AppState>,
) -> ShioriResult<()> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    CollectionService::update_collection(
        &conn,
        id,
        &name,
        description.as_deref(),
        parent_id,
        smart_rules.as_deref(),
        icon.as_deref(),
        color.as_deref(),
    )
}

#[tauri::command]
pub fn delete_collection(id: i64, state: State<AppState>) -> ShioriResult<()> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    CollectionService::delete_collection(&conn, id)
}

// ==================== Book Management Commands ====================

#[tauri::command]
pub fn add_book_to_collection(
    collection_id: i64,
    book_id: i64,
    state: State<AppState>,
) -> ShioriResult<()> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    CollectionService::add_book_to_collection(&conn, collection_id, book_id)
}

#[tauri::command]
pub fn remove_book_from_collection(
    collection_id: i64,
    book_id: i64,
    state: State<AppState>,
) -> ShioriResult<()> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    CollectionService::remove_book_from_collection(&conn, collection_id, book_id)
}

#[tauri::command]
pub fn add_books_to_collection(
    collection_id: i64,
    book_ids: Vec<i64>,
    state: State<AppState>,
) -> ShioriResult<()> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    CollectionService::add_books_to_collection(&conn, collection_id, book_ids)
}

#[tauri::command]
pub fn get_collection_books(collection_id: i64, state: State<AppState>) -> ShioriResult<Vec<Book>> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    CollectionService::get_collection_books(&conn, collection_id)
}

#[tauri::command]
pub fn get_nested_collections(state: State<AppState>) -> ShioriResult<Vec<Collection>> {
    let db = state.db.lock().unwrap();
    let conn = db.get_connection()?;
    CollectionService::get_nested_collections(&conn)
}
