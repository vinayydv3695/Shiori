use super::provider::{FetchedMetadata, MetadataError, MetadataProvider, MetadataQuery};
use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

pub struct OpenLibraryProvider {
    client: Client,
    base_url: String,
    covers_url: String,
}

impl OpenLibraryProvider {
    pub fn new() -> Result<Self, MetadataError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Shiori/0.1.0")
            .build()
            .map_err(MetadataError::RequestFailed)?;

        Ok(Self {
            client,
            base_url: "https://openlibrary.org".to_string(),
            covers_url: "https://covers.openlibrary.org".to_string(),
        })
    }
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    docs: Vec<SearchDoc>,
}

#[derive(Debug, Deserialize)]
struct SearchDoc {
    key: String,
    title: String,
    author_name: Option<Vec<String>>,
    subject: Option<Vec<String>>,
    cover_i: Option<i64>, // Cover ID
}

#[async_trait]
impl MetadataProvider for OpenLibraryProvider {
    fn name(&self) -> &'static str {
        "openlibrary"
    }

    fn supports_media(&self, is_manga: bool) -> bool {
        !is_manga // OpenLibrary focuses on books, not manga
    }

    async fn fetch_metadata(
        &self,
        query: &MetadataQuery,
    ) -> Result<Option<FetchedMetadata>, MetadataError> {
        let url = match query {
            MetadataQuery::Isbn(isbn) => {
                format!("{}/search.json?isbn={}&limit=1", self.base_url, isbn)
            }
            MetadataQuery::TitleAuthor { title, author } => {
                let mut query_parts = vec![format!("title:{}", title)];
                if let Some(author_name) = author {
                    query_parts.push(format!("author:{}", author_name));
                }
                format!(
                    "{}/search.json?q={}&limit=1",
                    self.base_url,
                    urlencoding::encode(&query_parts.join(" AND "))
                )
            }
            MetadataQuery::Title(title) => {
                format!(
                    "{}/search.json?title={}&limit=1",
                    self.base_url,
                    urlencoding::encode(title)
                )
            }
        };

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(MetadataError::RequestFailed)?;

        if response.status() == 429 {
            return Err(MetadataError::RateLimited { retry_after: 60 });
        } else if !response.status().is_success() {
            return Err(MetadataError::ParseFailed(format!(
                "OpenLibrary API error: {}",
                response.status()
            )));
        }

        let result: SearchResponse = response
            .json()
            .await
            .map_err(|e| MetadataError::ParseFailed(e.to_string()))?;

        if let Some(doc) = result.docs.into_iter().next() {
            let cover_url = doc
                .cover_i
                .map(|cover_id| format!("{}/b/id/{}-L.jpg", self.covers_url, cover_id));

            return Ok(Some(FetchedMetadata {
                provider_id: Some(self.name().to_string()),
                title: Some(doc.title),
                authors: doc.author_name.unwrap_or_default(),
                description: None, // Description usually needs a second query for works
                cover_url,
                genres: doc.subject.unwrap_or_default(),
                extra_data: Some(serde_json::json!({"openlibrary_id": doc.key})),
            }));
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
