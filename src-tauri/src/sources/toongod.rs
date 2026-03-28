use scraper::{Html, Selector};
use std::collections::HashMap;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

const BASE_URL: &str = "https://www.toongod.org";
const SEARCH_ITEM_SELECTOR: &str = ".listupd .bs";
const SEARCH_TITLE_SELECTOR: &str = ".tt";
const SEARCH_IMAGE_SELECTOR: &str = "img";
const CHAPTER_SELECTOR: &str = "#chapterlist li";
const CHAPTER_LINK_SELECTOR: &str = "a";
const PAGE_SELECTOR: &str = ".reading-content img";

pub struct ToonGodSource {
    client: reqwest::Client,
}

impl ToonGodSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create ToonGod client: {}", e)))?;
        Ok(Self { client })
    }
}

#[async_trait::async_trait]
impl Source for ToonGodSource {
    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "toongod".to_string(),
            name: "ToonGod".to_string(),
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
        let url = format!("{}/?s={}", BASE_URL, urlencoding::encode(query));
        let html = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("ToonGod search request failed: {}", e)))?
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("ToonGod search parse failed: {}", e)))?;

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
                .map(|h| h.to_string());
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
                .and_then(|img| img.value().attr("src").or_else(|| img.value().attr("data-src")))
                .map(|s| s.to_string());

            out.push(SearchResult {
                id,
                title,
                cover_url,
                description: href,
                source_id: "toongod".to_string(),
                extra: HashMap::new(),
            });
        }

        Ok(out)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        let url = if content_id.starts_with("http") {
            content_id.to_string()
        } else {
            format!("{}/{}/", BASE_URL, content_id)
        };

        let html = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("ToonGod chapter request failed: {}", e)))?
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("ToonGod chapter parse failed: {}", e)))?;

        let doc = Html::parse_document(&html);
        let item_sel = Selector::parse(CHAPTER_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let link_sel = Selector::parse(CHAPTER_LINK_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let mut chapters = Vec::new();
        for li in doc.select(&item_sel) {
            if let Some(a) = li.select(&link_sel).next() {
                let href = a.value().attr("href").map(|s| s.to_string());
                let id = href
                    .as_ref()
                    .and_then(|h| h.trim_end_matches('/').split('/').next_back())
                    .unwrap_or_default()
                    .to_string();
                if id.is_empty() {
                    continue;
                }

                let title = a.text().collect::<String>().trim().to_string();
                chapters.push(Chapter {
                    id,
                    title: if title.is_empty() { "Chapter".to_string() } else { title },
                    number: 0.0,
                    volume: None,
                    uploaded_at: None,
                    source_id: "toongod".to_string(),
                    content_id: content_id.to_string(),
                });
            }
        }
        Ok(chapters)
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let url = if chapter_id.starts_with("http") {
            chapter_id.to_string()
        } else {
            format!("{}/{}", BASE_URL, chapter_id)
        };

        let html = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("ToonGod pages request failed: {}", e)))?
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("ToonGod pages parse failed: {}", e)))?;

        let doc = Html::parse_document(&html);
        let img_sel = Selector::parse(PAGE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        Ok(doc
            .select(&img_sel)
            .enumerate()
            .filter_map(|(index, img)| {
                img.value()
                    .attr("src")
                    .or_else(|| img.value().attr("data-src"))
                    .map(|s| Page {
                        index: index as u32,
                        url: s.to_string(),
                    })
            })
            .collect())
    }
}
