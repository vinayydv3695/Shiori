use crate::models::*;
use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

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

    pub fn select_files(&self) -> crate::Result<SelectFilesResponse> {
        Ok(SelectFilesResponse { files: vec![] })
    }

    pub fn solve_cloudflare(&self, _url: String) -> crate::Result<SolveCloudflareResponse> {
        Ok(SolveCloudflareResponse {
            cookies: String::new(),
            user_agent: String::new(),
        })
    }

    pub fn evaluate_javascript(&self, _url: String, _js: String, _user_agent: Option<String>) -> crate::Result<String> {
        Ok(String::new())
    }

    pub fn enumerate_tree(&self, _uri: String) -> crate::Result<EnumerateTreeResponse> {
        Ok(EnumerateTreeResponse { files: vec![] })
    }

    pub fn copy_document(
        &self,
        _uri: String,
        _name: String,
    ) -> crate::Result<CopyDocumentResponse> {
        Ok(CopyDocumentResponse {
            path: String::new(),
        })
    }

    pub fn create_document(
        &self,
        _mime_type: String,
        _file_name: String,
    ) -> crate::Result<CreateDocumentResponse> {
        Ok(CreateDocumentResponse {
            uri: String::new(),
        })
    }

    pub fn write_document(
        &self,
        _uri: String,
        _path: String,
    ) -> crate::Result<WriteDocumentResponse> {
        Ok(WriteDocumentResponse {})
    }

    /// No-op on desktop: the storage-permission nudge only applies to Android. Desktop always
    /// reports "granted" so any (hypothetical) desktop caller never sees the nudge dialog.
    pub fn check_storage_permission(&self) -> crate::Result<CheckStoragePermissionResponse> {
        Ok(CheckStoragePermissionResponse { granted: true })
    }

    pub fn request_storage_permission(&self) -> crate::Result<CheckStoragePermissionResponse> {
        Ok(CheckStoragePermissionResponse { granted: true })
    }

    pub fn open_app_settings(&self) -> crate::Result<()> {
        Ok(())
    }
}
