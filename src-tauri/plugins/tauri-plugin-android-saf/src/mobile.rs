use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};
use serde_json::json;
use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_android_saf);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<AndroidSaf<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("com.tauri.shiori.saf", "SafPlugin")?;
  #[cfg(target_os = "ios")]
  let handle = api.register_ios_plugin(init_plugin_android_saf)?;
  Ok(AndroidSaf(handle))
}

/// Access to the android-saf APIs.
pub struct AndroidSaf<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> AndroidSaf<R> {
  pub fn select_folder(&self) -> crate::Result<SelectFolderResponse> {
    self
      .0
      .run_mobile_plugin("selectFolder", json!({}))
      .map_err(Into::into)
  }

  pub fn select_files(&self) -> crate::Result<SelectFilesResponse> {
    self
      .0
      .run_mobile_plugin("selectFiles", json!({}))
      .map_err(Into::into)
  }

  pub fn solve_cloudflare(&self, url: String) -> crate::Result<SolveCloudflareResponse> {
    self
      .0
      .run_mobile_plugin("solveCloudflare", json!({ "url": url }))
      .map_err(Into::into)
  }
}
