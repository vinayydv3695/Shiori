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

/// Result of the network diagnostics probe for Cloudflare Turnstile.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDiagnostics {
    pub has_global_ipv6: bool,
    pub attestation_reachable: bool,
    pub suggestions: Vec<String>,
}

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
/// User-initiated (Settings → Verify): opens a VISIBLE browser with no
/// automation — the user completes any verification themselves.
#[tauri::command]
pub async fn cf_solve(
    app: tauri::AppHandle,
    cf_state: State<'_, CloudflareState>,
    url: String,
    _headless_only: Option<bool>, // kept for frontend compat; no headless mode exists
) -> Result<SolveResult> {
    let host = host_from_url(&url);

    let cfg = BrowserConfig::default();

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

/// Diagnose why Cloudflare verification may be failing on this machine:
/// reports whether a global IPv6 address exists and whether Cloudflare's
/// Turnstile attestation host is reachable, plus ordered fix suggestions.
/// Pure diagnostics — never bypasses or automates verification.
#[tauri::command]
pub async fn network_ipv6_diagnostics() -> NetworkDiagnostics {
    let has_ipv6 = crate::sources::source_error::has_global_ipv6();

    // `brunhild.challenges.cloudflare.com` is AAAA-only; without global IPv6
    // there is no route at all, so skip the probe.
    let attestation_reachable = if !has_ipv6 {
        false
    } else {
        match tokio::time::timeout(
            std::time::Duration::from_secs(5),
            tokio::net::TcpStream::connect("[2606:4700::6812:1092]:443"),
        )
        .await
        {
            Ok(Ok(_)) => true,
            _ => false,
        }
    };

    NetworkDiagnostics {
        has_global_ipv6: has_ipv6,
        attestation_reachable,
        suggestions: build_suggestions(has_ipv6, attestation_reachable),
    }
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
    // SSRF guard: the image host must equal the source host (or be a subdomain
    // of it) and the URL must pass the safe-URL checks. This also guarantees
    // session cookies are never attached to a foreign host.
    let image_host = host_from_url(&image_url);
    let base_host = host_from_url(&source_base_url);
    if !crate::cloudflare::client::host_matches(&image_host, &base_host) {
        return Err(ShioriError::Other(format!(
            "Image host {} is not {} or a subdomain of it",
            image_host, base_host
        )));
    }
    crate::validate_fetch_url(&image_url)?;

    let client = CfClient::new(&source_base_url, cf_state.store.inner_arc())?.with_app_handle(app);
    client.get_image(&image_url).await
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Ordered, user-facing fix suggestions for the given diagnostic state.
fn build_suggestions(has_ipv6: bool, reachable: bool) -> Vec<String> {
    match (has_ipv6, reachable) {
        (false, _) => vec![
            "Enable IPv6 on your router (look for DHCPv6 / IPv6-PD settings — your ISP IP appears public, so 6in4 tunnels are also an option).".to_string(),
            "USB-tether your Android phone — mobile networks almost always include IPv6.".to_string(),
            "Use a VPN with IPv6 support (e.g. Mullvad, Proton).".to_string(),
        ],
        (true, false) => vec![
            "IPv6 is present but Cloudflare's verification server is unreachable — check your firewall or ISP IPv6 routing.".to_string(),
        ],
        (true, true) => vec![],
    }
}

fn host_from_url(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_else(|| url.to_string())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::build_suggestions;

    #[test]
    fn suggestions_no_global_ipv6() {
        let s = build_suggestions(false, false);
        assert!(s.iter().any(|x| x.contains("router")), "router suggestion missing");
        assert!(s.iter().any(|x| x.contains("USB-tether")), "USB-tether suggestion missing");
        assert!(s.iter().any(|x| x.contains("VPN")), "VPN suggestion missing");
        assert_eq!(s.len(), 3);
    }

    #[test]
    fn suggestions_unreachable_with_ipv6() {
        let s = build_suggestions(true, false);
        assert!(s.iter().any(|x| x.contains("firewall")), "firewall suggestion missing");
        assert_eq!(s.len(), 1);
    }

    #[test]
    fn suggestions_all_ok() {
        assert!(build_suggestions(true, true).is_empty());
    }
}
