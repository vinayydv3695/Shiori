use std::collections::{HashMap, HashSet};
use std::time::Duration;

use once_cell::sync::Lazy;
use scraper::{Html, Selector};
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration as TokioDuration};

use crate::error::{Result, ShioriError};
use crate::sources::network::TorrentNetworkConfig;
use crate::sources::{Chapter, ContentType, Page, SearchResponse, SearchResult, Source, SourceMeta};

const BITSEARCH_BASE_URL: &str = "https://bitsearch.to";
const BITSEARCH_MIRROR_BASE_URLS: &[&str] = &["https://bitsearch.to", "https://www.bitsearch.to"];

static INFO_HASH_RE: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"(?i)[a-f0-9]{40}").expect("valid info hash regex")
});

static MAGNET_RE: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r#"magnet:\?[^\s"'<>]+"#).expect("valid magnet regex")
});

#[derive(Debug, Clone)]
struct BitsearchLookupEntry {
    magnet_link: Option<String>,
    details_link: Option<String>,
}

pub struct BitsearchSource {
    client: RwLock<reqwest::Client>,
    lookup: RwLock<HashMap<String, BitsearchLookupEntry>>,
    network: RwLock<TorrentNetworkConfig>,
}

impl BitsearchSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent("Shiori/1.0 (Bitsearch integration)")
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create Bitsearch client: {}", e)))?;

        Ok(Self {
            client: RwLock::new(client),
            lookup: RwLock::new(HashMap::new()),
            network: RwLock::new(TorrentNetworkConfig::default()),
        })
    }

    pub async fn set_network_config(&self, config: TorrentNetworkConfig) -> Result<()> {
        let normalized = config.normalized();
        let client = normalized.build_client("Shiori/1.0 (Bitsearch integration)")?;
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

    fn absolute_url(href: &str) -> Option<String> {
        let trimmed = href.trim();
        if trimmed.is_empty() {
            return None;
        }
        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            return Some(trimmed.to_string());
        }
        if trimmed.starts_with('/') {
            return Some(format!("{}{}", BITSEARCH_BASE_URL, trimmed));
        }
        Some(format!("{}/{}", BITSEARCH_BASE_URL, trimmed.trim_start_matches('/')))
    }

    fn extract_hash(value: &str) -> Option<String> {
        INFO_HASH_RE
            .find(value)
            .map(|m| m.as_str().to_ascii_lowercase())
    }

    fn build_magnet(hash: &str, title: &str) -> String {
        format!(
            "magnet:?xt=urn:btih:{}&dn={}",
            hash,
            urlencoding::encode(title.trim())
        )
    }

    async fn search_internal(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        let safe_page = page.max(1);
        let safe_limit = limit.clamp(1, 50);
        let offset = (safe_page - 1) * safe_limit;

        let network = self.network.read().await.clone();
        let mut last_error: Option<String> = None;
        let mut body: Option<String> = None;

        'domains: for domain in BITSEARCH_MIRROR_BASE_URLS {
            let url = format!(
                "{}/search?q={}&sort=seeders&page={}",
                domain,
                urlencoding::encode(query.trim()),
                safe_page
            );

            for attempt in 0..=network.max_retries {
                if attempt > 0 {
                    sleep(TokioDuration::from_millis(TorrentNetworkConfig::retry_backoff_ms(attempt))).await;
                }

                let response = self
                    .client
                    .read()
                    .await
                    .clone()
                    .get(&url)
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    .header("Accept-Language", "en-US,en;q=0.9")
                    .header("Cache-Control", "no-cache")
                    .header("Pragma", "no-cache")
                    .send()
                    .await;

                match response {
                    Ok(resp) => {
                        if resp.status().is_success() {
                            body = Some(
                                resp.text()
                                    .await
                                    .map_err(|e| ShioriError::Other(format!("Bitsearch response read failed: {}", e)))?
                            );
                            break 'domains;
                        }

                        last_error = Some(format!("status {} on {}", resp.status(), domain));
                    }
                    Err(err) => {
                        last_error = Some(format!("{} on {}", err, domain));
                    }
                }
            }
        }

        let body = body.ok_or_else(|| {
            ShioriError::Other(format!(
                "Bitsearch search request failed across mirrors. {}",
                last_error.unwrap_or_else(|| "No response".to_string())
            ))
        })?;

        let (items, lookup_updates) = {
            let doc = Html::parse_document(&body);
            let anchor_selector = Selector::parse("a[href]")
                .map_err(|e| ShioriError::Other(format!("Selector parse failed: {:?}", e)))?;

            let mut items = Vec::new();
            let mut lookup_updates = HashMap::new();
            let mut seen = HashSet::new();

            for anchor in doc.select(&anchor_selector) {
                let href = anchor.value().attr("href").unwrap_or_default();
                if !href.contains("/torrent/") {
                    continue;
                }

                let Some(hash) = Self::extract_hash(href) else {
                    continue;
                };

                if !seen.insert(hash.clone()) {
                    continue;
                }

                let details_link = Self::absolute_url(href);
                let title = anchor
                    .text()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .trim()
                    .to_string();

                let normalized_title = if title.is_empty() {
                    format!("Bitsearch {}", hash)
                } else {
                    title
                };

                let magnet = Self::build_magnet(&hash, &normalized_title);
                let id = format!("bitsearch-{}", hash);

                lookup_updates.insert(
                    id.clone(),
                    BitsearchLookupEntry {
                        magnet_link: Some(magnet.clone()),
                        details_link: details_link.clone(),
                    },
                );

                let mut extra = HashMap::new();
                extra.insert("magnet".to_string(), magnet);
                if let Some(details) = details_link {
                    extra.insert("url".to_string(), details);
                }
                extra.insert("tracker".to_string(), "Bitsearch".to_string());
                extra.insert("indexer".to_string(), "Bitsearch".to_string());

                items.push(SearchResult {
                    id,
                    title: normalized_title,
                    cover_url: None,
                    description: Some("Bitsearch torrent result".to_string()),
                    source_id: "bitsearch".to_string(),
                    extra,
                });

                if items.len() >= safe_limit as usize {
                    break;
                }
            }

            if items.is_empty() {
                for (idx, magnet_match) in MAGNET_RE.find_iter(&body).enumerate() {
                    if items.len() >= safe_limit as usize {
                        break;
                    }

                    let magnet = magnet_match.as_str().to_string();
                    let hash = Self::extract_hash(&magnet).unwrap_or_else(|| format!("fallback-{}", idx));
                    if !seen.insert(hash.clone()) {
                        continue;
                    }

                    let id = format!("bitsearch-{}", hash);
                    let title = format!("Bitsearch Magnet {}", idx + 1);

                    lookup_updates.insert(
                        id.clone(),
                        BitsearchLookupEntry {
                            magnet_link: Some(magnet.clone()),
                            details_link: None,
                        },
                    );

                    let mut extra = HashMap::new();
                    extra.insert("magnet".to_string(), magnet);
                    extra.insert("tracker".to_string(), "Bitsearch".to_string());
                    extra.insert("indexer".to_string(), "Bitsearch".to_string());

                    items.push(SearchResult {
                        id,
                        title,
                        cover_url: None,
                        description: Some("Bitsearch magnet result".to_string()),
                        source_id: "bitsearch".to_string(),
                        extra,
                    });
                }
            }

            (items, lookup_updates)
        };

        if !lookup_updates.is_empty() {
            let mut guard = self.lookup.write().await;
            guard.extend(lookup_updates);
        }

        Ok(SearchResponse {
            items,
            total: None,
            offset: Some(offset),
            limit: Some(safe_limit),
        })
    }
}

#[async_trait::async_trait]
impl Source for BitsearchSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "bitsearch".to_string(),
            name: "Bitsearch (Torrents)".to_string(),
            base_url: BITSEARCH_BASE_URL.to_string(),
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
            source_id: "bitsearch".to_string(),
            content_id: content_id.to_string(),
        }])
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let lookup = self.lookup.read().await;
        let entry = lookup.get(chapter_id).ok_or_else(|| {
            ShioriError::Validation("Bitsearch entry expired. Search again to refresh links.".to_string())
        })?;

        let mut pages = Vec::new();

        if let Some(magnet) = entry.magnet_link.clone().filter(|v| !v.trim().is_empty()) {
            pages.push(Page {
                index: pages.len() as u32,
                url: format!("magnet|{}", magnet),
            });
        }

        if let Some(details) = entry.details_link.clone().filter(|v| !v.trim().is_empty()) {
            pages.push(Page {
                index: pages.len() as u32,
                url: format!("external|{}", details),
            });
        }

        if pages.is_empty() {
            return Err(ShioriError::Other(
                "No magnet/torrent links available for this Bitsearch result".to_string(),
            ));
        }

        Ok(pages)
    }
}
