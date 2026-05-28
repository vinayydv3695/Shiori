use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

use crate::cloudflare::client::CfClient;
use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

const BASE_URL: &str = "https://www.toongod.org";
const MANGA_PATH: &str = "webtoons";

// Rotate through realistic Chrome user-agents to reduce fingerprinting
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
    client: reqwest::Client,
    config: RwLock<ToonGodConfig>,
    /// Cloudflare-aware client — set after app setup when CF state is available.
    cf_client: RwLock<Option<Arc<CfClient>>>,
}

impl ToonGodSource {
    pub fn new() -> Result<Self> {
        let client = Self::build_client(None)?;
        Ok(Self {
            client,
            config: RwLock::new(ToonGodConfig::default()),
            cf_client: RwLock::new(None),
        })
    }

    /// Attach a Cloudflare-aware client to this source.
    /// Call this after `CloudflareState` is registered so automatic
    /// Playwright solving works transparently.
    pub async fn set_cf_client(&self, cf: Arc<CfClient>) {
        *self.cf_client.write().await = Some(cf);
    }

    pub async fn set_config(&self, config: ToonGodConfig) {
        let mut guard = self.config.write().await;
        *guard = config;
    }

    #[allow(dead_code)]
    pub async fn get_config(&self) -> ToonGodConfig {
        self.config.read().await.clone()
    }

    fn build_client(cf_clearance: Option<&str>) -> Result<reqwest::Client> {
        let ua = USER_AGENTS[0];
        let mut builder = reqwest::Client::builder()
            .user_agent(ua)
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            // Follow redirects (Cloudflare sometimes redirects)
            .redirect(reqwest::redirect::Policy::limited(8))
            // Accept cookies
            .cookie_store(true);

        if let Some(clearance) = cf_clearance {
            // Inject the cf_clearance cookie into the default headers so every
            // request on this client carries it automatically.
            let mut headers = reqwest::header::HeaderMap::new();
            let cookie_val = format!("cf_clearance={}", clearance);
            if let Ok(v) = reqwest::header::HeaderValue::from_str(&cookie_val) {
                headers.insert(reqwest::header::COOKIE, v);
            }
            builder = builder.default_headers(headers);
        }

        builder
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create ToonGod client: {}", e)))
    }

    fn detect_cloudflare_block(status: reqwest::StatusCode, html: &str) -> bool {
        if status == reqwest::StatusCode::FORBIDDEN
            || status == reqwest::StatusCode::SERVICE_UNAVAILABLE
            || status == reqwest::StatusCode::TOO_MANY_REQUESTS
        {
            return true;
        }

        let lower = html.to_lowercase();
        lower.contains("cloudflare")
            || lower.contains("attention required")
            || lower.contains("cf-browser-verification")
            || lower.contains("just a moment")
            || lower.contains("enable javascript")
            || lower.contains("_cf_chl")
            || lower.contains("challenge-platform")
    }

    fn cloudflare_error(context: &str) -> ShioriError {
        ShioriError::Other(format!(
            "ToonGod {} is blocked by Cloudflare. \
            Shiori will automatically open a browser to solve the challenge. \
            If the browser opens and gets stuck, click the \"Verify you are human\" checkbox. \
            You can also trigger the browser manually via Settings → Online Sources → ToonGod → Verify Session. \
            The session is cached for 20+ hours once solved.",
            context
        ))
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

    /// Try FlareSolverr for Cloudflare-protected pages.
    /// Returns Some(html) on success, None if FlareSolverr is not configured.
    async fn try_flaresolverr(&self, url: &str) -> Option<String> {
        let config = self.config.read().await;
        let fs_url = config.flaresolverr_url.as_deref()?.trim_end_matches('/');
        if fs_url.is_empty() {
            return None;
        }
        let endpoint = format!("{}/v1", fs_url);
        let payload = serde_json::json!({
            "cmd": "request.get",
            "url": url,
            "maxTimeout": 60000
        });

        let fs_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(90))
            .build()
            .ok()?;

        let response = fs_client
            .post(&endpoint)
            .json(&payload)
            .send()
            .await
            .ok()?;

        if !response.status().is_success() {
            return None;
        }

        let json: serde_json::Value = response.json().await.ok()?;
        let html = json["solution"]["response"]
            .as_str()?
            .to_string();

        if html.is_empty() { None } else { Some(html) }
    }

    /// Build extra browser-like headers for requests to help bypass basic checks.
    fn browser_headers(referer: Option<&str>) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::ACCEPT,
            reqwest::header::HeaderValue::from_static(
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            ),
        );
        headers.insert(
            reqwest::header::ACCEPT_LANGUAGE,
            reqwest::header::HeaderValue::from_static("en-US,en;q=0.9"),
        );
        headers.insert(
            "sec-fetch-dest",
            reqwest::header::HeaderValue::from_static("document"),
        );
        headers.insert(
            "sec-fetch-mode",
            reqwest::header::HeaderValue::from_static("navigate"),
        );
        headers.insert(
            "sec-fetch-site",
            reqwest::header::HeaderValue::from_static("same-origin"),
        );
        headers.insert(
            "sec-fetch-user",
            reqwest::header::HeaderValue::from_static("?1"),
        );
        headers.insert(
            "upgrade-insecure-requests",
            reqwest::header::HeaderValue::from_static("1"),
        );
        if let Some(ref_url) = referer {
            if let Ok(val) = reqwest::header::HeaderValue::from_str(ref_url) {
                headers.insert(reqwest::header::REFERER, val);
            }
        }
        headers
    }

    async fn fetch_with_referer(&self, url: &str, referer: Option<&str>) -> Result<(reqwest::StatusCode, String)> {
        // 1. Try the Playwright CfClient (automatic browser-session solving).
        if let Some(cf) = self.cf_client.read().await.as_ref() {
            match cf.get_html(url).await {
                Ok(html) => return Ok((reqwest::StatusCode::OK, html)),
                Err(e) => {
                    log::warn!("[ToonGod] CfClient failed for {url}: {e} — falling back to reqwest");
                    // Fall through to the manual cookie path below.
                }
            }
        }

        // 2. Try FlareSolverr if configured.
        if let Some(html) = self.try_flaresolverr(url).await {
            return Ok((reqwest::StatusCode::OK, html));
        }

        // 3. Plain reqwest with manual cf_clearance cookie (legacy fallback).
        let cf_clearance = {
            let config = self.config.read().await;
            config.cf_clearance.clone()
        };
        let client = Self::build_client(cf_clearance.as_deref())
            .unwrap_or_else(|_| self.client.clone());

        let headers = Self::browser_headers(referer.or(Some(BASE_URL)));
        let resp = client
            .get(url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("ToonGod request failed: {}", e)))?;

        let status = resp.status();
        let html = resp
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("ToonGod response read failed: {}", e)))?;

        Ok((status, html))
    }

    async fn try_ajax_chapters(&self, manga_id: &str, manga_url: &str) -> Result<Option<String>> {
        let cf_clearance = {
            let config = self.config.read().await;
            config.cf_clearance.clone()
        };
        let client = Self::build_client(cf_clearance.as_deref())
            .unwrap_or_else(|_| self.client.clone());

        // Try the new AJAX endpoint first
        let ajax_url = format!("{}/ajax/chapters/", manga_url.trim_end_matches('/'));

        let resp = client
            .post(&ajax_url)
            .header("X-Requested-With", "XMLHttpRequest")
            .header(reqwest::header::REFERER, manga_url)
            .header(reqwest::header::ACCEPT, "application/json, text/javascript, */*; q=0.01")
            .send()
            .await;

        if let Ok(r) = resp {
            if r.status().is_success() {
                if let Ok(html) = r.text().await {
                    if !html.is_empty() && html.contains("wp-manga-chapter") {
                        return Ok(Some(html));
                    }
                }
            }
        }

        // Try old admin-ajax endpoint
        let old_ajax_url = format!("{}/wp-admin/admin-ajax.php", BASE_URL);
        let form = [
            ("action", "manga_get_chapters"),
            ("manga", manga_id),
        ];

        let resp = client
            .post(&old_ajax_url)
            .header("X-Requested-With", "XMLHttpRequest")
            .header(reqwest::header::REFERER, manga_url)
            .form(&form)
            .send()
            .await;

        if let Ok(r) = resp {
            if r.status().is_success() {
                if let Ok(html) = r.text().await {
                    if !html.is_empty() && html.contains("wp-manga-chapter") {
                        return Ok(Some(html));
                    }
                }
            }
        }

        Ok(None)
    }
}

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
        let page_path = if page > 1 { format!("page/{}/", page) } else { String::new() };
        let url = format!(
            "{}/{}?s={}&post_type=wp-manga",
            BASE_URL,
            page_path,
            urlencoding::encode(query)
        );

        let (status, html) = self.fetch_with_referer(&url, Some(BASE_URL)).await?;

        if Self::detect_cloudflare_block(status, &html) {
            return Err(Self::cloudflare_error("search"));
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
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        let manga_url = if content_id.starts_with("http") {
            content_id.to_string()
        } else {
            format!("{}/{}/{}/", BASE_URL, MANGA_PATH, content_id)
        };

        let (status, html) = self.fetch_with_referer(&manga_url, Some(BASE_URL)).await?;

        if Self::detect_cloudflare_block(status, &html) {
            return Err(Self::cloudflare_error("chapter list"));
        }

        let manga_id = {
            let doc = Html::parse_document(&html);
            doc.select(&Selector::parse("div.manga-page, div[data-id]").unwrap())
                .next()
                .and_then(|el| el.value().attr("data-id"))
                .map(String::from)
        };

        let chapter_html = if let Some(ref mid) = manga_id {
            self.try_ajax_chapters(mid, &manga_url).await?.unwrap_or(html.clone())
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
                title: if title.is_empty() { format!("Chapter {}", number) } else { title },
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
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let chapter_url = if chapter_id.starts_with("http") {
            if chapter_id.contains('?') {
                format!("{}&style=list", chapter_id)
            } else {
                format!("{}?style=list", chapter_id.trim_end_matches('/'))
            }
        } else {
            Self::absolute_url(chapter_id)
        };

        let (status, html) = self.fetch_with_referer(&chapter_url, Some(BASE_URL)).await?;

        if Self::detect_cloudflare_block(status, &html) {
            return Err(Self::cloudflare_error("chapter pages"));
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
                .filter(|s| !s.contains("data:image") && !s.is_empty())
                .map(|s| s.trim().to_string());

            if let Some(u) = url {
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
            return Err(ShioriError::Other(
                "No pages found. ToonGod may require Cloudflare bypass. Set cf_clearance cookie or FlareSolverr URL in Settings → Online Sources → ToonGod.".to_string()
            ));
        }

        Ok(pages)
    }
}
