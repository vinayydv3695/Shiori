/// Cloudflare-aware HTTP client wrapper.
///
/// Wraps `reqwest::Client` and:
///  1. Injects the stored user-solved cookies + User-Agent on every request.
///  2. Detects CF blocks in responses and FAILS GRACEFULLY — no automatic
///     solving, no retry loops against the challenge. The user solves in
///     their own browser via Settings → Verify (`cf_solve`).
///  3. Applies configurable rate-limiting / backoff between retries.
///
/// ## Usage
///
/// ```rust,ignore
/// let cf = CfClient::new(store, app_data_dir).await?;
/// let html = cf.get_html("https://www.toongod.org/webtoons/some-manga/").await?;
/// ```
use std::sync::{Arc, Mutex};
use std::time::Duration;

use reqwest::header;
use tokio::sync::Semaphore;
use tokio::time::sleep;

use crate::cloudflare::{
    browser::BrowserConfig,
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
    /// Per-request timeout (default 45s), overridable via [`CfClient::set_timeout`].
    timeout: Mutex<Duration>,
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
            timeout: Mutex::new(Duration::from_secs(45)),
            concurrency: Arc::new(Semaphore::new(MAX_CONCURRENCY)),
            solve_lock: Arc::new(tokio::sync::Mutex::new(())),
            app_handle: None,
        })
    }

    /// Override the per-request timeout (default 45s). Applied to every
    /// request built after the call (both browser-style and XHR requests).
    pub fn set_timeout(&self, d: Duration) {
        *self.timeout.lock().unwrap_or_else(|p| p.into_inner()) = d;
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

    /// Get the active User-Agent from the session (if any).
    pub async fn user_agent(&self) -> Option<String> {
        self.store.get(&self.host).map(|s| s.user_agent)
    }

    /// The base URL this client was created for.
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Whether a stored session (cf_clearance cookies) exists for this host.
    pub fn has_session(&self) -> bool {
        self.store.get(&self.host).is_some()
    }

    /// Fetch a URL and return the raw response bytes (images, binary files).
    pub async fn get_image(&self, url: &str) -> Result<Vec<u8>> {
        // SSRF guard (defense-in-depth): never send session cookies to a host
        // that isn't this client's host (or a subdomain of it).
        let url_host = extract_host(url);
        if !host_matches(&url_host, &self.host) {
            return Err(ShioriError::Other(format!(
                "Blocked image URL: host {} is not {} or a subdomain of it",
                url_host, self.host
            )));
        }
        crate::validate_fetch_url(url)?;
        self.get_bytes(url, Some("image/*")).await
    }

    pub async fn get_bytes(&self, url: &str, accept: Option<&str>) -> Result<Vec<u8>> {
        self.request_bytes(reqwest::Method::GET, url, accept, None).await
    }

    /// Fetch a URL with POST and return the response body as a UTF-8 string.
    pub async fn post_html(&self, url: &str, accept: Option<&str>, body: String) -> Result<String> {
        let bytes = self.request_bytes(reqwest::Method::POST, url, accept, Some(body)).await?;
        String::from_utf8(bytes)
            .map_err(|e| ShioriError::Other(format!("Response is not UTF-8: {e}")))
    }

    /// Low-level request with CF handling, retries, and rate-limiting.
    pub async fn request_bytes(&self, method: reqwest::Method, url: &str, accept: Option<&str>, body: Option<String>) -> Result<Vec<u8>> {
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
            let req = self.build_request(method.clone(), url, accept_val, body.clone()).await?;

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
                             Shiori cannot bypass it automatically — use Verify in Settings \
                             after solving the challenge in your browser."
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

    /// Force-refresh the CF session.
    ///
    /// NEVER launches any solver automatically — the only solve path is the
    /// user-initiated visible `cf_solve` command. If the stored session is
    /// already valid, this is a no-op; otherwise it fails so the caller
    /// surfaces the Cloudflare block gracefully.
    pub async fn refresh_session(&self, url: &str) -> Result<()> {
        let _lock = self.solve_lock.lock().await;

        // Double-check: another task may have refreshed while we were waiting.
        if let Some(sess) = self.store.get(&self.host) {
            if sess.has_valid_clearance() {
                log::info!(
                    "[CfClient] Session already refreshed by another task — skipping"
                );
                return Ok(());
            }
        }

        log::warn!("[CfClient] No valid session and auto-solve is disabled — blocking at {url}");
        Err(ShioriError::Other(format!(
            "Cloudflare is blocking access to {url}. Open Settings → Verify and solve the challenge in your browser to continue."
        )))
    }

    /// Invalidate the current session (next request will re-solve).
    #[allow(dead_code)]
    pub fn invalidate_session(&self) {
        self.store.invalidate(&self.host);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// Resolve a possibly-relative URL against the client's base URL.
    /// Sources (e.g. mangafire) pass API paths like `/api/titles?...`;
    /// reqwest cannot build a request from a relative URL.
    fn resolve_url(&self, url: &str) -> String {
        if url.starts_with('/') {
            format!("{}{}", self.base_url.trim_end_matches('/'), url)
        } else {
            url.to_string()
        }
    }

    async fn build_request(&self, method: reqwest::Method, url: &str, accept: &str, body: Option<String>) -> Result<reqwest::RequestBuilder> {
        let timeout = *self.timeout.lock().unwrap_or_else(|p| p.into_inner());
        let mut req = self
            .http
            .request(method.clone(), self.resolve_url(url))
            .timeout(timeout)
            .header(header::ACCEPT, accept)
            .header(header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
            .header("sec-fetch-dest", "document")
            .header("sec-fetch-mode", "navigate")
            .header("sec-fetch-site", "same-origin")
            .header("sec-fetch-user", "?1")
            .header("upgrade-insecure-requests", "1");

        // WP-style manga themes (toongod) require the XHR marker on POSTs.
        if method == reqwest::Method::POST {
            req = req.header("X-Requested-With", "XMLHttpRequest");
        }

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

        if let Some(b) = body {
            req = req.body(b);
            req = req.header(header::CONTENT_TYPE, "application/x-www-form-urlencoded; charset=UTF-8");
        }

        Ok(req)
    }

    /// Build a request with XHR/AJAX headers instead of browser navigation headers.
    /// MangaFire's API requires X-Requested-With: XMLHttpRequest and CORS sec-fetch headers.
    async fn build_xhr_request(&self, url: &str, accept: &str) -> Result<reqwest::RequestBuilder> {
        let timeout = *self.timeout.lock().unwrap_or_else(|p| p.into_inner());
        let mut req = self
            .http
            .get(self.resolve_url(url))
            .timeout(timeout)
            .header(header::ACCEPT, accept)
            .header(header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
            .header("X-Requested-With", "XMLHttpRequest")
            .header("sec-fetch-dest", "empty")
            .header("sec-fetch-mode", "cors")
            .header("sec-fetch-site", "same-origin");

        if let Some(session) = self.store.get(&self.host) {
            req = req
                .header(header::USER_AGENT, &session.user_agent)
                .header(header::COOKIE, session.cookie_header())
                .header(header::REFERER, &self.base_url);
        } else {
            req = req.header(
                header::USER_AGENT,
                "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 \
                 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
            );
        }

        Ok(req)
    }

    /// Fetch a URL as an XHR/AJAX request and return the response body as UTF-8 string.
    /// Use this for JSON API endpoints that require X-Requested-With headers.
    pub async fn get_xhr(&self, url: &str, accept: &str) -> Result<String> {
        let _permit = self.concurrency.acquire().await;

        let mut attempt = 0u32;
        let mut session_refreshed = false;

        loop {
            if attempt > 0 {
                let delay_ms = BASE_BACKOFF_MS * (attempt as u64).pow(2);
                sleep(Duration::from_millis(delay_ms)).await;
            }

            let req = self.build_xhr_request(url, accept).await?;
            let resp = match req.send().await {
                Ok(r) => r,
                Err(e) => {
                    if attempt >= MAX_RETRIES {
                        return Err(ShioriError::Other(format!("XHR request failed: {e}")));
                    }
                    attempt += 1;
                    continue;
                }
            };

            let status = resp.status();
            let bytes = resp.bytes().await.unwrap_or_default();

            // If CF blocked, refresh session and retry
            if looks_like_html(&bytes) {
                let body_str = String::from_utf8_lossy(&bytes);
                if detector::is_blocked(status, &body_str) {
                    if session_refreshed || attempt >= MAX_RETRIES {
                        return Err(ShioriError::Other(format!(
                            "Cloudflare is blocking access to {url}. Shiori cannot bypass it automatically — use Verify in Settings after solving the challenge in your browser."
                        )));
                    }
                    log::warn!("[CfClient] CF block on XHR {url} — refreshing session");
                    self.refresh_session(url).await?;
                    session_refreshed = true;
                    attempt += 1;
                    continue;
                }
            }

            if status.is_success() {
                return String::from_utf8(bytes.to_vec())
                    .map_err(|e| ShioriError::Other(format!("XHR response not UTF-8: {e}")));
            }

            if attempt >= MAX_RETRIES {
                return Err(ShioriError::Other(format!("HTTP {status} from XHR {url}"))); 
            }
            attempt += 1;
        }
    }

}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn extract_host(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_else(|| url.to_string())
}

/// True if `host` equals `base` or is a subdomain of it (e.g. `img.host.com`
/// for `host.com`). Used to ensure cookies only ever attach to matching hosts.
pub(crate) fn host_matches(host: &str, base: &str) -> bool {
    if host.eq_ignore_ascii_case(base) {
        return true;
    }
    let host = host.to_ascii_lowercase();
    let base = base.to_ascii_lowercase();
    host.len() > base.len() && host.ends_with(&format!(".{base}"))
}

#[cfg(test)]
mod tests {
    use super::host_matches;

    #[test]
    fn test_host_matches() {
        // Exact match
        assert!(host_matches("host.com", "host.com"));
        assert!(host_matches("Host.com", "host.com"));
        // Subdomain match
        assert!(host_matches("img.host.com", "host.com"));
        assert!(host_matches("a.b.host.com", "host.com"));
        // Foreign host / suffix spoofing rejected
        assert!(!host_matches("evil.com", "host.com"));
        assert!(!host_matches("nothost.com", "host.com"));
        assert!(!host_matches("host.com.evil.com", "host.com"));
    }
}

fn looks_like_html(bytes: &[u8]) -> bool {
    if bytes.len() < 5 {
        return false;
    }
    let prefix = &bytes[..bytes.len().min(20)];
    let s = String::from_utf8_lossy(prefix).to_ascii_lowercase();
    s.contains("<!doc") || s.contains("<html") || s.contains("just a")
}
