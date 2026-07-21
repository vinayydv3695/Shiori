use crate::services::sync_service::SyncService;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

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
pub async fn sync_with_desktop(
    ip: String,
    port: u16,
    token: String,
    _sync_service: State<'_, Arc<Mutex<SyncService>>>,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = format!("http://{}:{}/sync/pair", ip, port);
    
    let resp = client.post(&url)
        .json(&serde_json::json!({ "token": token }))
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                format!(
                    "Could not reach desktop at {}:{}. Make sure:\n\
                     • The Shiori desktop app is running\n\
                     • \"Companion Mode\" is enabled in desktop Settings\n\
                     • Both devices are on the same Wi-Fi network\n\
                     • Your desktop firewall allows port {}",
                    ip, port, port
                )
            } else if e.is_timeout() {
                format!(
                    "Connection timed out trying to reach {}:{}. \
                     Check that your IP address is correct and both devices are on the same network.",
                    ip, port
                )
            } else {
                format!("Connection failed: {}", e)
            }
        })?;
        
    if resp.status().is_success() {
        Ok("Synced successfully".to_string())
    } else if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        Err("Invalid pairing token. Please check the token shown in your desktop Settings.".to_string())
    } else {
        Err(format!("Desktop rejected the request (HTTP {}). Try rotating the pairing token.", resp.status().as_u16()))
    }
}
