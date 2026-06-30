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
