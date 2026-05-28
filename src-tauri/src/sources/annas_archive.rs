use std::collections::HashMap;
use std::time::Duration;

use scraper::{Html, Selector};

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, MirrorAttemptDiagnostic, Page, SearchResponse, SearchResult, Source, SourceMeta, SourceSearchDiagnostics};

const MIRRORS: &[&str] = &[
    "https://annas-archive.gl",
    "https://annas-archive.gd",
    "https://annas-archive.pk",
];
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MAX_LIMIT: u32 = 50;

pub struct AnnasArchiveSource {
    client: reqwest::Client,
}

impl AnnasArchiveSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create AnnasArchive client: {}", e)))?;

        Ok(Self { client })
    }

    fn normalize_href(href: &str, base: &str) -> String {
        if href.starts_with("http://") || href.starts_with("https://") {
            href.to_string()
        } else {
            format!("{}{}", base, href)
        }
    }

    async fn search_internal(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        let safe_page = page.max(1);
        let safe_limit = limit.max(1).min(MAX_LIMIT);
        
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

        let mut html = String::new();
        let mut successful_mirror = String::new();

        for mirror in MIRRORS {
            let url = format!("{}/search?q={}&lang=en", mirror, urlencoding::encode(query));
            
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
            return Err(ShioriError::Other("All Anna's Archive mirrors failed".to_string()));
        }

        diagnostics.selected_mirror = Some(successful_mirror.clone());
        diagnostics.selected_base = Some(successful_mirror.clone());

        let doc = Html::parse_document(&html);
        let result_sel = Selector::parse("a.js-vim-focus").unwrap();

        let mut items = Vec::new();

        for node in doc.select(&result_sel) {
            let title = node.text().collect::<String>().trim().to_string();
            let href = node.value().attr("href").unwrap_or_default();
            
            if title.is_empty() || !href.starts_with("/md5/") {
                continue;
            }

            let md5 = href.replace("/md5/", "").trim().to_string();
            if md5.len() != 32 {
                continue;
            }

            let mut extra = HashMap::new();
            extra.insert("detail_url".to_string(), format!("{}{}", successful_mirror, href));
            extra.insert("md5".to_string(), md5.clone());

            items.push(SearchResult {
                id: format!("anna-{}", md5),
                title,
                cover_url: Some(format!("{}/book/covers/{}", successful_mirror, md5)), // Pseudo-cover URL or leave None if parsing complex
                description: None,
                source_id: "annas-archive".to_string(),
                extra,
            });

            if items.len() >= safe_limit as usize {
                break;
            }
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
        let md5 = if chapter_id.starts_with("anna-") {
            &chapter_id[5..]
        } else {
            chapter_id
        };

        let mut html = String::new();
        let mut successful_mirror = String::new();

        for mirror in MIRRORS {
            let url = format!("{}/md5/{}", mirror, md5);
            match self.client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(text) = resp.text().await {
                        html = text;
                        successful_mirror = mirror.to_string();
                        break;
                    }
                }
                _ => continue,
            }
        }

        if html.is_empty() {
            return Err(ShioriError::Other("Failed to load Anna's Archive detail page".to_string()));
        }

        let doc = Html::parse_document(&html);
        let link_sel = Selector::parse("a[href]").unwrap();
        
        let mut pages = Vec::new();
        let mut index = 0;
        
        for node in doc.select(&link_sel) {
            let href = node.value().attr("href").unwrap_or_default();
            let text = node.text().collect::<String>().to_lowercase();
            
            if href.starts_with("magnet:") {
                pages.push(Page { index, url: format!("magnet|{}", href) });
                index += 1;
            } else if href.contains(".torrent") {
                pages.push(Page { index, url: format!("torrent|{}", Self::normalize_href(href, &successful_mirror)) });
                index += 1;
            } else if (text.contains("libgen") || text.contains("z-library") || text.contains("scihub") || text.contains("fast") || text.contains("slow")) && (href.starts_with("http") || href.starts_with("/download")) {
                pages.push(Page { index, url: format!("direct|{}", Self::normalize_href(href, &successful_mirror)) });
                index += 1;
            } else if href.starts_with("ipfs://") {
                pages.push(Page { index, url: format!("direct|{}", href.replace("ipfs://", "https://ipfs.io/ipfs/")) });
                index += 1;
            }
        }

        pages.dedup_by(|a, b| a.url == b.url);

        if pages.is_empty() {
            return Err(ShioriError::Other("No download links found".to_string()));
        }

        Ok(pages)
    }
}
