use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, REFERER, USER_AGENT};
use scraper::{Html, Selector};
use std::collections::HashMap;
use std::time::Duration;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

const SOURCE_ID: &str = "tcbscans";
const BASE_URL: &str = "https://tcbscans.me";
const FALLBACK_BASE_URL: &str = "https://tcbscans.com";

const DEFAULT_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

pub struct TCBScansSource {
    client: reqwest::Client,
}

impl TCBScansSource {
    pub fn new() -> Result<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(DEFAULT_UA)
                .map_err(|e| ShioriError::Other(format!("Invalid TCB Scans UA header: {}", e)))?,
        );
        headers.insert(REFERER, HeaderValue::from_static("https://tcbscans.me/"));
        headers.insert(
            ACCEPT,
            HeaderValue::from_static(
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            ),
        );
        headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .redirect(reqwest::redirect::Policy::limited(10))
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create TCB Scans client: {}", e)))?;

        Ok(Self { client })
    }

    fn absolute_url(path_or_url: &str, base_url: &str) -> String {
        if path_or_url.starts_with("http://") || path_or_url.starts_with("https://") {
            path_or_url.to_string()
        } else if path_or_url.starts_with('/') {
            format!("{}{}", base_url, path_or_url)
        } else {
            format!("{}/{}", base_url.trim_end_matches('/'), path_or_url)
        }
    }

    fn parse_base_domain_from_url(url: &str) -> Option<String> {
        let parsed = reqwest::Url::parse(url).ok()?;
        let host = parsed.host_str()?;
        Some(format!("{}://{}", parsed.scheme(), host))
    }

    fn detect_unavailable_or_blocked(status: reqwest::StatusCode, body: &str) -> Option<&'static str> {
        if status == reqwest::StatusCode::FORBIDDEN
            || status == reqwest::StatusCode::TOO_MANY_REQUESTS
            || status == reqwest::StatusCode::SERVICE_UNAVAILABLE
            || status == reqwest::StatusCode::BAD_GATEWAY
            || status == reqwest::StatusCode::GATEWAY_TIMEOUT
        {
            return Some("blocked");
        }

        let lower = body.to_ascii_lowercase();
        if lower.contains("cloudflare")
            && (lower.contains("just a moment")
                || lower.contains("checking your browser")
                || lower.contains("cf-browser-verification")
                || lower.contains("cf-chl")
                || lower.contains("challenge"))
        {
            return Some("cloudflare");
        }

        if lower.contains("parklogic")
            || lower.contains("domain for sale")
            || lower.contains("sedo")
            || lower.contains("redirecting...") && lower.contains("router.")
        {
            return Some("parked");
        }

        None
    }

    fn extract_chapter_number(text: &str) -> f32 {
        let lower = text.to_ascii_lowercase();
        let start = lower
            .find("chapter")
            .map(|i| i + "chapter".len())
            .unwrap_or(0);

        let mut buf = String::new();
        for c in text[start..].chars() {
            if c.is_ascii_digit() || c == '.' {
                buf.push(c);
            } else if !buf.is_empty() {
                break;
            }
        }

        buf.parse::<f32>().unwrap_or(0.0)
    }

    async fn fetch_html_resolved(&self, url: &str) -> Result<(String, String)> {
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("TCB Scans request failed: {}", e)))?;

        let status = response.status();
        let final_url = response.url().to_string();
        let body = response
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("TCB Scans response parse failed: {}", e)))?;

        if let Some(kind) = Self::detect_unavailable_or_blocked(status, &body) {
            return match kind {
                "cloudflare" | "blocked" => Err(ShioriError::Other(
                    "TCB Scans is currently protected by anti-bot checks (Cloudflare/challenge). Please retry later or use a browser-backed session.".to_string(),
                )),
                "parked" => Err(ShioriError::Other(
                    "TCB Scans appears to be unavailable or domain-parked right now. Try again later or switch to another source temporarily.".to_string(),
                )),
                _ => Err(ShioriError::Other(
                    "TCB Scans is temporarily unavailable. Please retry later.".to_string(),
                )),
            };
        }

        Ok((final_url, body))
    }

    async fn fetch_html_with_fallback(&self, path: &str) -> Result<(String, String, String)> {
        let primary = format!("{}{}", BASE_URL, path);
        if let Ok((resolved, body)) = self.fetch_html_resolved(&primary).await {
            let base = Self::parse_base_domain_from_url(&resolved).unwrap_or_else(|| BASE_URL.to_string());
            return Ok((resolved, body, base));
        }

        let fallback = format!("{}{}", FALLBACK_BASE_URL, path);
        let (resolved, body) = self.fetch_html_resolved(&fallback).await?;
        let base = Self::parse_base_domain_from_url(&resolved).unwrap_or_else(|| FALLBACK_BASE_URL.to_string());
        Ok((resolved, body, base))
    }

    fn parse_search_results(html: &str, base_url: &str) -> Result<Vec<SearchResult>> {
        let doc = Html::parse_document(html);

        let card_sel = Selector::parse(".project-card, .grid .project, .manga-card, article, .series-card")
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let link_sel = Selector::parse("a")
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let title_sel = Selector::parse("h1, h2, h3, .title, .name")
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let img_sel = Selector::parse("img")
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let mut out = Vec::new();
        for card in doc.select(&card_sel) {
            let link = card
                .select(&link_sel)
                .find(|a| a.value().attr("href").is_some_and(|h| h.contains("/manga/") || h.contains("/projects/")));
            let Some(link) = link else { continue };

            let href = link.value().attr("href").unwrap_or_default();
            let full_url = Self::absolute_url(href, base_url);
            let id = full_url
                .trim_end_matches('/')
                .split('/')
                .next_back()
                .unwrap_or_default()
                .to_string();
            if id.is_empty() {
                continue;
            }

            let title = card
                .select(&title_sel)
                .next()
                .map(|n| n.text().collect::<String>().trim().to_string())
                .filter(|t| !t.is_empty())
                .or_else(|| {
                    link.value()
                        .attr("title")
                        .map(|s| s.trim().to_string())
                        .filter(|t| !t.is_empty())
                })
                .unwrap_or_else(|| "Untitled".to_string());

            let cover_url = card
                .select(&img_sel)
                .next()
                .and_then(|img| img.value().attr("src").or_else(|| img.value().attr("data-src")))
                .map(|u| Self::absolute_url(u, base_url));

            out.push(SearchResult {
                id,
                title,
                cover_url,
                description: Some(full_url),
                source_id: SOURCE_ID.to_string(),
                extra: HashMap::new(),
            });
        }

        out.dedup_by(|a, b| a.id == b.id);
        Ok(out)
    }
}

#[async_trait::async_trait]
impl Source for TCBScansSource {
    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: SOURCE_ID.to_string(),
            name: "TCB Scans".to_string(),
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
        let q = query.trim();
        if q.is_empty() {
            return Ok(Vec::new());
        }

        let search_paths = [
            format!("/projects?search={}", urlencoding::encode(q)),
            format!("/mangas?search={}", urlencoding::encode(q)),
            "/projects".to_string(),
            "/mangas".to_string(),
        ];

        let mut all = Vec::new();
        for path in search_paths {
            let fetch = self.fetch_html_with_fallback(&path).await;
            if let Ok((_resolved, html, base)) = fetch {
                let mut parsed = Self::parse_search_results(&html, &base)?;
                all.append(&mut parsed);
                if !all.is_empty() {
                    break;
                }
            }
        }

        if all.is_empty() {
            return Err(ShioriError::Other(
                "TCB Scans search returned no parseable entries. The site may be down, protected, or its layout has changed.".to_string(),
            ));
        }

        let query_lower = q.to_ascii_lowercase();
        all.retain(|r| r.title.to_ascii_lowercase().contains(&query_lower));
        Ok(all)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        let url_path = if content_id.starts_with("http://") || content_id.starts_with("https://") {
            let parsed = reqwest::Url::parse(content_id)
                .map_err(|e| ShioriError::Other(format!("Invalid TCB Scans content URL: {}", e)))?;
            parsed.path().to_string()
        } else if content_id.contains('/') {
            format!("/{}", content_id.trim_start_matches('/'))
        } else {
            format!("/manga/{}", content_id)
        };

        let (_resolved, html, base_url) = self.fetch_html_with_fallback(&url_path).await?;
        let doc = Html::parse_document(&html);

        let chapter_selectors = [
            ".chapters a",
            ".chapter-list a",
            "a[href*='/chapters/']",
            "a[href*='chapter']",
        ];

        let mut chapters = Vec::new();
        for selector_text in chapter_selectors {
            let selector = Selector::parse(selector_text)
                .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

            for link in doc.select(&selector) {
                let href = link.value().attr("href").unwrap_or_default();
                if href.is_empty() {
                    continue;
                }

                let full = Self::absolute_url(href, &base_url);
                let title = link.text().collect::<String>().trim().to_string();
                let number = Self::extract_chapter_number(&title);

                chapters.push(Chapter {
                    id: full,
                    title: if title.is_empty() {
                        format!("Chapter {}", number)
                    } else {
                        title
                    },
                    number,
                    volume: None,
                    uploaded_at: None,
                    source_id: SOURCE_ID.to_string(),
                    content_id: content_id.to_string(),
                });
            }

            if !chapters.is_empty() {
                break;
            }
        }

        chapters.sort_by(|a, b| a.number.partial_cmp(&b.number).unwrap_or(std::cmp::Ordering::Equal));
        chapters.dedup_by(|a, b| a.id == b.id);

        if chapters.is_empty() {
            return Err(ShioriError::Other(format!(
                "No chapters found for '{}' on TCB Scans. The chapter list structure may have changed or the site is unavailable.",
                content_id
            )));
        }

        Ok(chapters)
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let url_path = if chapter_id.starts_with("http://") || chapter_id.starts_with("https://") {
            let parsed = reqwest::Url::parse(chapter_id)
                .map_err(|e| ShioriError::Other(format!("Invalid TCB Scans chapter URL: {}", e)))?;
            parsed.path().to_string()
        } else if chapter_id.starts_with('/') {
            chapter_id.to_string()
        } else {
            format!("/{}", chapter_id)
        };

        let (_resolved, html, base_url) = self.fetch_html_with_fallback(&url_path).await?;
        let doc = Html::parse_document(&html);
        let image_selectors = [
            ".reader img",
            ".chapter-reader img",
            ".reading-content img",
            "main img",
            "img[src*='cdn']",
        ];

        let mut pages = Vec::new();
        for selector_text in image_selectors {
            let selector = Selector::parse(selector_text)
                .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
            pages = doc
                .select(&selector)
                .enumerate()
                .filter_map(|(index, img)| {
                    img.value()
                        .attr("src")
                        .or_else(|| img.value().attr("data-src"))
                        .or_else(|| img.value().attr("data-lazy-src"))
                        .map(|u| u.trim().to_string())
                        .filter(|u| !u.is_empty() && !u.starts_with("data:"))
                        .map(|u| Page {
                            index: index as u32,
                            url: Self::absolute_url(&u, &base_url),
                        })
                })
                .collect();

            if !pages.is_empty() {
                break;
            }
        }

        if pages.is_empty() {
            return Err(ShioriError::Other(format!(
                "No reader images found for '{}' on TCB Scans. The reader may be JS-only, blocked, or temporarily unavailable.",
                chapter_id
            )));
        }

        Ok(pages)
    }
}
