/// Manga Metadata Service - AniList API Integration
///
/// Fetches rich metadata for manga from AniList's GraphQL API including:
/// - Official cover artwork
/// - Synopsis/description
/// - Genres and tags
/// - Authors and artists
/// - Community ratings
/// - Publication information

use crate::error::{ShioriError, ShioriResult};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

// ═══════════════════════════════════════════════════════════
// API TYPES
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MangaMetadata {
    pub anilist_id: i64,
    pub title_english: Option<String>,
    pub title_romaji: String,
    pub title_native: Option<String>,
    pub description: Option<String>,
    pub cover_url_large: String,
    pub cover_url_extra_large: String,
    pub genres: Vec<String>,
    pub average_score: Option<i32>, // 0-100
    pub volumes: Option<i32>,
    pub chapters: Option<i32>,
    pub status: String, // FINISHED, RELEASING, NOT_YET_RELEASED, etc.
    pub start_year: Option<i32>,
    pub authors: Vec<String>,
}

#[derive(Debug, Serialize)]
struct GraphQLQuery {
    query: String,
    variables: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct GraphQLResponse {
    data: Option<ResponseData>,
}

#[derive(Debug, Deserialize)]
struct ResponseData {
    #[serde(rename = "Media")]
    media: Option<MediaData>,
    #[serde(rename = "Page")]
    page: Option<PageData>,
}

#[derive(Debug, Deserialize)]
struct PageData {
    media: Vec<MediaData>,
}

#[derive(Debug, Deserialize)]
struct MediaData {
    id: i64,
    title: TitleData,
    description: Option<String>,
    #[serde(rename = "coverImage")]
    cover_image: CoverImageData,
    genres: Vec<String>,
    #[serde(rename = "averageScore")]
    average_score: Option<i32>,
    volumes: Option<i32>,
    chapters: Option<i32>,
    status: String,
    #[serde(rename = "startDate")]
    start_date: DateData,
    staff: Option<StaffConnection>,
}

#[derive(Debug, Deserialize)]
struct TitleData {
    romaji: String,
    english: Option<String>,
    native: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CoverImageData {
    large: String,
    #[serde(rename = "extraLarge")]
    extra_large: String,
}

#[derive(Debug, Deserialize)]
struct DateData {
    year: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct StaffConnection {
    edges: Vec<StaffEdge>,
}

#[derive(Debug, Deserialize)]
struct StaffEdge {
    role: String,
    node: StaffNode,
}

#[derive(Debug, Deserialize)]
struct StaffNode {
    name: StaffName,
}

#[derive(Debug, Deserialize)]
struct StaffName {
    full: String,
}

// ═══════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════

pub struct MangaMetadataService {
    client: Client,
    api_url: String,
}

impl MangaMetadataService {
    pub fn new() -> ShioriResult<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Shiori/0.1.0")
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            client,
            api_url: "https://graphql.anilist.co".to_string(),
        })
    }

    /// Search for manga by title
    pub async fn search_manga(&self, title: &str) -> ShioriResult<Vec<MangaMetadata>> {
        log::info!("[MangaMetadataService] Searching for: '{}'", title);

        let query = r#"
            query ($search: String) {
                Page(page: 1, perPage: 5) {
                    media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
                        id
                        title {
                            romaji
                            english
                            native
                        }
                        description
                        coverImage {
                            large
                            extraLarge
                        }
                        genres
                        averageScore
                        volumes
                        chapters
                        status
                        startDate {
                            year
                        }
                        staff(perPage: 5) {
                            edges {
                                role
                                node {
                                    name {
                                        full
                                    }
                                }
                            }
                        }
                    }
                }
            }
        "#;

        let variables = serde_json::json!({
            "search": title
        });

        let payload = GraphQLQuery {
            query: query.to_string(),
            variables,
        };

        let response = self
            .client
            .post(&self.api_url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("AniList API request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(ShioriError::Other(format!(
                "AniList API returned error: {}",
                response.status()
            )));
        }

        let result: GraphQLResponse = response
            .json()
            .await
            .map_err(|e| ShioriError::Other(format!("Failed to parse AniList response: {}", e)))?;

        if let Some(data) = result.data {
            if let Some(page) = data.page {
                let metadata: Vec<MangaMetadata> = page
                    .media
                    .into_iter()
                    .map(|m| self.convert_media_data(m))
                    .collect();

                log::info!(
                    "[MangaMetadataService] Found {} matches for '{}'",
                    metadata.len(),
                    title
                );
                return Ok(metadata);
            }
        }

        log::warn!("[MangaMetadataService] No results found for '{}'", title);
        Ok(vec![])
    }

    /// Get detailed metadata by AniList ID
    pub async fn get_manga_by_id(&self, anilist_id: i64) -> ShioriResult<MangaMetadata> {
        log::info!("[MangaMetadataService] Fetching manga ID: {}", anilist_id);

        let query = r#"
            query ($id: Int) {
                Media(id: $id, type: MANGA) {
                    id
                    title {
                        romaji
                        english
                        native
                    }
                    description
                    coverImage {
                        large
                        extraLarge
                    }
                    genres
                    averageScore
                    volumes
                    chapters
                    status
                    startDate {
                        year
                    }
                    staff(perPage: 10) {
                        edges {
                            role
                            node {
                                name {
                                    full
                                }
                            }
                        }
                    }
                }
            }
        "#;

        let variables = serde_json::json!({
            "id": anilist_id
        });

        let payload = GraphQLQuery {
            query: query.to_string(),
            variables,
        };

        let response = self
            .client
            .post(&self.api_url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("AniList API request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(ShioriError::Other(format!(
                "AniList API returned error: {}",
                response.status()
            )));
        }

        let result: GraphQLResponse = response
            .json()
            .await
            .map_err(|e| ShioriError::Other(format!("Failed to parse AniList response: {}", e)))?;

        if let Some(data) = result.data {
            if let Some(media) = data.media {
                return Ok(self.convert_media_data(media));
            }
        }

        Err(ShioriError::Other(format!(
            "Manga with ID {} not found",
            anilist_id
        )))
    }

    /// Download cover image from URL
    pub async fn download_cover(&self, url: &str) -> ShioriResult<Vec<u8>> {
        log::info!("[MangaMetadataService] Downloading cover from: {}", url);

        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Failed to download cover: {}", e)))?;

        if !response.status().is_success() {
            return Err(ShioriError::Other(format!(
                "Failed to download cover: HTTP {}",
                response.status()
            )));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| ShioriError::Other(format!("Failed to read cover data: {}", e)))?;

        log::info!("[MangaMetadataService] ✅ Downloaded {} bytes", bytes.len());
        Ok(bytes.to_vec())
    }

    /// Helper to convert API data to our format
    fn convert_media_data(&self, media: MediaData) -> MangaMetadata {
        // Extract authors (Original Story, Story & Art, etc.)
        let authors = if let Some(staff_conn) = media.staff {
            staff_conn
                .edges
                .into_iter()
                .filter(|edge| {
                    edge.role.contains("Original Story")
                        || edge.role.contains("Story & Art")
                        || edge.role.contains("Story")
                })
                .map(|edge| edge.node.name.full)
                .collect()
        } else {
            vec![]
        };

        // Strip HTML tags from description
        let description = media.description.map(|desc| {
            // Simple HTML tag removal
            desc.replace("<br>", "\n")
                .replace("<br/>", "\n")
                .replace("<i>", "")
                .replace("</i>", "")
                .replace("<b>", "")
                .replace("</b>", "")
        });

        MangaMetadata {
            anilist_id: media.id,
            title_english: media.title.english,
            title_romaji: media.title.romaji,
            title_native: media.title.native,
            description,
            cover_url_large: media.cover_image.large,
            cover_url_extra_large: media.cover_image.extra_large,
            genres: media.genres,
            average_score: media.average_score,
            volumes: media.volumes,
            chapters: media.chapters,
            status: media.status,
            start_year: media.start_date.year,
            authors,
        }
    }
}

impl Default for MangaMetadataService {
    fn default() -> Self {
        Self::new().expect("Failed to create MangaMetadataService")
    }
}

// ═══════════════════════════════════════════════════════════
// TITLE PARSING
// ═══════════════════════════════════════════════════════════

/// Parse manga title from filename
/// Handles various naming conventions:
/// - "One Piece v103.cbz" → "One Piece"
/// - "[Group] Series Name Ch.123.cbz" → "Series Name"
/// - "SeriesName_Vol_05.cbz" → "SeriesName"
pub fn parse_manga_title(filename: &str) -> String {
    let mut title = filename
        .trim_end_matches(".cbz")
        .trim_end_matches(".cbr")
        .to_string();

    // Remove group tags: [Group] or (Group)
    if let Some(start) = title.find('[') {
        if let Some(end) = title.find(']') {
            title = title[end + 1..].trim().to_string();
        }
    }
    if let Some(start) = title.find('(') {
        if let Some(end) = title.find(')') {
            title = title[..start].to_string() + &title[end + 1..];
        }
    }

    // Remove volume/chapter indicators (case insensitive)
    let patterns = [
        r" v\d+",
        r" vol\.?\s*\d+",
        r" volume\s*\d+",
        r" ch\.?\s*\d+",
        r" chapter\s*\d+",
        r"_v\d+",
        r"_vol_\d+",
        r"_ch_\d+",
    ];

    for pattern in &patterns {
        if let Ok(re) = regex::Regex::new(&format!("(?i){}", pattern)) {
            title = re.replace_all(&title, "").to_string();
        }
    }

    // Replace underscores and multiple spaces
    title = title.replace('_', " ");
    title = title.split_whitespace().collect::<Vec<_>>().join(" ");

    title.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_manga_title() {
        assert_eq!(parse_manga_title("One Piece v103.cbz"), "One Piece");
        assert_eq!(
            parse_manga_title("[Group] Attack on Titan Ch.139.cbz"),
            "Attack on Titan"
        );
        assert_eq!(
            parse_manga_title("Berserk_Vol_41.cbz"),
            "Berserk"
        );
        assert_eq!(
            parse_manga_title("(Digital) Vinland Saga Volume 12.cbz"),
            "Vinland Saga"
        );
    }
}
