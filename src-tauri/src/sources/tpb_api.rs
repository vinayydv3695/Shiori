use std::collections::HashMap;

use serde::Deserialize;
use tokio::sync::RwLock;

use crate::error::{Result, ShioriError};
use crate::sources::network::TorrentNetworkConfig;
use crate::sources::{Chapter, ContentType, Page, SearchResponse, SearchResult, Source, SourceMeta};

const TPB_DEFAULT_API_BASE: &str = "https://apibay.org";
const TPB_API_MIRRORS: &[&str] = &[
    "https://apibay.org",
    "https://apibay.net",
    "https://apibay.xyz",
];

#[derive(Debug, Clone)]
struct TpbLookupEntry {
    magnet_link: String,
    torrent_link: String,
    details_link: Option<String>,
}

pub struct TpbApiSource {
    client: RwLock<reqwest::Client>,
    network: RwLock<TorrentNetworkConfig>,
    lookup: RwLock<HashMap<String, TpbLookupEntry>>,
}

impl TpbApiSource {
    pub fn new() -> Result<Self> {
        let default_network = TorrentNetworkConfig::default();
        let client = default_network.build_client("Shiori/1.0 (TPB API integration)")?;

        Ok(Self {
            client: RwLock::new(client),
            network: RwLock::new(default_network),
            lookup: RwLock::new(HashMap::new()),
        })
    }

    pub async fn set_network_config(&self, config: TorrentNetworkConfig) -> Result<()> {
        let normalized = config.normalized();
        let client = normalized.build_client("Shiori/1.0 (TPB API integration)")?;
        {
            let mut net_guard = self.network.write().await;
            *net_guard = normalized;
        }
        {
            let mut client_guard = self.client.write().await;
            *client_guard = client;
        }
        Ok(())
    }

    pub async fn load_config_from_store(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        let net_cfg = TorrentNetworkConfig::load_from_store(app_handle)?;
        self.set_network_config(net_cfg).await
    }

    fn normalize_hash(hash: &str) -> Option<String> {
        let cleaned = hash.trim().to_ascii_lowercase();
        if cleaned.len() != 40 || !cleaned.chars().all(|c| c.is_ascii_hexdigit()) {
            return None;
        }
        if cleaned.chars().all(|c| c == '0') {
            return None;
        }
        Some(cleaned)
    }

    fn parse_int(value: Option<&str>) -> Option<i64> {
        value
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .and_then(|v| v.parse::<i64>().ok())
    }

    fn build_magnet(hash: &str, title: &str) -> String {
        format!(
            "magnet:?xt=urn:btih:{}&dn={}&tr={}&tr={}&tr={}",
            hash,
            urlencoding::encode(title),
            urlencoding::encode("udp://tracker.opentrackr.org:1337/announce"),
            urlencoding::encode("udp://open.stealth.si:80/announce"),
            urlencoding::encode("udp://tracker.torrent.eu.org:451/announce"),
        )
    }

    fn build_torrent_link(hash: &str) -> String {
        format!("https://itorrents.org/torrent/{}.torrent", hash.to_ascii_uppercase())
    }

    async fn request_search(&self, base_url: &str, query: &str) -> Result<Vec<TpbApiItem>> {
        let url = format!("{}/q.php?q={}", base_url.trim_end_matches('/'), urlencoding::encode(query));

        let network = self.network.read().await.clone();
        let mut last_error: Option<String> = None;

        for attempt in 0..=network.max_retries {
            if attempt > 0 {
                tokio::time::sleep(tokio::time::Duration::from_millis(TorrentNetworkConfig::retry_backoff_ms(attempt))).await;
            }

            let response = self
                .client
                .read()
                .await
                .clone()
                .get(&url)
                .header("Accept", "application/json,text/plain,*/*")
                .header("Accept-Language", "en-US,en;q=0.9")
                .send()
                .await;

            match response {
                Ok(resp) => {
                    if !resp.status().is_success() {
                        last_error = Some(format!("status {}", resp.status()));
                        continue;
                    }

                    let parsed = resp
                        .json::<Vec<TpbApiItem>>()
                        .await
                        .map_err(|e| ShioriError::Other(format!("TPB API parse failed: {}", e)))?;
                    return Ok(parsed);
                }
                Err(err) => {
                    last_error = Some(err.to_string());
                }
            }
        }

        Err(ShioriError::Other(format!(
            "TPB API search request failed on {}: {}",
            base_url,
            last_error.unwrap_or_else(|| "no response".to_string())
        )))
    }

    async fn search_internal(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        let safe_page = page.max(1);
        let safe_limit = limit.clamp(1, 50);
        let offset = (safe_page - 1) * safe_limit;

        let mut last_error: Option<String> = None;
        let mut items: Vec<TpbApiItem> = Vec::new();

        for base in TPB_API_MIRRORS {
            match self.request_search(base, query.trim()).await {
                Ok(parsed) => {
                    items = parsed;
                    break;
                }
                Err(err) => {
                    last_error = Some(err.to_string());
                }
            }
        }

        if items.is_empty() {
            if let Some(err) = last_error {
                return Err(ShioriError::Other(format!(
                    "TPB API search failed across mirrors. {}",
                    err
                )));
            }
            return Ok(SearchResponse {
                items: vec![],
                total: Some(0),
                offset: Some(offset),
                limit: Some(safe_limit),
            });
        }

        let start = offset as usize;
        let end = (offset + safe_limit) as usize;
        let slice = if start >= items.len() {
            Vec::new()
        } else {
            items[start..items.len().min(end)].to_vec()
        };

        let mut lookup_updates: HashMap<String, TpbLookupEntry> = HashMap::new();
        let mut results = Vec::new();

        for item in slice {
            let title = item.name.trim().to_string();
            if title.is_empty() || title.eq_ignore_ascii_case("No results returned") {
                continue;
            }

            let Some(hash) = Self::normalize_hash(&item.info_hash) else {
                continue;
            };

            let magnet = Self::build_magnet(&hash, &title);
            let torrent = Self::build_torrent_link(&hash);
            let details = item
                .id
                .trim()
                .parse::<u64>()
                .ok()
                .map(|id| format!("https://thepiratebay.org/description.php?id={}", id));

            let result_id = format!("tpb-api-{}", hash);
            lookup_updates.insert(
                result_id.clone(),
                TpbLookupEntry {
                    magnet_link: magnet.clone(),
                    torrent_link: torrent.clone(),
                    details_link: details.clone(),
                },
            );

            let mut extra = HashMap::new();
            extra.insert("magnet".to_string(), magnet);
            extra.insert("torrent".to_string(), torrent);
            if let Some(details_link) = details {
                extra.insert("url".to_string(), details_link);
            }

            if let Some(seeders) = Self::parse_int(Some(item.seeders.as_str())) {
                extra.insert("seeders".to_string(), seeders.to_string());
            }
            if let Some(size) = Self::parse_int(Some(item.size.as_str())) {
                extra.insert("size".to_string(), size.to_string());
            }

            extra.insert("tracker".to_string(), "TPB API".to_string());
            extra.insert("indexer".to_string(), "TPB".to_string());

            results.push(SearchResult {
                id: result_id,
                title,
                cover_url: None,
                description: Some("TPB API torrent result".to_string()),
                source_id: "tpb-api".to_string(),
                extra,
            });
        }

        if !lookup_updates.is_empty() {
            let mut guard = self.lookup.write().await;
            guard.extend(lookup_updates);
        }

        Ok(SearchResponse {
            items: results,
            total: Some(items.len() as u32),
            offset: Some(offset),
            limit: Some(safe_limit),
        })
    }
}

#[async_trait::async_trait]
impl Source for TpbApiSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "tpb-api".to_string(),
            name: "TPB API (Torrents)".to_string(),
            base_url: TPB_DEFAULT_API_BASE.to_string(),
            version: "1.0.0".to_string(),
            content_type: ContentType::Book,
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
            source_id: "tpb-api".to_string(),
            content_id: content_id.to_string(),
        }])
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let lookup = self.lookup.read().await;
        let entry = lookup.get(chapter_id).ok_or_else(|| {
            ShioriError::Validation("TPB API entry expired. Search again to refresh links.".to_string())
        })?;

        let mut pages = Vec::new();

        if !entry.magnet_link.trim().is_empty() {
            pages.push(Page {
                index: pages.len() as u32,
                url: format!("magnet|{}", entry.magnet_link),
            });
        }

        if !entry.torrent_link.trim().is_empty() {
            pages.push(Page {
                index: pages.len() as u32,
                url: format!("torrent|{}", entry.torrent_link),
            });
        }

        if let Some(details) = entry.details_link.clone().filter(|v| !v.trim().is_empty()) {
            pages.push(Page {
                index: pages.len() as u32,
                url: format!("external|{}", details),
            });
        }

        if pages.is_empty() {
            return Err(ShioriError::Other("No TPB API mirror links available".to_string()));
        }

        Ok(pages)
    }
}

#[derive(Debug, Clone, Deserialize)]
struct TpbApiItem {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    info_hash: String,
    #[serde(default)]
    seeders: String,
    #[serde(default)]
    size: String,
}
