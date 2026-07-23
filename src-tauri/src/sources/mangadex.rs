use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;

use crate::error::{Result, ShioriError};
use crate::sources::{
    Chapter, ContentType, Page, SearchResponse, SearchResult, Source, SourceMeta,
};

const DEFAULT_MANGADEX_API_BASE: &str = "https://api.mangadex.org";
const SHIORI_UA: &str = "Shiori/1.0 (github.com/vinayydv3695/Shiori)";

pub struct MangaDexSource {
    client: reqwest::Client,
    api_base: String,
    tags_cache: tokio::sync::RwLock<Option<HashMap<String, String>>>,
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
            .pool_idle_timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(0)
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create MangaDex client: {}", e)))?;

        let api_base = std::env::var("MANGADEX_API_BASE").unwrap_or_else(|_| DEFAULT_MANGADEX_API_BASE.to_string());

        Ok(Self { 
            client, 
            api_base,
            tags_cache: tokio::sync::RwLock::new(None),
        })
    }

    async fn get_tags(&self) -> Result<HashMap<String, String>> {
        {
            let cache = self.tags_cache.read().await;
            if let Some(tags) = &*cache {
                return Ok(tags.clone());
            }
        }

        let url = format!("{}/manga/tag", self.api_base);
        let resp: serde_json::Value = self.client.get(&url).send().await
            .map_err(|e| ShioriError::Other(format!("Failed to fetch MangaDex tags: {}", e)))?
            .json().await
            .map_err(|e| ShioriError::Other(format!("Failed to parse MangaDex tags: {}", e)))?;

        let mut tags = HashMap::new();
        if let Some(data) = resp.get("data").and_then(|d| d.as_array()) {
            for tag in data {
                if let (Some(id), Some(attributes)) = (tag.get("id").and_then(|i| i.as_str()), tag.get("attributes")) {
                    if let Some(name) = attributes.get("name").and_then(|n| n.get("en")).and_then(|n| n.as_str()) {
                        let normalized = name.to_lowercase().chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>();
                        tags.insert(normalized, id.to_string());
                    }
                }
            }
        }

        let mut cache = self.tags_cache.write().await;
        *cache = Some(tags.clone());
        Ok(tags)
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
            self.api_base, q, safe_limit, offset
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
                    .and_then(|a| a.get("fileName"))
                    .and_then(|f| f.as_str())
                    .map(|s| s.to_string());

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

        let mut included_tags = Vec::new();
        let mut original_languages = Vec::new();
        let mut demographics = Vec::new();
        let mut content_ratings = vec!["safe", "suggestive"];

        let tags_map = self.get_tags().await?;

        if let Some(genres) = _genres {
            for genre in genres {
                let lower = genre.to_lowercase();
                match lower.as_str() {
                    "shounen" | "shoujo" | "seinen" | "josei" => demographics.push(lower),
                    "smut" => { content_ratings.push("erotica"); content_ratings.push("pornographic"); },
                    "ecchi" => {}, // already included as suggestive
                    "kids" => demographics.push("shounen".to_string()), // approximate
                    _ => {
                        let normalized = lower.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>();
                        if let Some(id) = tags_map.get(&normalized) {
                            included_tags.push(id.to_string());
                        } else {
                            tracing::warn!("MangaDex: unresolvable genre filter '{}'", genre);
                            return Err(ShioriError::Validation(format!("MangaDex: unresolvable genre filter '{}'", genre)));
                        }
                    }
                }
            }
        }

        if let Some(types) = _types {
            for t in types {
                let lower = t.to_lowercase();
                match lower.as_str() {
                    "manga" => original_languages.push("ja"),
                    "manhwa" => original_languages.push("ko"),
                    "manhua" => { original_languages.push("zh"); original_languages.push("zh-hk"); },
                    "novel" => {
                        tracing::warn!("MangaDex: dropped 'Novel' type filter since it is not hosted");
                        return Ok(Vec::new());
                    },
                    _ => {
                        let normalized = lower.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>();
                        if let Some(id) = tags_map.get(&normalized) {
                            included_tags.push(id.to_string());
                        } else {
                            tracing::warn!("MangaDex: unresolvable type filter '{}'", t);
                            return Err(ShioriError::Validation(format!("MangaDex: unresolvable type filter '{}'", t)));
                        }
                    }
                }
            }
        }

        let mut filter_params = String::new();
        for tag in included_tags {
            filter_params.push_str(&format!("&includedTags%5B%5D={}", tag));
        }
        for lang in original_languages {
            filter_params.push_str(&format!("&originalLanguage%5B%5D={}", lang));
        }
        for demo in demographics {
            filter_params.push_str(&format!("&publicationDemographic%5B%5D={}", demo));
        }
        for cr in content_ratings {
            filter_params.push_str(&format!("&contentRating%5B%5D={}", cr));
        }

        let url = format!(
            "{}/manga?limit={}&offset={}&hasAvailableChapters=true&availableTranslatedLanguage%5B%5D=en&includes%5B%5D=cover_art&includes%5B%5D=author&includes%5B%5D=artist{}&{}",
            self.api_base, safe_limit, offset, filter_params, order_param
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
                    .and_then(|a| a.get("fileName"))
                    .and_then(|f| f.as_str())
                    .map(|s| s.to_string());

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
                self.api_base, content_id, offset
            );

            let resp = self.client.get(&url).send().await.map_err(|e| {
                let err_msg = e.to_string();
                let short_err = err_msg.split("url (").next().unwrap_or(&err_msg);
                let inner = std::error::Error::source(&e).map(|s| s.to_string()).unwrap_or_default();
                ShioriError::Other(format!("MangaDex chapter request failed: {} | Inner: {}", short_err, inner))
            })?;

            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();

            // Check HTTP-level errors before consuming the body
            if !status.is_success() {
                let truncated_body: String = body.chars().take(500).collect();
                return Err(ShioriError::Other(format!(
                    "MangaDex chapter API returned HTTP {}: {}",
                    status,
                    truncated_body
                )));
            }

            let response: MangaDexChapterResponse = serde_json::from_str(&body)
                .map_err(|e| ShioriError::Other(format!("MangaDex chapter parse failed: {}. Body: {}", e, body.chars().take(500).collect::<String>())))?;

            // Check API-level error result field
            if let Some(ref result) = response.result {
                if result == "error" {
                    return Err(ShioriError::Other(format!(
                        "MangaDex API returned an error for chapter list. Body: {}",
                        body.chars().take(500).collect::<String>()
                    )));
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
        let url = format!("{}/at-home/server/{}", self.api_base, chapter_id);
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
    attributes: Option<serde_json::Value>,
}

// ─── Chapter response structs ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct MangaDexChapterResponse {
    /// API-level result; "ok" on success, "error" on failure
    result: Option<String>,
    #[serde(default)]
    data: Vec<MangaDexChapter>,
    /// Total number of chapters available (used to terminate pagination)
    total: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct MangaDexChapter {
    id: String,
    attributes: MangaDexChapterAttributes,
}

#[derive(Debug, Deserialize, Default)]
struct MangaDexChapterAttributes {
    chapter: Option<String>,
    title: Option<String>,
    volume: Option<String>,
    #[allow(dead_code)]
    pages: Option<u32>,
    #[serde(rename = "publishAt")]
    publish_at: Option<String>,
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
