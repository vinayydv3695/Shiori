use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const DESKTOP_ANILIST_CLIENT_ID: &str = env!("ANILIST_DESKTOP_CLIENT_ID");

const ANDROID_ANILIST_CLIENT_ID: &str = env!("ANILIST_ANDROID_CLIENT_ID");
const ANDROID_ANILIST_CLIENT_SECRET: &str = env!("ANILIST_ANDROID_CLIENT_SECRET");
const ANDROID_ANILIST_REDIRECT_URI: &str = env!("ANILIST_ANDROID_REDIRECT_URI");

#[derive(Serialize)]
struct TokenRequest {
    grant_type: String,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    code: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[allow(dead_code)]
    token_type: String,
    #[allow(dead_code)]
    expires_in: u64,
}

async fn exchange_authorization_code(
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
    code: String,
) -> Result<String, String> {
    let client = Client::builder()
        .user_agent("Shiori")
        .build()
        .unwrap_or_else(|_| Client::new());

    let req_body = TokenRequest {
        grant_type: "authorization_code".to_string(),
        client_id: client_id.to_string(),
        client_secret: client_secret.to_string(),
        redirect_uri: redirect_uri.to_string(),
        code,
    };

    let resp = client
        .post("https://anilist.co/api/v2/oauth/token")
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let error_text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, error_text));
    }

    let token_data = resp
        .json::<TokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    Ok(token_data.access_token)
}

#[tauri::command]
pub async fn exchange_android_anilist_code(code: String) -> Result<String, String> {
    exchange_authorization_code(
        ANDROID_ANILIST_CLIENT_ID,
        ANDROID_ANILIST_CLIENT_SECRET,
        ANDROID_ANILIST_REDIRECT_URI,
        code,
    )
    .await
}

#[tauri::command]
pub async fn start_anilist_login(app: AppHandle) -> Result<(), String> {
    // For Desktop, AniList clients are often configured for Implicit Grant (response_type=token)
    // which redirects to /oauth/pin#access_token=...
    let auth_url_str = format!(
        "https://anilist.co/api/v2/oauth/authorize?client_id={}&response_type=token",
        DESKTOP_ANILIST_CLIENT_ID
    );
    let auth_url = url::Url::parse(&auth_url_str).map_err(|e| e.to_string())?;

    let label = "anilist-login";
    let handle = app.clone();
    
    // Close existing if open
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
    }

    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(auth_url))
        .title("AniList Login")
        .inner_size(600.0, 800.0)
        .on_navigation(move |url| {
            let url_str = url.as_str();
            
            // Emit every navigation URL for debugging
            let _ = handle.emit("anilist-debug", url_str.to_string());

            if url_str.starts_with("https://anilist.co/api/v2/oauth/pin") || url_str.contains("#access_token=") {
                let mut token = None;
                
                if let Some(fragment) = url.fragment() {
                    for (key, value) in url::form_urlencoded::parse(fragment.as_bytes()) {
                        if key == "access_token" {
                            token = Some(value.into_owned());
                            break;
                        }
                    }
                }
                
                if let Some(t) = token {
                    let _ = handle.emit("anilist-token", t);
                    
                    if let Some(window) = handle.get_webview_window(label) {
                        let _ = window.close();
                    }
                    return false;
                } else {
                    let _ = handle.emit("anilist-error", format!("No access token found in fragment: {}", url_str));
                    return true;
                }
            }
            true
        })
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}
