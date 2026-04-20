use std::collections::{HashMap, HashSet};
use std::time::Duration;

use once_cell::sync::Lazy;
use scraper::{Html, Selector};
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration as TokioDuration};

use crate::error::{Result, ShioriError};
use crate::sources::network::TorrentNetworkConfig;
use crate::sources::{Chapter, ContentType, Page, SearchResponse, SearchResult, Source, SourceMeta};

const X1337_BASE_URL: &str = "https://1337x.to";
const X1337_MIRROR_BASE_URLS: &[&str] = &["https://1337x.to", "https://www.1377x.to", "https://x1337x.ws"];

static INFO_HASH_RE: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"(?i)[a-f0-9]{40}").expect("valid info hash regex")
});

#[derive(Debug, Clone)]
struct X1337LookupEntry {
    details_link: String,
    magnet_link: Option<String>,
    torrent_link: Option<String>,
}

pub struct X1337Source {
    client: RwLock<reqwest::Client>,
    lookup: RwLock<HashMap<String, X1337LookupEntry>>,
    network: RwLock<TorrentNetworkConfig>,
}

impl X1337Source {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent("Shiori/1.0 (1337x integration)")
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create 1337x client: {}", e)))?;

        Ok(Self {
            client: RwLock::new(client),
            lookup: RwLock::new(HashMap::new()),
            network: RwLock::new(TorrentNetworkConfig::default()),
        })
    }

    pub async fn set_network_config(&self, config: TorrentNetworkConfig) -> Result<()> {
        let normalized = config.normalized();
        let client = normalized.build_client("Shiori/1.0 (1337x integration)")?;
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
            return Some(format!("{}{}", X1337_BASE_URL, trimmed));
        }
        Some(format!("{}/{}", X1337_BASE_URL, trimmed.trim_start_matches('/')))
    }

    async fn hydrate_details(
        &self,
        details_link: &str,
    ) -> Result<(Option<String>, Option<String>)> {
        let network = self.network.read().await.clone();
        let mut last_error: Option<String> = None;
        let mut response_opt: Option<reqwest::Response> = None;

        for attempt in 0..=network.max_retries {
            if attempt > 0 {
                sleep(TokioDuration::from_millis(TorrentNetworkConfig::retry_backoff_ms(attempt))).await;
            }

            match self
                .client
                .read()
                .await
                .clone()
                .get(details_link)
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .header("Accept-Language", "en-US,en;q=0.9")
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    response_opt = Some(resp);
                    break;
                }
                Ok(resp) => {
                    last_error = Some(format!("status {} on details", resp.status()));
                }
                Err(err) => {
                    last_error = Some(err.to_string());
                }
            }
        }

        let response = response_opt.ok_or_else(|| {
            ShioriError::Other(format!(
                "1337x details request failed: {}",
                last_error.unwrap_or_else(|| "no response".to_string())
            ))
        })?;

        if !response.status().is_success() {
            return Ok((None, None));
        }

        let body = response
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("1337x details response read failed: {}", e)))?;

        let doc = Html::parse_document(&body);
        let anchor_selector = Selector::parse("a[href]")
            .map_err(|e| ShioriError::Other(format!("Selector parse failed: {:?}", e)))?;

        let mut magnet_link: Option<String> = None;
        let mut torrent_link: Option<String> = None;

        for anchor in doc.select(&anchor_selector) {
            let href = anchor.value().attr("href").unwrap_or_default().trim();
            if href.is_empty() {
                continue;
            }

            let lower = href.to_ascii_lowercase();
            if magnet_link.is_none() && lower.starts_with("magnet:") {
                magnet_link = Some(href.to_string());
            }

            if torrent_link.is_none()
                && (lower.contains(".torrent") || lower.contains("/torrent") || lower.contains("/download/"))
            {
                torrent_link = Self::absolute_url(href);
            }

            if magnet_link.is_some() && torrent_link.is_some() {
                break;
            }
        }

        if magnet_link.is_none() {
            if let Some(hash) = INFO_HASH_RE.find(&body).map(|m| m.as_str().to_ascii_lowercase()) {
                magnet_link = Some(format!("magnet:?xt=urn:btih:{}", hash));
            }
        }

        Ok((magnet_link, torrent_link))
    }

    async fn search_internal(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        let safe_page = page.max(1);
        let safe_limit = limit.clamp(1, 40);
        let offset = (safe_page - 1) * safe_limit;

        let network = self.network.read().await.clone();
        let mut last_error: Option<String> = None;
        let mut body: Option<String> = None;

        'domains: for domain in X1337_MIRROR_BASE_URLS {
            let url = format!(
                "{}/search/{}/{}/",
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
                                    .map_err(|e| ShioriError::Other(format!("1337x response read failed: {}", e)))?
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
                "1337x search request failed across mirrors. {}",
                last_error.unwrap_or_else(|| "No response".to_string())
            ))
        })?;

        let candidates: Vec<(String, String)> = {
            let doc = Html::parse_document(&body);
            let table_link_selector = Selector::parse("table a[href]")
                .map_err(|e| ShioriError::Other(format!("Selector parse failed: {:?}", e)))?;

            let mut seen = HashSet::new();
            let mut candidates: Vec<(String, String)> = Vec::new();

            for anchor in doc.select(&table_link_selector) {
                let href = anchor.value().attr("href").unwrap_or_default();
                if !href.contains("/torrent/") {
                    continue;
                }

                let Some(details_link) = Self::absolute_url(href) else {
                    continue;
                };

                if !seen.insert(details_link.clone()) {
                    continue;
                }

                let title = anchor
                    .text()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .trim()
                    .to_string();

                if title.is_empty() {
                    continue;
                }

                candidates.push((title, details_link));
                if candidates.len() >= safe_limit as usize {
                    break;
                }
            }

            candidates
        };

        let mut items = Vec::new();
        let mut lookup_updates = HashMap::new();

        for (idx, (title, details_link)) in candidates.into_iter().enumerate() {
            let (magnet_link, torrent_link) = self.hydrate_details(&details_link).await?;
            if magnet_link.is_none() && torrent_link.is_none() {
                continue;
            }

            let id = format!("x1337-{}-{}", safe_page, idx);
            lookup_updates.insert(
                id.clone(),
                X1337LookupEntry {
                    details_link: details_link.clone(),
                    magnet_link: magnet_link.clone(),
                    torrent_link: torrent_link.clone(),
                },
            );

            let mut extra = HashMap::new();
            if let Some(magnet) = magnet_link {
                extra.insert("magnet".to_string(), magnet);
            }
            if let Some(torrent) = torrent_link {
                extra.insert("torrent".to_string(), torrent);
            }
            extra.insert("url".to_string(), details_link);
            extra.insert("tracker".to_string(), "1337x".to_string());
            extra.insert("indexer".to_string(), "1337x".to_string());

            items.push(SearchResult {
                id,
                title,
                cover_url: None,
                description: Some("1337x torrent result".to_string()),
                source_id: "x1337".to_string(),
                extra,
            });
        }

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
impl Source for X1337Source {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "x1337".to_string(),
            name: "1337x (Torrents)".to_string(),
            base_url: X1337_BASE_URL.to_string(),
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
            source_id: "x1337".to_string(),
            content_id: content_id.to_string(),
        }])
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let lookup = self.lookup.read().await;
        let entry = lookup.get(chapter_id).ok_or_else(|| {
            ShioriError::Validation("1337x entry expired. Search again to refresh links.".to_string())
        })?;

        let mut pages = Vec::new();

        if let Some(magnet) = entry.magnet_link.clone().filter(|v| !v.trim().is_empty()) {
            pages.push(Page {
                index: pages.len() as u32,
                url: format!("magnet|{}", magnet),
            });
        }

        if let Some(torrent) = entry.torrent_link.clone().filter(|v| !v.trim().is_empty()) {
            pages.push(Page {
                index: pages.len() as u32,
                url: format!("torrent|{}", torrent),
            });
        }

        if !entry.details_link.trim().is_empty() {
            pages.push(Page {
                index: pages.len() as u32,
                url: format!("external|{}", entry.details_link),
            });
        }

        if pages.is_empty() {
            return Err(ShioriError::Other(
                "No magnet/torrent links available for this 1337x result".to_string(),
            ));
        }

        Ok(pages)
    }
}
