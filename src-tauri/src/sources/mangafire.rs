use reqwest::header::{HeaderMap, HeaderValue, REFERER, USER_AGENT};
use scraper::{Html, Selector};
use std::collections::HashMap;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

const BASE_URL: &str = "https://mangafire.to";
const SEARCH_SELECTOR: &str = ".manga-list .unit";
const TITLE_SELECTOR: &str = ".info .title";
const IMAGE_SELECTOR: &str = "img";
const CHAPTER_SELECTOR: &str = "li[data-id]";
const PAGE_SELECTOR: &str = ".page-img img, .chapter-imgs img";

const USER_AGENTS: [&str; 3] = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];

pub struct MangaFireSource {
    client: reqwest::Client,
}

impl MangaFireSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create MangaFire client: {}", e)))?;
        Ok(Self { client })
    }

    async fn get_with_ua_retry(&self, url: &str) -> Result<String> {
        let first = self.get_with_ua(url, 0).await?;
        if first.0 != reqwest::StatusCode::FORBIDDEN {
            return Ok(first.1);
        }

        let second = self.get_with_ua(url, 1).await?;
        if second.0 == reqwest::StatusCode::FORBIDDEN {
            // TODO: implement full CF bypass with cookie jar if 403s persist
            return Err(ShioriError::Other(
                "MangaFire blocked by Cloudflare — try again later".to_string(),
            ));
        }

        Ok(second.1)
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
                .map(|h| {
                    if h.starts_with("http") {
                        h.to_string()
                    } else {
                        format!("{}{}", BASE_URL, h)
                    }
                });

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
                .map(|src| {
                    if src.starts_with("http") {
                        src.to_string()
                    } else {
                        format!("{}{}", BASE_URL, src)
                    }
                });

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
        let page_url = if content_id.starts_with("http") {
            content_id.to_string()
        } else {
            format!("{}/manga/{}", BASE_URL, content_id)
        };

        let html = self.get_with_ua_retry(&page_url).await?;
        let doc = Html::parse_document(&html);
        let ch_sel = Selector::parse(CHAPTER_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let mut chapters = Vec::new();
        for item in doc.select(&ch_sel) {
            let id = item.value().attr("data-id").unwrap_or_default().to_string();
            if id.is_empty() {
                continue;
            }
            let title = item.text().collect::<String>().trim().to_string();
            chapters.push(Chapter {
                id,
                title: if title.is_empty() { "Chapter".to_string() } else { title },
                number: 0.0,
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

        let html = self.get_with_ua_retry(&page_url).await?;
        let doc = Html::parse_document(&html);
        let img_sel = Selector::parse(PAGE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        Ok(doc
            .select(&img_sel)
            .enumerate()
            .filter_map(|(idx, img)| {
                img.value()
                    .attr("src")
                    .or_else(|| img.value().attr("data-src"))
                    .map(|url| Page {
                        index: idx as u32,
                        url: url.to_string(),
                    })
            })
            .collect())
    }
}
