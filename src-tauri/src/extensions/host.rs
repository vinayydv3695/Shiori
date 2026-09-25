//! Host functions available to extensions under the `shiori` import module.
//!
//! All five are registered for every instance. They share a single buffer
//! convention with `invoke`: **a returned `i32` is a pointer into the
//! extension's linear memory where the first 4 bytes are a little-endian
//! length followed by that many JSON bytes**. Pointer-returning host
//! functions answer with the same envelope as the extension itself:
//! `{ "ok": true, "data": ... }` / `{ "ok": false, "error": { kind, message } }`
//! (so an extension may passthrough a host result verbatim).
//!
//! Host functions NEVER trust extension input: every (ptr, len) is bounds
//! checked against linear memory before use, and string/value caps are
//! enforced host-side.
//!
//! # `http_fetch` (Phase 3 stub)
//!
//! Request JSON (written by the extension into memory):
//! ```json
//! { "url": "https://…", "method": "GET", "headers": { "k": "v" }, "body": null }
//! ```
//! Response JSON the host will return on success (Phase 3):
//! ```json
//! { "ok": true, "data": { "status": 200, "headers": { "k": "v" }, "body": "" } }
//! ```
//! Phase 1 never performs a network call: unless the request URL is covered
//! by the instance allowlist ([`HostEnv::http_allowlist`], exact-prefix match)
//! it returns `error.kind = "http_disabled"`; if the URL *is* allowlisted it
//! returns `error.kind = "http_not_implemented"` (the fetch will be wired in
//! Phase 3). The allowlist lives on the instance state so per-source
//! `permissions.hosts` from the manifest (Phase 2) can feed it.

use std::fs;
use std::io;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use wasmi::{Caller, Linker, Memory, Val};

use super::runtime::InstanceState;
use super::ExtensionError;

/// Longest key accepted by `host_kv_set`/`host_kv_get`.
pub const KV_MAX_KEY_BYTES: usize = 256;
/// Longest single value accepted by `host_kv_set`.
pub const KV_MAX_VALUE_BYTES: usize = 64 * 1024;
/// Total (keys + values) cap for the per-instance KV store.
pub const KV_MAX_TOTAL_BYTES: usize = 1024 * 1024;
/// Cap on what an extension may pass to `host_log`.
const LOG_MAX_MESSAGE_BYTES: usize = 4096;

/// Per-instance host sidecar.
#[derive(Debug, Default)]
pub struct HostEnv {
    /// Phase 2A: in-memory KV, optionally file-backed via
    /// [`HostEnv::load_from`] / [`HostEnv::flush`] (`storage.json`). When
    /// `kv_path` is `None` the store is in-memory only (Phase 1 behavior).
    pub kv: std::collections::HashMap<String, String>,
    /// Hosts permitted for `http_fetch` (empty = disabled). Exact-prefix match.
    pub http_allowlist: Vec<String>,
    /// On-disk `storage.json` location for this extension, when file-backed.
    pub kv_path: Option<std::path::PathBuf>,
}

impl HostEnv {
    /// Loads the on-disk KV store at `path` into memory and points `kv_path`
    /// at it. A missing file is a fresh empty store; a corrupt file is warned
    /// about and reset to empty (never kills an otherwise healthy instance).
    pub fn load_from(&mut self, path: &Path) -> Result<(), ExtensionError> {
        self.kv_path = Some(path.to_path_buf());
        match fs::read(path) {
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(ExtensionError::Kv(format!("read {path:?}: {e}"))),
            Ok(bytes) => match serde_json::from_slice::<std::collections::HashMap<String, String>>(&bytes) {
                Ok(map) => {
                    self.kv = map;
                    Ok(())
                }
                Err(e) => {
                    log::warn!("extension kv storage {path:?} is corrupt ({e}); starting empty");
                    self.kv.clear();
                    Ok(())
                }
            },
        }
    }

    /// Persists the in-memory KV to `kv_path` (atomic-ish: `.part` + rename).
    /// No-op when this instance is in-memory only (`kv_path` unset).
    pub fn flush(&self) -> Result<(), ExtensionError> {
        let Some(path) = &self.kv_path else {
            return Ok(());
        };
        let json = serde_json::to_string(&self.kv)
            .map_err(|e| ExtensionError::Kv(format!("encode kv: {e}")))?;
        let name = path.file_name().ok_or_else(|| {
            ExtensionError::Kv("kv_path has no file name".to_string())
        })?;
        let part = path.with_file_name(format!("{}.part", name.to_string_lossy()));
        fs::write(&part, json)
            .and_then(|_| fs::rename(&part, path))
            .map_err(|e| ExtensionError::Kv(format!("write {path:?}: {e}")))
    }
}

/// Registers every `shiori.*` host import on the linker.
pub fn register_host_functions(
    linker: &mut Linker<InstanceState>,
) -> Result<(), wasmi::errors::LinkerError> {
    linker.func_wrap("shiori", "host_log", |mut caller: Caller<'_, InstanceState>, level: i32, ptr: i32, len: i32| {
        host_log_impl(&mut caller, level, ptr, len);
    })?;
    linker.func_wrap("shiori", "host_now_ms", || -> i64 { host_now_ms_impl() })?;
    linker.func_wrap(
        "shiori",
        "host_kv_get",
        |mut caller: Caller<'_, InstanceState>, key_ptr: i32, key_len: i32| -> i32 {
            host_kv_get_impl(&mut caller, key_ptr, key_len)
        },
    )?;
    linker.func_wrap(
        "shiori",
        "host_kv_set",
        |mut caller: Caller<'_, InstanceState>, key_ptr: i32, key_len: i32, val_ptr: i32, val_len: i32| -> i32 {
            host_kv_set_impl(&mut caller, key_ptr, key_len, val_ptr, val_len)
        },
    )?;
    linker.func_wrap(
        "shiori",
        "host_http_fetch",
        |mut caller: Caller<'_, InstanceState>, req_ptr: i32, req_len: i32| -> i32 {
            host_http_fetch_impl(&mut caller, req_ptr, req_len)
        },
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

/// `host_log(level: i32, ptr: i32, len: i32) -> ()`.
fn host_log_impl(caller: &mut Caller<'_, InstanceState>, level: i32, ptr: i32, len: i32) {
    let mut msg = read_str(caller, ptr, len).unwrap_or_else(|_| "<invalid log string>".into());
    if msg.len() > LOG_MAX_MESSAGE_BYTES {
        msg.truncate(LOG_MAX_MESSAGE_BYTES);
        msg.push_str("…<truncated>");
    }
    match level {
        -1 | 0 => log::error!("[extension] {}", msg),
        1 => log::warn!("[extension] {}", msg),
        2 => log::info!("[extension] {}", msg),
        _ => log::debug!("[extension] {}", msg),
    }
}

/// `host_now_ms() -> i64` — unix epoch milliseconds (cache-busting).
fn host_now_ms_impl() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// `host_kv_get(key_ptr, key_len) -> ptr` — returns a length-prefixed JSON
/// envelope: `{ "ok": true, "data": { "value": "…" } }` when present,
/// `{ "ok": true, "data": null }` when absent.
fn host_kv_get_impl(caller: &mut Caller<'_, InstanceState>, key_ptr: i32, key_len: i32) -> i32 {
    let key = match read_str(caller, key_ptr, key_len) {
        Ok(k) => k,
        Err(e) => return return_error(caller, "kv", &e.to_string()),
    };
    if key.len() > KV_MAX_KEY_BYTES {
        return return_error(caller, "kv", &format!("key exceeds {KV_MAX_KEY_BYTES} bytes"));
    }
    let value = caller.data().env.kv.get(&key).cloned();
    let json = match value {
        Some(v) => format!(r#"{{"ok":true,"data":{{"value":{}}}}}"#, json_string(&v)),
        None => r#"{"ok":true,"data":null}"#.to_string(),
    };
    return_json(caller, &json).unwrap_or_else(|| return_error(caller, "kv", "cannot write result"))
}

/// `host_kv_set(key_ptr, key_len, val_ptr, val_len) -> i32`.
/// Returns `0` on success, `1` when a size cap is exceeded, `2` on invalid
/// arguments (negative/out-of-bounds pointers).
fn host_kv_set_impl(
    caller: &mut Caller<'_, InstanceState>,
    key_ptr: i32,
    key_len: i32,
    val_ptr: i32,
    val_len: i32,
) -> i32 {
    let key = match read_str(caller, key_ptr, key_len).map_err(arg_fail) {
        Ok(k) => k,
        Err(code) => return code,
    };
    let value = match read_str(caller, val_ptr, val_len).map_err(arg_fail) {
        Ok(v) => v,
        Err(code) => return code,
    };
    if key.len() > KV_MAX_KEY_BYTES || value.len() > KV_MAX_VALUE_BYTES {
        return 1;
    }
    // Total cap = sum of current keys+values, minus what we may overwrite.
    let existing_len = caller
        .data()
        .env
        .kv
        .get(&key)
        .map_or(0, |v| key.len() + v.len());
    let total: usize = caller
        .data()
        .env
        .kv
        .iter()
        .map(|(k, v)| k.len() + v.len())
        .sum();
    if total.saturating_sub(existing_len).saturating_add(key.len() + value.len()) > KV_MAX_TOTAL_BYTES
    {
        return 1;
    }
    caller.data_mut().env.kv.insert(key, value);
    // Phase 2A: persist every write to the extension's `storage.json`.
    if let Err(e) = caller.data().env.flush() {
        log::warn!("[extension] kv flush failed: {e}");
        return 1;
    }
    0
}

/// `host_http_fetch(req_ptr, req_len) -> ptr` — see the module docs. Phase 1
/// never touches the network; it answers with a structured error envelope.
fn host_http_fetch_impl(caller: &mut Caller<'_, InstanceState>, req_ptr: i32, req_len: i32) -> i32 {
    let req = match read_str(caller, req_ptr, req_len) {
        Ok(r) => r,
        Err(e) => return return_error(caller, "http", &e.to_string()),
    };
    let url = serde_json::from_str::<serde_json::Value>(&req)
        .ok()
        .and_then(|v| {
            v.get("url")
                .and_then(|u| u.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "<unparseable request>".to_string());

    let allowed = url_allowed(&caller.data().env.http_allowlist, &url);
    let envelope = if allowed {
        // Allowlist matched — Phase 3 will perform the real fetch here.
        format!(
            r#"{{"ok":false,"error":{{"kind":"http_not_implemented","message":"http fetch for {url} is allowlisted but not yet implemented (Phase 3)"}}}}"#
        )
    } else {
        format!(
            r#"{{"ok":false,"error":{{"kind":"http_disabled","message":"http fetch disabled: {url} is not in this extension's host allowlist"}}}}"#
        )
    };
    return_json(caller, &envelope).unwrap_or_else(|| return_error(caller, "http", "cannot write result"))
}

/// Exact-prefix allowlist match against host strings (e.g.
/// `"https://api.example.com"` covers `"https://api.example.com/v1/…"`).
fn url_allowed(allowlist: &[String], url: &str) -> bool {
    allowlist.iter().any(|host| url.starts_with(host))
}

// ---------------------------------------------------------------------------
// Shared memory / JSON helpers
// ---------------------------------------------------------------------------

/// Reads `len` bytes at `ptr` as UTF-8. Returns `ExtensionError::Malformed`
/// for any out-of-bounds or invalid input.
fn read_str(caller: &Caller<'_, InstanceState>, ptr: i32, len: i32) -> Result<String, ExtensionError> {
    if ptr < 0 || len < 0 {
        return Err(ExtensionError::Malformed("negative ptr/len".into()));
    }
    let memory = get_memory(caller)?;
    let size = memory.data_size(caller);
    let start = ptr as usize;
    let end = start.checked_add(len as usize).ok_or_else(|| {
        ExtensionError::Malformed("ptr + len overflow".into())
    })?;
    if end > size {
        return Err(ExtensionError::Malformed(format!(
            "extension passed out-of-bounds range [{start}, {end}) > {size}"
        )));
    }
    let mut buf = vec![0u8; len as usize];
    memory
        .read(caller, start, &mut buf)
        .map_err(|e| ExtensionError::Malformed(format!("oob read: {e}")))?;
    String::from_utf8(buf).map_err(|e| ExtensionError::Malformed(format!("not utf-8: {e}")))
}

fn get_memory(caller: &Caller<'_, InstanceState>) -> Result<Memory, ExtensionError> {
    caller
        .get_export("memory")
        .and_then(|e| e.into_memory())
        .ok_or_else(|| ExtensionError::Malformed("no `memory` export on caller".into()))
}

/// Returns a length-prefixed JSON error envelope
/// `{ "ok": false, "error": { "kind": k, "message": m } }`.
fn return_error(caller: &mut Caller<'_, InstanceState>, kind: &str, message: &str) -> i32 {
    let json = format!(
        r#"{{"ok":false,"error":{{"kind":{},"message":{}}}}}"#,
        json_string(kind),
        json_string(message)
    );
    return_json(caller, &json).unwrap_or(-1)
}

/// Allocates a buffer via the extension's exported `alloc`, writes the
/// 4-byte length prefix + `json` payload, and returns the buffer pointer.
/// `None` when the extension cannot allocate (no `alloc` export, trap, OOB).
fn return_json(caller: &mut Caller<'_, InstanceState>, json: &str) -> Option<i32> {
    let alloc = caller.get_export("alloc")?.into_func()?;
    let bytes = json.as_bytes();
    let mut out = [Val::I32(0)];
    if alloc
        .call(&mut *caller, &[Val::I32((bytes.len() + 4) as i32)], &mut out)
        .is_err()
    {
        return None;
    }
    let ptr = out[0].i32()?;
    if ptr < 0 {
        return None;
    }
    let memory = get_memory(&*caller).ok()?;
    let start = ptr as usize;
    let size = memory.data_size(&*caller);
    if start + 4 + bytes.len() > size {
        return None;
    }
    let len32 = (bytes.len() as u32).to_le_bytes();
    if memory.write(&mut *caller, start, &len32).is_err() {
        return None;
    }
    if memory.write(&mut *caller, start + 4, bytes).is_err() {
        return None;
    }
    Some(ptr)
}

/// JSON-escapes a plain string into a JSON string literal.
fn json_string(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"<unencodable>\"".to_string())
}

/// Maps a read failure to the `host_kv_set` return-code convention.
fn arg_fail(_: ExtensionError) -> i32 {
    2
}