use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};
use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<AndroidSaf<R>> {
  Ok(AndroidSaf(app.clone()))
}

/// Access to the android-saf APIs.
pub struct AndroidSaf<R: Runtime>(AppHandle<R>);

impl<R: Runtime> AndroidSaf<R> {
  pub fn select_folder(&self) -> crate::Result<SelectFolderResponse> {
    Ok(SelectFolderResponse { uri: String::new() })
  }
}
