use std::collections::HashMap;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::error::{Result, ShioriError};

pub mod annas_archive;
pub mod libgen;
pub mod mangadex;
pub mod mangafire;
pub mod nyaa;
pub mod registry;
pub mod toongod;
pub mod torrent_csv;
pub mod weebrook;
pub mod manhwahub;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ContentType {
    Manga,
    Book,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceMeta {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub version: String,
    pub content_type: ContentType,
    pub supports_search: bool,
    pub supports_download: bool,
    pub requires_api_key: bool,
    pub nsfw: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub cover_url: Option<String>,
    pub description: Option<String>,
    pub source_id: String,
    pub extra: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub items: Vec<SearchResult>,
    pub total: Option<u32>,
    pub offset: Option<u32>,
    pub limit: Option<u32>,
    pub diagnostics: Option<SourceSearchDiagnostics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorAttemptDiagnostic {
    pub mirror: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSearchDiagnostics {
    pub source_id: String,
    pub source_name: Option<String>,
    pub selected_mirror: Option<String>,
    pub selected_base: Option<String>,
    pub attempted_mirrors: Vec<MirrorAttemptDiagnostic>,
    pub duration_ms: u64,
    pub result_count: u32,
    pub retries_used: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub id: String,
    pub title: String,
    pub number: f32,
    pub volume: Option<String>,
    pub uploaded_at: Option<String>,
    pub source_id: String,
    pub content_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub index: u32,
    pub url: String,
}

#[async_trait]
pub trait Source: Send + Sync {
    fn as_any(&self) -> &dyn std::any::Any;
    fn meta(&self) -> SourceMeta;
    async fn search(&self, query: &str, page: u32) -> Result<Vec<SearchResult>>;
    async fn search_with_meta(
        &self,
        query: &str,
        page: u32,
        _limit: u32,
    ) -> Result<SearchResponse> {
        let items = self.search(query, page).await?;
        Ok(SearchResponse {
            items,
            total: None,
            offset: None,
            limit: None,
            diagnostics: None,
        })
    }
    async fn browse(
        &self,
        _mode: &str,
        _page: u32,
        _limit: u32,
        _genres: Option<Vec<String>>,
        _types: Option<Vec<String>>,
    ) -> Result<Vec<SearchResult>> {
        Err(ShioriError::UnsupportedFeature(
            "Browse is not supported by this source".to_string(),
        ))
    }
    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>>;
    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>>;
}
