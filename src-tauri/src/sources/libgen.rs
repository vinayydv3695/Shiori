use std::collections::HashMap;
use std::time::Duration;

use scraper::{Html, Selector};

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResponse, SearchResult, Source, SourceMeta};

const LIBGEN_BASE_URL: &str = "https://libgen.li";
const USER_AGENT: &str = "Shiori/1.0 (libgen source)";
const MAX_LIMIT: u32 = 75;

pub struct LibgenSource {
    client: reqwest::Client,
}

impl LibgenSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create Libgen client: {}", e)))?;

        Ok(Self { client })
    }

    fn parse_size_to_bytes(size: &str) -> Option<i64> {
        let cleaned = size.trim().to_ascii_lowercase();
        if cleaned.is_empty() {
            return None;
        }

        let re = regex::Regex::new(r"(?i)^\s*(\d+(?:\.\d+)?)\s*([kmgt]?b)\s*$").ok()?;
        let caps = re.captures(&cleaned)?;
        let value = caps.get(1)?.as_str().parse::<f64>().ok()?;
        let unit = caps.get(2)?.as_str().to_ascii_lowercase();

        let multiplier = match unit.as_str() {
            "kb" => 1024.0,
            "mb" => 1024.0 * 1024.0,
            "gb" => 1024.0 * 1024.0 * 1024.0,
            "tb" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
            _ => 1.0,
        };

        Some((value * multiplier).round() as i64)
    }

    fn normalize_href(href: &str) -> String {
        if href.starts_with("http://") || href.starts_with("https://") {
            href.to_string()
        } else {
            format!("{}{}", LIBGEN_BASE_URL, href)
        }
    }

    fn extract_mirror_links(cell_html: &Html, link_selector: &Selector) -> Vec<String> {
        cell_html
            .select(link_selector)
            .filter_map(|a| a.value().attr("href"))
            .map(Self::normalize_href)
            .collect()
    }

    fn map_result_row(
        row: scraper::element_ref::ElementRef<'_>,
        cell_selector: &Selector,
        link_selector: &Selector,
    ) -> Option<SearchResult> {
        let cells = row.select(cell_selector).collect::<Vec<_>>();
        if cells.len() < 10 {
            return None;
        }

        let title = cells
            .first()
            .map(|c| c.text().collect::<String>().trim().to_string())
            .filter(|v| !v.is_empty())?;

        let author = cells
            .get(1)
            .map(|c| c.text().collect::<String>().trim().to_string())
            .filter(|v| !v.is_empty());
        let publisher = cells
            .get(2)
            .map(|c| c.text().collect::<String>().trim().to_string())
            .filter(|v| !v.is_empty());
        let year = cells
            .get(3)
            .map(|c| c.text().collect::<String>().trim().to_string())
            .filter(|v| !v.is_empty());
        let language = cells
            .get(4)
            .map(|c| c.text().collect::<String>().trim().to_string())
            .filter(|v| !v.is_empty());
        let extension = cells
            .get(7)
            .map(|c| c.text().collect::<String>().trim().to_string())
            .filter(|v| !v.is_empty());
        let size = cells
            .get(6)
            .map(|c| c.text().collect::<String>().trim().to_string())
            .filter(|v| !v.is_empty());

        let mirror_cell = cells.get(8)?;
        let mirror_html = Html::parse_fragment(&mirror_cell.html());
        let mirror_links = Self::extract_mirror_links(&mirror_html, link_selector);
        if mirror_links.is_empty() {
            return None;
        }

        let detail_id = mirror_links
            .iter()
            .find_map(|url| {
                reqwest::Url::parse(url)
                    .ok()
                    .and_then(|u| {
                        u.query_pairs()
                            .find(|(k, _)| k == "md5")
                            .map(|(_, v)| v.to_string())
                    })
            })
            .unwrap_or_else(|| format!("libgen-{}", uuid::Uuid::new_v4()));

        let mut extra = HashMap::new();
        extra.insert("title".to_string(), title.clone());
        if let Some(v) = author.clone() {
            extra.insert("author".to_string(), v);
        }
        if let Some(v) = publisher.clone() {
            extra.insert("publisher".to_string(), v);
        }
        if let Some(v) = year.clone() {
            extra.insert("year".to_string(), v);
        }
        if let Some(v) = language.clone() {
            extra.insert("language".to_string(), v);
        }
        if let Some(v) = extension.clone() {
            extra.insert("format".to_string(), v.to_ascii_uppercase());
        }
        if let Some(v) = size.clone() {
            extra.insert("file_size".to_string(), v.clone());
            if let Some(bytes) = Self::parse_size_to_bytes(&v) {
                extra.insert("file_size_bytes".to_string(), bytes.to_string());
            }
        }
        if let Some(primary) = mirror_links.first() {
            extra.insert("url".to_string(), primary.clone());
            extra.insert("detail_url".to_string(), primary.clone());
        }

        for (idx, link) in mirror_links.iter().enumerate() {
            extra.insert(format!("mirror_{}", idx + 1), link.clone());
        }

        let description = [author, publisher, year, language]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join(" • ");

        Some(SearchResult {
            id: detail_id,
            title,
            cover_url: None,
            description: if description.is_empty() { None } else { Some(description) },
            source_id: "libgen".to_string(),
            extra,
        })
    }

    async fn search_internal(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        let safe_page = page.max(1);
        let safe_limit = limit.max(1).min(MAX_LIMIT);

        let url = format!(
            "{}/index.php?req={}&columns%5B%5D=t&objects%5B%5D=f&topics%5B%5D=l&res={}&page={}",
            LIBGEN_BASE_URL,
            urlencoding::encode(query),
            safe_limit,
            safe_page
        );

        let html = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Libgen search request failed: {}", e)))?
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("Libgen search response read failed: {}", e)))?;

        let doc = Html::parse_document(&html);
        let row_selector = Selector::parse("#tablelibgen tbody tr")
            .map_err(|e| ShioriError::Other(format!("Libgen row selector parse failed: {:?}", e)))?;
        let cell_selector = Selector::parse("td")
            .map_err(|e| ShioriError::Other(format!("Libgen cell selector parse failed: {:?}", e)))?;
        let link_selector = Selector::parse("a[href]")
            .map_err(|e| ShioriError::Other(format!("Libgen link selector parse failed: {:?}", e)))?;

        let mut items = Vec::new();
        for row in doc.select(&row_selector) {
            if let Some(mapped) = Self::map_result_row(row, &cell_selector, &link_selector) {
                items.push(mapped);
            }
            if items.len() >= safe_limit as usize {
                break;
            }
        }

        Ok(SearchResponse {
            items,
            total: None,
            offset: Some((safe_page - 1) * safe_limit),
            limit: Some(safe_limit),
        })
    }

    fn collect_candidate_links(extra: &HashMap<String, String>) -> Vec<String> {
        let mut links = Vec::new();

        for key in ["url", "detail_url", "mirror_1", "mirror_2", "mirror_3", "mirror_4"] {
            if let Some(value) = extra.get(key) {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    links.push(trimmed.to_string());
                }
            }
        }

        links.sort();
        links.dedup();
        links
    }
}

#[async_trait::async_trait]
impl Source for LibgenSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "libgen".to_string(),
            name: "LibGen".to_string(),
            base_url: LIBGEN_BASE_URL.to_string(),
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
            source_id: "libgen".to_string(),
            content_id: content_id.to_string(),
        }])
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let detail_url = format!("{}/ads.php?md5={}", LIBGEN_BASE_URL, chapter_id);
        let html = self
            .client
            .get(&detail_url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Libgen detail request failed: {}", e)))?
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("Libgen detail response read failed: {}", e)))?;

        let doc = Html::parse_document(&html);
        let link_selector = Selector::parse("a[href]")
            .map_err(|e| ShioriError::Other(format!("Libgen detail link selector parse failed: {:?}", e)))?;

        let mut links: HashMap<String, String> = HashMap::new();
        for a in doc.select(&link_selector) {
            if let Some(href) = a.value().attr("href") {
                let normalized = Self::normalize_href(href);
                let lower = normalized.to_ascii_lowercase();

                if lower.starts_with("magnet:") {
                    links.insert(normalized, "magnet".to_string());
                    continue;
                }

                if lower.contains(".torrent") || lower.contains("/torrent") {
                    links.insert(normalized, "torrent".to_string());
                    continue;
                }

                if lower.starts_with("http://") || lower.starts_with("https://") {
                    links.insert(normalized, "direct".to_string());
                }
            }
        }

        if links.is_empty() {
            return Err(ShioriError::Other(
                "No download links found for this LibGen entry".to_string(),
            ));
        }

        let mut pages = Vec::new();
        let mut candidates = Self::collect_candidate_links(&HashMap::from([
            ("url".to_string(), detail_url),
        ]));

        for link in links.keys() {
            candidates.push(link.clone());
        }
        candidates.sort();
        candidates.dedup();

        for (index, link) in candidates.into_iter().enumerate() {
            let lower = link.to_ascii_lowercase();
            let prefixed = if lower.starts_with("magnet:") {
                format!("magnet|{}", link)
            } else if lower.contains(".torrent") || lower.contains("/torrent") {
                format!("torrent|{}", link)
            } else {
                format!("direct|{}", link)
            };

            pages.push(Page {
                index: index as u32,
                url: prefixed,
            });
        }

        Ok(pages)
    }
}
