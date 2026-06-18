use std::collections::HashMap;
use std::time::Duration;

use async_trait::async_trait;
use serde::Deserialize;

use crate::error::{Result, ShioriError};
use crate::sources::{
    Chapter, ContentType, Page, SearchResponse, SearchResult, Source, SourceMeta,
    SourceSearchDiagnostics,
};

const TORRENTS_CSV_URL: &str = "https://torrents-csv.com/service/search";
const USER_AGENT: &str = "Shiori/1.0 (Torbox integration)";

#[derive(Debug, Deserialize)]
struct TorrentsCsvResponse {
    torrents: Vec<TorrentsCsvTorrent>,
}

#[derive(Debug, Deserialize)]
struct TorrentsCsvTorrent {
    infohash: String,
    name: String,
    size_bytes: Option<u64>,
    seeders: Option<u32>,
}

pub struct TorrentCsvSource {
    client: reqwest::Client,
}

impl TorrentCsvSource {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| {
                ShioriError::Other(format!("Failed to create TorrentsCsv client: {}", e))
            })?;

        Ok(Self { client })
    }

    async fn search_internal(&self, query: &str, limit: u32) -> Result<SearchResponse> {
        let start_time = std::time::Instant::now();
        let url = format!(
            "{}?q={}&size={}",
            TORRENTS_CSV_URL,
            urlencoding::encode(query),
            limit
        );

        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("TorrentsCsv request failed: {}", e)))?;

        if !resp.status().is_success() {
            return Err(ShioriError::Other(format!(
                "TorrentsCsv returned status {}",
                resp.status()
            )));
        }

        let body: TorrentsCsvResponse = resp.json().await.map_err(|e| {
            ShioriError::Other(format!("Failed to parse TorrentsCsv response: {}", e))
        })?;

        let mut items = Vec::new();
        for t in body.torrents {
            let mut extra = HashMap::new();
            extra.insert(
                "magnet".to_string(),
                format!(
                    "magnet:?xt=urn:btih:{}&dn={}",
                    t.infohash,
                    urlencoding::encode(&t.name)
                ),
            );
            if let Some(size) = t.size_bytes {
                extra.insert("sizeBytes".to_string(), size.to_string());
            }
            if let Some(seeders) = t.seeders {
                extra.insert("seeders".to_string(), seeders.to_string());
            }

            items.push(SearchResult {
                id: t.infohash.clone(),
                title: t.name,
                cover_url: None,
                description: None,
                source_id: "torrents-csv".to_string(),
                extra,
            });
        }

        let duration_ms = start_time.elapsed().as_millis() as u64;

        Ok(SearchResponse {
            items: items.clone(),
            total: None,
            offset: None,
            limit: Some(limit),
            diagnostics: Some(SourceSearchDiagnostics {
                source_id: "torrents-csv".to_string(),
                source_name: Some("Torrents CSV".to_string()),
                selected_mirror: Some(TORRENTS_CSV_URL.to_string()),
                selected_base: Some(TORRENTS_CSV_URL.to_string()),
                attempted_mirrors: vec![],
                duration_ms,
                result_count: items.len() as u32,
                retries_used: Some(0),
            }),
        })
    }
}

#[async_trait]
impl Source for TorrentCsvSource {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn meta(&self) -> SourceMeta {
        SourceMeta {
            id: "torrents-csv".to_string(),
            name: "Torrents CSV".to_string(),
            base_url: TORRENTS_CSV_URL.to_string(),
            version: "1.0.0".to_string(),
            content_type: ContentType::Book, // Technically all types, but added for books
            supports_search: true,
            supports_download: true,
            requires_api_key: false,
            nsfw: false,
        }
    }

    async fn search(&self, query: &str, _page: u32) -> Result<Vec<SearchResult>> {
        Ok(self.search_internal(query, 20).await?.items)
    }

    async fn search_with_meta(
        &self,
        query: &str,
        _page: u32,
        limit: u32,
    ) -> Result<SearchResponse> {
        self.search_internal(query, limit).await
    }

    async fn get_chapters(&self, content_id: &str) -> Result<Vec<Chapter>> {
        Ok(vec![Chapter {
            id: content_id.to_string(),
            title: "Download Links".to_string(),
            number: 1.0,
            volume: None,
            uploaded_at: None,
            source_id: "torrents-csv".to_string(),
            content_id: content_id.to_string(),
        }])
    }

    async fn get_pages(&self, chapter_id: &str) -> Result<Vec<Page>> {
        // chapter_id is infohash
        Ok(vec![Page {
            index: 0,
            url: format!("magnet|magnet:?xt=urn:btih:{}", chapter_id),
        }])
    }
}
