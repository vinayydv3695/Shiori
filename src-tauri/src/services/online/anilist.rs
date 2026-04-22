use super::provider::{FetchedMetadata, MetadataError, MetadataProvider, MetadataQuery};
use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

pub struct AniListProvider {
    client: Client,
    api_url: String,
}

impl AniListProvider {
    pub fn new() -> Result<Self, MetadataError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Shiori/0.1.0")
            .build()
            .map_err(MetadataError::RequestFailed)?;

        Ok(Self {
            client,
            api_url: "https://graphql.anilist.co".to_string(),
        })
    }
}

// Minimal GraphQL types needed for AniList search
#[derive(Debug, Deserialize)]
struct GraphQLResponse {
    data: Option<ResponseData>,
}

#[derive(Debug, Deserialize)]
struct ResponseData {
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
    staff: Option<StaffConnection>,
}

#[derive(Debug, Deserialize)]
struct TitleData {
    romaji: String,
    english: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CoverImageData {
    #[serde(rename = "extraLarge")]
    extra_large: String,
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

#[async_trait]
impl MetadataProvider for AniListProvider {
    fn name(&self) -> &'static str {
        "anilist"
    }

    fn supports_media(&self, is_manga: bool) -> bool {
        is_manga // AniList only supports manga properly
    }

    async fn fetch_metadata(
        &self,
        query: &MetadataQuery,
    ) -> Result<Option<FetchedMetadata>, MetadataError> {
        let title_to_search = match query {
            MetadataQuery::Title(t) | MetadataQuery::TitleAuthor { title: t, .. } => t,
            _ => return Ok(None), // ISBN not supported by AniList effectively
        };

        let graphql_query = r#"
            query ($search: String) {
                Page(page: 1, perPage: 1) {
                    media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
                        id
                        title { romaji english }
                        description
                        coverImage { extraLarge }
                        genres
                        staff(perPage: 5) {
                            edges {
                                role
                                node { name { full } }
                            }
                        }
                    }
                }
            }
        "#;

        let variables = serde_json::json!({ "search": title_to_search });
        let payload = serde_json::json!({
            "query": graphql_query,
            "variables": variables
        });

        let response = self
            .client
            .post(&self.api_url)
            .json(&payload)
            .send()
            .await
            .map_err(MetadataError::RequestFailed)?;

        if response.status() == 429 {
            return Err(MetadataError::RateLimited { retry_after: 60 });
        } else if !response.status().is_success() {
            return Err(MetadataError::ParseFailed(format!(
                "AniList API error: {}",
                response.status()
            )));
        }

        let result: GraphQLResponse = response
            .json()
            .await
            .map_err(|e| MetadataError::ParseFailed(e.to_string()))?;

        if let Some(data) = result.data {
            if let Some(page) = data.page {
                if let Some(media) = page.media.into_iter().next() {
                    let mut authors = Vec::new();
                    if let Some(staff_conn) = media.staff {
                        for edge in staff_conn.edges {
                            if edge.role.contains("Story") || edge.role.contains("Art") {
                                authors.push(edge.node.name.full);
                            }
                        }
                    }

                    // Remove HTML tags from description
                    let description = media.description.map(|desc| {
                        desc.replace("<br>", "\n")
                            .replace("<br/>", "\n")
                            .replace("<i>", "")
                            .replace("</i>", "")
                            .replace("<b>", "")
                            .replace("</b>", "")
                    });

                    return Ok(Some(FetchedMetadata {
                        provider_id: Some(self.name().to_string()),
                        title: Some(media.title.english.unwrap_or(media.title.romaji)),
                        authors,
                        description,
                        cover_url: Some(media.cover_image.extra_large),
                        genres: media.genres,
                        extra_data: Some(serde_json::json!({"anilist_id": media.id})),
                    }));
                }
            }
        }

        Ok(None)
    }

    async fn fetch_cover(&self, cover_url: &str) -> Result<Vec<u8>, MetadataError> {
        let response = self
            .client
            .get(cover_url)
            .send()
            .await
            .map_err(MetadataError::RequestFailed)?;

        if response.status() == 429 {
            return Err(MetadataError::RateLimited { retry_after: 60 });
        } else if !response.status().is_success() {
            return Err(MetadataError::ParseFailed(format!(
                "Failed to download cover: HTTP {}",
                response.status()
            )));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|_| MetadataError::ImageError("Failed to read image bytes".to_string()))?;

        Ok(bytes.to_vec())
    }
}
