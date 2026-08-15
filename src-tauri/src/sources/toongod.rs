use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

use crate::cloudflare::client::CfClient;
use crate::error::{Result, ShioriError};
use crate::sources::cache::cache_get_or_fetch;
use crate::sources::{
    challenge, Chapter, ContentType, Page, SearchResult, Source, SourceError, SourceHealth,
    SourceMeta,
};

const BASE_URL: &str = "https://www.toongod.org";
const MANGA_PATH: &str = "webtoons";

/// How long search results are served from the in-memory cache before refresh.
const SEARCH_CACHE_TTL: Duration = Duration::from_secs(10 * 60);
/// How long chapter lists are served from the in-memory cache before refresh.
const CHAPTERS_CACHE_TTL: Duration = Duration::from_secs(10 * 60);

// Rotate through realistic Chrome user-agents to reduce fingerprinting
#[allow(dead_code)]
const USER_AGENTS: &[&str] = &[
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

// Selectors for Madara theme
const SEARCH_ITEM_SELECTOR: &str = "div.c-tabs-item__content, div.page-item-detail, div.post-title";
const SEARCH_TITLE_LINK_SELECTOR: &str = "h3 a, .post-title a, h4 a";
const SEARCH_IMAGE_SELECTOR: &str = "img";
const CHAPTER_LIST_SELECTOR: &str = "li.wp-manga-chapter";
const CHAPTER_LINK_SELECTOR: &str = "a";
const PAGE_BREAK_SELECTOR: &str = "div.page-break img, .reading-content img, .text-left img";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ToonGodConfig {
    /// Optional cf_clearance cookie value obtained from a browser after solving Cloudflare
    pub cf_clearance: Option<String>,
    /// Optional FlareSolverr URL for automated Cloudflare bypass (e.g. http://localhost:8191)
    pub flaresolverr_url: Option<String>,
}

pub struct ToonGodSource {
    /// Effective base URL: [`BASE_URL`] by default, overridable via the
    /// `TOONGOD_BASE` env var (mirrors mangadex's `MANGADEX_API_BASE`).
    base_url: String,
    config: RwLock<ToonGodConfig>,
    cf_client: RwLock<Option<Arc<CfClient>>>,
    /// `query|page` -> (cached_at, results); TTL [`SEARCH_CACHE_TTL`].
    search_cache: Mutex<HashMap<String, (Instant, Vec<SearchResult>)>>,
    /// content_id -> (cached_at, chapters); TTL [`CHAPTERS_CACHE_TTL`].
    chapters_cache: Mutex<HashMap<String, (Instant, Vec<Chapter>)>>,
}

impl ToonGodSource {
    pub fn new() -> Result<Self> {
        // Base URL override, read once at construction exactly like mangadex
        // reads MANGADEX_API_BASE (`std::env::var(...).unwrap_or_else(...)`).
        // Unset in production → BASE_URL; set by hermetic tests → mock server.
        let base_url = std::env::var("TOONGOD_BASE")
            .unwrap_or_else(|_| BASE_URL.to_string());
        Ok(Self {
            base_url,
            config: RwLock::new(ToonGodConfig::default()),
            cf_client: RwLock::new(None),
            search_cache: Mutex::new(HashMap::new()),
            chapters_cache: Mutex::new(HashMap::new()),
        })
    }

    pub async fn set_cf_client(&self, cf: Arc<CfClient>) {
        *self.cf_client.write().await = Some(cf);
    }

    /// Test-only constructor: wire a real [`CfClient`] (fresh throwaway
    /// session store) to a `base_url` such as a wiremock server. No Tauri
    /// AppHandle is involved, so the webview `evaluate_js` fallback is
    /// unavailable on this instance — fine for offline tests, which only
    /// exercise the CfClient fetch path.
    pub async fn new_with_cf_client(base_url: &str) -> Result<Self> {
        let store = crate::cloudflare::session::SessionStore::new(
            std::env::temp_dir().join("shiori-cf-mock-sessions"),
        )?;
        let cf = Arc::new(CfClient::new(base_url, store)?);
        let source = Self::new()?;
        *source.cf_client.write().await = Some(cf);
        Ok(source)
    }

    pub async fn set_config(&self, config: ToonGodConfig) {
        let mut guard = self.config.write().await;
        *guard = config;
    }

    #[allow(dead_code)]
    pub async fn get_config(&self) -> ToonGodConfig {
        self.config.read().await.clone()
    }

    fn absolute_url(href: &str) -> String {
        if href.starts_with("http://") || href.starts_with("https://") {
            href.to_string()
        } else if href.starts_with("//") {
            format!("https:{}", href)
        } else if href.starts_with('/') {
            format!("{}{}", BASE_URL, href)
        } else {
            format!("{}/{}", BASE_URL, href)
        }
    }

    fn extract_chapter_number(text: &str) -> f32 {
        let text_lower = text.to_lowercase();

        let patterns = ["chapter ", "ch.", "ch ", "ep.", "ep ", "episode "];
        for pattern in patterns {
            if let Some(idx) = text_lower.find(pattern) {
                let after = &text[idx + pattern.len()..];
                if let Some(num) = Self::parse_number_from_start(after.trim()) {
                    return num;
                }
            }
        }

        Self::parse_number_from_start(text).unwrap_or(0.0)
    }

    fn parse_number_from_start(s: &str) -> Option<f32> {
        let mut buf = String::new();
        let mut has_dot = false;

        for c in s.chars() {
            if c.is_ascii_digit() {
                buf.push(c);
            } else if c == '.' && !has_dot {
                buf.push(c);
                has_dot = true;
            } else if !buf.is_empty() {
                break;
            }
        }

        if buf.is_empty() || buf == "." {
            None
        } else {
            buf.parse::<f32>().ok()
        }
    }

    fn extract_slug_from_url(url: &str) -> String {
        url.trim_end_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .last()
            .unwrap_or("")
            .to_string()
    }

    /// SSRF guard for the fetch path. Production (`TOONGOD_BASE` unset)
    /// delegates to the crate-wide `validate_fetch_url`. When the base URL
    /// has been overridden (offline tests/CI pointing at a local mock), only
    /// URLs on the override host are fetchable — scraped external URLs stay
    /// blocked, so the override never weakens the guard.
    fn guarded_fetch_url(&self, url: &str) -> Result<()> {
        if std::env::var("TOONGOD_BASE").is_ok() {
            let base_host = url::Url::parse(&self.base_url)
                .ok()
                .and_then(|u| u.host_str().map(|h| h.to_ascii_lowercase()))
                .unwrap_or_default();
            let host = url::Url::parse(url)
                .ok()
                .and_then(|u| u.host_str().map(|h| h.to_ascii_lowercase()))
                .unwrap_or_default();
            if !host.is_empty() && host == base_host {
                return Ok(());
            }
            return Err(ShioriError::Other(format!(
                "Blocked URL (SSRF guard, override host only): {url}"
            )));
        }
        crate::validate_fetch_url(url)
    }

    /// Fetches `url` via plain HTTP carrying the stored user-solved session.
    /// No automated anti-bot machinery: a Cloudflare challenge is DETECTED and
    /// surfaced as [`SourceError::CloudflareChallenge`] — the user verifies
    /// manually via Settings → Verify (cf_solve) if they want to continue.
    async fn fetch_with_referer(
        &self,
        url: &str,
        referer: Option<&str>,
    ) -> Result<(reqwest::StatusCode, String)> {
        self.fetch_with_referer_once(url, referer).await
    }

    async fn fetch_with_referer_once(
        &self,
        url: &str,
        _referer: Option<&str>,
    ) -> Result<(reqwest::StatusCode, String)> {
        // SSRF guard: re-validate scraped URLs before navigating to them.
        self.guarded_fetch_url(url)?;
        let cf = self.cf_client.read().await.clone().ok_or_else(|| {
            ShioriError::Other("ToonGod source CfClient not initialized".into())
        })?;
        // Plain HTTP: CfClient attaches the stored user-solved cf_clearance
        // session and fails on unresolved CF blocks — no auto-solve.
        let bytes = cf
            .request_bytes(reqwest::Method::GET, url, Some("text/html"), None)
            .await
            .map_err(|e| {
                let msg = e.to_string();
                // Map documented CfClient error texts (CF block, HTTP status
                // after retries, timeouts) via the shared classifier.
                if let Some(err) = challenge::status_from_cf_error(&msg) {
                    log::warn!("[source:toongod] CfClient error at {url} → {}", err.kind());
                    return err.into();
                }
                e
            })?;
        let html = String::from_utf8_lossy(&bytes).to_string();
        Ok((reqwest::StatusCode::OK, html))
    }

    async fn try_ajax_chapters(&self, manga_id: &str, manga_url: &str) -> Result<Option<String>> {
        let cf = self.cf_client.read().await.clone().ok_or_else(|| {
            ShioriError::Other("ToonGod source CfClient not initialized".into())
        })?;

        // Try the new AJAX endpoint first. Same body the webview path posted:
        // `manga={manga_id}` (manga_id scraped from the manga page HTML).
        let ajax_url = format!("{}/ajax/chapters/", manga_url.trim_end_matches('/'));
        let body = format!("manga={}", manga_id);
        if let Ok(bytes) = cf
            .request_bytes(
                reqwest::Method::POST,
                &ajax_url,
                Some("application/json, text/javascript, */*; q=0.01"),
                Some(body),
            )
            .await
        {
            let html = String::from_utf8_lossy(&bytes).to_string();
            if !html.is_empty() && html.contains("wp-manga-chapter") {
                return Ok(Some(html));
            }
        }

        // Try old admin-ajax endpoint: `action=manga_get_chapters&manga={manga_id}`
        let old_ajax_url = format!("{}/wp-admin/admin-ajax.php", self.base_url);
        let body_old = format!("action=manga_get_chapters&manga={}", manga_id);
        if let Ok(bytes) = cf
            .request_bytes(reqwest::Method::POST, &old_ajax_url, None, Some(body_old))
            .await
        {
            let html = String::from_utf8_lossy(&bytes).to_string();
            if !html.is_empty() && html.contains("wp-manga-chapter") {
                return Ok(Some(html));
            }
        }

        Ok(None)
    }
}

// ─── Challenge/error classification ──────────────────────────────────────────
// All detection goes through `challenge::detect_challenge(status, body)` and
// `challenge::status_from_cf_error(msg)` so the fetch path and health_check
// agree on what counts as a Cloudflare block, rate limit, etc.

#[async_trait::async_trait]
impl Source for ToonGodSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "toongod".to_string(),
            name: "ToonGod".to_string(),
            base_url: BASE_URL.to_string(),
            version: "2.1.0".to_string(),
            content_type: ContentType::Manga,
            supports_search: true,
            supports_download: true,
            requires_api_key: false,
            nsfw: true,
        }
    }

    async fn search(&self, query: &str, page: u32) -> Result<Vec<SearchResult>> {
        log::info!("[source:toongod] search started (query={}, page={})", query, page);
        let cache_key = format!("{}|{}", query, page);
        let results = cache_get_or_fetch(
            &self.search_cache,
            &cache_key,
            SEARCH_CACHE_TTL,
            async {
                let page_path = if page > 1 {
                    format!("page/{}/", page)
                } else {
                    String::new()
                };
                let url = format!(
                    "{}/{}?s={}&post_type=wp-manga",
                    self.base_url,
                    page_path,
                    urlencoding::encode(query)
                );

                let (status, html) = self.fetch_with_referer(&url, Some(BASE_URL)).await?;

                if let Some(err) = challenge::detect_challenge(status, &html) {
                    log::warn!("[source:toongod] search blocked → {}", err.kind());
                    return Err(err.into());
                }

                let doc = Html::parse_document(&html);
                let item_sel = Selector::parse(SEARCH_ITEM_SELECTOR)
                    .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
                let title_sel = Selector::parse(SEARCH_TITLE_LINK_SELECTOR)
                    .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
                let image_sel = Selector::parse(SEARCH_IMAGE_SELECTOR)
                    .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;

                let mut results = Vec::new();
                let mut seen_ids = std::collections::HashSet::new();

                for item in doc.select(&item_sel) {
                    let title_link = match item.select(&title_sel).next() {
                        Some(el) => el,
                        None => continue,
                    };

                    let href = match title_link.value().attr("href") {
                        Some(h) => Self::absolute_url(h),
                        None => continue,
                    };

                    let id = Self::extract_slug_from_url(&href);
                    if id.is_empty() || seen_ids.contains(&id) {
                        continue;
                    }
                    seen_ids.insert(id.clone());

                    let title = title_link.text().collect::<String>().trim().to_string();
                    if title.is_empty() {
                        continue;
                    }

                    let cover_url = item
                        .select(&image_sel)
                        .next()
                        .and_then(|img| {
                            img.value()
                                .attr("data-src")
                                .or_else(|| img.value().attr("src"))
                                .or_else(|| img.value().attr("data-lazy-src"))
                        })
                        .map(|s| s.split_whitespace().next().unwrap_or(s))
                        .filter(|s| !s.contains("data:image"))
                        .map(|s| Self::absolute_url(s));

                    results.push(SearchResult {
                        id,
                        title,
                        cover_url,
                        description: Some(href.clone()),
                        source_id: "toongod".to_string(),
                        extra: HashMap::from([("url".to_string(), href)]),
                    });
                }

                Ok(results)
            },
        )
        .await
        .map_err(|e| {
            log::warn!("[source:toongod] search failed: {e}");
            e
        })?;
        log::info!("[source:toongod] search completed ({} results)", results.len());
        Ok(results)
    }

    async fn browse(
        &self,
        mode: &str,
        page: u32,
        _limit: u32,
        genres: Option<Vec<String>>,
        _types: Option<Vec<String>>,
    ) -> Result<Vec<SearchResult>> {
        log::info!("[source:toongod] browse started (mode={}, page={})", mode, page);
        let order = match mode.to_lowercase().as_str() {
            "newest" | "added" => "new-manga",
            "updated" => "latest",
            "trending" | "popular" => "trending",
            _ => "latest",
        };

        let page_path = if page > 1 {
            format!("page/{}/", page)
        } else {
            String::new()
        };

        let mut genre_query = String::new();
        let mut genre_idx = 0;

        if let Some(genres) = genres {
            for genre in genres {
                let slug = genre.to_lowercase().replace(" ", "-");
                genre_query.push_str(&format!("&genre[{}]={}", genre_idx, slug));
                genre_idx += 1;
            }
        }

        let url = format!(
            "{}/home/{}?m_orderby={}{}",
            self.base_url, page_path, order, genre_query
        );

        let (status, html) = match self.fetch_with_referer(&url, Some(BASE_URL)).await {
            Ok(v) => v,
            Err(e) => {
                log::warn!("[source:toongod] browse failed: {e}");
                return Err(e);
            }
        };

        if let Some(err) = challenge::detect_challenge(status, &html) {
            log::warn!("[source:toongod] browse blocked → {}", err.kind());
            return Err(err.into());
        }

        let doc = Html::parse_document(&html);
        let item_sel = Selector::parse(SEARCH_ITEM_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let title_sel = Selector::parse(SEARCH_TITLE_LINK_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let image_sel = Selector::parse(SEARCH_IMAGE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;

        let mut results = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        for item in doc.select(&item_sel) {
            let title_link = match item.select(&title_sel).next() {
                Some(el) => el,
                None => continue,
            };

            let href = match title_link.value().attr("href") {
                Some(h) => Self::absolute_url(h),
                None => continue,
            };

            let id = Self::extract_slug_from_url(&href);
            if id.is_empty() || seen_ids.contains(&id) {
                continue;
            }
            seen_ids.insert(id.clone());

            let title = title_link.text().collect::<String>().trim().to_string();
            if title.is_empty() {
                continue;
            }

            let cover_url = item
                .select(&image_sel)
                .next()
                .and_then(|img| {
                    img.value()
                        .attr("data-src")
                        .or_else(|| img.value().attr("src"))
                        .or_else(|| img.value().attr("data-lazy-src"))
                })
                .map(|s| s.split_whitespace().next().unwrap_or(s))
                .filter(|s| !s.contains("data:image"))
                .map(|s| Self::absolute_url(s));

            results.push(SearchResult {
                id,
                title,
                cover_url,
                description: Some(href.clone()),
                source_id: "toongod".to_string(),
                extra: HashMap::from([("url".to_string(), href)]),
            });
        }

        log::info!("[source:toongod] browse completed ({} results)", results.len());
        Ok(results)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        log::info!("[source:toongod] get_chapters started (content={})", content_id);
        let chapters = cache_get_or_fetch(
            &self.chapters_cache,
            content_id,
            CHAPTERS_CACHE_TTL,
            async {
                let manga_url = if content_id.starts_with("http") {
                    content_id.to_string()
                } else {
                    format!("{}/{}/{}/", self.base_url, MANGA_PATH, content_id)
                };

                // SSRF guard: chapter URLs may come from scraped pages; validate first.
                self.guarded_fetch_url(&manga_url)?;
                let (status, html) = self.fetch_with_referer(&manga_url, Some(BASE_URL)).await?;

                if let Some(err) = challenge::detect_challenge(status, &html) {
                    log::warn!("[source:toongod] chapter list blocked → {}", err.kind());
                    return Err(err.into());
                }

                let manga_id = {
                    let doc = Html::parse_document(&html);
                    doc.select(&Selector::parse("div.manga-page, div[data-id]").unwrap())
                        .next()
                        .and_then(|el| el.value().attr("data-id"))
                        .map(String::from)
                };

                let chapter_html = if let Some(ref mid) = manga_id {
                    self.try_ajax_chapters(mid, &manga_url)
                        .await?
                        .unwrap_or(html.clone())
                } else {
                    html.clone()
                };

                let chapter_doc = Html::parse_document(&chapter_html);
                let chapter_sel = Selector::parse(CHAPTER_LIST_SELECTOR)
                    .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
                let link_sel = Selector::parse(CHAPTER_LINK_SELECTOR)
                    .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;

                let mut chapters = Vec::new();

                for li in chapter_doc.select(&chapter_sel) {
                    let link = match li.select(&link_sel).next() {
                        Some(a) => a,
                        None => continue,
                    };

                    let href = match link.value().attr("href") {
                        Some(h) => Self::absolute_url(h),
                        None => continue,
                    };

                    let title = link.text().collect::<String>().trim().to_string();
                    let number = Self::extract_chapter_number(&title);

                    chapters.push(Chapter {
                        id: href.clone(),
                        title: if title.is_empty() {
                            format!("Chapter {}", number)
                        } else {
                            title
                        },
                        number,
                        volume: None,
                        uploaded_at: None,
                        source_id: "toongod".to_string(),
                        content_id: content_id.to_string(),
                    });
                }

                // Chapters are usually in reverse order (newest first), reverse for chronological
                if chapters.len() > 1 {
                    let first_num = chapters.first().map(|c| c.number).unwrap_or(0.0);
                    let last_num = chapters.last().map(|c| c.number).unwrap_or(0.0);
                    if first_num > last_num {
                        chapters.reverse();
                    }
                }

                Ok(chapters)
            },
        )
        .await
        .map_err(|e| {
            log::warn!("[source:toongod] get_chapters failed: {e}");
            e
        })?;
        log::info!("[source:toongod] get_chapters completed ({} chapters)", chapters.len());
        Ok(chapters)
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        log::info!("[source:toongod] get_pages started (chapter={})", chapter_id);
        let chapter_url = if chapter_id.starts_with("http") {
            if chapter_id.contains('?') {
                format!("{}&style=list", chapter_id)
            } else {
                format!("{}?style=list", chapter_id.trim_end_matches('/'))
            }
        } else {
            Self::absolute_url(chapter_id)
        };

        let (status, html) = match self
            .fetch_with_referer(&chapter_url, Some(BASE_URL))
            .await
        {
            Ok(v) => v,
            Err(e) => {
                log::warn!("[source:toongod] get_pages failed: {e}");
                return Err(e);
            }
        };

        if let Some(err) = challenge::detect_challenge(status, &html) {
            log::warn!("[source:toongod] chapter pages blocked → {}", err.kind());
            return Err(err.into());
        }

        let doc = Html::parse_document(&html);
        let img_sel = Selector::parse(PAGE_BREAK_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;

        let mut pages = Vec::new();
        let mut seen_urls = std::collections::HashSet::new();

        for (index, img) in doc.select(&img_sel).enumerate() {
            let url = img
                .value()
                .attr("data-src")
                .or_else(|| img.value().attr("src"))
                .or_else(|| img.value().attr("data-lazy-src"))
                .map(|s| s.split_whitespace().next().unwrap_or(s))
                .filter(|s| !s.contains("data:image") && !s.is_empty())
                .map(|s| s.trim().to_string());

            if let Some(mut u) = url {
                // Strip WordPress thumbnail dimensions like "-175x238" from the end of the filename
                lazy_static::lazy_static! {
                    static ref RE_WP_THUMB: regex::Regex = regex::Regex::new(r"-\d+x\d+(\.(?:jpg|jpeg|png|webp|gif)(?:\?|$))").unwrap();
                }
                u = RE_WP_THUMB.replace(&u, "${1}").to_string();

                let abs_url = Self::absolute_url(&u);
                if !seen_urls.contains(&abs_url) {
                    seen_urls.insert(abs_url.clone());
                    pages.push(Page {
                        index: index as u32,
                        url: abs_url,
                    });
                }
            }
        }

        // Re-index pages sequentially
        for (i, page) in pages.iter_mut().enumerate() {
            page.index = i as u32;
        }

        if pages.is_empty() {
            log::warn!("[source:toongod] get_pages: no pages found for {chapter_id}");
            return Err(ShioriError::Other(
                "No pages found. ToonGod may be blocking this chapter. If a Cloudflare challenge appears, solve it via Settings → Verify Session.".to_string()
            ));
        }

        log::info!("[source:toongod] get_pages completed ({} pages)", pages.len());
        Ok(pages)
    }

    /// Probe reachability with a plain HTTP GET on the webtoons home page.
    /// Challenges map to `Blocked`, rate limits to `RateLimited`.
    async fn health_check(&self) -> Result<SourceHealth> {
        let url = format!("{}/{}", self.base_url, MANGA_PATH);
        match self.fetch_with_referer(&url, Some(BASE_URL)).await {
            Ok((status, html)) => {
                match challenge::detect_challenge(status, &html) {
                    Some(SourceError::CloudflareChallenge) => Ok(SourceHealth::Blocked),
                    Some(SourceError::RateLimited) => Ok(SourceHealth::RateLimited),
                    Some(_) => Ok(SourceHealth::Unavailable),
                    None => Ok(SourceHealth::Available),
                }
            }
            Err(e) => {
                // The fetch path already maps CfClient errors, but keep a
                // belt-and-braces check so health_check agrees with it.
                if matches!(&e, ShioriError::Source(SourceError::CloudflareChallenge))
                    || challenge::status_from_cf_error(&e.to_string())
                        == Some(SourceError::CloudflareChallenge)
                {
                    Ok(SourceHealth::Blocked)
                } else {
                    Ok(SourceHealth::Unavailable)
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn challenge_mapping_403_with_markers_is_cloudflare() {
        let body = "<title>Just a moment...</title> cloudflare challenge-platform";
        assert_eq!(
            challenge::detect_challenge(reqwest::StatusCode::FORBIDDEN, body),
            Some(SourceError::CloudflareChallenge)
        );
        // The CfClient error text maps to the same structured kind.
        assert_eq!(
            challenge::status_from_cf_error(
                "Cloudflare is blocking access to https://www.toongod.org. Shiori cannot bypass it automatically."
            ),
            Some(SourceError::CloudflareChallenge)
        );
    }

    #[test]
    fn challenge_mapping_429_is_rate_limited() {
        assert_eq!(
            challenge::detect_challenge(reqwest::StatusCode::TOO_MANY_REQUESTS, ""),
            Some(SourceError::RateLimited)
        );
    }

    #[test]
    fn challenge_mapping_404_is_not_found() {
        assert_eq!(
            challenge::detect_challenge(reqwest::StatusCode::NOT_FOUND, "nope"),
            Some(SourceError::NotFound)
        );
    }

    #[test]
    fn status_from_cf_error_maps_documented_texts() {
        // "HTTP {status} … after 3 retries" → status classification.
        assert_eq!(
            challenge::status_from_cf_error("HTTP 429 from https://x after 3 retries"),
            Some(SourceError::RateLimited)
        );
        assert_eq!(
            challenge::status_from_cf_error("HTTP 404 from https://x after 3 retries"),
            Some(SourceError::NotFound)
        );
        // "Cloudflare is blocking access to …" → CloudflareChallenge.
        assert_eq!(
            challenge::status_from_cf_error(
                "Cloudflare is blocking access to https://x. Use Verify in Settings."
            ),
            Some(SourceError::CloudflareChallenge)
        );
        // "timed out"/"timeout" → Timeout.
        assert_eq!(
            challenge::status_from_cf_error("Request failed after 3 retries: connect timed out"),
            Some(SourceError::Timeout)
        );
        assert_eq!(
            challenge::status_from_cf_error("operation timed out"),
            Some(SourceError::Timeout)
        );
        // Unrecognized texts map to nothing.
        assert_eq!(challenge::status_from_cf_error("HTTP 9999 weird"), None);
        assert_eq!(challenge::status_from_cf_error("boom"), None);
    }

    #[test]
    fn cf_client_block_message_maps_to_cloudflare_challenge() {
        let e = ShioriError::Other(
            "Cloudflare is blocking access to https://www.toongod.org. Shiori cannot bypass it automatically.".into(),
        );
        let msg = e.to_string();
        assert!(msg.contains("Cloudflare"));
        assert!(msg.contains("blocking access"));
    }
}
