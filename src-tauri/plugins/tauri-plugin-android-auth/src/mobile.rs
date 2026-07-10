use serde::de::DeserializeOwned;
use serde_json::json;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_android_auth);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<AndroidAuth<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.tauri.shiori.auth", "AuthPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_android_auth)?;
    Ok(AndroidAuth(handle))
}

/// Access to the android-auth APIs.
pub struct AndroidAuth<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> AndroidAuth<R> {
    pub fn ping(&self, payload: PingRequest) -> crate::Result<PingResponse> {
        self.0
            .run_mobile_plugin("ping", payload)
            .map_err(Into::into)
    }

    /// Launches the AniList OAuth authorization URL in a Custom Tab.
    /// Calls the Kotlin `startOAuthLogin` command (see AuthPlugin.kt).
    pub fn start_oauth_login(&self, url: String) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("startOAuthLogin", StartOAuthLoginRequest { url })
            .map_err(Into::into)
    }

    /// Persists the AniList access token in EncryptedSharedPreferences.
    /// Calls the Kotlin `setSecureToken` command (see AuthPlugin.kt).
    pub fn set_secure_token(&self, token: String) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("setSecureToken", SetSecureTokenRequest { token })
            .map_err(Into::into)
    }

    /// Reads back the AniList access token from EncryptedSharedPreferences.
    /// Calls the Kotlin `getSecureToken` command (see AuthPlugin.kt).
    pub fn get_secure_token(&self) -> crate::Result<GetSecureTokenResponse> {
        self.0
            .run_mobile_plugin("getSecureToken", json!({}))
            .map_err(Into::into)
    }

    /// Clears the stored AniList access token (logout).
    /// Calls the Kotlin `clearSecureToken` command (see AuthPlugin.kt).
    pub fn clear_secure_token(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("clearSecureToken", json!({}))
            .map_err(Into::into)
    }
}
