use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;

use crate::error::{Result, ShioriError};
use crate::sources::{
    Chapter, ContentType, Page, SearchResponse, SearchResult, Source, SourceMeta,
};

const MANGADEX_API_BASE: &str = "https://api.mangadex.org";
const SHIORI_UA: &str = "Shiori/1.0 (github.com/vinayydv3695/Shiori)";

pub struct MangaDexSource {
    client: reqwest::Client,
}

impl MangaDexSource {
    pub fn new() -> Result<Self> {
        let mut headers = HeaderMap::new();
        let ua = HeaderValue::from_str(SHIORI_UA)
            .map_err(|e| ShioriError::Other(format!("Invalid MangaDex UA header: {}", e)))?;
        headers.insert(USER_AGENT, ua);

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create MangaDex client: {}", e)))?;

        Ok(Self { client })
    }
}

#[async_trait::async_trait]
impl Source for MangaDexSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "mangadex".to_string(),
            name: "MangaDex".to_string(),
            base_url: "https://mangadex.org".to_string(),
            version: "1.0.0".to_string(),
            content_type: ContentType::Manga,
            supports_search: true,
            supports_download: true,
            requires_api_key: false,
            nsfw: true,
        }
    }

    async fn search(&self, query: &str, page: u32) -> Result<Vec<SearchResult>> {
        Ok(self.search_with_meta(query, page, 20).await?.items)
    }

    async fn search_with_meta(&self, query: &str, page: u32, limit: u32) -> Result<SearchResponse> {
        let safe_page = page.max(1);
        let safe_limit = limit.max(1).min(100);
        let q = urlencoding::encode(query);
        let offset = (safe_page - 1) * safe_limit;
        // Include all content ratings so results aren't filtered out silently
        let url = format!(
            "{}/manga?title={}&limit={}&offset={}&includes%5B%5D=cover_art&order%5Brelevance%5D=desc&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive&contentRating%5B%5D=erotica",
            MANGADEX_API_BASE, q, safe_limit, offset
        );

        let response: MangaDexMangaResponse = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaDex search request failed: {}", e)))?
            .json()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaDex search parse failed: {}", e)))?;

        let items = response
            .data
            .into_iter()
            .map(|item| {
                let title = item
                    .attributes
                    .title
                    .get("en")
                    .cloned()
                    .or_else(|| item.attributes.title.values().next().cloned())
                    .unwrap_or_else(|| "Untitled".to_string());

                let summary = item
                    .attributes
                    .description
                    .as_ref()
                    .and_then(|d| d.get("en").cloned().or_else(|| d.values().next().cloned()));

                let cover_file = item
                    .relationships
                    .as_ref()
                    .and_then(|rels| rels.iter().find(|r| r.r#type == "cover_art"))
                    .and_then(|r| r.attributes.as_ref())
                    .and_then(|a| a.file_name.clone());

                let cover_url = cover_file
                    .map(|f| format!("https://uploads.mangadex.org/covers/{}/{}", item.id, f));

                SearchResult {
                    id: item.id.clone(),
                    title,
                    cover_url,
                    description: summary,
                    source_id: "mangadex".to_string(),
                    extra: HashMap::new(),
                }
            })
            .collect();

        Ok(SearchResponse {
            items,
            total: response.total,
            offset: response.offset,
            limit: response.limit,
            diagnostics: None,
        })
    }

    async fn browse(
        &self,
        mode: &str,
        page: u32,
        limit: u32,
        _genres: Option<Vec<String>>,
        _types: Option<Vec<String>>,
    ) -> Result<Vec<SearchResult>> {
        let safe_page = page.max(1);
        let safe_limit = limit.max(1).min(100);
        let offset = (safe_page - 1) * safe_limit;

        let order_param = match mode {
            "latest" | "Updated" => "order%5BlatestUploadedChapter%5D=desc",
            "popular" => "order%5BfollowedCount%5D=desc",
            "recent" | "Added" | "Newest" => "order%5BcreatedAt%5D=desc",
            "top-rated" => "order%5Brating%5D=desc",
            "Random" | "random" => "order%5BcreatedAt%5D=desc",
            _ => return Err(ShioriError::Validation(format!("Unsupported browse mode: {}", mode))),
        };

        let url = format!(
            "{}/manga?limit={}&offset={}&hasAvailableChapters=true&availableTranslatedLanguage%5B%5D=en&includes%5B%5D=cover_art&includes%5B%5D=author&includes%5B%5D=artist&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive&{}",
            MANGADEX_API_BASE, safe_limit, offset, order_param
        );

        let response: MangaDexMangaResponse = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaDex browse request failed: {}", e)))?
            .json()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaDex browse parse failed: {}", e)))?;

        Ok(response
            .data
            .into_iter()
            .map(|item| {
                let title = item
                    .attributes
                    .title
                    .get("en")
                    .cloned()
                    .or_else(|| item.attributes.title.values().next().cloned())
                    .unwrap_or_else(|| "Untitled".to_string());

                let summary = item
                    .attributes
                    .description
                    .as_ref()
                    .and_then(|d| d.get("en").cloned().or_else(|| d.values().next().cloned()));

                let cover_file = item
                    .relationships
                    .as_ref()
                    .and_then(|rels| rels.iter().find(|r| r.r#type == "cover_art"))
                    .and_then(|r| r.attributes.as_ref())
                    .and_then(|a| a.file_name.clone());

                let cover_url = cover_file
                    .map(|f| format!("https://uploads.mangadex.org/covers/{}/{}", item.id, f));

                SearchResult {
                    id: item.id.clone(),
                    title,
                    cover_url,
                    description: summary,
                    source_id: "mangadex".to_string(),
                    extra: HashMap::new(),
                }
            })
            .collect())
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        let mut offset = 0usize;
        let mut chapters = Vec::new();

        loop {
            // Include all contentRating filters and scanlation_group includes
            // Omitting contentRating[] causes the API to return 0 results for many titles
            let url = format!(
                "{}/chapter?manga={}&translatedLanguage%5B%5D=en&order%5Bchapter%5D=asc&limit=100&offset={}&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive&contentRating%5B%5D=erotica&contentRating%5B%5D=pornographic&includes%5B%5D=scanlation_group",
                MANGADEX_API_BASE, content_id, offset
            );

            let resp = self.client.get(&url).send().await.map_err(|e| {
                ShioriError::Other(format!("MangaDex chapter request failed: {}", e))
            })?;

            // Check HTTP-level errors before consuming the body
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                let truncated_body: String = body.chars().take(300).collect();
                return Err(ShioriError::Other(format!(
                    "MangaDex chapter API returned HTTP {}: {}",
                    status,
                    truncated_body
                )));
            }

            let response: MangaDexChapterResponse = resp
                .json()
                .await
                .map_err(|e| ShioriError::Other(format!("MangaDex chapter parse failed: {}", e)))?;

            // Check API-level error result field
            if let Some(ref result) = response.result {
                if result == "error" {
                    return Err(ShioriError::Other(
                        "MangaDex API returned an error for chapter list. The manga may not be accessible or the ID is invalid.".to_string(),
                    ));
                }
            }

            let count = response.data.len();
            let total = response.total.unwrap_or(0) as usize;

            chapters.extend(response.data.into_iter().map(|ch| {
                let number = ch
                    .attributes
                    .chapter
                    .as_deref()
                    .and_then(|n| n.parse::<f32>().ok());
                let title = match (&ch.attributes.chapter, &ch.attributes.title) {
                    (Some(num), Some(title)) if !title.is_empty() => {
                        format!("Chapter {}: {}", num, title)
                    }
                    (Some(num), _) => format!("Chapter {}", num),
                    (_, Some(title)) if !title.is_empty() => title.clone(),
                    _ => "Chapter".to_string(),
                };

                Chapter {
                    id: ch.id,
                    title,
                    number: number.unwrap_or(0.0),
                    volume: ch.attributes.volume,
                    uploaded_at: ch.attributes.publish_at,
                    source_id: "mangadex".to_string(),
                    content_id: content_id.to_string(),
                }
            }));

            let fetched_so_far = offset + count;
            // Stop if last batch was smaller than limit, or we've fetched all known chapters
            if count < 100 || (total > 0 && fetched_so_far >= total) {
                break;
            }
            offset += 100;
        }

        Ok(chapters)
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        let url = format!("{}/at-home/server/{}", MANGADEX_API_BASE, chapter_id);
        let response: MangaDexAtHomeResponse = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaDex pages request failed: {}", e)))?
            .json()
            .await
            .map_err(|e| ShioriError::Other(format!("MangaDex pages parse failed: {}", e)))?;

        Ok(response
            .chapter
            .data
            .into_iter()
            .enumerate()
            .map(|(idx, file)| Page {
                index: idx as u32,
                url: format!(
                    "{}/data/{}/{}",
                    response.base_url, response.chapter.hash, file
                ),
            })
            .collect())
    }
}

// ─── Deserialization structs ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct MangaDexMangaResponse {
    data: Vec<MangaDexManga>,
    total: Option<u32>,
    offset: Option<u32>,
    limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct MangaDexManga {
    id: String,
    attributes: MangaDexMangaAttributes,
    relationships: Option<Vec<MangaDexRelationship>>,
}

#[derive(Debug, Deserialize)]
struct MangaDexMangaAttributes {
    title: std::collections::HashMap<String, String>,
    description: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
struct MangaDexRelationship {
    #[serde(rename = "type")]
    r#type: String,
    attributes: Option<MangaDexCoverAttributes>,
}

#[derive(Debug, Deserialize)]
struct MangaDexCoverAttributes {
    #[serde(rename = "fileName")]
    file_name: Option<String>,
}

// ─── Chapter response structs ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct MangaDexChapterResponse {
    /// API-level result; "ok" on success, "error" on failure
    result: Option<String>,
    data: Vec<MangaDexChapter>,
    /// Total number of chapters available (used to terminate pagination)
    total: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct MangaDexChapter {
    id: String,
    attributes: MangaDexChapterAttributes,
    #[allow(dead_code)]
    relationships: Option<Vec<MangaDexChapterRelationship>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MangaDexChapterAttributes {
    chapter: Option<String>,
    title: Option<String>,
    volume: Option<String>,
    #[allow(dead_code)]
    pages: Option<u32>,
    #[serde(rename = "publishAt")]
    publish_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MangaDexChapterRelationship {
    #[allow(dead_code)]
    #[serde(rename = "type")]
    r#type: String,
    #[allow(dead_code)]
    attributes: Option<MangaDexScanlationGroupAttributes>,
}

#[derive(Debug, Deserialize)]
struct MangaDexScanlationGroupAttributes {
    #[allow(dead_code)]
    name: Option<String>,
}

// ─── At-Home (page CDN) structs ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct MangaDexAtHomeResponse {
    #[serde(rename = "baseUrl")]
    base_url: String,
    chapter: MangaDexAtHomeChapter,
}

#[derive(Debug, Deserialize)]
struct MangaDexAtHomeChapter {
    hash: String,
    data: Vec<String>,
}
