use async_trait::async_trait;
use futures::future::BoxFuture;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

#[cfg(target_os = "android")]
use tauri_plugin_android_saf::AndroidSafExt;

use crate::cloudflare::client::CfClient;
use crate::error::{Result, ShioriError};
use crate::sources::cache::cache_get_or_fetch;
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceError, SourceHealth, SourceMeta};

const BASE_URL: &str = "https://mangafire.to";

/// How long chapter lists are served from the in-memory cache before a refresh.
const CHAPTER_CACHE_TTL: Duration = Duration::from_secs(10 * 60);
/// How long chapter page lists are served from the in-memory cache before a refresh.
const PAGES_CACHE_TTL: Duration = Duration::from_secs(30 * 60);
/// Max number of chapter-list pages fetched concurrently. Every page is a
/// Cloudflare-browser RPC round-trip, so a small cap keeps the webview sane
/// while still cutting wall-clock time by ~4x on multi-page series.
const PAGE_FETCH_CONCURRENCY: usize = 4;

/// Single choke point mapping RPC errors to structured [`SourceError`]s.
///
/// The RPC JS throws "Cloudflare Turnstile challenge pending..." when the
/// challenge page never resolves; a challenge page can also surface through
/// other messages containing "Cloudflare". Both become
/// [`SourceError::CloudflareChallenge`] so the frontend shows the Verify hint.
fn map_rpc_error(e: ShioriError) -> ShioriError {
    let msg = e.to_string();
    if msg.contains("Turnstile") || msg.contains("Cloudflare") {
        return SourceError::CloudflareChallenge.into();
    }
    e
}

pub struct MangaFireSource {
    cf_client: RwLock<Option<Arc<CfClient>>>,
    app_handle: RwLock<Option<tauri::AppHandle>>,
    rpc_lock: tokio::sync::Mutex<()>,
    /// content_id -> (cached_at, chapters); TTL [`CHAPTER_CACHE_TTL`].
    chapter_cache: Mutex<HashMap<String, (Instant, Vec<Chapter>)>>,
    /// chapter_id -> (cached_at, pages); TTL [`PAGES_CACHE_TTL`].
    pages_cache: Mutex<HashMap<String, (Instant, Vec<Page>)>>,
}

impl MangaFireSource {
    pub fn new() -> Self {
        Self {
            cf_client: RwLock::new(None),
            app_handle: RwLock::new(None),
            rpc_lock: tokio::sync::Mutex::new(()),
            chapter_cache: Mutex::new(HashMap::new()),
            pages_cache: Mutex::new(HashMap::new()),
        }
    }

    pub async fn set_cf_client(&self, cf: Arc<CfClient>, app_handle: tauri::AppHandle) {
        *self.cf_client.write().await = Some(cf);
        *self.app_handle.write().await = Some(app_handle);
    }

    async fn wait_for_init(&self) -> Result<()> {
        for _ in 0..50 {
            {
                let cf_ready = self.cf_client.read().await.is_some();
                let app_ready = self.app_handle.read().await.is_some();
                if cf_ready && app_ready {
                    return Ok(());
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
        Err(ShioriError::Other(
            "MangaFire source client not initialized (timeout)".into(),
        ))
    }

    async fn evaluate_js_on_site(&self, js_script: &str) -> Result<String> {
        // rpc_lock is held across the whole function: the RPC webviews are
        // hidden and share the session, so only one may run at a time.
        let _lock = self.rpc_lock.lock().await;
        self.wait_for_init().await?;
        let guard = self.app_handle.read().await;
        if let Some(app) = guard.as_ref() {
            let app = app.clone();
            // Single attempt, no automated Turnstile retry. A challenge is
            // surfaced as `SourceError::CloudflareChallenge` — the user solves
            // it manually via Settings → Verify (stored cookies then apply to
            // the next RPC webview).
            return match self.run_rpc_once(&app, js_script).await {
                Ok(res) => Ok(res),
                Err(e) => Err(map_rpc_error(e)),
            };
        }
        Err(ShioriError::Other(
            "Browser RPC not initialized for MangaFire".into(),
        ))
    }

    /// Runs one hidden-webview RPC attempt against mangafire.to/filter.
    async fn run_rpc_once(&self, app: &tauri::AppHandle, js_script: &str) -> Result<String> {
        let window_label = format!("mf-rpc-{}", uuid::Uuid::new_v4().simple());
            let (tx, rx) = tokio::sync::oneshot::channel();
            let tx = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
            let html_buffer = std::sync::Arc::new(std::sync::Mutex::new(String::new()));

            let js = format!(
                r#"(async () => {{
                    try {{
                        if (window.top !== window.self) return;
                        if (document.readyState === 'loading') {{
                            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
                        }}
                        let cfAttempts = 0;
                        while (true) {{
                            const title = document.title.toLowerCase();
                            if (title.includes('just a moment') || title.includes('cloudflare') || title.includes('attention required')) {{
                                cfAttempts++;
                                if (cfAttempts > 15) {{
                                    throw new Error("Cloudflare Turnstile challenge pending - please solve via Settings or retry");
                                }}
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                continue;
                            }}
                            break;
                        }}
                        
                        let attempts = 0;
                        while (typeof window.extendClient === 'undefined' && attempts < 25) {{
                            await new Promise(r => setTimeout(r, 400));
                            attempts++;
                        }}
                        if (typeof window.extendClient === 'undefined') throw new Error("extendClient not found");

                        if (!window.myAxios) {{
                            let requestInterceptor = null;
                            window.myAxios = {{
                                defaults: {{ baseURL: '/', headers: {{}} }},
                                interceptors: {{
                                    request: {{
                                        use: (fn) => {{ requestInterceptor = fn; }}
                                    }}
                                }},
                                get: async (url, config = {{}}) => {{
                                    let reqConfig = {{
                                        url,
                                        method: 'get',
                                        headers: {{
                                            'Accept': 'application/json, text/javascript, */*; q=0.01',
                                            'X-Requested-With': 'XMLHttpRequest',
                                            ...(config.headers || {{}})
                                        }},
                                        params: config.params || {{}}
                                    }};
                                    if (requestInterceptor) {{
                                        reqConfig = await requestInterceptor(reqConfig) || reqConfig;
                                    }}
                                    let fullUrl = reqConfig.url;
                                    if (reqConfig.params && Object.keys(reqConfig.params).length > 0) {{
                                        const query = new URLSearchParams(reqConfig.params).toString();
                                        fullUrl += (fullUrl.includes('?') ? '&' : '?') + query;
                                    }}
                                    const resp = await fetch(fullUrl, {{
                                        method: 'GET',
                                        headers: reqConfig.headers,
                                        credentials: 'include'
                                    }});
                                    const data = await resp.json();
                                    return {{ data }};
                                }}
                            }};
                            window.extendClient(window.myAxios);
                        }}

                        const raw_result = await (async () => {{ {} }})();
                        const result = (typeof raw_result === 'string') ? raw_result : JSON.stringify(raw_result);
                        // Keep chunks small: WebKitGTK coalesces/caps rapid or oversized
                        // document.title writes, which would stall the ACK handshake
                        // and hit the 60s timeout. 512 chars is the proven value.
                        const chunkSize = 512;
                        window.__CHUNK_ACK = true;
                        for (let i = 0; i < result.length; i += chunkSize) {{
                            const chunk = result.slice(i, i + chunkSize);
                            window.__CHUNK_ACK = false;
                            document.title = 'SHIORI_CHUNK|' + encodeURIComponent(chunk);
                            while (!window.__CHUNK_ACK) {{
                                await new Promise(r => setTimeout(r, 10));
                            }}
                        }}
                        document.title = 'SHIORI_DONE|';
                    }} catch (e) {{
                        document.title = 'SHIORI_ERROR|' + e.message;
                    }}
                }})();"#,
                js_script
            );

            let tx_clone = std::sync::Arc::clone(&tx);
            let app_clone = app.clone();
            let window_label_clone = window_label.clone();
            let html_buffer_clone = std::sync::Arc::clone(&html_buffer);

            use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

            let _window = WebviewWindowBuilder::new(
                app,
                &window_label,
                WebviewUrl::External("https://mangafire.to/filter".parse().unwrap()),
            )
            .visible(false)
            .initialization_script(&js)
            .on_document_title_changed(move |window, title| {
                if title.starts_with("SHIORI_CHUNK|") {
                    if let Ok(mut buf) = html_buffer_clone.lock() {
                        let raw = title.trim_start_matches("SHIORI_CHUNK|");
                        let decoded =
                            urlencoding::decode(raw).unwrap_or(std::borrow::Cow::Borrowed(raw));
                        buf.push_str(&decoded);
                    }
                    let _ = window.eval("window.__CHUNK_ACK = true;");
                } else if title.starts_with("SHIORI_DONE|") {
                    if let Ok(mut lock) = tx_clone.lock() {
                        if let Some(sender) = lock.take() {
                            let buf = html_buffer_clone.lock().unwrap().clone();
                            let _ = sender.send(Ok(buf));
                        }
                    }
                    let w_label = window_label_clone.clone();
                    let a = app_clone.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(w) = a.get_webview_window(&w_label) {
                            let _ = w.close();
                        }
                    });
                } else if title.starts_with("SHIORI_ERROR|") {
                    if let Ok(mut lock) = tx_clone.lock() {
                        if let Some(sender) = lock.take() {
                            let err = title.trim_start_matches("SHIORI_ERROR|").to_string();
                            let _ = sender.send(Err(err));
                        }
                    }
                    let w_label = window_label_clone.clone();
                    let a = app_clone.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(w) = a.get_webview_window(&w_label) {
                            let _ = w.close();
                        }
                    });
                }
            })
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to build rpc webview: {}", e)))?;

            let result = match tokio::time::timeout(std::time::Duration::from_secs(60), rx).await {
                Ok(Ok(Ok(res))) => res,
                Ok(Ok(Err(err))) => {
                    return Err(ShioriError::Other(format!(
                        "MangaFire RPC JS error: {}",
                        err
                    )));
                }
                _ => {
                    let w_label = window_label.clone();
                    let a = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(w) = a.get_webview_window(&w_label) {
                            let _ = w.close();
                        }
                    });
                    return Err(ShioriError::Other("MangaFire RPC timed out".to_string()));
                }
            };

            Ok(result)
    }

    async fn fetch_rpc(&self, url: &str) -> Result<String> {
        self.wait_for_init().await?;

        #[cfg(target_os = "android")]
        {
            let guard = self.app_handle.read().await;
            if let Some(app) = guard.as_ref() {
                let js = format!(
                    r#"(async () => {{
                        try {{
                            let attempts = 0;
                            while (typeof window.extendClient === 'undefined' && attempts < 25) {{
                                await new Promise(r => setTimeout(r, 400));
                                attempts++;
                            }}
                            if (typeof window.extendClient === 'undefined') throw new Error("extendClient not found");

                            if (!window.myAxios) {{
                                let requestInterceptor = null;
                                window.myAxios = {{
                                    defaults: {{ baseURL: '/', headers: {{}} }},
                                    interceptors: {{
                                        request: {{
                                            use: (fn) => {{ requestInterceptor = fn; }}
                                        }}
                                    }},
                                    get: async (url, config = {{}}) => {{
                                        let reqConfig = {{
                                            url,
                                            method: 'get',
                                            headers: {{
                                                'Accept': 'application/json, text/javascript, */*; q=0.01',
                                                'X-Requested-With': 'XMLHttpRequest',
                                                ...(config.headers || {{}})
                                            }},
                                            params: config.params || {{}}
                                        }};
                                        if (requestInterceptor) {{
                                            reqConfig = await requestInterceptor(reqConfig) || reqConfig;
                                        }}
                                        let fullUrl = reqConfig.url;
                                        if (reqConfig.params && Object.keys(reqConfig.params).length > 0) {{
                                            const query = new URLSearchParams(reqConfig.params).toString();
                                            fullUrl += (fullUrl.includes('?') ? '&' : '?') + query;
                                        }}
                                        const resp = await fetch(fullUrl, {{
                                            method: 'GET',
                                            headers: reqConfig.headers,
                                            credentials: 'include'
                                        }});
                                        const data = await resp.json();
                                        return {{ data }};
                                    }}
                                }};
                                window.extendClient(window.myAxios);
                            }}

                            const [path, queryString] = '{}'.split('?');
                            const queryParams = {{}};
                            if (queryString) {{
                                const searchParams = new URLSearchParams(queryString);
                                for (const [key, value] of searchParams.entries()) {{
                                    queryParams[key] = value;
                                }}
                            }}

                            let res = await window.myAxios.get(path, {{ params: queryParams }});
                            return JSON.stringify(res.data);
                        }} catch (e) {{
                            return JSON.stringify({{ error: e.message }});
                        }}
                    }})()"#,
                    url
                );
                let user_agent = {
                    let guard = self.cf_client.read().await;
                    if let Some(cf) = guard.as_ref() {
                        cf.user_agent().await
                    } else {
                        None
                    }
                };

                let res = app
                    .android_saf()
                    .evaluate_javascript(format!("{}/filter", BASE_URL), js, user_agent)
                    .map_err(|e| ShioriError::Other(e.to_string()))?;

                // Check if the response is an error JSON from our catch block
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&res) {
                    if let Some(err_msg) = v.get("error").and_then(|e| e.as_str()) {
                        return Err(ShioriError::Other(format!(
                            "MangaFire JS error: {}",
                            err_msg
                        )));
                    }
                }
                return Ok(res);
            }
        }

        #[cfg(not(target_os = "android"))]
        {
            // Windowless fast path: CfClient::get_xhr sends the XHR headers
            // (X-Requested-With + sec-fetch-mode) mangafire's API expects plus
            // stored user-solved cf_clearance cookies, so a valid session
            // often answers without any JS. Only succeeds when a session
            // exists; otherwise falls through to the webview RPC below.
            if let Some(cf) = self.cf_client.read().await.as_ref() {
                match cf
                    .get_xhr(url, "application/json, text/javascript, */*; q=0.01")
                    .await
                {
                    Ok(s) => {
                        // Never trust a challenge page as data.
                        let t = s.trim_start();
                        if !t.starts_with('<') && !s.contains("Just a moment") && !s.contains("challenge-platform") {
                            return Ok(s);
                        }
                        log::warn!("[source:mangafire] get_xhr returned a challenge page, falling back to RPC");
                    }
                    Err(e) => {
                        let msg = e.to_string();
                        // A Cloudflare block here means the webview RPC would
                        // hit the same wall (challenge can't complete) — fail
                        // fast with the friendly error instead of burning the
                        // RPC's 15s challenge wait.
                        if msg.contains("Cloudflare") || msg.contains("blocking") {
                            return Err(SourceError::CloudflareChallenge.into());
                        }
                        log::warn!("[source:mangafire] get_xhr failed ({}), falling back to RPC", e);
                    }
                }
            }

            let js = format!(
                r#"
                const [path, queryString] = '{}'.split('?');
                const queryParams = {{}};
                if (queryString) {{
                    const searchParams = new URLSearchParams(queryString);
                    for (const [key, value] of searchParams.entries()) {{
                        queryParams[key] = value;
                    }}
                }}
                let res = await window.myAxios.get(path, {{ params: queryParams }});
                return res.data;
            "#,
                url
            );
            return self.evaluate_js_on_site(&js).await;
        }

        #[allow(unreachable_code)]
        Err(ShioriError::Other(
            "Browser RPC not initialized for MangaFire".into(),
        ))
    }
}

#[derive(Debug, Deserialize)]
struct MfSearchResponse {
    items: Vec<MfSearchItem>,
}

#[derive(Debug, Deserialize)]
struct MfSearchItem {
    hid: String,
    slug: String,
    title: String,
    poster: Option<MfPoster>,
}

#[derive(Debug, Deserialize)]
struct MfPoster {
    large: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct MfChaptersResponse {
    items: Vec<MfChapterItem>,
    meta: Option<MfMeta>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct MfMeta {
    last_page: u32,
}

#[derive(Debug, Deserialize)]
struct MfChapterItem {
    id: u64,
    number: f32,
    name: String,
    language: String,
}

#[derive(Debug, Deserialize)]
struct MfPageResponse {
    data: MfPageData,
}

#[derive(Debug, Deserialize)]
struct MfPageData {
    pages: Vec<MfPageItem>,
}

#[derive(Debug, Deserialize)]
struct MfPageItem {
    url: String,
}

/// Fetches every chapter page for a title by calling `fetch_one(page)`.
///
/// Page 1 is fetched first because its `meta.lastPage` reveals the page count;
/// the remaining pages are then fetched concurrently in chunks of
/// [`PAGE_FETCH_CONCURRENCY`], preserving page order. Error behavior mirrors the
/// original sequential loop: a page-1 fetch error is fatal, while a later-page
/// fetch error stops pagination and returns whatever was collected so far.
async fn fetch_all_chapter_items<'a, F>(fetch_one: F) -> Result<Vec<MfChapterItem>>
where
    F: Fn(u32) -> BoxFuture<'a, Result<String>> + 'a,
{
    let first_json = fetch_one(1).await?;
    let first: MfChaptersResponse = serde_json::from_str(&first_json).map_err(|e| {
        ShioriError::Other(format!("Failed to parse MangaFire chapters JSON: {}", e))
    })?;

    let mut all_items = first.items;
    let last_page = first.meta.as_ref().map(|m| m.last_page).unwrap_or(1).max(1);
    if last_page <= 1 {
        return Ok(all_items);
    }

    let pages: Vec<u32> = (2..=last_page).collect();
    for chunk in pages.chunks(PAGE_FETCH_CONCURRENCY) {
        let futs: Vec<BoxFuture<'a, Result<String>>> =
            chunk.iter().map(|&p| fetch_one(p)).collect();
        let results = futures::future::join_all(futs).await;
        for result in results {
            let json = match result {
                Ok(j) => j,
                // Later-page fetch error: keep what we already have (original behavior).
                Err(_) => return Ok(all_items),
            };
            let res: MfChaptersResponse = serde_json::from_str(&json).map_err(|e| {
                ShioriError::Other(format!("Failed to parse MangaFire chapters JSON: {}", e))
            })?;
            all_items.extend(res.items);
        }
    }

    Ok(all_items)
}

/// Converts raw chapter items into `Chapter`s (EN-only, deduplicated by number).
fn build_chapters(content_id: &str, items: Vec<MfChapterItem>) -> Vec<Chapter> {
    let mut chapters = Vec::new();
    for item in items {
        if item.language != "en" {
            continue;
        }

        let chap_id = item.id.to_string();
        let title = if item.name.trim().is_empty() {
            format!("Chapter {}", item.number)
        } else {
            item.name
        };

        chapters.push(Chapter {
            id: chap_id,
            title,
            number: item.number,
            volume: None,
            uploaded_at: None, // Could parse if needed, but not critical
            source_id: "mangafire".to_string(),
            content_id: content_id.to_string(),
        });
    }

    // Return deduplicated chapters (sometimes multiple groups upload same number)
    let mut unique_chapters: Vec<Chapter> = Vec::new();
    let mut seen_numbers = std::collections::HashSet::new();
    for ch in chapters {
        let num_str = ch.number.to_string();
        if !seen_numbers.contains(&num_str) {
            seen_numbers.insert(num_str);
            unique_chapters.push(ch);
        }
    }

    unique_chapters
}

#[async_trait]
impl Source for MangaFireSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "mangafire".to_string(),
            name: "MangaFire".to_string(),
            base_url: BASE_URL.to_string(),
            version: "1.0.0".to_string(),
            content_type: ContentType::Manga,
            supports_search: true,
            supports_download: true,
            requires_api_key: false,
            nsfw: false,
        }
    }

    /// Cheap reachability probe: no session in the CfClient store → `Unknown`
    /// (badge must not claim availability before Verify). Otherwise one XHR
    /// against the API root; the 15s command timeout in `source_health`
    /// already wraps this call, so no extra timeout machinery here.
    async fn health_check(&self) -> Result<SourceHealth> {
        let cf = match self.cf_client.read().await.as_ref() {
            Some(c) => c.clone(),
            None => return Ok(SourceHealth::Unknown),
        };
        if !cf.has_session() {
            return Ok(SourceHealth::Unknown);
        }
        let url = format!("{}/api/titles?keyword=health-check&page=1&limit=1", cf.base_url());
        match cf.get_xhr(&url, "application/json").await {
            Ok(_) => Ok(SourceHealth::Available),
            Err(e) => {
                let msg = e.to_string();
                if msg.contains("Cloudflare") || msg.contains("blocking") {
                    Ok(SourceHealth::Blocked)
                } else {
                    Ok(SourceHealth::Unavailable)
                }
            }
        }
    }

    async fn search(&self, query: &str, _page: u32) -> Result<Vec<SearchResult>> {
        log::info!("[source:mangafire] search started (query={})", query);
        // URL encode the query
        let encoded_query = urlencoding::encode(query);
        let url = format!("/api/titles?keyword={}&page=1&limit=50", encoded_query);

        let json_str = match self.fetch_rpc(&url).await {
            Ok(s) => s,
            Err(e) => {
                log::warn!("[source:mangafire] search failed: {e}");
                return Err(e);
            }
        };
        let res: MfSearchResponse = serde_json::from_str(&json_str).map_err(|e| {
            ShioriError::Other(format!(
                "Failed to parse MangaFire search JSON: {} - raw: {}",
                e, json_str
            ))
        })?;

        let mut results = Vec::new();
        for item in res.items {
            let cover_url = item.poster.and_then(|p| p.large);
            // We encode hid and slug in the ID so we can use it in get_chapters
            let id = format!("{}|{}", item.hid, item.slug);

            results.push(SearchResult {
                id,
                title: item.title,
                cover_url,
                description: None,
                source_id: "mangafire".to_string(),
                extra: HashMap::new(),
            });
        }

        log::info!("[source:mangafire] search completed ({} results)", results.len());
        Ok(results)
    }

    async fn browse(
        &self,
        mode: &str,
        page: u32,
        _limit: u32,
        _genres: Option<Vec<String>>,
        _types: Option<Vec<String>>,
    ) -> Result<Vec<SearchResult>> {
        let mut base_url = match mode {
            "popular" => format!(
                "/api/titles?order[chapter_updated_at]=desc&hot=1&page={}&limit=30",
                page
            ),
            "latest" | "recent" => format!(
                "/api/titles?order[chapter_updated_at]=desc&page={}&limit=30",
                page
            ),
            _ => format!(
                "/api/titles?order[chapter_updated_at]=desc&page={}&limit=30",
                page
            ),
        };

        if let Some(genres) = _genres {
            if !genres.is_empty() {
                let slugs: Vec<String> = genres
                    .into_iter()
                    .map(|g| g.to_lowercase().replace(" ", "-"))
                    .collect();
                base_url.push_str(&format!("&genre={}", slugs.join(",")));
            }
        }

        if let Some(types) = _types {
            if !types.is_empty() {
                let slugs: Vec<String> = types
                    .into_iter()
                    .map(|t| t.to_lowercase().replace(" ", "-"))
                    .collect();
                base_url.push_str(&format!("&type={}", slugs.join(",")));
            }
        }

        let url = base_url;

        let json_str = match self.fetch_rpc(&url).await {
            Ok(s) => s,
            Err(e) => {
                log::warn!("[source:mangafire] browse failed: {e}");
                return Err(e);
            }
        };
        let res: MfSearchResponse = serde_json::from_str(&json_str).map_err(|e| {
            ShioriError::Other(format!(
                "Failed to parse MangaFire browse JSON: {} - raw: {}",
                e, json_str
            ))
        })?;

        let mut results = Vec::new();
        for item in res.items {
            let cover_url = item.poster.and_then(|p| p.large);
            let id = format!("{}|{}", item.hid, item.slug);

            results.push(SearchResult {
                id,
                title: item.title,
                cover_url,
                description: None,
                source_id: "mangafire".to_string(),
                extra: HashMap::new(),
            });
        }

        log::info!("[source:mangafire] browse completed ({} results)", results.len());
        Ok(results)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        log::info!("[source:mangafire] get_chapters started (content={})", content_id);
        let parts: Vec<&str> = content_id.split('|').collect();
        if parts.len() != 2 {
            return Err(ShioriError::Other(
                "Invalid MangaFire content ID".to_string(),
            ));
        }
        let hid = parts[0].to_string();

        cache_get_or_fetch(&self.chapter_cache, content_id, CHAPTER_CACHE_TTL, async {
            let items = fetch_all_chapter_items(|page| {
                let url = format!(
                    "/api/titles/{}/chapters?language=en&sort=number&order=desc&page={}&limit=200",
                    hid, page
                );
                Box::pin(async move { self.fetch_rpc(&url).await })
            })
            .await
            .map_err(|e| {
                log::warn!("[source:mangafire] get_chapters failed: {e}");
                e
            })?;
            Ok(build_chapters(content_id, items))
        })
        .await
        .map(|chapters| {
            log::info!("[source:mangafire] get_chapters completed ({} chapters)", chapters.len());
            chapters
        })
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        log::info!("[source:mangafire] get_pages started (chapter={})", chapter_id);
        cache_get_or_fetch(&self.pages_cache, chapter_id, PAGES_CACHE_TTL, async {
            // chapter_id is just the id (e.g., 7285952)
            let url = format!("/api/chapters/{}", chapter_id);

            let json_str = match self.fetch_rpc(&url).await {
                Ok(s) => s,
                Err(e) => {
                    log::warn!("[source:mangafire] get_pages failed: {e}");
                    return Err(e);
                }
            };
            let res: MfPageResponse = serde_json::from_str(&json_str).map_err(|e| {
                ShioriError::Other(format!(
                    "Failed to parse MangaFire pages JSON: {} - raw: {}",
                    e, json_str
                ))
            })?;

            let mut pages = Vec::new();
            for (i, p) in res.data.pages.into_iter().enumerate() {
                pages.push(Page {
                    index: i as u32,
                    url: p.url,
                });
            }

            Ok(pages)
        })
        .await
        .map(|pages| {
            log::info!("[source:mangafire] get_pages completed ({} pages)", pages.len());
            pages
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sources::cache::{evict_oldest_if_over_cap, CACHE_MAX_ENTRIES};
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn rpc_turnstile_error_maps_to_cloudflare_challenge() {
        let e = ShioriError::Other(
            "MangaFire RPC JS error: Cloudflare Turnstile challenge pending - please solve via Settings or retry"
                .into(),
        );
        let mapped = map_rpc_error(e);
        assert_eq!(
            mapped.to_string(),
            SourceError::CloudflareChallenge.user_message()
        );
    }

    #[test]
    fn rpc_cloudflare_message_maps_to_cloudflare_challenge() {
        let e = ShioriError::Other("MangaFire RPC JS error: Cloudflare block".into());
        let mapped = map_rpc_error(e);
        assert_eq!(
            mapped.to_string(),
            SourceError::CloudflareChallenge.user_message()
        );
    }

    #[test]
    fn rpc_unrelated_errors_pass_through() {
        let original = "MangaFire RPC timed out";
        let mapped = map_rpc_error(ShioriError::Other(original.into()));
        assert_eq!(mapped.to_string(), format!("{}", original));

        let original2 = "extendClient not found";
        let mapped2 = map_rpc_error(ShioriError::Other(original2.into()));
        assert_eq!(mapped2.to_string(), format!("{}", original2));
    }

    fn chapter(id: &str, title: &str) -> Chapter {
        Chapter {
            id: id.to_string(),
            title: title.to_string(),
            number: 1.0,
            volume: None,
            uploaded_at: None,
            source_id: "mangafire".to_string(),
            content_id: "hid|slug".to_string(),
        }
    }

    fn page_body(page: u32, last_page: Option<u32>) -> String {
        match last_page {
            Some(lp) => format!(
                r#"{{"items":[{{"id":{},"number":{},"name":"ch{}","language":"en"}}],"meta":{{"lastPage":{}}}}}"#,
                page, page, page, lp
            ),
            None => format!(
                r#"{{"items":[{{"id":{},"number":{},"name":"ch{}","language":"en"}}]}}"#,
                page, page, page
            ),
        }
    }

    #[tokio::test]
    async fn fetch_all_chapter_items_fetches_all_pages_in_order() {
        let items = fetch_all_chapter_items(|page| {
            let body = page_body(page, Some(3));
            Box::pin(async move { Ok(body) })
        })
        .await
        .unwrap();

        let ids: Vec<u64> = items.iter().map(|i| i.id).collect();
        assert_eq!(ids, vec![1, 2, 3]);
    }

    #[tokio::test]
    async fn fetch_all_chapter_items_fetches_pages_concurrently() {
        let in_flight = Arc::new(AtomicUsize::new(0));
        let max_in_flight = Arc::new(AtomicUsize::new(0));

        let items = fetch_all_chapter_items(|page| {
            let in_flight = in_flight.clone();
            let max_in_flight = max_in_flight.clone();
            Box::pin(async move {
                let now = in_flight.fetch_add(1, Ordering::SeqCst) + 1;
                max_in_flight.fetch_max(now, Ordering::SeqCst);
                tokio::time::sleep(Duration::from_millis(30)).await;
                in_flight.fetch_sub(1, Ordering::SeqCst);
                Ok(page_body(page, Some(4)))
            })
        })
        .await
        .unwrap();

        assert_eq!(items.len(), 4);
        assert!(
            max_in_flight.load(Ordering::SeqCst) >= 2,
            "expected concurrent page fetches, max in-flight was {}",
            max_in_flight.load(Ordering::SeqCst)
        );
    }

    #[tokio::test]
    async fn fetch_all_chapter_items_page_one_error_is_fatal() {
        let res = fetch_all_chapter_items(|page| {
            Box::pin(async move {
                if page == 1 {
                    Err(ShioriError::Other("boom".into()))
                } else {
                    Ok(page_body(page, Some(2)))
                }
            })
        })
        .await;

        assert!(res.is_err());
    }

    #[tokio::test]
    async fn fetch_all_chapter_items_later_page_error_keeps_earlier_pages() {
        let items = fetch_all_chapter_items(|page| {
            Box::pin(async move {
                match page {
                    1 => Ok(page_body(1, Some(3))),
                    2 => Ok(page_body(2, Some(3))),
                    _ => Err(ShioriError::Other("later page failed".into())),
                }
            })
        })
        .await
        .unwrap();

        let ids: Vec<u64> = items.iter().map(|i| i.id).collect();
        assert_eq!(ids, vec![1, 2]);
    }

    #[tokio::test]
    async fn fetch_all_chapter_items_single_page_when_meta_missing() {
        let pages_fetched = Arc::new(AtomicUsize::new(0));

        let items = fetch_all_chapter_items(|page| {
            let pages_fetched = pages_fetched.clone();
            Box::pin(async move {
                pages_fetched.fetch_add(1, Ordering::SeqCst);
                Ok(page_body(page, None))
            })
        })
        .await
        .unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(pages_fetched.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn cache_fresh_hit_returns_cached_without_refetch() {
        let cache: Mutex<HashMap<String, (Instant, Vec<Chapter>)>> = Mutex::new(HashMap::new());
        let fetch_calls = Arc::new(AtomicUsize::new(0));

        let calls = fetch_calls.clone();
        let v = cache_get_or_fetch(&cache, "a", CHAPTER_CACHE_TTL, async move {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(vec![chapter("1", "One")])
        })
        .await
        .unwrap();
        assert_eq!(v.len(), 1);

        // Second call within TTL must hit the cache, not refetch.
        let calls = fetch_calls.clone();
        let v2 = cache_get_or_fetch(&cache, "a", CHAPTER_CACHE_TTL, async move {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(vec![])
        })
        .await
        .unwrap();

        assert_eq!(v2.len(), 1, "stale fetch must not run on a fresh cache hit");
        assert_eq!(v2[0].title, "One");
        assert_eq!(fetch_calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn cache_expired_entry_is_refetched() {
        let cache: Mutex<HashMap<String, (Instant, Vec<Chapter>)>> = Mutex::new(HashMap::new());
        cache.lock().unwrap().insert(
            "a".to_string(),
            (
                Instant::now() - CHAPTER_CACHE_TTL - Duration::from_secs(1),
                vec![chapter("1", "Stale")],
            ),
        );

        let fetch_calls = Arc::new(AtomicUsize::new(0));
        let calls = fetch_calls.clone();
        let v = cache_get_or_fetch(&cache, "a", CHAPTER_CACHE_TTL, async move {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(vec![chapter("2", "Fresh")])
        })
        .await
        .unwrap();

        assert_eq!(
            fetch_calls.load(Ordering::SeqCst),
            1,
            "expired entry must refetch"
        );
        assert_eq!(v[0].title, "Fresh");

        // And the refreshed value is now served from cache.
        let calls = fetch_calls.clone();
        let v2 = cache_get_or_fetch(&cache, "a", CHAPTER_CACHE_TTL, async move {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(vec![])
        })
        .await
        .unwrap();
        assert_eq!(v2[0].title, "Fresh");
        assert_eq!(fetch_calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn cache_keys_do_not_collide() {
        let cache: Mutex<HashMap<String, (Instant, Vec<Chapter>)>> = Mutex::new(HashMap::new());

        let v = cache_get_or_fetch(&cache, "id-a", CHAPTER_CACHE_TTL, async {
            Ok(vec![chapter("1", "A")])
        })
        .await
        .unwrap();
        assert_eq!(v[0].title, "A");

        // Different key must fetch its own value, not see "id-a"'s entry.
        let v_b = cache_get_or_fetch(&cache, "id-b", CHAPTER_CACHE_TTL, async {
            Ok(vec![chapter("2", "B")])
        })
        .await
        .unwrap();
        assert_eq!(v_b[0].title, "B");

        // "id-a" is still cached under its own key.
        let fetch_calls = Arc::new(AtomicUsize::new(0));
        let calls = fetch_calls.clone();
        let v_a_again = cache_get_or_fetch(&cache, "id-a", CHAPTER_CACHE_TTL, async move {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(vec![])
        })
        .await
        .unwrap();
        assert_eq!(v_a_again[0].title, "A");
        assert_eq!(fetch_calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn cache_errors_are_not_cached() {
        let cache: Mutex<HashMap<String, (Instant, Vec<Chapter>)>> = Mutex::new(HashMap::new());

        let res = cache_get_or_fetch(&cache, "a", CHAPTER_CACHE_TTL, async {
            Err(ShioriError::Other("fetch failed".into()))
        })
        .await;
        assert!(res.is_err());
        assert!(
            cache.lock().unwrap().is_empty(),
            "failed fetches must not be cached"
        );
    }

    #[test]
    fn evict_oldest_removes_only_the_oldest_entry_when_over_cap() {
        // Seed exactly at the cap, with distinct ages (older = smaller i).
        let mut cache: HashMap<String, (Instant, Vec<Chapter>)> = HashMap::new();
        for i in 0..CACHE_MAX_ENTRIES {
            cache.insert(
                format!("k{}", i),
                (
                    Instant::now() - Duration::from_secs((CACHE_MAX_ENTRIES - i) as u64),
                    vec![],
                ),
            );
        }
        assert_eq!(
            evict_oldest_if_over_cap(&mut cache),
            0,
            "at cap: nothing evicted"
        );

        // One more insert pushes it over — the OLDEST (k0) must go.
        cache.insert("newest".to_string(), (Instant::now(), vec![]));
        assert_eq!(evict_oldest_if_over_cap(&mut cache), 1);
        assert_eq!(cache.len(), CACHE_MAX_ENTRIES);
        assert!(!cache.contains_key("k0"), "oldest entry must be evicted");
        assert!(cache.contains_key("k1"), "second-oldest survives");
        assert!(cache.contains_key("newest"), "newest entry survives");
    }

    #[test]
    fn evict_oldest_leaves_entries_within_cap_untouched() {
        let mut cache: HashMap<String, (Instant, Vec<Chapter>)> = HashMap::new();
        for i in 0..CACHE_MAX_ENTRIES - 1 {
            cache.insert(
                format!("k{}", i),
                (Instant::now() - Duration::from_secs(i as u64), vec![]),
            );
        }
        let snapshot: Vec<String> = cache.keys().cloned().collect();

        assert_eq!(evict_oldest_if_over_cap(&mut cache), 0);
        assert_eq!(cache.len(), CACHE_MAX_ENTRIES - 1);
        for k in &snapshot {
            assert!(cache.contains_key(k), "entry {} must be untouched", k);
        }
    }

    #[tokio::test]
    async fn cache_over_cap_evicts_oldest_and_keeps_newest() {
        let cache: Mutex<HashMap<String, (Instant, Vec<Chapter>)>> = Mutex::new(HashMap::new());
        {
            let mut guard = cache.lock().unwrap();
            // Pre-seed at the cap with distinct ages (k0 oldest … k49 newest).
            for i in 0..CACHE_MAX_ENTRIES {
                guard.insert(
                    format!("k{}", i),
                    (
                        Instant::now() - Duration::from_secs((CACHE_MAX_ENTRIES - i) as u64),
                        vec![chapter(&i.to_string(), "Seed")],
                    ),
                );
            }
        }

        let v = cache_get_or_fetch(&cache, "fresh", CHAPTER_CACHE_TTL, async {
            Ok(vec![chapter("99", "Fresh")])
        })
        .await
        .unwrap();
        assert_eq!(v[0].title, "Fresh");

        let guard = cache.lock().unwrap();
        assert_eq!(guard.len(), CACHE_MAX_ENTRIES, "cache must stay at the cap");
        assert!(!guard.contains_key("k0"), "oldest seeded entry evicted");
        assert!(guard.contains_key("k49"), "newest seeded entry retained");
        assert!(guard.contains_key("fresh"), "newly inserted entry retained");
    }
}
