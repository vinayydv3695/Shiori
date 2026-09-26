use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const DESKTOP_ANILIST_CLIENT_ID: &str = "45197";
// Injected at compile time from ANILIST_DESKTOP_CLIENT_SECRET (see build.rs).
// Must be provided via .env / CI env — never commit real values.
const DESKTOP_ANILIST_CLIENT_SECRET: Option<&str> =
    option_env!("ANILIST_DESKTOP_CLIENT_SECRET");
const DESKTOP_ANILIST_REDIRECT_URI: &str = "https://shiori.local/auth";

const ANDROID_ANILIST_CLIENT_ID: &str = "45479";
const ANDROID_ANILIST_CLIENT_SECRET: Option<&str> =
    option_env!("ANILIST_ANDROID_CLIENT_SECRET");
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
    let client_secret = ANDROID_ANILIST_CLIENT_SECRET.ok_or_else(|| {
        "AniList client secret not configured. Set ANILIST_ANDROID_CLIENT_SECRET in .env and rebuild."
            .to_string()
    })?;
    exchange_authorization_code(
        ANDROID_ANILIST_CLIENT_ID,
        client_secret,
        ANDROID_ANILIST_REDIRECT_URI,
        code,
    )
    .await
}

#[tauri::command]
pub async fn start_anilist_login(app: AppHandle) -> Result<String, String> {
    let desktop_client_secret = DESKTOP_ANILIST_CLIENT_SECRET.ok_or_else(|| {
        "AniList client secret not configured. Set ANILIST_DESKTOP_CLIENT_SECRET in .env and rebuild."
            .to_string()
    })?;
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

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let tx = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));

    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(auth_url))
        .title("AniList Login")
        .inner_size(600.0, 800.0)
        .on_navigation({
            let tx = std::sync::Arc::clone(&tx);
            let handle = handle.clone();
            move |url| {
                let url_str = url.as_str();

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

                    let tx_sender = {
                        if let Ok(mut lock) = tx.lock() {
                            lock.take()
                        } else {
                            None
                        }
                    };

                    if let Some(c) = code {
                        if let Some(sender) = tx_sender {
                            tauri::async_runtime::spawn(async move {
                                let res = exchange_authorization_code(
                                    DESKTOP_ANILIST_CLIENT_ID,
                                    desktop_client_secret,
                                    DESKTOP_ANILIST_REDIRECT_URI,
                                    c,
                                )
                                .await;

                                let _ = sender.send(res);
                            });
                        }
                    } else {
                        if let Some(sender) = tx_sender {
                            let _ = sender.send(Err(format!("No code found in URL: {}", url_str)));
                        }
                    }

                    if let Some(window) = handle.get_webview_window(label) {
                        let _ = window.close();
                    }
                    return false; // Cancel navigation
                }
                true // Allow navigation
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    let window = app
        .get_webview_window(label)
        .ok_or("Failed to get window")?;

    let tx_close = std::sync::Arc::clone(&tx);
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            if let Ok(mut lock) = tx_close.lock() {
                if let Some(sender) = lock.take() {
                    let _ = sender.send(Err("User closed the login window".to_string()));
                }
            }
        }
    });

    match rx.await {
        Ok(res) => res,
        Err(_) => Err("Login cancelled or failed internally".to_string()),
    }
}
