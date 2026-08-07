use std::collections::{HashMap, HashSet};
use std::time::Duration;

use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::error::{Result, ShioriError};
use crate::sources::{
    Chapter, ContentType, MirrorAttemptDiagnostic, Page, SearchResponse, SearchResult, Source,
    SourceMeta, SourceSearchDiagnostics,
};

const MIRRORS: &[&str] = &[
    "https://annas-archive.gl",
    "https://annas-archive.gd",
    "https://annas-archive.pk",
];
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MAX_LIMIT: u32 = 50;

// Selectors for the 2024-era Anna's Archive search layout (fallback layout).
const SEARCH_ITEM_SELECTOR: &str = "div.flex.pt-3.pb-3.border-b";
const TITLE_SELECTOR: &str = "a.font-semibold.text-lg";
const LINK_SELECTOR: &str = "a[href*=\"/md5/\"]";
const DESC_SELECTOR: &str = ".text-gray-600.mt-2";
const COVER_SELECTOR: &str = "img";
const META_TEXT_SELECTOR: &str = ".text-xs, .text-sm";

const EBOOK_FORMATS: &[&str] = &[
    "epub", "pdf", "mobi", "azw3", "azw", "fb2", "djvu", "cbr", "cbz", "txt", "rtf", "doc", "docx",
];
const LANGUAGES: &[&str] = &[
    "english", "spanish", "french", "german", "italian", "portuguese", "russian", "chinese",
    "japanese", "korean",
];

static SIZE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(\d+(?:\.\d+)?\s*(?:MB|KB|GB|bytes))").expect("valid Anna's Archive size regex")
});
static YEAR_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b(19|20)\d{2}\b").expect("valid year regex"));

/// True when a torrent-style URL on Anna's Archive domains is auth-gated and
/// should be skipped. Public `/dyn/small_file/torrents/...` links are kept.
fn is_blocked_annas_torrent_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();

    // Magnet links are always safe — they don't require any server request.
    if lower.starts_with("magnet:") {
        return false;
    }

    // Only evaluate Anna domains.
    let is_anna_domain = MIRRORS.iter().any(|m| lower.starts_with(&m.to_ascii_lowercase()))
        || lower.contains("annas-archive");
    if !is_anna_domain {
        return false;
    }

    // Public torrent files exposed by Anna should be kept.
    if lower.contains("/dyn/small_file/torrents/") {
        return false;
    }

    // Everything else on Anna domains is treated as non-public/auth-gated.
    true
}

#[derive(Debug, Clone, PartialEq, Eq)]
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

#[derive(Debug, Clone)]
pub struct DownloadOption {
    pub url: String,
    pub download_type: DownloadType,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnasArchiveConfig {
    pub base_url: Option<String>,
    pub auth_key: Option<String>,
    pub membership_key: Option<String>,
    pub auth_cookie: Option<String>,
    pub api_key: Option<String>,
}

pub struct AnnasArchiveSource {
    client: reqwest::Client,
    config: RwLock<AnnasArchiveConfig>,
}

impl AnnasArchiveSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| {
                ShioriError::Other(format!("Failed to create AnnasArchive client: {}", e))
            })?;

        Ok(Self {
            client,
            config: RwLock::new(AnnasArchiveConfig::default()),
        })
    }

    /// Mirrors to try, in order. Overridable via `ANNAS_ARCHIVE_MIRRORS`
    /// (comma-separated, trimmed, non-empty); read per request so operators
    /// and tests can reconfigure without restarting.
    fn mirrors() -> Vec<String> {
        if let Ok(env) = std::env::var("ANNAS_ARCHIVE_MIRRORS") {
            let parsed: Vec<String> = env
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            if !parsed.is_empty() {
                return parsed;
            }
        }
        MIRRORS.iter().map(|m| m.to_string()).collect()
    }

    pub async fn get_config(&self) -> AnnasArchiveConfig {
        self.config.read().await.clone()
    }

    pub async fn set_config(&self, config: AnnasArchiveConfig) {
        *self.config.write().await = config;
    }

    pub async fn load_config_from_store(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        use tauri_plugin_store::StoreExt;

        let store = app_handle
            .store("sources.json")
            .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

        let read = |key: &str| {
            store
                .get(key)
                .and_then(|v| v.as_str().map(ToString::to_string))
                .filter(|s| !s.is_empty())
        };

        let config = AnnasArchiveConfig {
            base_url: read("annas-archive.baseUrl"),
            auth_key: read("annas-archive.authKey"),
            membership_key: read("annas-archive.membershipKey"),
            auth_cookie: read("annas-archive.authCookie"),
            api_key: read("annas-archive.apiKey"),
        };
        self.set_config(config).await;
        Ok(())
    }

    pub async fn save_config_to_store(
        &self,
        app_handle: &tauri::AppHandle,
        config: AnnasArchiveConfig,
    ) -> Result<()> {
        use tauri_plugin_store::StoreExt;

        let store = app_handle
            .store("sources.json")
            .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

        let save = |key: &str, val: &Option<String>| match val.as_deref() {
            Some(v) if !v.trim().is_empty() => {
                store.set(key.to_string(), serde_json::json!(v.trim()));
            }
            _ => {
                let _ = store.delete(key);
            }
        };

        save("annas-archive.baseUrl", &config.base_url);
        save("annas-archive.authKey", &config.auth_key);
        save("annas-archive.membershipKey", &config.membership_key);
        save("annas-archive.authCookie", &config.auth_cookie);
        save("annas-archive.apiKey", &config.api_key);

        store
            .save()
            .map_err(|e| ShioriError::Other(format!("Failed to save source config: {}", e)))?;

        self.set_config(config).await;
        Ok(())
    }

    fn normalize_href(href: &str, base: &str) -> String {
        if href.starts_with("http://")
            || href.starts_with("https://")
            || href.starts_with("magnet:")
            || href.starts_with("ipfs:")
        {
            href.to_string()
        } else if href.starts_with("//") {
            format!("https:{}", href)
        } else if href.starts_with('/') {
            format!("{}{}", base, href)
        } else {
            format!("{}/{}", base, href)
        }
    }

    /// Pull a 32-hex md5 out of an Anna's Archive detail href.
    fn extract_md5(href: &str) -> Option<String> {
        let idx = href.find("/md5/")?;
        let rest = &href[idx + "/md5/".len()..];
        let md5: String = rest.chars().take_while(|c| c.is_ascii_hexdigit()).collect();
        if md5.len() == 32 {
            Some(md5)
        } else {
            None
        }
    }

    fn first_nonempty_line(text: &str) -> Option<String> {
        text.lines()
            .map(|l| l.trim())
            .find(|l| !l.is_empty())
            .map(ToString::to_string)
    }

    fn rewrite_ipfs(url: &str) -> String {
        url.replace("ipfs://", "https://ipfs.io/ipfs/")
    }

    fn classify_download_url(href: &str) -> Option<DownloadType> {
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

        let external_patterns = ["libgen", "ipfs", "/zlib/", "/scimag/", "/doi/"];
        if external_patterns.iter().any(|p| href_l.contains(p)) {
            return Some(DownloadType::External);
        }

        None
    }

    /// Fetch a path through the mirror list, returning (html, successful mirror).
    async fn request_with_mirrors(&self, path: &str) -> Result<(String, String)> {
        for mirror in Self::mirrors() {
            let url = format!("{}{}", mirror, path);
            match self.client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    let text = resp.text().await.map_err(|e| {
                        ShioriError::Other(format!("Failed to read response: {}", e))
                    })?;
                    return Ok((text, mirror));
                }
                _ => continue,
            }
        }

        Err(ShioriError::Other(
            "All Anna's Archive mirrors are unavailable. Check your network connection or try again later."
                .to_string(),
        ))
    }

    /// Extract one normalized `SearchResult` from a result row. Missing
    /// metadata fields are simply omitted — a row never fails as a whole.
    fn extract_result(
        &self,
        row: &scraper::ElementRef<'_>,
        anchor: &scraper::ElementRef<'_>,
        md5: String,
        mirror: &str,
    ) -> Option<SearchResult> {
        let title_sel = Selector::parse(TITLE_SELECTOR).unwrap();
        let desc_sel = Selector::parse(DESC_SELECTOR).unwrap();
        let cover_sel = Selector::parse(COVER_SELECTOR).unwrap();
        let meta_sel = Selector::parse(META_TEXT_SELECTOR).unwrap();

        let href = anchor.value().attr("href")?;
        let detail_url = Self::normalize_href(href, mirror);

        // Title: prefer a dedicated title element in the row; fall back to the
        // first non-empty line of the anchor text.
        let anchor_text = anchor.text().collect::<String>();
        let title = row
            .select(&title_sel)
            .next()
            .map(|e| e.text().collect::<String>())
            .and_then(|t| Self::first_nonempty_line(&t))
            .or_else(|| Self::first_nonempty_line(&anchor_text))
            .unwrap_or_else(|| "Untitled".to_string());

        // Description (old layout only).
        let description = row
            .select(&desc_sel)
            .next()
            .map(|e| e.text().collect::<String>().trim().to_string())
            .filter(|s| !s.is_empty());

        // Cover: real image when present, else the pseudo cover endpoint.
        let cover_url = row
            .select(&cover_sel)
            .next()
            .and_then(|img| {
                img.value()
                    .attr("src")
                    .or_else(|| img.value().attr("data-src"))
                    .or_else(|| img.value().attr("data-lazy-src"))
            })
            .filter(|s| !s.is_empty() && !s.contains("data:image") && !s.contains("blank"))
            .map(|s| Self::normalize_href(s, mirror))
            .or(Some(format!("{}/book/covers/{}", mirror, md5)));

        // Metadata: dedicated meta elements (.text-xs/.text-sm), else lines.
        let mut meta_texts: Vec<String> = row
            .select(&meta_sel)
            .map(|e| e.text().collect::<String>().trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if meta_texts.is_empty() {
            meta_texts = row
                .text()
                .collect::<String>()
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect();
        }

        let full_text = row.text().collect::<String>();
        let full_text_lower = full_text.to_lowercase();

        let mut extra = HashMap::new();
        extra.insert("md5".to_string(), md5.clone());
        extra.insert("detail_url".to_string(), detail_url);

        // File format from the full row text.
        let mut detected_format: Option<String> = None;
        for fmt in EBOOK_FORMATS {
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
        if let Some(fmt) = detected_format {
            extra.insert("format".to_string(), fmt);
        }

        let mut author: Option<String> = None;
        let mut file_size: Option<String> = None;
        let mut language: Option<String> = None;
        let mut year: Option<String> = None;

        for meta_text in &meta_texts {
            let meta_lower = meta_text.to_lowercase();

            // Skip if it's the description or title.
            if meta_text.len() > 200 || *meta_text == title {
                continue;
            }

            if file_size.is_none() {
                if let Some(caps) = SIZE_RE.captures(meta_text) {
                    file_size = Some(caps[1].to_string());
                }
            }

            if language.is_none() {
                for lang in LANGUAGES {
                    if meta_lower.contains(lang) {
                        language = Some(lang[0..1].to_uppercase() + &lang[1..]);
                        break;
                    }
                }
            }

            if year.is_none() {
                if let Some(caps) = YEAR_RE.captures(meta_text) {
                    year = Some(caps[0].to_string());
                }
            }

            // Author heuristic: a short text line that isn't size/format/etc.
            if author.is_none()
                && !meta_lower.contains("mb")
                && !meta_lower.contains("kb")
                && !meta_lower.contains("page")
                && !EBOOK_FORMATS.iter().any(|f| meta_lower.contains(f))
                && meta_text.len() > 2
                && meta_text.len() < 100
                && !meta_text.starts_with("http")
            {
                let has_letters = meta_text.chars().any(|c| c.is_alphabetic());
                let word_count = meta_text.split_whitespace().count();
                if has_letters && (1..=6).contains(&word_count) {
                    author = Some(meta_text.clone());
                }
            }
        }

        if let Some(a) = author {
            extra.insert("author".to_string(), a);
        }
        if let Some(y) = year {
            extra.insert("year".to_string(), y);
        }
        if let Some(l) = language {
            extra.insert("language".to_string(), l);
        }
        if let Some(s) = file_size {
            extra.insert("file_size".to_string(), s);
        }

        Some(SearchResult {
            id: format!("anna-{}", md5),
            title,
            cover_url,
            description,
            source_id: "annas-archive".to_string(),
            extra,
        })
    }

    /// Parse search-result rows from both the current (`a.js-vim-focus`) and
    /// the 2024-era (`div.flex.pt-3.pb-3.border-b`) layouts, deduped by md5.
    fn parse_search_results(&self, html: &str, mirror: &str) -> Vec<SearchResult> {
        let doc = Html::parse_document(html);
        let focus_sel = Selector::parse("a.js-vim-focus").unwrap();
        let item_sel = Selector::parse(SEARCH_ITEM_SELECTOR).unwrap();
        let link_sel = Selector::parse(LINK_SELECTOR).unwrap();

        let mut out: Vec<SearchResult> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        // Primary: current layout — a.js-vim-focus anchors; a row is the
        // anchor's parent container.
        for node in doc.select(&focus_sel) {
            let href = node.value().attr("href").unwrap_or_default();
            let Some(md5) = Self::extract_md5(href) else {
                continue;
            };
            if !seen.insert(md5.clone()) {
                continue;
            }

            let row = node
                .parent()
                .and_then(scraper::ElementRef::wrap)
                .unwrap_or(node);

            if let Some(result) = self.extract_result(&row, &node, md5, mirror) {
                out.push(result);
            }
        }

        // Fallback: 2024-era layout rows.
        for item in doc.select(&item_sel) {
            let Some(link) = item.select(&link_sel).next() else {
                continue;
            };
            let href = link.value().attr("href").unwrap_or_default();
            let Some(md5) = Self::extract_md5(href) else {
                continue;
            };
            if !seen.insert(md5.clone()) {
                continue;
            }

            if let Some(result) = self.extract_result(&item, &link, md5, mirror) {
                out.push(result);
            }
        }

        out
    }

    /// Scrape the detail page through the mirror list and classify every
    /// `a[href]` into typed download options: Magnet(0), Direct(1),
    /// External(2), Torrent(3); deduped by `type|url`.
    pub async fn get_download_options(&self, content_id: &str) -> Result<Vec<DownloadOption>> {
        let content_id = content_id.strip_prefix("anna-").unwrap_or(content_id);
        if content_id.trim().is_empty() {
            return Ok(vec![]);
        }

        let path = format!("/md5/{}", content_id);
        let (html, mirror) = self.request_with_mirrors(&path).await?;

        let document = Html::parse_document(&html);
        let link_selector = Selector::parse("a[href]").unwrap();

        let mut options = Vec::new();
        for anchor in document.select(&link_selector) {
            let href = anchor.value().attr("href").unwrap_or_default();
            let normalized = Self::normalize_href(href, &mirror);
            let Some(download_type) = Self::classify_download_url(&normalized) else {
                continue;
            };

            // Drop auth-gated Anna-domain torrent links; keep public
            // /dyn/small_file/torrents/... torrents and non-Anna links.
            if matches!(download_type, DownloadType::Magnet | DownloadType::Torrent)
                && is_blocked_annas_torrent_url(&normalized)
            {
                continue;
            }

            options.push(DownloadOption {
                url: normalized,
                download_type,
                label: None,
            });
        }

        let mut unique = HashSet::new();
        options.retain(|o| unique.insert(format!("{}|{}", o.download_type.as_str(), o.url)));

        options.sort_by_key(|o| match o.download_type {
            DownloadType::Magnet => 0,
            DownloadType::Direct => 1,
            DownloadType::External => 2,
            DownloadType::Torrent => 3,
        });

        Ok(options)
    }

    async fn search_internal(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        let safe_page = page.max(1);
        let safe_limit = limit.clamp(1, MAX_LIMIT);

        let start_time = std::time::Instant::now();
        let mut diagnostics = SourceSearchDiagnostics {
            source_id: "annas-archive".to_string(),
            source_name: Some("Anna's Archive".to_string()),
            selected_mirror: None,
            selected_base: None,
            attempted_mirrors: Vec::new(),
            duration_ms: 0,
            result_count: 0,
            retries_used: Some(0),
        };

        let page_param = if safe_page > 1 {
            format!("&page={}", safe_page)
        } else {
            String::new()
        };

        let mut html = String::new();
        let mut successful_mirror = String::new();

        for mirror in Self::mirrors() {
            let url = format!(
                "{}/search?q={}&lang=en{}",
                mirror,
                urlencoding::encode(query),
                page_param
            );

            match self.client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(text) = resp.text().await {
                        html = text;
                        successful_mirror = mirror.to_string();
                        diagnostics.attempted_mirrors.push(MirrorAttemptDiagnostic {
                            mirror: mirror.to_string(),
                            success: true,
                            error: None,
                        });
                        break;
                    }
                }
                Ok(resp) => {
                    diagnostics.attempted_mirrors.push(MirrorAttemptDiagnostic {
                        mirror: mirror.to_string(),
                        success: false,
                        error: Some(format!("Status {}", resp.status())),
                    });
                }
                Err(e) => {
                    diagnostics.attempted_mirrors.push(MirrorAttemptDiagnostic {
                        mirror: mirror.to_string(),
                        success: false,
                        error: Some(e.to_string()),
                    });
                }
            }
        }

        if html.is_empty() {
            return Err(ShioriError::Other(
                "All Anna's Archive mirrors failed".to_string(),
            ));
        }

        diagnostics.selected_mirror = Some(successful_mirror.clone());
        diagnostics.selected_base = Some(successful_mirror.clone());

        let mut items = self.parse_search_results(&html, &successful_mirror);
        if items.len() > safe_limit as usize {
            items.truncate(safe_limit as usize);
        }

        diagnostics.duration_ms = start_time.elapsed().as_millis() as u64;
        diagnostics.result_count = items.len() as u32;

        Ok(SearchResponse {
            items,
            total: None,
            offset: Some((safe_page - 1) * safe_limit),
            limit: Some(safe_limit),
            diagnostics: Some(diagnostics),
        })
    }
}

#[async_trait::async_trait]
impl Source for AnnasArchiveSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "annas-archive".to_string(),
            name: "Anna's Archive".to_string(),
            base_url: MIRRORS[0].to_string(),
            version: "1.0.0".to_string(),
            content_type: ContentType::Book,
            supports_search: true,
            supports_download: true,
            requires_api_key: false,
            nsfw: false,
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
            title: "Download Links".to_string(),
            number: 1.0,
            volume: None,
            uploaded_at: None,
            source_id: "annas-archive".to_string(),
            content_id: content_id.to_string(),
        }])
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        // Reuses get_download_options so the detail page is only scraped once.
        // Keeps the Page.url prefix contract the frontend depends on:
        // "magnet|", "torrent|", "direct|".
        let options = self.get_download_options(chapter_id).await?;

        let mut pages = Vec::new();

        for (index, option) in options.into_iter().enumerate() {
            let (kind, url) = match option.download_type {
                DownloadType::Magnet => ("magnet", option.url),
                DownloadType::Torrent => ("torrent", option.url),
                DownloadType::Direct => ("direct", option.url),
                // External links (libgen, ipfs, ...) are still directly fetchable.
                DownloadType::External => ("direct", Self::rewrite_ipfs(&option.url)),
            };
            pages.push(Page {
                index: index as u32,
                url: format!("{}|{}", kind, url),
            });
        }

        pages.dedup_by(|a, b| a.url == b.url);

        if pages.is_empty() {
            return Err(ShioriError::Other("No download links found".to_string()));
        }

        Ok(pages)
    }
}
