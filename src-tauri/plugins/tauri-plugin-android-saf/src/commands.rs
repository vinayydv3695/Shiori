use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::AndroidSafExt;
use crate::Result;

#[command]
pub(crate) async fn select_folder<R: Runtime>(app: AppHandle<R>) -> Result<SelectFolderResponse> {
    app.android_saf().select_folder()
}

#[command]
pub(crate) async fn select_files<R: Runtime>(app: AppHandle<R>) -> Result<SelectFilesResponse> {
    app.android_saf().select_files()
}

#[command]
pub(crate) async fn solve_cloudflare<R: Runtime>(
    app: AppHandle<R>,
    url: String,
) -> Result<SolveCloudflareResponse> {
    app.android_saf().solve_cloudflare(url)
}

#[command]
pub(crate) async fn enumerate_tree<R: Runtime>(
    app: AppHandle<R>,
    uri: String,
) -> Result<EnumerateTreeResponse> {
    app.android_saf().enumerate_tree(uri)
}

#[command]
pub(crate) async fn copy_document<R: Runtime>(
    app: AppHandle<R>,
    uri: String,
    name: String,
) -> Result<CopyDocumentResponse> {
    app.android_saf().copy_document(uri, name)
}

#[command]
pub(crate) async fn check_storage_permission<R: Runtime>(
    app: AppHandle<R>,
) -> Result<CheckStoragePermissionResponse> {
    app.android_saf().check_storage_permission()
}

#[command]
pub(crate) async fn request_storage_permission<R: Runtime>(
    app: AppHandle<R>,
) -> Result<CheckStoragePermissionResponse> {
    app.android_saf().request_storage_permission()
}

#[command]
pub(crate) async fn open_app_settings<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.android_saf().open_app_settings()
}

#[command]
pub(crate) async fn set_keep_screen_on<R: Runtime>(
    app: AppHandle<R>,
    enabled: bool,
) -> Result<()> {
    app.android_saf().set_keep_screen_on(enabled)
}

#[command]
pub(crate) async fn open_url<R: Runtime>(app: AppHandle<R>, url: String) -> Result<()> {
    app.android_saf().open_url(url)
}

#[command]
pub(crate) async fn create_document<R: Runtime>(
    app: AppHandle<R>,
    mime_type: String,
    file_name: String,
) -> Result<CreateDocumentResponse> {
    app.android_saf().create_document(mime_type, file_name)
}

#[command]
pub(crate) async fn write_document<R: Runtime>(
    app: AppHandle<R>,
    uri: String,
    path: String,
) -> Result<WriteDocumentResponse> {
    app.android_saf().write_document(uri, path)
}

/// Create a new document inside a previously-picked tree URI (Mode B managed
/// books). Unlike `create_document` (interactive ACTION_CREATE_DOCUMENT
/// picker) this never shows UI — the caller already holds the tree.
#[command]
pub(crate) async fn create_file_in_tree<R: Runtime>(
    app: AppHandle<R>,
    tree_uri: String,
    file_name: String,
    mime_type: String,
) -> Result<CreateDocumentResponse> {
    app.android_saf().create_file_in_tree(tree_uri, file_name, mime_type)
}

/// Delete a document inside a previously-picked tree URI by relative path.
/// Idempotent: a missing document resolves as success.
#[command]
pub(crate) async fn delete_file_in_tree<R: Runtime>(
    app: AppHandle<R>,
    tree_uri: String,
    rel_path: String,
) -> Result<WriteDocumentResponse> {
    app.android_saf().delete_file_in_tree(tree_uri, rel_path)
}
