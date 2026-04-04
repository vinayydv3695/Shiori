use reqwest::header::{HeaderMap, HeaderValue, REFERER, USER_AGENT};
use scraper::{Html, Selector};
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

const BASE_URL: &str = "https://mangafire.to";
const SEARCH_SELECTOR: &str = ".original.card-lg .unit .inner";
const TITLE_SELECTOR: &str = ".info > a";
const IMAGE_SELECTOR: &str = ".poster img";
const CHAPTER_SELECTOR: &str = "li.item[data-number]";
const PAGE_SELECTOR: &str = ".page-img img, .chapter-imgs img";

const USER_AGENTS: [&str; 3] = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];

pub struct MangaFireSource {
    client: reqwest::Client,
}

#[derive(Debug, Deserialize)]
struct AjaxHtmlResponse {
    result: String,
}

impl MangaFireSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create MangaFire client: {}", e)))?;
        Ok(Self { client })
    }

    async fn get_with_ua_retry(&self, url: &str) -> Result<String> {
        let first = self.get_with_ua(url, 0).await?;
        if first.0 != reqwest::StatusCode::FORBIDDEN && !Self::is_cloudflare_challenge(&first.1) {
            return Ok(first.1);
        }

        let second = self.get_with_ua(url, 1).await?;
        if second.0 == reqwest::StatusCode::FORBIDDEN || Self::is_cloudflare_challenge(&second.1) {
            return Err(ShioriError::Other(
                "MangaFire request was blocked by Cloudflare challenge. Please retry later or use a browser-backed source session."
                    .to_string(),
            ));
        }

        Ok(second.1)
    }

    fn is_cloudflare_challenge(body: &str) -> bool {
        let lower = body.to_ascii_lowercase();
        lower.contains("cloudflare")
            && (lower.contains("challenge")
                || lower.contains("checking your browser")
                || lower.contains("cf-chl")
                || lower.contains("cf-browser-verification"))
    }

    fn to_absolute_url(path_or_url: &str) -> String {
        if path_or_url.starts_with("http") {
            path_or_url.to_string()
        } else {
            format!("{}{}", BASE_URL, path_or_url)
        }
    }

    fn extract_hid_from_content_id(content_id: &str) -> Option<String> {
        let slug = content_id
            .trim_end_matches('/')
            .split('/')
            .next_back()
            .unwrap_or(content_id);

        slug.rsplit_once('.').map(|(_, hid)| hid.to_string())
    }

    async fn get_with_ua(&self, url: &str, ua_index: usize) -> Result<(reqwest::StatusCode, String)> {
        let mut headers = HeaderMap::new();
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(USER_AGENTS[ua_index % USER_AGENTS.len()])
                .map_err(|e| ShioriError::Other(format!("Invalid UA header: {}", e)))?,
        );
        headers.insert(
            REFERER,
            HeaderValue::from_static("https://mangafire.to/"),
        );

        let response = self
            .client
            .get(url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaFire request failed: {}", e)))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaFire response parse failed: {}", e)))?;

        Ok((status, body))
    }
}

#[async_trait::async_trait]
impl Source for MangaFireSource {
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
            nsfw: true,
        }
    }

    async fn search(&self, query: &str, _page: u32) -> Result<Vec<SearchResult>> {
        let url = format!("{}/filter?keyword={}", BASE_URL, urlencoding::encode(query));
        let html = self.get_with_ua_retry(&url).await?;
        let doc = Html::parse_document(&html);

        let card_sel = Selector::parse(SEARCH_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let title_sel = Selector::parse(TITLE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let image_sel = Selector::parse(IMAGE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let mut results = Vec::new();
        for card in doc.select(&card_sel) {
            let title_el = card.select(&title_sel).next();
            let title = title_el
                .as_ref()
                .map(|e| e.text().collect::<String>().trim().to_string())
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| "Untitled".to_string());

            let href = title_el
                .and_then(|e| e.value().attr("href"))
                .map(Self::to_absolute_url);

            let id = href
                .as_ref()
                .and_then(|h| h.split('/').next_back())
                .unwrap_or_default()
                .to_string();

            if id.is_empty() {
                continue;
            }

            let cover_url = card
                .select(&image_sel)
                .next()
                .and_then(|img| img.value().attr("src").or_else(|| img.value().attr("data-src")))
                .map(Self::to_absolute_url);

            results.push(SearchResult {
                id,
                title,
                cover_url,
                description: href,
                source_id: "mangafire".to_string(),
                extra: HashMap::new(),
            });
        }

        Ok(results)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        let hid = Self::extract_hid_from_content_id(content_id).ok_or_else(|| {
            ShioriError::Other(format!(
                "Unable to extract MangaFire hid from content id '{}'. Expected slug like 'one-piecee.dkw'.",
                content_id
            ))
        })?;

        let chapter_url = format!("{}/ajax/manga/{}/chapter/en", BASE_URL, hid);
        let raw = self.get_with_ua_retry(&chapter_url).await?;
        let ajax: AjaxHtmlResponse = serde_json::from_str(&raw).map_err(|e| {
            ShioriError::Other(format!(
                "Failed to parse MangaFire chapter AJAX response for hid '{}': {}",
                hid, e
            ))
        })?;

        let doc = Html::parse_fragment(&ajax.result);
        let ch_sel = Selector::parse(CHAPTER_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let a_sel = Selector::parse("a")
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let mut chapters = Vec::new();
        for item in doc.select(&ch_sel) {
            let id = item
                .select(&a_sel)
                .next()
                .and_then(|a| a.value().attr("href"))
                .map(Self::to_absolute_url)
                .unwrap_or_default();
            if id.is_empty() {
                continue;
            }

            let title = item.text().collect::<String>().trim().to_string();
            let number = item
                .value()
                .attr("data-number")
                .and_then(|n| n.parse::<f32>().ok())
                .unwrap_or(0.0);

            chapters.push(Chapter {
                id,
                title: if title.is_empty() { "Chapter".to_string() } else { title },
                number,
                volume: None,
                uploaded_at: None,
                source_id: "mangafire".to_string(),
                content_id: content_id.to_string(),
            });
        }
        Ok(chapters)
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let page_url = if chapter_id.starts_with("http") {
            chapter_id.to_string()
        } else {
            format!("{}/read/{}", BASE_URL, chapter_id)
        };

        // MangaFire's reader usually loads page images via AJAX endpoints protected by
        // dynamic vrf tokens. A complete implementation needs browser/webview-backed
        // execution to derive those tokens. As a fallback, we still try extracting any
        // images already present in the initial HTML.
        let html = self.get_with_ua_retry(&page_url).await?;
        let doc = Html::parse_document(&html);
        let img_sel = Selector::parse(PAGE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let pages: Vec<Page> = doc
            .select(&img_sel)
            .enumerate()
            .filter_map(|(idx, img)| {
                img.value()
                    .attr("src")
                    .or_else(|| img.value().attr("data-src"))
                    .map(|url| Page {
                        index: idx as u32,
                        url: Self::to_absolute_url(url),
                    })
            })
            .collect();

        if pages.is_empty() {
            return Err(ShioriError::Other(format!(
                "Could not extract any manga pages from '{}'. MangaFire likely served an AJAX-only reader requiring vrf token flow.",
                page_url
            )));
        }

        Ok(pages)
    }
}
