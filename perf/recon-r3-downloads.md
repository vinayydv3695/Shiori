# R3 — Downloads & Event Pipeline Recon (READ-ONLY pass)

Scope: concurrency, backpressure, event flooding, per-page DB writes, rescans, progress rebuilds.

## Critical

### C1. Chapter downloads are strictly sequential with a hard 150 ms sleep per page
- **File:** `src-tauri/src/commands/sources.rs:662-821` (`download_manga_chapter_as_cbz`)
- **Evidence:**
  - `for (idx, page) in pages.iter().enumerate()` — one HTTP fetch at a time, then `tokio::time::sleep(Duration::from_millis(150)).await` after **every** page (~line 810). A 20-page chapter burns ≥3 s in sleeps alone; 1000 chapters ≈ 50+ min of pure sleep.
  - Pages are fetched once and written into the ZIP one at a time — no page-level concurrency, no pipelining.
  - A fresh `reqwest::Client` is built **per chapter** (~line 728) instead of sharing a connection pool (TLS+DNS per chapter).
  - No cancellation token and no resume: a failure at page 19/20 (`return Err(...)`) throws away the whole chapter; the partial `.cbz` temp file is left on disk (`std::fs::File::create(&cbz_path)` already ran).
  - `plugin_download_chapter` (sources.rs:344-…) has its own 250 ms/page sleep (~line 379) — same disease on the extension path.

### C2. Progress event flooding: one Tauri event per page
- **File:** `src-tauri/src/commands/sources.rs:799-807` — `app_handle.emit("online-manga-download-progress", …)` inside the per-page loop (chapter_title cloned per page).
- **Impact:** 1000 chapters × ~20 pages = ~20k events crossing IPC; each one hits the frontend listener (`useOnlineDownloadStore.initializeListeners`, `onlineDownloadStore.ts`) → store update → subscribers re-render. During a big download session this alone can keep the JS main thread busy.
- **Frontend amplifier:** `OnlineMangaView.tsx:1240-1300` — per chapter: `registerDownload`, `setDownloadProgress`, `setChapterDownloadStatus(prev => ({...prev, ...}))` (full object spread re-render per status flip), then `setDownload` on completion.

### C3. Chapters themselves download sequentially from the UI loop
- **File:** `src/components/online/OnlineMangaView.tsx`, `handleDownloadChapters` (~lines 1233-1310)
- **Evidence:** `for (const ch of selectedChapters) { … await invoke("download_manga_chapter_as_cbz", …) }` — chapter N+1 doesn't start until N finishes. Combined with C1, downloading 1000 chapters is a multi-hour serial process during which the app must stay open and foreground-ish.

## High

### H1. No real concurrency bound in the backend
- **File:** `src-tauri/src/lib.rs:69-96` — `ActiveDownloads` is a plain `AtomicUsize` counter (used for the sleep-blocker at `:1045`), **not** a semaphore. If the frontend ever fires parallel `invoke`s, nothing caps simultaneous chapter downloads, socket usage, or ZIP-writer memory.

### H2. Post-import does a full library reload instead of a targeted update
- **File:** `src/components/online/OnlineMangaView.tsx:~1340` — after `import_online_manga_chapters` succeeds, `useLibraryStore.getState().loadInitialBooks()` (offset-0 refetch + total recount). Should emit a `books-imported` mutation payload and let `applyLibraryUpdate` merge (`libraryStore.ts` already supports it).

### H3. Import side of the pipeline is per-file autocommit + per-chapter UPDATE
- See **R2-C1**: `import_manga` → `import_single_book` per file (own connection, several autocommit statements, cover generation per file), then 1000 unbatched `UPDATE books SET manga_series_id…` statements (`commands/library.rs:1640-1680`). During a 1000-chapter import the DB write lock is nearly continuously held.

## Medium

### M1. Download destination can fight the folder watcher and Android SAF
- **File:** `src-tauri/src/commands/sources.rs:681-707`
  - If `defaultImportPath` is set, CBZs land in `<defaultImportPath>/Online Manga` — if that path is also a **watch folder** (`services/folder_watch.rs` watches `RecursiveMode::Recursive`, debounced), each finished CBZ triggers a watch event → duplicate ingest work on top of the explicit `import_online_manga_chapters` call.
  - On Android, a `content://` (SAF) default path is skipped and `download_dir()` is tried; on failure the fallback is `PathBuf::from(".")` — the process CWD, which on Android is not a writable app location. CBZ downloads can silently fail or land somewhere unexpected (see R8-H1).

### M2. Rate-limit sleeps are unconditional
- 150 ms/page (sources.rs) and 250 ms/page (plugin path) apply even to local/CDN sources that don't need them; no per-source policy. Makes the "background downloads should be fast and invisible" budget unreachable.

## What is already good
- SSRF guard (`is_safe_url`) on every page URL; image-format sniffing before zip entry naming.
- `spawn_blocking` is used for the (sync) zip writes so the async runtime isn't blocked by file I/O.
- `onlineDownloadStore` cleans stale "active" downloads on app launch (`onlineDownloadStore.ts:124`).
- Downloads marked `Stored` (no zip compression) — correct for already-compressed images (no wasted CPU).

## Fix directions for F3 (handoff)
1. Backend download manager: bounded page concurrency (e.g. 4-6 pages, 2-3 chapters), shared `reqwest::Client`, per-source rate policy, cancel via `CancellationToken`, resume via manifest/`.part` files.
2. Throttle/coalesce progress: emit at most 2-4 events/sec per chapter (delta-based), or one aggregate event for the queue.
3. Batch DB: one transaction for the whole import; one batched `UPDATE … WHERE id IN` (or temp table) for series linkage; emit one `books-imported` event with ids at the end.
