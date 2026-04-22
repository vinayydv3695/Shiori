use std::collections::HashMap;
use std::time::Duration;

use serde::Deserialize;
use tokio::sync::RwLock;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResponse, SearchResult, Source, SourceMeta};

const ANIMETOSHO_BASE_URL: &str = "https://animetosho.org";
const ANIMETOSHO_FEED_URL: &str = "https://feed.animetosho.org/json";
const ANIMETOSHO_MAX_LIMIT: u32 = 75;

#[derive(Debug, Clone, Deserialize)]
struct AnimeToshoItem {
    id: i64,
    title: Option<String>,
    link: Option<String>,
    torrent_url: Option<String>,
    magnet_uri: Option<String>,
    seeders: Option<i64>,
    leechers: Option<i64>,
    total_size: Option<i64>,
    num_files: Option<i64>,
}

pub struct AnimeToshoSource {
    client: reqwest::Client,
    lookup: RwLock<HashMap<String, AnimeToshoLookupEntry>>,
}

#[derive(Debug, Clone)]
struct AnimeToshoLookupEntry {
    magnet_link: Option<String>,
    torrent_link: Option<String>,
}

impl AnimeToshoSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent("Shiori/1.0 (Torbox integration)")
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create AnimeTosho client: {}", e)))?;

        Ok(Self {
            client,
            lookup: RwLock::new(HashMap::new()),
        })
    }

    async fn search_internal(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        let safe_limit = limit.max(1).min(ANIMETOSHO_MAX_LIMIT);
        let safe_page = page.max(1);
        let offset = (safe_page - 1) * safe_limit;

        let feed_url = format!(
            "{}?q={}",
            ANIMETOSHO_FEED_URL,
            urlencoding::encode(query.trim())
        );

        let response = self
            .client
            .get(&feed_url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("AnimeTosho search request failed: {}", e)))?;

        let status = response.status();
        if !status.is_success() {
            return Err(ShioriError::Other(format!(
                "AnimeTosho search failed with status {}",
                status
            )));
        }

        let raw_items: Vec<AnimeToshoItem> = response
            .json()
            .await
            .map_err(|e| ShioriError::Other(format!("AnimeTosho search parse failed: {}", e)))?;

        let start = offset as usize;
        let end = (offset + safe_limit) as usize;

        let selected = if start >= raw_items.len() {
            Vec::new()
        } else {
            raw_items[start..raw_items.len().min(end)].to_vec()
        };

        let mut lookup_updates: HashMap<String, AnimeToshoLookupEntry> = HashMap::new();

        let items = selected
            .into_iter()
            .filter_map(|entry| {
                let magnet = entry.magnet_uri.filter(|v| !v.trim().is_empty());
                let torrent = entry.torrent_url.filter(|v| {
                    let normalized = v.to_ascii_lowercase();
                    (normalized.starts_with("http://") || normalized.starts_with("https://"))
                        && !v.trim().is_empty()
                });

                if magnet.is_none() && torrent.is_none() {
                    return None;
                }

                let result_id = format!("animetosho-{}", entry.id);

                lookup_updates.insert(
                    result_id.clone(),
                    AnimeToshoLookupEntry {
                        magnet_link: magnet.clone(),
                        torrent_link: torrent.clone(),
                    },
                );

                let title = entry
                    .title
                    .filter(|v| !v.trim().is_empty())
                    .unwrap_or_else(|| format!("AnimeTosho #{}", entry.id));

                let mut extra = HashMap::new();
                if let Some(link) = entry.link.filter(|v| !v.trim().is_empty()) {
                    extra.insert("url".to_string(), link);
                }
                if let Some(magnet_link) = magnet.clone() {
                    extra.insert("magnet".to_string(), magnet_link);
                }
                if let Some(torrent_link) = torrent.clone() {
                    extra.insert("torrent".to_string(), torrent_link);
                }
                if let Some(seeders) = entry.seeders {
                    extra.insert("seeders".to_string(), seeders.to_string());
                }
                if let Some(leechers) = entry.leechers {
                    extra.insert("leechers".to_string(), leechers.to_string());
                }
                if let Some(total_size) = entry.total_size {
                    extra.insert("total_size".to_string(), total_size.to_string());
                }
                if let Some(num_files) = entry.num_files {
                    extra.insert("num_files".to_string(), num_files.to_string());
                }

                Some(SearchResult {
                    id: result_id,
                    title,
                    cover_url: None,
                    description: Some("AnimeTosho torrent entry".to_string()),
                    source_id: "animetosho".to_string(),
                    extra,
                })
            })
            .collect::<Vec<_>>();

        if !lookup_updates.is_empty() {
            let mut guard = self.lookup.write().await;
            guard.extend(lookup_updates);
        }

        Ok(SearchResponse {
            items,
            total: Some(raw_items.len() as u32),
            offset: Some(offset),
            limit: Some(safe_limit),
        })
    }
}

#[async_trait::async_trait]
impl Source for AnimeToshoSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "animetosho".to_string(),
            name: "AnimeTosho (Torrents)".to_string(),
            base_url: ANIMETOSHO_BASE_URL.to_string(),
            version: "1.0.0".to_string(),
            content_type: ContentType::Manga,
            supports_search: true,
            supports_download: true,
            requires_api_key: false,
            nsfw: true,
        }
    }

    async fn search(&self, query: &str, page: u32) -> Result<Vec<SearchResult>> {
        Ok(self.search_internal(query, page, 20).await?.items)
    }

    async fn search_with_meta(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        self.search_internal(query, page, limit).await
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        Ok(vec![Chapter {
            id: content_id.to_string(),
            title: "Torrent Entry".to_string(),
            number: 1.0,
            volume: None,
            uploaded_at: None,
            source_id: "animetosho".to_string(),
            content_id: content_id.to_string(),
        }])
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let lookup = self.lookup.read().await;
        let entry = lookup.get(chapter_id).ok_or_else(|| {
            ShioriError::Validation("AnimeTosho entry expired. Search again to refresh links.".to_string())
        })?;

        let mut pages = Vec::new();

        if let Some(magnet) = entry
            .magnet_link
            .clone()
            .filter(|v| !v.trim().is_empty())
        {
            pages.push(Page {
                index: pages.len() as u32,
                url: format!("magnet|{}", magnet),
            });
        }

        if let Some(torrent) = entry
            .torrent_link
            .clone()
            .filter(|v| {
            let normalized = v.to_ascii_lowercase();
            (normalized.starts_with("http://") || normalized.starts_with("https://"))
                && !v.trim().is_empty()
        })
        {
            pages.push(Page {
                index: pages.len() as u32,
                url: format!("torrent|{}", torrent),
            });
        }

        if pages.is_empty() {
            return Err(ShioriError::Other(
                "No magnet/torrent links available for this AnimeTosho entry.".to_string(),
            ));
        }

        Ok(pages)
    }
}
