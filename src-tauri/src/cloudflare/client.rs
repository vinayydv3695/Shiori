/// Cloudflare-aware HTTP client wrapper.
///
/// Wraps `reqwest::Client` and automatically:
///  1. Injects the stored CF cookies + User-Agent on every request.
///  2. Detects CF blocks in responses.
///  3. Re-runs the Playwright solver to refresh the session when needed.
///  4. Retries the original request with the new session.
///  5. Applies configurable rate-limiting / backoff between retries.
///
/// ## Usage
///
/// ```rust,ignore
/// let cf = CfClient::new(store, app_data_dir).await?;
/// let html = cf.get_html("https://www.toongod.org/webtoons/some-manga/").await?;
/// ```
use std::{sync::Arc, time::Duration};

use reqwest::header;
use tokio::sync::Semaphore;
use tokio::time::sleep;

use crate::cloudflare::{
    browser::{self, BrowserConfig},
    detector,
    session::{CfSession, SessionStore},
};
use crate::error::{Result, ShioriError};

// ─── Rate-limiting constants ──────────────────────────────────────────────────

/// Maximum concurrent in-flight requests to a single host.
const MAX_CONCURRENCY: usize = 3;

/// Base backoff delay between retries (exponential: n^2 * BASE_MS).
const BASE_BACKOFF_MS: u64 = 300;

/// Maximum number of automatic retries (not counting the initial attempt).
const MAX_RETRIES: u32 = 3;

// ─── CfClient ────────────────────────────────────────────────────────────────

/// A Cloudflare-aware HTTP client.  Create one per host.
pub struct CfClient {
    host: String,
    base_url: String,
    store: Arc<SessionStore>,
    browser_cfg: BrowserConfig,
    /// Inner reqwest client — used for all actual HTTP traffic.
    http: reqwest::Client,
    /// Semaphore prevents too many simultaneous requests to the same host.
    concurrency: Arc<Semaphore>,
    /// Lock that serialises browser-solver invocations (only one solve at a time).
    solve_lock: Arc<tokio::sync::Mutex<()>>,
    /// Tauri AppHandle to call Android SAF plugins if needed
    app_handle: Option<tauri::AppHandle>,
}

impl CfClient {
    /// Create a new `CfClient` for `base_url` (e.g. `https://www.toongod.org`).
    pub fn new(base_url: impl Into<String>, store: Arc<SessionStore>) -> Result<Self> {
        let base_url = base_url.into();
        let host = extract_host(&base_url);

        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(45))
            .connect_timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::limited(10))
            .cookie_store(true)
            .gzip(true)
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to build HTTP client: {e}")))?;

        Ok(Self {
            host,
            base_url,
            store,
            browser_cfg: BrowserConfig::default(),
            http,
            concurrency: Arc::new(Semaphore::new(MAX_CONCURRENCY)),
            solve_lock: Arc::new(tokio::sync::Mutex::new(())),
            app_handle: None,
        })
    }

    /// Set the Tauri AppHandle (needed for Android Cloudflare bypass).
    pub fn with_app_handle(mut self, app: tauri::AppHandle) -> Self {
        self.app_handle = Some(app);
        self
    }

    /// Override the browser configuration (useful for testing or CI).
    #[allow(dead_code)]
    pub fn with_browser_config(mut self, cfg: BrowserConfig) -> Self {
        self.browser_cfg = cfg;
        self
    }

    // ── High-level helpers ────────────────────────────────────────────────────

    /// Fetch a URL and return the response body as a UTF-8 string.
    /// Auto-solves CF challenges and retries.
    pub async fn get_html(&self, url: &str) -> Result<String> {
        let bytes = self.get_bytes(url, Some("text/html")).await?;
        String::from_utf8(bytes)
            .map_err(|e| ShioriError::Other(format!("Response is not UTF-8: {e}")))
    }

    /// Fetch a URL and return the raw response bytes (images, binary files).
    pub async fn get_image(&self, url: &str) -> Result<Vec<u8>> {
        self.get_bytes(url, Some("image/*")).await
    }

    /// Low-level request with CF handling, retries, and rate-limiting.
    pub async fn get_bytes(&self, url: &str, accept: Option<&str>) -> Result<Vec<u8>> {
        let _permit = self.concurrency.acquire().await;

        let accept_val = accept.unwrap_or(
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        );

        let mut attempt = 0u32;
        let mut session_refreshed = false;

        loop {
            // Back-off on retries.
            if attempt > 0 {
                let delay_ms = BASE_BACKOFF_MS * (attempt as u64).pow(2);
                sleep(Duration::from_millis(delay_ms)).await;
                log::debug!("[CfClient] retry {attempt} for {url}");
            }

            // Build request with current session cookies.
            let req = self.build_request(url, accept_val).await?;

            let resp = match req.send().await {
                Ok(r) => r,
                Err(e) => {
                    if attempt >= MAX_RETRIES {
                        return Err(ShioriError::Other(format!(
                            "Request failed after {MAX_RETRIES} retries: {e}"
                        )));
                    }
                    attempt += 1;
                    continue;
                }
            };

            let status = resp.status();
            let bytes = resp.bytes().await.unwrap_or_default();

            // For HTML responses, check for CF block.
            if looks_like_html(&bytes) {
                let body_str = String::from_utf8_lossy(&bytes);
                if detector::is_blocked(status, &body_str) {
                    if session_refreshed || attempt >= MAX_RETRIES {
                        return Err(ShioriError::Other(format!(
                            "Cloudflare is blocking access to {url}. \
                             The browser solver has already been attempted. \
                             Please check your network connection or try again later."
                        )));
                    }
                    log::warn!("[CfClient] CF block detected at {url} (attempt {attempt}) — refreshing session");
                    self.refresh_session(url).await?;
                    session_refreshed = true;
                    attempt += 1;
                    continue;
                }
            }

            // Success.
            if status.is_success() {
                return Ok(bytes.to_vec());
            }

            // Non-CF HTTP error.
            if attempt >= MAX_RETRIES {
                return Err(ShioriError::Other(format!(
                    "HTTP {status} from {url} after {MAX_RETRIES} retries"
                )));
            }
            attempt += 1;
        }
    }

    // ── Session management ────────────────────────────────────────────────────

    /// Ensure a valid session exists for this host.  If not, launch the browser
    /// solver.  Returns the session.
    #[allow(dead_code)]
    pub async fn ensure_session(&self) -> Result<CfSession> {
        if let Some(sess) = self.store.get(&self.host) {
            return Ok(sess);
        }
        self.refresh_session(&self.base_url).await?;
        self.store
            .get(&self.host)
            .ok_or_else(|| ShioriError::Other("Session was not saved after solving".to_string()))
    }

    /// Force-refresh the CF session by launching the Playwright solver.
    /// This is serialised — only one solve runs at a time.
    pub async fn refresh_session(&self, url: &str) -> Result<()> {
        let _lock = self.solve_lock.lock().await;

        // Double-check: another task may have refreshed while we were waiting.
        if let Some(sess) = self.store.get(&self.host) {
            if sess.has_valid_clearance() {
                log::info!(
                    "[CfClient] Session already refreshed by another task — skipping solver"
                );
                return Ok(());
            }
        }

        log::info!("[CfClient] Launching Playwright solver for {}", self.host);
        let session = browser::solve(url, &self.host, &self.browser_cfg, self.app_handle.as_ref()).await?;
        self.store.save(session)?;
        log::info!("[CfClient] ✓ Session saved for {}", self.host);
        Ok(())
    }

    /// Invalidate the current session (next request will re-solve).
    #[allow(dead_code)]
    pub fn invalidate_session(&self) {
        self.store.invalidate(&self.host);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    async fn build_request(&self, url: &str, accept: &str) -> Result<reqwest::RequestBuilder> {
        let mut req = self
            .http
            .get(url)
            .header(header::ACCEPT, accept)
            .header(header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
            .header("sec-fetch-dest", "document")
            .header("sec-fetch-mode", "navigate")
            .header("sec-fetch-site", "same-origin")
            .header("sec-fetch-user", "?1")
            .header("upgrade-insecure-requests", "1");

        // Inject session cookies + User-Agent if we have a session.
        if let Some(session) = self.store.get(&self.host) {
            req = req
                .header(header::USER_AGENT, &session.user_agent)
                .header(header::COOKIE, session.cookie_header())
                .header(header::REFERER, &self.base_url);
        } else {
            // No session yet — use a realistic browser UA as fallback.
            req = req.header(
                header::USER_AGENT,
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 \
                 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            );
        }

        Ok(req)
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn extract_host(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_else(|| url.to_string())
}

fn looks_like_html(bytes: &[u8]) -> bool {
    if bytes.len() < 5 {
        return false;
    }
    let prefix = &bytes[..bytes.len().min(20)];
    let s = String::from_utf8_lossy(prefix).to_ascii_lowercase();
    s.contains("<!doc") || s.contains("<html") || s.contains("just a")
}
