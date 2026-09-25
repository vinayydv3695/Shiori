//! Local extension manager (Phase 2A): install from a local `.wasm`, list,
//! enable/disable, remove. Runs ahead of the command layer (Phase 2B wires
//! commands + the registry); this module is pure filesystem + runtime.
//!
//! On-disk layout under the manager root:
//! ```text
//! root/<id>/
//!   manifest.json  — validated [`ExtensionManifest`] (immutable once installed)
//!   source.wasm    — the module bytes
//!   state.json     — `{ "enabled": bool }` (manifests stay immutable; state is separate)
//!   storage.json   — file-backed host KV (`storage.json`, written via the host)
//! ```
//!
//! Install order: bytes → live [`ExtensionInstance`] (validates + fuel/limits)
//! → `meta` invoke → [`SourceMeta`] → [`ExtensionManifest::from_meta`] →
//! [`validate`](ExtensionManifest::validate) → write files. A lying `meta`
//! payload is rejected before anything hits disk.

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::sources::{ContentType, SourceMeta};

use super::abi::Method;
use super::manifest::{ExtensionManifest, ExtensionPermissions};
use super::runtime::{ExtensionInstance, HostOptions};
use super::{ExtensionError, ExtResult};

/// Serializable view of an installed extension (manifest fields + enabled
/// state), what the future command layer returns to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub lang: Option<String>,
    pub base_url: Option<String>,
    pub content_type: ContentType,
    pub nsfw: bool,
    pub min_app_version: Option<String>,
    pub permissions: ExtensionPermissions,
    pub enabled: bool,
}

/// One installed extension, as held by the manager. Not serialized — the
/// serializable view is [`ExtensionInfo`].
#[derive(Debug, Clone)]
pub struct InstalledExtension {
    pub manifest: ExtensionManifest,
    pub wasm_path: PathBuf,
    pub enabled: bool,
    /// `root/<id>/storage.json` — passed to every instance the manager (and
    /// later the registry/Source adapter) constructs, so host KV persists.
    pub kv_path: PathBuf,
}

impl From<&InstalledExtension> for ExtensionInfo {
    fn from(e: &InstalledExtension) -> Self {
        Self {
            id: e.manifest.id.clone(),
            name: e.manifest.name.clone(),
            version: e.manifest.version.clone(),
            lang: e.manifest.lang.clone(),
            base_url: e.manifest.base_url.clone(),
            content_type: e.manifest.content_type.clone(),
            nsfw: e.manifest.nsfw,
            min_app_version: e.manifest.min_app_version.clone(),
            permissions: e.manifest.permissions.clone(),
            enabled: e.enabled,
        }
    }
}

/// Parses the optional `permissions` object from an extension's raw `meta`
/// response (`data` payload, before it is deserialized into [`SourceMeta`]).
/// The wasm is untrusted, so the accepted contract is narrow: `hosts` must
/// be an array of bare hostnames (`"a.com"`, …). Any entry that is empty or
/// contains `/`, `:`, or whitespace is dropped with a warning; survivors are
/// normalized to `https://host` — the manifest's canonical form, which
/// [`ExtensionManifest::validate`] requires. A missing or malformed
/// `permissions` object yields deny-all (the safe default).
pub fn permissions_from_meta(value: &serde_json::Value) -> ExtensionPermissions {
    let Some(hosts) = value
        .get("permissions")
        .and_then(|p| p.get("hosts"))
        .and_then(|h| h.as_array())
    else {
        return ExtensionPermissions::default();
    };

    let mut out: Vec<String> = Vec::new();
    for host in hosts {
        let Some(raw) = host.as_str() else {
            log::warn!("extension meta permissions: ignoring non-string host entry {host}");
            continue;
        };
        let bare = raw.trim();
        if bare.is_empty()
            || bare.contains('/')
            || bare.contains(':')
            || bare.contains(char::is_whitespace)
        {
            log::warn!("extension meta permissions: ignoring invalid host entry {raw:?}");
            continue;
        }
        out.push(format!("https://{bare}"));
    }
    ExtensionPermissions { hosts: out }
}

/// Local extension installation directory manager.
#[derive(Debug)]
pub struct ExtensionManager {
    root: PathBuf,
    installed: HashMap<String, InstalledExtension>,
}

// File names inside `root/<id>/`.
pub const MANIFEST_FILE: &str = "manifest.json";
pub const WASM_FILE: &str = "source.wasm";
pub const STATE_FILE: &str = "state.json";
pub const STORAGE_FILE: &str = "storage.json";

impl ExtensionManager {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            installed: HashMap::new(),
        }
    }

    /// Rescans `root/*/` and rebuilds the installed map. Directories lacking
    /// a valid `manifest.json` + `source.wasm` are skipped with a warning —
    /// a broken directory never fails the whole scan.
    pub fn load_all(&mut self) -> ExtResult<Vec<ExtensionInfo>> {
        fs::create_dir_all(&self.root).map_err(|e| {
            ExtensionError::Malformed(format!("extensions root {:?}: {e}", self.root))
        })?;

        // Cut everything known; this method is a full resync.
        self.installed.clear();
        let mut dirs: Vec<PathBuf> = Vec::new();

        for entry in fs::read_dir(&self.root).map_err(|e| {
            ExtensionError::Malformed(format!("scan extensions root {:?}: {e}", self.root))
        })? {
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    log::warn!("skipping unreadable extension dir entry: {e}");
                    continue;
                }
            };
            if entry.path().is_dir() {
                dirs.push(entry.path());
            }
        }
        dirs.sort(); // deterministic order for tests + UI

        for dir in dirs {
            match Self::load_dir(&dir) {
                Ok(Some(installed)) => {
                    self.installed.insert(installed.manifest.id.clone(), installed);
                }
                Ok(None) => {} // valid dir, no manifest (e.g. leftover files)
                Err(e) => {
                    log::warn!("skipping extension dir {}: {e}", dir.display());
                }
            }
        }
        Ok(self.list())
    }

    /// Reads a single `root/<id>` directory; `Ok(None)` when the directory is
    /// not an extension (no `manifest.json` at all), `Err` when the manifest
    /// or module exists but is invalid.
    fn load_dir(dir: &Path) -> ExtResult<Option<InstalledExtension>> {
        let manifest_path = dir.join(MANIFEST_FILE);
        let wasm_path = dir.join(WASM_FILE);
        let raw = match fs::read(&manifest_path) {
            Ok(b) => b,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) => {
                return Err(ExtensionError::Malformed(format!(
                    "read {}: {e}",
                    manifest_path.display()
                )))
            }
        };
        let manifest: ExtensionManifest = serde_json::from_slice(&raw).map_err(|e| {
            ExtensionError::Malformed(format!("manifest {}: {e}", manifest_path.display()))
        })?;
        manifest.validate()?;
        if !wasm_path.is_file() {
            return Err(ExtensionError::Malformed(format!(
                "missing {}",
                wasm_path.display()
            )));
        }

        // state.json is optional; absent = enabled (default true).
        let enabled = fs::read_to_string(dir.join(STATE_FILE))
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| v.get("enabled").and_then(|e| e.as_bool()))
            .unwrap_or(true);

        Ok(Some(InstalledExtension {
            manifest,
            wasm_path,
            enabled,
            kv_path: dir.join(STORAGE_FILE),
        }))
    }

    /// Installs a local `.wasm` module: validates it through a live instance,
    /// derives the manifest from its `meta` response, validates that, writes
    /// `manifest.json` + `source.wasm` (+ `state.json`) under `root/<id>/` and
    /// registers it as enabled. Fails with `Invoke("already installed: …")`
    /// when the id is taken (upgrades are Phase 3).
    pub fn install_from_file(&mut self, wasm_path: &Path) -> ExtResult<ExtensionInfo> {
        self.install_from_file_with_hosts(wasm_path, None)
    }

    /// Like [`install_from_file`](Self::install_from_file), but `hosts`
    /// (from the trusted repo index) overrides the permissions the wasm
    /// declares in its `meta` response. `None` falls back to the wasm's own
    /// (filtered) meta permissions.
    pub fn install_from_file_with_hosts(
        &mut self,
        wasm_path: &Path,
        hosts: Option<&[String]>,
    ) -> ExtResult<ExtensionInfo> {
        let bytes = fs::read(wasm_path).map_err(|e| {
            ExtensionError::Load(format!("read {}: {e}", wasm_path.display()))
        })?;

        // Live instance first: parse/link/instantiate + fuel/memory limits run
        // before anything is trusted from the module.
        let mut inst = ExtensionInstance::new(&bytes, HostOptions::default())?;
        // Raw meta value captured *before* deserialization: the wasm may carry
        // a `permissions` object that `SourceMeta` itself does not model.
        let data = inst.raw_invoke(Method::Meta, json!({}))?;
        let meta: SourceMeta = super::abi::meta_from_value(&data)?;
        let permissions = match hosts {
            // Index override wins: the index is trusted, the wasm is not.
            Some(h) => ExtensionPermissions { hosts: h.to_vec() },
            None => permissions_from_meta(&data),
        };
        let manifest = ExtensionManifest {
            permissions,
            ..ExtensionManifest::from_meta(&meta)
        };
        manifest.validate()?;

        let id = manifest.id.clone();
        if self.installed.contains_key(&id) || self.root.join(&id).exists() {
            return Err(ExtensionError::Invoke(format!("already installed: {id}")));
        }

        let dir = self.root.join(&id);
        fs::create_dir_all(&dir).map_err(|e| {
            ExtensionError::Load(format!("create {}: {e}", dir.display()))
        })?;

        let wasm_out = dir.join(WASM_FILE);
        let manifest_out = dir.join(MANIFEST_FILE);
        let state_out = dir.join(STATE_FILE);
        let kv_path = dir.join(STORAGE_FILE);

        let manifest_json = serde_json::to_string_pretty(&manifest)
            .map_err(|e| ExtensionError::Malformed(format!("encode manifest: {e}")))?;
        let state_json = serde_json::to_string_pretty(&json!({ "enabled": true }))
            .map_err(|e| ExtensionError::Malformed(format!("encode state: {e}")))?;

        write_atomic(&wasm_out, &bytes).map_err(|e| {
            ExtensionError::Load(format!("write {}: {e}", wasm_out.display()))
        })?;
        write_atomic(&manifest_out, manifest_json.as_bytes()).map_err(|e| {
            ExtensionError::Malformed(format!("write {}: {e}", manifest_out.display()))
        })?;
        write_atomic(&state_out, state_json.as_bytes()).map_err(|e| {
            ExtensionError::Malformed(format!("write {}: {e}", state_out.display()))
        })?;

        let installed = InstalledExtension {
            manifest,
            wasm_path: wasm_out,
            enabled: true,
            kv_path,
        };
        let info = ExtensionInfo::from(&installed);
        self.installed.insert(id, installed);
        Ok(info)
    }

    /// Uninstalls `id`: deletes `root/<id>` entirely and drops it from the
    /// map. Deleting the directory first means a failed removal leaves the
    /// extension registered.
    pub fn remove(&mut self, id: &str) -> ExtResult<()> {
        if !self.installed.contains_key(id) {
            return Err(ExtensionError::Invoke(format!("not installed: {id}")));
        }
        let dir = self.root.join(id);
        match fs::remove_dir_all(&dir) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => {
                return Err(ExtensionError::Load(format!(
                    "remove {}: {e}",
                    dir.display()
                )))
            }
        }
        self.installed.remove(id);
        Ok(())
    }

    /// Flips the enabled flag. Persisted in `state.json` (the manifest file
    /// stays immutable); `load_all` re-reads it, defaulting to `true`.
    pub fn set_enabled(&mut self, id: &str, enabled: bool) -> ExtResult<()> {
        let Some(entry) = self.installed.get_mut(id) else {
            return Err(ExtensionError::Invoke(format!("not installed: {id}")));
        };
        let state_out = self.root.join(id).join(STATE_FILE);
        let state_json = serde_json::to_string_pretty(&json!({ "enabled": enabled }))
            .map_err(|e| ExtensionError::Malformed(format!("encode state: {e}")))?;
        write_atomic(&state_out, state_json.as_bytes()).map_err(|e| {
            ExtensionError::Malformed(format!("write {}: {e}", state_out.display()))
        })?;
        entry.enabled = enabled;
        Ok(())
    }

    /// All installed extensions, sorted by id (deterministic).
    pub fn list(&self) -> Vec<ExtensionInfo> {
        let mut infos: Vec<ExtensionInfo> =
            self.installed.values().map(ExtensionInfo::from).collect();
        infos.sort_by(|a, b| a.id.cmp(&b.id));
        infos
    }

    pub fn get(&self, id: &str) -> Option<&InstalledExtension> {
        self.installed.get(id)
    }
}

/// Atomic-ish write: write `path.part`, then rename over `path` (same
/// directory ⇒ same filesystem, so rename is atomic).
fn write_atomic(path: &Path, contents: &[u8]) -> io::Result<()> {
    let name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no file name"))?;
    let part = path.with_file_name(format!("{}.part", name.to_string_lossy()));
    fs::write(&part, contents)?;
    fs::rename(&part, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extensions::runtime::{ExtensionInstance, HostOptions};
    use crate::extensions::test_wasm;
    use crate::extensions::ExtensionError;

    #[test]
    fn install_list_disable_reload_remove_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("exts");
        let wasm_file = tmp.path().join("hello.wasm");
        fs::write(&wasm_file, test_wasm::hello()).unwrap();

        let mut m = ExtensionManager::new(root.clone());
        // Fresh root scans clean.
        assert!(m.load_all().unwrap().is_empty());

        // Install.
        let info = m.install_from_file(&wasm_file).expect("hello module installs");
        assert_eq!(info.id, "hello.test");
        assert!(info.enabled);
        assert_eq!(info.content_type, crate::sources::ContentType::Book);

        assert_eq!(m.list().len(), 1);
        let installed = m.get("hello.test").expect("present after install");
        assert!(installed.enabled);
        assert_eq!(installed.wasm_path, root.join("hello.test").join(WASM_FILE));
        assert_eq!(installed.kv_path, root.join("hello.test").join(STORAGE_FILE));
        assert!(installed.wasm_path.exists());
        assert!(root.join("hello.test").join(MANIFEST_FILE).exists());

        // Duplicate install is rejected with the documented error.
        let err = m.install_from_file(&wasm_file).expect_err("dup install must fail");
        assert!(matches!(err, ExtensionError::Invoke(_)), "got {err}");
        assert!(err.to_string().contains("already installed: hello.test"));

        // Disable persists into state.json.
        m.set_enabled("hello.test", false).unwrap();
        assert!(!m.get("hello.test").unwrap().enabled);
        let state = fs::read_to_string(root.join("hello.test").join(STATE_FILE)).unwrap();
        let state_value: serde_json::Value = serde_json::from_str(&state).unwrap();
        assert_eq!(state_value["enabled"], json!(false));

        // Simulated restart: a fresh manager reloads persisted state.
        let mut m2 = ExtensionManager::new(root.clone());
        let listed = m2.load_all().unwrap();
        assert_eq!(listed.len(), 1);
        assert!(!m2.get("hello.test").unwrap().enabled, "disabled state must survive reload");
        assert_eq!(m2.get("hello.test").unwrap().manifest.name, "Hello WASM");

        // Unknown ids error on both paths.
        assert!(m.set_enabled("nope", true).is_err());
        assert!(m.remove("nope").is_err());

        // Remove: map empty and directory gone.
        m.remove("hello.test").unwrap();
        assert!(m.list().is_empty());
        assert!(m.get("hello.test").is_none());
        assert!(!root.join("hello.test").exists(), "extension dir must be deleted");
    }

    #[test]
    fn load_all_skips_invalid_dirs_without_failing() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("exts");
        // Directory with wasm but no manifest.json.
        fs::create_dir_all(root.join("junk")).unwrap();
        fs::write(root.join("junk").join(WASM_FILE), b"not wasm").unwrap();
        // Directory with a manifest that is missing required fields.
        fs::create_dir_all(root.join("half")).unwrap();
        fs::write(root.join("half").join(MANIFEST_FILE), r#"{"id":"half"}"#).unwrap();
        // Valid install that must survive the scan.
        let wasm_file = tmp.path().join("hello.wasm");
        fs::write(&wasm_file, test_wasm::hello()).unwrap();
        let mut m = ExtensionManager::new(root.clone());
        m.install_from_file(&wasm_file).unwrap();

        let listed = m.load_all().unwrap();
        assert_eq!(listed.len(), 1, "invalid dirs must be skipped: {listed:?}");
        assert_eq!(listed[0].id, "hello.test");
    }

    /// KV persistence end-to-end through the host: a value set by one
    /// instance (flushing on every `host_kv_set`) is visible to a fresh
    /// instance over the same `storage.json` path.
    #[test]
    fn kv_persists_to_storage_json_across_instances() {
        let tmp = tempfile::tempdir().unwrap();
        let storage = tmp.path().join("kv.test").join(STORAGE_FILE);
        // The manager creates root/<id>/ before any instance runs; mirror that.
        fs::create_dir_all(storage.parent().unwrap()).unwrap();
        let wasm = test_wasm::kv_roundtrip();
        let opts = || HostOptions {
            kv_path: Some(storage.clone()),
            ..HostOptions::default()
        };

        let mut writer = ExtensionInstance::new(&wasm, opts()).expect("kv module loads");
        let data = writer.raw_invoke(Method::Meta, json!({})).expect("ok envelope");
        assert_eq!(data["value"], json!("hello-val"));
        drop(writer); // durability doesn't rely on Drop — flush ran on set

        assert!(storage.exists(), "storage.json must exist after host_kv_set");
        let on_disk: HashMap<String, String> =
            serde_json::from_str(&fs::read_to_string(&storage).unwrap()).unwrap();
        assert_eq!(on_disk.get("hello-key").map(String::as_str), Some("hello-val"));

        // Fresh instance over the persisted file sees the value.
        let mut reader = ExtensionInstance::new(&wasm, opts()).expect("kv module reloads");
        let data = reader.raw_invoke(Method::Meta, json!({})).expect("ok envelope");
        assert_eq!(data["value"], json!("hello-val"), "value must survive reload");
    }

    /// The manager hands each extension its own storage path — assert the
    /// path an install produces is where instances will persist.
    #[test]
    fn installed_extension_exposes_storage_path() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("exts");
        let wasm_file = tmp.path().join("hello.wasm");
        fs::write(&wasm_file, test_wasm::hello()).unwrap();

        let mut m = ExtensionManager::new(root.clone());
        m.install_from_file(&wasm_file).unwrap();
        assert_eq!(
            m.get("hello.test").unwrap().kv_path,
            root.join("hello.test").join("storage.json")
        );
    }

    #[test]
    fn permissions_from_meta_parses_bare_hosts_and_normalizes_scheme() {
        let v = json!({
            "permissions": {
                "hosts": ["api.example.com", "example.org"]
            }
        });
        let p = permissions_from_meta(&v);
        assert_eq!(p.hosts, ["https://api.example.com", "https://example.org"]);
    }

    #[test]
    fn permissions_from_meta_missing_or_malformed_is_deny_all() {
        // No permissions object at all.
        assert!(permissions_from_meta(&json!({})).hosts.is_empty());
        // Permissions without hosts.
        assert!(permissions_from_meta(&json!({"permissions": {}})).hosts.is_empty());
        // Hosts not an array.
        assert!(permissions_from_meta(&json!({"permissions": {"hosts": "a.com"}})).hosts.is_empty());
        // Entries that are not strings.
        assert!(permissions_from_meta(&json!({"permissions": {"hosts": [1, null]}})).hosts.is_empty());
    }

    #[test]
    fn permissions_from_meta_filters_malformed_entries() {
        let v = json!({
            "permissions": {
                "hosts": [
                    "api.example.com", // valid → kept
                    "",                // empty → dropped
                    "   ",             // whitespace-only → dropped
                    "https://x.com",   // scheme (':', '/') → dropped
                    "a.com/path",      // '/' → dropped
                    "a.com:8080",      // ':' → dropped
                    "a b.com",         // space → dropped
                    "exa\nmple.com"    // newline → dropped
                ]
            }
        });
        let p = permissions_from_meta(&v);
        assert_eq!(p.hosts, ["https://api.example.com"], "only valid bare hosts survive");
    }

    #[test]
    fn install_from_file_keeps_deny_all_when_meta_has_no_permissions() {
        let tmp = tempfile::tempdir().unwrap();
        let wasm_file = tmp.path().join("hello.wasm");
        fs::write(&wasm_file, test_wasm::hello()).unwrap();

        let mut m = ExtensionManager::new(tmp.path().join("exts"));
        let info = m.install_from_file(&wasm_file).unwrap();
        assert!(
            info.permissions.hosts.is_empty(),
            "wasm meta without permissions must stay deny-all"
        );
    }

    #[test]
    fn install_from_file_with_hosts_applies_override() {
        let tmp = tempfile::tempdir().unwrap();
        let wasm_file = tmp.path().join("hello.wasm");
        fs::write(&wasm_file, test_wasm::hello()).unwrap();

        let mut m = ExtensionManager::new(tmp.path().join("exts"));
        let hosts = vec!["https://index.example.test".to_string()];
        let info = m
            .install_from_file_with_hosts(&wasm_file, Some(&hosts))
            .unwrap();
        assert_eq!(info.permissions.hosts, hosts, "index override wins over wasm meta");
    }
}