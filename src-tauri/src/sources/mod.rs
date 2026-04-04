use std::collections::HashMap;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::error::Result;

pub mod annas_archive;
pub mod mangadex;
pub mod mangafire;
pub mod mangasee123;
pub mod mangakakalot;
pub mod registry;
pub mod tcbscans;
pub mod toongod;

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
    fn meta(&self) -> SourceMeta;
    async fn search(&self, query: &str, page: u32) -> Result<Vec<SearchResult>>;
    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>>;
    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>>;
}
