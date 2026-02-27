use crate::services::search_service;
use crate::{
    error::Result,
    models::{SearchQuery, SearchResult},
    AppState,
};
use tauri::State;

#[tauri::command]
pub fn search_books(state: State<AppState>, query: SearchQuery) -> Result<SearchResult> {
    let db = &state.db;
    search_service::search(db, query)
}
