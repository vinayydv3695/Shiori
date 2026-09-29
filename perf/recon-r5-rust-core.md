# R5 — Rust Core & Build Config Recon (READ-ONLY pass)

Scope: hot-path allocations/clones, sync I/O in async, lock discipline, parsing, release profile, Android target flags.

## Already good
- Release profile is deliberately tuned and documented (`src-tauri/Cargo.toml`): `lto="thin"` (fat OOMs CI), `codegen-units=1`, `strip=true`, `panic="unwind"` with an explicit reason (conversion engine catches worker panics). Do **not** flip to `panic="abort"` without touching `conversion_engine.rs`.
- r2d2 pool (max 8) with per-connection pragmas (`db/mod.rs`); WAL everywhere.
- Blocking ZIP writes in the downloader already use `spawn_blocking` (`commands/sources.rs:786-797`).
- `dashmap`, `parking_lot`, `rayon` are already available dependencies — no new crate needed for parallelism wins.
- Migrations are SAVEPOINT-wrapped and idempotent (`db/migrations.rs`).

## High

### H1. Sync filesystem I/O inside async commands (reader hot path)
- **File:** `src-tauri/src/commands/manga.rs:283-300` — `std::fs::create_dir_all`, `metadata`, `std::fs::write`, `rename` run directly in `async fn get_manga_page_path`. Every page turn blocks a Tokio worker for disk I/O; under preload (3 concurrent workers) this can starve other commands. Move into the same `spawn_blocking` as extraction (R4-H1) and cache the `file_hash` lookup (R2-H2).

### H2. Per-page archive reopen (central-directory parse × every page)
- **File:** `src-tauri/src/services/manga_service.rs:243-263` — see R4-H1. CPU + syscall waste scales with pages read; sequential `preload_pages` loop (`:310-323`) serializes what `rayon`/`JoinSet` could parallelize (bounded).

### H3. `Vec<u8>` clones on the reader cache hit path
- **File:** `src-tauri/src/services/manga_service.rs:215-220` (`entry.data.clone()`), cache storage `:304`. Multi-MB clone per page turn; switch cache to `Arc<[u8]>` (or `bytes::Bytes`) — one allocation at insert, free hits.

## Medium

### M1. Import/mutation paths hold no transaction; write-lock churn
- R2-C1 (import) and R2-H1 (FTS triggers) are fundamentally lock/IO scheduling problems: 1000-chapter import = thousands of autocommit statements. One transaction + batched linkage UPDATE collapses WAL fsyncs and shortens `books`-table write-lock occupancy, unblocking concurrent library reads.

### M2. `reqwest::Client` rebuilt per chapter download
- **File:** `src-tauri/src/commands/sources.rs:728-733` — new client (TLS init, connection pool) per chapter; share one per `AppState` (there may already be one for sources — reuse it).

### M3. `opt-level = "z"` trades speed for size on hot code
- **File:** `src-tauri/Cargo.toml` — size-opt is right for APK, but image decode/resize, FTS, and zip parsing are CPU-bound hot paths. Consider per-profile experiment: `opt-level=3` (or `"s"`) measured against APK size; or keep `"z"` but opt hot crates up via `profile.release.package."image".opt-level = 3` overrides. **Needs measurement (Phase 1 harness), not assumption.**

### M4. Event payload clones in hot loops
- `commands/sources.rs:799-807` clones `chapter_id`/`chapter_title` per page into every progress event (R3-C2). Throttling events removes the allocation too.

## Low
- `MangaState`/`open_books`/`page_cache` behind std `Mutex` with `.unwrap()` (poison = panic across reads) — `manga_service.rs:100-111`; `parking_lot::Mutex` (already a dep) + `unwrap_or_else(|e| e.into_inner())` hardening.
- `get_page_dimensions` decodes image headers while holding the `open_books` lock (`manga_service.rs:328-345`) — move decode out of the critical section.
- `torbox.rs`, `piper_service.rs`, `backup_service.rs` are large files not on the 1000-chapter hot path — defer detailed audit; spot-check during their owning fixer (F7).
- Android: `renderer_cache_mb=32`, conversion workers=1, DB cache capped (`lib.rs:~927-945`, `db/mod.rs:55-58`) — platform-correct; keep.

## Build-size observations
- Heavy optional-ish deps compiled into every target: `symphonia` (audio, `features=["all"]` — likely trimmable to used codecs), `printpdf`, `resvg`+`tiny-skia`, `wasmi`, `ort` (desktop-only, already gated), `pdf-extract`. `cargo bloat` run in Phase 1 will confirm which dominate the `.so`/binary.
- `unrar` is optional but the feature flag wiring wasn't verified in this pass — confirm it's off for Android release builds.
