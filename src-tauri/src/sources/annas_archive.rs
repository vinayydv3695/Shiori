#![allow(dead_code)]
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
const RETRYABLE_STATUS_CODES: [reqwest::StatusCode; 4] = [
    reqwest::StatusCode::TOO_MANY_REQUESTS,
    reqwest::StatusCode::BAD_GATEWAY,
    reqwest::StatusCode::SERVICE_UNAVAILABLE,
    reqwest::StatusCode::GATEWAY_TIMEOUT,
];

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
    auth_key: RwLock<Option<String>>,
    base_url: RwLock<Option<String>>,
    working_mirror: RwLock<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnasArchiveConfig {
    pub base_url: Option<String>,
    pub auth_key: Option<String>,
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
            auth_key: RwLock::new(None),
            base_url: RwLock::new(None),
            working_mirror: RwLock::new(MIRROR_URLS[0].to_string()),
        })
    }

    fn normalize_base_url(&self, value: Option<String>) -> Option<String> {
        value
            .map(|v| v.trim().trim_end_matches('/').to_string())
            .filter(|v| !v.is_empty())
    }

    pub async fn get_config(&self) -> AnnasArchiveConfig {
        AnnasArchiveConfig {
            base_url: self.base_url.read().await.clone(),
            auth_key: self.auth_key.read().await.clone(),
            api_key: self.api_key.read().await.clone(),
        }
    }

    pub async fn set_config(&self, config: AnnasArchiveConfig) {
        let normalized_base = self.normalize_base_url(config.base_url);
        {
            let mut guard = self.base_url.write().await;
            *guard = normalized_base.clone();
        }
        {
            let mut guard = self.auth_key.write().await;
            *guard = config.auth_key.and_then(|v| {
                let trimmed = v.trim().to_string();
                if trimmed.is_empty() { None } else { Some(trimmed) }
            });
        }
        {
            let mut guard = self.api_key.write().await;
            *guard = config.api_key.and_then(|v| {
                let trimmed = v.trim().to_string();
                if trimmed.is_empty() { None } else { Some(trimmed) }
            });
        }

        let mut mirror_guard = self.working_mirror.write().await;
        *mirror_guard = normalized_base.unwrap_or_else(|| MIRROR_URLS[0].to_string());
    }

    pub async fn set_api_key(&self, key: Option<String>) {
        let mut guard = self.api_key.write().await;
        *guard = key;
    }

    fn with_auth_if_needed(&self, req: reqwest::RequestBuilder, auth_key: &Option<String>) -> reqwest::RequestBuilder {
        if let Some(key) = auth_key {
            if key.starts_with("Bearer ") {
                req.header("Authorization", key)
            } else {
                req.header("Authorization", format!("Bearer {}", key))
            }
        } else {
            req
        }
    }

    async fn get_auth_key(&self) -> Option<String> {
        self.auth_key.read().await.clone()
    }

    async fn candidate_mirrors(&self) -> Vec<String> {
        let mut mirrors = Vec::new();

        let current_mirror = self.working_mirror.read().await.clone();
        if !current_mirror.trim().is_empty() {
            mirrors.push(current_mirror);
        }

        if let Some(configured) = self.base_url.read().await.clone() {
            if !mirrors.iter().any(|m| m == &configured) {
                mirrors.push(configured);
            }
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

        let base_url = store
            .get("anna-archive.base_url")
            .and_then(|v| v.as_str().map(ToString::to_string));

        let auth_key = store
            .get("anna-archive.auth_key")
            .and_then(|v| v.as_str().map(ToString::to_string));

        self.set_config(AnnasArchiveConfig {
            base_url,
            auth_key,
            api_key,
        }).await;

        Ok(())
    }

    pub async fn save_config_to_store(&self, app_handle: &tauri::AppHandle, config: AnnasArchiveConfig) -> Result<()> {
        use tauri_plugin_store::StoreExt;

        let store = app_handle
            .store("sources.json")
            .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

        let normalized_base = self.normalize_base_url(config.base_url.clone());
        match normalized_base {
            Some(v) => {
                store.set("anna-archive.base_url", serde_json::json!(v));
            }
            None => {
                let _ = store.delete("anna-archive.base_url");
            }
        }

        match config.auth_key.as_ref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
            Some(v) => {
                store.set("anna-archive.auth_key", serde_json::json!(v));
            }
            None => {
                let _ = store.delete("anna-archive.auth_key");
            }
        }

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
        let auth_key = self.get_auth_key().await;
        let mirrors = self.candidate_mirrors().await;

        for mirror in mirrors {
            let url = format!("{}{}", mirror, path);
            let req = self.with_auth_if_needed(self.client.get(&url), &auth_key);
            match req.send().await {
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

    fn is_access_restricted_page(&self, html: &str) -> bool {
        let body = html.to_ascii_lowercase();
        body.contains("login")
            || body.contains("sign in")
            || body.contains("account required")
            || body.contains("members only")
            || body.contains("access denied")
            || body.contains("waitlist")
            || body.contains("premium")
    }

    async fn request_text_with_retry(&self, url: &str, context: &str) -> Result<String> {
        let mut last_error = None;
        let auth_key = self.get_auth_key().await;

        for attempt in 1..=DOWNLOAD_RETRY_ATTEMPTS {
            let req = self.with_auth_if_needed(self.client.get(url), &auth_key);
            match req.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        return resp.text().await.map_err(|e| {
                            ShioriError::Other(format!(
                                "Anna's {} response could not be read: {}",
                                context, e
                            ))
                        });
                    }

                    let should_retry = RETRYABLE_STATUS_CODES.contains(&status)
                        || status.is_server_error();
                    let status_msg = format!(
                        "Anna's {} request failed (status {}{})",
                        context,
                        status,
                        if attempt < DOWNLOAD_RETRY_ATTEMPTS {
                            format!(", retry {}/{}", attempt, DOWNLOAD_RETRY_ATTEMPTS)
                        } else {
                            String::new()
                        }
                    );

                    if should_retry && attempt < DOWNLOAD_RETRY_ATTEMPTS {
                        tokio::time::sleep(Duration::from_millis((attempt as u64) * 350)).await;
                        last_error = Some(status_msg);
                        continue;
                    }

                    return Err(ShioriError::Other(status_msg));
                }
                Err(e) => {
                    let msg = format!(
                        "Anna's {} request error (attempt {}/{}): {}",
                        context, attempt, DOWNLOAD_RETRY_ATTEMPTS, e
                    );
                    last_error = Some(msg);
                    if attempt < DOWNLOAD_RETRY_ATTEMPTS {
                        tokio::time::sleep(Duration::from_millis((attempt as u64) * 350)).await;
                        continue;
                    }
                }
            }
        }

        Err(ShioriError::Other(last_error.unwrap_or_else(|| {
            format!("Anna's {} request failed after retries", context)
        })))
    }

    async fn probe_fast_download_with_retry(&self, content_id: &str, key: &str) -> Result<Option<String>> {
        let mirror = self.working_mirror.read().await.clone();
        let fast_url = format!(
            "{}/fast_download/{}?key={}",
            mirror,
            content_id,
            urlencoding::encode(key)
        );

        let auth_key = self.get_auth_key().await;
        for attempt in 1..=DOWNLOAD_RETRY_ATTEMPTS {
            let req = self.with_auth_if_needed(self.client.get(&fast_url), &auth_key);
            match req.send().await {
                Ok(resp) if resp.status().is_success() => return Ok(Some(fast_url)),
                Ok(resp) => {
                    if resp.status() == reqwest::StatusCode::UNAUTHORIZED
                        || resp.status() == reqwest::StatusCode::FORBIDDEN
                    {
                        return Err(ShioriError::Other(
                            "Your Anna's Archive API key was rejected (401/403). Verify the key in source settings.".to_string(),
                        ));
                    }

                    if RETRYABLE_STATUS_CODES.contains(&resp.status()) && attempt < DOWNLOAD_RETRY_ATTEMPTS {
                        tokio::time::sleep(Duration::from_millis((attempt as u64) * 350)).await;
                        continue;
                    }

                    return Ok(None);
                }
                Err(_) if attempt < DOWNLOAD_RETRY_ATTEMPTS => {
                    tokio::time::sleep(Duration::from_millis((attempt as u64) * 350)).await;
                    continue;
                }
                Err(_) => return Ok(None),
            }
        }

        Ok(None)
    }

    /// Extract all download options from the detail page
    pub async fn get_download_options(&self, content_id: &str) -> Result<Vec<DownloadOption>> {
        let mirror = self.working_mirror.read().await.clone();
        let detail_url = format!("{}/md5/{}", mirror, content_id);
        let html = self.request_text_with_retry(&detail_url, "detail").await?;

        let doc = Html::parse_document(&html);
        let link_sel = Selector::parse("a[href], [data-href], [data-download]")
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;

        let mut options = Vec::new();
        let mut seen_urls = std::collections::HashSet::new();

        for el in doc.select(&link_sel) {
            let href = el.value()
                .attr("href")
                .or_else(|| el.value().attr("data-href"))
                .or_else(|| el.value().attr("data-download"));

            if let Some(h) = href {
                let normalized = self.normalize_href(h, &mirror);
                
                if seen_urls.contains(&normalized) {
                    continue;
                }

                if let Some(download_type) = self.classify_download_url(&normalized) {
                    seen_urls.insert(normalized.clone());
                    
                    let label = el.text().collect::<String>().trim().to_string();
                    options.push(DownloadOption {
                        url: normalized,
                        download_type,
                        label: if label.is_empty() { None } else { Some(label) },
                    });
                }
            }
        }

        // Sort by preference: magnet > torrent > direct > external
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
                    let size_pattern = regex::Regex::new(r"(\d+(?:\.\d+)?\s*(?:MB|KB|GB|bytes))").ok();
                    if let Some(re) = size_pattern {
                        if let Some(caps) = re.captures(&meta_text) {
                            file_size = Some(caps[1].to_string());
                        }
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

        // Try fast_download with API key first
        if let Some(key) = api_key {
            if let Some(fast_url) = self.probe_fast_download_with_retry(content_id, &key).await? {
                return Ok(vec![Page {
                    index: 0,
                    url: fast_url,
                }]);
            }
        }

        // Get all download options from detail page
        let options = self.get_download_options(content_id).await?;

        if options.is_empty() {
            let mirror = self.working_mirror.read().await.clone();
            let detail_url = format!("{}/md5/{}", mirror, content_id);
            let html = self.request_text_with_retry(&detail_url, "detail").await?;
            
            if self.is_access_restricted_page(&html) {
                return Err(ShioriError::Other(format!(
                    "This book requires account access. Open the detail page manually: {}",
                    detail_url
                )));
            }

            return Err(ShioriError::Other(format!(
                "No download links found. Open detail page manually: {}",
                detail_url
            )));
        }

        // Return pages with download type info in the URL (frontend will parse this)
        // Format: type|url for frontend to handle appropriately
        Ok(options.iter().enumerate().map(|(i, opt)| {
            Page {
                index: i as u32,
                url: format!("{}|{}", opt.download_type.as_str(), opt.url),
            }
        }).collect())
    }
}
