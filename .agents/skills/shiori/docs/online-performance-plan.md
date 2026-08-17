# Online Section Performance Plan

**Status:** Proposed · **Owner:** online-sources + frontend · **Goal:** cold-load online manga/books in < 3s, chapter lists of 1000+ chapters in < 10s cold / < 100ms warm, zero unbounded memory growth.

---

## 1. Why it's slow today (recon, with evidence)

### Root cause #1 — MangaFire/ManhwaRead recreate a hidden webview for EVERY request (the 40s One Piece problem)

`MangaFireSource::fetch_rpc` → `evaluate_js_on_site` → `run_rpc_once`:

- `src-tauri/src/sources/mangafire.rs`: `run_rpc_once` builds a **new** hidden webview per call (`window_label = format!("mf-rpc-{}", uuid)`, navigates to `https://mangafire.to/filter`, waits for `extendClient`, runs the fetch, streams the result back through `document.title` chunks, then closes the window).
- The **global `rpc_lock` serializes all webview RPCs** (`mangafire.rs` ~line 120: `let _lock = self.rpc_lock.lock().await;` held across the whole call). `PAGE_FETCH_CONCURRENCY = 4` in `fetch_all_chapter_items` is therefore illusory on the slow path — everything runs one-at-a-time.
- One Piece ≈ 1150 chapters ÷ 200/page = **6 API pages**. No CF session → 6 serialized webview spin-ups ≈ 5–8s each ≈ **40s total**. Matches the user report exactly.
- Fast path exists (`CfClient::get_xhr`) but only works when a valid Cloudflare session is stored; otherwise it silently falls through to the webview.
- Same pattern in `src-tauri/src/sources/manhwaread.rs` (also uses `WebviewWindowBuilder`).

### Root cause #2 — no disk cache anywhere for source data

- `src-tauri/src/sources/cache.rs` is in-memory only (`Mutex<HashMap<String, (Instant, T)>>`, 50-entry cap, TTL).
- MangaFire: chapters TTL 10 min, pages TTL 30 min; **search is NOT cached at all** (ToonGod caches search, MangaFire doesn't).
- Every app restart → full re-fetch of everything. In-memory caches die on exit.

### Root cause #3 — image proxy re-downloads every image, every time

- `shiori-proxy` scheme handler (`src-tauri/src/lib.rs` ~line 160): fetches upstream per request, sets `Cache-Control: public, max-age=31536000` but **never stores anything on disk**; custom-scheme responses are not reliably cached by the OS webview. Covers re-download on every browse session.
- `proxy_manga_image` command (`src-tauri/src/commands/sources.rs` ~line 287) — same, no cache, returns `Vec<u8>` (full image buffered in RAM + IPC).

### Root cause #4 — unbounded blob cache in the reader (memory leak)

- `src/components/manga/hooks/useUnifiedImageDecode.ts` (~line 15): `const onlineImageCache = new Map<string, string>()` — **unbounded**, and blob URLs are **never revoked** ("Don't revoke cached URLs - they may be used elsewhere"). Reading chapters all day = blob memory grows forever.
- `useMangaPreloader.ts` has a proper byte-bounded LRU — it just isn't the one used by the online path.

### Root cause #5 — books search has no cache/abort, and slow sources

- `src/hooks/useGlobalSearch.ts`: three fetchers already run in parallel (`Promise.allSettled`) and render progressively — good. But: no caching (libgen HTML scrape + annas mirror probing + gutenberg API are inherently 3–10s), no `AbortController` on query change (stale responses race), and every page append re-runs filter+sort over the whole accumulated array (O(n²) at scale).
- The 5–10s "covers take to appear" for books = upstream latency + zero caching, repeated every session.

### What's already good (don't regress)

- Chapter list is virtualized (`@tanstack/react-virtual` in `OnlineMangaDetailView.tsx`).
- Books search fetchers are parallel and progressive.
- Reader has a byte-bounded LRU (`useMangaPreloader`) + `preloadIntensity` setting.
- `is_safe_url` SSRF guard in the proxy — never weaken.
- Hidden RPC webviews ARE closed on done/error/timeout (no webview leak today, only spin-up cost).
- Android path (`android_saf().evaluate_javascript`) is separate — keep it intact.

---

## 2. Design principles (memory guardrails — non-negotiable)

Every slice obeys these:

1. **Every cache is bounded in BOTH entries and bytes.** LRU/oldest eviction; never a bare `Map` or `HashMap` without a cap.
2. **Disk caches are swept at startup** (expired-by-TTL + over-cap LRU eviction) and have hard caps: source data ≤ 256 MB, images ≤ 512 MB.
3. **Exactly one warm RPC webview per Cloudflare source.** Never accumulate; watchdog respawns a dead one; destroyed on app exit. No per-call webviews after Slice 1.
4. **Stream, don't buffer.** Image proxy streams chunks; nothing > 25 MB is held fully in RAM (existing cap retained).
5. **Blob URLs are revoked on eviction** (and on chapter change for stale chapters).
6. **Clear commands + visible stats** for every cache (UI in Slice 9) so users can free space.
7. **Nothing loads offscreen** — lazy loading + intersection-based fetch + a concurrency cap for cover fetches.

---

## 3. Slices

Order matters: 1+2 kill the 40s problem, 4+5 kill the cover latency, 3 makes repeat visits instant, 6 is memory safety, 7 books, 8 warmup, 9 observability.

### Slice 1 — Persistent warm RPC webview (kills webview spin-up per call)

**Goal:** one long-lived hidden webview per CF-protected source (mangafire, manhwaread), reused for all RPCs.

**Changes (backend):**
- New module `src-tauri/src/sources/browser_rpc.rs`: `BrowserRpc` service. Owns a single hidden `WebviewWindow` per source + a request/response queue:
  - JS-side: request IDs (`SHIORI_REQ|<id>|<script>` written via `window.eval` on the warm webview), response streamed back with the existing chunked `document.title` ACK handshake (`SHIORI_CHUNK|` / `SHIORI_DONE|` / `SHIORI_ERROR|`), tagged with the request id (`SHIORI_RESP|<id>|`).
  - Rust-side: `call(script) -> Result<String>`, `warm()`, `destroy()`; 60s per-request timeout (unchanged); watchdog: if the webview dies or a request times out twice in a row, recreate the webview (bounded: max 3 respawns/min) and fall back to the old per-call path on repeated failure.
- `MangaFireSource`/`ManhwaReadSource`: replace `evaluate_js_on_site`/`run_rpc_once` bodies with `browser_rpc.call(...)`; **keep the `get_xhr` fast path first** (it's cheapest). Keep the Android branch exactly as-is (feature-flagged off — desktop only).
- `lib.rs` setup: after CF session hydration, spawn `rpc.warm()` for mangafire (async, non-blocking).
- Register a `BrowserRpc` in `AppState` (behind `tokio::sync::RwLock` like `plugin_registry`).

**Contract:** `Source` trait unchanged. New internal API only: `BrowserRpc::call(script: &str) -> Result<String>`.

**Memory guardrails:** exactly 1 webview/source; `destroy()` on exit (`RunEvent::Exit`); watchdog respawn bounded.

**Acceptance:** cold `plugin_get_chapters` for a 6-page series drops from ~40s to ~8–15s (network-bound, no spin-up); warm (Slice 2) instant.
**Tests:** unit — queue ordering, timeout → respawn, error mapping (`map_rpc_error` retained); existing `cache_*` tests still pass.
**Gates:** `cargo test` (sources crate), `cargo clippy`, manual `npm run dev` smoke: mangafire search → chapters → read.

### Slice 2 — Batch multi-page chapter fetch inside ONE RPC (the One Piece fix)

**Goal:** fetch all chapter pages of a series inside a single JS execution, not N RPCs.

**Changes (backend, mangafire.rs):**
- `fetch_all_chapter_items` gains a batched mode: build one JS script that, inside the warm webview (already same-origin with mangafire.to), loops `page = 1..last_page` calling `window.myAxios.get(...)` for each and `JSON.stringify`s the array of all items. One RPC returns everything.
- Keep the existing in-Rust loop as fallback (per-page fetch on batched-failure, partial results preserved — existing behavior).
- Chapter construction/dedup (`build_chapters`) unchanged. `get_chapters` signature/contract unchanged.

**Acceptance:** One Piece cold: 1 RPC instead of 6 → ~5–10s total (network + JSON). Warm: 0s (Slice 3 disk cache).
**Tests:** unit — batched parse, partial-failure fallback, dedup; existing tests updated where the fetch fn shape changes.
**Gates:** `cargo test`, `cargo clippy`, manual One Piece timing on mangafire.

### Slice 3 — Disk cache for source data (repeat visits become instant)

**Goal:** search / browse / chapters / pages survive restarts.

**Changes (backend):**
- New `src-tauri/src/services/source_cache.rs`:
  - Key: `sha256("{source_id}:{kind}:{key}")`; value file = serde_json payload + meta sidecar (cached_at, size). Directory: `<app_data_dir>/source_cache/`.
  - Write = temp file + rename (atomic). Read = single file read.
  - Eviction: on startup sweep (delete expired + LRU-evict down to 256 MB cap) and on each write (bounded, cheap).
  - TTLs: search/browse 1 h, chapters 12 h, pages 24 h.
- Wire in: mangafire (search + browse + chapters + pages), toongod (search + chapters), manhwaread. Pattern: `disk_cache_get_or_fetch(cache, key, ttl, || fetch().await)` — memory cache first (existing `sources/cache.rs`), disk second, network third. Same helper style as `cache_get_or_fetch` so tests are trivial.
- New commands: `get_source_cache_stats() -> { entries, size_bytes, max_bytes }`, `clear_source_cache()`.

**Contract:** no changes to `Source` trait or command signatures; cache is transparent.

**Memory guardrails:** disk-bounded (256 MB), in-memory index small (hash → meta, LRU 10k entries); startup sweep frees dead weight automatically.

**Acceptance:** second open of One Piece chapter list ≈ < 100 ms (disk hit), no network.
**Tests:** unit — write/read round-trip, atomicity, TTL expiry, over-cap LRU eviction, sweep.
**Gates:** `cargo test`, `cargo clippy`.

### Slice 4 — Image proxy disk cache + streaming (covers load instantly on revisit)

**Goal:** covers and page images cached on disk, streamed, never re-downloaded within TTL.

**Changes (backend):**
- `shiori-proxy` handler (`src-tauri/src/lib.rs`): on request → hash `(source_id, url)` → check `<app_data_dir>/image_cache/` → hit: stream file with `Cache-Control: max-age=604800, immutable` + stored Content-Type. Miss: fetch upstream **streaming** (write chunks to temp file as they arrive; 25 MB cap retained; on abort/error delete temp) → rename into cache → serve. LRU byte-cap 512 MB + 7-day TTL, swept at startup.
- `proxy_manga_image` command: same cache lookup; keep returning `Vec<u8>` (reader contract) but read from disk when warm.
- New commands: `get_image_cache_stats()`, `clear_image_cache()`.
- Keep `is_safe_url` guard as the first check — never reorder it.

**Contract:** `shiori-proxy?source=..&url=..` and `proxy_manga_image` unchanged.

**Memory guardrails:** streaming (no >25 MB buffers in RAM on the proxy path); disk-bounded 512 MB; swept at startup; small in-memory index.

**Acceptance:** second browse of a source's popular row: covers appear instantly (< 300 ms each, no network). Reader pages: no re-download within 7 days.
**Tests:** unit — cache hit/miss, TTL, over-cap eviction, temp cleanup on failure; integration-ish via existing proxy test pattern.
**Gates:** `cargo test`, `cargo clippy`, manual: browse covers twice, verify no network on 2nd (devtools).

### Slice 5 — Lazy cover loading everywhere (frontend)

**Goal:** nothing offscreen loads; no thundering herd of cover fetches.

**Changes (frontend):**
- New shared `src/components/online/LazyCover.tsx`: `IntersectionObserver` (rootMargin 300px) gates setting `src`; `loading="lazy" decoding="async"`; tiny blur/placeholder; error fallback.
- Global concurrency cap for cover fetches (e.g. 6 in-flight) via a small module-level queue (`src/lib/coverQueue.ts`); applies to all online cover loads.
- Apply to: `ModernBookCard`, `OnlineResultCard`, `MangaContentRow`, `HeroMangaBanner`, `ContentCarousel`, related/recommended rows in `OnlineMangaDetailView`, book cards in `OnlineBooksView`.
- Add `content-visibility: auto` (CSS) to card containers in browse rows.

**Contract:** components keep their props (`coverUrl`, `title`, `onClick`, ...); `LazyCover` is drop-in.

**Memory guardrails:** offscreen images never decoded; cap prevents 30 simultaneous CDN fetches.

**Acceptance:** browse row scrolls without visible stutter; network tab shows ≤ 6 concurrent cover requests.
**Tests:** vitest — LazyCover renders placeholder until intersect (mock IntersectionObserver), queue caps concurrency.
**Gates:** `pnpm lint`, `pnpm vitest run`, `pnpm build`, manual scroll test.

### Slice 6 — Bounded reader image cache + memory-safe prefetch

**Goal:** eliminate the unbounded blob cache; revoke; prefetch respects settings.

**Changes (frontend):**
- `useUnifiedImageDecode.ts`: replace `onlineImageCache = new Map()` with an LRU (max ~60 entries / 64 MB) that **revokes** evicted blob URLs; expose `get/set/stats/clear`.
- Prefetch: for online mode, scale to `preloadIntensity` (none=0, light=2, normal=4, max=6 pages ahead); skip prefetch of pages whose chapter changed; revoke blobs from the previous chapter on `setChapter`.
- Add "Clear image cache" to reader settings (calls `clear_image_cache` + clears blob LRU).

**Contract:** `proxyMangaImage` unchanged; internal `useOnlineImageCache` helper.

**Memory guardrails:** hard byte cap; revocation on evict; per-chapter cleanup.

**Acceptance:** reading 50 chapters straight shows flat memory (devtools/`performance` — best effort on WebKitGTK; verify via RSS of the app process).
**Tests:** vitest — LRU evicts + revokes, chapter-change cleanup.
**Gates:** `pnpm lint`, `pnpm vitest run`, `pnpm build`.

### Slice 7 — Books search: cache + abort + bounded results

**Goal:** books results ≤ 5s cold, instant warm, no stale races, no huge DOM.

**Changes (frontend + backend):**
- Cache: the 3 book fetchers (`online-books/*/api.ts`) become `disk-cache`-aware via a thin `cachedBookSearch(kind, query, page, fetch)` wrapper hitting Slice 3's cache through a new `source_cache_get/put` command pair (or reuse `clear_source_cache` semantics; keep TTL 1 h).
- `useGlobalSearch`: `AbortController` per search — abort in-flight fetchers when the query changes or the component unmounts; pass signal into `fetchLibgenBooks`/`fetchGutenbergBooks`/`fetchAnnasArchiveBooks`.
- Cap displayed results at 150 with a "showing first 150 — refine your search" note; incremental filter+sort via a memoized reducer instead of re-sorting the whole array per append.
- Per-source latency chip in `OnlineSearchHeader` (from timing measured in the hook).

**Contract:** `useGlobalSearch` return shape unchanged; fetchers gain an optional `signal` param.

**Memory guardrails:** DOM bounded by the 150 cap; aborted fetches don't accumulate.

**Acceptance:** second identical search renders from cache in < 200 ms; typing fast doesn't show stale results.
**Tests:** vitest — abort on query change, cap, cache wrapper.
**Gates:** `pnpm lint`, `pnpm vitest run`, `pnpm build`.

### Slice 8 — Startup warmup & parallel health checks

**Goal:** hide first-load latency behind idle-time work.

**Changes (frontend + backend):**
- On `online-manga`/`online-books` view mount: warm the RPC webview (Slice 1), run source health checks **in parallel** (`Promise.allSettled` over sources — verify current behavior in `sourceHealthStore.ts` first; if sequential, parallelize), then `requestIdleCallback` → prefetch the first browse row (popular) and enqueue its covers through the Slice 5 queue (low priority).
- Health checks and warmup must NOT evict the source/image caches.

**Acceptance:** by the time the user finishes typing a search, popular row + health badges are already showing.
**Tests:** vitest for the warmup scheduling logic (fake timers).
**Gates:** `pnpm lint`, `pnpm vitest run`.

### Slice 9 — Cache management UI + performance telemetry

**Goal:** users see and control cache usage; perf gains are measurable.

**Changes (frontend + backend):**
- Settings → Online section: "Cache" card with stats (source cache + image cache: entries, MB used, caps), buttons: "Clear image cache", "Clear source cache", note that caches are self-cleaning (TTL + caps).
- Telemetry: extend `SourceSearchDiagnostics` (or add `ChapterListDiagnostics`) with `cache_hit: bool`, `duration_ms` (exists), `source` latency; surface as a subtle chip in `OnlineMangaDetailView` ("cached · 12 ms") and `OnlineSearchHeader`.
- Update QA plan + e2e (playwright): assert a chapter list cold-load under a generous bound (e.g. < 20s on CI with network) and warm-load < 2s.

**Memory guardrails:** clearing is explicit user action; stats make growth visible.

**Acceptance:** user can see and clear both caches; chips show cached vs network per load.
**Tests:** vitest for stats rendering; e2e smoke.
**Gates:** `pnpm lint`, `pnpm vitest run`, `pnpm build`, `npx playwright test` (targeted).

---

### Slice 10 — Instant section launch (kill the skeleton stare)

**Goal:** opening Online Manga / Online Books renders content in a split second — cached content first, network refresh in the background. Skeletons only on true first-run (nothing cached).

**Why:** today every section mount starts from an empty store → skeleton → network wait (5–10s). The fix is **stale-while-revalidate UX**: show what we already have instantly, refresh silently.

**Changes (frontend, small backend hook):**
- **Last-view store**: persist the last N browse rows / search results per view (`localStorage`, capped ~50 items/view, ~200 KB): `src/store/onlineLaunchCache.ts`. Hydrated synchronously at store creation → `OnlineMangaView` / `OnlineBooksView` render from it on mount with a subtle "refreshing…" chip instead of skeletons.
- **Plugin-source content** (mangafire/toongod rows + chapters): served by Slice 3's disk cache in the backend — a new `plugin_browse_cached` / `plugin_get_chapters_cached` command pair returns `{ cached: bool, items }` so the frontend can render immediately and mark stale rows for background refresh. (Or: frontend keeps `onlineLaunchCache` mirror of the last chapter list per manga — simpler, works even before Slice 3 lands.)
- **Background refresh**: after first paint, re-fetch in the background; swap data when fresh arrives; keep scroll position; show a thin "updated just now" indicator.
- **Warmup on app ready** (not on view mount): warm RPC webview (Slice 1), parallel health checks, `requestIdleCallback` → prefetch the default browse row (popular) + first 12 covers through the Slice 5 queue at low priority.
- Skeletons stay only for: first-ever run, cache miss, or explicit refresh with empty cache.

**Memory guardrails:** launch cache capped (items + bytes), pruned on write; never blocks first paint; background refresh aborts on unmount.

**Acceptance:** cold app start → Online Manga shows last session's popular row in < 300 ms; books shows last search in < 300 ms; fresh data swaps in without layout jump.
**Tests:** vitest — store hydration, cap/prune, stale→fresh swap; e2e — reopen app, assert content before network settles.
**Gates:** `pnpm lint`, `pnpm vitest run`, `pnpm build`.

---

## 4. Suggested execution order & expected wins

| Slice | Wins | Effort |
|---|---|---|
| 1 | −80% per-RPC overhead (webview spin-up gone) | M (backend) |
| 2 | One Piece 40s → ~5–10s cold | S (backend) |
| 3 | Repeat visits instant (chapters < 100 ms) | M (backend) |
| 4 | Covers/pages instant on revisit; less RAM | M (backend) |
| 5 | Smooth scroll, no cover herd | S (frontend) |
| 6 | Flat memory in reader | S (frontend) |
| 7 | Books ≤ 5s cold, instant warm, no stale races | M (both) |
| 8 | Latency hidden behind idle work | S (both) |
| 9 | Verifiable + user-controllable | S (both) |
| 10 | Sections open in a split second (cached-first render) | M (both) |

Slices 1–2 are the 40s fix; 4–5 the cover latency; 3+4 make everything after the first visit feel native; 10 hides first-open latency behind cached-first rendering.

## 5. Risks & mitigations

- **Warm webview drift** (page navigates, session expires): watchdog respawn + fall back to per-call creation; user re-solve via Settings → Verify (existing flow).
- **WebKitGTK title-chunk handshake throughput**: batching (Slice 2) reduces total handshakes; keep chunk size at the proven 512 chars.
- **Chapter list staleness** (new chapter released): 12 h TTL + manual refresh button on the chapter panel (existing refresh UX).
- **Android**: all RPC changes feature-flagged to desktop; Android keeps `android_saf().evaluate_javascript` path untouched.
- **SSRF**: `is_safe_url` remains the first gate in every proxy path; cache keys are hashes of already-validated URLs.
- **Disk bloat**: hard caps + startup sweep + visible stats + clear buttons (Slice 9).

## 6. Definition of done

- Online Manga/Books section open (cached): **< 300ms to content**, no skeleton.
- Cold One Piece chapter list on mangafire: **< 10s**; warm: **< 100ms**.
- Covers on 2nd browse of same row: **< 300ms each, zero network**.
- Books search 2nd time: **< 200ms**.
- Reading 50 chapters: **flat app memory** (no unbounded Maps/blob leaks).
- All caches: bounded, swept, visible, clearable from UI.
- Existing suites green: `cargo test`, `cargo clippy`, `pnpm lint`, `pnpm vitest run`, `pnpm build`, targeted playwright.
