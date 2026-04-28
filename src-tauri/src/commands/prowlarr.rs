/// Prowlarr Integration Commands
///
/// Provides Tauri commands for interacting with a locally-running Prowlarr
/// torrent indexer proxy. Users configure their Prowlarr URL + API key in
/// Settings, then can search for book releases and grab them for import.

use serde::{Deserialize, Serialize};
use crate::error::{Result, ShioriError};

// ═══════════════════════════════════════════════════════════════
// DATA TYPES
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProwlarrResult {
    pub title: String,
    pub size: Option<i64>,
    pub seeders: Option<i32>,
    pub leechers: Option<i32>,
    pub download_url: Option<String>,
    pub magnet_url: Option<String>,
    pub info_url: Option<String>,
    pub indexer: Option<String>,
    pub indexer_id: Option<i64>,
    pub categories: Vec<i32>,
    pub publish_date: Option<String>,
    pub guid: Option<String>,
}

// The raw API response from Prowlarr /api/v1/search
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawProwlarrItem {
    title: Option<String>,
    size: Option<i64>,
    seeders: Option<i32>,
    leechers: Option<i32>,
    download_url: Option<String>,
    magnet_url: Option<String>,
    info_url: Option<String>,
    indexer: Option<String>,
    indexer_id: Option<i64>,
    categories: Option<Vec<RawCategory>>,
    publish_date: Option<String>,
    guid: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawCategory {
    id: Option<i32>,
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

fn build_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| ShioriError::Other(format!("Failed to build HTTP client: {}", e)))
}

fn prowlarr_api_url(base_url: &str, path: &str) -> String {
    let base = base_url.trim_end_matches('/');
    format!("{}{}", base, path)
}

// ═══════════════════════════════════════════════════════════════
// TAURI COMMANDS
// ═══════════════════════════════════════════════════════════════

/// Test connectivity to a Prowlarr instance.
/// Returns Ok(true) if the API is reachable and the key is valid.
#[tauri::command]
pub async fn test_prowlarr_connection(url: String, api_key: String) -> Result<bool> {
    if url.trim().is_empty() {
        return Err(ShioriError::Validation("Prowlarr URL cannot be empty".to_string()));
    }
    if api_key.trim().is_empty() {
        return Err(ShioriError::Validation("Prowlarr API key cannot be empty".to_string()));
    }

    let client = build_client()?;
    let endpoint = prowlarr_api_url(&url, "/api/v1/system/status");

    let response = client
        .get(&endpoint)
        .header("X-Api-Key", api_key.trim())
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to connect to Prowlarr: {}", e)))?;

    if response.status().is_success() {
        Ok(true)
    } else if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        Err(ShioriError::Other(
            "Invalid Prowlarr API key (401 Unauthorized)".to_string(),
        ))
    } else {
        Err(ShioriError::Other(format!(
            "Prowlarr returned HTTP {}",
            response.status()
        )))
    }
}

/// Search Prowlarr for releases matching the given query and category list.
/// Categories: 7000 = eBooks, 8000 = Audiobooks (standard Newznab).
#[tauri::command]
pub async fn search_prowlarr(
    url: String,
    api_key: String,
    query: String,
    categories: Vec<i32>,
) -> Result<Vec<ProwlarrResult>> {
    if url.trim().is_empty() {
        return Err(ShioriError::Validation("Prowlarr URL cannot be empty".to_string()));
    }
    if api_key.trim().is_empty() {
        return Err(ShioriError::Validation("Prowlarr API key cannot be empty".to_string()));
    }
    if query.trim().is_empty() {
        return Err(ShioriError::Validation("Search query cannot be empty".to_string()));
    }

    let client = build_client()?;

    // Build query string with repeated categories[] params
    let mut params: Vec<(&str, String)> = vec![
        ("query", query.trim().to_string()),
        ("type", "search".to_string()),
    ];
    for cat in &categories {
        params.push(("categories[]", cat.to_string()));
    }

    let endpoint = prowlarr_api_url(&url, "/api/v1/search");

    let response = client
        .get(&endpoint)
        .header("X-Api-Key", api_key.trim())
        .header("Accept", "application/json")
        .query(&params)
        .send()
        .await
        .map_err(|e| ShioriError::Other(format!("Prowlarr search request failed: {}", e)))?;

    if !response.status().is_success() {
        return Err(ShioriError::Other(format!(
            "Prowlarr search returned HTTP {}",
            response.status()
        )));
    }

    let raw_items: Vec<RawProwlarrItem> = response
        .json()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to parse Prowlarr response: {}", e)))?;

    let results = raw_items
        .into_iter()
        .filter(|item| item.title.is_some())
        .map(|item| ProwlarrResult {
            title: item.title.unwrap_or_default(),
            size: item.size,
            seeders: item.seeders,
            leechers: item.leechers,
            download_url: item.download_url,
            magnet_url: item.magnet_url,
            info_url: item.info_url,
            indexer: item.indexer,
            indexer_id: item.indexer_id,
            categories: item
                .categories
                .unwrap_or_default()
                .into_iter()
                .filter_map(|c| c.id)
                .collect(),
            publish_date: item.publish_date,
            guid: item.guid,
        })
        .collect();

    Ok(results)
}

/// Grab a release from Prowlarr by sending it to its configured download clients.
/// Returns the download URL or magnet link for further handling.
#[tauri::command]
pub async fn grab_prowlarr_release(
    url: String,
    api_key: String,
    guid: String,
    indexer_id: i64,
) -> Result<String> {
    if url.trim().is_empty() {
        return Err(ShioriError::Validation("Prowlarr URL cannot be empty".to_string()));
    }
    if api_key.trim().is_empty() {
        return Err(ShioriError::Validation("Prowlarr API key cannot be empty".to_string()));
    }

    let client = build_client()?;
    let endpoint = prowlarr_api_url(&url, "/api/v1/search");

    // Prowlarr grab: POST with guid + indexerId
    let body = serde_json::json!({
        "guid": guid,
        "indexerId": indexer_id,
    });

    let response = client
        .post(&endpoint)
        .header("X-Api-Key", api_key.trim())
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| ShioriError::Other(format!("Prowlarr grab request failed: {}", e)))?;

    if !response.status().is_success() {
        return Err(ShioriError::Other(format!(
            "Prowlarr grab returned HTTP {}",
            response.status()
        )));
    }

    // The response contains the download URL or magnet
    let resp_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to parse grab response: {}", e)))?;

    // Try to extract magnetUrl first, then downloadUrl
    if let Some(magnet) = resp_json.get("magnetUrl").and_then(|v| v.as_str()) {
        if !magnet.is_empty() {
            return Ok(magnet.to_string());
        }
    }
    if let Some(dl) = resp_json.get("downloadUrl").and_then(|v| v.as_str()) {
        if !dl.is_empty() {
            return Ok(dl.to_string());
        }
    }

    Err(ShioriError::Other(
        "Prowlarr grab succeeded but returned no usable download link".to_string(),
    ))
}
