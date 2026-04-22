#![allow(dead_code)]
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
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

fn value_to_i64(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_u64().and_then(|v| i64::try_from(v).ok()))
        .or_else(|| value.as_f64().map(|v| v.round() as i64))
        .or_else(|| value.as_str().and_then(|s| s.parse::<i64>().ok()))
}

fn value_to_f64(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_i64().map(|v| v as f64))
        .or_else(|| value.as_u64().map(|v| v as f64))
        .or_else(|| value.as_str().and_then(|s| s.parse::<f64>().ok()))
}

fn normalize_progress(progress: f64) -> f64 {
    if progress > 1.0 {
        (progress / 100.0).clamp(0.0, 1.0)
    } else {
        progress.clamp(0.0, 1.0)
    }
}

fn is_torrent_style_link(link: &str) -> bool {
    let normalized = link.trim().to_ascii_lowercase();
    normalized.starts_with("magnet:")
        || normalized.contains(".torrent")
        || normalized.contains("/torrent")
}

fn parse_torrent_file(value: &Value) -> Option<TorrentFile> {
    let id = value
        .get("id")
        .or_else(|| value.get("file_id"))
        .and_then(value_to_i64)?;
    let name = value.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let size = value
        .get("size")
        .or_else(|| value.get("file_size"))
        .and_then(value_to_i64)
        .unwrap_or_default();

    Some(TorrentFile { id, name, size })
}

fn parse_torrent_info(value: &Value) -> Option<TorrentInfo> {
    let id = value
        .get("id")
        .or_else(|| value.get("torrent_id"))
        .or_else(|| value.get("web_id"))
        .and_then(value_to_i64)?;
    let name = value
        .get("name")
        .or_else(|| value.get("title"))
        .or_else(|| value.get("file_name"))
        .or_else(|| value.get("url"))
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let size = value
        .get("size")
        .or_else(|| value.get("total_size"))
        .or_else(|| value.get("bytes"))
        .and_then(value_to_i64)
        .unwrap_or_default();
    let progress = value
        .get("progress")
        .or_else(|| value.get("download_progress"))
        .or_else(|| value.get("percent_done"))
        .and_then(value_to_f64)
        .map(normalize_progress)
        .unwrap_or_default();
    let download_speed = value
        .get("download_speed")
        .or_else(|| value.get("speed"))
        .or_else(|| value.get("download_rate"))
        .and_then(value_to_i64)
        .unwrap_or_default();
    let status = value
        .get("download_state")
        .and_then(|v| v.as_str())
        .or_else(|| value.get("status").and_then(|v| v.as_str()))
        .or_else(|| value.get("state").and_then(|v| v.as_str()))
        .unwrap_or("unknown")
        .to_string();

    let files = value.get("files").and_then(|v| v.as_array()).map(|items| {
        items
            .iter()
            .filter_map(parse_torrent_file)
            .collect::<Vec<TorrentFile>>()
    });

    Some(TorrentInfo {
        id,
        name,
        size,
        progress,
        download_speed,
        status,
        files,
    })
}

fn extract_torrent_entry(payload: &Value, torrent_id: i64) -> Option<Value> {
    let data = payload.get("data")?;

    if let Some(list) = data.as_array() {
        let matched = list.iter().find(|item| {
            item.get("id")
                .and_then(value_to_i64)
                .map(|id| id == torrent_id)
                .unwrap_or(false)
        });

        return matched.cloned().or_else(|| list.first().cloned());
    }

    if let Some(obj) = data.as_object() {
        if let Some(torrents) = obj.get("torrents").and_then(|v| v.as_array()) {
            let matched = torrents.iter().find(|item| {
                item.get("id")
                    .and_then(value_to_i64)
                    .map(|id| id == torrent_id)
                    .unwrap_or(false)
            });

            return matched.cloned().or_else(|| torrents.first().cloned());
        }

        if obj.get("id").and_then(value_to_i64).is_some() {
            return Some(data.clone());
        }
    }

    None
}

fn extract_webdl_entry(payload: &Value, web_id: i64) -> Option<Value> {
    let data = payload.get("data")?;

    if let Some(list) = data.as_array() {
        let matched = list.iter().find(|item| {
            item.get("id")
                .or_else(|| item.get("web_id"))
                .and_then(value_to_i64)
                .map(|id| id == web_id)
                .unwrap_or(false)
        });

        return matched.cloned().or_else(|| list.first().cloned());
    }

    if let Some(obj) = data.as_object() {
        if let Some(items) = obj.get("web_downloads").and_then(|v| v.as_array()) {
            let matched = items.iter().find(|item| {
                item.get("id")
                    .or_else(|| item.get("web_id"))
                    .and_then(value_to_i64)
                    .map(|id| id == web_id)
                    .unwrap_or(false)
            });

            return matched.cloned().or_else(|| items.first().cloned());
        }

        if obj.get("id").or_else(|| obj.get("web_id")).and_then(value_to_i64).is_some() {
            return Some(data.clone());
        }
    }

    None
}

fn extract_created_target_id(payload: &Value) -> Option<i64> {
    payload
        .get("data")
        .and_then(|data| {
            data.get("torrent_id")
                .or_else(|| data.get("id"))
                .or_else(|| data.get("web_id"))
                .or_else(|| data.get("download_id"))
                .and_then(value_to_i64)
                .or_else(|| {
                    data.as_array().and_then(|items| {
                        items.iter().find_map(|item| {
                            item.get("torrent_id")
                                .or_else(|| item.get("id"))
                                .or_else(|| item.get("web_id"))
                                .or_else(|| item.get("download_id"))
                                .and_then(value_to_i64)
                        })
                    })
                })
                .or_else(|| value_to_i64(data))
        })
        .or_else(|| {
            payload
                .get("torrent_id")
                .or_else(|| payload.get("id"))
                .or_else(|| payload.get("web_id"))
                .and_then(value_to_i64)
        })
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

#[derive(Debug)]
enum TargetOpError {
    NotFound,
    Other(ShioriError),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DownloadTargetKind {
    Torrent,
    WebDownload,
}

pub struct TorboxService {
    client: reqwest::Client,
    api_key: RwLock<Option<String>>,
    target_kinds: RwLock<HashMap<i64, DownloadTargetKind>>,
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
            target_kinds: RwLock::new(HashMap::new()),
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

    fn resolve_redirect_url(current_url: &str, location: &str) -> Result<String> {
        if location.trim().is_empty() {
            return Err(ShioriError::Other(
                "Torrent URL redirected without a Location header".to_string(),
            ));
        }

        if location.starts_with("magnet:") {
            return Ok(location.to_string());
        }

        let current = reqwest::Url::parse(current_url).map_err(|e| {
            ShioriError::Other(format!("Failed to parse torrent redirect source URL: {}", e))
        })?;

        current
            .join(location)
            .map(|url| url.to_string())
            .map_err(|e| ShioriError::Other(format!("Failed to resolve torrent redirect URL: {}", e)))
    }

    async fn resolve_torrent_input(
        &self,
        initial_link: &str,
    ) -> Result<(Option<String>, Option<(Vec<u8>, String)>)> {
        if initial_link.starts_with("magnet:") {
            return Ok((Some(initial_link.to_string()), None));
        }

        let mut current_url = initial_link.to_string();

        for _ in 0..5 {
            let torrent_resp = self
                .client
                .get(&current_url)
                .send()
                .await
                .map_err(|e| ShioriError::Other(format!("Failed to fetch torrent URL: {}", e)))?;

            let status = torrent_resp.status();

            if status.is_redirection() {
                let location = torrent_resp
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|v| v.to_str().ok())
                    .map(ToString::to_string)
                    .ok_or_else(|| {
                        ShioriError::Other(format!(
                            "Torrent URL returned redirect status without location: {}",
                            status
                        ))
                    })?;

                current_url = Self::resolve_redirect_url(&current_url, &location)?;
                if current_url.starts_with("magnet:") {
                    return Ok((Some(current_url), None));
                }
                continue;
            }

            if !status.is_success() {
                return Err(ShioriError::Other(format!(
                    "Torrent URL returned non-success status: {}",
                    status
                )));
            }

            let content_type = torrent_resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|v| v.to_ascii_lowercase())
                .unwrap_or_default();

            let content_disposition = torrent_resp
                .headers()
                .get(reqwest::header::CONTENT_DISPOSITION)
                .and_then(|v| v.to_str().ok())
                .map(ToString::to_string);

            let torrent_bytes = torrent_resp
                .bytes()
                .await
                .map_err(|e| ShioriError::Other(format!("Failed to read torrent file bytes: {}", e)))?;

            if torrent_bytes.is_empty() {
                return Err(ShioriError::Other(
                    "Torrent URL returned an empty file".to_string(),
                ));
            }

            let looks_like_html = content_type.contains("text/html")
                || torrent_bytes.starts_with(b"<")
                || torrent_bytes
                    .windows(5)
                    .any(|chunk| chunk.eq_ignore_ascii_case(b"<html"));
            if looks_like_html {
                let hint = if current_url.contains("annas-archive") || current_url.contains("/md5/") {
                    " The source returned an HTML page instead of a torrent file. For Anna's Archive, verify auth cookie/key in Settings."
                } else {
                    " The source returned an HTML page instead of a torrent file."
                };
                return Err(ShioriError::Other(format!(
                    "Torrent URL is not a direct .torrent file.{}",
                    hint
                )));
            }

            let file_name = content_disposition
                .as_deref()
                .and_then(|value| {
                    value
                        .split(';')
                        .find_map(|part| part.trim().strip_prefix("filename="))
                        .map(|name| name.trim_matches('"').to_string())
                })
                .or_else(|| {
                    reqwest::Url::parse(&current_url)
                        .ok()
                        .and_then(|url| {
                            url.path_segments()
                                .and_then(|mut segs| segs.next_back().map(ToString::to_string))
                        })
                        .filter(|name| !name.trim().is_empty())
                })
                .unwrap_or_else(|| "download.torrent".to_string());

            return Ok((None, Some((torrent_bytes.to_vec(), file_name))));
        }

        Err(ShioriError::Other(
            "Torrent URL redirected too many times before resolving a torrent file".to_string(),
        ))
    }

    async fn remember_target_kind(&self, id: i64, kind: DownloadTargetKind) {
        let mut guard = self.target_kinds.write().await;
        guard.insert(id, kind);
    }

    async fn get_target_kind(&self, id: i64) -> Option<DownloadTargetKind> {
        self.target_kinds.read().await.get(&id).copied()
    }

    async fn add_torrent_target(&self, api_key: &str, source_link: &str) -> Result<i64> {
        let mut form = reqwest::multipart::Form::new();
        if source_link.starts_with("magnet:") {
            form = form.text("magnet", source_link.to_string());
        } else if source_link.starts_with("http://") || source_link.starts_with("https://") {
            if !is_torrent_style_link(source_link) {
                return Err(ShioriError::Validation(
                    "Torrent target must be a magnet URI or torrent URL".to_string(),
                ));
            }

            let (resolved_magnet, resolved_torrent) = self.resolve_torrent_input(source_link).await?;

            if let Some(magnet) = resolved_magnet {
                form = form.text("magnet", magnet);
            } else {
                let (torrent_bytes, file_name) = resolved_torrent.ok_or_else(|| {
                    ShioriError::Other("Torrent URL did not resolve to a magnet or torrent file".to_string())
                })?;

                let file_part = reqwest::multipart::Part::bytes(torrent_bytes)
                .file_name(file_name)
                .mime_str("application/x-bittorrent")
                .map_err(|e| {
                    ShioriError::Other(format!("Failed to build torrent upload part: {}", e))
                })?;

                form = form.part("file", file_part);
            }
        } else {
            return Err(ShioriError::Validation(
                "Torrent target must be a magnet URI or torrent URL".to_string(),
            ));
        }

        let resp = self
            .client
            .post(format!("{}/torrents/createtorrent", TORBOX_API_BASE))
            .header("Authorization", self.get_auth_header(api_key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Torbox add target failed: {}", e)))?;

        let status = resp.status();
        let raw_body = resp
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("Torbox add target parse failed: {}", e)))?;

        let payload: Value = serde_json::from_str(&raw_body)
            .map_err(|e| ShioriError::Other(format!("Torbox add target response JSON parse failed: {}", e)))?;

        let success = payload
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(status.is_success());

        if !status.is_success() || !success {
            let msg = extract_error_message(&payload)
                .unwrap_or_else(|| summarize_response_body(&raw_body));
            return Err(ShioriError::Other(format!("Torbox error: {}", msg)));
        }

        let id = extract_created_target_id(&payload).ok_or_else(|| {
            ShioriError::Other(format!(
                "Torbox response missing created target id: {}",
                summarize_response_body(&raw_body)
            ))
        })?;

        self.remember_target_kind(id, DownloadTargetKind::Torrent).await;
        Ok(id)
    }

    async fn add_web_download_target(&self, api_key: &str, source_link: &str) -> Result<i64> {
        if !source_link.starts_with("http://") && !source_link.starts_with("https://") {
            return Err(ShioriError::Validation(
                "Web download target must be an HTTP/HTTPS URL".to_string(),
            ));
        }

        let form = reqwest::multipart::Form::new().text("link", source_link.to_string());

        let resp = self
            .client
            .post(format!("{}/webdl/createwebdownload", TORBOX_API_BASE))
            .header("Authorization", self.get_auth_header(api_key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Torbox web download creation failed: {}", e)))?;

        let status = resp.status();
        let raw_body = resp
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("Torbox web download parse failed: {}", e)))?;

        let payload: Value = serde_json::from_str(&raw_body).map_err(|e| {
            ShioriError::Other(format!("Torbox web download response JSON parse failed: {}", e))
        })?;

        let success = payload
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(status.is_success());
        if !status.is_success() || !success {
            let detail = extract_error_message(&payload).unwrap_or_else(|| summarize_response_body(&raw_body));
            return Err(ShioriError::Other(format!("Torbox error: {}", detail)));
        }

        let id = payload
            .get("data")
            .and_then(|data| {
                data.get("web_id")
                    .or_else(|| data.get("id"))
                    .or_else(|| data.get("webdownload_id"))
                    .or_else(|| data.get("download_id"))
                    .and_then(value_to_i64)
                    .or_else(|| value_to_i64(data))
            })
            .ok_or_else(|| {
                ShioriError::Other(format!(
                    "Torbox web download response missing id: {}",
                    summarize_response_body(&raw_body)
                ))
            })?;

        self.remember_target_kind(id, DownloadTargetKind::WebDownload)
            .await;
        Ok(id)
    }

    /// Add a source link to Torbox.
    ///
    /// - magnet links -> torrent flow
    /// - any HTTP/HTTPS link -> web download flow
    pub async fn add_download_target(&self, source_link: &str) -> Result<i64> {
        let api_key = self
            .api_key
            .read()
            .await
            .clone()
            .ok_or_else(|| {
                ShioriError::Other(
                    "Torbox API key not configured. Set it in Settings → Online Sources.".to_string(),
                )
            })?;

        let normalized = source_link.trim();
        if normalized.is_empty() {
            return Err(ShioriError::Validation("Torbox source link cannot be empty".to_string()));
        }

        if normalized.starts_with("magnet:") {
            return self.add_torrent_target(&api_key, normalized).await;
        }

        if normalized.starts_with("http://") || normalized.starts_with("https://") {
            return self.add_web_download_target(&api_key, normalized).await;
        }

        Err(ShioriError::Validation(
            "Torbox source link must be a magnet URI or HTTP/HTTPS URL".to_string(),
        ))
    }

    /// Backwards-compatible alias.
    pub async fn add_magnet(&self, magnet: &str) -> Result<i64> {
        self.add_download_target(magnet).await
    }

    /// Get status for a Torbox target (torrent or web download).
    pub async fn get_torrent_status(&self, torrent_id: i64) -> Result<TorrentInfo> {
        self
            .get_target_status_raw(torrent_id)
            .await
            .map_err(|err| match err {
                TargetOpError::NotFound => ShioriError::Other("Target not found on Torbox".to_string()),
                TargetOpError::Other(inner) => inner,
            })
    }

    async fn get_status_by_kind(
        &self,
        target_id: i64,
        kind: DownloadTargetKind,
    ) -> std::result::Result<TorrentInfo, TargetOpError> {
        let api_key = self
            .api_key
            .read()
            .await
            .clone()
            .ok_or_else(|| TargetOpError::Other(ShioriError::Other("Torbox API key not configured".to_string())))?;

        let endpoint = match kind {
            DownloadTargetKind::Torrent => {
                format!("{}/torrents/mylist?id={}&bypass_cache=true", TORBOX_API_BASE, target_id)
            }
            DownloadTargetKind::WebDownload => {
                format!("{}/webdl/mylist?id={}&bypass_cache=true", TORBOX_API_BASE, target_id)
            }
        };

        let resp = self
            .client
            .get(endpoint)
            .header("Authorization", self.get_auth_header(&api_key))
            .send()
            .await
            .map_err(|e| TargetOpError::Other(ShioriError::Other(format!("Torbox status check failed: {}", e))))?;

        let status = resp.status();
        let raw_body = resp
            .text()
            .await
            .map_err(|e| TargetOpError::Other(ShioriError::Other(format!("Torbox response parse failed: {}", e))))?;

        let payload: Value = serde_json::from_str(&raw_body)
            .map_err(|e| TargetOpError::Other(ShioriError::Other(format!("Torbox response JSON parse failed: {}", e))))?;

        let success = payload.get("success").and_then(|v| v.as_bool()).unwrap_or(status.is_success());
        if !success {
            let detail = extract_error_message(&payload).unwrap_or_else(|| summarize_response_body(&raw_body));
            if detail.to_ascii_lowercase().contains("not found") {
                return Err(TargetOpError::NotFound);
            }
            return Err(TargetOpError::Other(ShioriError::Other(format!("Torbox error: {}", detail))));
        }

        let entry = match kind {
            DownloadTargetKind::Torrent => extract_torrent_entry(&payload, target_id),
            DownloadTargetKind::WebDownload => extract_webdl_entry(&payload, target_id),
        }
        .ok_or(TargetOpError::NotFound)?;

        parse_torrent_info(&entry).ok_or_else(|| {
            TargetOpError::Other(ShioriError::Other(format!(
                "Torbox status parse failed: {}",
                summarize_response_body(&raw_body)
            )))
        })
    }

    async fn get_target_status_raw(&self, target_id: i64) -> std::result::Result<TorrentInfo, TargetOpError> {
        if let Some(kind) = self.get_target_kind(target_id).await {
            return self.get_status_by_kind(target_id, kind).await;
        }

        match self
            .get_status_by_kind(target_id, DownloadTargetKind::Torrent)
            .await
        {
            Ok(info) => {
                self.remember_target_kind(target_id, DownloadTargetKind::Torrent)
                    .await;
                Ok(info)
            }
            Err(TargetOpError::NotFound) => {
                let web = self
                    .get_status_by_kind(target_id, DownloadTargetKind::WebDownload)
                    .await;
                if web.is_ok() {
                    self.remember_target_kind(target_id, DownloadTargetKind::WebDownload)
                        .await;
                }
                web
            }
            Err(err) => Err(err),
        }
    }

    async fn get_download_link_by_kind(
        &self,
        target_id: i64,
        file_id: Option<i64>,
        kind: DownloadTargetKind,
    ) -> Result<String> {
        let api_key = self
            .api_key
            .read()
            .await
            .clone()
            .ok_or_else(|| ShioriError::Other("Torbox API key not configured".to_string()))?;

        let mut url = match kind {
            DownloadTargetKind::Torrent => format!(
                "{}/torrents/requestdl?token={}&torrent_id={}",
                TORBOX_API_BASE,
                urlencoding::encode(&api_key),
                target_id
            ),
            DownloadTargetKind::WebDownload => format!(
                "{}/webdl/requestdl?token={}&web_id={}",
                TORBOX_API_BASE,
                urlencoding::encode(&api_key),
                target_id
            ),
        };

        if let Some(fid) = file_id {
            url.push_str(&format!("&file_id={}", fid));
        } else {
            url.push_str("&zip_link=true");
        }

        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| ShioriError::Other(format!("Torbox download link request failed: {}", e)))?;

        let status = resp.status();
        let raw_body = resp
            .text()
            .await
            .map_err(|e| ShioriError::Other(format!("Torbox response parse failed: {}", e)))?;

        let payload: Value = serde_json::from_str(&raw_body)
            .map_err(|e| ShioriError::Other(format!("Torbox response JSON parse failed: {}", e)))?;

        let success = payload
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(status.is_success());
        if !success {
            let msg = extract_error_message(&payload)
                .unwrap_or_else(|| summarize_response_body(&raw_body));
            return Err(ShioriError::Other(format!("Torbox error: {}", msg)));
        }

        payload
            .get("data")
            .and_then(|d| {
                d.get("link")
                    .or_else(|| d.get("url"))
                    .or_else(|| d.get("download_url"))
                    .and_then(|v| v.as_str())
                    .map(ToString::to_string)
                    .or_else(|| d.as_str().map(ToString::to_string))
            })
            .or_else(|| {
                payload
                    .get("link")
                    .or_else(|| payload.get("url"))
                    .and_then(|v| v.as_str())
                    .map(ToString::to_string)
            })
            .ok_or_else(|| {
                ShioriError::Other(format!(
                    "Torbox response missing download link: {}",
                    summarize_response_body(&raw_body)
                ))
            })
    }

    /// Get download link for a completed target (torrent/web download).
    pub async fn get_download_link(&self, torrent_id: i64, file_id: Option<i64>) -> Result<String> {
        if let Some(kind) = self.get_target_kind(torrent_id).await {
            return self.get_download_link_by_kind(torrent_id, file_id, kind).await;
        }

        match self
            .get_download_link_by_kind(torrent_id, file_id, DownloadTargetKind::Torrent)
            .await
        {
            Ok(link) => {
                self.remember_target_kind(torrent_id, DownloadTargetKind::Torrent)
                    .await;
                Ok(link)
            }
            Err(primary_err) => {
                match self
                    .get_download_link_by_kind(torrent_id, file_id, DownloadTargetKind::WebDownload)
                    .await
                {
                    Ok(link) => {
                        self.remember_target_kind(torrent_id, DownloadTargetKind::WebDownload)
                            .await;
                        Ok(link)
                    }
                    Err(_) => Err(primary_err),
                }
            }
        }
    }

    /// Poll for target completion.
    pub async fn wait_for_completion(&self, torrent_id: i64, max_wait_secs: u64) -> Result<TorrentInfo> {
        let start = std::time::Instant::now();
        let max_duration = Duration::from_secs(max_wait_secs);
        let mut not_found_retries: u8 = 0;

        loop {
            let info = match self.get_target_status_raw(torrent_id).await {
                Ok(info) => {
                    not_found_retries = 0;
                    info
                }
                Err(TargetOpError::NotFound) => {
                    not_found_retries = not_found_retries.saturating_add(1);
                    if not_found_retries <= 5 {
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        continue;
                    }
                    return Err(ShioriError::Other(
                        "Target not found on Torbox after retries".to_string(),
                    ));
                }
                Err(TargetOpError::Other(err)) => return Err(err),
            };
            
            // Check various completion states
            let status_lower = info.status.to_lowercase();
            if status_lower.contains("completed") || 
               status_lower.contains("cached") || 
               status_lower.contains("finished") ||
               status_lower.contains("done") ||
               status_lower.contains("ready") ||
               status_lower.contains("downloaded") ||
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
