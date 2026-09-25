# Shiori Extensions — author guide

Shiori sources are services that implement the `Source` trait (`src-tauri/src/sources/mod.rs`) and are
registered into the `SourceRegistry` (`sources/registry.rs`). An **extension** is a WebAssembly module that
implements the same trait — through a `WasmSource` adapter that wraps a sandboxed `wasmi` instance
(`src-tauri/src/extensions/wasm_source.rs`, `runtime.rs`). To the frontend and the command layer, a WASM
extension is indistinguishable from a compiled-in source: same `search`, `browse`, `get_chapters`,
`get_pages`, `health_check` calls, same caching, same error mapping.

An extension can never host filesystem/process access: all it can do is answer method calls over a JSON
ABI and call a fixed set of **host functions** (`shiori.*` imports) for network, HTML/JSON helpers,
key-value storage, logging and the clock. Every capability is bounded and allowlisted host-side.

```
frontend → tauri commands → SourceRegistry → WasmSource → wasmi instance ⇄ extension module
                                                        └→ shiori.* host functions (allowlisted)
```

---

## 1. The ABI

### Exports (required, fail-fast at load)

| Export | Signature | Purpose |
|---|---|---|
| `memory` | linear memory | shared scratch space for all requests/responses |
| `alloc` | `(i32) -> i32` | bump allocation of `n` bytes; returns a pointer (or `-1` if impossible) |
| `invoke` | `(i32, i32) -> i32` | `(req_ptr, req_len)`; returns a pointer to the response buffer |

### Buffer convention

Every pointer returned by the extension *and* every pointer returned by a pointer-returning host function
points into the extension's linear memory at a **length-prefixed buffer**: the first 4 bytes are a
little-endian `u32` byte-length, followed by that many JSON bytes.

### Envelope

Request written by the host into memory before `invoke`:

```json
{ "method": "meta", "params": { } }
```

Response returned by the extension (and by pointer-returning host functions):

```json
{ "ok": true, "data": { } }
{ "ok": false, "error": { "kind": "…", "message": "…" } }
```

An extension may pass through a host-function envelope verbatim as its own response.

### Methods

`method` ∈ `meta` | `search` | `browse` | `chapters` | `pages` | `health`. Result shapes mirror the
Rust structs exactly — **all keys are camelCase**.

| Method | `params` | `data` (on `ok: true`) |
|---|---|---|
| `meta` | `{}` | `SourceMeta`: `{ "id", "name", "baseUrl", "version", "contentType": "book"\|"manga", "supportsSearch": bool, "supportsDownload": bool, "requiresApiKey": bool, "nsfw": bool }` |
| `search` | `{ "query": string, "page": u32 }` | `[SearchResult]` |
| `browse` | `{}` | `[SearchResult]` |
| `chapters` | `{ "contentId": string }` | `[Chapter]` |
| `pages` | `{ "chapterId": string }` | `[Page]` |
| `health` | `{}` | `"available"` \| `"unavailable"` |

```jsonc
// SearchResult
{ "id": "…", "title": "…", "coverUrl": null, "description": null,
  "sourceId": "torrents_csv_wasm", "extra": { "seeders": "123" } }   // extra: string→string only

// Chapter
{ "id": "…", "title": "…", "number": 1.0, "volume": null, "uploadedAt": null,
  "sourceId": "…", "contentId": "…" }

// Page
{ "index": 0, "url": "…" }
```

On any error, return the error envelope with a stable `kind` (e.g. `"input"`, `"unsupported"`); the host
maps it to a `SourceError` at the trait boundary.

---

## 2. Host functions (import module `shiori`)

All seven are registered for every instance. Pointer-returning host functions use the same
length-prefix + envelope convention as `invoke`. The host **never trusts** extension input: every
`(ptr, len)` is bounds-checked against linear memory before use, and all caps are enforced host-side.

| Import | Signature | Request (bytes at ptr) | Result | Limits | Error kinds |
|---|---|---|---|---|---|
| `host_http_fetch` | `(i32, i32) -> i32` | `{ "method": "GET"\|"POST", "url": "https://…", "headers": {"k":"v"}?, "body": "…"? }` | envelope `{ "ok": true, "data": { "status": 200, "headers": {"k":"v"}, "body": "…" } }` | **allowlist-gated** (see §5); 15 s timeout; 8 MiB response-body cap; ≤ 5 redirects; scheme rule; UA forced to `Shiori-Extension/<id>`; headers forwarded lowercased, string values only | `http_disabled` (host not allowlisted — checked before any network), `http` (bad request / transport / timeout / over cap / too many redirects) |
| `html_select` | `(i32, i32) -> i32` | `{ "html": "…", "selector": "<css>", "attr": "text"\|"html"\|"<attr>", "limit"?: n }` | envelope `{ "ok": true, "data": { "items": ["…"] } }` | `html` ≤ 4 MiB; `limit` defaults 100, clamps to 1000; `attr` default `"text"` (descendant text, trimmed, space-joined); `"html"` = inner HTML; else attribute lookup | `html` |
| `json_get` | `(i32, i32) -> i32` | `{ "json": "…", "pointer": "/a/b/0" }` | envelope `{ "ok": true, "data": { "value": <json> } }` | `json` ≤ 4 MiB; RFC 6901 pointer (`serde_json` `pointer`) | `json` |
| `host_kv_get` | `(i32, i32) -> i32` | key bytes | envelope `{ "ok": true, "data": { "value": "…" } }` when present, `data: null` when absent | key ≤ 256 B | `kv` |
| `host_kv_set` | `(i32, i32, i32, i32) -> i32` | key + value bytes | plain `i32`: `0` ok, `1` size cap exceeded, `2` invalid args | key ≤ 256 B, value ≤ 64 KiB, store total ≤ 1 MiB; **persisted to `storage.json` on every write** | (return code, no envelope) |
| `host_log` | `(i32, i32, i32) -> ()` | `(level, msg_ptr, msg_len)` raw bytes | — | level ≤ 0 error, 1 warn, 2 info, else debug; message ≤ 4096 B (truncated) | — |
| `host_now_ms` | `() -> i64` | — | unix epoch milliseconds | — | — |

Notes:

- `html_select` and `json_get` are registered **without** a `host_` prefix (import names are exactly
  `html_select`, `json_get`).
- There is no JSON body for raw-`i32` host functions (`host_log`, `host_now_ms`, `host_kv_set` args,
  `host_kv_get` key) — those take plain bytes, not envelopes.
- The instance wall-clock guard (10 s) brackets every `invoke`; a fetch nearing its 15 s budget can be
  cut by the call guard first.

---

## 3. Manifest

For local installs the manifest is **derived from the extension's own `meta` response** and then
validated host-side — the extension never supplies a manifest file, so a lying `meta` payload is
rejected before anything is written to disk. `permissions` always start empty (deny-all network); an
install/update policy fills them in later.

Stored as `manifest.json` (camelCase; immutable once installed — user state lives in `state.json`):

```json
{
  "id": "hello.test",
  "name": "Hello WASM",
  "version": "0.1.0",
  "lang": "en",
  "baseUrl": "https://example.test",
  "contentType": "book",
  "nsfw": false,
  "minAppVersion": "1.0.15",
  "permissions": { "hosts": ["https://api.example.test"] }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `^[a-z0-9][a-z0-9._-]{1,63}$` (2–64 chars). Doubles as the install directory name — keep it conservative. |
| `name` | string | yes | human-readable |
| `version` | string | yes | non-empty (semver-ish; compared as numeric dot-segments by the updater) |
| `lang` | string | no | e.g. `"en"` |
| `baseUrl` | string | no | canonical base URL; empty in `meta` → omitted |
| `contentType` | `"book"` \| `"manga"` | yes | |
| `nsfw` | bool | yes | |
| `minAppVersion` | string | no | minimum app version required; checked by the installer |
| `permissions.hosts` | string[] | yes | http-fetch allowlist; **empty = deny all network** (safe default) |

Validation rules (`manifest.rs::validate`): non-empty id matching the charset above; non-empty version;
every `permissions.hosts` entry must be a scheme-full `https://…` URL with a non-empty authority and no
whitespace — scheme-less or `http://` entries are rejected at install.

`permissions.hosts` gates **every** `host_http_fetch` call, before any network work:

- A **bare host** entry (e.g. `api.example.test`) means *https-only* for that host.
- An `http://`-prefixed entry (`http://127.0.0.1`) permits *cleartext for that host only* — matched by
  scheme **and** host.
- Matching is exact host or subdomain suffix (`cdn.example.test` matches `example.test`;
  `evil-example.test` does not). Ports and paths in an entry are ignored.

---

## 4. Repository index

A repository is a JSON `index.json` (default: `DEFAULT_REPO_URL` in `repo.rs`, a placeholder GitHub
Pages URL; every command accepts an override):

```json
{
  "version": 1,
  "extensions": [
    {
      "id": "torrents_csv_wasm",
      "name": "Torrents CSV (WASM reference)",
      "lang": null,
      "version": "1.0.0",
      "minAppVersion": null,
      "iconUrl": null,
      "downloadUrl": "https://yoursite.example/shiori-extensions/torrents-csv-extension.wasm",
      "nsfw": false,
      "sha256": "…64 hex chars…",
      "contentType": "book"
    }
  ]
}
```

- `version` is the index format version; `extensions[]` is [`RepoEntry`] (camelCase; unknown fields are
  tolerated).
- **`sha256` is the integrity rule**: when present (recommended, and case-insensitive hex), the
  downloaded module is verified against it **before** anything is installed. A mismatch is a hard error
  and nothing is written — not even the install directory (see `wrong_sha256_fails_and_nothing_is_installed`).
- Caps: index ≤ 2 MiB, module ≤ 32 MiB, 15 s repo timeout.

## 5. Build & package

The host machines (and CI) do **not** have the wasm32 target — modules are built author-side and
distributed, never compiled by the app.

```bash
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown \
    --manifest-path extensions/torrents-csv-extension/Cargo.toml
sha256sum target/wasm32-unknown-unknown/release/libtorrents_csv_extension.wasm
```

`scripts/build-extension.sh` wraps exactly this (adds the target if missing, pins `CARGO_TARGET_DIR`,
copies the artifact to `dist/torrents-csv-extension.wasm`, then prints the sha256 + index steps).
Then:

1. Publish the `.wasm` somewhere stable (GitHub Pages works).
2. Add a `RepoEntry` for it to your `index.json` with the exact sha256, a `contentType`, and the
   `permissions.hosts` your extension needs (e.g. `["https://torrents-csv.com"]`).
3. Users install from the repository; the app fetches the index, downloads, verifies, installs.

Extension `Cargo.toml` requirements: `[lib] crate-type = ["cdylib"]`, `panic = "abort"` in release (WASM
has no unwinder), and an empty `[workspace]` table to keep the crate out of the app workspace. Keep
dependencies lean — network and parsing go through host functions.

## 6. Security model (extensions are untrusted)

- **Interpreter only**: `wasmi`, no JIT — one sandbox, no unsafe-host-surface differences across
  platforms.
- **Fuel**: every instruction consumes fuel; each call gets a fresh budget (default 10 M units). Runaway
  loops trap (`OutOfFuel`) → `Timeout` error.
- **Wall clock**: a 10 s `Instant` guard brackets every `invoke` as a second line behind fuel.
- **Memory cap**: linear memory is capped (default 64 MiB) via wasmi's resource limiter; growing past it
  traps → `MemoryLimit` error.
- **Host caps**: every host function has hard caps (see table in §2) and bounds-checks every pointer
  before use.
- **No ambient power**: no filesystem, no process spawn, no raw sockets, no Tauri APIs. The only
  network egress is `host_http_fetch`, gated by the allowlist (empty = deny all; deny is decided
  **before** any network work), with the UA forced to `Shiori-Extension/<id>`.
- **Crash isolation**: a trapping extension surfaces a typed error, never a panic. The same instance
  keeps answering subsequent calls with errors (no hang, no wedging), and a misbehaving extension can
  never take the app down. Garbage modules fail cleanly at load/install with a `Load` error; broken
  install directories are skipped by the scanner without failing the app.

## 7. Versioning & updates

- `minAppVersion` in the manifest/index lets you gate on the running app; the installer checks it.
- Update detection (`repo.rs::find_update`) compares versions as numeric dot-segments; equal numbers are
  no update, and different-but-unparsable strings count as an update (never an automatic refusal).
- **Update flow**: fetch index → find a newer entry → download → **verify sha256 before replacing** →
  only then is the installed copy replaced. On mismatch the existing install is untouched.
- Enabled state is stored separately in `state.json` (`{ "enabled": bool }`), which survives module
  replacement; `manifest.json` stays immutable once installed.
- **Dual-path note**: a WASM source registers in the `SourceRegistry` under its `meta.id`. An id equal
  to a compiled-in source shadows the compiled-in entry for the rest of the session, and disabling or
  removing it does not restore the compiled-in one until the app restarts (the compiled-in entry is
  displaced at registration time, not deleted). The reference extension deliberately uses the distinct
  id `torrents_csv_wasm` so `torrents-csv` stays reachable during the parity phase.

---

## 8. Writing an extension — hello example

A minimal Rust extension (compile as in §5). The bump region only needs to hold one call's worth of
buffers: the host resets nothing, but the guest cursor can be reset at the top of every `invoke`.

```rust
// src/lib.rs
use serde_json::{json, Value};

const ID: &str = "hello.test";
const NAME: &str = "Hello WASM";
const VERSION: &str = "0.1.0";

#[link(wasm_import_module = "shiori")]
extern "C" {
    fn host_now_ms() -> i64; // every `shiori.*` import your module uses — declare them all here
}

static mut BUMP: [u8; 65536] = [0; 65536];
static mut CURSOR: usize = 0;

/// Bump allocator — host and guest both allocate from this region.
#[no_mangle]
pub extern "C" fn alloc(len: i32) -> i32 {
    if len < 0 { return -1; }                       // host turns -1 into a clean error
    let n = len as usize;
    // SAFETY: single wasmi thread; CURSOR only reset from invoke.
    let base = unsafe { CURSOR };
    let Some(end) = base.checked_add(n) else { return -1; };
    if end > BUMP.len() { return -1; }
    unsafe { CURSOR = end; }
    base as i32
}

fn read(ptr: i32, len: i32) -> Option<String> {     // bounds-checked copy out of BUMP
    if ptr < 0 || len < 0 { return None; }
    let p = ptr as usize;
    let end = p.checked_add(len as usize)?;
    if end > BUMP.len() { return None; }
    // SAFETY: validated range, single-threaded guest.
    let bytes = unsafe { core::slice::from_raw_parts(BUMP.as_ptr().add(p), len as usize) };
    String::from_utf8(bytes.to_vec()).ok()
}

fn reply(json: &str) -> i32 {                       // 4-byte LE length prefix + JSON
    let bytes = json.as_bytes();
    let out = alloc(bytes.len() as i32 + 4);
    if out < 0 { return -1; }
    // SAFETY: validated by alloc; write prefix + payload into BUMP at `out`.
    unsafe {
        core::ptr::write_unaligned(
            BUMP.as_mut_ptr().add(out as usize).cast::<u32>(), bytes.len() as u32);
        core::ptr::copy_nonoverlapping(
            bytes.as_ptr(), BUMP.as_mut_ptr().add(out as usize + 4), bytes.len());
    }
    out
}

fn ok(data: Value) -> i32   { reply(&json!({ "ok": true, "data": data }).to_string()) }
fn err(kind: &str, msg: &str) -> i32 {
    reply(&json!({ "ok": false, "error": { "kind": kind, "message": msg } }).to_string())
}

#[no_mangle]
pub extern "C" fn invoke(req_ptr: i32, req_len: i32) -> i32 {
    let Some(req) = read(req_ptr, req_len).and_then(|s| serde_json::from_str(&s).ok())
    else { return err("input", "request is not JSON"); };
    match req["method"].as_str() {
        Some("meta") => ok(json!({
            "id": ID, "name": NAME, "baseUrl": "", "version": VERSION,
            "contentType": "book", "supportsSearch": true,
            "supportsDownload": false, "requiresApiKey": false, "nsfw": false,
        })),
        Some("search") => ok(json!([{ "id": "1", "title": "Result One",
            "coverUrl": null, "description": null, "sourceId": ID, "extra": {} }])),
        Some("health") => { let _ = unsafe { host_now_ms() }; ok(json!("available")) }
        _ => err("unsupported", "method not implemented"),
    }
}
```

## 9. The reference extension

`extensions/torrents-csv-extension/` (`dist/torrents-csv-extension.wasm`) is the production-quality
example — a port of the compiled-in `torrents-csv` source. Read it for:

- the full imports block (`host_log`, `host_now_ms`, `host_kv_get`, `host_kv_set`, `host_http_fetch`,
  `json_get` — names/types must match `host.rs::register_host_functions` exactly);
- the 12 MiB bump region sized for a maxed-out 8 MiB fetch body plus request + response;
- `http_get()`: writing a `{ "method": "GET", "url": … }` request, calling `host_http_fetch`, reading
  the length-prefixed envelope, passing through host `error.kind`/`error.message` verbatim;
- the KV response-cache pattern (`host_kv_get`/`host_kv_set`, keyed `search:<page>:<query>:<limit>`);
- camelCase results, error envelopes instead of panics, and the convention that the guest never
  `unwrap()`s untrusted input.

Implementation reference: `src-tauri/src/extensions/{abi,runtime,host,manifest,manager,repo}.rs` and the
host-side tests in those modules are the normative spec; the PLAN (`PLAN.md`) describes the architecture
and the security/dual-path trade-offs.