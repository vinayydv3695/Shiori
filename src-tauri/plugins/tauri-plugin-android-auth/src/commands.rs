use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::AndroidAuthExt;
use crate::Result;

#[command]
pub(crate) async fn ping<R: Runtime>(
    app: AppHandle<R>,
    payload: PingRequest,
) -> Result<PingResponse> {
    app.android_auth().ping(payload)
}

#[command]
pub(crate) async fn start_oauth_login<R: Runtime>(app: AppHandle<R>, url: String) -> Result<()> {
    app.android_auth().start_oauth_login(url)
}

#[command]
pub(crate) async fn set_secure_token<R: Runtime>(app: AppHandle<R>, token: String) -> Result<()> {
    app.android_auth().set_secure_token(token)
}

#[command]
pub(crate) async fn get_secure_token<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetSecureTokenResponse> {
    app.android_auth().get_secure_token()
}

#[command]
pub(crate) async fn clear_secure_token<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.android_auth().clear_secure_token()
}
