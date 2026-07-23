use crate::models::*;
use serde::de::DeserializeOwned;
use serde_json::json;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

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
        self.0
            .run_mobile_plugin("selectFolder", json!({}))
            .map_err(Into::into)
    }

    pub fn select_files(&self) -> crate::Result<SelectFilesResponse> {
        self.0
            .run_mobile_plugin("selectFiles", json!({}))
            .map_err(Into::into)
    }

    pub fn solve_cloudflare(&self, url: String) -> crate::Result<SolveCloudflareResponse> {
        self.0
            .run_mobile_plugin("solveCloudflare", json!({ "url": url }))
            .map_err(Into::into)
    }

    pub fn evaluate_javascript(&self, url: String, js: String, user_agent: Option<String>) -> crate::Result<String> {
        #[derive(serde::Deserialize)]
        struct EvaluateJavascriptResponse {
            result: String,
        }
        let res: EvaluateJavascriptResponse = self.0
            .run_mobile_plugin("evaluateJavascript", json!({ "url": url, "js": js, "userAgent": user_agent }))?;
        Ok(res.result)
    }

    pub fn enumerate_tree(&self, uri: String) -> crate::Result<EnumerateTreeResponse> {
        self.0
            .run_mobile_plugin("enumerateTree", json!({ "uri": uri }))
            .map_err(Into::into)
    }

    pub fn copy_document(&self, uri: String, name: String) -> crate::Result<CopyDocumentResponse> {
        self.0
            .run_mobile_plugin("copyDocument", json!({ "uri": uri, "name": name }))
            .map_err(Into::into)
    }

    /// UX-nudge check only — SAF pickers never require this to be granted (see checkStoragePermission
    /// in SafPlugin.kt).
    pub fn check_storage_permission(&self) -> crate::Result<CheckStoragePermissionResponse> {
        self.0
            .run_mobile_plugin("checkStoragePermission", json!({}))
            .map_err(Into::into)
    }

    pub fn request_storage_permission(&self) -> crate::Result<CheckStoragePermissionResponse> {
        self.0
            .run_mobile_plugin("requestStoragePermission", json!({}))
            .map_err(Into::into)
    }

    /// Opens the app's system "App info" Settings screen via ACTION_APPLICATION_DETAILS_SETTINGS.
    pub fn open_app_settings(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin("openAppSettings", json!({}))
            .map_err(Into::into)
    }

    pub fn create_document(&self, mime_type: String, file_name: String) -> crate::Result<CreateDocumentResponse> {
        self.0
            .run_mobile_plugin("createDocument", json!({ "mimeType": mime_type, "fileName": file_name }))
            .map_err(Into::into)
    }

    pub fn write_document(&self, uri: String, path: String) -> crate::Result<WriteDocumentResponse> {
        self.0
            .run_mobile_plugin("writeDocument", json!({ "uri": uri, "path": path }))
            .map_err(Into::into)
    }
}
