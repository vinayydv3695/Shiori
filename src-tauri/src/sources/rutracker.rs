use std::collections::HashMap;
use std::time::Duration;

use once_cell::sync::Lazy;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration as TokioDuration};

use crate::error::{Result, ShioriError};
use crate::sources::network::TorrentNetworkConfig;
use crate::sources::{Chapter, ContentType, Page, SearchResponse, SearchResult, Source, SourceMeta};

const RUTRACKER_DEFAULT_BASE_URL: &str = "https://rutracker.org";
const RUTRACKER_MIRROR_BASE_URLS: &[&str] = &["https://rutracker.org", "https://rutracker.net", "https://rutracker.nl"];

static TOPIC_ID_RE: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"[?&]t=(\d+)").expect("valid rutracker topic id regex")
});

#[derive(Debug, Clone)]
struct RutrackerLookupEntry {
    torrent_link: String,
    details_link: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RutrackerConfig {
    pub base_url: Option<String>,
    pub cookie: Option<String>,
}

pub struct RutrackerSource {
    client: RwLock<reqwest::Client>,
    base_url: RwLock<String>,
    cookie: RwLock<Option<String>>,
    lookup: RwLock<HashMap<String, RutrackerLookupEntry>>,
    network: RwLock<TorrentNetworkConfig>,
}

impl RutrackerSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent("Shiori/1.0 (RuTracker integration)")
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create RuTracker client: {}", e)))?;

        Ok(Self {
            client: RwLock::new(client),
            base_url: RwLock::new(RUTRACKER_DEFAULT_BASE_URL.to_string()),
            cookie: RwLock::new(None),
            lookup: RwLock::new(HashMap::new()),
            network: RwLock::new(TorrentNetworkConfig::default()),
        })
    }

    pub async fn set_network_config(&self, config: TorrentNetworkConfig) -> Result<()> {
        let normalized = config.normalized();
        let client = normalized.build_client("Shiori/1.0 (RuTracker integration)")?;
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

    pub async fn get_config(&self) -> RutrackerConfig {
        RutrackerConfig {
            base_url: Some(self.base_url.read().await.clone()),
            cookie: self.cookie.read().await.clone(),
        }
    }

    pub async fn set_config(&self, config: RutrackerConfig) {
        {
            let mut base_guard = self.base_url.write().await;
            let next_base = config
                .base_url
                .and_then(|v| {
                    let trimmed = v.trim().to_string();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed)
                    }
                })
                .unwrap_or_else(|| RUTRACKER_DEFAULT_BASE_URL.to_string());
            *base_guard = next_base;
        }

        {
            let mut cookie_guard = self.cookie.write().await;
            *cookie_guard = config.cookie.and_then(|v| {
                let trimmed = v.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            });
        }
    }

    pub async fn load_config_from_store(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        use tauri_plugin_store::StoreExt;

        let store = app_handle
            .store("sources.json")
            .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

        let base_url = store
            .get("rutracker.base_url")
            .and_then(|v| v.as_str().map(ToString::to_string));
        let cookie = store
            .get("rutracker.cookie")
            .and_then(|v| v.as_str().map(ToString::to_string));

        self.set_config(RutrackerConfig { base_url, cookie }).await;
        let net_cfg = TorrentNetworkConfig::load_from_store(app_handle)?;
        self.set_network_config(net_cfg).await?;
        Ok(())
    }

    fn normalize_base_url(value: &str) -> String {
        value.trim_end_matches('/').to_string()
    }

    fn parse_topic_id(url: &str) -> Option<String> {
        TOPIC_ID_RE
            .captures(url)
            .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
    }

    fn parse_int(value: &str) -> Option<i64> {
        let cleaned: String = value.chars().filter(|c| c.is_ascii_digit()).collect();
        if cleaned.is_empty() {
            None
        } else {
            cleaned.parse::<i64>().ok()
        }
    }

    async fn search_internal(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        let trimmed_query = query.trim();
        if trimmed_query.is_empty() {
            return Ok(SearchResponse {
                items: vec![],
                total: Some(0),
                offset: Some(0),
                limit: Some(limit.max(1)),
            });
        }

        let cookie = self
            .cookie
            .read()
            .await
            .clone()
            .and_then(|v| {
                let trimmed = v.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            });

        let base_url = Self::normalize_base_url(&self.base_url.read().await.clone());
        let network = self.network.read().await.clone();
        let safe_page = page.max(1);
        let safe_limit = limit.clamp(1, 50);
        let start = (safe_page - 1) * safe_limit;

        let mut candidate_bases: Vec<String> = Vec::new();
        candidate_bases.push(base_url.clone());
        for mirror in RUTRACKER_MIRROR_BASE_URLS {
            let normalized = Self::normalize_base_url(mirror);
            if !candidate_bases.iter().any(|v| v == &normalized) {
                candidate_bases.push(normalized);
            }
        }

        let mut last_error: Option<String> = None;
        let mut response_opt: Option<reqwest::Response> = None;

        'domains: for candidate_base in candidate_bases {
            let search_url = format!(
                "{}/forum/tracker.php?nm={}&start={}",
                candidate_base,
                urlencoding::encode(trimmed_query),
                start
            );

            for attempt in 0..=network.max_retries {
                if attempt > 0 {
                    sleep(TokioDuration::from_millis(TorrentNetworkConfig::retry_backoff_ms(attempt))).await;
                }

                let mut request = self
                    .client
                    .read()
                    .await
                    .clone()
                    .get(&search_url)
                    .header("Referer", format!("{}/forum/tracker.php", candidate_base))
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    .header("Accept-Language", "en-US,en;q=0.9")
                    .header("Cache-Control", "no-cache")
                    .header("Pragma", "no-cache");

                if let Some(ref cookie_value) = cookie {
                    request = request.header("Cookie", cookie_value);
                }

                match request.send().await {
                    Ok(resp) => {
                        if resp.status().is_success() {
                            response_opt = Some(resp);
                            break 'domains;
                        }
                        last_error = Some(format!("status {} on {}", resp.status(), candidate_base));
                    }
                    Err(err) => {
                        last_error = Some(format!("{} on {}", err, candidate_base));
                    }
                }
            }
        }

        let response = response_opt.ok_or_else(|| {
            ShioriError::Other(format!(
                "RuTracker search request failed across mirrors. {}",
                last_error.unwrap_or_else(|| "No response".to_string())
            ))
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(ShioriError::Other(format!(
                "RuTracker search failed (status {}). {}",
                status,
                body.chars().take(200).collect::<String>()
            )));
        }

        let body = response
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("RuTracker response read failed: {}", e)))?;

        let lower_body = body.to_ascii_lowercase();
        if lower_body.contains("login_username")
            || lower_body.contains("form_login")
            || lower_body.contains("name=\"login\"")
        {
            if cookie.is_none() {
                return Err(ShioriError::Validation(
                    "RuTracker blocked anonymous search for this query. Shiori does not require a cookie, but you can add an optional cookie in Settings to unlock full results."
                        .to_string(),
                ));
            }

            return Err(ShioriError::Validation(
                "RuTracker authentication failed. Update your RuTracker cookie in Settings."
                    .to_string(),
            ));
        }

        let (items, lookup_updates) = {
            let doc = Html::parse_document(&body);
            let row_selector = Selector::parse("tr")
                .map_err(|e| ShioriError::Other(format!("Selector parse failed: {:?}", e)))?;
            let topic_link_selector = Selector::parse("a.tLink, a[href*='viewtopic.php?t=']")
                .map_err(|e| ShioriError::Other(format!("Selector parse failed: {:?}", e)))?;
            let forum_selector = Selector::parse("a.forumlink")
                .map_err(|e| ShioriError::Other(format!("Selector parse failed: {:?}", e)))?;
            let seeder_selector = Selector::parse("b.seedmed, b.seed-good, td.seedmed, td.seed")
                .map_err(|e| ShioriError::Other(format!("Selector parse failed: {:?}", e)))?;
            let size_selector = Selector::parse("td.tor-size, td.row4.small.nowrap")
                .map_err(|e| ShioriError::Other(format!("Selector parse failed: {:?}", e)))?;

            let mut items = Vec::new();
            let mut lookup_updates = HashMap::new();

            for row in doc.select(&row_selector) {
                let maybe_topic = row.select(&topic_link_selector).next();
                let Some(topic_link) = maybe_topic else {
                    continue;
                };

                let href = topic_link.value().attr("href").unwrap_or_default();
                let Some(topic_id) = Self::parse_topic_id(href) else {
                    continue;
                };

                let title = topic_link
                    .text()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .trim()
                    .to_string();
                if title.is_empty() {
                    continue;
                }

                let details_link = format!("{}/forum/viewtopic.php?t={}", base_url, topic_id);
                let torrent_link = format!("{}/forum/dl.php?t={}", base_url, topic_id);

                let tracker = row
                    .select(&forum_selector)
                    .next()
                    .map(|v| v.text().collect::<Vec<_>>().join(" ").trim().to_string())
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| "RuTracker".to_string());

                let seeders = row
                    .select(&seeder_selector)
                    .next()
                    .and_then(|v| Self::parse_int(&v.text().collect::<Vec<_>>().join(" ")));

                let file_size = row
                    .select(&size_selector)
                    .next()
                    .map(|v| v.text().collect::<Vec<_>>().join(" ").trim().to_string())
                    .filter(|v| !v.is_empty());

                let result_id = format!("rutracker-{}", topic_id);

                lookup_updates.insert(
                    result_id.clone(),
                    RutrackerLookupEntry {
                        torrent_link: torrent_link.clone(),
                        details_link: details_link.clone(),
                    },
                );

                let mut extra = HashMap::new();
                extra.insert("torrent".to_string(), torrent_link);
                extra.insert("url".to_string(), details_link);
                extra.insert("tracker".to_string(), tracker);
                extra.insert("indexer".to_string(), "RuTracker".to_string());
                if let Some(seeders) = seeders {
                    extra.insert("seeders".to_string(), seeders.to_string());
                }
                if let Some(file_size) = file_size {
                    extra.insert("file_size".to_string(), file_size);
                }

                items.push(SearchResult {
                    id: result_id,
                    title,
                    cover_url: None,
                    description: Some("RuTracker torrent result".to_string()),
                    source_id: "rutracker".to_string(),
                    extra,
                });

                if items.len() >= safe_limit as usize {
                    break;
                }
            }

            (items, lookup_updates)
        };

        if !lookup_updates.is_empty() {
            let mut guard = self.lookup.write().await;
            guard.extend(lookup_updates);
        }

        Ok(SearchResponse {
            total: Some(items.len() as u32),
            offset: Some(start),
            limit: Some(safe_limit),
            items,
        })
    }
}

#[async_trait::async_trait]
impl Source for RutrackerSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "rutracker".to_string(),
            name: "RuTracker (Direct)".to_string(),
            base_url: RUTRACKER_DEFAULT_BASE_URL.to_string(),
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
            source_id: "rutracker".to_string(),
            content_id: content_id.to_string(),
        }])
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let lookup = self.lookup.read().await;
        let entry = lookup.get(chapter_id).cloned();
        drop(lookup);

        let resolved = if let Some(entry) = entry {
            entry
        } else {
            let topic_id = chapter_id.trim().strip_prefix("rutracker-").unwrap_or(chapter_id.trim());
            let base_url = Self::normalize_base_url(&self.base_url.read().await.clone());
            if topic_id.is_empty() || !topic_id.chars().all(|c| c.is_ascii_digit()) {
                return Err(ShioriError::Validation(
                    "RuTracker entry expired. Search again to refresh links.".to_string(),
                ));
            }

            RutrackerLookupEntry {
                torrent_link: format!("{}/forum/dl.php?t={}", base_url, topic_id),
                details_link: format!("{}/forum/viewtopic.php?t={}", base_url, topic_id),
            }
        };

        let mut pages = vec![Page {
            index: 0,
            url: format!("torrent|{}", resolved.torrent_link),
        }];

        if !resolved.details_link.trim().is_empty() {
            pages.push(Page {
                index: 1,
                url: format!("external|{}", resolved.details_link),
            });
        }

        Ok(pages)
    }
}
