//! WASM extension commands (Phase 2B + Phase 3): install a `.wasm` locally or
//! from a remote repository index, list, enable/disable, remove installed
//! extensions, and keep the `SourceRegistry` in sync so enabled extensions
//! act as `Source`s.
//!
//! Extensions install *enabled*; the registry is only mutated after the
//! extension manager has persisted the change to disk, so the manager stays
//! authoritative. Lock order is always `extensions` → `plugin_registry`, and
//! no lock is held across an `.await` once acquired (both are taken back to
//! back; the bodies between acquisition and release are synchronous), so the
//! pair can never deadlock.

use std::path::Path;
use std::sync::Arc;

use tauri::State;

use crate::error::{Result, ShioriError};
use crate::extensions::repo::{self, RepoEntry};
use crate::extensions::runtime::HostOptions;
use crate::extensions::wasm_source;
use crate::extensions::ExtensionInfo;
use crate::sources::registry::SourceRegistry;
use crate::sources::Source;

/// Construct a [`WasmSource`] for an installed extension's on-disk module and
/// register it (enabled) into `registry`. Shared by the commands and the
/// setup path so registration always behaves identically.
pub fn register_installed_extension(
    registry: &mut SourceRegistry,
    wasm_path: &Path,
    id: &str,
) -> Result<()> {
    let wasm = std::fs::read(wasm_path)?;
    let source = wasm_source::WasmSource::new(&wasm, HostOptions::default())?;
    registry.register(Arc::new(source) as Arc<dyn Source>);
    registry.set_enabled(id, true)?;
    Ok(())
}

/// Resolve the repo URL argument: explicit override wins, else the default.
fn resolve_repo_url(repo_url: &Option<String>) -> String {
    repo_url
        .clone()
        .unwrap_or_else(|| repo::DEFAULT_REPO_URL.to_string())
}

/// Fetch the index for `repo_url` and pull the entry for `id` (error when
/// the repo does not advertise it). Shared by the install/update commands.
async fn fetch_entry(repo_url: &Option<String>, id: &str) -> Result<RepoEntry> {
    let index = repo::fetch_index(&resolve_repo_url(repo_url)).await?;
    index
        .extensions
        .into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| ShioriError::Validation(format!("extension not found in repo index: {id}")))
}

/// Install-done tail shared by the install/update commands: resolve the
/// installed module path (extensions read lock), then register the source
/// (enabled) into the plugin registry — same behavior as the local install.
async fn register_installed_source(state: &State<'_, crate::AppState>, id: &str) -> Result<()> {
    let wasm_path = {
        let manager = state.extensions.read().await;
        manager
            .get(id)
            .ok_or_else(|| ShioriError::Validation(format!("not installed: {id}")))?
            .wasm_path
            .clone()
    };
    let mut registry = state.plugin_registry.write().await;
    register_installed_extension(&mut registry, &wasm_path, id)
}

/// All installed extensions, sorted by id, with their persisted enabled flag.
#[tauri::command]
pub async fn extension_list(state: State<'_, crate::AppState>) -> Result<Vec<ExtensionInfo>> {
    let manager = state.extensions.read().await;
    Ok(manager.list())
}

/// Install a local `.wasm` extension file and, because installs always come up
/// enabled, register it as a live source in the plugin registry.
#[tauri::command]
pub async fn extension_install_local(
    state: State<'_, crate::AppState>,
    wasm_path: String,
) -> Result<ExtensionInfo> {
    // Write-lock only for the install itself; released before the registry is
    // touched.
    let info = {
        let mut manager = state.extensions.write().await;
        manager.install_from_file(Path::new(&wasm_path))?
    };

    if info.enabled {
        register_installed_source(&state, &info.id).await?;
    }
    Ok(info)
}

/// List the extensions advertised by a repo index, sorted by name.
#[tauri::command]
pub async fn extension_repo_list(
    _state: State<'_, crate::AppState>,
    repo_url: Option<String>,
) -> Result<Vec<RepoEntry>> {
    let index = repo::fetch_index(&resolve_repo_url(&repo_url)).await?;
    let mut entries = index.extensions;
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

/// Install an extension from a repo index: fetch index → download + verify
/// (`sha256` when advertised) → install from bytes → register (enabled) in
/// the plugin registry.
#[tauri::command]
pub async fn extension_install_from_repo(
    state: State<'_, crate::AppState>,
    repo_url: Option<String>,
    id: String,
) -> Result<ExtensionInfo> {
    let entry = fetch_entry(&repo_url, &id).await?;
    let bytes = repo::download_extension(&entry).await?;

    let info = {
        let mut manager = state.extensions.write().await;
        repo::install_from_bytes(&mut manager, &bytes)?
    };

    if info.enabled {
        register_installed_source(&state, &info.id).await?;
    }
    Ok(info)
}

/// Compare installed extensions against a repo index; returns the entries
/// whose advertised version is newer than what's installed, sorted by name.
#[tauri::command]
pub async fn extension_check_updates(
    state: State<'_, crate::AppState>,
    repo_url: Option<String>,
) -> Result<Vec<RepoEntry>> {
    let index = repo::fetch_index(&resolve_repo_url(&repo_url)).await?;
    let installed = state.extensions.read().await;
    let mut updates: Vec<RepoEntry> = installed
        .list()
        .iter()
        .filter_map(|info| repo::find_update(info, &index))
        .collect();
    updates.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(updates)
}

/// Update an installed extension from a repo index. Safety ordering: the new
/// module is downloaded and verified *before* the installed copy is touched,
/// so a failed download never leaves the extension missing. Then: remove the
/// old install, install the new bytes, restore the previous enabled state,
/// and re-register the source in the plugin registry.
#[tauri::command]
pub async fn extension_update(
    state: State<'_, crate::AppState>,
    repo_url: Option<String>,
    id: String,
) -> Result<ExtensionInfo> {
    // Download + verify first — never remove the running copy on a failed
    // download.
    let entry = fetch_entry(&repo_url, &id).await?;
    let bytes = repo::download_extension(&entry).await?;

    // Preserve the enabled flag across the swap (read before removal).
    let was_enabled = {
        let manager = state.extensions.read().await;
        manager
            .get(&id)
            .ok_or_else(|| ShioriError::Validation(format!("not installed: {id}")))?
            .enabled
    };

    // Swap under the manager write lock: remove old → install new → restore
    // the previous enabled state (installs always come up enabled).
    let info = {
        let mut manager = state.extensions.write().await;
        manager.remove(&id)?;
        let mut info = repo::install_from_bytes(&mut manager, &bytes)?;
        if info.enabled != was_enabled {
            manager.set_enabled(&id, was_enabled)?;
            info.enabled = was_enabled;
        }
        info
    };

    // Re-register: drop the old source, register the new module (only when
    // the extension was enabled before the update).
    let wasm_path = {
        let manager = state.extensions.read().await;
        manager
            .get(&id)
            .ok_or_else(|| ShioriError::Validation(format!("not installed: {id}")))?
            .wasm_path
            .clone()
    };
    let mut registry = state.plugin_registry.write().await;
    registry.remove(&id);
    if was_enabled {
        register_installed_extension(&mut registry, &wasm_path, &id)?;
    }
    Ok(info)
}

/// Uninstall `id` from the manager and drop its source from the registry.
#[tauri::command]
pub async fn extension_remove(state: State<'_, crate::AppState>, id: String) -> Result<()> {
    {
        let mut manager = state.extensions.write().await;
        manager.remove(&id)?;
    }
    let mut registry = state.plugin_registry.write().await;
    registry.remove(&id);
    Ok(())
}

/// Flip an extension's enabled flag (persisted in `state.json`). Enabling an
/// extension whose source is not yet registered (e.g. its startup registration
/// was skipped) constructs and registers the source at that moment.
#[tauri::command]
pub async fn extension_set_enabled(
    state: State<'_, crate::AppState>,
    id: String,
    enabled: bool,
) -> Result<()> {
    {
        let mut manager = state.extensions.write().await;
        manager.set_enabled(&id, enabled)?;
    }

    // Read the module path up front under the manager read lock, then take
    // the registry write lock — extensions → plugin_registry order.
    let wasm_path = {
        let manager = state.extensions.read().await;
        manager
            .get(&id)
            .ok_or_else(|| ShioriError::Validation(format!("not installed: {id}")))?
            .wasm_path
            .clone()
    };
    let mut registry = state.plugin_registry.write().await;
    if enabled && registry.get(&id).is_none() {
        register_installed_extension(&mut registry, &wasm_path, &id)?;
    } else {
        registry.set_enabled(&id, enabled)?;
    }
    Ok(())
}