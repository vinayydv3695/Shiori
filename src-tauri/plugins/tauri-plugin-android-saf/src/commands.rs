use tauri::{AppHandle, command, Runtime};

use crate::models::*;
use crate::Result;
use crate::AndroidSafExt;

#[command]
pub(crate) async fn select_folder<R: Runtime>(
    app: AppHandle<R>,
) -> Result<SelectFolderResponse> {
    app.android_saf().select_folder()
}

#[command]
pub(crate) async fn select_files<R: Runtime>(
    app: AppHandle<R>,
) -> Result<SelectFilesResponse> {
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
