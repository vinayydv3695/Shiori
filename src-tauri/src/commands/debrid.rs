use tauri::State;

use crate::commands::torbox::TorboxState;
use crate::error::Result;
use crate::services::debrid::{DebridResolveRequest, DebridResolveResponse};

#[tauri::command]
pub async fn debrid_resolve_and_import(
    app_handle: tauri::AppHandle,
    torbox_state: State<'_, TorboxState>,
    app_state: State<'_, crate::AppState>,
    provider: String,
    candidate_links: Vec<String>,
    filename_hint: Option<String>,
) -> Result<DebridResolveResponse> {
    crate::services::debrid::resolve_and_import(
        &app_handle,
        &torbox_state.service,
        &app_state,
        DebridResolveRequest {
            provider,
            candidate_links,
            filename_hint,
        },
    )
    .await
}
