use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use quick_xml::events::Event;
use quick_xml::Reader;
use tokio::sync::{Mutex, RwLock};

use crate::error::{Result, ShioriError};
use crate::services::online::anilist::fetch_cover_by_title;
use crate::sources::{Chapter, ContentType, Page, SearchResponse, SearchResult, Source, SourceMeta};

const NYAA_BASE_URL: &str = "https://nyaa.si";
const NYAA_SEARCH_LIMIT_MAX: u32 = 75;
const NYAA_USER_AGENT: &str = "Shiori/1.0 (Torbox integration)";
const NYAA_MIRRORS: &[&str] = &[
    "https://nyaa.si",
    "https://nyaa.iss.one",
    "https://nyaa.land",
];

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
    cover_cache: Arc<Mutex<HashMap<String, Option<String>>>>,
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
            cover_cache: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    async fn fill_missing_covers(&self, items: &mut [SearchResult]) {
        let mut missing: Vec<(usize, String, String)> = Vec::new();

        {
            let cache = self.cover_cache.lock().await;
            for (idx, item) in items.iter_mut().enumerate() {
                if item.cover_url.is_some() {
                    continue;
                }

                let title = item.title.trim().to_string();
                if title.is_empty() {
                    continue;
                }

                let key = title.to_lowercase();
                if let Some(cached_cover) = cache.get(&key) {
                    item.cover_url = cached_cover.clone();
                } else {
                    missing.push((idx, key, title));
                }
            }
        }

        const BATCH_SIZE: usize = 4;
        for chunk in missing.chunks(BATCH_SIZE) {
            let fetched: Vec<(usize, String, Option<String>)> = match chunk.len() {
                4 => {
                    let (r0, r1, r2, r3) = tokio::join!(
                        fetch_cover_by_title(&self.client, &chunk[0].2),
                        fetch_cover_by_title(&self.client, &chunk[1].2),
                        fetch_cover_by_title(&self.client, &chunk[2].2),
                        fetch_cover_by_title(&self.client, &chunk[3].2)
                    );
                    vec![
                        (chunk[0].0, chunk[0].1.clone(), r0),
                        (chunk[1].0, chunk[1].1.clone(), r1),
                        (chunk[2].0, chunk[2].1.clone(), r2),
                        (chunk[3].0, chunk[3].1.clone(), r3),
                    ]
                }
                3 => {
                    let (r0, r1, r2) = tokio::join!(
                        fetch_cover_by_title(&self.client, &chunk[0].2),
                        fetch_cover_by_title(&self.client, &chunk[1].2),
                        fetch_cover_by_title(&self.client, &chunk[2].2)
                    );
                    vec![
                        (chunk[0].0, chunk[0].1.clone(), r0),
                        (chunk[1].0, chunk[1].1.clone(), r1),
                        (chunk[2].0, chunk[2].1.clone(), r2),
                    ]
                }
                2 => {
                    let (r0, r1) = tokio::join!(
                        fetch_cover_by_title(&self.client, &chunk[0].2),
                        fetch_cover_by_title(&self.client, &chunk[1].2)
                    );
                    vec![
                        (chunk[0].0, chunk[0].1.clone(), r0),
                        (chunk[1].0, chunk[1].1.clone(), r1),
                    ]
                }
                1 => {
                    let r0 = fetch_cover_by_title(&self.client, &chunk[0].2).await;
                    vec![(chunk[0].0, chunk[0].1.clone(), r0)]
                }
                _ => Vec::new(),
            };

            if fetched.is_empty() {
                continue;
            }

            {
                let mut cache = self.cover_cache.lock().await;
                for (idx, key, cover) in &fetched {
                    cache.insert(key.clone(), cover.clone());
                    items[*idx].cover_url = cover.clone();
                }
            }
        }
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
                                            if let Ok(value) = attr.decode_and_unescape_value(reader.decoder()) {
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

    fn parse_html_items(html: &str, base_url: &str) -> Result<Vec<NyaaRssItem>> {
        use scraper::{Html, Selector};
        let document = Html::parse_document(html);
        let tr_sel = Selector::parse("table.torrent-list tbody tr").map_err(|e| ShioriError::Other(e.to_string()))?;
        let td_sel = Selector::parse("td").map_err(|e| ShioriError::Other(e.to_string()))?;
        let a_sel = Selector::parse("a").map_err(|e| ShioriError::Other(e.to_string()))?;

        let mut items = Vec::new();
        for tr in document.select(&tr_sel) {
            let mut tds = tr.select(&td_sel);
            let _category = tds.next();

            let Some(td_name) = tds.next() else { continue };
            let mut title = None;
            let mut guid = None;
            for a in td_name.select(&a_sel) {
                if let Some(href) = a.value().attr("href") {
                    if href.contains("/view/") && !href.contains("#comments") {
                        title = Some(a.text().collect::<String>().trim().to_string());
                        let href_norm = if href.starts_with("http") { href.to_string() } else { format!("{}{}", base_url, href) };
                        guid = Some(href_norm);
                    }
                }
            }

            let Some(td_links) = tds.next() else { continue };
            let mut torrent_url = None;
            let mut magnet_url = None;
            for a in td_links.select(&a_sel) {
                if let Some(href) = a.value().attr("href") {
                    if href.ends_with(".torrent") || href.contains("/download/") {
                        let href_norm = if href.starts_with("http") { href.to_string() } else { format!("{}{}", base_url, href) };
                        torrent_url = Some(href_norm);
                    } else if href.starts_with("magnet:") {
                        magnet_url = Some(href.to_string());
                    }
                }
            }

            let Some(td_size) = tds.next() else { continue };
            let size = td_size.text().collect::<String>().trim().to_string();

            let info_hash = magnet_url.as_ref().and_then(|url| {
                if let Some(start) = url.find("urn:btih:") {
                    let hash_start = start + 9;
                    let hash_end = url[hash_start..].find('&').map(|i| hash_start + i).unwrap_or(url.len());
                    Some(url[hash_start..hash_end].to_string())
                } else {
                    None
                }
            });

            if let Some(t) = title {
                items.push(NyaaRssItem {
                    title: Some(t),
                    link: guid.clone(),
                    description: Some(format!("Size: {}", size)),
                    guid,
                    torrent_url,
                    info_hash,
                });
            }
        }
        Ok(items)
    }

    async fn search_internal(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        let safe_page = page.max(1);
        let safe_limit = limit.max(1).min(NYAA_SEARCH_LIMIT_MAX);

        let _start_time = std::time::Instant::now();
        let mut diagnostics = crate::sources::SourceSearchDiagnostics {
            source_id: "nyaa".to_string(),
            source_name: Some("Nyaa".to_string()),
            selected_mirror: None,
            selected_base: None,
            attempted_mirrors: Vec::new(),
            duration_ms: 0,
            result_count: 0,
            retries_used: Some(0),
        };

        let mut raw_response = String::new();
        let mut successful_mirror = String::new();

        for mirror in NYAA_MIRRORS {
            let url = format!("{}/?page=rss&q={}&c=3_1&f=0&p={}", mirror, urlencoding::encode(query), safe_page);
            match self.client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(text) = resp.text().await {
                        if text.contains("Enable JavaScript and cookies to continue") || text.contains("DDoS protection by Cloudflare") {
                            diagnostics.attempted_mirrors.push(crate::sources::MirrorAttemptDiagnostic {
                                mirror: mirror.to_string(),
                                success: false,
                                error: Some("Cloudflare challenge".to_string()),
                            });
                            continue;
                        }
                        
                        raw_response = text;
                        successful_mirror = mirror.to_string();
                        diagnostics.attempted_mirrors.push(crate::sources::MirrorAttemptDiagnostic {
                            mirror: mirror.to_string(),
                            success: true,
                            error: None,
                        });
                        break;
                    }
                }
                Ok(resp) => {
                    diagnostics.attempted_mirrors.push(crate::sources::MirrorAttemptDiagnostic {
                        mirror: mirror.to_string(),
                        success: false,
                        error: Some(format!("Status {}", resp.status())),
                    });
                }
                Err(e) => {
                    diagnostics.attempted_mirrors.push(crate::sources::MirrorAttemptDiagnostic {
                        mirror: mirror.to_string(),
                        success: false,
                        error: Some(e.to_string()),
                    });
                }
            }
            
            if successful_mirror.is_empty() {
                let html_url = format!("{}/?q={}&c=3_1&f=0&p={}", mirror, urlencoding::encode(query), safe_page);
                match self.client.get(&html_url).send().await {
                    Ok(resp) if resp.status().is_success() => {
                        if let Ok(text) = resp.text().await {
                            if text.contains("Enable JavaScript and cookies to continue") || text.contains("DDoS protection by Cloudflare") {
                                diagnostics.attempted_mirrors.push(crate::sources::MirrorAttemptDiagnostic {
                                    mirror: format!("{} (HTML)", mirror),
                                    success: false,
                                    error: Some("Cloudflare challenge".to_string()),
                                });
                                continue;
                            }
                            
                            raw_response = text;
                            successful_mirror = mirror.to_string();
                            diagnostics.attempted_mirrors.push(crate::sources::MirrorAttemptDiagnostic {
                                mirror: format!("{} (HTML)", mirror),
                                success: true,
                                error: None,
                            });
                            break;
                        }
                    }
                    _ => {}
                }
            }
        }

        if raw_response.is_empty() {
            return Err(ShioriError::Other("All Nyaa mirrors failed".to_string()));
        }

        diagnostics.selected_mirror = Some(successful_mirror.clone());
        diagnostics.selected_base = Some(successful_mirror.clone());

        let parsed = if raw_response.trim_start().starts_with("<?xml") || raw_response.trim_start().starts_with("<rss") {
            Self::parse_rss_items(&raw_response)?
        } else {
            Self::parse_html_items(&raw_response, &successful_mirror)?
        };

        let mut out = Vec::new();
        let mut lookup_updates: HashMap<String, NyaaLookupEntry> = HashMap::new();

        let query_words: Vec<String> = query
            .to_lowercase()
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();

        for (idx, item) in parsed.into_iter().enumerate() {
            if out.len() >= safe_limit as usize {
                break;
            }

            let title = item.title.unwrap_or_else(|| "Untitled torrent".to_string());
            let title_lower = title.to_lowercase();

            // Stick to the names: ensure all query words are present in the title
            let matches_query = query_words.iter().all(|word| title_lower.contains(word));
            if !matches_query {
                continue;
            }

            // Exclude non-manga (like Audio CDs that sneak into c=3_1)
            let is_invalid = ["flac", "wav", "mp3", "ost", "soundtrack", "1080p", "720p", "x265", "x264", "bdrip"]
                .iter()
                .any(|&kw| title_lower.contains(kw));
            if is_invalid {
                continue;
            }
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

        self.fill_missing_covers(&mut out).await;

        Ok(SearchResponse {
            items: out,
            total: None,
            offset: Some((safe_page - 1) * safe_limit),
            limit: Some(safe_limit),
            diagnostics: None,
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
