use crate::services::search_service;
use crate::{
    error::Result,
    models::{SearchQuery, SearchResult},
    AppState,
};
use tauri::State;

#[tauri::command]
pub async fn search_books(
    state: State<'_, AppState>,
    query: SearchQuery,
) -> Result<SearchResult> {
    // COUNT + join + hydration, fired per keystroke — offload so a slow query
    // never stalls the async runtime (and thus the UI).
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || search_service::search(&db, query))
        .await
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?
}
