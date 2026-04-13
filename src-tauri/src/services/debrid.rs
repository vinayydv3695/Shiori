use serde::{Deserialize, Serialize};

use crate::commands::torbox::torbox_download_and_import_impl;
use crate::error::{Result, ShioriError};
use crate::services::torbox::TorboxService;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebridResolveRequest {
    pub provider: String,
    pub candidate_links: Vec<String>,
    pub filename_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebridResolveResponse {
    pub provider: String,
    pub selected_link: String,
    pub imported_path: String,
}

pub async fn resolve_and_import(
    app_handle: &tauri::AppHandle,
    torbox_service: &TorboxService,
    app_state: &crate::AppState,
    req: DebridResolveRequest,
) -> Result<DebridResolveResponse> {
    let provider = req.provider.trim().to_ascii_lowercase();
    let provider = if provider == "auto" || provider.is_empty() {
        "torbox".to_string()
    } else if provider == "torbox" {
        "torbox".to_string()
    } else {
        return Err(ShioriError::Validation(format!(
            "Unsupported debrid provider: {}",
            req.provider
        )));
    };

    let selected = req
        .candidate_links
        .into_iter()
        .map(|v| v.trim().to_string())
        .find(|v| !v.is_empty())
        .ok_or_else(|| ShioriError::Validation("No candidate links provided".to_string()))?;

    let imported_path = torbox_download_and_import_impl(
        app_handle,
        torbox_service,
        app_state,
        selected.clone(),
        req.filename_hint,
    )
    .await?;

    Ok(DebridResolveResponse {
        provider,
        selected_link: selected,
        imported_path,
    })
}
