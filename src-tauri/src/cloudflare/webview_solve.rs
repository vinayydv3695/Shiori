//! One-shot visible-webview Cloudflare Turnstile solver.
//!
//! All Tauri 2 Linux webviews share a single WebKitWebContext (wry keys the
//! context by `data_directory`, which is None for all app windows), so a
//! `cf_clearance` cookie obtained in the visible window is immediately
//! available to subsequent hidden RPC webviews. This module opens a small
//! visible window where the user completes the Turnstile (one click), then
//! signals the caller via the document title — the only event channel
//! available — and always closes the window before returning.

use std::sync::{Arc, Mutex};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::{Result, ShioriError};

/// Serializes concurrent solves: several RPC calls may hit Turnstile at the
/// same time, but only one visible solve window may appear. Waiters simply
/// retry their RPC after the solver finishes (plain lock, no try_lock).
static SOLVE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Opens a visible webview at `url` and waits for the user to clear the
/// Cloudflare Turnstile challenge. Returns Ok once the page title no longer
/// looks like a challenge; Err on failure/timeout.
///
/// // ponytail: one-shot solve; a repeated block after success is surfaced
/// // to the user as before.
pub async fn solve_turnstile(app: &tauri::AppHandle, url: &str) -> Result<()> {
    let _lock = SOLVE_LOCK.lock().await;

    let window_label = format!("cf-solve-{}", uuid::Uuid::new_v4().simple());
    let (tx, rx): (
        tokio::sync::oneshot::Sender<std::result::Result<(), String>>,
        tokio::sync::oneshot::Receiver<std::result::Result<(), String>>,
    ) = tokio::sync::oneshot::channel();
    let tx = Arc::new(Mutex::new(Some(tx)));

    // Poll every 1s: 3 consecutive polls whose title contains none of the
    // challenge markers → solved. A persistent "attention required" title
    // for >45s → failed. The site's own title changes are fine — we only
    // need ONE marker event.
    let js = r#"(async () => {
        const started = Date.now();
        let cleanPolls = 0;
        while (true) {
            const title = document.title.toLowerCase();
            const blocked = title.includes('just a moment')
                || title.includes('cloudflare')
                || title.includes('attention required');
            if (blocked) {
                cleanPolls = 0;
                if (title.includes('attention required') && Date.now() - started > 45000) {
                    document.title = 'SHIORI_CF_FAILED';
                    return;
                }
            } else {
                cleanPolls++;
                if (cleanPolls >= 3) {
                    document.title = 'SHIORI_CF_SOLVED';
                    return;
                }
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    })();"#;

    let tx_clone = Arc::clone(&tx);

    let parsed_url = url::Url::parse(url)
        .map_err(|e| ShioriError::Other(format!("Invalid solve URL {}: {}", url, e)))?;

    let _window = WebviewWindowBuilder::new(app, &window_label, WebviewUrl::External(parsed_url))
        .title("Shiori — Cloudflare verification")
        .inner_size(760.0, 820.0)
        .visible(true)
        .initialization_script(js)
        .on_document_title_changed(move |_window, title| {
            if title == "SHIORI_CF_SOLVED" {
                if let Ok(mut lock) = tx_clone.lock() {
                    if let Some(sender) = lock.take() {
                        let _ = sender.send(Ok(()));
                    }
                }
            } else if title == "SHIORI_CF_FAILED" {
                if let Ok(mut lock) = tx_clone.lock() {
                    if let Some(sender) = lock.take() {
                        let _ = sender.send(Err("Cloudflare block persisted".to_string()));
                    }
                }
            }
        })
        .build()
        .map_err(|e| ShioriError::Other(format!("Failed to build solve webview: {}", e)))?;

    let result = match tokio::time::timeout(std::time::Duration::from_secs(120), rx).await {
        Ok(Ok(Ok(()))) => Ok(()),
        Ok(Ok(Err(msg))) => Err(ShioriError::Other(msg)),
        Ok(Err(_)) => Err(ShioriError::Other(
            "Cloudflare solve channel closed".to_string(),
        )),
        Err(_) => Err(ShioriError::Other(
            "Timed out waiting for Cloudflare solve".to_string(),
        )),
    };

    // ALWAYS close the solve window afterwards (spawned, mangafire-style).
    let w_label = window_label.clone();
    let a = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Some(w) = a.get_webview_window(&w_label) {
            let _ = w.close();
        }
    });

    result
}
