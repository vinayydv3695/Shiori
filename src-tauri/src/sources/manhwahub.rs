//! Manhwahub.com source plugin for Shiori.
//!
//! ManhwaHub (manhwahub.net) source plugin for Shiori
//! around manhwahub.net, which is a standard Madara-theme WordPress manga site.
//!
//! Two `Source` implementations are exposed:
//!  - `ManhwahubManhwaSource`  – SFW manhwa (id: "manhwahub")
//!  - `ManhwahubManhwa18Source` – NSFW manhwa18 (id: "manhwahub18")
//!
//! Both share the same parsing engine via `ManhwahubEngine`.

use scraper::{Html, Selector};
use std::collections::HashMap;
use std::time::Duration;

use crate::error::{Result, ShioriError};
use crate::sources::{
    Chapter, ContentType, Page, SearchResponse, SearchResult, Source, SourceMeta,
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL: &str = "https://manhwahub.net";
/// The Madara post-type slug used in URLs and search queries.
const TOON_PATH: &str = "webtoon";

/// Rotate browser-like User-Agents to avoid simple fingerprint blocks.
const USER_AGENTS: &[&str] = &[
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

// ─── CSS Selectors (Madara theme) ──────────────────────────────────────────────

/// Selectors for listing pages (browse/search)
const SEL_MANGA_ITEM: &str = "div.page-item-detail, div.c-tabs-item__content, .item";
const SEL_MANGA_TITLE: &str = ".post-title a, h3 a, h4 a, .info-item .line-2 a";
const SEL_MANGA_IMAGE: &str = "img";

// Selectors for details page
const SEL_CHAPTER_LI: &str = "li.wp-manga-chapter";
const SEL_CHAPTER_LINK: &str = "a";
const SEL_CHAPTER_DATE: &str = ".chapter-release-date i";

// Selectors for chapter reading page
const SEL_MANGA_DATA_ID: &str =
    "div#manga-chapters-holder[data-id], div.manga-chapters-holder[data-id]";

/// Reader page images
const SEL_PAGE_IMG: &str = "div.page-break img, .reading-content img, .text-left img";

// ─── Shared Engine ─────────────────────────────────────────────────────────────

/// Core scraping engine shared between the SFW and NSFW source instances.
struct ManhwahubEngine {
    client: reqwest::Client,
    /// Category slug used to filter browse/search results.
    /// - `"manhwa"` for the SFW source
    /// - `"manhwa18"` for the NSFW source
    category: &'static str,
}

impl ManhwahubEngine {
    fn new(category: &'static str) -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENTS[0])
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::limited(8))
            .cookie_store(true)
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to build Manhwahub client: {}", e)))?;

        Ok(Self { client, category })
    }

    // ── HTTP helpers ──────────────────────────────────────────────────────────

    fn browser_headers(referer: Option<&str>) -> reqwest::header::HeaderMap {
        let mut h = reqwest::header::HeaderMap::new();
        h.insert(
            reqwest::header::ACCEPT,
            reqwest::header::HeaderValue::from_static(
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            ),
        );
        h.insert(
            reqwest::header::ACCEPT_LANGUAGE,
            reqwest::header::HeaderValue::from_static("en-US,en;q=0.9"),
        );
        h.insert(
            "upgrade-insecure-requests",
            reqwest::header::HeaderValue::from_static("1"),
        );
        if let Some(ref_url) = referer {
            if let Ok(v) = reqwest::header::HeaderValue::from_str(ref_url) {
                h.insert(reqwest::header::REFERER, v);
            }
        }
        h
    }

    async fn fetch(&self, url: &str) -> Result<String> {
        let headers = Self::browser_headers(Some(BASE_URL));
        let resp = self
            .client
            .get(url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Manhwahub fetch failed for {}: {}", url, e)))?;

        if !resp.status().is_success() {
            return Err(ShioriError::Other(format!(
                "Manhwahub returned HTTP {} for {}",
                resp.status(),
                url
            )));
        }

        resp.text()
            .await
            .map_err(|e| ShioriError::Other(format!("Manhwahub read body failed: {}", e)))
    }

    // ── URL helpers ───────────────────────────────────────────────────────────

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

    fn slug_from_url(url: &str) -> String {
        url.trim_end_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .last()
            .unwrap_or("")
            .to_string()
    }

    // ── Chapter-number extractor ──────────────────────────────────────────────

    fn chapter_number(text: &str) -> f32 {
        let lower = text.to_lowercase();
        for pat in &["chapter ", "ch.", "ch ", "ep.", "ep ", "episode "] {
            if let Some(idx) = lower.find(pat) {
                let after = text[idx + pat.len()..].trim();
                if let Some(n) = Self::parse_f32(after) {
                    return n;
                }
            }
        }
        Self::parse_f32(text).unwrap_or(0.0)
    }

    fn parse_f32(s: &str) -> Option<f32> {
        let mut buf = String::new();
        let mut dot = false;
        for c in s.chars() {
            if c.is_ascii_digit() {
                buf.push(c);
            } else if c == '.' && !dot {
                buf.push(c);
                dot = true;
            } else if !buf.is_empty() {
                break;
            }
        }
        if buf.is_empty() || buf == "." {
            None
        } else {
            buf.parse().ok()
        }
    }

    // ── HTML parsing ──────────────────────────────────────────────────────────

    /// Parse manga cards from a Madara listing page.
    fn parse_cards(&self, html: &str, source_id: &str) -> Vec<SearchResult> {
        let doc = Html::parse_document(html);
        let item_sel = match Selector::parse(SEL_MANGA_ITEM) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        let title_sel = Selector::parse(SEL_MANGA_TITLE).unwrap();
        let img_sel = Selector::parse(SEL_MANGA_IMAGE).unwrap();

        let mut results = Vec::new();
        let mut seen = std::collections::HashSet::new();

        for item in doc.select(&item_sel) {
            let title_el = match item.select(&title_sel).next() {
                Some(el) => el,
                None => continue,
            };

            let href = match title_el.value().attr("href") {
                Some(h) => Self::absolute_url(h),
                None => continue,
            };

            let id = Self::slug_from_url(&href);
            if id.is_empty() || seen.contains(&id) {
                continue;
            }
            seen.insert(id.clone());

            let title = title_el.text().collect::<String>().trim().to_string();
            if title.is_empty() {
                continue;
            }

            let cover_url = item
                .select(&img_sel)
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
                id: id.clone(),
                title,
                cover_url,
                description: None,
                source_id: source_id.to_string(),
                extra: HashMap::from([("url".to_string(), href)]),
            });
        }

        results
    }

    // ── Source operations ─────────────────────────────────────────────────────

    /// Search for manga by title or URL. Uses Madara's built-in WordPress search.
    async fn search(&self, query: &str, page: u32, source_id: &str) -> Result<Vec<SearchResult>> {
        // Intercept direct URLs
        if query.starts_with("http") && query.contains("manhwahub.net") {
            let html = match self.fetch(query).await {
                Ok(h) => h,
                Err(e) => {
                    eprintln!("Manhwahub direct URL fetch error: {}", e);
                    return Ok(vec![]);
                }
            };
            
            let doc = Html::parse_document(&html);
            let title_sel = Selector::parse(".post-title h1, .post-title h3").unwrap();
            let img_sel = Selector::parse(".summary_image img").unwrap();
            
            let title = doc.select(&title_sel).next()
                .map(|el| el.text().collect::<String>().trim().to_string())
                .unwrap_or_else(|| "Unknown Title".to_string());
                
            let cover_url = doc.select(&img_sel).next()
                .and_then(|img| {
                    img.value().attr("data-src")
                        .or_else(|| img.value().attr("src"))
                        .or_else(|| img.value().attr("data-lazy-src"))
                })
                .map(|s| Self::absolute_url(s));
                
            let id = Self::slug_from_url(query);
            
            return Ok(vec![SearchResult {
                id,
                title,
                cover_url,
                description: None,
                source_id: source_id.to_string(),
                extra: HashMap::from([("url".to_string(), query.to_string())]),
            }]);
        }

        let page_segment = if page > 1 {
            format!("page/{}/", page)
        } else {
            String::new()
        };

        let url = format!(
            "{}/search/{}?s={}",
            BASE_URL,
            page_segment,
            urlencoding::encode(query)
        );

        let html = match self.fetch(&url).await {
            Ok(h) => h,
            Err(e) => {
                // If search API is broken (500), fallback to guessing the webtoon URL
                let slug = query.to_lowercase().replace(' ', "-").replace(|c: char| !c.is_ascii_alphanumeric() && c != '-', "");
                let fallback_url = format!("{}/webtoon/{}", BASE_URL, slug);
                match self.fetch(&fallback_url).await {
                    Ok(fallback_html) => {
                        // The user found an exact match via slug! Return it immediately
                        let doc = Html::parse_document(&fallback_html);
                        let title_sel = Selector::parse(".post-title h1, .post-title h3").unwrap();
                        let img_sel = Selector::parse(".summary_image img").unwrap();
                        
                        let title = doc.select(&title_sel).next()
                            .map(|el| el.text().collect::<String>().trim().to_string())
                            .unwrap_or_else(|| query.to_string());
                            
                        let cover_url = doc.select(&img_sel).next()
                            .and_then(|img| {
                                img.value().attr("data-src")
                                    .or_else(|| img.value().attr("src"))
                                    .or_else(|| img.value().attr("data-lazy-src"))
                            })
                            .map(|s| Self::absolute_url(s));
                            
                        return Ok(vec![SearchResult {
                            id: slug,
                            title,
                            cover_url,
                            description: None,
                            source_id: source_id.to_string(),
                            extra: HashMap::from([("url".to_string(), fallback_url)]),
                        }]);
                    },
                    Err(_) => {
                        eprintln!("Manhwahub search error: {}", e);
                        return Ok(vec![]);
                    }
                }
            }
        };

        // Check if this is an empty search result page
        if html.contains("No Results Found") || html.contains("nothing found") {
            return Ok(vec![]);
        }

        Ok(self.parse_cards(&html, source_id))
    }

    /// Browse by mode (latest, popular, new).
    async fn browse(
        &self,
        mode: &str,
        page: u32,
        _limit: u32,
        genres: Option<Vec<String>>,
        types: Option<Vec<String>>,
        source_id: &str,
    ) -> Result<Vec<SearchResult>> {
        let order_param = match mode {
            "latest" | "Newest" => "m_orderby=latest",
            "popular" | "trending" => "m_orderby=views",
            "top-rated" | "rating" => "m_orderby=rating",
            "new" | "recent" | "Added" => "m_orderby=new-manga",
            "alphabetic" | "az" => "m_orderby=alphabet",
            "Updated" => "m_orderby=latest",
            "random" | "Random" => "m_orderby=random",
            _ => "m_orderby=latest",
        };

        let page_segment = if page > 1 {
            format!("page/{}/", page)
        } else {
            String::new()
        };

        let mut url = format!(
            "{}/{}?{}",
            BASE_URL, page_segment, order_param
        );

        let mut filter_index = 0;
        
        // Add default category first
        if self.category == "manhwa" {
            // For Manhwahub, we don't always need to pass manhwa explicitly if we have other genres,
            // but the existing logic passed it. Let's append it if no types are provided.
        }

        // Handle Types (map them to genre[] for Madara themes)
        if let Some(t_list) = types {
            for t in t_list {
                url.push_str(&format!("&genre%5B{}%5D={}", filter_index, t.to_lowercase()));
                filter_index += 1;
            }
        } else {
            // Fallback to default category
            url.push_str(&format!("&genre%5B{}%5D={}", filter_index, self.category));
            filter_index += 1;
        }

        // Handle Genres
        if let Some(g_list) = genres {
            for g in g_list {
                let slug = g.to_lowercase().replace(" ", "-");
                url.push_str(&format!("&genre%5B{}%5D={}", filter_index, slug));
                filter_index += 1;
            }
        }

        // Fall back to unfiltered if genre filtering fails
        let html = match self.fetch(&url).await {
            Ok(h) => h,
            Err(e) => {
                let fallback = format!("{}/{}?{}", BASE_URL, page_segment, order_param);
                match self.fetch(&fallback).await {
                    Ok(fb) => fb,
                    Err(fb_err) => return Err(ShioriError::Other(format!("Manhwahub browse failed. URL: {} (Err: {}). Fallback: {} (Err: {})", url, e, fallback, fb_err)))
                }
            }
        };

        Ok(self.parse_cards(&html, source_id))
    }

    /// Fetch chapters for a manga.  `content_id` is either the slug or a full URL.
    async fn get_chapters(&self, content_id: &str, source_id: &str) -> Result<Vec<Chapter>> {
        let manga_url = if content_id.starts_with("http") {
            content_id.to_string()
        } else {
            format!("{}/{}/{}/", BASE_URL, TOON_PATH, content_id)
        };

        let html = self.fetch(&manga_url).await?;

        // Try the modern AJAX endpoint that Madara uses to lazy-load chapters
        let chapter_html = self
            .try_ajax_chapters(&html, &manga_url)
            .await?
            .unwrap_or(html.clone());

        let doc = Html::parse_document(&chapter_html);
        let ch_sel = Selector::parse(SEL_CHAPTER_LI)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let link_sel = Selector::parse(SEL_CHAPTER_LINK)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let date_sel = Selector::parse(SEL_CHAPTER_DATE).ok();

        let mut chapters = Vec::new();

        for li in doc.select(&ch_sel) {
            let link = match li.select(&link_sel).next() {
                Some(a) => a,
                None => continue,
            };

            let href = match link.value().attr("href") {
                Some(h) => Self::absolute_url(h),
                None => continue,
            };

            let raw_title = link.text().collect::<String>().trim().to_string();
            let number = Self::chapter_number(&raw_title);
            let title = if raw_title.is_empty() {
                format!("Chapter {}", number)
            } else {
                raw_title.clone()
            };

            let uploaded_at = date_sel.as_ref().and_then(|ds| {
                li.select(ds)
                    .next()
                    .map(|el| el.text().collect::<String>().trim().to_string())
            });

            chapters.push(Chapter {
                id: href.clone(),
                title,
                number,
                volume: None,
                uploaded_at,
                source_id: source_id.to_string(),
                content_id: content_id.to_string(),
            });
        }

        // Reverse to chronological order if newest-first
        if chapters.len() > 1 {
            let first = chapters.first().map(|c| c.number).unwrap_or(0.0);
            let last = chapters.last().map(|c| c.number).unwrap_or(0.0);
            if first > last {
                chapters.reverse();
            }
        }

        Ok(chapters)
    }

    /// Try to load the chapter list via Madara's AJAX endpoint.
    /// Returns `Some(html)` if successful, `None` if the chapters are already in the page.
    async fn try_ajax_chapters(&self, page_html: &str, manga_url: &str) -> Result<Option<String>> {
        // Extract the manga data-id BEFORE any .await so the non-Send `Html`
        // doc is fully dropped before we cross the async boundary.
        let manga_id: Option<String> = {
            let doc = Html::parse_document(page_html);
            Selector::parse(SEL_MANGA_DATA_ID).ok().and_then(|s| {
                doc.select(&s)
                    .next()
                    .and_then(|el| el.value().attr("data-id"))
                    .map(String::from)
            })
        }; // `doc` is dropped here

        // 1. Try the per-manga /ajax/chapters/ endpoint (newer Madara)
        let ajax_url = format!("{}/ajax/chapters/", manga_url.trim_end_matches('/'));
        let ajax_resp = self
            .client
            .post(&ajax_url)
            .header("X-Requested-With", "XMLHttpRequest")
            .header(reqwest::header::REFERER, manga_url)
            .header(
                reqwest::header::ACCEPT,
                "application/json, text/javascript, */*; q=0.01",
            )
            .send()
            .await;

        if let Ok(r) = ajax_resp {
            if r.status().is_success() {
                if let Ok(html) = r.text().await {
                    if html.contains("wp-manga-chapter") {
                        return Ok(Some(html));
                    }
                }
            }
        }

        // 2. Try the global admin-ajax.php endpoint (older Madara)
        if let Some(ref mid) = manga_id {
            let admin_ajax = format!("{}/wp-admin/admin-ajax.php", BASE_URL);
            let form = [("action", "manga_get_chapters"), ("manga", mid.as_str())];

            let r = self
                .client
                .post(&admin_ajax)
                .header("X-Requested-With", "XMLHttpRequest")
                .header(reqwest::header::REFERER, manga_url)
                .form(&form)
                .send()
                .await;

            if let Ok(resp) = r {
                if resp.status().is_success() {
                    if let Ok(html) = resp.text().await {
                        if html.contains("wp-manga-chapter") {
                            return Ok(Some(html));
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    /// Fetch all reader images for a chapter.  `chapter_id` is a full URL.
    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        // Madara's list-mode URL renders all pages inline (no pagination required)
        let chapter_url = if chapter_id.starts_with("http") {
            if chapter_id.contains('?') {
                format!("{}&style=list", chapter_id)
            } else {
                format!("{}?style=list", chapter_id.trim_end_matches('/'))
            }
        } else {
            Self::absolute_url(chapter_id)
        };

        let html = self.fetch(&chapter_url).await?;

        let doc = Html::parse_document(&html);
        let img_sel = Selector::parse(SEL_PAGE_IMG)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;

        let mut pages = Vec::new();
        let mut seen = std::collections::HashSet::new();

        for img in doc.select(&img_sel) {
            let url_str = img
                .value()
                .attr("data-src")
                .or_else(|| img.value().attr("src"))
                .or_else(|| img.value().attr("data-lazy-src"))
                .filter(|s| !s.contains("data:image") && !s.is_empty())
                .map(|s| s.trim().to_string());

            if let Some(mut u) = url_str {
                // Strip WordPress thumbnail dimensions like "-175x238" from the end of the filename
                lazy_static::lazy_static! {
                    static ref RE_WP_THUMB: regex::Regex = regex::Regex::new(r"-\d+x\d+(\.(?:jpg|jpeg|png|webp|gif)(?:\?|$))").unwrap();
                }
                u = RE_WP_THUMB.replace(&u, "${1}").to_string();

                let abs = Self::absolute_url(&u);
                if seen.insert(abs.clone()) {
                    pages.push(abs);
                }
            }
        }

        if pages.is_empty() {
            return Err(ShioriError::Other(
                "Manhwahub: no page images found. The chapter URL may be incorrect.".to_string(),
            ));
        }

        Ok(pages
            .into_iter()
            .enumerate()
            .map(|(i, url)| Page {
                index: i as u32,
                url,
            })
            .collect())
    }
}

// ─── ManhwahubSource (SFW) ────────────────────────────────────────────────

/// Source for ManhwaHub (manhwahub.net) source plugin for Shiori.
pub struct ManhwahubSource {
    engine: ManhwahubEngine,
}

impl ManhwahubSource {
    pub fn new() -> Result<Self> {
        Ok(Self {
            engine: ManhwahubEngine::new("manhwa")?,
        })
    }
}

#[async_trait::async_trait]
impl Source for ManhwahubSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "manhwahub".to_string(),
            name: "ManhwaHub".to_string(),
            base_url: format!("{}/{}", BASE_URL, TOON_PATH),
            version: "1.0.0".to_string(),
            content_type: ContentType::Manga,
            supports_search: true,
            supports_download: true,
            requires_api_key: false,
            nsfw: false,
        }
    }

    async fn search(&self, query: &str, page: u32) -> Result<Vec<SearchResult>> {
        self.engine.search(query, page, "manhwahub").await
    }

    async fn search_with_meta(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        let items = self.engine.search(query, page, "manhwahub").await?;
        Ok(SearchResponse {
            items,
            total: None,
            offset: None,
            limit: Some(limit),
            diagnostics: None,
        })
    }

    async fn browse(
        &self,
        mode: &str,
        page: u32,
        limit: u32,
        genres: Option<Vec<String>>,
        types: Option<Vec<String>>,
    ) -> Result<Vec<SearchResult>> {
        self.engine.browse(mode, page, limit, genres, types, "manhwahub").await
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        self.engine.get_chapters(content_id, "manhwahub").await
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        self.engine.get_pages(chapter_id).await
    }
}
