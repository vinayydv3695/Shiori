use reqwest::header::{HeaderMap, HeaderValue, REFERER, USER_AGENT};
use scraper::{Html, Selector};
use std::collections::HashMap;
use std::time::Duration;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

const BASE_URL: &str = "https://mangasee123.com";
const DEFAULT_REFERER: &str = "https://mangasee123.com/";
const DEFAULT_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

pub struct MangaSee123Source {
    client: reqwest::Client,
}

impl MangaSee123Source {
    pub fn new() -> Result<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(DEFAULT_UA)
                .map_err(|e| ShioriError::Other(format!("Invalid MangaSee123 UA header: {}", e)))?,
        );
        headers.insert(
            REFERER,
            HeaderValue::from_str(DEFAULT_REFERER).map_err(|e| {
                ShioriError::Other(format!("Invalid MangaSee123 Referer header: {}", e))
            })?,
        );

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create MangaSee123 client: {}", e)))?;

        Ok(Self { client })
    }

    fn absolute_url(url_or_path: &str) -> String {
        if url_or_path.starts_with("http://") || url_or_path.starts_with("https://") {
            url_or_path.to_string()
        } else {
            format!("{}{}", BASE_URL, url_or_path)
        }
    }

    fn detect_cloudflare_block(status: reqwest::StatusCode, html: &str) -> bool {
        if status == reqwest::StatusCode::FORBIDDEN
            || status == reqwest::StatusCode::SERVICE_UNAVAILABLE
            || status == reqwest::StatusCode::TOO_MANY_REQUESTS
        {
            return true;
        }

        let lower = html.to_ascii_lowercase();
        lower.contains("cloudflare")
            && (lower.contains("just a moment")
                || lower.contains("checking your browser")
                || lower.contains("cf-browser-verification")
                || lower.contains("cf-chl")
                || lower.contains("challenge"))
    }

    fn cloudflare_error(context: &str) -> ShioriError {
        ShioriError::Other(format!(
            "MangaSee123 {} blocked by Cloudflare. Retry later, or use a browser-backed session/VPN.",
            context
        ))
    }

    fn extract_chapter_number(text: &str) -> Option<f32> {
        let lower = text.to_ascii_lowercase();
        let chapter_slice = if let Some(idx) = lower.find("chapter") {
            &text[idx + "chapter".len()..]
        } else {
            text
        };

        let mut buf = String::new();
        let mut started = false;
        for c in chapter_slice.chars() {
            if c.is_ascii_digit() || (started && c == '.') {
                buf.push(c);
                started = true;
            } else if started {
                break;
            }
        }

        if buf.is_empty() {
            None
        } else {
            buf.parse::<f32>().ok()
        }
    }

    fn strip_chapter_page_suffix(chapter_path: &str) -> String {
        if let Some((prefix, _)) = chapter_path.rsplit_once("-page-") {
            return format!("{}.html", prefix);
        }
        chapter_path.to_string()
    }

    fn extract_js_image_urls(html: &str) -> Vec<String> {
        let mut urls = Vec::new();
        let bytes = html.as_bytes();
        let mut i = 0usize;
        while i + 8 < bytes.len() {
            if bytes[i..].starts_with(b"https://") || bytes[i..].starts_with(b"http://") {
                let start = i;
                let mut end = i;
                while end < bytes.len() {
                    let ch = bytes[end] as char;
                    if ch == '"' || ch == '\'' || ch == '<' || ch.is_whitespace() {
                        break;
                    }
                    end += 1;
                }

                if end > start {
                    let candidate = &html[start..end];
                    let lower = candidate.to_ascii_lowercase();
                    if (lower.contains(".jpg")
                        || lower.contains(".jpeg")
                        || lower.contains(".png")
                        || lower.contains(".webp"))
                        && (lower.contains("mangasee")
                            || lower.contains("manga")
                            || lower.contains("tempv"))
                    {
                        urls.push(candidate.to_string());
                    }
                }
                i = end;
            } else {
                i += 1;
            }
        }

        urls.sort();
        urls.dedup();
        urls
    }
}

#[async_trait::async_trait]
impl Source for MangaSee123Source {
    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "mangasee123".to_string(),
            name: "MangaSee123".to_string(),
            base_url: BASE_URL.to_string(),
            version: "1.0.0".to_string(),
            content_type: ContentType::Manga,
            supports_search: true,
            supports_download: true,
            requires_api_key: false,
            nsfw: true,
        }
    }

    async fn search(&self, query: &str, _page: u32) -> Result<Vec<SearchResult>> {
        let url = format!("{}/search/?name={}", BASE_URL, urlencoding::encode(query));
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaSee123 search request failed: {}", e)))?;

        let status = resp.status();
        let html = resp
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaSee123 search parse failed: {}", e)))?;

        if Self::detect_cloudflare_block(status, &html) {
            return Err(Self::cloudflare_error("search request"));
        }

        let doc = Html::parse_document(&html);
        let card_sel = Selector::parse("div.Column.col-lg-4.col-12, div.ng-scope")
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let link_sel = Selector::parse("a")
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;
        let img_sel = Selector::parse("img")
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let mut out = Vec::new();
        for card in doc.select(&card_sel) {
            let anchor = card
                .select(&link_sel)
                .find(|a| a.value().attr("href").is_some_and(|h| h.contains("/manga/")));

            let Some(a) = anchor else {
                continue;
            };

            let href = a.value().attr("href").unwrap_or_default();
            let id = href
                .trim_end_matches('/')
                .split('/')
                .next_back()
                .unwrap_or_default()
                .to_string();

            if id.is_empty() {
                continue;
            }

            let title = a
                .text()
                .collect::<String>()
                .trim()
                .to_string()
                .chars()
                .collect::<String>();

            let cover_url = card
                .select(&img_sel)
                .next()
                .and_then(|img| {
                    img.value()
                        .attr("src")
                        .or_else(|| img.value().attr("data-src"))
                        .or_else(|| img.value().attr("ng-src"))
                })
                .map(Self::absolute_url);

            out.push(SearchResult {
                id,
                title: if title.is_empty() {
                    "Untitled".to_string()
                } else {
                    title
                },
                cover_url,
                description: Some(Self::absolute_url(href)),
                source_id: "mangasee123".to_string(),
                extra: HashMap::new(),
            });
        }

        Ok(out)
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        let url = if content_id.starts_with("http") {
            content_id.to_string()
        } else {
            format!("{}/manga/{}", BASE_URL, content_id)
        };

        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaSee123 chapters request failed: {}", e)))?;

        let status = resp.status();
        let html = resp
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaSee123 chapters parse failed: {}", e)))?;

        if Self::detect_cloudflare_block(status, &html) {
            return Err(Self::cloudflare_error("chapter list request"));
        }

        let doc = Html::parse_document(&html);
        let link_sel = Selector::parse("a")
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let mut chapters = Vec::new();
        for a in doc.select(&link_sel) {
            let Some(href) = a.value().attr("href") else {
                continue;
            };

            let lower_href = href.to_ascii_lowercase();
            if !lower_href.contains("/read-online/") || !lower_href.contains("chapter") {
                continue;
            }

            let mut chapter_path = href.to_string();
            if !chapter_path.ends_with(".html") {
                continue;
            }
            chapter_path = Self::strip_chapter_page_suffix(&chapter_path);

            let title_text = a.text().collect::<String>().trim().to_string();
            let number = Self::extract_chapter_number(&title_text)
                .or_else(|| Self::extract_chapter_number(&chapter_path))
                .unwrap_or(0.0);

            chapters.push(Chapter {
                id: chapter_path,
                title: if title_text.is_empty() {
                    format!("Chapter {}", number)
                } else {
                    title_text
                },
                number,
                volume: None,
                uploaded_at: None,
                source_id: "mangasee123".to_string(),
                content_id: content_id.to_string(),
            });
        }

        chapters.sort_by(|a, b| a.number.partial_cmp(&b.number).unwrap_or(std::cmp::Ordering::Equal));
        chapters.dedup_by(|a, b| a.id == b.id);
        Ok(chapters)
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let chapter_path = if chapter_id.contains("/read-online/") {
            chapter_id.to_string()
        } else {
            format!("/read-online/{}", chapter_id)
        };
        let reader_path = Self::strip_chapter_page_suffix(&chapter_path);
        let reader_url = Self::absolute_url(&reader_path);

        let resp = self
            .client
            .get(&reader_url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaSee123 pages request failed: {}", e)))?;

        let status = resp.status();
        let html = resp
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaSee123 pages parse failed: {}", e)))?;

        if Self::detect_cloudflare_block(status, &html) {
            return Err(Self::cloudflare_error("pages request"));
        }

        let doc = Html::parse_document(&html);
        let img_sel = Selector::parse("img")
            .map_err(|e| ShioriError::Other(format!("Selector error: {}", e)))?;

        let mut pages: Vec<Page> = doc
            .select(&img_sel)
            .filter_map(|img| {
                img.value()
                    .attr("src")
                    .or_else(|| img.value().attr("data-src"))
                    .or_else(|| img.value().attr("ng-src"))
                    .map(|u| u.to_string())
            })
            .filter(|u| {
                let lu = u.to_ascii_lowercase();
                (lu.contains(".jpg") || lu.contains(".jpeg") || lu.contains(".png") || lu.contains(".webp"))
                    && !lu.contains("logo")
                    && !lu.contains("avatar")
            })
            .enumerate()
            .map(|(index, url)| Page {
                index: index as u32,
                url: Self::absolute_url(&url),
            })
            .collect();

        if pages.is_empty() {
            // Fallback for JS-loaded readers: scan script text for direct image URLs.
            pages = Self::extract_js_image_urls(&html)
                .into_iter()
                .enumerate()
                .map(|(index, url)| Page {
                    index: index as u32,
                    url,
                })
                .collect();
        }

        if pages.is_empty() {
            return Err(ShioriError::Other(format!(
                "Could not extract any pages from '{}'. MangaSee123 may be serving JS-only reader payload or anti-bot challenge.",
                reader_url
            )));
        }

        Ok(pages)
    }
}
