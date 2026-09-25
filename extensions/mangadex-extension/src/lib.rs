//! mangadex-extension — MangaDex (manga, full source) WASM extension.
//!
//! Adapted from the reference ABI implementation in
//! `extensions/torrents-csv-extension/` (which mirrors
//! `src-tauri/src/extensions/abi.rs` and the wasmi host in
//! `src-tauri/src/extensions/host.rs`). Only the source logic and meta
//! differ; the wire plumbing is copied verbatim.
//!
//! Wire protocol (must match abi.rs / runtime.rs EXACTLY):
//! - Exports: `memory`, `alloc(len: i32) -> i32`, `invoke(req_ptr: i32,
//!   req_len: i32) -> i32`.
//! - Request read from linear memory: `{ "method": <str>, "params": <json> }`.
//! - Response: pointer to a buffer whose first 4 bytes are a little-endian
//!   u32 byte-length followed by the JSON envelope
//!   `{ "ok": true, "data": … }` / `{ "ok": false, "error": { "kind", "message" } }`.
//! - Pointer-returning host functions (`host_http_fetch`, `host_kv_get`,
//!   `json_get`) use the *same* length-prefix + envelope convention, and the
//!   returned pointer lives in this module's own `alloc` region.
//!
//! Safety: the guest never panics on untrusted input (no `unwrap()`/`expect()`
//! on parsed data) and every memory read/write is bounds-checked against the
//! bump region.

use serde_json::{json, Value};

// ---------------------------------------------------------------------------
// Constants.
// ---------------------------------------------------------------------------

const API_BASE_URL: &str = "https://api.mangadex.org";
const COVERS_BASE_URL: &str = "https://uploads.mangadex.org";
const SOURCE_ID: &str = "mangadex_wasm";
const SOURCE_NAME: &str = "MangaDex (WASM)";
const SOURCE_VERSION: &str = "1.0.0";

/// Fixed per-request size sent to the API. The ABI's `search` params carry
/// only `{ "query", "page" }`, so — exactly like the reference extension —
/// we default to 20. If a `limit` key is present in the params (forward
/// compatibility), it is honored up to [`MAX_LIMIT`].
const DEFAULT_LIMIT: u64 = 20;
/// Hard cap: keeps the request limit ≤ 100 and response sizes bounded.
const MAX_LIMIT: u64 = 100;
/// Feed fetch limit; response is additionally capped at [`CHAPTER_CAP`].
const FEED_LIMIT: u64 = 100;
/// Hard cap on chapters returned to the host.
const CHAPTER_CAP: usize = 200;
/// Description length cap (~300 chars) for search results.
const DESCRIPTION_CAP: usize = 300;

/// KV response-cache for the API body. Defaults to OFF so behavior matches
/// the reference source (always fetches); flip to `true` to demo the
/// `host_kv_get`/`host_kv_set` pattern.
#[allow(dead_code)] // kept as reference, same as the template extension.
const KV_CACHE_ENABLED: bool = false;

// ---------------------------------------------------------------------------
// Host imports — names/types must match host.rs `register_host_functions`
// EXACTLY. Note the module is `shiori` and the JSON-pointer helper is
// registered as `json_get` (there is no `host_json_get` import in host.rs).
// ---------------------------------------------------------------------------

#[link(wasm_import_module = "shiori")]
extern "C" {
    /// `host_log(level: i32, msg_ptr: i32, msg_len: i32)` — level ≤0 error, 1 warn, 2 info, else debug.
    fn host_log(level: i32, msg_ptr: i32, msg_len: i32);
    /// `host_now_ms() -> i64` — unix epoch milliseconds.
    fn host_now_ms() -> i64;
    /// `host_kv_get(key_ptr, key_len) -> ptr` — envelope `{ok,data:{value}}` / data null.
    fn host_kv_get(key_ptr: i32, key_len: i32) -> i32;
    /// `host_kv_set(key_ptr, key_len, val_ptr, val_len) -> i32` — 0 ok, 1 cap, 2 bad args.
    fn host_kv_set(key_ptr: i32, key_len: i32, val_ptr: i32, val_len: i32) -> i32;
    /// `host_http_fetch(req_ptr, req_len) -> ptr` — `{method,url,headers?,body?}` →
    /// envelope `{ok,data:{status,headers,body}}`.
    fn host_http_fetch(req_ptr: i32, req_len: i32) -> i32;
    /// `json_get(req_ptr, req_len) -> ptr` — `{json,pointer}` → envelope `{ok,data:{value}}`.
    fn json_get(req_ptr: i32, req_len: i32) -> i32;
}

// ---------------------------------------------------------------------------
// Memory: a static bump region sized for the largest single-invoke envelope
// (worst case: a maxed-out 8 MiB `host_http_fetch` body + our response), plus
// the exported allocator. The region is single-threaded (wasmi serializes
// calls behind a Mutex) and the cursor is reset at the top of every `invoke`,
// so the region only needs to hold one call's worth of buffers.
// ---------------------------------------------------------------------------

/// 12 MiB: host caps response bodies at 8 MiB and the fetch envelope wraps it
/// (status + headers + body ≈ body), leaving ~4 MiB for the request copy, any
/// KV/json_get results and our own length-prefixed response.
const BUMP_CAPACITY: usize = 12 * 1024 * 1024;

static mut BUMP: [u8; BUMP_CAPACITY] = [0; BUMP_CAPACITY];
static mut CURSOR: usize = 0;

/// Raw base pointer to the bump region (avoids creating `&mut` to a static).
#[inline]
fn bump_base() -> *mut u8 {
    // SAFETY (of this pointer's later *dereferences*, not of constructing
    // the pointer itself): only ever used on the single wasmi thread via the
    // bounds-checked helpers below.
    ::core::ptr::addr_of_mut!(BUMP).cast::<u8>()
}

/// Copies `[ptr, ptr+len)` out of the bump region, where `ptr` is an
/// ABSOLUTE address in linear memory. `None` on any out-of-range input —
/// never panics.
fn read_range(ptr: usize, len: usize) -> Option<Vec<u8>> {
    let base = bump_base() as usize;
    if ptr < base {
        return None;
    }
    let region_end = base.checked_add(BUMP_CAPACITY)?;
    let end = ptr.checked_add(len)?;
    if end > region_end {
        return None;
    }
    let mut out = vec![0u8; len];
    // SAFETY: range validated above; single-threaded guest.
    unsafe { ::core::ptr::copy_nonoverlapping(ptr as *const u8, out.as_mut_ptr(), len) }
    Some(out)
}

/// Writes `bytes` into `[ptr, ptr+len)`, where `ptr` is an ABSOLUTE address
/// in linear memory. Returns false on out-of-range.
fn write_bytes(ptr: usize, bytes: &[u8]) -> bool {
    let base = bump_base() as usize;
    if ptr < base {
        return false;
    }
    let region_end = match base.checked_add(BUMP_CAPACITY) {
        Some(e) => e,
        None => return false,
    };
    let end = match ptr.checked_add(bytes.len()) {
        Some(e) => e,
        None => return false,
    };
    if end > region_end {
        return false;
    }
    // SAFETY: range validated above; single-threaded guest.
    unsafe { ::core::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr as *mut u8, bytes.len()) }
    true
}

// ---------------------------------------------------------------------------
// Exports.
// ---------------------------------------------------------------------------

/// Bump allocator used by both host and guest. Returns a pointer into the
/// static region, or `-1` when the request cannot be honored (host turns that
/// into an error envelope; the runtime surfaces a clean error, never a panic).
#[no_mangle]
pub extern "C" fn alloc(len: i32) -> i32 {
    if len < 0 {
        return -1;
    }
    let n = len as usize;
    // SAFETY: single wasmi thread; CURSOR only ever reset from `invoke`.
    let base = unsafe { CURSOR };
    match base.checked_add(n) {
        Some(next) if next <= BUMP_CAPACITY => {
            // SAFETY: single wasmi thread.
            unsafe { CURSOR = next };
            // CURSOR is an OFFSET; the host treats returned pointers as
            // ABSOLUTE addresses in linear memory, so add the region base.
            (bump_base() as usize + base) as i32
        }
        _ => -1,
    }
}

/// Dispatch entry point: read the request JSON from memory, run the method,
/// and return a pointer to the length-prefixed response envelope.
#[no_mangle]
pub extern "C" fn invoke(req_ptr: i32, req_len: i32) -> i32 {
    // 1. Copy the request out BEFORE resetting the bump cursor (the host
    //    wrote it into this region before calling us; resetting first would
    //    clobber it).
    let request = if req_ptr < 0 || req_len < 0 {
        None
    } else {
        read_range(req_ptr as usize, req_len as usize)
    };

    // 2. Fresh region for this call's own buffers.
    // SAFETY: single wasmi thread; nothing is borrowed across the reset.
    unsafe { CURSOR = 0 };

    // 3. Parse and dispatch.
    let envelope = match request {
        None => err_envelope("input", "invalid request pointer/length"),
        Some(bytes) => match ::std::str::from_utf8(&bytes) {
            Err(_) => err_envelope("input", "request is not UTF-8"),
            Ok(text) => dispatch(text),
        },
    };

    // 4. Length-prefixed emit.
    emit(&envelope)
}

// ---------------------------------------------------------------------------
// Dispatch.
// ---------------------------------------------------------------------------

fn dispatch(req: &str) -> String {
    log(2, &format!("{SOURCE_ID}: invoke"));
    let value: Value = match serde_json::from_str(req) {
        Ok(v) => v,
        Err(e) => return err_envelope("input", &format!("invalid request JSON: {e}")),
    };
    let Some(method) = value.get("method").and_then(Value::as_str) else {
        return err_envelope("input", "request missing method");
    };
    let params = value.get("params").cloned().unwrap_or(Value::Null);
    match method {
        "meta" => meta(),
        "search" => search(&params),
        "browse" => browse(&params),
        "chapters" => chapters(&params),
        "pages" => pages(&params),
        "health" => health(),
        other => err_envelope("method", &format!("unknown method: {other}")),
    }
}

// ---------------------------------------------------------------------------
// Methods — each returns the JSON envelope string.
// ---------------------------------------------------------------------------

/// Source metadata. `permissions.hosts` declares the only hosts the source
/// will ever fetch from — the host uses it to gate `host_http_fetch`.
fn meta() -> String {
    ok(json!({
        "id": SOURCE_ID,
        "name": SOURCE_NAME,
        "baseUrl": API_BASE_URL,
        "version": SOURCE_VERSION,
        "contentType": "manga",
        "supportsSearch": true,
        "supportsDownload": true,
        "requiresApiKey": false,
        "nsfw": false,
        "permissions": {
            "hosts": ["api.mangadex.org", "uploads.mangadex.org"]
        },
    }))
}

/// `GET {API_BASE_URL}/manga?title=<enc>&limit=<limit>&offset=<page*limit>
/// &includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive`
/// via `host_http_fetch`, then map `{ data: [...] }` → `SearchResult`s.
fn search(params: &Value) -> String {
    let Some(query) = params.get("query").and_then(Value::as_str) else {
        return err_envelope("input", "search requires params.query");
    };
    // `.unwrap_or` is a safe fallback — no panics on parsed input.
    let page = params.get("page").and_then(Value::as_u64).unwrap_or(0);
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .map(|l| l.clamp(1, MAX_LIMIT))
        .unwrap_or(DEFAULT_LIMIT);
    let offset = page.saturating_mul(limit);

    let url = format!(
        "{API_BASE_URL}/manga?title={}&limit={limit}&offset={offset}\
         &includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive",
        encode(query)
    );
    match http_get(&url) {
        Err(e) => {
            log(0, &format!("{SOURCE_ID}: search fetch failed: {e}"));
            err_envelope("http", &e)
        }
        Ok(body) => browse_results(&body),
    }
}

/// `GET {API_BASE_URL}/manga?limit=<limit>&offset=<offset>
/// &contentRating[]=safe&contentRating[]=suggestive&includes[]=cover_art
/// &order[followedCount]=desc` — popular-manga listing. `params.mode` is
/// accepted and ignored (unknown modes degrade gracefully to the same feed).
fn browse(params: &Value) -> String {
    let page = params.get("page").and_then(Value::as_u64).unwrap_or(0);
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .map(|l| l.clamp(1, MAX_LIMIT))
        .unwrap_or(DEFAULT_LIMIT);
    let offset = page.saturating_mul(limit);

    let url = format!(
        "{API_BASE_URL}/manga?limit={limit}&offset={offset}\
         &contentRating[]=safe&contentRating[]=suggestive&includes[]=cover_art\
         &order[followedCount]=desc"
    );
    match http_get(&url) {
        Err(e) => {
            log(0, &format!("{SOURCE_ID}: browse fetch failed: {e}"));
            err_envelope("http", &e)
        }
        Ok(body) => browse_results(&body),
    }
}

/// Shared mapper for the search/browse `/manga` responses.
fn browse_results(body: &str) -> String {
    let parsed: Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(e) => {
            let msg = format!("failed to parse MangaDex response: {e}");
            log(0, &format!("{SOURCE_ID}: {msg}"));
            return err_envelope("http", &msg);
        }
    };
    let entries = parsed.get("data").and_then(Value::as_array);
    let mut results: Vec<Value> = Vec::new();
    for entry in entries.unwrap_or(&Vec::new()) {
        let Some(id) = entry.get("id").and_then(Value::as_str) else {
            continue;
        };
        let attributes = entry.get("attributes");
        let title = attributes
            .and_then(|a| a.get("title"))
            .and_then(Value::as_object)
            .map(title_of)
            .unwrap_or_default();
        if title.is_empty() {
            continue;
        }
        let description = attributes
            .and_then(|a| a.get("description"))
            .and_then(Value::as_object)
            .map(description_of)
            .unwrap_or_default();
        let cover_url = cover_url_of(entry, id);

        let mut extra = serde_json::Map::new();
        if let Some(status) =
            attributes.and_then(|a| a.get("status")).and_then(Value::as_str)
        {
            extra.insert("status".to_string(), Value::String(status.to_string()));
        }
        if let Some(year) = attributes.and_then(|a| a.get("year")) {
            if year.is_number() {
                extra.insert("year".to_string(), Value::String(year.to_string()));
            }
        }

        results.push(json!({
            "id": id,
            "title": title,
            "coverUrl": cover_url,
            "description": description,
            "sourceId": SOURCE_ID,
            "extra": Value::Object(extra),
        }));
    }
    ok(Value::Array(results))
}

/// `GET {API_BASE_URL}/manga/<contentId>/feed?translatedLanguage[]=en
/// &order[chapter]=asc&limit=100&includes[]=scanlation_group` → `Chapter`s in
/// server (ascending) order, capped at [`CHAPTER_CAP`].
fn chapters(params: &Value) -> String {
    let Some(content_id) = params.get("contentId").and_then(Value::as_str) else {
        return err_envelope("input", "chapters requires params.contentId");
    };
    let Some(content_id) = sanitize_id(content_id) else {
        return err_envelope("input", "invalid contentId");
    };
    let url = format!(
        "{API_BASE_URL}/manga/{content_id}/feed?translatedLanguage[]=en\
         &order[chapter]=asc&limit={FEED_LIMIT}&includes[]=scanlation_group"
    );
    let body = match http_get(&url) {
        Err(e) => {
            log(0, &format!("{SOURCE_ID}: feed fetch failed: {e}"));
            return err_envelope("http", &e);
        }
        Ok(b) => b,
    };
    let parsed: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let msg = format!("failed to parse MangaDex feed response: {e}");
            log(0, &format!("{SOURCE_ID}: {msg}"));
            return err_envelope("http", &msg);
        }
    };
    let entries = parsed.get("data").and_then(Value::as_array);
    let mut chapters: Vec<Value> = Vec::new();
    for entry in entries.unwrap_or(&Vec::new()).iter().take(CHAPTER_CAP) {
        let Some(id) = entry.get("id").and_then(Value::as_str) else {
            continue;
        };
        let attributes = entry.get("attributes");
        let chapter_str = attributes
            .and_then(|a| a.get("chapter"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        let number = chapter_str.parse::<f32>().unwrap_or(0.0);
        let title = attributes.and_then(|a| a.get("title")).and_then(Value::as_str);
        let chapter_title = match title {
            Some(t) if !t.is_empty() => {
                format!("Chapter {chapter_str} - {t}")
            }
            _ => format!("Chapter {chapter_str}"),
        };
        let volume = attributes
            .and_then(|a| a.get("volume"))
            .and_then(Value::as_str)
            .map(|v| json!(v));
        let uploaded_at = attributes
            .and_then(|a| a.get("publishAt"))
            .and_then(Value::as_str)
            .map(|p| json!(p));

        chapters.push(json!({
            "id": id,
            "title": chapter_title,
            "number": number,
            "volume": volume.unwrap_or(Value::Null),
            "uploadedAt": uploaded_at.unwrap_or(Value::Null),
            "sourceId": SOURCE_ID,
            "contentId": content_id,
        }));
    }
    ok(Value::Array(chapters))
}

/// `GET {API_BASE_URL}/at-home/server/<chapterId>` → `Page`s
/// `{ index, url: "<baseUrl>/data/<hash>/<file>" }` in order.
fn pages(params: &Value) -> String {
    let Some(chapter_id) = params.get("chapterId").and_then(Value::as_str) else {
        return err_envelope("input", "pages requires params.chapterId");
    };
    let Some(chapter_id) = sanitize_id(chapter_id) else {
        return err_envelope("input", "invalid chapterId");
    };
    let url = format!("{API_BASE_URL}/at-home/server/{chapter_id}");
    let body = match http_get(&url) {
        Err(e) => {
            log(0, &format!("{SOURCE_ID}: page server fetch failed: {e}"));
            return err_envelope("http", &e);
        }
        Ok(b) => b,
    };
    let parsed: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let msg = format!("failed to parse MangaDex page server response: {e}");
            log(0, &format!("{SOURCE_ID}: {msg}"));
            return err_envelope("http", &msg);
        }
    };
    let Some(base_url) = parsed.get("baseUrl").and_then(Value::as_str) else {
        return err_envelope("http", "MangaDex page server response missing baseUrl");
    };
    let chapter = parsed.get("chapter");
    let Some(hash) = chapter.and_then(|c| c.get("hash")).and_then(Value::as_str) else {
        return err_envelope("http", "MangaDex page server response missing chapter.hash");
    };
    let files = chapter
        .and_then(|c| c.get("data"))
        .and_then(Value::as_array);
    let mut pages: Vec<Value> = Vec::new();
    let empty: Vec<Value> = Vec::new();
    for (i, file) in files.unwrap_or(&empty).iter().enumerate() {
        let Some(file) = file.as_str() else {
            continue;
        };
        pages.push(json!({
            "index": i,
            "url": format!("{base_url}/data/{hash}/{file}"),
        }));
    }
    ok(Value::Array(pages))
}

/// Available when a trivial host call succeeds.
fn health() -> String {
    // `host_now_ms` is a pure host call that cannot fail; on any i64 it
    // returns, the source is considered available.
    if now_ms() >= 0 {
        ok(json!("available"))
    } else {
        err_envelope("health", "clock unavailable")
    }
}

// ---------------------------------------------------------------------------
// MangaDex response helpers.
// ---------------------------------------------------------------------------

/// Best `title` value: `en` when present, else the first non-empty value.
fn title_of(title: &serde_json::Map<String, Value>) -> String {
    if let Some(en) = title.get("en").and_then(Value::as_str) {
        if !en.is_empty() {
            return en.to_string();
        }
    }
    title
        .values()
        .find_map(|v| v.as_str().filter(|s| !s.is_empty()))
        .map(|s| s.to_string())
        .unwrap_or_default()
}

/// `description.en`, truncated to ~300 chars.
fn description_of(description: &serde_json::Map<String, Value>) -> String {
    description
        .get("en")
        .and_then(Value::as_str)
        .map(|s| s.chars().take(DESCRIPTION_CAP).collect::<String>())
        .unwrap_or_default()
}

/// `https://uploads.mangadex.org/covers/<id>/<fileName>.256.jpg` when a
/// `cover_art` relationship with a `fileName` exists, else `null`.
fn cover_url_of(entry: &Value, id: &str) -> Value {
    let Some(relationships) = entry.get("relationships").and_then(Value::as_array) else {
        return Value::Null;
    };
    for rel in relationships {
        let is_cover = rel.get("type").and_then(Value::as_str) == Some("cover_art");
        let Some(file_name) = rel
            .get("attributes")
            .and_then(|a| a.get("fileName"))
            .and_then(Value::as_str)
        else {
            continue;
        };
        if !is_cover || file_name.is_empty() {
            continue;
        }
        return json!(format!("{COVERS_BASE_URL}/covers/{id}/{file_name}.256.jpg"));
    }
    Value::Null
}

/// Restricts a path-interpolated id to `[A-Za-z0-9-]` (MangaDex ids are
/// UUIDs) so hostile params can't smuggle query segments into the URL.
fn sanitize_id(id: &str) -> Option<&str> {
    if !id.is_empty()
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        Some(id)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Host-call helpers.
// ---------------------------------------------------------------------------

/// Fetch `url` via `host_http_fetch` (GET). Returns the response `body`
/// string on success, or an error message (already mirroring the host's
/// `error.kind`/`error.message` when the host answered with an error
/// envelope; also converts a non-200 status into an error).
fn http_get(url: &str) -> Result<String, String> {
    let body = |t: &Value| t.get("body").and_then(Value::as_str).map(|s| s.to_string());
    let request = match serde_json::to_string(&json!({ "method": "GET", "url": url })) {
        Ok(r) => r,
        Err(e) => return Err(format!("cannot encode http request: {e}")),
    };
    let req_ptr = alloc(request.len() as i32);
    if req_ptr < 0 || !write_bytes(req_ptr as usize, request.as_bytes()) {
        return Err("http: cannot allocate request buffer".to_string());
    }
    // SAFETY: importing the host function; ptr/len are in-region (checked above).
    let envelope_ptr = unsafe { host_http_fetch(req_ptr, request.len() as i32) };
    let envelope = match read_length_prefixed(envelope_ptr) {
        Some(bytes) => match ::std::str::from_utf8(&bytes) {
            Ok(s) => s.to_string(),
            Err(_) => return Err("http: host envelope is not UTF-8".to_string()),
        },
        None => return Err("http: host returned an invalid result buffer".to_string()),
    };
    let value: Value = match serde_json::from_str(&envelope) {
        Ok(v) => v,
        Err(e) => return Err(format!("http: host envelope not JSON: {e}")),
    };
    // The status check + body extraction go through host `json_get` (RFC 6901
    // pointer) to exercise that import; serde_json could do it too.
    let status_value = json_get_pointer(&envelope, "/data/status");
    if value.get("ok").and_then(Value::as_bool) != Some(true) {
        let kind = value
            .get("error")
            .and_then(|e| e.get("kind"))
            .and_then(Value::as_str)
            .unwrap_or("http");
        let message = value
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("host http fetch failed");
        return Err(format!("{kind}: {message}"));
    }
    let status = status_value.and_then(|v| v.as_u64()).unwrap_or(0);
    if status != 200 {
        return Err(format!("MangaDex returned status {status}"));
    }
    match value.get("data").map(body).flatten() {
        Some(body) => Ok(body),
        None => Err("http: missing body in fetch result".to_string()),
    }
}

/// `json_get` host wrapper: `{ "json": <s>, "pointer": "/a/b" }` →
/// `data.value`. Returns `None` when the host errors or the pointer is absent.
fn json_get_pointer(json: &str, pointer: &str) -> Option<Value> {
    let request = serde_json::to_string(&json!({ "json": json, "pointer": pointer })).ok()?;
    let req_ptr = alloc(request.len() as i32);
    if req_ptr < 0 || !write_bytes(req_ptr as usize, request.as_bytes()) {
        return None;
    }
    // SAFETY: importing the host function; bounds checked above.
    let envelope_ptr = unsafe { json_get(req_ptr, request.len() as i32) };
    let envelope = read_length_prefixed(envelope_ptr)?;
    let value: Value = serde_json::from_slice(&envelope).ok()?;
    value.get("data").and_then(|d| d.get("value")).cloned()
}

/// `host_kv_get` wrapper → the stored string, or `None`.
#[allow(dead_code)] // wired into the const-gated KV cache; kept as reference.
fn kv_get(key: &str) -> Option<String> {
    let key_ptr = alloc(key.len() as i32);
    if key_ptr < 0 || !write_bytes(key_ptr as usize, key.as_bytes()) {
        return None;
    }
    // SAFETY: importing the host function; bounds checked above.
    let envelope_ptr = unsafe { host_kv_get(key_ptr, key.len() as i32) };
    let envelope = read_length_prefixed(envelope_ptr)?;
    let value: Value = serde_json::from_slice(&envelope).ok()?;
    value
        .get("data")
        .and_then(|d| d.get("value"))
        .and_then(Value::as_str)
        .map(String::from)
}

/// `host_kv_set` wrapper → true on success (host rc == 0).
#[allow(dead_code)] // wired into the const-gated KV cache; kept as reference.
fn kv_set(key: &str, value: &str) -> bool {
    let key_ptr = alloc(key.len() as i32);
    let val_ptr = alloc(value.len() as i32);
    if key_ptr < 0
        || val_ptr < 0
        || !write_bytes(key_ptr as usize, key.as_bytes())
        || !write_bytes(val_ptr as usize, value.as_bytes())
    {
        return false;
    }
    // SAFETY: importing the host function; bounds checked above.
    unsafe { host_kv_set(key_ptr, key.len() as i32, val_ptr, value.len() as i32) == 0 }
}

fn now_ms() -> i64 {
    // SAFETY: importing the host function.
    unsafe { host_now_ms() }
}

/// `host_log` wrapper (level 2 = info, 0 = error). Best effort; a full
/// region just drops the message.
fn log(level: i32, message: &str) {
    let ptr = alloc(message.len() as i32);
    if ptr < 0 || !write_bytes(ptr as usize, message.as_bytes()) {
        return;
    }
    // SAFETY: importing the host function; bounds checked above.
    unsafe { host_log(level, ptr, message.len() as i32) }
}

// ---------------------------------------------------------------------------
// Envelope / buffer plumbing.
// ---------------------------------------------------------------------------

/// Reads a host-returned buffer: 4-byte LE u32 length + JSON payload.
fn read_length_prefixed(ptr: i32) -> Option<Vec<u8>> {
    if ptr < 0 {
        return None;
    }
    let head = read_range(ptr as usize, 4)?;
    let len = u32::from_le_bytes([head[0], head[1], head[2], head[3]]) as usize;
    read_range((ptr as usize).checked_add(4)?, len)
}

/// Writes the length-prefixed (LE u32 + JSON) response at a fresh `alloc`,
/// returning the pointer (or `-1` when the region is exhausted).
fn emit(envelope: &str) -> i32 {
    let bytes = envelope.as_bytes();
    let ptr = alloc(bytes.len() as i32 + 4);
    if ptr < 0 {
        return -1;
    }
    if !write_bytes(ptr as usize, &(bytes.len() as u32).to_le_bytes())
        || !write_bytes(ptr as usize + 4, bytes)
    {
        return -1;
    }
    ptr
}

fn ok(data: Value) -> String {
    serde_json::to_string(&json!({ "ok": true, "data": data })).unwrap_or_else(|_| {
        r#"{"ok":false,"error":{"kind":"internal","message":"cannot serialize response"}}"#
            .to_string()
    })
}

fn err_envelope(kind: &str, message: &str) -> String {
    serde_json::to_string(&json!({ "ok": false, "error": { "kind": kind, "message": message } }))
        .unwrap_or_else(|_| {
            r#"{"ok":false,"error":{"kind":"internal","message":"cannot serialize error"}}"#
                .to_string()
        })
}

/// Percent-encodes a string the way `urlencoding::encode` does in the
/// compiled-in source: unreserved bytes pass through, every other UTF-8 byte
/// becomes `%XX` (space → `%20`, not `+`).
fn encode(input: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut out = String::with_capacity(input.len());
    for &byte in input.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(byte as char)
            }
            _ => {
                out.push('%');
                out.push(HEX[(byte >> 4) as usize] as char);
                out.push(HEX[(byte & 0x0f) as usize] as char);
            }
        }
    }
    out
}