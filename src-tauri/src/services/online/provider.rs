use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(thiserror::Error, Debug)]
pub enum MetadataError {
    #[error("Network is offline")]
    Offline,
    #[error("Rate limit exceeded, retry after {retry_after}s")]
    RateLimited { retry_after: u64 },
    #[error("API Request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),
    #[error("Failed to parse response: {0}")]
    ParseFailed(String),
    #[error("No match found")]
    NotFound,
    #[error("Image processing error: {0}")]
    ImageError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MetadataQuery {
    Isbn(String),
    TitleAuthor {
        title: String,
        author: Option<String>,
    },
    Title(String),
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ItemType {
    Book,
    Manga,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FetchedMetadata {
    pub provider_id: Option<String>,
    pub title: Option<String>,
    pub authors: Vec<String>,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub genres: Vec<String>,
    pub extra_data: Option<serde_json::Value>,
}

#[async_trait]
pub trait MetadataProvider: Send + Sync {
    /// Identifier for the provider (e.g., "openlibrary", "anilist")
    fn name(&self) -> &'static str;

    /// Does the provider support this media type?
    fn supports_media(&self, is_manga: bool) -> bool;

    /// Primary entry point for metadata fetching
    async fn fetch_metadata(
        &self,
        query: &MetadataQuery,
    ) -> Result<Option<FetchedMetadata>, MetadataError>;

    /// Dedicated cover fetcher (bypasses URL extraction logic for retries)
    async fn fetch_cover(&self, cover_url: &str) -> Result<Vec<u8>, MetadataError>;
}
