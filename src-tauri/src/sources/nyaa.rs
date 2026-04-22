use std::collections::HashMap;
use std::time::Duration;

use quick_xml::events::Event;
use quick_xml::Reader;
use tokio::sync::RwLock;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResponse, SearchResult, Source, SourceMeta};

const NYAA_BASE_URL: &str = "https://nyaa.si";
const NYAA_SEARCH_LIMIT_MAX: u32 = 75;
const NYAA_USER_AGENT: &str = "Shiori/1.0 (Torbox integration)";

#[derive(Debug, Clone, Default)]
struct NyaaRssItem {
    title: Option<String>,
    link: Option<String>,
    description: Option<String>,
    guid: Option<String>,
    torrent_url: Option<String>,
    info_hash: Option<String>,
}

#[derive(Debug, Clone)]
struct NyaaLookupEntry {
    magnet_link: Option<String>,
    torrent_link: Option<String>,
}

pub struct NyaaSource {
    client: reqwest::Client,
    lookup: RwLock<HashMap<String, NyaaLookupEntry>>,
}

impl NyaaSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(NYAA_USER_AGENT)
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create Nyaa client: {}", e)))?;

        Ok(Self {
            client,
            lookup: RwLock::new(HashMap::new()),
        })
    }

    fn local_name(bytes: &[u8]) -> &str {
        std::str::from_utf8(bytes).unwrap_or_default()
    }

    fn extract_id_from_link(link: &str) -> Option<String> {
        let trimmed = link.trim_end_matches('/');
        let segment = trimmed.rsplit('/').next()?;
        if segment.is_empty() {
            None
        } else {
            Some(format!("nyaa-{}", segment))
        }
    }

    fn make_magnet_from_hash(hash: &str, title: &str) -> Option<String> {
        let cleaned = hash.trim();
        if cleaned.is_empty() {
            return None;
        }

        Some(format!(
            "magnet:?xt=urn:btih:{}&dn={}",
            cleaned,
            urlencoding::encode(title)
        ))
    }

    fn parse_rss_items(xml: &str) -> Result<Vec<NyaaRssItem>> {
        let mut reader = Reader::from_str(xml);
        reader.config_mut().trim_text(true);

        let mut buf = Vec::new();
        let mut items = Vec::new();
        let mut current_item: Option<NyaaRssItem> = None;
        let mut current_field: Option<String> = None;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(event)) => {
                    let name = {
                        let local = event.local_name();
                        Self::local_name(local.as_ref()).to_string()
                    };
                    if name == "item" {
                        current_item = Some(NyaaRssItem::default());
                    } else if current_item.is_some() {
                        match name.as_str() {
                            "title" | "link" | "description" | "guid" | "infoHash" => {
                                current_field = Some(name);
                            }
                            "enclosure" => {
                                if let Some(item) = current_item.as_mut() {
                                    for attr in event.attributes().flatten() {
                                        if Self::local_name(attr.key.as_ref()) == "url" {
                                            if let Ok(value) = attr.unescape_value() {
                                                item.torrent_url = Some(value.to_string());
                                            }
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
                Ok(Event::Text(text)) => {
                    if let (Some(item), Some(field)) = (current_item.as_mut(), current_field.as_deref()) {
                        let value = text
                            .unescape()
                            .map_err(|e| ShioriError::Other(format!("Failed to parse Nyaa RSS text: {}", e)))?
                            .to_string();

                        if value.is_empty() {
                            buf.clear();
                            continue;
                        }

                        match field {
                            "title" => item.title = Some(value),
                            "link" => item.link = Some(value),
                            "description" => item.description = Some(value),
                            "guid" => item.guid = Some(value),
                            "infoHash" => item.info_hash = Some(value),
                            _ => {}
                        }
                    }
                }
                Ok(Event::End(event)) => {
                    let name = {
                        let local = event.local_name();
                        Self::local_name(local.as_ref()).to_string()
                    };
                    if name == "item" {
                        if let Some(item) = current_item.take() {
                            items.push(item);
                        }
                    }
                    current_field = None;
                }
                Ok(Event::Eof) => break,
                Ok(_) => {}
                Err(e) => {
                    return Err(ShioriError::Other(format!(
                        "Failed to parse Nyaa RSS feed: {}",
                        e
                    )));
                }
            }
            buf.clear();
        }

        Ok(items)
    }

    async fn search_internal(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        let safe_page = page.max(1);
        let safe_limit = limit.max(1).min(NYAA_SEARCH_LIMIT_MAX);

        let url = format!(
            "{}/?page=rss&q={}&c=3_0&f=0&p={}",
            NYAA_BASE_URL,
            urlencoding::encode(query),
            safe_page
        );

        let raw_xml = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Nyaa search request failed: {}", e)))?
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("Nyaa search response read failed: {}", e)))?;

        let parsed = Self::parse_rss_items(&raw_xml)?;
        let mut out = Vec::new();
        let mut lookup_updates: HashMap<String, NyaaLookupEntry> = HashMap::new();

        for (idx, item) in parsed.into_iter().enumerate() {
            if out.len() >= safe_limit as usize {
                break;
            }

            let title = item.title.unwrap_or_else(|| "Untitled torrent".to_string());
            let detail_link = item
                .link
                .or(item.guid)
                .filter(|v| !v.trim().is_empty());

            let torrent_link = item.torrent_url.filter(|v| {
                let normalized = v.to_ascii_lowercase();
                normalized.starts_with("http://") || normalized.starts_with("https://")
            });

            let magnet_link = item
                .info_hash
                .as_deref()
                .and_then(|hash| Self::make_magnet_from_hash(hash, &title));

            if magnet_link.is_none() && torrent_link.is_none() {
                continue;
            }

            let id = detail_link
                .as_deref()
                .and_then(Self::extract_id_from_link)
                .unwrap_or_else(|| format!("nyaa-{}-{}", safe_page, idx));

            let mut extra = HashMap::new();
            if let Some(link) = detail_link.clone() {
                extra.insert("url".to_string(), link);
            }
            if let Some(torrent) = torrent_link.clone() {
                extra.insert("torrent".to_string(), torrent);
            }
            if let Some(magnet) = magnet_link.clone() {
                extra.insert("magnet".to_string(), magnet);
            }

            lookup_updates.insert(
                id.clone(),
                NyaaLookupEntry {
                    magnet_link,
                    torrent_link,
                },
            );

            out.push(SearchResult {
                id,
                title,
                cover_url: None,
                description: item.description,
                source_id: "nyaa".to_string(),
                extra,
            });
        }

        if !lookup_updates.is_empty() {
            let mut guard = self.lookup.write().await;
            guard.extend(lookup_updates);
        }

        Ok(SearchResponse {
            items: out,
            total: None,
            offset: Some((safe_page - 1) * safe_limit),
            limit: Some(safe_limit),
        })
    }
}

#[async_trait::async_trait]
impl Source for NyaaSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "nyaa".to_string(),
            name: "Nyaa (Torrents)".to_string(),
            base_url: NYAA_BASE_URL.to_string(),
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
        let lookup = self.lookup.read().await;
        if !lookup.contains_key(content_id) {
            return Err(ShioriError::Validation(
                "Nyaa entry expired. Search again to refresh torrent data.".to_string(),
            ));
        }

        Ok(vec![Chapter {
            id: content_id.to_string(),
            title: "Torrent Entry".to_string(),
            number: 1.0,
            volume: None,
            uploaded_at: None,
            source_id: "nyaa".to_string(),
            content_id: content_id.to_string(),
        }])
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let lookup = self.lookup.read().await;
        let entry = lookup.get(chapter_id).ok_or_else(|| {
            ShioriError::Validation("Nyaa entry not found. Search again and retry.".to_string())
        })?;

        let mut pages = Vec::new();
        if let Some(magnet) = &entry.magnet_link {
            pages.push(Page {
                index: pages.len() as u32,
                url: format!("magnet|{}", magnet),
            });
        }

        if let Some(torrent) = &entry.torrent_link {
            pages.push(Page {
                index: pages.len() as u32,
                url: format!("torrent|{}", torrent),
            });
        }

        if pages.is_empty() {
            return Err(ShioriError::Other(
                "No magnet/torrent links available for this Nyaa entry.".to_string(),
            ));
        }

        Ok(pages)
    }
}
