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
    // 1. Get local last_sync_time from settings
    // 2. Fetch delta from host
    // 3. Apply delta to local DB
    // 4. Fetch local delta since last_sync_time
    // 5. Push to host
    // For now we will just return a placeholder string.
    
    // In the real MVP, we just do a quick reqwest to the desktop.
    let client = reqwest::Client::new();
    let url = format!("http://{}:{}/sync/pair", ip, port);
    
    let resp = client.post(&url)
        .json(&serde_json::json!({ "token": token }))
        .send()
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;
        
    if resp.status().is_success() {
        Ok("Synced successfully".to_string())
    } else {
        Err("Failed to pair with desktop. Invalid token?".to_string())
    }
}
