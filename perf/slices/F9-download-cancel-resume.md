# Slice F9 — download cancel + `.part` resume (IMPLEMENTED 2026-09-29)

Status: **implemented.** Gates: `cargo check --lib` clean (0 errors; full `cargo test --lib` not re-run in-session — target dir was held by the concurrent session, documented in DECISIONS); `tsc -b` clean; `MangaDownloadDock` tests 16/16; `tests/components/online` = pre-existing baseline (4 fails, all pre-existing).

**Deviations from the brief (loud):**
- Assembly reads parts in page order and derives the zip-entry extension from the bytes at assembly time (the brief's step 3 derived it at download time; the download job now returns `(idx, bytes)` only).
- The cancel command is a free function in `commands/sources.rs` using `State<'_, crate::ActiveDownloads>`; registration lives next to `preload_manga_pages` in `commands/mod.rs` (no new state type).
- Progress events: `downloaded` is initialised to the number of already-present parts, so the final event still fires when a resumed run completes; a fully-resumed (no pending pages) run emits no intermediate events.

## Goal / contract
Per-chapter cooperative cancellation and cross-restart resume for online-manga CBZ downloads, without changing the happy path's output (same CBZ path, same zip entry names).

- **New command:** `cancel_manga_chapter_download(chapter_id: String) -> Result<bool>` — true when an in-flight flag was set.
- **Frontend:** cancel button per chapter while `status === 'downloading'`; cancelled chapter gets status `cancelled` (distinct from `failed`); retrying resumes.
- **Error sentinel:** cancellation returns `Err(ShioriError::Other("download cancelled".into()))`; frontend matches the message (Tauri has no error codes here).
- **Resume protocol:** pages download to `<cbz_path parent>/<cbz_stem>.cbz.parts/<NNNN>.bin` (1-based, zero-padded to 4). Presence of the file = page done. Assembly reads parts in order, writes `<cbz>.tmp`, `rename`s to `<cbz>`, removes the parts dir. Cancel retains parts. Restart resumes (parts dir persists).
- **Politeness/perf invariants to keep (slice F3):** shared `static DOWNLOAD_CLIENT` (once_cell Lazy), `buffer_unordered(3)`, 60 ms per-worker stagger, progress events coalesced to ≥250 ms + final event.

## Backend changes

### 1) `src-tauri/src/lib.rs` — extend `ActiveDownloads` (anchors: struct ~line 69, `impl` ~85, `app.manage(ActiveDownloads { … })` ~line 869)
```rust
pub struct ActiveDownloads {
    count: std::sync::atomic::AtomicUsize,
    cancel_flags: dashmap::DashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>,
}
impl ActiveDownloads {
    pub fn register(&self, chapter_id: &str) -> std::sync::Arc<std::sync::atomic::AtomicBool> { /* insert new flag, return clone */ }
    pub fn unregister(&self, chapter_id: &str) { /* remove */ }
    pub fn cancel(&self, chapter_id: &str) -> bool { /* get -> store(true, SeqCst) -> true */ }
}
```
`dashmap` is already a dependency. Init: `cancel_flags: dashmap::DashMap::new(),`.

### 2) `src-tauri/src/commands/sources.rs` — `download_manga_chapter_as_cbz` (~line 662)
Current structure after F3: `pages` fetched → downloads_dir → cbz_path → shared client → `page_jobs` stream (`buffer_unordered(3)`, writes zip entries as pages complete) → final `zip.finish()` in `spawn_blocking`.
Rework:
1. After `cbz_path`: compute `parts_dir = cbz_path.with_extension("cbz.parts")`, `tokio::fs::create_dir_all`, `let cancel = app.state::<crate::ActiveDownloads>().register(&chapter_id);` and wrap the rest so `unregister` runs on every exit (early return on error too — register after the last fallible pre-step, or use a small guard struct).
2. Build `pending: Vec<usize>` = indices whose `parts_dir/<NNNN>.bin` is absent (resume).
3. Page job: before fetch, `if cancel.load(SeqCst) { return Err(cancel_err()) }`; after fetch, `if cancel.load(...) { return Err(...) }` (drop fetched bytes); write part file with `tokio::fs::write`; 60 ms stagger; progress event unchanged. **Lock discipline:** the flag is an `AtomicBool`; never hold the DashMap ref across `.await` (clone the `Arc` immediately after `register`).
4. Remove the in-stream `ZipWriter`; count completions only.
5. After the stream: `spawn_blocking` assembly — for `idx in 0..total`: read `<NNNN>.bin`, `detect_image_format` for the entry extension, `start_file(format!("{:03}.{}", idx+1, ext))`, `write_all`. Then `finish`, `rename` tmp→cbz, `tokio::fs::remove_dir_all(&parts_dir)`, final progress event, `unregister`.
6. Cancel semantics: parts are **kept** on cancel/error; deleted only after successful assembly. The existing stale-`.tmp` files are covered by the tmp+rename.

### 3) `src-tauri/src/commands/mod.rs` — register `commands::sources::cancel_manga_chapter_download,`

### 4) `src/lib/tauri.ts` — wrapper
```ts
async cancelMangaChapterDownload(chapterId: string): Promise<boolean> {
  return invoke("cancel_manga_chapter_download", { chapterId })
},
```

## Frontend changes
- `src/components/online/OnlineMangaView.tsx` `handleDownloadChapters` (worker pool, slice F3): on catch, if `getErrorMessage(err).includes('cancelled')` set status `cancelled` + `setDownload` status `'error'` with title "(cancelled — tap to resume)"; keep the chapter in `downloadFailures`? No — separate list so the toast doesn't say "failed".
- `src/components/online/MangaDownloadDock.tsx` (109 lines, READ FIRST — props/status map): add a cancel (X) button when `status === 'downloading'`, calling `api.cancelMangaChapterDownload(ch.id)`; status type union gains `'cancelled'` (check `ChapterDownloadStatus` definition in OnlineMangaView.tsx).
- Types: extend the local status union; no store changes needed.

## Tests / gates
- Rust: new test in `src-tauri/tests/` — parts assembly round-trip using `perf/seed/files/Bench Piece - Chapter 1.cbz` (unzip to parts, assemble, compare entry names/content); resume = pre-populate 5 parts, assert only missing pages are fetched (extract the pending-index computation into a small pure helper for testability).
- Gates: `cargo check --lib` → `cargo test --lib` → `npx tsc -b` → targeted vitest (DownloadQueuePanel is pre-existing-red; don't chase) → `npx vite build` + `bash perf/bench/bundle_budget.sh` (entry must stay ≤900 KB — do not statically import anything new).
- Manual: start a 3-chapter download, cancel chapter 2 mid-page, verify `.parts` retained, retry, verify CBZ identical and parts removed.

## Risks / notes
- Zip entry order after resume follows index order at assembly (not completion order) — the reader sorts names anyway (`manga_service::natural_sort_key`).
- `unregister` must be guaranteed on all paths (use a drop guard; leaked DashMap entries would make cancel target a dead flag).
- Disk usage: parts duplicate the final CBZ size until assembly; document. Cap/cleanup of stale parts dirs (older than N days) is a deliberate follow-up.
- Do not touch `conversion/*` — concurrent session owns it.
