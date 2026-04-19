#![allow(dead_code)]
use once_cell::sync::Lazy;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::RwLock;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

// Legal disclaimer:
// This is a community-contributed plugin. Users are solely responsible 
// for complying with all local laws and copyright restrictions.
const MIRROR_URLS: [&str; 3] = [
    "https://annas-archive.gl",
    "https://annas-archive.gs",
    "https://annas-archive.se",
];
// Updated selectors for 2024+ Anna's Archive layout
// Search results are in flex containers with border styling
const SEARCH_ITEM_SELECTOR: &str = r#"div.flex.pt-3.pb-3.border-b"#;
// Title is in a link with specific styling classes
const TITLE_SELECTOR: &str = r#"a.font-semibold.text-lg"#;
const LINK_SELECTOR: &str = r#"a[href*="/md5/"]"#;
// Description/summary text
const DESC_SELECTOR: &str = r#".text-gray-600.mt-2"#;
// Cover image selector - Anna's Archive uses img tags with various attributes
const COVER_SELECTOR: &str = r#"img"#;
// Metadata text (author, format, size) - usually in smaller gray text
const META_TEXT_SELECTOR: &str = r#".text-xs, .text-sm"#;
const DOWNLOAD_RETRY_ATTEMPTS: usize = 3;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const RAPIDAPI_HOST: &str = "annas-archive-api.p.rapidapi.com";
const RAPIDAPI_BASE_URL: &str = "https://annas-archive-api.p.rapidapi.com";
static SIZE_RE: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"(\d+(?:\.\d+)?\s*(?:MB|KB|GB|bytes))")
        .expect("valid Anna's Archive size regex")
});

fn looks_like_md5(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() == 32 && trimmed.chars().all(|c| c.is_ascii_hexdigit())
}

fn looks_like_download_link(value: &str) -> bool {
    let lowered = value.trim().to_ascii_lowercase();
    lowered.starts_with("magnet:")
        || lowered.starts_with("http://")
        || lowered.starts_with("https://")
}

fn extract_error_message(payload: &serde_json::Value) -> Option<String> {
    payload
        .get("detail")
        .and_then(|v| v.as_str())
        .or_else(|| payload.get("error").and_then(|v| v.as_str()))
        .or_else(|| payload.get("message").and_then(|v| v.as_str()))
        .map(ToString::to_string)
}

#[derive(Debug, Clone)]
pub struct DownloadOption {
    pub url: String,
    pub download_type: DownloadType,
    pub label: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum DownloadType {
    Magnet,
    Torrent,
    Direct,
    External,
}

impl DownloadType {
    pub fn as_str(&self) -> &'static str {
        match self {
            DownloadType::Magnet => "magnet",
            DownloadType::Torrent => "torrent",
            DownloadType::Direct => "direct",
            DownloadType::External => "external",
        }
    }
}

pub struct AnnasArchiveSource {
    client: reqwest::Client,
    api_key: RwLock<Option<String>>,
    working_mirror: RwLock<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnasArchiveConfig {
    pub api_key: Option<String>,
}

impl AnnasArchiveSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create Anna's Archive client: {}", e)))?;
        Ok(Self {
            client,
            api_key: RwLock::new(None),
            working_mirror: RwLock::new(MIRROR_URLS[0].to_string()),
        })
    }

    pub async fn get_config(&self) -> AnnasArchiveConfig {
        AnnasArchiveConfig {
            api_key: self.api_key.read().await.clone(),
        }
    }

    pub async fn set_config(&self, config: AnnasArchiveConfig) {
        {
            let mut guard = self.api_key.write().await;
            *guard = config.api_key.and_then(|v| {
                let trimmed = v.trim().to_string();
                if trimmed.is_empty() { None } else { Some(trimmed) }
            });
        }
    }

    pub async fn set_api_key(&self, key: Option<String>) {
        let mut guard = self.api_key.write().await;
        *guard = key;
    }

    async fn rapidapi_download_links(&self, content_id: &str) -> Result<Vec<String>> {
        let api_key = self
            .api_key
            .read()
            .await
            .clone()
            .ok_or_else(|| {
                ShioriError::Other(
                    "Anna RapidAPI key not configured. Set it in Settings -> Online Sources -> Anna API Key."
                        .to_string(),
                )
            })?;

        if !looks_like_md5(content_id) {
            return Ok(vec![]);
        }

        let resp = self
            .client
            .get(format!(
                "{}/download?md5={}",
                RAPIDAPI_BASE_URL,
                urlencoding::encode(content_id)
            ))
            .header("x-rapidapi-host", RAPIDAPI_HOST)
            .header("x-rapidapi-key", api_key)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .send()
            .await
            .map_err(|e| {
                ShioriError::Other(format!("Anna RapidAPI request failed: {}", e))
            })?;

        let status = resp.status();
        let raw_body = resp.text().await.map_err(|e| {
            ShioriError::Other(format!("Anna RapidAPI response read failed: {}", e))
        })?;

        if !status.is_success() {
            let parsed = serde_json::from_str::<serde_json::Value>(&raw_body).ok();
            let detail = parsed
                .as_ref()
                .and_then(extract_error_message)
                .unwrap_or_else(|| {
                    let trimmed = raw_body.trim();
                    if trimmed.is_empty() {
                        "empty response body".to_string()
                    } else {
                        trimmed.chars().take(180).collect()
                    }
                });

            return Err(ShioriError::Other(format!(
                "Anna RapidAPI download lookup failed (status {}): {}",
                status, detail
            )));
        }

        let payload: serde_json::Value = serde_json::from_str(&raw_body).map_err(|e| {
            ShioriError::Other(format!("Anna RapidAPI JSON parse failed: {}", e))
        })?;

        let mut links: Vec<String> = Vec::new();

        fn collect_links(value: &serde_json::Value, out: &mut Vec<String>) {
            match value {
                serde_json::Value::String(s) => {
                    if looks_like_download_link(s) {
                        out.push(s.trim().to_string());
                    }
                }
                serde_json::Value::Array(items) => {
                    for item in items {
                        collect_links(item, out);
                    }
                }
                serde_json::Value::Object(map) => {
                    for (key, v) in map {
                        if let Some(s) = v.as_str() {
                            let key_lower = key.to_ascii_lowercase();
                            if (key_lower.contains("link")
                                || key_lower.contains("url")
                                || key_lower.contains("download")
                                || key_lower.contains("magnet"))
                                && looks_like_download_link(s)
                            {
                                out.push(s.trim().to_string());
                                continue;
                            }
                        }
                        collect_links(v, out);
                    }
                }
                _ => {}
            }
        }

        collect_links(&payload, &mut links);
        links.sort();
        links.dedup();

        Ok(links)
    }

    async fn candidate_mirrors(&self) -> Vec<String> {
        let mut mirrors = Vec::new();

        let current_mirror = self.working_mirror.read().await.clone();
        if !current_mirror.trim().is_empty() {
            mirrors.push(current_mirror);
        }

        for mirror in MIRROR_URLS {
            let mirror = mirror.to_string();
            if !mirrors.iter().any(|m| m == &mirror) {
                mirrors.push(mirror);
            }
        }

        mirrors
    }

    pub async fn load_config_from_store(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        use tauri_plugin_store::StoreExt;

        let store = app_handle
            .store("sources.json")
            .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

        let api_key = store
            .get("anna-archive.api_key")
            .and_then(|v| v.as_str().map(ToString::to_string));

        self.set_config(AnnasArchiveConfig {
            api_key,
        }).await;

        Ok(())
    }

    pub async fn save_config_to_store(&self, app_handle: &tauri::AppHandle, config: AnnasArchiveConfig) -> Result<()> {
        use tauri_plugin_store::StoreExt;

        let store = app_handle
            .store("sources.json")
            .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

        let _ = store.delete("anna-archive.base_url");
        let _ = store.delete("anna-archive.auth_key");
        let _ = store.delete("anna-archive.membership_key");
        let _ = store.delete("anna-archive.auth_cookie");

        match config.api_key.as_ref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
            Some(v) => {
                store.set("anna-archive.api_key", serde_json::json!(v));
            }
            None => {
                let _ = store.delete("anna-archive.api_key");
            }
        }

        store
            .save()
            .map_err(|e| ShioriError::Other(format!("Failed to save source config: {}", e)))?;

        self.set_config(config).await;
        Ok(())
    }

    pub async fn load_api_key_from_store(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        self.load_config_from_store(app_handle).await
    }

    async fn request_with_mirrors(&self, path: &str) -> Result<(String, String)> {
        let mirrors = self.candidate_mirrors().await;

        for mirror in mirrors {
            let url = format!("{}{}", mirror, path);
            match self.client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    let text = resp.text().await.map_err(|e|
                        ShioriError::Other(format!("Failed to read response: {}", e))
                    )?;

                    let mut guard = self.working_mirror.write().await;
                    *guard = mirror.clone();

                    return Ok((text, mirror));
                }
                _ => continue,
            }
        }

        Err(ShioriError::Other(
            "All Anna's Archive mirrors are unavailable. Check your network connection or try again later.".to_string()
        ))
    }

    fn normalize_href(&self, href: &str, mirror: &str) -> String {
        if href.starts_with("http://") || href.starts_with("https://") || href.starts_with("magnet:") {
            href.to_string()
        } else {
            format!("{}{}", mirror, href)
        }
    }

    fn classify_download_url(&self, href: &str) -> Option<DownloadType> {
        let href_l = href.to_ascii_lowercase();

        if href_l.starts_with("magnet:") {
            return Some(DownloadType::Magnet);
        }

        if href_l.contains(".torrent") || href_l.contains("/torrent") {
            return Some(DownloadType::Torrent);
        }

        let direct_patterns = [
            "/fast_download/",
            "/slow_download/",
            "/download/",
            "/dyn/api/fast_download",
        ];
        if direct_patterns.iter().any(|p| href_l.contains(p)) {
            return Some(DownloadType::Direct);
        }

        let external_patterns = [
            "libgen",
            "ipfs",
            "/zlib/",
            "/scimag/",
            "/doi/",
        ];
        if external_patterns.iter().any(|p| href_l.contains(p)) {
            return Some(DownloadType::External);
        }

        None
    }

    /// Extract all download options from RapidAPI download endpoint.
    pub async fn get_download_options(&self, content_id: &str) -> Result<Vec<DownloadOption>> {
        let links = self.rapidapi_download_links(content_id).await?;
        let mut options = Vec::new();

        for link in links {
            if let Some(download_type) = self.classify_download_url(&link) {
                options.push(DownloadOption {
                    url: link,
                    download_type,
                    label: None,
                });
            }
        }

        options.sort_by_key(|o| match o.download_type {
            DownloadType::Magnet => 0,
            DownloadType::Torrent => 1,
            DownloadType::Direct => 2,
            DownloadType::External => 3,
        });

        Ok(options)
    }
}

#[async_trait::async_trait]
impl Source for AnnasArchiveSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "anna-archive".to_string(),
            name: "Anna's Archive".to_string(),
            base_url: MIRROR_URLS[0].to_string(),
            version: "2.0.0".to_string(),
            content_type: ContentType::Book,
            supports_search: true,
            supports_download: true,
            requires_api_key: false, // API key optional, Torbox key is separate
            nsfw: false,
        }
    }

    async fn search(&self, query: &str, _page: u32) -> Result<Vec<SearchResult>> {
        let path = format!("/search?q={}", urlencoding::encode(query));
        let (html, mirror) = self.request_with_mirrors(&path).await?;

        let doc = Html::parse_document(&html);
        let item_sel = Selector::parse(SEARCH_ITEM_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let title_sel = Selector::parse(TITLE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let link_sel = Selector::parse(LINK_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let desc_sel = Selector::parse(DESC_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let cover_sel = Selector::parse(COVER_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let meta_sel = Selector::parse(META_TEXT_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;

        // Known ebook formats
        let formats = ["epub", "pdf", "mobi", "azw3", "azw", "fb2", "djvu", "cbr", "cbz", "txt", "rtf", "doc", "docx"];

        let mut out = Vec::new();
        for item in doc.select(&item_sel) {
            let link = item.select(&link_sel).next();
            let href = link.and_then(|a| a.value().attr("href")).map(|h| {
                if h.starts_with("http") {
                    h.to_string()
                } else {
                    format!("{}{}", mirror, h)
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

            // Extract cover image URL
            let cover_url = item
                .select(&cover_sel)
                .next()
                .and_then(|img| {
                    img.value()
                        .attr("src")
                        .or_else(|| img.value().attr("data-src"))
                        .or_else(|| img.value().attr("data-lazy-src"))
                })
                .filter(|s| !s.is_empty() && !s.contains("data:image") && !s.contains("blank"))
                .map(|s| self.normalize_href(s, &mirror));

            // Collect all text from the item to extract metadata
            let full_text = item.text().collect::<String>();
            let full_text_lower = full_text.to_lowercase();

            // Extract file format from the text
            let mut detected_format: Option<String> = None;
            for fmt in &formats {
                // Look for format in text (case insensitive)
                if full_text_lower.contains(&format!(".{}", fmt)) 
                    || full_text_lower.contains(&format!(" {} ", fmt))
                    || full_text_lower.contains(&format!("[{}]", fmt))
                    || full_text_lower.contains(&format!("({})", fmt))
                    || full_text_lower.split_whitespace().any(|w| w == *fmt)
                {
                    detected_format = Some(fmt.to_uppercase());
                    break;
                }
            }

            // Extract author - look for patterns in meta text elements
            let mut author: Option<String> = None;
            let mut file_size: Option<String> = None;
            let mut language: Option<String> = None;
            
            for meta_el in item.select(&meta_sel) {
                let meta_text = meta_el.text().collect::<String>().trim().to_string();
                let meta_lower = meta_text.to_lowercase();
                
                // Skip if it's the description or title
                if meta_text.len() > 200 || meta_text == title {
                    continue;
                }
                
                // Detect file size (e.g., "2.5MB", "500KB")
                if file_size.is_none() {
                    if let Some(caps) = SIZE_RE.captures(&meta_text) {
                        file_size = Some(caps[1].to_string());
                    }
                }
                
                // Detect language
                let languages = ["english", "spanish", "french", "german", "italian", "portuguese", "russian", "chinese", "japanese", "korean"];
                if language.is_none() {
                    for lang in &languages {
                        if meta_lower.contains(lang) {
                            language = Some(lang[0..1].to_uppercase() + &lang[1..]);
                            break;
                        }
                    }
                }
                
                // Detect author - usually appears near the title, contains names
                // Skip if it looks like a format, size, or other metadata
                if author.is_none() 
                    && !meta_lower.contains("mb")
                    && !meta_lower.contains("kb")
                    && !meta_lower.contains("page")
                    && !formats.iter().any(|f| meta_lower.contains(f))
                    && meta_text.len() > 2 
                    && meta_text.len() < 100
                    && !meta_text.starts_with("http")
                {
                    // Check if it looks like an author name (has letters, possibly comma for "Last, First")
                    let has_letters = meta_text.chars().any(|c| c.is_alphabetic());
                    let word_count = meta_text.split_whitespace().count();
                    if has_letters && word_count >= 1 && word_count <= 6 {
                        author = Some(meta_text);
                    }
                }
            }

            let mut extra = HashMap::new();
            if let Some(ref h) = href {
                extra.insert("url".to_string(), h.clone());
            }
            extra.insert("detail_url".to_string(), format!("{}/md5/{}", mirror, id));
            
            // Add extracted metadata to extra
            if let Some(ref fmt) = detected_format {
                extra.insert("format".to_string(), fmt.clone());
            }
            if let Some(ref auth) = author {
                extra.insert("author".to_string(), auth.clone());
            }
            if let Some(ref size) = file_size {
                extra.insert("file_size".to_string(), size.clone());
            }
            if let Some(ref lang) = language {
                extra.insert("language".to_string(), lang.clone());
            }

            out.push(SearchResult {
                id,
                title,
                cover_url,
                description: summary.or(href),
                source_id: "anna-archive".to_string(),
                extra,
            });
        }

        Ok(out)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        // Books are single documents - return synthetic chapter
        Ok(vec![Chapter {
            id: content_id.to_string(),
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
        let mirror = self.working_mirror.read().await.clone();
        let anna_detail_link = format!("{}/md5/{}", mirror, content_id);

        let mut pages = vec![Page {
            index: 0,
            url: format!("anna|{}", anna_detail_link),
        }];

        let has_api_key = api_key.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false);
        if !has_api_key {
            return Err(ShioriError::Other(
                "Anna RapidAPI key not configured. Set it in Settings -> Online Sources -> Anna RapidAPI Key."
                    .to_string(),
            ));
        }

        let rapid_links = self.rapidapi_download_links(content_id).await?;

        for link in rapid_links {
            let lowered = link.to_ascii_lowercase();
            let kind = if lowered.starts_with("magnet:") {
                "magnet"
            } else if lowered.contains(".torrent") || lowered.contains("/torrent") {
                "torrent"
            } else {
                "direct"
            };

            let idx = pages.len();
            pages.push(Page {
                index: idx as u32,
                url: format!("{}|{}", kind, link),
            });
        }

        if pages.len() == 1 {
            // Only the fallback anna| URL exists, meaning nothing was found
            let detail_url = format!("{}/md5/{}", mirror, content_id);

            return Err(ShioriError::Other(format!(
                "Anna RapidAPI returned no usable download links for content_id '{}'. Open detail page manually: {}",
                content_id,
                detail_url,
            )));
        }

        Ok(pages)
    }
}
