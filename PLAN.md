# Shiori Extension System — Implementation Plan

Status: Phase 0 (plan) · Scope: extension/source system only (EPUB reader, search, auth/payment untouched)

## 1. Architecture decision

Build ON the existing source architecture — do NOT create a parallel one.

- The repo already defines `pub trait Source` (`src-tauri/src/sources/mod.rs:121-160`): `meta`, `search`, `search_with_meta`, `browse`, `get_chapters`, `get_pages`, `health_check`, `as_any` (async_trait, `Result<_, ShioriError>`).
- Sources are registered into `SourceRegistry` (`sources/registry.rs`: `HashMap<String, Arc<dyn Source>>` + enabled set), held in `AppState.plugin_registry: Arc<tokio::sync::RwLock<SourceRegistry>>` (`lib.rs:44`), and exposed by ~20 commands in `commands/sources.rs` (`list_sources`, `plugin_search`, `plugin_browse`, `plugin_get_chapters`, `plugin_get_pages`, `source_set_enabled`, `source_health`, `set_source_config`, …).
- Caching (`sources/cache.rs`) and challenge handling (`challenge.rs`, `CfClient`, `BrowserRpc`) live at the command/source layer. Extensions stay BEHIND the command layer so caching, enabled-state and error mapping are inherited for free.

**A WASM extension is an adapter**: `WasmSource` implements the existing `Source` trait and forwards calls into a `wasmi` instance. The frontend keeps calling the same commands; it never knows a source is compiled-in or WASM.

## 2. Layout

```
src-tauri/src/extensions/
  mod.rs          — ExtensionManager (install/remove/enable/list), manifest model, storage paths
  abi.rs          — serde DTOs for the wasm ABI (request/response envelopes, meta/search/chapters/pages)
  runtime.rs      — wasmi engine, instance lifecycle, fuel/timeout guard, memory limits
  host.rs         — host functions: scoped http_fetch, html/json helpers, kv storage, log, clock
  wasm_source.rs  — `Source` impl bridging to a live instance (Mutex-serialized calls)
  repo.rs         — remote repository index fetch + install-from-repo (Phase 3)
src-tauri/tests/extensions_host.rs — integration tests (malformed module, timeout, crash isolation)

app_data_dir()/extensions/<id>/
  manifest.json   — installed manifest (id, name, lang, version, min_app_version, nsfw, content_type, permissions)
  source.wasm     — the module
  storage.json    — per-extension KV storage (size-capped)
```

New `AppState.extensions: Arc<RwLock<ExtensionManager>>` field, constructed in `setup` exactly like `plugin_registry` (`lib.rs:790`).

## 3. ABI (JSON envelope over wasm memory)

- Extension exports: `memory`, `alloc(len: i32) -> i32`, `invoke(ptr: i32, len: i32) -> i32` (returns pointer to a length-prefixed JSON response).
- Request: `{ "method": "meta" | "search" | "browse" | "chapters" | "pages" | "health", "params": { … } }`.
- Response: `{ "ok": true, "data": … }` or `{ "ok": false, "error": { "kind": "…", "message": "…" } }`.
- Mapping to existing structs in `abi.rs` (`SourceMeta`, `SearchResult`, `SearchResponse`, `Chapter`, `Page`, `SourceHealth`), with wasm errors mapped to `SourceError::Unknown(String)` (variant info is lost by design — acceptable; flagged).

## 4. Host functions (allowlist only)

| Function | Rules |
|---|---|
| `http_fetch(req_json)` | Only hosts listed in the manifest `permissions.hosts` (exact/suffix match). Method allowlist GET/POST. Timeout 15 s, max response 8 MB, max redirects 5, UA set by host. No cookies jar sharing. |
| `kv_get` / `kv_set` | Per-extension `storage.json`, key ≤ 256 B, value ≤ 64 KB, total ≤ 1 MB. |
| `html_select` / `json_get` | Pure helpers implemented host-side (scraper / serde_json) so extensions need no parser WASM bloat. |
| `log(level, msg)` | Routed to `log` crate with extension id prefix. |
| `now_ms()` | Clock for cache-busting. |

No filesystem, no process, no raw sockets, no Tauri APIs. All host calls have wall-clock guards and bounded allocations.

## 5. Security model (extensions are untrusted)

- `wasmi` = interpreter, no JIT (safe on Android/App Store builds; pure Rust; compatible with current `tokio full` + `rustls` stack).
- Per-call **fuel budget** (wasmi metering) + wall-clock timeout (e.g. 10 s) → trap → `SourceError::Unknown("timeout")`.
- **Memory cap** per instance (e.g. 64 MB on armv7, 128 MB elsewhere) via `wasmi` `ResourceLimiter`.
- Crash isolation: a trapping instance is dropped; the registry entry degrades to a disabled/error state; repeated traps (3) auto-disable with a UI-visible reason.
- Host functions re-validate everything (never trust extension-provided sizes/pointers beyond memory bounds).
- Signed manifests are out of scope for v1; integrity = repo index over HTTPS + optional sha256 in manifest (verify on install). Flagged as a follow-up (minisign/ed25519 later).

## 6. RSS / TorBox migration path (flagged deviation)

The task suggests RSS as the first migrated source. **RSS is the hardest fit, not the easiest**: it lives wholly outside `SourceRegistry` (own SQLite tables `rss_feeds`/`rss_articles`, `feed_rs` parser, `tokio_cron_scheduler`, no `ContentType`, feed→articles→content semantics vs search→chapters→pages), and its scheduler emits no events.

Plan:
- **Reference migration = a simple registry source** (e.g. `weebrook`/`toontop`): port one HTTP+HTML source to the wasm ABI as the reference extension, keeping the compiled-in impl registered until parity is proven (dual-path behind a build-time flag / registry priority: wasm entry shadows compiled-in id when enabled).
- RSS becomes a **Phase 5b** item: either (a) a thin `Source` adapter over `rss_service` exposing feeds as `browse` results and articles as chapters, dual-pathed behind a preference; or (b) a separate extension kind (`feed` content type) added to `ContentType`. Decision deferred until the ABI is proven; flagged as an open question.
- TorBox stays as-is (separate feature, not a Source; Nyaa/Anna's Archive already integrate it via capabilities).

## 7. Phases & gates

| Phase | Deliverable | Gate |
|---|---|---|
| 0 | This PLAN.md, committed | — |
| 1 | `extensions/` module + wasmi runtime + ABI + hello-world module (built from WAT via `wat` dev-dep — no wasm32 toolchain needed) proving meta/search end-to-end | `cargo check` + `cargo test --lib extensions` (targeted; watch memory/disk) |
| 2 | Manifest + local manager (install from local .wasm, list, enable/disable, remove) + `WasmSource` registered into the registry | same |
| 3 | Repository index (JSON) fetch + install/update-from-repo flow (sha256 verify) | same |
| 4 | React "Extensions" UI inside the existing Community Plugins settings tab (`SettingsDialog.tsx:298`) + store + command wrappers | `npx tsc -b`, targeted eslint, `npx vitest run` |
| 5 | Reference source migrated to WASM (dual-path, no user-visible break) | same as 1 + manual parity checklist |
| 6 | Tests (malformed, timeout, crash isolation) + `docs/extensions/README.md` author guide | same as 1 |

Per-phase: worker(s) → reviewer → commit. `cargo check` only (no `cargo build`); memory + disk watched (`/tmp/shiori_agents/mem5.log`).

## 8. Repo-specific constraints & risks (from recon)

1. **No CI cargo gates** exist (release.yml only bundles). Tests run locally; adding extension tests does not change CI behavior.
2. **Build-time wasm compilation is a trap**: CI installs only Android rust targets, hosts lack `wasm32-unknown-unknown`. Therefore: the reference extension's `.wasm` is produced offline by an author script and **checked in / installed from file**; tests build tiny modules from WAT in-process.
3. **`as_any` downcasts** (`mangafire.rs:780`) mean some code expects concrete types — `WasmSource` must answer `as_any` with itself and never be cast to a compiled-in type.
4. **Link memory**: profile uses `codegen-units=1`, thin LTO; a comment in Cargo.toml warns fat LTO OOMs on 15 GB hosts. `wasmi` adds link weight — watch `cargo check`/link memory; do not enable fat LTO.
5. **Android/armv7**: interpreter only, no dlopen; cap instance memory conservatively on 32-bit.
6. **Frontend hardcodes**: `sourceStore.ts` `DEFAULT_SOURCES` + zustand migrate/merge keyed by id; dynamic sources must merge without breaking stored state. `SourceManager.tsx` already says "Plugin Community".
7. **ContentType is `Manga | Book`** only — an extension manifest carries it; RSS/feed kind needs an enum addition or a separate path (open question above).
8. **Capabilities**: host functions live in Rust, so no new Tauri capability/permission is needed; `assetProtocol` scope already covers `$APPLOCALDATA/**` for extension assets.
9. **Persistence**: extension config can reuse the existing `sources.json` store pattern (`lib.rs:563-575`); KV storage is separate per-extension file.

## 10. Status — COMPLETE (all phases implemented, 2026-09-25)

| Phase | Status | Evidence |
|---|---|---|
| 0 Plan | ✅ | this file |
| 1 Runtime + ABI + hello-world | ✅ | 13 tests, `2ee8ca15` |
| 2 Manifest + local manager + app wiring | ✅ | 26 tests, `5c996262` |
| 3 Repo index + install/update + sha256 | ✅ | 32 tests (wiremock), `2ecbab56` |
| 4 Extensions UI | ✅ | tsc clean, `dd927b7a` |
| 5A Real host functions (HTTP/HTML/JSON) | ✅ | 48 tests, `ccd8ee39` |
| 5B Reference WASM extension (torrents-csv) | ✅ | wasm32 check 0 warnings, `1f32f7f4` |
| 6 Author docs + hardening tests | ✅ | 50 tests, 351-line guide, `e171b3d4` |

**Verification**: `cargo check` clean; `cargo test --lib extensions` 50/50 at every phase (re-run independently by the orchestrator); Phase 4: `tsc -b` clean, vitest 235 pass (4 pre-existing failures in unrelated DownloadQueuePanel/OnlineMangaDetailView tests).

**Not verified locally**: Android target `cargo check` (aborts in `ring`'s build script without the NDK toolchain env that `tauri android build` sets up — pre-existing environment constraint, unrelated to wasmi, which is pure Rust). CI's Android release build covers this.

**Open questions (unchanged)**: (1) reference migration choice — torrents-csv was used instead of RSS (RSS remains a poor `Source` fit; see §6); (2) repository index URL is a placeholder pending GitHub Pages hosting; (3) v1 integrity is sha256-only (ed25519 signing later); (4) dual-path shadow limitation noted in §5/Phase 5 note.

## 10. Original open questions (kept for reference)

1. Reference migration target: simplest registry source (proposed) vs RSS adapter (task's suggestion) — RSS is a poor trait fit today.
2. Repo index URL (GitHub Pages) — placeholder constant + settings override until you host one.
3. Signature scheme for extensions in v1 (proposed: sha256-only; ed25519 later).

## Phase 5 note (Phase 5B: reference WASM extension)

**Dual-path registration semantics.** Compiled-in sources register first; enabled WASM
`WasmSource` entries register afterwards in the same `SourceRegistry` (id = the extension's
`meta.id`). Because a registry key can hold only one source:

- A wasm extension whose id **equals** a compiled-in id **shadows** the compiled-in source
  for the rest of that session (host-side: `WasmSource` is a distinct `Source` object, so
  `as_any` downcasts to a compiled-in type stay invalid for it — expected, same as any
  dynamic source).
- Disabling or removing that wasm source does **not** restore the compiled-in one until the
  app restarts (the compiled-in entry was displaced at registration time, not deleted).
- Accepted v1 limitation: the reference `torrents-csv-extension` uses a **distinct** id
  (`torrents_csv_wasm`) precisely to keep the compiled-in `torrents-csv` reachable during
  the parity phase; shadowing semantics kick in for later same-id migrations.

**Build note.** The reference extension's `.wasm` is produced offline by
`scripts/build-extension.sh` (not by CI, per §8.2) and shipped/installed from file.
