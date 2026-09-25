//! Local WASM extension commands (Phase 2B): install a `.wasm` locally, list,
//! enable/disable, remove installed extensions, and keep the `SourceRegistry`
//! in sync so enabled extensions act as `Source`s.
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
        let wasm_path = {
            let manager = state.extensions.read().await;
            manager
                .get(&info.id)
                .ok_or_else(|| {
                    ShioriError::Validation(format!("not installed: {}", info.id))
                })?
                .wasm_path
                .clone()
        };
        let mut registry = state.plugin_registry.write().await;
        register_installed_extension(&mut registry, &wasm_path, &info.id)?;
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