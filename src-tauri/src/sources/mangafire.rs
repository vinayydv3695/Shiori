use async_trait::async_trait;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[cfg(target_os = "android")]
use tauri_plugin_android_saf::AndroidSafExt;

use crate::cloudflare::client::CfClient;
use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

#[cfg(not(target_os = "android"))]
use crate::cloudflare::daemon::BrowserDaemon;

const BASE_URL: &str = "https://mangafire.to";

pub struct MangaFireSource {
    cf_client: RwLock<Option<Arc<CfClient>>>,
    #[cfg(not(target_os = "android"))]
    daemon: RwLock<Option<Arc<BrowserDaemon>>>,
    app_handle: RwLock<Option<tauri::AppHandle>>,
}

impl MangaFireSource {
    pub fn new() -> Self {
        Self {
            cf_client: RwLock::new(None),
            #[cfg(not(target_os = "android"))]
            daemon: RwLock::new(None),
            app_handle: RwLock::new(None),
        }
    }

    pub async fn set_cf_client(&self, cf: Arc<CfClient>, app_handle: tauri::AppHandle) {
        *self.cf_client.write().await = Some(cf);
        *self.app_handle.write().await = Some(app_handle);
    }
    
    #[cfg(not(target_os = "android"))]
    pub async fn init_daemon(&self) {
        use crate::cloudflare::browser::BrowserConfig;
        match BrowserDaemon::start(&BrowserConfig::default()).await {
            Ok(daemon) => {
                *self.daemon.write().await = Some(daemon);
                log::info!("MangaFire: BrowserDaemon started successfully");
            }
            Err(e) => {
                log::error!("MangaFire: Failed to start BrowserDaemon: {}", e);
            }
        }
    }

    async fn fetch_rpc(&self, url: &str) -> Result<String> {
        #[cfg(not(target_os = "android"))]
        {
            let guard = self.daemon.read().await;
            if let Some(daemon) = guard.as_ref() {
                let res = daemon.fetch(url, None).await?;
                return Ok(serde_json::to_string(&res).unwrap_or_default());
            }
        }

        #[cfg(target_os = "android")]
        {
            let guard = self.app_handle.read().await;
            if let Some(app) = guard.as_ref() {
                // Call evaluate_javascript through the android_saf plugin
                let js = format!(
                    r#"(async () => {{
                        try {{
                            // Ensure extendClient is loaded
                            let attempts = 0;
                            while (typeof window.extendClient === 'undefined' && attempts < 20) {{
                                await new Promise(r => setTimeout(r, 1000));
                                attempts++;
                            }}
                            if (typeof window.extendClient === 'undefined') throw new Error("extendClient not found");

                            if (!window.myAxios) {{
                                // Inject axios
                                const script = document.createElement('script');
                                script.src = 'https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js';
                                document.head.appendChild(script);
                                await new Promise(r => script.onload = r);

                                window.myAxios = axios.create({{ 
                                    baseURL: '/', 
                                    withCredentials: true, 
                                    headers: {{ 
                                        Accept: 'application/json', 
                                        "X-Requested-With": 'XMLHttpRequest' 
                                    }} 
                                }});
                                window.extendClient(window.myAxios);
                            }}

                            const [path, queryString] = '{}'.split('?');
                            const queryParams = {};
                            if (queryString) {{
                                const searchParams = new URLSearchParams(queryString);
                                for (const [key, value] of searchParams.entries()) {{
                                    queryParams[key] = value;
                                }}
                            }}

                            let res = await window.myAxios.get(path, {{ params: queryParams }});
                            return JSON.stringify(res.data);
                        }} catch (e) {{
                            return JSON.stringify({{ error: e.message }});
                        }}
                    }})()"#,
                    url
                );
                let res = app.android_saf().evaluate_javascript(format!("{}/filter", BASE_URL), js)?;
                return Ok(res);
            }
        }

        Err(ShioriError::Other("Browser RPC not initialized for MangaFire".into()))
    }
}

#[derive(Debug, Deserialize)]
struct MfSearchResponse {
    items: Vec<MfSearchItem>,
}

#[derive(Debug, Deserialize)]
struct MfSearchItem {
    hid: String,
    slug: String,
    title: String,
    poster: Option<MfPoster>,
}

#[derive(Debug, Deserialize)]
struct MfPoster {
    large: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MfChaptersResponse {
    items: Vec<MfChapterItem>,
    meta: Option<MfMeta>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MfMeta {
    last_page: u32,
}

#[derive(Debug, Deserialize)]
struct MfChapterItem {
    id: u64,
    number: f32,
    name: String,
    language: String,
}

#[derive(Debug, Deserialize)]
struct MfPageResponse {
    data: MfPageData,
}

#[derive(Debug, Deserialize)]
struct MfPageData {
    pages: Vec<MfPageItem>,
}

#[derive(Debug, Deserialize)]
struct MfPageItem {
    url: String,
}

#[async_trait]
impl Source for MangaFireSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "mangafire".to_string(),
            name: "MangaFire".to_string(),
            base_url: BASE_URL.to_string(),
            version: "1.0.0".to_string(),
            content_type: ContentType::Manga,
            supports_search: true,
            supports_download: true,
            requires_api_key: false,
            nsfw: false,
        }
    }

    async fn search(&self, query: &str, _page: u32) -> Result<Vec<SearchResult>> {
        // URL encode the query
        let encoded_query = urlencoding::encode(query);
        let url = format!("/api/titles?keyword={}&page=1&limit=50", encoded_query);

        let json_str = self.fetch_rpc(&url).await?;
        let res: MfSearchResponse = serde_json::from_str(&json_str)
            .map_err(|e| ShioriError::Other(format!("Failed to parse MangaFire search JSON: {} - raw: {}", e, json_str)))?;

        let mut results = Vec::new();
        for item in res.items {
            let cover_url = item.poster.and_then(|p| p.large);
            // We encode hid and slug in the ID so we can use it in get_chapters
            let id = format!("{}|{}", item.hid, item.slug);

            results.push(SearchResult {
                id,
                title: item.title,
                cover_url,
                description: None,
                source_id: "mangafire".to_string(),
                extra: HashMap::new(),
            });
        }

        Ok(results)
    }

    async fn browse(
        &self,
        mode: &str,
        page: u32,
        _limit: u32,
        _genres: Option<Vec<String>>,
        _types: Option<Vec<String>>,
    ) -> Result<Vec<SearchResult>> {
        let url = match mode {
            "popular" => format!("/api/titles?order[chapter_updated_at]=desc&hot=1&page={}&limit=30", page),
            "latest" | "recent" => format!("/api/titles?order[chapter_updated_at]=desc&page={}&limit=30", page),
            _ => format!("/api/titles?order[chapter_updated_at]=desc&page={}&limit=30", page),
        };

        let json_str = self.fetch_rpc(&url).await?;
        let res: MfSearchResponse = serde_json::from_str(&json_str)
            .map_err(|e| ShioriError::Other(format!("Failed to parse MangaFire browse JSON: {} - raw: {}", e, json_str)))?;

        let mut results = Vec::new();
        for item in res.items {
            let cover_url = item.poster.and_then(|p| p.large);
            let id = format!("{}|{}", item.hid, item.slug);

            results.push(SearchResult {
                id,
                title: item.title,
                cover_url,
                description: None,
                source_id: "mangafire".to_string(),
                extra: HashMap::new(),
            });
        }

        Ok(results)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        let parts: Vec<&str> = content_id.split('|').collect();
        if parts.len() != 2 {
            return Err(ShioriError::Other("Invalid MangaFire content ID".to_string()));
        }
        let hid = parts[0];
        let _slug = parts[1];

        let mut all_items = Vec::new();

        let first_url = format!(
            "/api/titles/{}/chapters?language=en&sort=number&order=desc&page=1&limit=200",
            hid
        );

        let json_str = self.fetch_rpc(&first_url).await?;
        let first_res: MfChaptersResponse = serde_json::from_str(&json_str)
            .map_err(|e| ShioriError::Other(format!("Failed to parse MangaFire chapters JSON: {}", e)))?;

        let last_page = first_res.meta.as_ref().map(|m| m.last_page).unwrap_or(1);
        all_items.extend(first_res.items);

        for page in 2..=last_page {
            let url = format!(
                "/api/titles/{}/chapters?language=en&sort=number&order=desc&page={}&limit=200",
                hid, page
            );
            if let Ok(json_str) = self.fetch_rpc(&url).await {
                if let Ok(res) = serde_json::from_str::<MfChaptersResponse>(&json_str) {
                    all_items.extend(res.items);
                }
            }
        }

        let mut chapters = Vec::new();
        // Since order is desc, we can just iterate. We should filter to english chapters
        for item in all_items {
            if item.language != "en" {
                continue;
            }

            let chap_id = item.id.to_string();
            let title = if item.name.trim().is_empty() {
                format!("Chapter {}", item.number)
            } else {
                item.name
            };

            chapters.push(Chapter {
                id: chap_id,
                title,
                number: item.number,
                volume: None,
                uploaded_at: None, // Could parse if needed, but not critical
                source_id: "mangafire".to_string(),
                content_id: content_id.to_string(),
            });
        }

        // Return deduplicated chapters (sometimes multiple groups upload same number)
        let mut unique_chapters: Vec<Chapter> = Vec::new();
        let mut seen_numbers = std::collections::HashSet::new();
        for ch in chapters {
            let num_str = ch.number.to_string();
            if !seen_numbers.contains(&num_str) {
                seen_numbers.insert(num_str);
                unique_chapters.push(ch);
            }
        }

        Ok(unique_chapters)
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        // chapter_id is just the id (e.g., 7285952)
        let url = format!("/api/chapters/{}", chapter_id);

        let json_str = self.fetch_rpc(&url).await?;
        let res: MfPageResponse = serde_json::from_str(&json_str)
            .map_err(|e| ShioriError::Other(format!("Failed to parse MangaFire pages JSON: {} - raw: {}", e, json_str)))?;

        let mut pages = Vec::new();
        for (i, p) in res.data.pages.into_iter().enumerate() {
            pages.push(Page {
                index: i as u32,
                url: p.url,
            });
        }

        Ok(pages)
    }
}
