/// window.rs — Tauri commands for OS-level window management.
///
/// On Windows, a `decorations(false)` window (WS_POPUP style) does NOT
/// automatically cover the taskbar when `set_fullscreen(true)` is called,
/// because tao's `SetWindowPos` uses `SWP_NOZORDER` and the taskbar sits at
/// `HWND_TOPMOST`. We must promote the window to TOPMOST **before** entering
/// fullscreen, then drop back to normal z-order when exiting.
use crate::error::ShioriError;
use tauri::{AppHandle, Manager, Runtime};

#[tauri::command]
pub async fn toggle_fullscreen<R: Runtime>(_app: AppHandle<R>) -> Result<bool, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let window = _app
            .get_webview_window("main")
            .ok_or_else(|| "Main window not found".to_string())?;

        let is_full = window.is_fullscreen().map_err(|e| e.to_string())?;

        if !is_full {
            // Step 1: promote to TOPMOST so we are above the taskbar
            window.set_always_on_top(true).map_err(|e| e.to_string())?;
            // Step 2: enter fullscreen (SetWindowPos now covers taskbar)
            window.set_fullscreen(true).map_err(|e| e.to_string())?;
        } else {
            // Step 1: exit fullscreen first
            window.set_fullscreen(false).map_err(|e| e.to_string())?;
            // Step 2: drop TOPMOST so dialogs / other apps can focus normally
            window.set_always_on_top(false).map_err(|e| e.to_string())?;
        }

        Ok(!is_full)
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        // Fullscreen not supported via tauri webview window api on mobile in this way
        Ok(false)
    }
}

#[tauri::command]
pub fn get_fullscreen_state<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    window.is_fullscreen().map_err(|e| e.to_string())
}

#[derive(serde::Serialize, Clone)]
struct DownloadProgress {
    downloaded: u64,
    total: Option<u64>,
}

/// Maximum allowed APK size (APKs fit comfortably under 600MB).
const MAX_APK_SIZE: usize = 600 * 1024 * 1024;

/// Validate that an APK download URL is a GitHub release asset URL.
/// Accepts github.com `/releases/download/` URLs (which redirect to
/// objects.githubusercontent.com) and direct objects.githubusercontent.com
/// `repos/.../releases/download/` URLs. Any other scheme/host/path shape is
/// rejected so a compromised update endpoint cannot point us elsewhere.
fn validate_apk_url(url: &str) -> Result<(), ShioriError> {
    let parsed = url::Url::parse(url)
        .map_err(|e| ShioriError::Validation(format!("Invalid APK URL: {}", e)))?;

    if parsed.scheme() != "https" {
        return Err(ShioriError::Validation(
            "APK download URL must use https".to_string(),
        ));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| ShioriError::Validation("APK download URL has no host".to_string()))?;

    match host {
        "github.com" => {
            if !parsed.path().contains("/releases/download/") {
                return Err(ShioriError::Validation(
                    "APK download URL must point to a GitHub release asset".to_string(),
                ));
            }
        }
        "objects.githubusercontent.com" => {
            if !parsed.path().contains("repos/") || !parsed.path().contains("/releases/download/") {
                return Err(ShioriError::Validation(
                    "APK download URL must point to a GitHub release asset".to_string(),
                ));
            }
        }
        _ => {
            return Err(ShioriError::Validation(format!(
                "APK download URL host not allowed: {}",
                host
            )));
        }
    }

    Ok(())
}

/// Compute the lowercase hex SHA-256 of a file, streaming so we never load
/// the whole APK into memory.
fn sha256_hex(path: &std::path::Path) -> Result<String, ShioriError> {
    use sha2::{Digest, Sha256};

    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)?;
    Ok(format!("{:x}", hasher.finalize()))
}

#[tauri::command]
pub async fn download_apk(
    url: String,
    expected_sha256: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<String, ShioriError> {
    use std::io::Write;
    use futures::StreamExt;
    use tauri::Emitter;
    use tauri::Manager;

    // Validate BEFORE downloading anything.
    validate_apk_url(&url)?;

    // Use app_cache_dir so FileProvider can find it via <cache-path>
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| ShioriError::Other(format!("Failed to resolve cache dir: {}", e)))?;

    if !cache_dir.exists() {
        std::fs::create_dir_all(&cache_dir)?;
    }

    let apk_path = cache_dir.join("update.apk");

    if apk_path.exists() {
        let _ = std::fs::remove_file(&apk_path);
    }

    let response = reqwest::get(&url)
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to download: {}", e)))?;

    if !response.status().is_success() {
        return Err(ShioriError::Other(format!(
            "Download failed with status: {}",
            response.status()
        )));
    }

    let mut file = std::fs::File::create(&apk_path)?;

    let total = response.content_length();
    let mut downloaded: u64 = 0;
    // Stream chunks instead of loading entire APK into memory
    let mut stream = std::pin::pin!(response.bytes_stream().take(MAX_APK_SIZE + 1));
    while let Some(chunk) = stream
        .next()
        .await
        .transpose()
        .map_err(|e| ShioriError::Other(format!("Failed to read chunk: {}", e)))?
    {
        file.write_all(&chunk)?;
        downloaded += chunk.len() as u64;

        let _ = app_handle.emit("download_progress", DownloadProgress { downloaded, total });
    }

    if downloaded > MAX_APK_SIZE as u64 {
        let _ = std::fs::remove_file(&apk_path);
        return Err(ShioriError::Validation(
            "APK exceeds the 600 MB size limit — update aborted".to_string(),
        ));
    }

    // Verify against the GitHub release asset digest before install.
    let Some(expected) = expected_sha256 else {
        let _ = std::fs::remove_file(&apk_path);
        return Err(ShioriError::Validation(
            "Release asset has no sha256 digest — update refused".to_string(),
        ));
    };

    let expected = expected.trim().strip_prefix("sha256:").unwrap_or(&expected);
    let actual = sha256_hex(&apk_path)?;
    if !actual.eq_ignore_ascii_case(expected.trim()) {
        let _ = std::fs::remove_file(&apk_path);
        return Err(ShioriError::Validation(
            "APK checksum mismatch — update aborted".to_string(),
        ));
    }

    Ok(apk_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::Digest;

    fn write_temp_file(bytes: &[u8]) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("shiori_apk_test_{}", std::process::id()));
        std::fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn accepts_github_release_urls() {
        assert!(validate_apk_url(
            "https://github.com/vinayydv3695/Shiori/releases/download/v2.3.14/app.apk"
        )
        .is_ok());
        assert!(validate_apk_url(
            "https://github.com/other/repo/releases/download/v1.0.0/any.apk?token=abc"
        )
        .is_ok());
        assert!(validate_apk_url(
            "https://objects.githubusercontent.com/12345/repos/vinayydv3695/Shiori/releases/download/v2.3.14/app.apk?token=abc"
        )
        .is_ok());
    }

    #[test]
    fn rejects_invalid_urls() {
        // Wrong scheme
        assert!(validate_apk_url("http://github.com/vinayydv3695/Shiori/releases/download/v2.3.14/app.apk").is_err());
        // Wrong host
        assert!(validate_apk_url("https://evil.com/releases/download/x.apk").is_err());
        // Not a URL at all
        assert!(validate_apk_url("not a url").is_err());
        // github.com without the release-download path shape
        assert!(validate_apk_url("https://github.com/vinayydv3695/Shiori/archive/refs/tags/v2.3.14.zip").is_err());
        // objects.githubusercontent.com missing repos/ or releases/download/
        assert!(validate_apk_url("https://objects.githubusercontent.com/12345/repos/vinayydv3695/Shiori/raw/v2.3.14/app.apk").is_err());
        assert!(validate_apk_url("https://objects.githubusercontent.com/12345/releases/download/x.apk").is_err());
    }

    #[test]
    fn checksum_matches_known_bytes() {
        let bytes = b"shiori update apk test payload\n";
        let path = write_temp_file(bytes);

        let expected = format!("{:x}", sha2::Sha256::digest(bytes));
        assert_eq!(sha256_hex(&path).unwrap(), expected);

        // Mismatch must fail
        let wrong: String = "0".repeat(64);
        assert_ne!(sha256_hex(&path).unwrap(), wrong);

        let _ = std::fs::remove_file(&path);
    }
}
