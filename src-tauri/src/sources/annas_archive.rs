use scraper::{Html, Selector};
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::RwLock;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

// Legal disclaimer:
// This integration only indexes publicly reachable metadata/search pages.
// Users are solely responsible for complying with all local laws,
// copyright restrictions, and source-site terms of service.
const BASE_URL: &str = "https://annas-archive.org";
const SEARCH_ITEM_SELECTOR: &str = r".h-\[125\]";
const TITLE_SELECTOR: &str = "h3";
const LINK_SELECTOR: &str = "a";
const DESC_SELECTOR: &str = r".max-lg\:line-clamp-2";
const DOWNLOAD_RETRY_ATTEMPTS: usize = 3;
const RETRYABLE_STATUS_CODES: [reqwest::StatusCode; 4] = [
    reqwest::StatusCode::TOO_MANY_REQUESTS,
    reqwest::StatusCode::BAD_GATEWAY,
    reqwest::StatusCode::SERVICE_UNAVAILABLE,
    reqwest::StatusCode::GATEWAY_TIMEOUT,
];

// Legal disclaimer:
// Do not use this source to bypass licensing or paywalls.
// It is intended for lawful personal archival/retrieval workflows only.
pub struct AnnasArchiveSource {
    client: reqwest::Client,
    api_key: RwLock<Option<String>>,
}

impl AnnasArchiveSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create Anna's Archive client: {}", e)))?;
        Ok(Self {
            client,
            api_key: RwLock::new(None),
        })
    }

    pub async fn set_api_key(&self, key: Option<String>) {
        let mut guard = self.api_key.write().await;
        *guard = key;
    }

    pub async fn load_api_key_from_store(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        use tauri_plugin_store::StoreExt;

        let store = app_handle
            .store("sources.json")
            .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;
        let value = store
            .get("anna-archive.api_key")
            .and_then(|v| v.as_str().map(ToString::to_string));
        self.set_api_key(value).await;
        Ok(())
    }

    fn normalize_href(&self, href: &str) -> String {
        if href.starts_with("http://") || href.starts_with("https://") {
            href.to_string()
        } else {
            format!("{}{}", BASE_URL, href)
        }
    }

    fn looks_like_download_link(&self, href: &str) -> bool {
        let href_l = href.to_ascii_lowercase();
        let patterns = [
            "/download/",
            "/slow_download/",
            "/fast_download/",
            "/dyn/api/fast_download",
            "libgen",
            "ipfs",
            "/torrent",
            "magnet:?",
            "/zlib/",
            "/scimag/",
            "/doi/",
        ];

        patterns.iter().any(|p| href_l.contains(p))
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
            || body.contains("slow partner")
    }

    async fn request_text_with_retry(&self, url: &str, context: &str) -> Result<String> {
        let mut last_error = None;

        for attempt in 1..=DOWNLOAD_RETRY_ATTEMPTS {
            match self.client.get(url).send().await {
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
        let fast_url = format!(
            "{}/fast_download/{}?key={}",
            BASE_URL,
            content_id,
            urlencoding::encode(key)
        );

        for attempt in 1..=DOWNLOAD_RETRY_ATTEMPTS {
            match self.client.get(&fast_url).send().await {
                Ok(resp) if resp.status().is_success() => return Ok(Some(fast_url)),
                Ok(resp) => {
                    if resp.status() == reqwest::StatusCode::UNAUTHORIZED
                        || resp.status() == reqwest::StatusCode::FORBIDDEN
                    {
                        return Err(ShioriError::Other(
                            "Your Anna's Archive API key was rejected (401/403). Verify the key in source settings or use manual download links from the detail page.".to_string(),
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
}

#[async_trait::async_trait]
impl Source for AnnasArchiveSource {
    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "anna-archive".to_string(),
            name: "Anna's Archive".to_string(),
            base_url: BASE_URL.to_string(),
            version: "1.0.0".to_string(),
            content_type: ContentType::Book,
            supports_search: true,
            supports_download: true,
            requires_api_key: true,
            nsfw: false,
        }
    }

    async fn search(&self, query: &str, _page: u32) -> Result<Vec<SearchResult>> {
        let url = format!("{}/search?q={}", BASE_URL, urlencoding::encode(query));
        let html = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Anna's search request failed: {}", e)))?
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("Anna's search parse failed: {}", e)))?;

        let doc = Html::parse_document(&html);
        let item_sel = Selector::parse(SEARCH_ITEM_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let title_sel = Selector::parse(TITLE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let link_sel = Selector::parse(LINK_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let desc_sel = Selector::parse(DESC_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let mut out = Vec::new();
        for item in doc.select(&item_sel) {
            let link = item.select(&link_sel).next();
            let href = link.and_then(|a| a.value().attr("href")).map(|h| {
                if h.starts_with("http") {
                    h.to_string()
                } else {
                    format!("{}{}", BASE_URL, h)
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

            out.push(SearchResult {
                id,
                title,
                cover_url: None,
                description: summary.or(href),
                source_id: "anna-archive".to_string(),
                extra: HashMap::new(),
            });
        }

        Ok(out)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        // Synthetic single chapter for document-style sources.
        Ok(vec![Chapter {
            id: "full_document".to_string(),
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

        // fast_download path first when API key is available in config.
        if let Some(key) = api_key {
            if let Some(fast_url) = self.probe_fast_download_with_retry(content_id, &key).await? {
                return Ok(vec![Page {
                    index: 0,
                    url: fast_url,
                }]);
            }
        }

        // Fallback page-resolution logic: inspect md5 detail page for direct links.
        let detail_url = format!("{}/md5/{}", BASE_URL, content_id);
        let html = self
            .request_text_with_retry(&detail_url, "detail")
            .await
            .map_err(|e| {
                ShioriError::Other(format!(
                    "Could not open Anna's Archive detail page for this item. Try again, verify network access, or open it manually: {}. Technical detail: {}",
                    detail_url,
                    e
                ))
            })?;

        let doc = Html::parse_document(&html);
        let link_sel = Selector::parse("a, .js-download-link, [data-download], [data-href]")
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let links: Vec<String> = doc
            .select(&link_sel)
            .filter_map(|a| {
                a.value()
                    .attr("href")
                    .or_else(|| a.value().attr("data-href"))
                    .or_else(|| a.value().attr("data-download"))
            })
            .map(|h| self.normalize_href(h))
            .collect();

        if let Some(download_url) = links.iter().find(|href| self.looks_like_download_link(href)) {
            return Ok(vec![Page {
                index: 0,
                url: download_url.to_string(),
            }]);
        }

        if self.is_access_restricted_page(&html) {
            return Err(ShioriError::Other(format!(
                "This book appears to require an Anna's Archive account, waitlist access, or another external mirror (for example LibGen/IPFS). Open the detail page and choose an available mirror manually: {}",
                detail_url
            )));
        }

        if !links.is_empty() {
            return Err(ShioriError::Other(format!(
                "No direct download link matched supported patterns on this page. The item may require mirror selection (LibGen/IPFS/torrent) or account access. Open detail page manually: {}",
                detail_url
            )));
        }

        Err(ShioriError::Other(format!(
            "No download links were found on Anna's Archive detail page. The file may be unavailable, removed, or access-restricted. Open this page manually to verify options: {}",
            detail_url
        )))
    }
}
