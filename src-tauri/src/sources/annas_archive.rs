use scraper::{Html, Selector};
use std::collections::HashMap;
use tokio::sync::RwLock;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

// Legal disclaimer:
// This integration only indexes publicly reachable metadata/search pages.
// Users are solely responsible for complying with all local laws,
// copyright restrictions, and source-site terms of service.
const BASE_URL: &str = "https://annas-archive.org";
const SEARCH_ITEM_SELECTOR: &str = r".h-\[125\]";
const TITLE_SELECTOR: &str = "h3";
const LINK_SELECTOR: &str = "a";
const DESC_SELECTOR: &str = r".max-lg\:line-clamp-2";

// Legal disclaimer:
// Do not use this source to bypass licensing or paywalls.
// It is intended for lawful personal archival/retrieval workflows only.
pub struct AnnasArchiveSource {
    client: reqwest::Client,
    api_key: RwLock<Option<String>>,
}

impl AnnasArchiveSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create Anna's Archive client: {}", e)))?;
        Ok(Self {
            client,
            api_key: RwLock::new(None),
        })
    }

    pub async fn set_api_key(&self, key: Option<String>) {
        let mut guard = self.api_key.write().await;
        *guard = key;
    }

    pub async fn load_api_key_from_store(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        use tauri_plugin_store::StoreExt;

        let store = app_handle
            .store("sources.json")
            .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;
        let value = store
            .get("anna-archive.api_key")
            .and_then(|v| v.as_str().map(ToString::to_string));
        self.set_api_key(value).await;
        Ok(())
    }
}

#[async_trait::async_trait]
impl Source for AnnasArchiveSource {
    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "anna-archive".to_string(),
            name: "Anna's Archive".to_string(),
            base_url: BASE_URL.to_string(),
            version: "1.0.0".to_string(),
            content_type: ContentType::Book,
            supports_search: true,
            supports_download: true,
            requires_api_key: true,
            nsfw: false,
        }
    }

    async fn search(&self, query: &str, _page: u32) -> Result<Vec<SearchResult>> {
        let url = format!("{}/search?q={}", BASE_URL, urlencoding::encode(query));
        let html = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Anna's search request failed: {}", e)))?
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("Anna's search parse failed: {}", e)))?;

        let doc = Html::parse_document(&html);
        let item_sel = Selector::parse(SEARCH_ITEM_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let title_sel = Selector::parse(TITLE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let link_sel = Selector::parse(LINK_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let desc_sel = Selector::parse(DESC_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let mut out = Vec::new();
        for item in doc.select(&item_sel) {
            let link = item.select(&link_sel).next();
            let href = link.and_then(|a| a.value().attr("href")).map(|h| {
                if h.starts_with("http") {
                    h.to_string()
                } else {
                    format!("{}{}", BASE_URL, h)
                }
            });

            let id = href
                .as_ref()
                .and_then(|h| h.split("/md5/").nth(1).map(|s| s.to_string()))
                .unwrap_or_default();

            if id.is_empty() {
                continue;
            }

            let title = item
                .select(&title_sel)
                .next()
                .map(|e| e.text().collect::<String>().trim().to_string())
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| "Untitled".to_string());

            let summary = item
                .select(&desc_sel)
                .next()
                .map(|e| e.text().collect::<String>().trim().to_string())
                .filter(|s| !s.is_empty());

            out.push(SearchResult {
                id,
                title,
                cover_url: None,
                description: summary.or(href),
                source_id: "anna-archive".to_string(),
                extra: HashMap::new(),
            });
        }

        Ok(out)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        // Synthetic single chapter for document-style sources.
        Ok(vec![Chapter {
            id: "full_document".to_string(),
            title: "Full Document".to_string(),
            number: 1.0,
            volume: None,
            uploaded_at: None,
            source_id: "anna-archive".to_string(),
            content_id: content_id.to_string(),
        }])
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let content_id = chapter_id;
        let api_key = self.api_key.read().await.clone();

        // fast_download path first when API key is available in config.
        if let Some(key) = api_key {
            let fast_url = format!(
                "{}/fast_download/{}?key={}",
                BASE_URL,
                content_id,
                urlencoding::encode(&key)
            );
            let probe = self.client.get(&fast_url).send().await;
            if let Ok(resp) = probe {
                if resp.status().is_success() {
                    return Ok(vec![Page {
                        index: 0,
                        url: fast_url,
                    }]);
                }
            }
        }

        // Fallback page-resolution logic: inspect md5 detail page for direct links.
        let detail_url = format!("{}/md5/{}", BASE_URL, content_id);
        let html = self
            .client
            .get(&detail_url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Anna's detail request failed: {}", e)))?
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("Anna's detail parse failed: {}", e)))?;

        let doc = Html::parse_document(&html);
        let link_sel = Selector::parse("a")
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        if let Some(download_url) = doc
            .select(&link_sel)
            .filter_map(|a| a.value().attr("href"))
            .find(|href| href.contains("/download/") || href.contains("/slow_download/"))
            .map(|href| {
                if href.starts_with("http") {
                    href.to_string()
                } else {
                    format!("{}{}", BASE_URL, href)
                }
            })
        {
            return Ok(vec![Page {
                index: 0,
                url: download_url,
            }]);
        }

        Ok(vec![Page {
            index: 0,
            url: detail_url,
        }])
    }
}
