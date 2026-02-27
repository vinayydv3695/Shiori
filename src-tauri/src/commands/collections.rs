use crate::error::Result;
use crate::models::{Book, Collection};
use crate::services::collection_service::CollectionService;
use crate::utils::validate;
use crate::AppState;
use tauri::State;

// ==================== Collection CRUD Commands ====================

#[tauri::command]
pub fn get_collections(state: State<AppState>) -> Result<Vec<Collection>> {
    let conn = state.db.get_connection()?;
    CollectionService::get_collections(&conn)
}

#[tauri::command]
pub fn get_collection(id: i64, state: State<AppState>) -> Result<Collection> {
    validate::require_positive_id(id, "id")?;
    let conn = state.db.get_connection()?;
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
) -> Result<Collection> {
    validate::require_non_empty(&name, "name")?;
    validate::require_max_length(&name, 500, "name")?;
    if let Some(ref desc) = description {
        validate::require_max_length(desc, 2000, "description")?;
    }
    if let Some(pid) = parent_id {
        validate::require_positive_id(pid, "parent_id")?;
    }
    let conn = state.db.get_connection()?;
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
) -> Result<()> {
    validate::require_positive_id(id, "id")?;
    validate::require_non_empty(&name, "name")?;
    validate::require_max_length(&name, 500, "name")?;
    if let Some(ref desc) = description {
        validate::require_max_length(desc, 2000, "description")?;
    }
    if let Some(pid) = parent_id {
        validate::require_positive_id(pid, "parent_id")?;
    }
    let conn = state.db.get_connection()?;
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
pub fn delete_collection(id: i64, state: State<AppState>) -> Result<()> {
    validate::require_positive_id(id, "id")?;
    let conn = state.db.get_connection()?;
    CollectionService::delete_collection(&conn, id)
}

// ==================== Book Management Commands ====================

#[tauri::command]
pub fn add_book_to_collection(
    collection_id: i64,
    book_id: i64,
    state: State<AppState>,
) -> Result<()> {
    validate::require_positive_id(collection_id, "collection_id")?;
    validate::require_positive_id(book_id, "book_id")?;
    let conn = state.db.get_connection()?;
    CollectionService::add_book_to_collection(&conn, collection_id, book_id)
}

#[tauri::command]
pub fn remove_book_from_collection(
    collection_id: i64,
    book_id: i64,
    state: State<AppState>,
) -> Result<()> {
    validate::require_positive_id(collection_id, "collection_id")?;
    validate::require_positive_id(book_id, "book_id")?;
    let conn = state.db.get_connection()?;
    CollectionService::remove_book_from_collection(&conn, collection_id, book_id)
}

#[tauri::command]
pub fn add_books_to_collection(
    collection_id: i64,
    book_ids: Vec<i64>,
    state: State<AppState>,
) -> Result<()> {
    validate::require_positive_id(collection_id, "collection_id")?;
    validate::require_non_empty_vec(&book_ids, "book_ids")?;
    let conn = state.db.get_connection()?;
    CollectionService::add_books_to_collection(&conn, collection_id, book_ids)
}

#[tauri::command]
pub fn get_collection_books(collection_id: i64, state: State<AppState>) -> Result<Vec<Book>> {
    validate::require_positive_id(collection_id, "collection_id")?;
    let conn = state.db.get_connection()?;
    CollectionService::get_collection_books(&conn, collection_id)
}

#[tauri::command]
pub fn get_nested_collections(state: State<AppState>) -> Result<Vec<Collection>> {
    let conn = state.db.get_connection()?;
    CollectionService::get_nested_collections(&conn)
}
