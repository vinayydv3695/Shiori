//! Persistent hidden-webview RPC service (online performance plan, Slice 1).
//!
//! Cloudflare-protected sources (MangaFire, ...) only answer their JSON API
//! from inside a real browser session. The old approach spun up a fresh
//! hidden webview per request (uuid label, navigate, wait for `extendClient`,
//! run JS, stream the result back via `document.title` chunks, close) —
//! 5–8s of spin-up per call, serialized by a global lock. A 6-page chapter
//! list cost ~40s.
//!
//! This service keeps ONE hidden webview per source alive, routes concurrent
//! requests to it by id, and respawns it when it dies. Spin-up cost is paid
//! once at startup (warm-up), not per request.
//!
//! Protocol (all via `document.title`, WebKitGTK-safe chunked handshake):
//! - `SHIORI_READY|`               — page loaded, init script finished
//! - `SHIORI_CHUNK|<id>|<urlenc>`  — result chunk for request <id>
//! - `SHIORI_DONE|<id>`            — result complete (chunks reassembled)
//! - `SHIORI_ERROR|<id>|<urlenc>`  — JS threw for request <id>
//! - `SHIORI_INIT_ERROR|<urlenc>`  — init script failed (no request routed)
//! - ACK: Rust evals `window.__SHIORI_ACK = <id>;` after each chunk.
//!
//! `RPC_BOOTSTRAP` defines `window.__shioriExec` / `window.__shioriReady`;
//! source init scripts run it first, then set up their own bridge
//! (`extendClient` + `myAxios` for MangaFire) and finish with
//! `window.__shioriReady()`.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::{Result, ShioriError};

/// Max concurrent JS executions on one webview (each is an async task in the
/// page; the webview is single-threaded but network fetches interleave).
const MAX_IN_FLIGHT: usize = 8;
/// Per-call timeout, matching the legacy RPC timeout.
const CALL_TIMEOUT: Duration = Duration::from_secs(60);
/// How long `warm()` / `call()` waits for the page to become ready.
const WARM_TIMEOUT: Duration = Duration::from_secs(20);
/// Consecutive failures before the webview is recreated.
const RESPAWN_THRESHOLD: u32 = 2;
/// Minimum time between respawns (bounds churn).
const RESPAWN_COOLDOWN: Duration = Duration::from_secs(20);
/// JS injected into every page of the RPC webview. Defines the request
/// executor + ready signal; source init scripts call `__shioriReady()` once
/// their own bridge (extendClient/myAxios) is up.
pub const RPC_BOOTSTRAP: &str = r#"
window.__SHIORI_ACK = null;
window.__shioriReady = () => { document.title = 'SHIORI_READY|'; };
window.__shioriExec = (id, fn) => {
  (async () => {
    try {
      const raw = await fn();
      const result = (typeof raw === 'string') ? raw : JSON.stringify(raw);
      for (let i = 0; i < result.length; i += 512) {
        document.title = 'SHIORI_CHUNK|' + id + '|' + encodeURIComponent(result.slice(i, i + 512));
        while (window.__SHIORI_ACK !== id) { await new Promise(r => setTimeout(r, 10)); }
        window.__SHIORI_ACK = null;
      }
      document.title = 'SHIORI_DONE|' + id;
    } catch (e) {
      document.title = 'SHIORI_ERROR|' + id + '|' + encodeURIComponent(String((e && e.message) || e));
    }
  })();
};
"#;

/// Parsed `document.title` protocol event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TitleEvent {
    Ready,
    Chunk { id: u64, payload: String },
    Done { id: u64 },
    Error { id: u64, message: String },
    InitError { message: String },
    Other(String),
}

/// Parse a title write into a [`TitleEvent`]. Pure fn — unit-testable.
pub fn parse_title(title: &str) -> TitleEvent {
    if title == "SHIORI_READY|" {
        return TitleEvent::Ready;
    }
    if let Some(rest) = title.strip_prefix("SHIORI_CHUNK|") {
        if let Some((id_s, payload)) = rest.split_once('|') {
            if let Ok(id) = id_s.parse::<u64>() {
                let decoded = urlencoding::decode(payload)
                    .unwrap_or(std::borrow::Cow::Borrowed(payload))
                    .into_owned();
                return TitleEvent::Chunk { id, payload: decoded };
            }
        }
    }
    if let Some(rest) = title.strip_prefix("SHIORI_DONE|") {
        if let Ok(id) = rest.parse::<u64>() {
            return TitleEvent::Done { id };
        }
    }
    if let Some(rest) = title.strip_prefix("SHIORI_ERROR|") {
        if let Some((id_s, msg)) = rest.split_once('|') {
            if let Ok(id) = id_s.parse::<u64>() {
                let decoded = urlencoding::decode(msg)
                    .unwrap_or(std::borrow::Cow::Borrowed(msg))
                    .into_owned();
                return TitleEvent::Error { id, message: decoded };
            }
        }
    }
    if let Some(msg) = title.strip_prefix("SHIORI_INIT_ERROR|") {
        let decoded = urlencoding::decode(msg)
            .unwrap_or(std::borrow::Cow::Borrowed(msg))
            .into_owned();
        return TitleEvent::InitError { message: decoded };
    }
    TitleEvent::Other(title.to_string())
}

/// Respawn budget check — pure fn for tests.
fn respawn_allowed(last: Option<Instant>, now: Instant) -> bool {
    match last {
        Some(t) => now.duration_since(t) >= RESPAWN_COOLDOWN,
        None => true,
    }
}

pub struct BrowserRpc {
    label: String,
    base_url: url::Url,
    /// Bootstrap + source init script, run on every page load.
    init_js: String,
    app: OnceLock<tauri::AppHandle>,
    is_ready: AtomicBool,
    ready_notify: tokio::sync::Notify,
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, tokio::sync::oneshot::Sender<Result<String>>>>,
    chunk_buffers: Mutex<HashMap<u64, String>>,
    consecutive_failures: Mutex<u32>,
    last_respawn: Mutex<Option<Instant>>,
    init_error: Mutex<Option<String>>,
}

impl BrowserRpc {
    /// `base_url` is where the hidden webview navigates (the source's page
    /// that carries its JS bridge). `init_js` must start with [`RPC_BOOTSTRAP`]
    /// and end with `window.__shioriReady()` once ready.
    pub fn new(label: impl Into<String>, base_url: &str, init_js: String) -> Result<Self> {
        let base_url = url::Url::parse(base_url)
            .map_err(|e| ShioriError::Other(format!("BrowserRpc invalid base_url: {e}")))?;
        Ok(Self {
            label: label.into(),
            base_url,
            init_js,
            app: OnceLock::new(),
            is_ready: AtomicBool::new(false),
            ready_notify: tokio::sync::Notify::new(),
            next_id: AtomicU64::new(1),
            pending: Mutex::new(HashMap::new()),
            chunk_buffers: Mutex::new(HashMap::new()),
            consecutive_failures: Mutex::new(0),
            last_respawn: Mutex::new(None),
            init_error: Mutex::new(None),
        })
    }

    /// Attach the app handle (available once Tauri setup runs). Idempotent.
    pub fn attach(&self, app: tauri::AppHandle) {
        let _ = self.app.set(app);
    }

    /// Whether a webview exists and reported ready.
    pub fn is_warm(&self) -> bool {
        self.is_ready.load(Ordering::SeqCst)
    }

    /// Spawn the webview (if missing) and wait until it reports ready.
    pub async fn warm(self: &Arc<Self>) -> Result<()> {
        let app = self
            .app
            .get()
            .ok_or_else(|| ShioriError::Other("BrowserRpc not attached".into()))?;
        self.ensure_webview(app).await
    }

    /// Run `script` (an async JS function body returning a JSON-able value)
    /// in the persistent webview. Concurrent calls are allowed and routed by
    /// id. Errors map through the caller's own error mapping.
    pub async fn call(self: &Arc<Self>, script: &str) -> Result<String> {
        let app = self
            .app
            .get()
            .ok_or_else(|| ShioriError::Other("BrowserRpc not attached".into()))?;
        self.ensure_webview(app).await?;

        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        if id == 0 {
            // Wrapped: 0 is reserved (init errors use it as "no id").
            let _ = self
                .next_id
                .compare_exchange(0, 1, Ordering::Relaxed, Ordering::Relaxed);
            return Err(ShioriError::Other(
                "BrowserRpc id space exhausted".into(),
            ));
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        {
            let mut pending = self.pending.lock().unwrap_or_else(|p| p.into_inner());
            if pending.len() >= MAX_IN_FLIGHT {
                return Err(ShioriError::Other(format!(
                    "BrowserRpc busy ({} calls in flight)",
                    pending.len()
                )));
            }
            pending.insert(id, tx);
        }

        let js = format!("window.__shioriExec({}, async () => {{ {} }});", id, script);
        let window = app.get_webview_window(&self.label).ok_or_else(|| {
            ShioriError::Other("BrowserRpc webview vanished".into())
        })?;
        if let Err(e) = window.eval(&js) {
            self.drop_pending(id);
            return Err(ShioriError::Other(format!(
                "BrowserRpc eval failed: {}",
                e
            )));
        }

        match tokio::time::timeout(CALL_TIMEOUT, rx).await {
            Ok(Ok(res)) => {
                if let Ok(mut f) = self.consecutive_failures.lock() {
                    *f = 0;
                }
                res
            }
            Ok(Err(_)) => {
                // Sender dropped: webview went away mid-call.
                self.record_failure(app);
                Err(ShioriError::Other(
                    "BrowserRpc webview closed during call".into(),
                ))
            }
            Err(_) => {
                self.drop_pending(id);
                self.record_failure(app);
                Err(ShioriError::Other("BrowserRpc call timed out".into()))
            }
        }
    }

    /// Handle a `document.title` write from the RPC webview (sync; called
    /// from the webview's title-changed callback).
    fn handle_title(&self, window: &tauri::WebviewWindow, title: &str) {
        match parse_title(title) {
            TitleEvent::Ready => {
                if let Ok(mut e) = self.init_error.lock() {
                    *e = None;
                }
                self.is_ready.store(true, Ordering::SeqCst);
                self.ready_notify.notify_waiters();
            }
            TitleEvent::Chunk { id, payload } => {
                if id == 0 {
                    return;
                }
                self.chunk_buffers
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .entry(id)
                    .or_default()
                    .push_str(&payload);
                let _ = window.eval(format!("window.__SHIORI_ACK = {};", id));
            }
            TitleEvent::Done { id } => {
                let buf = self
                    .chunk_buffers
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .remove(&id);
                if let Some(buf) = buf {
                    if let Some(tx) = self
                        .pending
                        .lock()
                        .unwrap_or_else(|p| p.into_inner())
                        .remove(&id)
                    {
                        let _ = tx.send(Ok(buf));
                    }
                }
            }
            TitleEvent::Error { id, message } => {
                if let Some(tx) = self
                    .pending
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .remove(&id)
                {
                    let _ = tx.send(Err(ShioriError::Other(message)));
                }
            }
            TitleEvent::InitError { message } => {
                if let Ok(mut e) = self.init_error.lock() {
                    *e = Some(message);
                }
                log::warn!("[browser_rpc:{}] init script failed", self.label);
            }
            TitleEvent::Other(_) => {}
        }
    }

    async fn ensure_webview(self: &Arc<Self>, app: &tauri::AppHandle) -> Result<()> {
        if app.get_webview_window(&self.label).is_none() {
            self.is_ready.store(false, Ordering::SeqCst);
            self.spawn_webview(app)?;
        }
        self.wait_ready().await
    }

    fn spawn_webview(self: &Arc<Self>, app: &tauri::AppHandle) -> Result<()> {
        if app.get_webview_window(&self.label).is_some() {
            return Ok(());
        }
        let this = Arc::clone(self);
        let label = self.label.clone();
        let init_js = self.init_js.clone();
        let base_url = self.base_url.clone();
        let _window = WebviewWindowBuilder::new(
            app,
            &label,
            WebviewUrl::External(base_url),
        )
        .visible(false)
        .initialization_script(&init_js)
        .on_document_title_changed(move |window, title| {
            this.handle_title(&window, &title);
        })
        .build()
        .map_err(|e| ShioriError::Other(format!("Failed to build RPC webview: {}", e)))?;
        log::info!("[browser_rpc:{}] webview created", self.label);
        Ok(())
    }

    async fn wait_ready(&self) -> Result<()> {
        let deadline = Instant::now() + WARM_TIMEOUT;
        loop {
            if self.is_ready.load(Ordering::SeqCst) {
                return Ok(());
            }
            if let Some(msg) = self
                .init_error
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .clone()
            {
                return Err(ShioriError::Other(format!(
                    "BrowserRPC init failed: {}",
                    msg
                )));
            }
            if Instant::now() >= deadline {
                return Err(ShioriError::Other(
                    "BrowserRPC webview not ready (timeout)".into(),
                ));
            }
            tokio::select! {
                _ = self.ready_notify.notified() => {}
                _ = tokio::time::sleep(Duration::from_millis(200)) => {}
            }
        }
    }

    fn drop_pending(&self, id: u64) {
        self.pending
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(&id);
        self.chunk_buffers
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(&id);
    }

    fn record_failure(self: &Arc<Self>, app: &tauri::AppHandle) {
        let respawn = {
            let mut f = self
                .consecutive_failures
                .lock()
                .unwrap_or_else(|p| p.into_inner());
            *f += 1;
            if *f >= RESPAWN_THRESHOLD {
                *f = 0;
                true
            } else {
                false
            }
        };
        if respawn {
            let this = Arc::clone(self);
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = this.respawn(&app).await;
            });
        }
    }

    async fn respawn(self: &Arc<Self>, app: &tauri::AppHandle) -> Result<()> {
        {
            let mut last = self
                .last_respawn
                .lock()
                .unwrap_or_else(|p| p.into_inner());
            if !respawn_allowed(*last, Instant::now()) {
                return Err(ShioriError::Other(
                    "BrowserRpc respawn cooling down".into(),
                ));
            }
            *last = Some(Instant::now());
        }
        log::warn!("[browser_rpc:{}] respawning webview", self.label);
        // Fail every in-flight request: the old webview is gone. Collect the
        // senders first so no lock is held across an await.
        let senders: Vec<_> = {
            let mut pending = self.pending.lock().unwrap_or_else(|p| p.into_inner());
            pending.drain().map(|(_, tx)| tx).collect()
        };
        for tx in senders {
            let _ = tx.send(Err(ShioriError::Other(
                "BrowserRpc webview respawned".into(),
            )));
        }
        self.chunk_buffers
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clear();
        if let Some(w) = app.get_webview_window(&self.label) {
            let _ = w.close();
        }
        self.is_ready.store(false, Ordering::SeqCst);
        self.spawn_webview(app)?;
        self.wait_ready().await
    }
}

impl std::fmt::Debug for BrowserRpc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BrowserRpc")
            .field("label", &self.label)
            .field("base_url", &self.base_url)
            .field("is_ready", &self.is_ready.load(Ordering::SeqCst))
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_title_ready() {
        assert_eq!(parse_title("SHIORI_READY|"), TitleEvent::Ready);
    }

    #[test]
    fn parse_title_chunk_decodes_payload() {
        let encoded = urlencoding::encode("hello world");
        let title = format!("SHIORI_CHUNK|7|{}", encoded);
        assert_eq!(
            parse_title(&title),
            TitleEvent::Chunk {
                id: 7,
                payload: "hello world".into()
            }
        );
    }

    #[test]
    fn parse_title_done_and_error() {
        assert_eq!(parse_title("SHIORI_DONE|42"), TitleEvent::Done { id: 42 });
        let msg = urlencoding::encode("boom: it broke");
        let title = format!("SHIORI_ERROR|3|{}", msg);
        assert_eq!(
            parse_title(&title),
            TitleEvent::Error {
                id: 3,
                message: "boom: it broke".into()
            }
        );
    }

    #[test]
    fn parse_title_init_error() {
        let msg = urlencoding::encode("extendClient not found");
        assert_eq!(
            parse_title(&format!("SHIORI_INIT_ERROR|{}", msg)),
            TitleEvent::InitError {
                message: "extendClient not found".into()
            }
        );
    }

    #[test]
    fn parse_title_malformed_falls_through() {
        assert_eq!(
            parse_title("SHIORI_CHUNK|nope|data"),
            TitleEvent::Other("SHIORI_CHUNK|nope|data".into())
        );
        assert_eq!(parse_title("MangaFire"), TitleEvent::Other("MangaFire".into()));
    }

    #[test]
    fn respawn_budget_respects_cooldown() {
        let now = Instant::now();
        assert!(respawn_allowed(None, now));
        assert!(!respawn_allowed(
            Some(now - RESPAWN_COOLDOWN + Duration::from_secs(1)),
            now
        ));
        assert!(respawn_allowed(
            Some(now - RESPAWN_COOLDOWN - Duration::from_secs(1)),
            now
        ));
    }

    #[test]
    fn ids_never_zero_and_monotonic() {
        let rpc = BrowserRpc::new(
            "test",
            "https://example.com",
            RPC_BOOTSTRAP.to_string(),
        )
        .unwrap();
        let a = rpc.next_id.fetch_add(1, Ordering::Relaxed);
        assert!(a >= 1);
        let b = rpc.next_id.fetch_add(1, Ordering::Relaxed);
        assert!(b > a);
    }
}
