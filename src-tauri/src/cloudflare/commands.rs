/// Tauri commands for the Cloudflare session management system.
///
/// Exposed to the frontend so the UI can:
///  - Show CF session status (valid / expired / absent).
///  - Manually trigger a solve (open the browser and solve the challenge).
///  - Clear / invalidate sessions.
///  - Proxy manga images (with CF cookies injected).
use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::cloudflare::{
    browser::{solve, BrowserConfig},
    client::CfClient,
    session::SessionStore,
};
use crate::error::{Result, ShioriError};

// ─── App state ────────────────────────────────────────────────────────────────

/// Managed state registered in `main.rs`.
pub struct CloudflareState {
    pub store: Arc<SessionStore>,
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CfSessionStatus {
    pub host: String,
    pub has_session: bool,
    pub has_clearance: bool,
    pub is_expired: bool,
    pub captured_at: Option<String>,
    pub user_agent: Option<String>,
    pub cookie_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveResult {
    pub success: bool,
    pub host: String,
    pub cookie_count: usize,
    pub user_agent: String,
    pub message: String,
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/// Return the session status for a given URL / host.
#[tauri::command]
pub async fn cf_session_status(
    cf_state: State<'_, CloudflareState>,
    url: String,
) -> Result<CfSessionStatus> {
    let host = host_from_url(&url);
    let session = cf_state.store.get(&host);

    Ok(match session {
        Some(sess) => CfSessionStatus {
            host: host.clone(),
            has_session: true,
            has_clearance: sess.has_valid_clearance(),
            is_expired: sess.is_expired(),
            captured_at: Some(sess.captured_at.to_rfc3339()),
            user_agent: Some(sess.user_agent.clone()),
            cookie_count: sess.cookies.len(),
        },
        None => CfSessionStatus {
            host,
            has_session: false,
            has_clearance: false,
            is_expired: false,
            captured_at: None,
            user_agent: None,
            cookie_count: 0,
        },
    })
}

/// Launch the Playwright browser to solve the CF challenge for `url`.
/// This can open a visible browser window if headless fails.
#[tauri::command]
pub async fn cf_solve(
    app: tauri::AppHandle,
    cf_state: State<'_, CloudflareState>,
    url: String,
    headless_only: Option<bool>,
) -> Result<SolveResult> {
    let host = host_from_url(&url);

    let mut cfg = BrowserConfig::default();
    if headless_only == Some(true) {
        cfg.try_headless_first = true;
        // We'll make visible fallback disabled by signalling through a flag.
        // The browser module already handles this gracefully.
    }

    let session = solve(&url, &host, &cfg, Some(&app))
        .await
        .map_err(|e| ShioriError::Other(format!("CF solve failed: {e}")))?;

    let cookie_count = session.cookies.len();
    let user_agent = session.user_agent.clone();

    cf_state.store.save(session)?;

    Ok(SolveResult {
        success: true,
        host,
        cookie_count,
        user_agent,
        message: "Cloudflare challenge solved successfully.".to_string(),
    })
}

/// Invalidate the stored session for a host (forces re-solve on next request).
#[tauri::command]
pub async fn cf_invalidate_session(
    cf_state: State<'_, CloudflareState>,
    url: String,
) -> Result<String> {
    let host = host_from_url(&url);
    cf_state.store.invalidate(&host);
    Ok(format!("Session for {host} invalidated."))
}

/// Clear ALL stored CF sessions.
#[tauri::command]
pub async fn cf_clear_all_sessions(cf_state: State<'_, CloudflareState>) -> Result<String> {
    cf_state.store.clear_all()?;
    Ok("All Cloudflare sessions cleared.".to_string())
}

/// List all hosts with a stored session.
#[tauri::command]
pub async fn cf_list_sessions(
    cf_state: State<'_, CloudflareState>,
) -> Result<Vec<CfSessionStatus>> {
    let hosts = cf_state.store.list_hosts();
    let mut statuses = Vec::new();
    for host in hosts {
        let _fake_url = format!("https://{host}");
        let session = cf_state.store.get(&host);
        let status = match session {
            Some(sess) => CfSessionStatus {
                host: host.clone(),
                has_session: true,
                has_clearance: sess.has_valid_clearance(),
                is_expired: sess.is_expired(),
                captured_at: Some(sess.captured_at.to_rfc3339()),
                user_agent: Some(sess.user_agent.clone()),
                cookie_count: sess.cookies.len(),
            },
            None => CfSessionStatus {
                host,
                has_session: false,
                has_clearance: false,
                is_expired: false,
                captured_at: None,
                user_agent: None,
                cookie_count: 0,
            },
        };
        statuses.push(status);
    }
    Ok(statuses)
}

/// Proxy a manga image URL through CF-authenticated reqwest.
/// Used so the frontend can display images from CF-protected sources.
#[tauri::command]
pub async fn cf_proxy_image(
    app: tauri::AppHandle,
    cf_state: State<'_, CloudflareState>,
    image_url: String,
    source_base_url: String,
) -> Result<Vec<u8>> {
    let client = CfClient::new(&source_base_url, cf_state.store.inner_arc())?.with_app_handle(app);
    client.get_image(&image_url).await
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn host_from_url(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_else(|| url.to_string())
}
