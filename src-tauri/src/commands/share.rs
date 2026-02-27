use std::sync::Arc;
use tauri::State;

use crate::error::{Result, ShioriError};
use crate::services::share_service::{ShareService, Share, ShareOptions, ShareResponse};
use crate::utils::validate;

/// Create a share for a book
#[tauri::command]
pub async fn create_book_share(
    service: State<'_, Arc<tokio::sync::Mutex<ShareService>>>,
    book_id: i64,
    password: Option<String>,
    expires_in_hours: Option<i64>,
    max_downloads: Option<i32>,
) -> Result<ShareResponse> {
    validate::require_positive_id(book_id, "book_id")?;
    if let Some(hours) = expires_in_hours {
        if hours < 1 || hours > 8760 {
            return Err(ShioriError::Validation(
                "expires_in_hours must be between 1 and 8760 (1 year)".to_string(),
            ));
        }
    }
    if let Some(max) = max_downloads {
        if max < 1 {
            return Err(ShioriError::Validation(
                "max_downloads must be at least 1".to_string(),
            ));
        }
    }
    let service = service.lock().await;
    
    let options = ShareOptions {
        password,
        expires_in_hours,
        max_accesses: max_downloads,
    };

    let share = service.create_share(book_id, options)
        .map_err(|e| ShioriError::Other(e.to_string()))?;

    let response = service.generate_share_url(&share.token)
        .map_err(|e| ShioriError::Other(e.to_string()))?;

    Ok(response)
}

/// Get share by token
#[tauri::command]
pub async fn get_share(
    service: State<'_, Arc<tokio::sync::Mutex<ShareService>>>,
    token: String,
) -> Result<Option<Share>> {
    validate::require_non_empty(&token, "token")?;
    validate::require_max_length(&token, 128, "token")?;
    let service = service.lock().await;
    service.get_share(&token)
        .map_err(|e| ShioriError::Other(e.to_string()))
}

/// Check if share is valid
#[tauri::command]
pub async fn is_share_valid(
    service: State<'_, Arc<tokio::sync::Mutex<ShareService>>>,
    token: String,
) -> Result<bool> {
    validate::require_non_empty(&token, "token")?;
    validate::require_max_length(&token, 128, "token")?;
    let service = service.lock().await;
    service.is_share_valid(&token)
        .map_err(|e| ShioriError::Other(e.to_string()))
}

/// Revoke a share
#[tauri::command]
pub async fn revoke_share(
    service: State<'_, Arc<tokio::sync::Mutex<ShareService>>>,
    token: String,
) -> Result<()> {
    validate::require_non_empty(&token, "token")?;
    validate::require_max_length(&token, 128, "token")?;
    let service = service.lock().await;
    service.revoke_share(&token)
        .map_err(|e| ShioriError::Other(e.to_string()))
}

/// List all shares for a book
#[tauri::command]
pub async fn list_book_shares(
    service: State<'_, Arc<tokio::sync::Mutex<ShareService>>>,
    book_id: Option<i64>,
) -> Result<Vec<Share>> {
    if let Some(id) = book_id {
        validate::require_positive_id(id, "book_id")?;
    }
    let service = service.lock().await;
    service.list_shares(book_id)
        .map_err(|e| ShioriError::Other(e.to_string()))
}

/// Start the share server
#[tauri::command]
pub async fn start_share_server(
    service: State<'_, Arc<tokio::sync::Mutex<ShareService>>>,
) -> Result<()> {
    let mut service = service.lock().await;
    service.start_server().await
        .map_err(|e| ShioriError::Other(e.to_string()))
}

/// Stop the share server
#[tauri::command]
pub async fn stop_share_server(
    service: State<'_, Arc<tokio::sync::Mutex<ShareService>>>,
) -> Result<()> {
    let mut service = service.lock().await;
    service.stop_server().await
        .map_err(|e| ShioriError::Other(e.to_string()))
}

/// Check if share server is running
#[tauri::command]
pub async fn is_share_server_running(
    service: State<'_, Arc<tokio::sync::Mutex<ShareService>>>,
) -> Result<bool> {
    let service = service.lock().await;
    Ok(service.is_running())
}

/// Clean up expired shares
#[tauri::command]
pub async fn cleanup_expired_shares(
    service: State<'_, Arc<tokio::sync::Mutex<ShareService>>>,
) -> Result<usize> {
    let service = service.lock().await;
    service.cleanup_expired_shares()
        .map_err(|e| ShioriError::Other(e.to_string()))
}
