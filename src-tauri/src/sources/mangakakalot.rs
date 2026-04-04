use reqwest::header::{HeaderMap, HeaderValue, REFERER, USER_AGENT};
use scraper::{Html, Selector};
use std::collections::HashMap;
use std::time::Duration;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

const BASE_URL: &str = "https://chapmanganato.to";
const SOURCE_ID: &str = "mangakakalot";

const SEARCH_ITEM_SELECTOR: &str = ".search-story-item, .panel-search-story .search-story-item";
const SEARCH_TITLE_SELECTOR: &str = "h3.item-title a, a.item-title";
const SEARCH_IMAGE_SELECTOR: &str = "a.item-img img, img.img-loading";

const CHAPTER_ITEM_SELECTOR: &str = ".row-content-chapter li.a-h, ul.row-content-chapter li";
const CHAPTER_LINK_SELECTOR: &str = "a.chapter-name, a";
const CHAPTER_TIME_SELECTOR: &str = "span.chapter-time, span";

const PAGE_IMAGE_SELECTOR: &str = ".container-chapter-reader img, .vung-doc img, .container-chapter-reader picture img";

const USER_AGENTS: [&str; 2] = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
];

pub struct MangakakalotSource {
    client: reqwest::Client,
}

impl MangakakalotSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create Mangakakalot client: {}", e)))?;
        Ok(Self { client })
    }

    fn absolute_url(path_or_url: &str) -> String {
        if path_or_url.starts_with("http://") || path_or_url.starts_with("https://") {
            path_or_url.to_string()
        } else if path_or_url.starts_with('/') {
            format!("{}{}", BASE_URL, path_or_url)
        } else {
            format!("{}/{}", BASE_URL, path_or_url)
        }
    }

    fn detect_cloudflare_block(status: reqwest::StatusCode, html: &str) -> bool {
        if status == reqwest::StatusCode::FORBIDDEN
            || status == reqwest::StatusCode::TOO_MANY_REQUESTS
            || status == reqwest::StatusCode::SERVICE_UNAVAILABLE
            || status == reqwest::StatusCode::GATEWAY_TIMEOUT
        {
            return true;
        }

        let lower = html.to_ascii_lowercase();
        lower.contains("cloudflare")
            || lower.contains("just a moment")
            || lower.contains("cf-browser-verification")
            || lower.contains("cf-chl")
            || lower.contains("checking your browser")
    }

    fn cloudflare_error(context: &str) -> ShioriError {
        ShioriError::Other(format!(
            "Mangakakalot {} blocked by Cloudflare. Please retry later or use a browser-backed session.",
            context
        ))
    }

    async fn get_with_headers(&self, url: &str, ua_index: usize) -> Result<(reqwest::StatusCode, String)> {
        let mut headers = HeaderMap::new();
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(USER_AGENTS[ua_index % USER_AGENTS.len()])
                .map_err(|e| ShioriError::Other(format!("Invalid UA header: {}", e)))?,
        );
        headers.insert(REFERER, HeaderValue::from_static("https://chapmanganato.to/"));

        let response = self
            .client
            .get(url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Mangakakalot request failed: {}", e)))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("Mangakakalot response parse failed: {}", e)))?;

        Ok((status, body))
    }

    async fn get_html_retry(&self, url: &str) -> Result<String> {
        let first = self.get_with_headers(url, 0).await?;
        if !Self::detect_cloudflare_block(first.0, &first.1) {
            return Ok(first.1);
        }

        let second = self.get_with_headers(url, 1).await?;
        if Self::detect_cloudflare_block(second.0, &second.1) {
            return Err(Self::cloudflare_error("request"));
        }

        Ok(second.1)
    }

    fn extract_chapter_number(text: &str) -> f32 {
        let lowered = text.to_ascii_lowercase();
        let from = lowered.find("chapter").map(|idx| idx + "chapter".len()).unwrap_or(0);
        let mut num = String::new();
        for c in text[from..].chars() {
            if c.is_ascii_digit() || c == '.' {
                num.push(c);
            } else if !num.is_empty() {
                break;
            }
        }
        num.parse::<f32>().unwrap_or(0.0)
    }
}

#[async_trait::async_trait]
impl Source for MangakakalotSource {
    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: SOURCE_ID.to_string(),
            name: "Mangakakalot".to_string(),
            base_url: BASE_URL.to_string(),
            version: "1.0.0".to_string(),
            content_type: ContentType::Manga,
            supports_search: true,
            supports_download: true,
            requires_api_key: false,
            nsfw: true,
        }
    }

    async fn search(&self, query: &str, _page: u32) -> Result<Vec<SearchResult>> {
        let q = query.trim();
        if q.is_empty() {
            return Ok(Vec::new());
        }

        let url = format!("{}/search/story/{}", BASE_URL, urlencoding::encode(q));
        let html = self.get_html_retry(&url).await?;
        let doc = Html::parse_document(&html);

        let item_sel = Selector::parse(SEARCH_ITEM_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let title_sel = Selector::parse(SEARCH_TITLE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let image_sel = Selector::parse(SEARCH_IMAGE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let mut out = Vec::new();
        for item in doc.select(&item_sel) {
            let title_el = item.select(&title_sel).next();
            let title = title_el
                .as_ref()
                .map(|e| e.text().collect::<String>().trim().to_string())
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| "Untitled".to_string());

            let href = title_el
                .and_then(|e| e.value().attr("href"))
                .map(Self::absolute_url);

            let id = href
                .as_ref()
                .and_then(|h| h.trim_end_matches('/').split('/').next_back())
                .unwrap_or_default()
                .to_string();

            if id.is_empty() {
                continue;
            }

            let cover_url = item
                .select(&image_sel)
                .next()
                .and_then(|img| {
                    img.value()
                        .attr("src")
                        .or_else(|| img.value().attr("data-src"))
                        .or_else(|| img.value().attr("data-original"))
                })
                .map(Self::absolute_url);

            out.push(SearchResult {
                id,
                title,
                cover_url,
                description: href,
                source_id: SOURCE_ID.to_string(),
                extra: HashMap::new(),
            });
        }

        Ok(out)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        let url = if content_id.starts_with("http://") || content_id.starts_with("https://") {
            content_id.to_string()
        } else {
            format!("{}/{}", BASE_URL, content_id.trim_start_matches('/'))
        };

        let html = self.get_html_retry(&url).await?;
        let doc = Html::parse_document(&html);

        let item_sel = Selector::parse(CHAPTER_ITEM_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let link_sel = Selector::parse(CHAPTER_LINK_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let time_sel = Selector::parse(CHAPTER_TIME_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let mut chapters = Vec::new();
        for item in doc.select(&item_sel) {
            let Some(a) = item.select(&link_sel).next() else {
                continue;
            };

            let href = a.value().attr("href").map(Self::absolute_url).unwrap_or_default();
            if href.is_empty() {
                continue;
            }

            let title = a.text().collect::<String>().trim().to_string();
            let uploaded_at = item
                .select(&time_sel)
                .next()
                .map(|t| t.text().collect::<String>().trim().to_string())
                .filter(|s| !s.is_empty());

            chapters.push(Chapter {
                id: href,
                title: if title.is_empty() { "Chapter".to_string() } else { title.clone() },
                number: Self::extract_chapter_number(&title),
                volume: None,
                uploaded_at,
                source_id: SOURCE_ID.to_string(),
                content_id: content_id.to_string(),
            });
        }

        if chapters.is_empty() {
            return Err(ShioriError::Other(format!(
                "No chapters found for '{}'. The page layout may have changed or access is blocked.",
                content_id
            )));
        }

        Ok(chapters)
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let url = if chapter_id.starts_with("http://") || chapter_id.starts_with("https://") {
            chapter_id.to_string()
        } else {
            Self::absolute_url(chapter_id)
        };

        let html = self.get_html_retry(&url).await?;
        let doc = Html::parse_document(&html);

        let img_sel = Selector::parse(PAGE_IMAGE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let pages: Vec<Page> = doc
            .select(&img_sel)
            .enumerate()
            .filter_map(|(index, img)| {
                img.value()
                    .attr("src")
                    .or_else(|| img.value().attr("data-src"))
                    .or_else(|| img.value().attr("data-original"))
                    .map(|u| u.trim().to_string())
                    .filter(|u| !u.is_empty() && !u.starts_with("data:"))
                    .map(|u| Page {
                        index: index as u32,
                        url: Self::absolute_url(&u),
                    })
            })
            .collect();

        if pages.is_empty() {
            return Err(ShioriError::Other(format!(
                "No reader images found for '{}'. The chapter may be unavailable or protected.",
                chapter_id
            )));
        }

        Ok(pages)
    }
}
