use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::RwLock;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

#[cfg(target_os = "android")]
use tauri_plugin_android_saf::AndroidSafExt;

const BASE_URL: &str = "https://www.toongod.org";
const MANGA_PATH: &str = "webtoons";

// Rotate through realistic Chrome user-agents to reduce fingerprinting
#[allow(dead_code)]
const USER_AGENTS: &[&str] = &[
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

// Selectors for Madara theme
const SEARCH_ITEM_SELECTOR: &str = "div.c-tabs-item__content, div.page-item-detail, div.post-title";
const SEARCH_TITLE_LINK_SELECTOR: &str = "h3 a, .post-title a, h4 a";
const SEARCH_IMAGE_SELECTOR: &str = "img";
const CHAPTER_LIST_SELECTOR: &str = "li.wp-manga-chapter";
const CHAPTER_LINK_SELECTOR: &str = "a";
const PAGE_BREAK_SELECTOR: &str = "div.page-break img, .reading-content img, .text-left img";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ToonGodConfig {
    /// Optional cf_clearance cookie value obtained from a browser after solving Cloudflare
    pub cf_clearance: Option<String>,
    /// Optional FlareSolverr URL for automated Cloudflare bypass (e.g. http://localhost:8191)
    pub flaresolverr_url: Option<String>,
}

pub struct ToonGodSource {
    config: RwLock<ToonGodConfig>,
    app_handle: RwLock<Option<tauri::AppHandle>>,
    eval_lock: tokio::sync::Mutex<()>,
}

impl ToonGodSource {
    pub fn new() -> Result<Self> {
        Ok(Self {
            config: RwLock::new(ToonGodConfig::default()),
            app_handle: RwLock::new(None),
            eval_lock: tokio::sync::Mutex::new(()),
        })
    }

    #[allow(dead_code)]
    pub async fn set_app_handle(&self, app_handle: tauri::AppHandle) {
        *self.app_handle.write().await = Some(app_handle);
    }

    pub async fn set_config(&self, config: ToonGodConfig) {
        let mut guard = self.config.write().await;
        *guard = config;
    }

    #[allow(dead_code)]
    pub async fn get_config(&self) -> ToonGodConfig {
        self.config.read().await.clone()
    }



    fn detect_cloudflare_block(status: reqwest::StatusCode, html: &str) -> bool {
        if status == reqwest::StatusCode::FORBIDDEN
            || status == reqwest::StatusCode::SERVICE_UNAVAILABLE
            || status == reqwest::StatusCode::TOO_MANY_REQUESTS
        {
            return true;
        }

        let lower = html.to_lowercase();
        lower.contains("cloudflare")
            || lower.contains("attention required")
            || lower.contains("cf-browser-verification")
            || lower.contains("just a moment")
            || lower.contains("enable javascript")
            || lower.contains("_cf_chl")
            || lower.contains("challenge-platform")
    }

    fn cloudflare_error(context: &str) -> ShioriError {
        ShioriError::Other(format!(
            "ToonGod {} is blocked by Cloudflare. \
            Shiori will automatically open a browser to solve the challenge. \
            If the browser opens and gets stuck, click the \"Verify you are human\" checkbox. \
            You can also trigger the browser manually via Settings → Online Sources → ToonGod → Verify Session. \
            The session is cached for 20+ hours once solved.",
            context
        ))
    }

    fn absolute_url(href: &str) -> String {
        if href.starts_with("http://") || href.starts_with("https://") {
            href.to_string()
        } else if href.starts_with("//") {
            format!("https:{}", href)
        } else if href.starts_with('/') {
            format!("{}{}", BASE_URL, href)
        } else {
            format!("{}/{}", BASE_URL, href)
        }
    }

    fn extract_chapter_number(text: &str) -> f32 {
        let text_lower = text.to_lowercase();

        let patterns = ["chapter ", "ch.", "ch ", "ep.", "ep ", "episode "];
        for pattern in patterns {
            if let Some(idx) = text_lower.find(pattern) {
                let after = &text[idx + pattern.len()..];
                if let Some(num) = Self::parse_number_from_start(after.trim()) {
                    return num;
                }
            }
        }

        Self::parse_number_from_start(text).unwrap_or(0.0)
    }

    fn parse_number_from_start(s: &str) -> Option<f32> {
        let mut buf = String::new();
        let mut has_dot = false;

        for c in s.chars() {
            if c.is_ascii_digit() {
                buf.push(c);
            } else if c == '.' && !has_dot {
                buf.push(c);
                has_dot = true;
            } else if !buf.is_empty() {
                break;
            }
        }

        if buf.is_empty() || buf == "." {
            None
        } else {
            buf.parse::<f32>().ok()
        }
    }

    fn extract_slug_from_url(url: &str) -> String {
        url.trim_end_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .last()
            .unwrap_or("")
            .to_string()
    }



    async fn evaluate_js(&self, url: &str, js_script: &str) -> Result<String> {
        let _lock = self.eval_lock.lock().await;
        
        let guard = self.app_handle.read().await;
        let app = guard.as_ref().ok_or_else(|| {
            ShioriError::Other("ToonGod source app_handle not initialized".into())
        })?;

        #[cfg(not(target_os = "android"))]
        {
            let window_label = format!("tg-eval-{}", uuid::Uuid::new_v4().simple());
            let (tx, rx) = tokio::sync::oneshot::channel();
            let tx = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
            let html_buffer = std::sync::Arc::new(std::sync::Mutex::new(String::new()));

            let js = format!(
                r#"(async () => {{
                    try {{
                        if (window.top !== window.self) return; // Prevent iframe execution
                        if (document.readyState === 'loading') {{
                            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
                        }}
                        while (true) {{
                            const title = document.title.toLowerCase();
                            if (title.includes('just a moment') || title.includes('cloudflare') || title.includes('attention required')) {{
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                continue;
                            }}
                            break;
                        }}
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        const raw_result = await (async () => {{ {} }})();
                        const result = (typeof raw_result === 'string') ? raw_result : JSON.stringify(raw_result);
                        const chunkSize = 16384;
                        window.__CHUNK_ACK = true;
                        for (let i = 0; i < result.length; i += chunkSize) {{
                            const chunk = result.slice(i, i + chunkSize);
                            window.__CHUNK_ACK = false;
                            document.title = 'SHIORI_CHUNK|' + encodeURIComponent(chunk);
                            while (!window.__CHUNK_ACK) {{
                                await new Promise(r => setTimeout(r, 10));
                            }}
                        }}
                        document.title = 'SHIORI_DONE|';
                    }} catch (e) {{
                        document.title = 'SHIORI_ERROR|' + e.message;
                    }}
                }})();"#,
                js_script
            );

            let tx_clone = std::sync::Arc::clone(&tx);
            let app_clone = app.clone();
            let window_label_clone = window_label.clone();
            let html_buffer_clone = std::sync::Arc::clone(&html_buffer);

            use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

            let _window = WebviewWindowBuilder::new(app, &window_label, WebviewUrl::External(url.parse().unwrap()))
                .visible(false)
                .skip_taskbar(true)
                .always_on_bottom(true)
                .focused(false)
                .initialization_script(&js)
                .on_document_title_changed(move |window, title| {
                    if title.starts_with("SHIORI_CHUNK|") {
                        if let Ok(mut buf) = html_buffer_clone.lock() {
                            let raw = title.trim_start_matches("SHIORI_CHUNK|");
                            let decoded = urlencoding::decode(raw).unwrap_or(std::borrow::Cow::Borrowed(raw));
                            buf.push_str(&decoded);
                        }
                        let _ = window.eval("window.__CHUNK_ACK = true;");
                    } else if title.starts_with("SHIORI_DONE|") {
                        if let Ok(mut lock) = tx_clone.lock() {
                            if let Some(sender) = lock.take() {
                                let buf = html_buffer_clone.lock().unwrap().clone();
                                let _ = sender.send(format!("SHIORI_RESULT|{}", buf));
                            }
                        }
                        let w_label = window_label_clone.clone();
                        let a = app_clone.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Some(w) = a.get_webview_window(&w_label) {
                                let _ = w.close();
                            }
                        });
                    } else if title.starts_with("SHIORI_ERROR|") {
                        if let Ok(mut lock) = tx_clone.lock() {
                            if let Some(sender) = lock.take() {
                                let _ = sender.send(title.clone());
                            }
                        }
                        let w_label = window_label_clone.clone();
                        let a = app_clone.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Some(w) = a.get_webview_window(&w_label) {
                                let _ = w.close();
                            }
                        });
                    }
                })
                .build()
                .map_err(|e| ShioriError::Other(format!("Failed to build eval webview: {}", e)))?;

            let result = match tokio::time::timeout(std::time::Duration::from_secs(45), rx).await {
                Ok(Ok(res)) => {
                    if res.starts_with("SHIORI_RESULT|") {
                        res.trim_start_matches("SHIORI_RESULT|").to_string()
                    } else if res.starts_with("SHIORI_ERROR|") {
                        return Err(ShioriError::Other(format!("ToonGod JS Error: {}", res.trim_start_matches("SHIORI_ERROR|"))));
                    } else {
                        return Err(ShioriError::Other(format!("ToonGod unexpected eval result: {}", res)));
                    }
                }
                _ => {
                    // Timeout or error receiving, ensure we clean up the window!
                    let w_label = window_label.clone();
                    let a = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(w) = a.get_webview_window(&w_label) {
                            let _ = w.close();
                        }
                    });
                    return Err(ShioriError::Other("ToonGod evaluate_js timed out".into()));
                }
            };
            Ok(result)
        }

        #[cfg(target_os = "android")]
        {
            let js = format!(
                r#"(async () => {{
                    try {{
                        const raw_result = await (async () => {{ {} }})();
                        return (typeof raw_result === 'string') ? raw_result : JSON.stringify(raw_result);
                    }} catch (e) {{
                        return JSON.stringify({{ error: e.message }});
                    }}
                }})()"#,
                js_script
            );
            
            let result = app.android_saf().evaluate_javascript(url.to_string(), js, Some(USER_AGENTS[0].to_string()))
                .map_err(|e| ShioriError::Other(format!("Android evaluateJavascript failed: {}", e)))?;
                
            if result.starts_with("{\"error\":") {
                return Err(ShioriError::Other(format!("ToonGod JS Error: {}", result)));
            }
            Ok(result)
        }
    }

    async fn fetch_with_referer(
        &self,
        url: &str,
        _referer: Option<&str>,
    ) -> Result<(reqwest::StatusCode, String)> {
        let js = r#"return document.documentElement.outerHTML;"#;
        let html = self.evaluate_js(url, js).await?;
        Ok((reqwest::StatusCode::OK, html))
    }

    async fn try_ajax_chapters(&self, manga_id: &str, manga_url: &str) -> Result<Option<String>> {
        // Try the new AJAX endpoint first
        let ajax_url = format!("{}/ajax/chapters/", manga_url.trim_end_matches('/'));
        let js = format!(r#"
            let res = await fetch('{}', {{
                method: 'POST',
                headers: {{
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                }},
                body: 'manga={}'
            }});
            return await res.text();
        "#, ajax_url, manga_id);

        if let Ok(html) = self.evaluate_js(manga_url, &js).await {
            if !html.is_empty() && html.contains("wp-manga-chapter") {
                return Ok(Some(html));
            }
        }

        // Try old admin-ajax endpoint
        let old_ajax_url = format!("{}/wp-admin/admin-ajax.php", BASE_URL);
        let js_old = format!(r#"
            let formData = new URLSearchParams();
            formData.append('action', 'manga_get_chapters');
            formData.append('manga', '{}');
            let res = await fetch('{}', {{
                method: 'POST',
                headers: {{
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                }},
                body: formData
            }});
            return await res.text();
        "#, manga_id, old_ajax_url);
        
        if let Ok(html) = self.evaluate_js(manga_url, &js_old).await {
            if !html.is_empty() && html.contains("wp-manga-chapter") {
                return Ok(Some(html));
            }
        }

        Ok(None)
    }
}

#[async_trait::async_trait]
impl Source for ToonGodSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "toongod".to_string(),
            name: "ToonGod".to_string(),
            base_url: BASE_URL.to_string(),
            version: "2.1.0".to_string(),
            content_type: ContentType::Manga,
            supports_search: true,
            supports_download: true,
            requires_api_key: false,
            nsfw: true,
        }
    }

    async fn search(&self, query: &str, page: u32) -> Result<Vec<SearchResult>> {
        let page_path = if page > 1 {
            format!("page/{}/", page)
        } else {
            String::new()
        };
        let url = format!(
            "{}/{}?s={}&post_type=wp-manga",
            BASE_URL,
            page_path,
            urlencoding::encode(query)
        );

        let (status, html) = self.fetch_with_referer(&url, Some(BASE_URL)).await?;

        if Self::detect_cloudflare_block(status, &html) {
            return Err(Self::cloudflare_error("search"));
        }

        let doc = Html::parse_document(&html);
        let item_sel = Selector::parse(SEARCH_ITEM_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let title_sel = Selector::parse(SEARCH_TITLE_LINK_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let image_sel = Selector::parse(SEARCH_IMAGE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;

        let mut results = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        for item in doc.select(&item_sel) {
            let title_link = match item.select(&title_sel).next() {
                Some(el) => el,
                None => continue,
            };

            let href = match title_link.value().attr("href") {
                Some(h) => Self::absolute_url(h),
                None => continue,
            };

            let id = Self::extract_slug_from_url(&href);
            if id.is_empty() || seen_ids.contains(&id) {
                continue;
            }
            seen_ids.insert(id.clone());

            let title = title_link.text().collect::<String>().trim().to_string();
            if title.is_empty() {
                continue;
            }

            let cover_url = item
                .select(&image_sel)
                .next()
                .and_then(|img| {
                    img.value()
                        .attr("data-src")
                        .or_else(|| img.value().attr("src"))
                        .or_else(|| img.value().attr("data-lazy-src"))
                })
                .map(|s| s.split_whitespace().next().unwrap_or(s))
                .filter(|s| !s.contains("data:image"))
                .map(|s| Self::absolute_url(s));

            results.push(SearchResult {
                id,
                title,
                cover_url,
                description: Some(href.clone()),
                source_id: "toongod".to_string(),
                extra: HashMap::from([("url".to_string(), href)]),
            });
        }

        Ok(results)
    }

    async fn browse(
        &self,
        mode: &str,
        page: u32,
        _limit: u32,
        genres: Option<Vec<String>>,
        _types: Option<Vec<String>>,
    ) -> Result<Vec<SearchResult>> {
        let order = match mode.to_lowercase().as_str() {
            "newest" | "added" => "new-manga",
            "updated" => "latest",
            "trending" | "popular" => "trending",
            _ => "latest",
        };

        let page_path = if page > 1 {
            format!("page/{}/", page)
        } else {
            String::new()
        };

        let mut genre_query = String::new();
        let mut genre_idx = 0;
        
        if let Some(genres) = genres {
            for genre in genres {
                let slug = genre.to_lowercase().replace(" ", "-");
                genre_query.push_str(&format!("&genre[{}]={}", genre_idx, slug));
                genre_idx += 1;
            }
        }

        let url = format!(
            "{}/home/{}?m_orderby={}{}",
            BASE_URL,
            page_path,
            order,
            genre_query
        );

        let (status, html) = self.fetch_with_referer(&url, Some(BASE_URL)).await?;
        
        let _ = std::fs::write("/tmp/toongod_debug.txt", format!("URL: {}\nSTATUS: {}\nHTML:\n{}", url, status, html));

        if Self::detect_cloudflare_block(status, &html) {
            return Err(Self::cloudflare_error("browse"));
        }

        let doc = Html::parse_document(&html);
        let item_sel = Selector::parse(SEARCH_ITEM_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let title_sel = Selector::parse(SEARCH_TITLE_LINK_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let image_sel = Selector::parse(SEARCH_IMAGE_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;

        let mut results = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        for item in doc.select(&item_sel) {
            let title_link = match item.select(&title_sel).next() {
                Some(el) => el,
                None => continue,
            };

            let href = match title_link.value().attr("href") {
                Some(h) => Self::absolute_url(h),
                None => continue,
            };

            let id = Self::extract_slug_from_url(&href);
            if id.is_empty() || seen_ids.contains(&id) {
                continue;
            }
            seen_ids.insert(id.clone());

            let title = title_link.text().collect::<String>().trim().to_string();
            if title.is_empty() {
                continue;
            }

            let cover_url = item
                .select(&image_sel)
                .next()
                .and_then(|img| {
                    img.value()
                        .attr("data-src")
                        .or_else(|| img.value().attr("src"))
                        .or_else(|| img.value().attr("data-lazy-src"))
                })
                .map(|s| s.split_whitespace().next().unwrap_or(s))
                .filter(|s| !s.contains("data:image"))
                .map(|s| Self::absolute_url(s));

            results.push(SearchResult {
                id,
                title,
                cover_url,
                description: Some(href.clone()),
                source_id: "toongod".to_string(),
                extra: HashMap::from([("url".to_string(), href)]),
            });
        }

        Ok(results)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        let manga_url = if content_id.starts_with("http") {
            content_id.to_string()
        } else {
            format!("{}/{}/{}/", BASE_URL, MANGA_PATH, content_id)
        };

        let (status, html) = self.fetch_with_referer(&manga_url, Some(BASE_URL)).await?;

        if Self::detect_cloudflare_block(status, &html) {
            return Err(Self::cloudflare_error("chapter list"));
        }

        let manga_id = {
            let doc = Html::parse_document(&html);
            doc.select(&Selector::parse("div.manga-page, div[data-id]").unwrap())
                .next()
                .and_then(|el| el.value().attr("data-id"))
                .map(String::from)
        };

        let chapter_html = if let Some(ref mid) = manga_id {
            self.try_ajax_chapters(mid, &manga_url)
                .await?
                .unwrap_or(html.clone())
        } else {
            html.clone()
        };

        let chapter_doc = Html::parse_document(&chapter_html);
        let chapter_sel = Selector::parse(CHAPTER_LIST_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;
        let link_sel = Selector::parse(CHAPTER_LINK_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;

        let mut chapters = Vec::new();

        for li in chapter_doc.select(&chapter_sel) {
            let link = match li.select(&link_sel).next() {
                Some(a) => a,
                None => continue,
            };

            let href = match link.value().attr("href") {
                Some(h) => Self::absolute_url(h),
                None => continue,
            };

            let title = link.text().collect::<String>().trim().to_string();
            let number = Self::extract_chapter_number(&title);

            chapters.push(Chapter {
                id: href.clone(),
                title: if title.is_empty() {
                    format!("Chapter {}", number)
                } else {
                    title
                },
                number,
                volume: None,
                uploaded_at: None,
                source_id: "toongod".to_string(),
                content_id: content_id.to_string(),
            });
        }

        // Chapters are usually in reverse order (newest first), reverse for chronological
        if chapters.len() > 1 {
            let first_num = chapters.first().map(|c| c.number).unwrap_or(0.0);
            let last_num = chapters.last().map(|c| c.number).unwrap_or(0.0);
            if first_num > last_num {
                chapters.reverse();
            }
        }

        Ok(chapters)
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let chapter_url = if chapter_id.starts_with("http") {
            if chapter_id.contains('?') {
                format!("{}&style=list", chapter_id)
            } else {
                format!("{}?style=list", chapter_id.trim_end_matches('/'))
            }
        } else {
            Self::absolute_url(chapter_id)
        };

        let (status, html) = self
            .fetch_with_referer(&chapter_url, Some(BASE_URL))
            .await?;

        if Self::detect_cloudflare_block(status, &html) {
            return Err(Self::cloudflare_error("chapter pages"));
        }

        let doc = Html::parse_document(&html);
        let img_sel = Selector::parse(PAGE_BREAK_SELECTOR)
            .map_err(|e| ShioriError::Other(format!("Selector error: {:?}", e)))?;

        let mut pages = Vec::new();
        let mut seen_urls = std::collections::HashSet::new();

        for (index, img) in doc.select(&img_sel).enumerate() {
            let url = img
                .value()
                .attr("data-src")
                .or_else(|| img.value().attr("src"))
                .or_else(|| img.value().attr("data-lazy-src"))
                .map(|s| s.split_whitespace().next().unwrap_or(s))
                .filter(|s| !s.contains("data:image") && !s.is_empty())
                .map(|s| s.trim().to_string());

            if let Some(mut u) = url {
                // Strip WordPress thumbnail dimensions like "-175x238" from the end of the filename
                lazy_static::lazy_static! {
                    static ref RE_WP_THUMB: regex::Regex = regex::Regex::new(r"-\d+x\d+(\.(?:jpg|jpeg|png|webp|gif)(?:\?|$))").unwrap();
                }
                u = RE_WP_THUMB.replace(&u, "${1}").to_string();

                let abs_url = Self::absolute_url(&u);
                if !seen_urls.contains(&abs_url) {
                    seen_urls.insert(abs_url.clone());
                    pages.push(Page {
                        index: index as u32,
                        url: abs_url,
                    });
                }
            }
        }

        // Re-index pages sequentially
        for (i, page) in pages.iter_mut().enumerate() {
            page.index = i as u32;
        }

        if pages.is_empty() {
            return Err(ShioriError::Other(
                "No pages found. ToonGod may require Cloudflare bypass. Set cf_clearance cookie or FlareSolverr URL in Settings → Online Sources → ToonGod.".to_string()
            ));
        }

        Ok(pages)
    }
}
