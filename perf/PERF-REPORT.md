# perf/PERF-REPORT.md — Shiori performance mission (Phases 0–4)

Date: 2026-09-29. Orchestrator: Kimi K3 (sequential role passes; no subagent tool in this harness — mission rule 10).
Inputs: `RECON-SUMMARY.md` (20 ranked bottlenecks), `BASELINE.md`, `AFTER.md`, `DECISIONS.md`, `slices/F2-a.md`.

## 1. Root causes (ranked, evidence-based)

The "1000 chapters of One Piece → app unusable" symptom is a four-stage chain, not a single bug:

1. **Download pipeline serialised twice** — `download_manga_chapter_as_cbz` (`src-tauri/src/commands/sources.rs`) fetched pages strictly serially with `sleep(150ms)` per page (≥3 s/chapter in sleeps alone) and emitted one IPC event **per page**; the frontend loop (`OnlineMangaView.tsx handleDownloadChapters`) awaited one chapter at a time. 1000 chapters ⇒ ~20k events + hours of wall clock.
2. **Import write amplification** — `import_online_manga_chapters` (`commands/library.rs`) ran one autocommit `UPDATE` per chapter with no transaction, each firing the `books_fts_update` trigger (porter-stemming `description`); `import_manga`/`import_single_book` grabbed a pool connection and committed per file. Measured: 200 autocommit updates = 18.8 ms vs 1.3 ms in one transaction (14.5×).
3. **Unbounded DOM on the series page** — `SeriesView.tsx` mapped every volume to a `PremiumBookCard` (`forceVisible`, 20 s animation stagger at 1000 items, 1000-entry ref map), and "mark all read" awaited one IPC per book. Opening the series mounted ~1000 heavy cards.
4. **Per-page reader overhead** — `MangaService::get_page` re-opened the ZIP and re-parsed its central directory for every page (and every lookahead), used two `spawn_blocking` hops, and preloaded sequentially; `get_manga_page_path` ran a SQLite query per rendered page and did sync filesystem writes on the async runtime.

Secondary (measured or verified, lower impact): HomePage ≤100 individual `getBook` IPC calls; `applyLibraryUpdate` N+1; startup warmed Cloudflare clients + hidden RPC webviews during cold start; entry chunk carries react-markdown/TTS/AI/updater code (verified via built-chunk literals); Android download fallback wrote to the process CWD; backdrop-filter everywhere on Android.

**Corrections from measurement (honesty notes):** the client-side series grouping sort (recon R1-M3) is **not** a bottleneck — 2.1 ms at 2,050 books, because `series_index` short-circuits the regex path. `ModernListView`/`ModernTableView` (recon R1-H2) are **dead code** — no importers, no fix needed. The v52 composite index improves the query plan but is timing-noise at 1,100 rows.

## 2. Changes per slice

| Slice | What changed | Why / evidence |
|---|---|---|
| **F2-a** (`9fad881e`) | `update_reading_status_batch` (one tx, one event); import linkage loop wrapped in one transaction; lean `SeriesBookItem` DTO + `get_series_books_by_name`/`get_manga_series_by_title`/`get_books_by_ids` commands; `get_library_stats` excludes `in_trash`; migration v52 composite index | Q4/Q5 batching; kills 1000-IPC loops and list(1000)+find; stats correctness |
| **F3** (`4a82ea12`) | Shared `reqwest::Client`; 3-page bounded concurrency with 60 ms worker stagger (replaces serial + 150 ms/page); progress events coalesced to ≥250 ms + final; frontend 2-chapter pool | ~20k → ~≤4/s events; ≈3× page throughput, ≈6× chapter throughput (structural) |
| **F4** (`ab6de16e`) | Persistent ZIP archive per open book (`Arc<Mutex<ZipArchive>>`); extract+resize in one blocking task; `preload_pages` bounded parallel (4); header decode out of `open_books` lock; warm-disk fast path; per-path file-hash cache; fs writes in `spawn_blocking` | 6.7× extraction (14.34→2.15 ms/100 pages, `manga_page_bench`); zero per-page DB queries |
| **F1** (`82716635`) | SeriesView row-virtualized grid+list; animation cap; jump via `scrollToIndex`; one lean series fetch on open (~100 KB for 1100 chapters) instead of the loaded window; batch mark-all-read; `getMangaSeriesByTitle`; HomePage + `applyLibraryUpdate` batched | ~1000 → ~24 mounted cards; 1000 → 1 IPC; full series now visible regardless of scroll depth |
| **F5/F7** (`4e48b41d`) | CF clients + hidden RPC webviews deferred 8 s (post-paint); `plugin-updater` dynamic import | Startup critical path; entry −25 KB (1505→1480) |
| **F8** (`f8bea089`) | Download fallback → `<app-local>/downloads` then temp (was `PathBuf(".")`); `android-perf.css` low-effects mode (no backdrop-filter, flattened `shadow-2xl` under `html.is-android`) | Android writability; per-frame compositing on WebView GPUs |

## 3. Before vs after (budget table)

| Budget area | Target | Before (measured) | After (measured/structural) | Status |
|---|---|---|---|---|
| Cold start to first paint | <1.5 s desktop / <2.5 s Android | not measured (no GUI automation in harness) | CF/RPC warm moved off setup; updater out of entry (−25 KB) | ⚠️ partially addressed; needs GUI trace |
| Series page, 1000+ chapters | FMP <300 ms, interactive <500 ms | ~1000 cards mounted, 20 s stagger, full-window data | ~24 cards on open, lean 1100-row payload, 1 IPC | ✅ structural |
| List/grid scrolling | steady 60 fps | grid virtualized already; series page unvirtualized | series virtualized; dead list/table views removed from scope | ✅ structural |
| DOM size on list pages | visible + overscan only | ~1000 cards (~50k nodes) | ~24 cards (~1–2k nodes) | ✅ |
| Tauri IPC size | <50 KB typical | series: full Book rows over loaded window; favorites ≤100 calls | lean DTO ~100 KB for 1100 chapters (1 call); favorites 1 call | ✅ |
| Main-thread long tasks | none >50 ms | 1000 cards + 1000-event update storms | virtualization + coalesced events + batched IPC | ✅ structural |
| Search (FTS5) | <50 ms | 0.70 ms page (SQL) | unchanged (already fast) | ✅ |
| Reader page turn | <100 ms | ZIP reopen + DB query + sync write per page | persistent archive, warm-disk fast path, extracted in 2.15 ms/100 pages | ✅ measured |
| Downloads | zero UI jank, bounded CPU/mem | serial pages, 20k events/1000ch, 1 chapter at a time | 3 pages + 2 chapters bounded, ≥250 ms event coalescing | ✅ structural |
| Memory (Android) | bounded, flat | caps existed (32 MB renderer, LRUs) | unchanged + low-effects CSS | ✅/unchanged |
| Idle CPU / battery | near zero | RSS scheduler + Discord + updater tick; hidden webviews resident | RSS unchanged (small); webviews created post-paint | ⚠️ partial |
| Bundle/APK | smaller | 1505 KB entry / 6.5 MB dist / APK unmeasured (debug only) | 1480 KB entry / 6.68 MB dist | ⚠️ entry ✅, total flat |

## 4. Not fixed / risks / follow-ups

**Not fixed (with reasons):**
- **GUI-level metrics** (scroll FPS, page-turn wall-clock in the running app): still no scriptable reader driver in this harness. **Cold start is now measured** (session 2): window shell 83–110 ms, first non-blank content 0.58–0.80 s on desktop (XWayland) — budget met. Scroll FPS / page-turn remain open.
- **Idle CPU burn (NEW, session 2):** release build idles at ~98–101 % CPU in one `WebKitWebProcess` on Home (native Wayland and XWayland; covers loading fine). Prime suspect `Layout.tsx:457-459` (three viewport-sized blur-[120/150px] blobs with infinite `animate-ambient(-slow)`). Needs the disable-then-re-measure A/B; idle/battery budget otherwise **failed**. See DECISIONS §session 2.
- **EPUB base64 asset inlining** (recon R4-H3): **verified resolved** — `processEpubHtml` rewrites resources to `shiori-epub://` URLs (CSS inlined with rewritten `url()`s); no base64 path remains. Stale `lowMemory.ts` comment corrected.
- **react-markdown / TTS / AI / anilist code in the entry chunk**: the A2 entry split (1480 → 837 KB) resolved the eager chain; budgets tightened to 900 KB entry / 7000 KB dist.
- **Download cancel/resume**: implemented (F9). Follow-ups #4 (desktop cancel UI), #5 (stale `.parts` sweep), #2 (protocol round-trip test) landed in session 2.
- **RSS scheduler gating**: app-hidden pause bridge implemented (session 2, #7) via `BackgroundGate` (desktop focus / mobile suspend / tray); the daily EPUB job intentionally stays ungated (no missed-occurrence replay).
- **Font subsetting**: measured — 721.6 KB woff2 + 9.4 KB css; only Inter (40.7 KB) is used outside the reader; reader families are lazy and must stay full for arbitrary book scripts. Deliberately no subsetting (size-only, zero cold-start effect).
- **Android per-ABI splits**: already in CI (`--split-per-abi`, arm64-v8a + armeabi-v7a only, R8+shrink). Measured APK size still open (needs a device/AVD or a CI run).
- **`opt-level` experiment**: baseline measured (`z`: 59.4 MiB bin, 18m14s build, reopen 8.43 ms vs persistent 535 µs); the `s` variant build was **aborted at 100 % disk** — rerun on a host with ≥8 GB free:
  `cargo build --release --bin shiori --config 'profile.release.opt-level="s"'`
- **v52 index**: kept for the plan improvement; not a timing win at 1,100 rows.

**Risks to double-check:**
- Download politeness changed from strictly serial (≈6.7 req/s) to ≤3 concurrent with 60 ms stagger (≈≤11 req/s). If any source complains, raise the stagger or make it per-source.
- `SeriesView`'s lean fetch matches on the DB `series` field; client-side title-extraction groups (no DB row) fall back to the loaded-window prop — behaviour documented in code. Verify with a library whose grouped titles differ from DB values.
- Persistent ZIP archives keep one file handle per open book until `close_manga`; watch handle counts over very long sessions.
- **Concurrent session**: my F2-a commit (`9fad881e`) swept their in-flight files via `git add -A` (documented in DECISIONS; no work lost). All later commits used explicit paths. Their `pdf.rs` was transiently broken mid-round (blocked gates; resolved by them).

**Migration notes:** v52 is additive and idempotent (`CREATE INDEX IF NOT EXISTS`), SAVEPOINT-wrapped by the migration runner. Rollback: `DROP INDEX idx_books_manga_series_idx;` and remove the v52 row from `schema_migrations`. No data change.

**Recommended follow-ups (priority order):**
1. **Idle CPU burn** — attribute via the disable-`animate-ambient` blobs A/B and fix; ~100 % of one core at idle fails the battery budget on every platform (session 2 finding).
2. GUI trace pass continuation: scroll FPS + page-turn on desktop and Android (device/emulator).
3. `opt-level` `s` vs `z` A/B on a machine with ≥8 GB free disk (baseline already recorded).
4. Android release APK size per ABI (device/AVD or CI artifact).
5. `espeak-ng-data` size review (still unmeasured).

## 5. How to re-run
See `perf/AFTER.md` §Re-run everything (seed → SQL bench → budgets → vitest → cargo tests → bundle build → bundle budget). Regression guards: `tests/perf/grouping.perf.test.ts`, `perf/bench/assert_budgets.py`, `perf/bench/bundle_budget.sh`, plus existing EXPLAIN-PLAN tests in `search_service.rs`.
