//! Acceptance tests for the *shipped* `.wasm` extension artifacts.
//!
//! These validate the built binaries in `extensions-repo/dist/` (repo root,
//! relative to `CARGO_MANIFEST_DIR/../`) against the real host runtime
//! ([`ExtensionInstance`] + `wasmi`) — the same path production uses. Fresh
//! checkouts won't have built artifacts; each one is skipped gracefully with
//! an `eprintln!` when missing or empty. A *present but broken* artifact
//! fails its test loudly: that is the acceptance gate's whole job.
//!
//! No network is ever touched: every instance is constructed with an empty
//! http allowlist, so any fetch attempt must come back as the standard
//! `http_disabled` error envelope, which also proves the host imports
//! (`shiori.*`) are wired correctly.

use std::path::{Path, PathBuf};

use serde_json::json;

use super::abi::{self, Method};
use super::runtime::{ExtensionInstance, HostOptions};
use super::ExtensionError;
use crate::sources::ContentType;

/// (artifact file, expected extension `id`, expected `contentType`).
/// The four shipped artifacts live at `extensions-repo/dist/` and are each
/// validated by their own `#[test]` below (skip gracefully when not built).

fn dist_path(file: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../extensions-repo/dist")
        .join(file)
}

/// Reads the artifact; `None` (with an `eprintln!`) when it hasn't been built.
fn load_artifact(file: &str) -> Option<Vec<u8>> {
    let path = dist_path(file);
    let Some(bytes) = std::fs::read(&path).ok() else {
        eprintln!("[artifact_tests] SKIP {file}: not built (missing {path:?})");
        return None;
    };
    if bytes.is_empty() {
        eprintln!("[artifact_tests] SKIP {file}: exists but is empty at {path:?}");
        return None;
    }
    Some(bytes)
}

/// Searches (or fetches chapters) on an instance whose http allowlist is
/// empty must surface the standard ERROR envelope (`http_disabled`), never a
/// trap / panic / unknown-import failure — proving host imports are correctly
/// wired without network.
fn assert_http_denied(
    inst: &mut ExtensionInstance,
    file: &str,
    method: Method,
    params: serde_json::Value,
) {
    let err = match inst.raw_invoke(method, params) {
        Err(e) => e,
        Ok(v) => panic!("{file}: expected http-denied error envelope, got ok: {v}"),
    };
    assert!(
        matches!(err, ExtensionError::Invoke(_)),
        "{file}: expected ERROR envelope (Invoke), got {err:?}"
    );
    let msg = err.to_string();
    assert!(
        msg.contains("http_disabled"),
        "{file}: expected http_disabled error envelope, got: {msg}"
    );
}

/// Full acceptance check for one shipped artifact:
/// instantiation, meta contract, `permissions.hosts`, http denial with an
/// empty allowlist (search; chapters only for manga).
fn validate_artifact(file: &str, expected_id: &str, expected_ct: ContentType) {
    let wasm = load_artifact(file).expect("present-but-broken artifacts must fail, not skip");
    // 5. Non-zero artifact size.
    assert!(!wasm.is_empty(), "{file}: artifact has zero size");

    // 1. Construct an instance exactly like production does.
    let mut inst = ExtensionInstance::new(&wasm, HostOptions::default())
        .unwrap_or_else(|e| panic!("{file}: instantiation failed: {e}"));

    // 2. meta must succeed and satisfy the provenance contract.
    let data = inst
        .raw_invoke(Method::Meta, json!({}))
        .unwrap_or_else(|e| panic!("{file}: meta invoke failed: {e}"));
    let meta = abi::meta_from_value(&data)
        .unwrap_or_else(|e| panic!("{file}: meta payload did not map to SourceMeta: {e}"));
    assert_eq!(meta.id, expected_id, "{file}: id mismatch");
    assert!(!meta.name.is_empty(), "{file}: empty name");
    assert!(!meta.version.is_empty(), "{file}: empty version");
    assert_eq!(meta.content_type, expected_ct, "{file}: contentType mismatch");

    // 2b. Key contract: non-empty permissions.hosts allowlist — without it
    // the extension could never fetch.
    let hosts = data["permissions"]["hosts"]
        .as_array()
        .unwrap_or_else(|| panic!("{file}: meta has no permissions.hosts array"));
    assert!(!hosts.is_empty(), "{file}: permissions.hosts must be non-empty");
    for host in hosts {
        assert!(
            host.as_str().is_some_and(|h| !h.is_empty()),
            "{file}: permissions.hosts contains a non-string/empty entry: {host}"
        );
    }

    // 3. search with an EMPTY allowlist → http-denied error envelope.
    let mut denied = ExtensionInstance::new(&wasm, HostOptions::default())
        .unwrap_or_else(|e| panic!("{file}: second instantiation failed: {e}"));
    assert_http_denied(&mut denied, file, Method::Search, json!({ "query": "test" }));

    // 4. mangadex only: chapters → the same http-denied envelope.
    if expected_ct == ContentType::Manga {
        assert_http_denied(
            &mut denied,
            file,
            Method::Chapters,
            json!({ "contentId": "00000000-0000-0000-0000-000000000000" }),
        );
    }

    eprintln!(
        "[artifact_tests] PASS {file} ({} bytes, id={}, {:?})",
        wasm.len(),
        meta.id,
        meta.content_type
    );
}

#[test]
fn mangadex_artifact() {
    validate_artifact("mangadex_extension.wasm", "mangadex_wasm", ContentType::Manga);
}

#[test]
fn open_library_artifact() {
    validate_artifact("open_library_extension.wasm", "open_library_wasm", ContentType::Book);
}

#[test]
fn internet_archive_artifact() {
    validate_artifact(
        "internet_archive_extension.wasm",
        "internet_archive_wasm",
        ContentType::Book,
    );
}

#[test]
fn torrents_csv_artifact() {
    validate_artifact("torrents_csv_extension.wasm", "torrents_csv_wasm", ContentType::Book);
}