use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const DESKTOP_ANILIST_CLIENT_ID: &str = "45197";
const DESKTOP_ANILIST_CLIENT_SECRET: &str = "vXYsl7taXO0YSgpjLRp0xTWLWoHbbEsWMsbf3lLD";
const DESKTOP_ANILIST_REDIRECT_URI: &str = "https://shiori.local/auth";

const ANDROID_ANILIST_CLIENT_ID: &str = "45479";
const ANDROID_ANILIST_CLIENT_SECRET: &str = "eb4zstd1FYg89DbVdJ4kp0inyq76Zp46oPH5UM4d";
const ANDROID_ANILIST_REDIRECT_URI: &str = "shiori://auth";

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
    let auth_url_str = format!(
        "https://anilist.co/api/v2/oauth/authorize?client_id={}&redirect_uri={}&response_type=code",
        DESKTOP_ANILIST_CLIENT_ID,
        urlencoding::encode(DESKTOP_ANILIST_REDIRECT_URI)
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

            if url_str.starts_with(DESKTOP_ANILIST_REDIRECT_URI) {
                let mut code = None;
                
                if let Some(query) = url.query() {
                    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
                        if key == "code" {
                            code = Some(value.into_owned());
                            break;
                        }
                    }
                }
                
                if let Some(c) = code {
                    let h = handle.clone();
                    
                    tauri::async_runtime::spawn(async move {
                        match exchange_authorization_code(
                            DESKTOP_ANILIST_CLIENT_ID,
                            DESKTOP_ANILIST_CLIENT_SECRET,
                            DESKTOP_ANILIST_REDIRECT_URI,
                            c,
                        ).await {
                            Ok(token) => {
                                let _ = h.emit("anilist-token", token);
                            }
                            Err(error) => {
                                let _ = h.emit("anilist-error", error);
                            }
                        }
                    });
                    
                    if let Some(window) = handle.get_webview_window(label) {
                        let _ = window.close();
                    }
                    return false;
                } else {
                    // If we hit the pin page but there's no code in the URL, let it load so we can see what's on it!
                    // And emit an error
                    let _ = handle.emit("anilist-error", format!("No code found in URL: {}", url_str));
                    return true;
                }
            }
            true
        })
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}
