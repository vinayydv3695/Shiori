//! Host functions available to extensions under the `shiori` import module.
//!
//! All seven are registered for every instance. They share a single buffer
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
//! # `http_fetch` (Phase 5A: real network)
//!
//! Request JSON (written by the extension into memory):
//! ```json
//! { "method": "GET" | "POST", "url": "https://…", "headers": { "k": "v" }?, "body": "…"? }
//! ```
//! (`method` defaults to `GET` when omitted; `headers`/`body` optional.)
//! Response JSON on success:
//! ```json
//! { "ok": true, "data": { "status": 200, "headers": { "k": "v" }, "body": "…" } }
//! ```
//! On failure the standard error envelope is returned with
//! `error.kind = "http"` (bad request / transport / timeout / over cap) or
//! `"http_disabled"` (the URL host is not on the instance allowlist — that
//! check happens before any network work).
//!
//! Enforced rules: `https` scheme only, unless the allowlist entry for the
//! host itself starts with `http://`; method ∈ {GET, POST}; the URL host
//! must match an allowlist entry exactly or as a subdomain (suffix) of it;
//! empty allowlist = deny all; 15 s timeout; 8 MiB response-body cap; at
//! most 5 redirects; UA `Shiori-Extension/<extension-id>`. Response headers
//! are forwarded with lowercased names and string values only (non-UTF-8
//! values are dropped). Redirect targets are **not** re-checked against the
//! allowlist. The fetch is synchronous from the host function's point of
//! view ([`block_on`] bridges to async reqwest, never called from inside an
//! async context); note the instance-level wall-clock guard
//! ([`crate::extensions::runtime::DEFAULT_TIMEOUT`]) may cut a call that
//! approaches the 15 s fetch timeout.
//!
//! # `html_select` / `json_get` (Phase 5A helpers)
//!
//! `html_select` request: `{ "html": "…", "selector": "<css>", "attr": "text"|"html"|<attr>, "limit"?: <n> }`
//! → success `{ "ok": true, "data": { "items": ["…", …] } }`. `attr`
//! defaults to `"text"` (descendant text, trimmed, joined with spaces);
//! `"html"` returns inner HTML; any other name is an attribute lookup.
//! `limit` defaults to 100 and clamps to 1000. The `html` input is capped
//! at 4 MiB; bad input yields `error.kind = "html"`.
//!
//! `json_get` request: `{ "json": "…", "pointer": "/a/b/0" }` → success
//! `{ "ok": true, "data": { "value": <json> } }`; the pointer is
//! [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901) syntax via
//! `serde_json::Value::pointer`. The `json` input is capped at 4 MiB;
//! invalid JSON or a missing pointer yields `error.kind = "json"`.

use std::fs;
use std::io;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::json;
use url::Url;
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
/// Request timeout for `host_http_fetch`.
pub const HTTP_TIMEOUT: Duration = Duration::from_secs(15);
/// Cap on the response body of `host_http_fetch`.
pub const HTTP_MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
/// Redirect cap for `host_http_fetch` (reqwest `redirect::Policy::limited`).
pub const HTTP_MAX_REDIRECTS: usize = 5;
/// Cap on the `html` string passed to `html_select`.
pub const HTML_MAX_INPUT_BYTES: usize = 4 * 1024 * 1024;
/// Cap on the `json` string passed to `json_get`.
pub const JSON_MAX_INPUT_BYTES: usize = 4 * 1024 * 1024;
/// `html_select` item limit when the request omits `limit`.
pub const HTML_DEFAULT_LIMIT: usize = 100;
/// Hard cap on `html_select` items per call.
pub const HTML_MAX_LIMIT: usize = 1000;

/// Per-instance host sidecar.
#[derive(Debug, Default)]
pub struct HostEnv {
    /// Phase 2A: in-memory KV, optionally file-backed via
    /// [`HostEnv::load_from`] / [`HostEnv::flush`] (`storage.json`). When
    /// `kv_path` is `None` the store is in-memory only (Phase 1 behavior).
    pub kv: std::collections::HashMap<String, String>,
    /// Hosts permitted for `http_fetch` (empty = disabled). Matching rules in
    /// [`url_allowed`]: exact host match or subdomain suffix of the entry's
    /// bare hostname; https-only unless the entry starts with `http://`.
    /// Fed from the manifest's `permissions.hosts` (Phase 2A) via
    /// [`HostOptions`](crate::extensions::runtime::HostOptions).
    pub http_allowlist: Vec<String>,
    /// On-disk `storage.json` location for this extension, when file-backed.
    pub kv_path: Option<std::path::PathBuf>,
    /// Extension id; used for the `Shiori-Extension/<id>` UA header.
    pub extension_id: String,
    /// Lazily-built per-instance `reqwest::Client` (rustls, no cookie jar,
    /// at most [`HTTP_MAX_REDIRECTS`] redirects). `None` until the first
    /// fetch, so instances that never fetch pay nothing to build it.
    #[doc(hidden)]
    pub http_client: Option<reqwest::Client>,
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
    linker.func_wrap(
        "shiori",
        "html_select",
        |mut caller: Caller<'_, InstanceState>, req_ptr: i32, req_len: i32| -> i32 {
            host_html_select_impl(&mut caller, req_ptr, req_len)
        },
    )?;
    linker.func_wrap(
        "shiori",
        "json_get",
        |mut caller: Caller<'_, InstanceState>, req_ptr: i32, req_len: i32| -> i32 {
            host_json_get_impl(&mut caller, req_ptr, req_len)
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

/// `host_http_fetch(req_ptr, req_len) -> ptr` — see the module docs. Phase 5A:
/// a real network call, gated by the instance allowlist (checked before any
/// network work), with a 15 s timeout, 5-redirect cap, 8 MiB body cap and
/// `Shiori-Extension/<id>` UA.
fn host_http_fetch_impl(caller: &mut Caller<'_, InstanceState>, req_ptr: i32, req_len: i32) -> i32 {
    let req = match read_str(caller, req_ptr, req_len) {
        Ok(r) => r,
        Err(e) => return return_error(caller, "http", &e.to_string()),
    };
    let parsed = match parse_fetch_request(&req) {
        Ok(p) => p,
        Err(e) => return return_error(caller, "http", &e),
    };
    let url = match Url::parse(&parsed.url) {
        Ok(u) => u,
        Err(e) => {
            return return_error(caller, "http", &format!("invalid url {:?}: {e}", parsed.url))
        }
    };
    if !url_allowed(&caller.data().env.http_allowlist, &url) {
        return return_error(
            caller,
            "http_disabled",
            &format!(
                "http fetch disabled: {} is not in this extension's host allowlist",
                parsed.url
            ),
        );
    }
    let client = match instance_client(caller) {
        Ok(c) => c,
        Err(e) => return return_error(caller, "http", &e),
    };
    let ext_id = caller.data().env.extension_id.clone();
    let envelope = match fetch_sync(&client, &parsed, &url, &ext_id) {
        Ok(outcome) => {
            let headers = outcome
                .headers
                .into_iter()
                .map(|(k, v)| (k, serde_json::Value::String(v)))
                .collect::<serde_json::Map<String, serde_json::Value>>();
            serde_json::to_string(&json!({ "ok": true, "data": {
                "status": outcome.status,
                "headers": headers,
                "body": outcome.body,
            } }))
            .unwrap_or_else(|e| {
                format!(r#"{{"ok":false,"error":{{"kind":"http","message":"encode response: {e}"}}}}"#)
            })
        }
        Err(e) => format!(
            r#"{{"ok":false,"error":{{"kind":"http","message":{}}}}}"#,
            json_string(&e)
        ),
    };
    return_json(caller, &envelope)
        .unwrap_or_else(|| return_error(caller, "http", "cannot write result"))
}

/// Parsed + validated `http_fetch` request.
#[derive(Clone, Debug, serde::Deserialize)]
struct FetchRequest {
    #[serde(default = "default_get")]
    method: String,
    url: String,
    #[serde(default)]
    headers: std::collections::HashMap<String, String>,
    #[serde(default)]
    body: Option<String>,
}

fn default_get() -> String {
    "GET".to_string()
}

/// Validates the request JSON: must be an object with a `url` string and a
/// `method` ∈ {GET, POST} (`headers`/`body` optional, headers a string map).
/// A missing `method` defaults to GET.
fn parse_fetch_request(req: &str) -> Result<FetchRequest, String> {
    let parsed: FetchRequest =
        serde_json::from_str(req).map_err(|e| format!("invalid request json: {e}"))?;
    match parsed.method.as_str() {
        "GET" | "POST" => {}
        other => return Err(format!("method must be GET or POST, got {other:?}")),
    }
    Ok(parsed)
}

/// Allowlist check: the URL's scheme + host must be covered by an entry.
///
/// An entry is either a bare hostname (https-only, e.g. `"example.test"`) or
/// a URL whose **scheme** decides the permitted scheme and whose **authority**
/// supplies the bare hostname — **ports and paths in entries are ignored; only
/// scheme + host participate**. The URL matches when `url.scheme == entry
/// scheme` and `url_host == entry_host || url_host.ends_with("." + entry_host)`
/// (so `https://cdn.example.test` matches `example.test` while
/// `https://evil-example.test` does not). An empty allowlist denies everything
/// (the safe default).
fn url_allowed(allowlist: &[String], url: &Url) -> bool {
    if allowlist.is_empty() {
        return false;
    }
    let Some(url_host) = url.host_str() else {
        return false;
    };
    let url_scheme = url.scheme();
    allowlist.iter().any(|entry| {
        let (entry_scheme, entry_host) = entry_scheme_and_host(entry);
        if entry_host.is_empty() {
            return false;
        }
        url_scheme == entry_scheme
            && (url_host == entry_host || url_host.ends_with(&format!(".{entry_host}")))
    })
}

/// Splits an allowlist entry into its (scheme, bare hostname). Entries are
/// `https://host…` / `http://host…` URLs or bare hostnames (which default to
/// https-only); ports and paths are dropped.
fn entry_scheme_and_host(entry: &str) -> (&str, &str) {
    let (scheme, rest) = if let Some(rest) = entry.strip_prefix("http://") {
        ("http", rest)
    } else if let Some(rest) = entry.strip_prefix("https://") {
        ("https", rest)
    } else {
        ("https", entry)
    };
    let host = rest
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");
    (scheme, host)
}

/// Borrows — or lazily builds — the per-instance `reqwest::Client` (rustls,
/// no cookie jar, at most [`HTTP_MAX_REDIRECTS`] redirects).
fn instance_client(caller: &mut Caller<'_, InstanceState>) -> Result<reqwest::Client, String> {
    if let Some(client) = &caller.data().env.http_client {
        return Ok(client.clone());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(HTTP_MAX_REDIRECTS))
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))?;
    caller.data_mut().env.http_client = Some(client.clone());
    Ok(client)
}

/// The synchronous entry the host function calls: bridges to async reqwest
/// via [`block_on`]. Never called from an async context (wasmi host calls
/// are synchronous; they may originate inside `Source::*` async methods that
/// run on Tauri's multi-thread runtime — see [`block_on`]).
fn fetch_sync(
    client: &reqwest::Client,
    req: &FetchRequest,
    url: &Url,
    extension_id: &str,
) -> Result<FetchOutcome, String> {
    block_on(fetch_async(
        client.clone(),
        req.clone(),
        url.clone(),
        extension_id.to_string(),
    ))?
}

/// Successful fetch payload (pre-envelope).
struct FetchOutcome {
    status: u16,
    /// (lowercased name, value) — string values only, non-UTF-8 dropped.
    headers: Vec<(String, String)>,
    body: String,
}

async fn fetch_async(
    client: reqwest::Client,
    req: FetchRequest,
    url: Url,
    extension_id: String,
) -> Result<FetchOutcome, String> {
    let method = match req.method.as_str() {
        "POST" => reqwest::Method::POST,
        _ => reqwest::Method::GET,
    };
    let mut builder = client.request(method, url).timeout(HTTP_TIMEOUT);
    for (name, value) in &req.headers {
        builder = builder.header(name.as_str(), value.as_str());
    }
    // Host-set UA always wins over extension-supplied headers.
    builder = builder.header(
        reqwest::header::USER_AGENT,
        format!("Shiori-Extension/{extension_id}"),
    );
    if let Some(body) = &req.body {
        builder = builder.body(body.clone());
    }
    let resp = builder.send().await.map_err(map_reqwest_error)?;

    // Early reject when the server advertises an over-cap body.
    if let Some(len) = resp
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<usize>().ok())
    {
        if len > HTTP_MAX_RESPONSE_BYTES {
            return Err(format!(
                "response body exceeds the {}-byte cap (content-length: {len})",
                HTTP_MAX_RESPONSE_BYTES
            ));
        }
    }

    let mut body = Vec::new();
    let mut resp = resp;
    while let Some(chunk) = resp.chunk().await.map_err(map_reqwest_error)? {
        if body.len().saturating_add(chunk.len()) > HTTP_MAX_RESPONSE_BYTES {
            return Err(format!(
                "response body exceeds the {}-byte cap",
                HTTP_MAX_RESPONSE_BYTES
            ));
        }
        body.extend_from_slice(&chunk);
    }
    let status = resp.status().as_u16();
    // String values only; non-UTF-8 header values are dropped.
    let headers = resp
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|v| (name.as_str().to_lowercase(), v.to_string()))
        })
        .collect();
    Ok(FetchOutcome {
        status,
        headers,
        body: String::from_utf8_lossy(&body).into_owned(),
    })
}

/// Maps a `reqwest` failure onto a human-readable message (transport,
/// timeout, redirect cap, body read).
fn map_reqwest_error(e: reqwest::Error) -> String {
    if e.is_timeout() {
        format!("request timed out after {HTTP_TIMEOUT:?}")
    } else if e.is_connect() {
        format!("connection failed: {e}")
    } else if e.is_redirect() {
        format!("too many redirects: {e}")
    } else {
        format!("request failed: {e}")
    }
}

// ---------------------------------------------------------------------------
// html_select / json_get (Phase 5A helpers)
// ---------------------------------------------------------------------------

/// `html_select(req_ptr, req_len) -> ptr` — CSS selection over an HTML
/// fragment (see the module docs for the request/response shapes).
fn host_html_select_impl(caller: &mut Caller<'_, InstanceState>, req_ptr: i32, req_len: i32) -> i32 {
    let req = match read_str(caller, req_ptr, req_len) {
        Ok(r) => r,
        Err(e) => return return_error(caller, "html", &e.to_string()),
    };
    let envelope = match html_select_exec(&req) {
        Ok(items) => {
            serde_json::to_string(&json!({ "ok": true, "data": { "items": items } }))
                .unwrap_or_else(|e| {
                    format!(r#"{{"ok":false,"error":{{"kind":"html","message":"encode response: {e}"}}}}"#)
                })
        }
        Err(e) => format!(
            r#"{{"ok":false,"error":{{"kind":"html","message":{}}}}}"#,
            json_string(&e)
        ),
    };
    return_json(caller, &envelope)
        .unwrap_or_else(|| return_error(caller, "html", "cannot write result"))
}

/// Parsed + validated `html_select` request.
#[derive(serde::Deserialize)]
struct SelectRequest {
    html: String,
    selector: String,
    #[serde(default)]
    attr: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

/// Runs a `html_select` request (pure; no caller needed). `attr` defaults to
/// `"text"` (descendant text nodes, trimmed, joined with single spaces);
/// `"html"` returns inner HTML; any other name is an attribute lookup.
/// `limit` defaults to [`HTML_DEFAULT_LIMIT`] and clamps to [`HTML_MAX_LIMIT`];
/// the html input is capped at [`HTML_MAX_INPUT_BYTES`].
fn html_select_exec(req_json: &str) -> Result<Vec<String>, String> {
    let req: SelectRequest =
        serde_json::from_str(req_json).map_err(|e| format!("invalid request json: {e}"))?;
    if req.html.len() > HTML_MAX_INPUT_BYTES {
        return Err(format!(
            "html input exceeds the {}-byte cap",
            HTML_MAX_INPUT_BYTES
        ));
    }
    let selector = scraper::Selector::parse(&req.selector)
        .map_err(|e| format!("invalid selector {:?}: {e}", req.selector))?;
    let limit = req
        .limit
        .filter(|n| *n > 0)
        .unwrap_or(HTML_DEFAULT_LIMIT)
        .min(HTML_MAX_LIMIT);
    let doc = scraper::Html::parse_fragment(&req.html);
    let attr = req.attr.as_deref().unwrap_or("text");
    let mut items = Vec::new();
    for el in doc.select(&selector) {
        if items.len() >= limit {
            break;
        }
        let value = match attr {
            "text" => el
                .text()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(" "),
            "html" => el.inner_html(),
            name => el.value().attr(name).unwrap_or("").to_string(),
        };
        items.push(value);
    }
    Ok(items)
}

/// `json_get(req_ptr, req_len) -> ptr` — JSON Pointer lookup (see the module
/// docs for the request/response shapes).
fn host_json_get_impl(caller: &mut Caller<'_, InstanceState>, req_ptr: i32, req_len: i32) -> i32 {
    let req = match read_str(caller, req_ptr, req_len) {
        Ok(r) => r,
        Err(e) => return return_error(caller, "json", &e.to_string()),
    };
    let envelope = match json_get_exec(&req) {
        Ok(value) => {
            serde_json::to_string(&json!({ "ok": true, "data": { "value": value } }))
                .unwrap_or_else(|e| {
                    format!(r#"{{"ok":false,"error":{{"kind":"json","message":"encode response: {e}"}}}}"#)
                })
        }
        Err(e) => format!(
            r#"{{"ok":false,"error":{{"kind":"json","message":{}}}}}"#,
            json_string(&e)
        ),
    };
    return_json(caller, &envelope)
        .unwrap_or_else(|| return_error(caller, "json", "cannot write result"))
}

/// Parsed + validated `json_get` request.
#[derive(serde::Deserialize)]
struct JsonGetRequest {
    json: String,
    pointer: String,
}

/// Runs a `json_get` request (pure; no caller needed). The json input is
/// capped at [`JSON_MAX_INPUT_BYTES`]; invalid JSON or a missing pointer is
/// an error.
fn json_get_exec(req_json: &str) -> Result<serde_json::Value, String> {
    let req: JsonGetRequest =
        serde_json::from_str(req_json).map_err(|e| format!("invalid request json: {e}"))?;
    if req.json.len() > JSON_MAX_INPUT_BYTES {
        return Err(format!(
            "json input exceeds the {}-byte cap",
            JSON_MAX_INPUT_BYTES
        ));
    }
    let value: serde_json::Value =
        serde_json::from_str(&req.json).map_err(|e| format!("invalid json: {e}"))?;
    value
        .pointer(&req.pointer)
        .cloned()
        .ok_or_else(|| format!("no value at pointer {:?}", req.pointer))
}

// ---------------------------------------------------------------------------
// Sync → async bridge
// ---------------------------------------------------------------------------

/// Runs a future to completion from synchronous host-function code, adapting
/// to the calling context (same strategy as
/// `conversion::formats::common::block_on`):
///
/// - outside a tokio runtime: build a fresh current-thread runtime and block
///   on it;
/// - inside a multi-thread runtime (Tauri commands / `#[tokio::test(flavor =
///   "multi_thread")]`): `tokio::task::block_in_place` — never `block_on`
///   directly inside an async context, and never a nested runtime;
/// - inside a current-thread runtime (`#[tokio::test]`): run the future on a
///   fresh runtime on a scoped thread — again no nested runtime.
///
/// Host functions run synchronously inside wasmi while the caller (`WasmSource`
/// methods, which are async) may be on Tauri's tokio runtime, so the
/// multi-thread branch is the production path.
fn block_on<F: std::future::Future + Send>(f: F) -> Result<F::Output, String>
where
    F::Output: Send,
{
    match tokio::runtime::Handle::try_current() {
        Ok(handle) => {
            if handle.runtime_flavor() == tokio::runtime::RuntimeFlavor::MultiThread {
                Ok(tokio::task::block_in_place(|| handle.block_on(f)))
            } else {
                std::thread::scope(|s| {
                    s.spawn(|| {
                        tokio::runtime::Builder::new_current_thread()
                            .enable_all()
                            .build()
                            .map_err(|e| format!("failed to build runtime: {e}"))
                            .and_then(|rt| Ok(rt.block_on(f)))
                    })
                    .join()
                    .map_err(|_| "block_on worker thread panicked".to_string())?
                })
            }
        }
        Err(_) => {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| format!("failed to build runtime: {e}"))?;
            Ok(rt.block_on(f))
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extensions::abi::Method;
    use crate::extensions::runtime::{ExtensionInstance, HostOptions};
    use crate::extensions::test_wasm;
    use serde_json::json;

    fn opts() -> HostOptions {
        HostOptions {
            extension_id: "wiremock.test".into(),
            ..HostOptions::default()
        }
    }

    fn allowed(entry: &str, url: &str) -> bool {
        url_allowed(&[entry.to_string()], &Url::parse(url).expect("test url parses"))
    }

    // -- allowlist matching ---------------------------------------------------

    #[test]
    fn empty_allowlist_denies_everything() {
        assert!(!url_allowed(&[], &Url::parse("https://example.test/x").unwrap()));
    }

    #[test]
    fn exact_host_match_is_allowed() {
        assert!(allowed("https://example.test", "https://example.test/items"));
        assert!(allowed("example.test", "https://example.test/items"));
    }

    #[test]
    fn subdomain_suffix_match_is_allowed() {
        assert!(allowed("example.test", "https://cdn.example.test/v1/x"));
        assert!(allowed("example.test", "https://a.b.example.test/"));
        assert!(allowed("https://example.test", "https://cdn.example.test"));
    }

    #[test]
    fn lookalike_hosts_are_not_allowed() {
        assert!(!allowed("example.test", "https://evil-example.test/"));
        assert!(!allowed("example.test", "https://notexample.test/"));
        assert!(!allowed("https://example.test", "https://cdn.otherexample.test"));
    }

    #[test]
    fn scheme_is_enforced_and_entry_ports_paths_ignored() {
        // https-only entry: cleartext for the same host is denied.
        assert!(!allowed("https://api.example.com", "http://api.example.com/x"));
        // http:// entry permits cleartext for that host only.
        assert!(allowed("http://127.0.0.1", "http://127.0.0.1:8080/x"));
        assert!(!allowed("http://127.0.0.1", "https://127.0.0.1/x"));
        // Ports and paths on an entry do not participate in matching.
        assert!(allowed("https://api.example.com:8443/v1", "https://api.example.com/x"));
    }

    // -- request validation ---------------------------------------------------

    #[test]
    fn parse_fetch_request_validates_method_and_url() {
        let e = parse_fetch_request("not json").unwrap_err();
        assert!(e.contains("invalid request json"), "{e}");
        // method defaults to GET; headers/body are optional.
        assert!(parse_fetch_request(r#"{"url":"https://x.test"}"#).is_ok());
        let e = parse_fetch_request(r#"{"url":"https://x.test","method":"DELETE"}"#).unwrap_err();
        assert!(e.contains("GET or POST"), "{e}");
        let e = parse_fetch_request(r#"{"method":"GET"}"#).unwrap_err();
        assert!(e.contains("url"), "{e}");
        let e = parse_fetch_request(r#"{"url":"https://x.test","headers":{"n":42}}"#).unwrap_err();
        assert!(e.contains("invalid request json"), "{e}");
    }

    // -- html_select / json_get pure logic ------------------------------------

    #[test]
    fn html_select_extracts_text_html_and_attrs() {
        let req = r#"{"html":"<ul><li class=\"a\">One</li><li class=\"b\">Two <b>Bold</b></li></ul>","selector":"li","attr":"text"}"#;
        assert_eq!(html_select_exec(req).unwrap(), vec!["One", "Two Bold"]);
        let req = r#"{"html":"<ul><li>One</li></ul>","selector":"li","attr":"html"}"#;
        assert_eq!(html_select_exec(req).unwrap(), vec!["One"]);
        let req = r#"{"html":"<a href=\"/x\">go</a>","selector":"a","attr":"href"}"#;
        assert_eq!(html_select_exec(req).unwrap(), vec!["/x"]);
        // `attr` defaults to "text" (trimmed, joined with spaces).
        let req = r#"{"html":"<p>hi <b>bold</b></p>","selector":"p"}"#;
        assert_eq!(html_select_exec(req).unwrap(), vec!["hi bold"]);
    }

    #[test]
    fn html_select_rejects_bad_selector() {
        let req = r#"{"html":"<p>x</p>","selector":"["}"#;
        let e = html_select_exec(req).unwrap_err();
        assert!(e.contains("invalid selector"), "{e}");
    }

    #[test]
    fn html_select_enforces_input_cap() {
        let html = format!("<p>{}</p>", "x".repeat(HTML_MAX_INPUT_BYTES));
        let req = json!({ "html": html, "selector": "p" }).to_string();
        let e = html_select_exec(&req).unwrap_err();
        assert!(e.contains("cap"), "{e}");
    }

    #[test]
    fn html_select_clamps_limit() {
        let req = json!({
            "html": format!("<ul>{}</ul>", "<li>x</li>".repeat(1500)),
            "selector": "li",
            "limit": 999_999,
        })
        .to_string();
        assert_eq!(html_select_exec(&req).unwrap().len(), HTML_MAX_LIMIT);

        let req = json!({
            "html": format!("<ul>{}</ul>", "<li>x</li>".repeat(5)),
            "selector": "li",
            "limit": 2,
        })
        .to_string();
        assert_eq!(html_select_exec(&req).unwrap().len(), 2);

        let req = json!({
            "html": format!("<ul>{}</ul>", "<li>x</li>".repeat(150)),
            "selector": "li",
        })
        .to_string();
        assert_eq!(html_select_exec(&req).unwrap().len(), HTML_DEFAULT_LIMIT);
    }

    #[test]
    fn json_get_round_trip_and_error_paths() {
        let req = r#"{"json":"{\"a\":{\"b\":[1,2,{\"c\":\"deep\"}]}}","pointer":"/a/b/2/c"}"#;
        assert_eq!(json_get_exec(req).unwrap(), json!("deep"));
        let req = r#"{"json":"{\"x\":1}","pointer":"/x"}"#;
        assert_eq!(json_get_exec(req).unwrap(), json!(1));
        let e = json_get_exec(r#"{"json":"{\"a\":1}","pointer":"/nope"}"#).unwrap_err();
        assert!(e.contains("no value at pointer"), "{e}");
        let e = json_get_exec(r#"{"json":"not json","pointer":"/a"}"#).unwrap_err();
        assert!(e.contains("invalid json"), "{e}");
    }

    #[test]
    fn json_get_enforces_input_cap() {
        let big = "a".repeat(JSON_MAX_INPUT_BYTES + 1);
        let req = json!({ "json": format!("\"{big}\""), "pointer": "/" }).to_string();
        let e = json_get_exec(&req).unwrap_err();
        assert!(e.contains("cap"), "{e}");
    }

    // -- instance-level round trips through WAT modules ------------------------

    #[test]
    fn host_http_fetch_deny_all_never_touches_network() {
        let mut inst =
            ExtensionInstance::new(&test_wasm::http_fetch_dynamic(), HostOptions::default())
                .expect("http module loads");
        let err = inst
            .raw_invoke(
                Method::Meta,
                json!({ "url": "https://api.example.com/items", "method": "GET" }),
            )
            .expect_err("empty allowlist must deny");
        assert!(err.to_string().contains("http_disabled"), "{err}");
    }

    #[test]
    fn host_html_select_round_trip_via_wasm() {
        let mut inst = ExtensionInstance::new(&test_wasm::html_select(), opts())
            .expect("html module loads");
        let data = inst
            .raw_invoke(Method::Meta, json!({}))
            .expect("html_select succeeds");
        assert_eq!(data["items"], json!(["One", "Two Bold"]));
    }

    #[test]
    fn host_json_get_round_trip_via_wasm() {
        let mut inst = ExtensionInstance::new(&test_wasm::json_get(), opts())
            .expect("json module loads");
        let data = inst
            .raw_invoke(Method::Meta, json!({}))
            .expect("json_get succeeds");
        assert_eq!(data["value"], json!("deep"));
    }

    /// End-to-end fetch through a live instance against a local wiremock
    /// server. The `http://127.0.0.1` allowlist entry permits cleartext for
    /// that host (the documented scheme rule) — everything else is https-only.
    /// Multi-thread flavor on purpose: this is the production path (Tauri's
    /// async runtime), so the host function bridges via `block_in_place`.
    #[tokio::test(flavor = "multi_thread")]
    async fn host_http_fetch_success_via_wiremock() {
        use wiremock::matchers::{body_string, header, method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/items"))
            .and(header("user-agent", "Shiori-Extension/wiremock.test"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("X-Custom", "yes")
                    .set_body_json(json!({ "ok": true })),
            )
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/redirect"))
            .respond_with(ResponseTemplate::new(302).insert_header("Location", "/items"))
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/echo"))
            .and(body_string("hello"))
            .respond_with(ResponseTemplate::new(201))
            .mount(&server)
            .await;

        let mut inst = ExtensionInstance::new(
            &test_wasm::http_fetch_dynamic(),
            HostOptions {
                extension_id: "wiremock.test".into(),
                http_allowlist: vec!["http://127.0.0.1".into()],
                ..HostOptions::default()
            },
        )
        .expect("http module loads");
        let addr = server.address().to_string();

        let data = inst
            .raw_invoke(
                Method::Meta,
                json!({ "url": format!("http://{addr}/items"), "method": "GET" }),
            )
            .expect("allowlisted GET succeeds");
        assert_eq!(data["status"], 200);
        assert_eq!(data["body"], json!("{\"ok\":true}"));
        assert_eq!(data["headers"]["x-custom"], json!("yes"));

        let data = inst
            .raw_invoke(
                Method::Meta,
                json!({ "url": format!("http://{addr}/redirect"), "method": "GET" }),
            )
            .expect("redirect followed");
        assert_eq!(data["status"], 200, "final status after redirect");

        let data = inst
            .raw_invoke(
                Method::Meta,
                json!({
                    "url": format!("http://{addr}/echo"),
                    "method": "POST",
                    "body": "hello",
                }),
            )
            .expect("allowlisted POST succeeds");
        assert_eq!(data["status"], 201);
    }
}