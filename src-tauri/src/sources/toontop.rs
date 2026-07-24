use reqwest::Client;
use scraper::Html;
use serde_json::Value;
use std::time::Duration;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResponse, SearchResult, Source, SourceMeta};

const BASE_URL: &str = "https://toontop.io";

fn extract_next_data(html: &str) -> Result<Value> {
    let doc = Html::parse_document(html);
    let selector = scraper::Selector::parse("script#__NEXT_DATA__").unwrap();
    if let Some(script) = doc.select(&selector).next() {
        let json_str = script.inner_html();
        let val: Value = serde_json::from_str(&json_str).map_err(|e| ShioriError::Other(e.to_string()))?;
        return Ok(val);
    }
    Err(ShioriError::Other("Could not find __NEXT_DATA__".into()))
}

pub struct ToonTopSource {
    client: Client,
}

impl ToonTopSource {
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .build()
            .map_err(|e| ShioriError::Other(e.to_string()))?;
        Ok(Self { client })
    }

    async fn fetch(&self, url: &str) -> Result<Value> {
        let res = self.client.get(url).send().await.map_err(|e| ShioriError::Other(e.to_string()))?;
        let text = res.text().await.map_err(|e| ShioriError::Other(e.to_string()))?;
        extract_next_data(&text)
    }
}

#[async_trait::async_trait]
impl Source for ToonTopSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "toontop".into(),
            name: "ToonTop".into(),
            base_url: BASE_URL.into(),
            version: "1.0.0".into(),
            content_type: ContentType::Manga,
            supports_search: true,
            supports_download: true,
            requires_api_key: false,
            nsfw: false,
        }
    }

    async fn search(&self, query: &str, _page: u32) -> Result<Vec<SearchResult>> {
        let url = format!("{}/search?q={}", BASE_URL, urlencoding::encode(query));
        let data = self.fetch(&url).await?;
        let mut results = Vec::new();

        if let Some(items) = data["props"]["pageProps"]["ssrItems"].as_array() {
            for item in items {
                if let (Some(url_path), Some(name)) = (item["url"].as_str(), item["name"].as_str()) {
                    let cover = item["cover"].as_str().map(|s| s.to_string());
                    let mut id = url_path.to_string();
                    if id.starts_with('/') {
                        id = id[1..].to_string();
                    }
                    results.push(SearchResult {
                        id,
                        title: name.to_string(),
                        cover_url: cover,
                        source_id: "toontop".into(),
                        description: None,
                        extra: std::collections::HashMap::new(),
                    });
                }
            }
        }
        Ok(results)
    }

    async fn search_with_meta(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        let items = self.search(query, page).await?;
        Ok(SearchResponse {
            items,
            total: None,
            offset: None,
            limit: Some(limit),
            diagnostics: None,
        })
    }

    async fn browse(&self, mode: &str, page: u32, _limit: u32, _genres: Option<Vec<String>>, _types: Option<Vec<String>>) -> Result<Vec<SearchResult>> {
        let path = match mode {
            "trending" | "popular" => "/ranking",
            "latest" => "/latest",
            _ => "/latest",
        };
        let page_query = if page > 1 { format!("?page={}", page) } else { String::new() };
        let url = format!("{}{}{}", BASE_URL, path, page_query);
        let data = self.fetch(&url).await?;
        let mut results = Vec::new();
        
        let mut items_array = None;
        if let Some(items) = data["props"]["pageProps"]["items"].as_array() {
            items_array = Some(items);
        } else if let Some(items) = data["props"]["pageProps"]["initialItems"].as_array() {
            items_array = Some(items);
        }
        
        if let Some(items) = items_array {
            for item in items {
                if let (Some(url_path), Some(name)) = (item["url"].as_str(), item["name"].as_str()) {
                    let cover = item["cover"].as_str().map(|s| s.to_string());
                    let mut id = url_path.to_string();
                    if id.starts_with('/') {
                        id = id[1..].to_string();
                    }
                    results.push(SearchResult {
                        id,
                        title: name.to_string(),
                        cover_url: cover,
                        source_id: "toontop".into(),
                        description: None,
                        extra: std::collections::HashMap::new(),
                    });
                }
            }
        }
        Ok(results)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        let url = format!("{}/{}", BASE_URL, content_id);
        let data = self.fetch(&url).await?;
        let mut chapters = Vec::new();
        
        if let Some(items) = data["props"]["pageProps"]["initialManga"]["chapters"].as_array() {
            for item in items {
                if let (Some(url_path), Some(name)) = (item["url"].as_str(), item["name"].as_str()) {
                    // e.g. /playing-on-hard-mode/chapter-20
                    let mut id = url_path.to_string();
                    if id.starts_with('/') {
                        id = id[1..].to_string();
                    }
                    let number = item["number"].as_f64().unwrap_or(0.0);
                    chapters.push(Chapter {
                        id,
                        title: name.to_string(),
                        number: number as f32, // Extract number from JSON directly
                        volume: None,
                        uploaded_at: item["updatedAt"].as_str().map(|s| s.to_string()),
                        source_id: "toontop".into(),
                        content_id: content_id.to_string(),
                    });
                }
            }
        }
        
        chapters.sort_by(|a, b| b.number.partial_cmp(&a.number).unwrap_or(std::cmp::Ordering::Equal)); // ensure descending order if needed
        Ok(chapters)
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let url = format!("{}/{}", BASE_URL, chapter_id);
        let data = self.fetch(&url).await?;
        let mut pages = Vec::new();
        
        if let Some(images) = data["props"]["pageProps"]["initialChapter"]["images"].as_array() {
            for (i, img) in images.iter().enumerate() {
                if let Some(img_url) = img.as_str() {
                    pages.push(Page {
                        index: i as u32,
                        url: img_url.to_string(),
                    });
                }
            }
        }
        
        if pages.is_empty() {
            return Err(ShioriError::Other("No pages found in chapter data".into()));
        }
        Ok(pages)
    }
}
