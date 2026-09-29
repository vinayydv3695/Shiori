# perf/RECON-SUMMARY.md — Master Bottleneck List (Phase 0 merge)

Merged from `recon-r1` … `recon-r8` (all passes complete 2026-09-28). Rule-1 compliant: every item cites file/function; measurements pending Phase 1 baseline (explicitly marked *needs-measure* where a claim is structural, not yet timed).

## Root-cause narrative for the reported bug ("1000 chapters of One Piece → whole app lags")

The lag is **not one bug** — it is a chain:
1. **Download** (`download_manga_chapter_as_cbz`, R3-C1/C2/C3): serial chapters × serial pages × 150 ms/page sleep × per-page events — a multi-hour session during which the event stream + status spreads keep the JS thread busy and the disk/DB hot.
2. **Import** (R2-C1): 1000 files × per-file autocommit + per-chapter linkage UPDATEs + FTS re-index per row → write-lock pressure felt by every concurrent library query.
3. **Browse**: manga library grouping re-runs regex-heavy natural sorts on every infinite-scroll append (R1-M3); opening the series renders **all** volumes at once with covers un-lazied (R1-C1); list/table views grow the DOM without bound (R1-H2); reader chapter dropdown maps 1000 rows (R1-H3).
4. **Read**: every page turn re-opens the ZIP, queries SQLite for `file_hash`, and does sync disk writes on async threads (R4-H1/H2, R2-H2, R5-H1).

## Ranked master list

| # | Rank | Bottleneck | Where | Est. impact | Effort | Fix owner |
|---|---|---|---|---|---|---|
| 1 | **Critical** | SeriesView: no virtualization, `forceVisible`, 20 s stagger, backdrop-blur | `SeriesView.tsx:897-946` | Series FMP <300 ms budget; fixes the visible "1000 chapters" lag | M (virtualize + paginate/series DTO) | F1 (+F2 for DTO) |
| 2 | **Critical** | Download pipeline serial + per-page sleep + per-page events | `commands/sources.rs:662-821`, `OnlineMangaView.tsx:1233-1310` | Background DL w/o jank; hours→minutes wall clock | M-L (manager, semaphore, throttle) | F3 |
| 3 | **Critical** | Batch import: no transaction; per-chapter UPDATEs; FTS re-index per row | `commands/library.rs:1592-1700`, `library_service.rs:1946,1197`, `db/migrations.rs:281-320` | Import 1000 files without freezing library reads | M | F2 |
| 4 | **Critical** | "Mark all read" = 1000 sequential IPC + FTS updates | `SeriesView.tsx:700-714` | One-click stall gone | S (batch command) | F2 (+F1 call-site) |
| 5 | **High** | Reader page path: ZIP reopen per page; DB query per page; sync fs in async | `manga_service.rs:243-263`, `commands/manga.rs:249-318` | Page-turn <100 ms budget on low-end | M | F4 (+F6) |
| 6 | **High** | Startup warms hidden RPC webviews + CF clients; RSS scheduler unconditional | `lib.rs:~750-860, 957-984` | Cold-start budgets (1.5 s desktop / 2.5 s Android) | M | F5/F7 |
| 7 | **High** | Entry JS 1.5 MB + 464 KB CSS; fonts 844 KB | `dist/` measured | Cold start + parse on WebView | M | F5 |
| 8 | **High** | List/Table views unbounded DOM; reader dropdown maps all chapters | `ModernListView.tsx:51`, `ModernTableView.tsx:234`, `MangaReaderHeader.tsx:471,582` | 60 fps scroll budget | S-M | F1 |
| 9 | **High** | `getMangaSeriesList(1000,0)` + title-match to resolve ids (fragile & heavy) | `SeriesView.tsx:683-720` | correctness + speed | S | F1/F2 (pass series id through `SeriesGroup`) |
| 10 | **High** | HomePage ≤100 individual `getBook` calls; `applyLibraryUpdate` N+1 | `HomePage.tsx:271`, `libraryStore.ts:~490` | Home FMP; event-followup jank | S (batch command use) | F2/F1 |
| 11 | **Medium** | Android CBZ download path fallback `PathBuf(".")`; SAF bypass | `commands/sources.rs:681-707` | Android downloads reliability | M | F8/F3 |
| 12 | **Medium** | Backdrop-blur/shadow CSS on Android surfaces | `SeriesView.tsx` + reader chrome | 60 fps on weak GPUs | S-M | F8 |
| 13 | **Medium** | EPUB processed chapters = base64-inlined HTML strings | `renderer.rs`/`PremiumEpubReader` (*verify first*) | EPUB memory + chapter-load time | M | F4 |
| 14 | **Medium** | `Vec<u8>` clones + lock-held dimension decode in manga cache | `manga_service.rs:100-111,215-220,328-345` | page-turn tail latency | S | F6 |
| 15 | **Medium** | `get_library_stats` full scan w/o `in_trash`; per-mount on Home | `library_service.rs:2402` | correctness + home cost | XS | F2 |
| 16 | **Medium** | `opt-level="z"` vs hot-code speed; per-package overrides | `Cargo.toml` | reader/decode CPU | XS (measure first) | F6 |
| 17 | **Medium** | Per-ABI splits unverified; espeak-ng-data size unmeasured | `gen/android`, `tauri.conf.json` | APK/installer budget | S | F6/F8 |
| 18 | **Medium** | No app-hidden → pause bridge for RSS/Discord/polls | cross-cutting | idle CPU/battery budget | M | F7 |
| 19 | **Low** | `reqwest::Client` per chapter; event payload clones | `commands/sources.rs:728,799` | download overhead | XS | F3 |
| 20 | **Low** | OFFSET pagination on series list; `get_series_volumes` too-lean DTO | `commands/manga.rs:347-433` | hygiene | S | F2 |

## Explicit non-findings (verified OK — do not spend effort)
- Library grid virtualization, cover reveal + prefetch batching (`LibraryGrid.tsx`) — solid.
- `searchBooks` SQL: two-phase keyset pagination, batch hydration, plan-tested — solid.
- Covers: 200×300 thumbnails + batch paths + asset protocol — solid.
- Manga preloader LRU/dedup/bounded workers; online image LRU; EPUB chapter windowing — solid.
- PRAGMAs per platform; release profile (except the `opt-level` question, #16).
- Sync server on-demand only; folder watcher inert without configured folders.

## Phase 1 spec for Agent B (next)
1. **Seed tool** (`scripts/perf-seed`): synthesize 1 series × 1100 CBZ (18-38 pages each, real JPEGs), + library of 2,000 mixed items (EPUBs ≥5 MB, PDFs, MOBI) into an isolated app-data dir; deterministic content hash; `--profile small|large`.
2. **Harness** (`scripts/perf-bench`): cold start→first paint; series open render time + DOM node count; scroll FPS/long-task trace (CDP via Tauri devtools or Playwright); search-as-you-type latency; page-turn latency; IPC payload sizes; `EXPLAIN QUERY PLAN` dumps for: default library page, series filter, FTS search, reading-status update, import linkage update; memory timeline; simulated 50-chapter download CPU/event count; bundle/APK sizes.
3. Output → `perf/BASELINE.md` (+ `perf/baseline-media/` if capture works).

## Open questions assigned
- R4-H3 (EPUB base64 vs `shiori-epub://`) → F4 verifies in `renderer.rs` before changing anything.
- Android ABI splits + `CfClient` cfg gates → F8 verifies.
- `pdf.worker` lazy-loading → F5 verifies.
- In-flight dirty files (`ai.rs`, `secret_store.rs`, `migrations.rs`) → Orchestrator confirms ownership before F2/F7 edits.
