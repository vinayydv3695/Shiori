use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;

use crate::error::{Result, ShioriError};
use crate::sources::{Chapter, ContentType, Page, SearchResult, Source, SourceMeta};

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
        let q = urlencoding::encode(query);
        let offset = page.saturating_sub(1) * 20;
        let url = format!(
            "{}/manga?title={}&limit=20&offset={}&includes[]=cover_art&order[relevance]=desc",
            MANGADEX_API_BASE, q, offset
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
            let url = format!(
                "{}/chapter?manga={}&translatedLanguage[]=en&order[chapter]=asc&limit=100&offset={}",
                MANGADEX_API_BASE, content_id, offset
            );

            let response: MangaDexChapterResponse = self
                .client
                .get(url)
                .send()
                .await
                .map_err(|e| ShioriError::Other(format!("MangaDex chapter request failed: {}", e)))?
                .json()
                .await
                .map_err(|e| ShioriError::Other(format!("MangaDex chapter parse failed: {}", e)))?;

            let count = response.data.len();
            chapters.extend(response.data.into_iter().map(|ch| {
                let number = ch.attributes.chapter.as_deref().and_then(|n| n.parse::<f32>().ok());
                let title = match (&ch.attributes.chapter, &ch.attributes.title) {
                    (Some(num), Some(title)) if !title.is_empty() => format!("Chapter {}: {}", num, title),
                    (Some(num), _) => format!("Chapter {}", num),
                    (_, Some(title)) if !title.is_empty() => title.clone(),
                    _ => "Chapter".to_string(),
                };

                Chapter {
                    id: ch.id,
                    title,
                    number: number.unwrap_or(0.0),
                    volume: None,
                    uploaded_at: None,
                    source_id: "mangadex".to_string(),
                    content_id: content_id.to_string(),
                }
            }));

            if count < 100 {
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
                url: format!("{}/data/{}/{}", response.base_url, response.chapter.hash, file),
            })
            .collect())
    }
}

#[derive(Debug, Deserialize)]
struct MangaDexMangaResponse {
    data: Vec<MangaDexManga>,
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

#[derive(Debug, Deserialize)]
struct MangaDexChapterResponse {
    data: Vec<MangaDexChapter>,
}

#[derive(Debug, Deserialize)]
struct MangaDexChapter {
    id: String,
    attributes: MangaDexChapterAttributes,
}

#[derive(Debug, Deserialize)]
struct MangaDexChapterAttributes {
    chapter: Option<String>,
    title: Option<String>,
}

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
