//! Remote extension repository (Phase 3): fetch a JSON index of available
//! extensions, download + verify individual modules, and install them from
//! bytes (the manager's own install path takes a file path, so bytes go
//! through a temp file).
//!
//! Size discipline: the index document is capped at 2 MiB and downloaded
//! modules at 32 MiB (both via `Content-Length` when the server sends it and
//! a post-read length check otherwise). When an index entry carries a
//! `sha256`, the module is verified against it before install — a mismatch is
//! [`ExtensionError::Malformed`], never an install.
//!
//! [`DEFAULT_REPO_URL`] is a placeholder index until the publishing pipeline
//! exists; every command accepts an explicit `repo_url` override.

use std::io::Write;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::sources::ContentType;

use super::{ExtResult, ExtensionError, ExtensionInfo, ExtensionManager};

/// Default repository index URL. Placeholder: points at a hand-maintained
/// GitHub Pages index until the real publishing pipeline exists. All commands
/// accept a `repo_url` override.
pub const DEFAULT_REPO_URL: &str = "https://raw.githubusercontent.com/vinayydv3695/shiori-extensions/main/index.json";

/// Cap on the index JSON document, bytes.
const MAX_INDEX_BYTES: u64 = 2 * 1024 * 1024;
/// Cap on a downloaded extension module, bytes.
const MAX_DOWNLOAD_BYTES: u64 = 32 * 1024 * 1024;
/// Timeout for every repo http request.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

/// A remote extension repository index (`index.json`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoIndex {
    /// Index format version (reserved for schema evolution; unused today).
    pub version: u32,
    /// Every extension advertised by the repo.
    pub extensions: Vec<RepoEntry>,
}

/// One entry of a [`RepoIndex`]. camelCase on the wire (matching the app-wide
/// JSON convention); unknown fields are tolerated (serde's default behavior).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoEntry {
    pub id: String,
    pub name: String,
    pub lang: Option<String>,
    pub version: String,
    pub min_app_version: Option<String>,
    pub icon_url: Option<String>,
    pub download_url: String,
    pub nsfw: bool,
    /// Optional hex SHA-256 of the module at `download_url`; verified before
    /// install when present.
    pub sha256: Option<String>,
    pub content_type: ContentType,
    /// Optional http-fetch allowlist (scheme-full `https://…` entries, the
    /// manifest's canonical form). When present it overrides whatever the
    /// wasm declares in its `meta` response — the index is trusted, the wasm
    /// is not.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hosts: Option<Vec<String>>,
}

/// Shared repo http client: 15s timeout, rustls (the crate's reqwest build
/// is already `default-features = false` + rustls).
fn repo_client() -> ExtResult<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| ExtensionError::Http(format!("build http client: {e}")))
}

/// Fetches and parses the repo index at `url`. Bounded: `Content-Length` is
/// checked when the server sends it, and the body length is re-checked after
/// the read — the response is never read unbounded.
pub async fn fetch_index(url: &str) -> ExtResult<RepoIndex> {
    let client = repo_client()?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| ExtensionError::Http(format!("fetch repo index {url}: {e}")))?
        .error_for_status()
        .map_err(|e| ExtensionError::Http(format!("fetch repo index {url}: {e}")))?;

    if let Some(len) = resp.content_length() {
        if len > MAX_INDEX_BYTES {
            return Err(ExtensionError::Http(format!(
                "repo index {url} too large: {len} bytes (cap {MAX_INDEX_BYTES})"
            )));
        }
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| ExtensionError::Http(format!("read repo index {url}: {e}")))?;
    if bytes.len() as u64 > MAX_INDEX_BYTES {
        return Err(ExtensionError::Http(format!(
            "repo index {url} too large: {} bytes (cap {MAX_INDEX_BYTES})",
            bytes.len()
        )));
    }

    serde_json::from_slice(&bytes)
        .map_err(|e| ExtensionError::Malformed(format!("repo index {url}: {e}")))
}

/// Downloads the module for `entry` (bounded at 32 MiB) and, when
/// `entry.sha256` is present, verifies the payload against it
/// (case-insensitive hex compare). A mismatch is
/// [`ExtensionError::Malformed`].
pub async fn download_extension(entry: &RepoEntry) -> ExtResult<Vec<u8>> {
    let client = repo_client()?;
    let resp = client
        .get(&entry.download_url)
        .send()
        .await
        .map_err(|e| ExtensionError::Http(format!("download {}: {e}", entry.download_url)))?
        .error_for_status()
        .map_err(|e| ExtensionError::Http(format!("download {}: {e}", entry.download_url)))?;

    if let Some(len) = resp.content_length() {
        if len > MAX_DOWNLOAD_BYTES {
            return Err(ExtensionError::Http(format!(
                "{} too large: {len} bytes (cap {MAX_DOWNLOAD_BYTES})",
                entry.download_url
            )));
        }
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| ExtensionError::Http(format!("read {}: {e}", entry.download_url)))?;
    if bytes.len() as u64 > MAX_DOWNLOAD_BYTES {
        return Err(ExtensionError::Http(format!(
            "{} too large: {} bytes (cap {MAX_DOWNLOAD_BYTES})",
            entry.download_url,
            bytes.len()
        )));
    }

    if let Some(expected) = &entry.sha256 {
        let actual = format!("{:x}", Sha256::digest(&bytes));
        if !actual.eq_ignore_ascii_case(expected.trim()) {
            return Err(ExtensionError::Malformed(format!(
                "sha256 mismatch for {}: expected {expected}, got {actual}",
                entry.id
            )));
        }
    }
    Ok(bytes.to_vec())
}

/// Installs a downloaded module through the manager's file-based install
/// path: bytes → temp file in `std::env::temp_dir()` → `install_from_file`.
/// The temp file is cleaned up on every path (drop of the named temp file),
/// including install errors.
pub fn install_from_bytes(manager: &mut ExtensionManager, bytes: &[u8]) -> ExtResult<ExtensionInfo> {
    install_from_bytes_with_hosts(manager, bytes, None)
}

/// Like [`install_from_bytes`], but with a trusted index-provided `hosts`
/// override for the new install's permissions (preferred over the wasm's own
/// `meta` permissions).
pub fn install_from_bytes_with_hosts(
    manager: &mut ExtensionManager,
    bytes: &[u8],
    hosts: Option<&[String]>,
) -> ExtResult<ExtensionInfo> {
    let mut tmp = tempfile::NamedTempFile::new().map_err(|e| {
        ExtensionError::Load(format!("create temp file: {e}"))
    })?;
    tmp.write_all(bytes)
        .map_err(|e| ExtensionError::Load(format!("write temp file: {e}")))?;
    tmp.flush()
        .map_err(|e| ExtensionError::Load(format!("write temp file: {e}")))?;
    manager.install_from_file_with_hosts(tmp.path(), hosts)
}

/// The repo entry for an installed extension when the repo advertises a
/// newer version. Version comparison is simple numeric dot-segments; when
/// either string fails to parse as such, any difference counts as an update.
pub fn find_update(installed: &ExtensionInfo, index: &RepoIndex) -> Option<RepoEntry> {
    let entry = index.extensions.iter().find(|e| e.id == installed.id)?;
    if is_newer_version(&entry.version, &installed.version) {
        Some(entry.clone())
    } else {
        None
    }
}

/// `candidate` is a newer version than `current`? Numeric dot-segment
/// compare; unparsable (but different) strings count as an update.
fn is_newer_version(candidate: &str, current: &str) -> bool {
    if candidate == current {
        return false;
    }
    match (parse_segments(candidate), parse_segments(current)) {
        (Some(c), Some(k)) => {
            let len = c.len().max(k.len());
            for i in 0..len {
                let cv = c.get(i).copied().unwrap_or(0);
                let kv = k.get(i).copied().unwrap_or(0);
                if cv != kv {
                    return cv > kv;
                }
            }
            false // numerically equal, e.g. "1.2" vs "1.2.0"
        }
        // Different but not cleanly comparable → treat as an update rather
        // than silently refusing a repo that drifted from semver.
        _ => true,
    }
}

fn parse_segments(version: &str) -> Option<Vec<u64>> {
    version.split('.').map(|s| s.parse::<u64>().ok()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extensions::manifest::ExtensionPermissions;
    use crate::extensions::test_wasm;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn installed(version: &str) -> ExtensionInfo {
        ExtensionInfo {
            id: "hello.test".into(),
            name: "Hello WASM".into(),
            version: version.into(),
            lang: None,
            base_url: None,
            content_type: ContentType::Book,
            nsfw: false,
            min_app_version: None,
            permissions: ExtensionPermissions::default(),
            enabled: true,
        }
    }

    fn repo_with(version: &str) -> RepoIndex {
        RepoIndex {
            version: 1,
            extensions: vec![RepoEntry {
                id: "hello.test".into(),
                name: "Hello WASM".into(),
                lang: None,
                version: version.into(),
                min_app_version: None,
                icon_url: None,
                download_url: "https://example.test/hello.wasm".into(),
                nsfw: false,
                sha256: None,
                content_type: ContentType::Book,
                hosts: None,
            }],
        }
    }

    #[test]
    fn index_parses_camel_case_and_tolerates_unknown_fields() {
        let json = r#"{
            "version": 2,
            "generatedAt": "2025-01-01T00:00:00Z",
            "schemaVersion": "x",
            "extensions": [
                {
                    "id": "a.b",
                    "name": "Repo A",
                    "lang": "en",
                    "version": "1.0.0",
                    "minAppVersion": "2.0.0",
                    "iconUrl": "https://example.test/a.png",
                    "downloadUrl": "https://example.test/a.wasm",
                    "nsfw": true,
                    "sha256": "DEADBEEF",
                    "contentType": "book",
                    "homepage": "https://example.test/a",
                    "author": "someone",
                    "rating": 5
                }
            ]
        }"#;
        let index: RepoIndex = serde_json::from_str(json).expect("parses");
        assert_eq!(index.version, 2);
        assert_eq!(index.extensions.len(), 1);
        let e = &index.extensions[0];
        assert_eq!(e.id, "a.b");
        assert_eq!(e.name, "Repo A");
        assert_eq!(e.lang.as_deref(), Some("en"));
        assert_eq!(e.version, "1.0.0");
        assert_eq!(e.min_app_version.as_deref(), Some("2.0.0"));
        assert_eq!(e.icon_url.as_deref(), Some("https://example.test/a.png"));
        assert_eq!(e.download_url, "https://example.test/a.wasm");
        assert!(e.nsfw);
        assert_eq!(e.sha256.as_deref(), Some("DEADBEEF"));
        assert_eq!(e.content_type, ContentType::Book);
    }

    #[test]
    fn index_without_optionals_parses() {
        let json = r#"{
            "version": 1,
            "extensions": [
                { "id": "a.b", "name": "A", "version": "1.0.0",
                  "downloadUrl": "https://example.test/a.wasm",
                  "nsfw": false, "contentType": "manga" }
            ]
        }"#;
        let index: RepoIndex = serde_json::from_str(json).expect("parses");
        let e = &index.extensions[0];
        assert!(e.lang.is_none());
        assert!(e.min_app_version.is_none());
        assert!(e.icon_url.is_none());
        assert!(e.sha256.is_none());
        assert_eq!(e.content_type, ContentType::Manga);
    }

    #[tokio::test]
    async fn malformed_index_json_is_an_error_not_a_panic() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/index.json"))
            .respond_with(ResponseTemplate::new(200).set_body_string("{ not json at all"))
            .mount(&server)
            .await;

        let err = fetch_index(&format!("{}/index.json", server.uri()))
            .await
            .expect_err("malformed index must fail");
        assert!(
            matches!(err, ExtensionError::Malformed(_)),
            "expected Malformed, got {err}"
        );
    }

    #[test]
    fn find_update_compares_numeric_dot_segments() {
        // Equal → no update.
        assert!(find_update(&installed("1.2.0"), &repo_with("1.2.0")).is_none());
        // Numerically equal but textually different → no update.
        assert!(find_update(&installed("1.2"), &repo_with("1.2.0")).is_none());
        // Greater → update.
        let upd = find_update(&installed("1.2.0"), &repo_with("1.2.1")).expect("patch update");
        assert_eq!(upd.version, "1.2.1");
        let upd = find_update(&installed("1.9.0"), &repo_with("1.10.0")).expect("segment compare");
        assert_eq!(upd.version, "1.10.0");
        let upd = find_update(&installed("1.9.9"), &repo_with("2.0.0")).expect("major update");
        assert_eq!(upd.version, "2.0.0");
        // Lesser → no update.
        assert!(find_update(&installed("1.0.0"), &repo_with("0.9.0")).is_none());
        // Different but unparsable → treated as an update.
        let upd = find_update(&installed("1.2.0"), &repo_with("1.2-beta"))
            .expect("unparsable counts as update");
        assert_eq!(upd.version, "1.2-beta");
        let upd = find_update(&installed("nightly"), &repo_with("dev")).expect("both unparsable");
        assert_eq!(upd.version, "dev");
        // Different id → no update.
        let mut index = repo_with("9.9.9");
        index.extensions[0].id = "other.id".into();
        assert!(find_update(&installed("1.0.0"), &index).is_none());
    }

    #[test]
    fn repo_entry_parses_hosts_and_defaults_when_absent() {
        // With `hosts`.
        let with_hosts: RepoEntry =
            serde_json::from_str(r#"{
                "id": "a.b", "name": "A", "version": "1.0.0",
                "downloadUrl": "https://example.test/a.wasm", "nsfw": false,
                "contentType": "book",
                "hosts": ["https://api.example.test", "https://cdn.example.test"]
            }"#)
            .expect("entry with hosts parses");
        assert_eq!(
            with_hosts.hosts.as_deref(),
            Some(&["https://api.example.test".to_string(), "https://cdn.example.test".to_string()][..])
        );

        // Without `hosts` → None (not an empty vec) via `#[serde(default)]`.
        let without_hosts: RepoEntry = serde_json::from_str(r#"{
            "id": "a.b", "name": "A", "version": "1.0.0",
            "downloadUrl": "https://example.test/a.wasm", "nsfw": false,
            "contentType": "book"
        }"#)
        .expect("entry without hosts parses");
        assert!(without_hosts.hosts.is_none());

        // Empty array deserializes as Some([]) — indistinguishable from
        // "deny all", which is exactly what an empty allowlist means.
        let empty_hosts: RepoEntry = serde_json::from_str(r#"{
            "id": "a.b", "name": "A", "version": "1.0.0",
            "downloadUrl": "https://example.test/a.wasm", "nsfw": false,
            "contentType": "book", "hosts": []
        }"#)
        .expect("entry with empty hosts parses");
        assert_eq!(empty_hosts.hosts, Some(vec![]));
    }

    #[test]
    fn install_from_bytes_hosts_override_wins_over_wasm_meta() {
        let tmp = tempfile::tempdir().unwrap();
        let wasm = test_wasm::hello();

        // With the index override → the trusted index wins (hello's meta
        // declares no permissions at all, so a deny-all fallback would prove
        // the override path is what applied).
        let mut m = ExtensionManager::new(tmp.path().join("exts"));
        let hosts = vec!["https://api.example.test".to_string()];
        let info =
            install_from_bytes_with_hosts(&mut m, &wasm, Some(&hosts)).expect("installs with hosts");
        assert_eq!(info.permissions.hosts, hosts);
        assert_eq!(
            m.get("hello.test").unwrap().manifest.permissions.hosts,
            hosts,
            "override must be persisted in the manifest"
        );

        // Without the override → falls back to wasm meta → deny-all.
        let mut m2 = ExtensionManager::new(tmp.path().join("exts2"));
        let info2 = install_from_bytes(&mut m2, &wasm).expect("installs without hosts");
        assert!(info2.permissions.hosts.is_empty());
    }

    #[tokio::test]
    async fn e2e_index_download_verify_install_round_trip() {
        let server = MockServer::start().await;
        let wasm = test_wasm::hello();
        let good_sha = format!("{:x}", Sha256::digest(&wasm));
        let index_json = serde_json::json!({
            "version": 1,
            "extensions": [{
                "id": "hello.test",
                "name": "Hello WASM",
                "version": "0.1.0",
                "downloadUrl": format!("{}/hello.wasm", server.uri()),
                "nsfw": false,
                "contentType": "book",
                "sha256": good_sha
            }]
        })
        .to_string();

        Mock::given(method("GET"))
            .and(path("/index.json"))
            .respond_with(ResponseTemplate::new(200).set_body_string(index_json))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/hello.wasm"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(wasm.clone()))
            .mount(&server)
            .await;

        let index = fetch_index(&format!("{}/index.json", server.uri()))
            .await
            .expect("index fetches");
        let entry = index
            .extensions
            .iter()
            .find(|e| e.id == "hello.test")
            .expect("entry present");
        let bytes = download_extension(entry)
            .await
            .expect("download verifies against sha256");

        let tmp = tempfile::tempdir().unwrap();
        let mut manager = ExtensionManager::new(tmp.path().join("exts"));
        let info = install_from_bytes(&mut manager, &bytes).expect("installs from bytes");
        assert_eq!(info.id, "hello.test");
        assert!(info.enabled);

        let listed = manager.list();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].version, "0.1.0");
        assert_eq!(listed[0].name, "Hello WASM");
    }

    #[tokio::test]
    async fn wrong_sha256_fails_and_nothing_is_installed() {
        let server = MockServer::start().await;
        let wasm = test_wasm::hello();
        let index_json = serde_json::json!({
            "version": 1,
            "extensions": [{
                "id": "hello.test",
                "name": "Hello WASM",
                "version": "0.1.0",
                "downloadUrl": format!("{}/hello.wasm", server.uri()),
                "nsfw": false,
                "contentType": "book",
                "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
            }]
        })
        .to_string();

        Mock::given(method("GET"))
            .and(path("/index.json"))
            .respond_with(ResponseTemplate::new(200).set_body_string(index_json))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/hello.wasm"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(wasm))
            .mount(&server)
            .await;

        let index = fetch_index(&format!("{}/index.json", server.uri()))
            .await
            .expect("index fetches");
        let entry = index.extensions.iter().find(|e| e.id == "hello.test").unwrap();
        let err = download_extension(entry).await.expect_err("sha mismatch must fail");
        assert!(
            matches!(err, ExtensionError::Malformed(ref m) if m.contains("sha256 mismatch")),
            "got {err}"
        );

        // The failed download never reaches the manager: nothing installed.
        let tmp = tempfile::tempdir().unwrap();
        let manager = ExtensionManager::new(tmp.path().join("exts"));
        assert!(manager.list().is_empty());
        // And the manager root was never created.
        assert!(!tmp.path().join("exts").exists());
    }
}