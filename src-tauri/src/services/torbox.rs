#![allow(dead_code)]
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::sync::RwLock;

use crate::error::{Result, ShioriError};

const TORBOX_API_BASE: &str = "https://api.torbox.app/v1/api";

fn extract_error_message(payload: &serde_json::Value) -> Option<String> {
    payload
        .get("detail")
        .and_then(|v| v.as_str())
        .or_else(|| payload.get("error").and_then(|v| v.as_str()))
        .or_else(|| payload.get("message").and_then(|v| v.as_str()))
        .map(ToString::to_string)
}

fn summarize_response_body(raw_body: &str) -> String {
    let trimmed = raw_body.trim();
    if trimmed.is_empty() {
        return "empty response body".to_string();
    }

    const MAX_LEN: usize = 180;
    if trimmed.len() <= MAX_LEN {
        return trimmed.to_string();
    }

    format!("{}...", &trimmed[..MAX_LEN])
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorboxConfig {
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentInfo {
    pub id: i64,
    pub name: String,
    pub size: i64,
    pub progress: f64,
    pub download_speed: i64,
    pub status: String,
    pub files: Option<Vec<TorrentFile>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentFile {
    pub id: i64,
    pub name: String,
    pub size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TorboxResponse<T> {
    success: bool,
    data: Option<T>,
    detail: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CreateTorrentData {
    torrent_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DownloadLinkData {
    link: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TorrentListData {
    torrents: Option<Vec<TorrentInfo>>,
}

pub struct TorboxService {
    client: reqwest::Client,
    api_key: RwLock<Option<String>>,
}

impl TorboxService {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .connect_timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create Torbox client: {}", e)))?;
        
        Ok(Self {
            client,
            api_key: RwLock::new(None),
        })
    }

    pub async fn set_api_key(&self, key: Option<String>) {
        let mut guard = self.api_key.write().await;
        *guard = key;
    }

    pub async fn get_api_key(&self) -> Option<String> {
        self.api_key.read().await.clone()
    }

    pub async fn load_api_key_from_store(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        use tauri_plugin_store::StoreExt;

        let store = app_handle
            .store("sources.json")
            .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;
        
        let value = store
            .get("torbox.api_key")
            .and_then(|v| v.as_str().map(ToString::to_string));
        
        self.set_api_key(value).await;
        Ok(())
    }

    pub async fn save_api_key_to_store(&self, app_handle: &tauri::AppHandle, key: Option<String>) -> Result<()> {
        use tauri_plugin_store::StoreExt;

        let store = app_handle
            .store("sources.json")
            .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;
        
        if let Some(k) = &key {
            store.set("torbox.api_key", serde_json::json!(k));
        } else {
            store.delete("torbox.api_key");
        }
        
        store.save().map_err(|e| ShioriError::Other(format!("Failed to save store: {}", e)))?;
        self.set_api_key(key).await;
        Ok(())
    }

    pub async fn verify_api_key(&self, candidate_key: &str) -> Result<()> {
        let key = candidate_key.trim();
        if key.is_empty() {
            return Err(ShioriError::Validation(
                "Torbox API key cannot be empty".to_string(),
            ));
        }

        let response = self
            .client
            .get(format!("{}/torrents/mylist?bypassCache=true", TORBOX_API_BASE))
            .header("Authorization", self.get_auth_header(key))
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Torbox key verification failed: {}", e)))?;

        let status = response.status();
        let raw_body = response
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("Torbox key verification parse failed: {}", e)))?;

        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(ShioriError::Other(
                "Torbox rejected this API key (401/403).".to_string(),
            ));
        }

        let parsed = serde_json::from_str::<serde_json::Value>(&raw_body).ok();

        if !status.is_success() {
            let detail = parsed
                .as_ref()
                .and_then(extract_error_message)
                .unwrap_or_else(|| summarize_response_body(&raw_body));
            return Err(ShioriError::Other(format!(
                "Torbox verification failed (status {}): {}",
                status, detail
            )));
        }

        if let Some(payload) = parsed {
            let success = payload.get("success").and_then(|v| v.as_bool());
            if success == Some(false) {
                let detail = extract_error_message(&payload)
                    .unwrap_or_else(|| "Unknown verification error".to_string());
                return Err(ShioriError::Other(format!(
                    "Torbox verification failed: {}",
                    detail
                )));
            }
        }

        Ok(())
    }

    fn get_auth_header(&self, key: &str) -> String {
        format!("Bearer {}", key)
    }

    /// Add a magnet URI or torrent URL to Torbox.
    pub async fn add_download_target(&self, source_link: &str) -> Result<i64> {
        let api_key = self.api_key.read().await.clone()
            .ok_or_else(|| ShioriError::Other("Torbox API key not configured. Set it in Settings → Online Sources.".to_string()))?;

        let normalized = source_link.trim();
        if normalized.is_empty() {
            return Err(ShioriError::Validation("Torbox source link cannot be empty".to_string()));
        }

        let mut form = reqwest::multipart::Form::new();
        if normalized.starts_with("magnet:") {
            form = form.text("magnet", normalized.to_string());
        } else if normalized.starts_with("http://") || normalized.starts_with("https://") {
            let torrent_resp = self
                .client
                .get(normalized)
                .send()
                .await
                .map_err(|e| ShioriError::Other(format!("Failed to fetch torrent URL: {}", e)))?;

            let status = torrent_resp.status();
            if !status.is_success() {
                return Err(ShioriError::Other(format!(
                    "Torrent URL returned non-success status: {}",
                    status
                )));
            }

            let torrent_bytes = torrent_resp
                .bytes()
                .await
                .map_err(|e| ShioriError::Other(format!("Failed to read torrent file bytes: {}", e)))?;

            if torrent_bytes.is_empty() {
                return Err(ShioriError::Other(
                    "Torrent URL returned an empty file".to_string(),
                ));
            }

            let file_name = reqwest::Url::parse(normalized)
                .ok()
                .and_then(|url| {
                    url.path_segments()
                        .and_then(|mut segs| segs.next_back().map(ToString::to_string))
                })
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| "download.torrent".to_string());

            let file_part = reqwest::multipart::Part::bytes(torrent_bytes.to_vec())
                .file_name(file_name)
                .mime_str("application/x-bittorrent")
                .map_err(|e| {
                    ShioriError::Other(format!("Failed to build torrent upload part: {}", e))
                })?;

            form = form.part("file", file_part);
        } else {
            return Err(ShioriError::Validation(
                "Torbox source link must be a magnet URI or torrent URL".to_string(),
            ));
        }

        let resp = self.client
            .post(format!("{}/torrents/createtorrent", TORBOX_API_BASE))
            .header("Authorization", self.get_auth_header(&api_key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Torbox add target failed: {}", e)))?;

        let status = resp.status();
        let raw_body = resp
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("Torbox add target parse failed: {}", e)))?;

        let body = serde_json::from_str::<TorboxResponse<CreateTorrentData>>(&raw_body)
            .map_err(|e| ShioriError::Other(format!("Torbox add target response parse failed: {}", e)))?;

        if !status.is_success() || !body.success {
            let msg = body
                .detail
                .or(body.error)
                .unwrap_or_else(|| summarize_response_body(&raw_body));
            return Err(ShioriError::Other(format!("Torbox error: {}", msg)));
        }

        body.data
            .map(|d| d.torrent_id)
            .ok_or_else(|| ShioriError::Other("Torbox response missing torrent_id".to_string()))
    }

    /// Backwards-compatible alias.
    pub async fn add_magnet(&self, magnet: &str) -> Result<i64> {
        self.add_download_target(magnet).await
    }

    /// Get the status of a torrent
    pub async fn get_torrent_status(&self, torrent_id: i64) -> Result<TorrentInfo> {
        let api_key = self.api_key.read().await.clone()
            .ok_or_else(|| ShioriError::Other("Torbox API key not configured".to_string()))?;

        let resp = self.client
            .get(format!("{}/torrents/mylist?id={}&bypassCache=true", TORBOX_API_BASE, torrent_id))
            .header("Authorization", self.get_auth_header(&api_key))
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Torbox status check failed: {}", e)))?;

        let body: TorboxResponse<TorrentListData> = resp.json().await
            .map_err(|e| ShioriError::Other(format!("Torbox response parse failed: {}", e)))?;

        if !body.success {
            let msg = body.detail.or(body.error).unwrap_or_else(|| "Unknown error".to_string());
            return Err(ShioriError::Other(format!("Torbox error: {}", msg)));
        }

        body.data
            .and_then(|d| d.torrents)
            .and_then(|t| t.into_iter().next())
            .ok_or_else(|| ShioriError::Other("Torrent not found".to_string()))
    }

    /// Get download link for a completed torrent file
    pub async fn get_download_link(&self, torrent_id: i64, file_id: Option<i64>) -> Result<String> {
        let api_key = self.api_key.read().await.clone()
            .ok_or_else(|| ShioriError::Other("Torbox API key not configured".to_string()))?;

        let mut url = format!(
            "{}/torrents/requestdl?token={}&torrent_id={}",
            TORBOX_API_BASE,
            urlencoding::encode(&api_key),
            torrent_id
        );

        if let Some(fid) = file_id {
            url.push_str(&format!("&file_id={}", fid));
        } else {
            url.push_str("&zip_link=true");
        }

        let resp = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Torbox download link request failed: {}", e)))?;

        let body: TorboxResponse<DownloadLinkData> = resp.json().await
            .map_err(|e| ShioriError::Other(format!("Torbox response parse failed: {}", e)))?;

        if !body.success {
            let msg = body.detail.or(body.error).unwrap_or_else(|| "Unknown error".to_string());
            return Err(ShioriError::Other(format!("Torbox error: {}", msg)));
        }

        body.data
            .map(|d| d.link)
            .ok_or_else(|| ShioriError::Other("Torbox response missing download link".to_string()))
    }

    /// Poll for torrent completion and return download link
    pub async fn wait_for_completion(&self, torrent_id: i64, max_wait_secs: u64) -> Result<TorrentInfo> {
        let start = std::time::Instant::now();
        let max_duration = Duration::from_secs(max_wait_secs);

        loop {
            let info = self.get_torrent_status(torrent_id).await?;
            
            // Check various completion states
            let status_lower = info.status.to_lowercase();
            if status_lower.contains("completed") || 
               status_lower.contains("cached") || 
               status_lower.contains("seeding") ||
               info.progress >= 1.0 {
                return Ok(info);
            }

            if start.elapsed() > max_duration {
                return Err(ShioriError::Other(format!(
                    "Torbox download timed out after {} seconds. Current progress: {:.1}%",
                    max_wait_secs,
                    info.progress * 100.0
                )));
            }

            // Wait 3 seconds between checks
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    }

    /// Download a file from URL to local path
    pub async fn download_file(&self, url: &str, dest_path: &std::path::Path) -> Result<()> {
        let resp = self.client
            .get(url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Download request failed: {}", e)))?;

        if !resp.status().is_success() {
            return Err(ShioriError::Other(format!("Download failed with status: {}", resp.status())));
        }

        let bytes = resp.bytes().await
            .map_err(|e| ShioriError::Other(format!("Failed to read download bytes: {}", e)))?;

        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| ShioriError::Other(format!("Failed to create download directory: {}", e)))?;
        }

        std::fs::write(dest_path, &bytes)
            .map_err(|e| ShioriError::Other(format!("Failed to write downloaded file: {}", e)))?;

        Ok(())
    }
}
