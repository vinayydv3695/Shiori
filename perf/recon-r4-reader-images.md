# R4 — Reader & Image Pipeline Recon (READ-ONLY pass)

Scope: manga + EPUB reading flows, thumbnails, base64-over-IPC, decode on main thread, preload/eviction, leaks.

## Already good (verified — prior perf rounds visible as K3-xxx comments)
- Frontend page cache: `MangaImageCache` LRU, 80 entries / 300 MB, blob-URL revocation on eviction, in-flight request dedup — `src/components/manga/hooks/useMangaPreloader.ts:25-130`.
- Bounded (3) preload workers after a single batch `preload_manga_pages` IPC warm-up — `useMangaPreloader.ts:200-233`.
- Pages are served as **file paths via asset protocol** (`get_manga_page_path` + `convertFileSrc`), not base64 — `useMangaPreloader.ts:155-165`.
- On-disk page cache (512 MB cap, reclaim to 80%, orphan sweep throttled to 30 s) — `src-tauri/src/commands/manga.rs:93-120`.
- Online images: bounded LRU (60 / 64 MB) with revocation — `src/components/manga/hooks/useUnifiedImageDecode.ts:20-70`; `shiori-proxy://` disk cache for source images (`lib.rs:~170-210`).
- EPUB continuous view: windowed chapter loading, shared processed-chapter LRU, scroll-compensated eviction, IntersectionObserver-driven active-chapter commit — `src/components/reader/ContinuousEpubView.tsx:74-200`.
- Covers: display-sized thumbnails exist (`cover_service.rs:20-30`, 200×300 + medium), batch path endpoint `get_cover_paths_batch` (`commands/cover.rs:188`), frontend micro-batcher `src/lib/coverCache.ts` + asset-protocol URLs (`useCoverImage.ts`).
- Android low-memory purge wired to `MainActivity.onLowMemory` — `src/lib/lowMemory.ts`.
- Covers/EPUB resources served through `shiori-epub://` custom protocol (content-addressed, cache-forever) — `lib.rs:~341`.

## High

### H1. Every page read re-opens the ZIP archive (central-directory scan per page)
- **File:** `src-tauri/src/services/manga_service.rs:243-263` (`get_page`)
- **Evidence:** `std::fs::File::open(&file_path)` + `ZipArchive::new(file)` **inside the per-page blocking task** — the full central directory is parsed for every page and every preload. `open()` even keeps a cloneable file handle for exactly this (`manga_service.rs:29-32,132-137`) but `get_page` ignores it ("Open fresh file handle to avoid race conditions with shared file offsets", line 237). A persistent per-book `Mutex<ZipArchive>` (or per-read `try_clone` handle + shared index) removes O(pages) directory scans per reading session.
- **Also:** `preload_pages` awaits pages strictly sequentially (`manga_service.rs:310-323`), so preloading 5 pages = 5 × (open + scan + extract [+ decode]); and each uncached page makes **two** `spawn_blocking` hops (extract, then resize) that could be one.

### H2. `get_manga_page_path`: DB query + sync filesystem write per page, inside an async command
- **File:** `src-tauri/src/commands/manga.rs:249-318`
- **Evidence:** per page call: (1) pool checkout + `SELECT file_hash FROM books WHERE id=?1` (lines 267-279 — cache this at open); (2) `std::fs::create_dir_all`, `exists` check, `std::fs::write` + `rename` — blocking sync I/O on an async worker thread; (3) the whole page transits memory as `Vec<u8>` (and the in-memory cache hit path clones it — `manga_service.rs:219 entry.data.clone()`). For `max_dimension=0` (raw passthrough, the default at quality ≥0.95 — `useMangaPreloader.ts:14-20`) the disk write is pure overhead when the frontend already has the blob cached — the backend cannot know; consider an unconditional "path exists → return path" fast path before extraction.

### H3. EPUB processed chapters ship as one giant base64-inlined HTML string per chapter
- **Evidence:** `src/lib/lowMemory.ts:8` describes "processed chapter HTML (base64 PNG/font inlined — the biggest JS buffer)" from `clearProcessedChapterCache` (`PremiumEpubReader.tsx`). `loadProcessedChapter(bookId, index, searchTerm)` returns `content` strings (`ContinuousEpubView.tsx:117-126`). Inlining every image/font as base64 inflates payload ~37%, stresses the JS string/GC heap per chapter, and defeats the `shiori-epub://` protocol that exists for exactly this. **Verify in `services/renderer.rs` / `rendering_service.rs`** whether assets are inlined or rewritten to `shiori-epub://` URLs; if inlined, that's the EPUB equivalent of base64-over-IPC. (Renderer cache is capped 100 MB desktop / 32 MB Android — `lib.rs:~927`.)

## Medium

### M1. In-memory page cache returns cloned Vec and lives behind a single Mutex
- **File:** `src-tauri/src/services/manga_service.rs:100-111,215-220` — `Mutex<HashMap<(i64,usize,u32), CachedPage>>`, `entry.data.clone()` per hit. Page payloads are 0.2-5 MB; the clone doubles transient memory per page turn. `Arc<[u8]>`/bytes::Bytes would make hits O(1). Lock is also taken on every get/preload — fine at current scale, but `get_page_dimensions` holds `open_books` lock while lazily decoding dimensions from the archive (`manga_service.rs:328-345`) — decode-under-lock stalls concurrent page reads.

### M2. Resize quality/cost
- `manga_service.rs:280-295` — `imageops::FilterType::Triangle` downscale + JPEG re-encode per uncached page when `max_dimension>0`. Acceptable; but note the frontend defaults to `max_dimension=0` (raw) at quality ≥0.95, so big CBZ pages go to the WebView at full resolution — decode cost shifts to the WebView (Android: main-thread image decode on `<img>`). `MangaPageImage.tsx` / `useImageDecode.ts` should use `createImageBitmap`/`img.decode()` before swapping in — **verify** during F4.

### M3. Object-URL lifecycle on reader close
- `MangaReader.tsx:24-26` imports `imageCache`/`clearOnlineImageCache`; verify `closeManga` revokes everything (the LRU caps bound damage, but object URLs from the last session survive until eviction). Flag for F4 verification, not a confirmed leak.

## Low
- `get_manga_page_dimensions` per call re-checks placeholders; page_dimensions are fetched in batches from the frontend — OK.
- PDF reader uses split pdfjs chunk (`vite.config.ts manualChunks`) — good; `PdfReader.tsx` (47 KB source) not audited line-by-line this pass; queue for F4 spot-check.
- `epubChapterCache.ts` exists alongside the PremiumEpubReader processed-chapter cache — two caches for adjacent concerns; possible double retention (verify ownership in F4).

## Fix directions for F4
1. Persistent archive handles per open book (kill per-page `ZipArchive::new`); parallel preloads via `JoinSet` bounded by CPU count; merge extract+resize into one blocking task; `Arc<[u8]>` cache entries.
2. Cache `file_hash` in `MangaState` on `open_manga`; move page-file writes into the same blocking task; skip disk write when file already exists with same size (already present) *before* extraction by checking `manga-pages/<hash>/<idx>_<dim>.img` first.
3. EPUB: route chapter assets through `shiori-epub://` URLs instead of base64 inlining (if confirmed), and stream chapter HTML.
4. Decode off-main-thread on Android: `createImageBitmap` in a worker or at least `img.decode()` before assign; cap concurrent decoded pages (LRU already bounds to 60 — verify enforcement in the unified hook).
