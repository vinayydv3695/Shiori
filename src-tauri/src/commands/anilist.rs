use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use reqwest::Client;
use serde::{Deserialize, Serialize};

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

#[tauri::command]
pub async fn start_anilist_login(app: AppHandle) -> Result<(), String> {
    let client_id = "45197";
    let client_secret = "vXYsl7taXO0YSgpjLRp0xTWLWoHbbEsWMsbf3lLD";
    let redirect_uri = "https://shiori.local/auth";
    
    let auth_url_str = format!(
        "https://anilist.co/api/v2/oauth/authorize?client_id={}&response_type=code",
        client_id
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

            if url_str.starts_with("https://shiori.local/auth") {
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
                    let cid = client_id.to_string();
                    let sec = client_secret.to_string();
                    let ruri = redirect_uri.to_string();
                    
                    tauri::async_runtime::spawn(async move {
                        let client = Client::builder()
                            .user_agent("Shiori")
                            .build()
                            .unwrap_or_else(|_| Client::new());
                            
                        let req_body = TokenRequest {
                            grant_type: "authorization_code".to_string(),
                            client_id: cid,
                            client_secret: sec,
                            redirect_uri: ruri,
                            code: c,
                        };
                        
                        match client.post("https://anilist.co/api/v2/oauth/token")
                            .json(&req_body)
                            .send()
                            .await {
                            Ok(resp) => {
                                let status = resp.status();
                                if status.is_success() {
                                    if let Ok(token_data) = resp.json::<TokenResponse>().await {
                                        let _ = h.emit("anilist-token", token_data.access_token);
                                    } else {
                                        let _ = h.emit("anilist-error", "Failed to parse token response");
                                    }
                                } else {
                                    let error_text = resp.text().await.unwrap_or_default();
                                    let _ = h.emit("anilist-error", format!("HTTP {}: {}", status, error_text));
                                }
                            }
                            Err(e) => {
                                let _ = h.emit("anilist-error", format!("Request failed: {}", e));
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
