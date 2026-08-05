//! Library-root mode commands (Slice 3, Mode B — SAF managed storage).
//!
//! Mode B is Android-only: the user picks a durable folder via
//! `ACTION_OPEN_DOCUMENT_TREE` and Shiori keeps managed books there so they
//! survive uninstall. Mode A (`app_data_dir/Library`) stays the default.
//! Desktop returns `Ok(None)` from `pick_library_root` and errors from
//! `migrate_library_to_saf` — the settings UI gates these behind `isAndroid`
//! (device verification is a documented follow-up).

use crate::error::{Result, ShioriError};
use crate::models::MigrateReport;
use crate::AppState;
#[cfg(target_os = "android")]
use std::path::Path;
#[cfg(target_os = "android")]
use crate::services::saf;
use tauri::State;

/// Persist the library-root mode.
///
/// `mode` ∈ {app, saf}. Switching to `app` clears the stored tree URI;
/// switching to `saf` requires a non-empty URI (picked via
/// [`pick_library_root`]).
#[tauri::command]
pub fn set_library_mode(
    state: State<'_, AppState>,
    mode: String,
    uri: Option<String>,
) -> Result<()> {
    set_library_mode_impl(&state.db, &mode, uri.as_deref())
}

/// Command core, factored out so integration tests can exercise the exact
/// persistence + validation logic without an `AppState`.
pub fn set_library_mode_impl(db: &crate::db::Database, mode: &str, uri: Option<&str>) -> Result<()> {
    match mode {
        "app" => {
            let conn = db.get_connection()?;
            conn.execute(
                "UPDATE user_preferences SET library_mode = 'app', library_root_uri = NULL \
                 WHERE id = 1",
                [],
            )?;
            log::info!("[library_root] library_mode → 'app'");
            Ok(())
        }
        "saf" => {
            let Some(uri) = uri.filter(|u| !u.trim().is_empty()) else {
                return Err(ShioriError::Other(
                    "SAF mode requires a folder URI — pick a folder first".to_string(),
                ));
            };
            let conn = db.get_connection()?;
            conn.execute(
                "UPDATE user_preferences SET library_mode = 'saf', library_root_uri = ?1 \
                 WHERE id = 1",
                [uri],
            )?;
            log::info!("[library_root] library_mode → 'saf' ({})", uri);
            Ok(())
        }
        other => Err(ShioriError::Other(format!(
            "invalid library_mode '{other}' (expected 'app' or 'saf')"
        ))),
    }
}

/// Launch the Android SAF folder picker and return the chosen tree URI.
///
/// The plugin persists the URI permission grant itself
/// (`takePersistableUriPermission` in SafPlugin.kt); the caller stores the
/// uri via [`set_library_mode`]. Desktop: Mode B is Android-only →
/// `Ok(None)`.
#[tauri::command]
pub async fn pick_library_root(app: tauri::AppHandle) -> Result<Option<String>> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_android_saf::AndroidSafExt;
        let resp = app
            .android_saf()
            .select_folder()
            .map_err(|e| ShioriError::Other(format!("SAF folder pick failed: {e}")))?;
        if resp.uri.is_empty() {
            return Ok(None);
        }
        log::info!("[library_root] picked SAF tree {}", resp.uri);
        Ok(Some(resp.uri))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        log::warn!(
            "[library_root] pick_library_root called on desktop — Mode B is Android-only"
        );
        Ok(None)
    }
}

/// One-time Mode A → Mode B migration: copy every managed book's local file
/// into the SAF tree under its `managed_relpath`, then flip
/// `library_mode='saf'` (only when every file migrated — see
/// [`saf::build_migrate_report`]).
#[tauri::command]
pub async fn migrate_library_to_saf(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    uri: String,
) -> Result<MigrateReport> {
    if uri.trim().is_empty() {
        return Err(ShioriError::Other(
            "SAF tree URI must not be empty".to_string(),
        ));
    }

    #[cfg(target_os = "android")]
    {
        let db = state.db.clone();
        let tree: std::sync::Arc<dyn saf::SafTree> = std::sync::Arc::new(PluginSafTree(app));
        tokio::task::spawn_blocking(move || {
            saf::build_migrate_report(&db, &uri, tree.as_ref())
        })
        .await
        .map_err(|e| ShioriError::Other(e.to_string()))?
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        let _ = state;
        Err(ShioriError::Other(
            "SAF library root migration is Android-only".to_string(),
        ))
    }
}

/// Android-only [`saf::SafTree`] impl backed by the local android-saf
/// plugin (`create_file_in_tree` / `write_document` / `delete_file_in_tree`).
#[cfg(target_os = "android")]
pub struct PluginSafTree(pub tauri::AppHandle);

#[cfg(target_os = "android")]
impl saf::SafTree for PluginSafTree {
    fn create_file(&self, tree_uri: &str, file_name: &str, mime_type: &str) -> Result<String> {
        use tauri_plugin_android_saf::AndroidSafExt;
        let resp = self
            .0
            .android_saf()
            .create_file_in_tree(tree_uri.to_string(), file_name.to_string(), mime_type.to_string())
            .map_err(|e| ShioriError::Other(format!("SAF create_file_in_tree: {e}")))?;
        if resp.uri.is_empty() {
            return Err(ShioriError::Other(
                "SAF create_file_in_tree returned an empty uri".to_string(),
            ));
        }
        Ok(resp.uri)
    }

    fn write_document(&self, doc_uri: &str, local_path: &Path) -> Result<()> {
        use tauri_plugin_android_saf::AndroidSafExt;
        self.0
            .android_saf()
            .write_document(doc_uri.to_string(), local_path.to_string_lossy().to_string())
            .map(|_| ())
            .map_err(|e| ShioriError::Other(format!("SAF write_document: {e}")))
    }

    fn delete_file(&self, tree_uri: &str, relpath: &str) -> Result<()> {
        use tauri_plugin_android_saf::AndroidSafExt;
        self.0
            .android_saf()
            .delete_file_in_tree(tree_uri.to_string(), relpath.to_string())
            .map(|_| ())
            .map_err(|e| ShioriError::Other(format!("SAF delete_file_in_tree: {e}")))
    }
}
