use crate::services::sync_service::{
    apply_incoming_sync_data, extract_local_sync_data, PeerSyncPayload, PeerSyncResponse,
    SyncService,
};
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResultSummary {
    pub sent_books: usize,
    pub sent_sessions: usize,
    pub received_books: usize,
    pub received_sessions: usize,
    pub message: String,
    pub host_device_name: String,
    pub timestamp: String,
}

#[tauri::command]
pub async fn start_sync_server(
    sync_service: State<'_, Arc<Mutex<SyncService>>>,
) -> Result<(), String> {
    let mut service = sync_service.lock().await;
    service.start_server().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_sync_server(
    sync_service: State<'_, Arc<Mutex<SyncService>>>,
) -> Result<(), String> {
    let mut service = sync_service.lock().await;
    service.stop_server().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sync_server_status(
    sync_service: State<'_, Arc<Mutex<SyncService>>>,
) -> Result<bool, String> {
    let service = sync_service.lock().await;
    Ok(service.is_running())
}

#[tauri::command]
pub async fn get_sync_pairing_token(
    sync_service: State<'_, Arc<Mutex<SyncService>>>,
) -> Result<String, String> {
    let service = sync_service.lock().await;
    service.get_pairing_token().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rotate_sync_pairing_token(
    sync_service: State<'_, Arc<Mutex<SyncService>>>,
) -> Result<String, String> {
    let service = sync_service.lock().await;
    service.rotate_pairing_token().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_with_companion(
    state: State<'_, AppState>,
    ip: String,
    port: u16,
    token: String,
    since: Option<String>,
) -> Result<SyncResultSummary, String> {
    if token.trim().is_empty() {
        return Err("Pairing token cannot be empty".to_string());
    }

    // 1. Extract local sync payload to send to peer
    let local_payload: PeerSyncPayload = {
        let conn = state.db.get_connection().map_err(|e| e.to_string())?;
        extract_local_sync_data(&conn, since.as_deref()).map_err(|e| e.to_string())?
    };
    let sent_books = local_payload.books.len();
    let sent_sessions = local_payload.sessions.len();

    // 2. Perform HTTP request to companion device
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = format!("http://{}:{}/sync/p2p", ip, port);

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token.trim()))
        .json(&local_payload)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                format!(
                    "Could not reach companion at {}:{}. Make sure:\n\
                     • Shiori is open on the companion device\n\
                     • Both devices are on the same Wi-Fi network\n\
                     • Firewall allows port {}",
                    ip, port, port
                )
            } else if e.is_timeout() {
                format!(
                    "Connection timed out trying to reach {}:{}. Check that your IP address is correct.",
                    ip, port
                )
            } else {
                format!("Connection failed: {}", e)
            }
        })?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(
            "Invalid pairing token. Please check the token shown on the companion device."
                .to_string(),
        );
    }

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Companion returned error: {}", err_text));
    }

    let peer_resp: PeerSyncResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse companion sync response: {}", e))?;

    // 3. Apply peer's returned data to local DB
    let (received_books, received_sessions) = {
        let mut conn = state.db.get_connection().map_err(|e| e.to_string())?;
        apply_incoming_sync_data(&mut *conn, &peer_resp.host_data)
            .map_err(|e| format!("Failed to apply incoming sync data: {}", e))?
    };

    let now = chrono::Utc::now().to_rfc3339();

    // 4. Save last sync metadata in settings table
    if let Ok(conn) = state.db.get_connection() {
        let _ = conn.execute(
            "INSERT INTO settings (key, value, type) VALUES ('sync_last_synced_at', ?1, 'string')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![now],
        );
        let _ = conn.execute(
            "INSERT INTO settings (key, value, type) VALUES ('sync_host_ip', ?1, 'string')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![ip],
        );
        let _ = conn.execute(
            "INSERT INTO settings (key, value, type) VALUES ('sync_host_port', ?1, 'string')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![port.to_string()],
        );
        let _ = conn.execute(
            "INSERT INTO settings (key, value, type) VALUES ('sync_host_token', ?1, 'string')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![token],
        );
    }

    Ok(SyncResultSummary {
        sent_books,
        sent_sessions,
        received_books,
        received_sessions,
        message: format!(
            "Synced with {}: sent {} books, updated {} books and {} streaks/sessions",
            peer_resp.host_data.device_name, sent_books, received_books, received_sessions
        ),
        host_device_name: peer_resp.host_data.device_name,
        timestamp: now,
    })
}

#[tauri::command]
pub async fn sync_with_desktop(
    state: State<'_, AppState>,
    ip: String,
    port: u16,
    token: String,
) -> Result<String, String> {
    let summary = sync_with_companion(state, ip, port, token, None).await?;
    Ok(summary.message)
}
