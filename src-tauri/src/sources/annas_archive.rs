#![allow(dead_code)]
use once_cell::sync::Lazy;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use std::time::Instant;
use tokio::sync::RwLock;

use crate::error::{Result, ShioriError};
use crate::sources::{
    Chapter, ContentType, MirrorAttemptDiagnostic, Page, SearchResponse, SearchResult, Source,
    SourceMeta, SourceSearchDiagnostics,
};

// Legal disclaimer:
// This is a community-contributed plugin. Users are solely responsible 
// for complying with all local laws and copyright restrictions.
const MIRROR_URLS: [&str; 4] = [
    "https://annas-archive.gl",
    "https://annas-archive.gs",
    "https://annas-archive.gd",
    "https://annas-archive.pk",
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
static SIZE_RE: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"(\d+(?:\.\d+)?\s*(?:MB|KB|GB|bytes))")
        .expect("valid Anna's Archive size regex")
});
static MAGNET_RE: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r#"magnet:\?[^\s"'<>]+"#)
        .expect("valid magnet regex")
});
static TORRENT_URL_RE: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r#"(?:https?://[^\s"'<>]+|/[^\s"'<>]+)(?:\.torrent[^\s"'<>]*)"#)
        .expect("valid torrent url regex")
});

/// Returns true for ANY http/https torrent-style URL on an Anna's Archive mirror domain.
/// All such links require a login session and will either 404 or return a Cloudflare
/// challenge page anonymously. Only magnet links and torrent URLs from external domains
/// (e.g. libgen.rs) should be trusted.
fn is_annas_domain_torrent_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();

    // Magnet links are always safe — they don't require any server request.
    if lower.starts_with("magnet:") {
        return false;
    }

    // Only flag http/https URLs from Anna's Archive mirror hosts.
    let is_anna_domain = MIRROR_URLS.iter().any(|m| lower.starts_with(&m.to_ascii_lowercase()))
        || lower.contains("annas-archive");

    is_anna_domain
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
            working_mirror: RwLock::new(MIRROR_URLS[0].to_string()),
        })
    }

    pub async fn get_config(&self) -> AnnasArchiveConfig {
        AnnasArchiveConfig {
            api_key: None,
        }
    }

    pub async fn set_config(&self, config: AnnasArchiveConfig) {
        let _ = config;
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

    async fn scrape_detail_torrent_links(&self, content_id: &str) -> Result<Vec<String>> {
        if content_id.trim().is_empty() {
            return Ok(vec![]);
        }

        let path = format!("/md5/{}", content_id);
        let (html, mirror) = self.request_with_mirrors(&path).await?;
        let document = Html::parse_document(&html);
        let link_selector = Selector::parse("a[href]")
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;

        let mut links: Vec<String> = Vec::new();

        for anchor in document.select(&link_selector) {
            if let Some(href) = anchor.value().attr("href") {
                let normalized = self.normalize_href(href, &mirror);
                if matches!(
                    self.classify_download_url(&normalized),
                    Some(DownloadType::Magnet | DownloadType::Torrent)
                ) {
                    links.push(normalized);
                }
            }
        }

        for matched in MAGNET_RE.find_iter(&html) {
            links.push(matched.as_str().to_string());
        }

        for matched in TORRENT_URL_RE.find_iter(&html) {
            let raw = matched
                .as_str()
                .trim_matches('"')
                .trim_matches('\'')
                .trim();

            if raw.is_empty() {
                continue;
            }

            let normalized = self.normalize_href(raw, &mirror);
            if matches!(
                self.classify_download_url(&normalized),
                Some(DownloadType::Magnet | DownloadType::Torrent)
            ) {
                links.push(normalized);
            }
        }

        // Drop ALL http/https torrent-style URLs from Anna's Archive mirror domains.
        // Their .torrent CDN links require session auth and return 404 or Cloudflare
        // challenge pages anonymously. Only magnet links (and external-domain torrents)
        // are safe to use without cookies.
        links.retain(|link| !is_annas_domain_torrent_url(link));

        // Deduplicate and sort: magnets first, then external torrent URLs.
        links.sort_by_key(|l| if l.starts_with("magnet:") { 0u8 } else { 1u8 });
        links.dedup();
        Ok(links)
    }

    pub async fn load_config_from_store(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        use tauri_plugin_store::StoreExt;

        let store = app_handle
            .store("sources.json")
            .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

        let _ = store.delete("anna-archive.api_key");
        let _ = store.save();

        self.set_config(AnnasArchiveConfig { api_key: None }).await;

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

        let _ = store.delete("anna-archive.api_key");

        store
            .save()
            .map_err(|e| ShioriError::Other(format!("Failed to save source config: {}", e)))?;

        self.set_config(config).await;
        Ok(())
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

    async fn request_with_mirrors_with_attempts(
        &self,
        path: &str,
    ) -> Result<(String, String, Vec<MirrorAttemptDiagnostic>)> {
        let mirrors = self.candidate_mirrors().await;
        let mut attempts = Vec::new();

        for mirror in mirrors {
            let url = format!("{}{}", mirror, path);
            match self.client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    attempts.push(MirrorAttemptDiagnostic {
                        mirror: mirror.clone(),
                        success: true,
                        error: None,
                    });
                    let text = resp.text().await.map_err(|e| {
                        ShioriError::Other(format!("Failed to read response: {}", e))
                    })?;

                    let mut guard = self.working_mirror.write().await;
                    *guard = mirror.clone();

                    return Ok((text, mirror, attempts));
                }
                Ok(resp) => {
                    attempts.push(MirrorAttemptDiagnostic {
                        mirror,
                        success: false,
                        error: Some(format!("status {}", resp.status())),
                    });
                }
                Err(err) => {
                    attempts.push(MirrorAttemptDiagnostic {
                        mirror,
                        success: false,
                        error: Some(err.to_string()),
                    });
                }
            }
        }

        Err(ShioriError::Other(
            "All Anna's Archive mirrors are unavailable. Check your network connection or try again later.".to_string(),
        ))
    }

    fn parse_search_results(&self, html: &str, mirror: &str) -> Result<Vec<SearchResult>> {
        let doc = Html::parse_document(html);
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
                .map(|s| self.normalize_href(s, mirror));

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
        let links = self
            .scrape_detail_torrent_links(content_id)
            .await
            .unwrap_or_default();
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
            requires_api_key: false,
            nsfw: false,
        }
    }

    async fn search(&self, query: &str, page: u32) -> Result<Vec<SearchResult>> {
        Ok(self.search_with_meta(query, page, 20).await?.items)
    }

    async fn search_with_meta(&self, query: &str, _page: u32, limit: u32) -> Result<SearchResponse> {
        let started = Instant::now();
        let path = format!("/search?q={}", urlencoding::encode(query));
        let (html, mirror, attempted_mirrors) = self.request_with_mirrors_with_attempts(&path).await?;
        let mut items = self.parse_search_results(&html, &mirror)?;
        let safe_limit = limit.max(1) as usize;
        if items.len() > safe_limit {
            items.truncate(safe_limit);
        }

        Ok(SearchResponse {
            total: None,
            offset: Some(0),
            limit: Some(limit.max(1)),
            diagnostics: Some(SourceSearchDiagnostics {
                source_id: "anna-archive".to_string(),
                source_name: Some("Anna's Archive".to_string()),
                selected_mirror: Some(mirror.clone()),
                selected_base: Some(mirror),
                attempted_mirrors,
                duration_ms: started.elapsed().as_millis() as u64,
                result_count: items.len() as u32,
                retries_used: None,
            }),
            items,
        })
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
        let scraped_links = self
            .scrape_detail_torrent_links(content_id)
            .await
            .unwrap_or_default();

        let mut urls = Vec::new();

        for link in scraped_links {
            let lowered = link.to_ascii_lowercase();
            let kind = if lowered.starts_with("magnet:") {
                "magnet"
            } else if lowered.contains(".torrent") || lowered.contains("/torrent") {
                "torrent"
            } else {
                continue;
            };

            urls.push(format!("{}|{}", kind, link));
        }

        let mut unique = std::collections::HashSet::new();
        urls.retain(|url| unique.insert(url.clone()));

        if urls.is_empty() {
            let mirror = self.working_mirror.read().await.clone();
            let anna_detail_link = format!("{}/md5/{}", mirror, content_id);
            urls.push(format!("anna|{}", anna_detail_link));
        }

        Ok(urls
            .into_iter()
            .enumerate()
            .map(|(index, url)| Page {
                index: index as u32,
                url,
            })
            .collect())
    }
}
