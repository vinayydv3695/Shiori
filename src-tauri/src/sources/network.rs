use serde::{Deserialize, Serialize};
use tauri_plugin_store::StoreExt;

use crate::error::{Result, ShioriError};

const DEFAULT_TIMEOUT_SECONDS: u64 = 30;
const DEFAULT_MAX_RETRIES: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentNetworkConfig {
    pub proxy_url: Option<String>,
    pub timeout_seconds: u64,
    pub max_retries: u32,
}

impl Default for TorrentNetworkConfig {
    fn default() -> Self {
        Self {
            proxy_url: None,
            timeout_seconds: DEFAULT_TIMEOUT_SECONDS,
            max_retries: DEFAULT_MAX_RETRIES,
        }
    }
}

impl TorrentNetworkConfig {
    pub fn normalized(mut self) -> Self {
        self.proxy_url = self.proxy_url.and_then(|v| {
            let trimmed = v.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        });

        self.timeout_seconds = self.timeout_seconds.clamp(8, 120);
        self.max_retries = self.max_retries.clamp(0, 6);
        self
    }

    pub fn retry_backoff_ms(attempt: u32) -> u64 {
        match attempt {
            0 => 0,
            1 => 250,
            2 => 600,
            3 => 1100,
            _ => 1600,
        }
    }

    pub fn build_client(&self, user_agent: &str) -> Result<reqwest::Client> {
        let mut builder = reqwest::Client::builder()
            .user_agent(user_agent)
            .timeout(std::time::Duration::from_secs(self.timeout_seconds))
            .connect_timeout(std::time::Duration::from_secs(10));

        if let Some(proxy_url) = self.proxy_url.as_deref() {
            let proxy = reqwest::Proxy::all(proxy_url).map_err(|e| {
                ShioriError::Validation(format!("Invalid proxy URL '{}': {}", proxy_url, e))
            })?;
            builder = builder.proxy(proxy);
        }

        builder
            .build()
            .map_err(|e| ShioriError::Other(format!("Failed to create HTTP client: {}", e)))
    }

    pub fn load_from_store(app_handle: &tauri::AppHandle) -> Result<Self> {
        let store = app_handle
            .store("sources.json")
            .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

        let proxy_url = store
            .get("torrent-network.proxy_url")
            .and_then(|v| v.as_str().map(ToString::to_string));

        let timeout_seconds = store
            .get("torrent-network.timeout_seconds")
            .and_then(|v| {
                if let Some(raw) = v.as_u64() {
                    Some(raw)
                } else {
                    v.as_str().and_then(|s| s.parse::<u64>().ok())
                }
            })
            .unwrap_or(DEFAULT_TIMEOUT_SECONDS);

        let max_retries = store
            .get("torrent-network.max_retries")
            .and_then(|v| {
                if let Some(raw) = v.as_u64() {
                    Some(raw as u32)
                } else {
                    v.as_str().and_then(|s| s.parse::<u32>().ok())
                }
            })
            .unwrap_or(DEFAULT_MAX_RETRIES);

        Ok(Self {
            proxy_url,
            timeout_seconds,
            max_retries,
        }
        .normalized())
    }

    pub fn save_to_store(app_handle: &tauri::AppHandle, config: &Self) -> Result<()> {
        let cfg = config.clone().normalized();
        let store = app_handle
            .store("sources.json")
            .map_err(|e| ShioriError::Other(format!("Failed to open source store: {}", e)))?;

        match cfg.proxy_url.as_ref() {
            Some(value) => store.set("torrent-network.proxy_url", serde_json::json!(value)),
            None => {
                let _ = store.delete("torrent-network.proxy_url");
            }
        }

        store.set(
            "torrent-network.timeout_seconds",
            serde_json::json!(cfg.timeout_seconds),
        );
        store.set(
            "torrent-network.max_retries",
            serde_json::json!(cfg.max_retries),
        );

        store
            .save()
            .map_err(|e| ShioriError::Other(format!("Failed to save network config: {}", e)))?;
        Ok(())
    }
}
