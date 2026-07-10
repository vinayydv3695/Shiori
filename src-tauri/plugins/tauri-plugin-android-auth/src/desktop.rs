use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<AndroidAuth<R>> {
    Ok(AndroidAuth(app.clone()))
}

/// Access to the android-auth APIs.
pub struct AndroidAuth<R: Runtime>(AppHandle<R>);

impl<R: Runtime> AndroidAuth<R> {
    pub fn ping(&self, payload: PingRequest) -> crate::Result<PingResponse> {
        Ok(PingResponse {
            value: payload.value,
        })
    }

    /// No-op on desktop: AniList Android login is Android-only (see AniListAndroidProvider.ts,
    /// which is only wired up when `isAndroid` is true), but this must still compile for desktop
    /// targets since `AndroidAuthExt` is a generic extension trait.
    pub fn start_oauth_login(&self, _url: String) -> crate::Result<()> {
        Ok(())
    }

    pub fn set_secure_token(&self, _token: String) -> crate::Result<()> {
        Ok(())
    }

    pub fn get_secure_token(&self) -> crate::Result<GetSecureTokenResponse> {
        Ok(GetSecureTokenResponse {
            token: String::new(),
        })
    }

    pub fn clear_secure_token(&self) -> crate::Result<()> {
        Ok(())
    }
}
