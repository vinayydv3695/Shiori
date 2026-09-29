# perf/BASELINE.md — Phase 1 baseline measurements

Date: 2026-09-29. Machine: x86_64, 12 cores, 15.3 GB RAM, Linux (kernel host), node v26.3.0, cargo 1.96.0.
Dataset: `perf/seed/bench.db` — 3,150 books (1,100-chapter "Bench Piece" series + 2,000 mixed books + 50-vol control), 200 authors, 63 tags, FTS5 populated, reading_progress on 53 rows. Seeder: `perf/seed/seed_db.py --profile large` (deterministic, seed 42). Re-run: `python3 perf/seed/seed_db.py && python3 perf/bench/sql_bench.py --label <name>`.

## 1. SQL hot-path timings (perf/bench/results/baseline.md for full + query plans)

| Query | Median | Note |
|---|---|---|
| Q1 default page (keyset cursor) | **0.40 ms** | validated: fast |
| Q1b default page (OFFSET 1500) | 1.72 ms | 4.3× slower than keyset — non-added_date sorts pay this |
| Q2 FTS prefix page | 0.70 ms | search-as-you-type: SQL is NOT the bottleneck |
| Q2b FTS count | 0.58 ms | |
| Q3 series books, all 1100 rows `SELECT *` | 3.68 ms | backend fetch fine; cost is hydration+IPC+render |
| Q4 status update ×200, autocommit (app pattern) | **18.84 ms** (0.094/op) | "mark all read" = 1000 of these ≈ 94 ms SQL + 1000 IPC round-trips |
| Q4b same ×200, ONE transaction | **1.30 ms** (0.006/op) | **14.5× faster** — batch win confirmed |
| Q5 linkage update ×200, autocommit (import pattern) | 2.76 ms | |
| Q5b same ×200, ONE transaction | 0.83 ms | **3.3× faster** |
| Q6 get_library_stats (full scan, no in_trash) | 0.40 ms | cheap, but wrong (counts trash) |
| Q7 COUNT default | 0.07 ms | |
| Q8 author-sort page | 1.90 ms | grouped LEFT JOIN works |
| Q9 attach authors ×50 | 0.04 ms | batch hydration works |
| Q10 manga domain page | 0.51 ms | |
| Q11 get_series_volumes | 0.59 ms | |
| Q12 get_manga_series_list(1000,0) | 0.004 ms | SQL cheap; the sin is shipping 1000 rows over IPC to find 1 |

**Verdict:** read-path SQL is healthy (all ≤4 ms). Write-path batching is the DB win: 3–15×.
Caveat: Q4 vs Q5 per-op gap partly warmup ordering; both are idempotent-value writes that still fire triggers.

## 2. Frontend grouping micro-bench (tests/perf/grouping.perf.test.ts)

| Metric | Value |
|---|---|
| first group (50 books) | 1.15 ms |
| last regroup (2,050 books, 1,100-vol series) | 2.14 ms |
| total across 40 appends | 38.4 ms |
| one-shot 2,050 books | 2.16 ms |

**R1-M3 downgraded:** grouping is NOT a bottleneck when `series_index` is populated (regex path short-circuits). Series-page jank is DOM/render cost, not sorting.

## 3. Bundle & build output (dist/, vite build 2026-09-29)

| Asset | Size | Note |
|---|---|---|
| entry `index-*.js` | **1,505 KB** min | contains react-markdown+unified, @tauri-apps/plugin-updater, ALL src/lib TTS/AI/character modules, all 21 stores (visualizer evidence) |
| `index-*.css` | 464 KB | |
| `pdf.worker.min-*.js` | 964 KB | lazy (pdfjs chunk) — verify no eager ref |
| `pdfjs-*.js` | 416 KB | manualChunks |
| `SettingsDialog-*.js` | 544 KB | lazy |
| `AniListDashboard-*.js` | 436 KB | lazy |
| `vendor-*.js` (react+framer-motion) | 140 KB | manualChunks |
| `MangaReader-*.js` | 96 KB | lazy |
| fonts (20 woff2) | 844 KB | reader families included |
| **dist total** | **6.5 MB** | |
| Android APK | 582 MB | DEBUG x86_64 with symbols — not representative; release APK not built in this pass (documented gap) |

## 4. Not measured here (honest gaps, Phase 3 guards address some)

- Cold start→first paint, scroll FPS, long tasks, page-turn latency, memory timeline: need an interactive GUI session (DISPLAY exists but Tauri dev + seeded app-data wasn't automated this pass). Component-level proxies above cover the identified bottlenecks.
- Download wall-clock for 1000 chapters: deterministic from code (serial × 150 ms/page ≈ 50+ min sleeps alone) — will be re-measurable after F3 via event-count + timing instrumentation in the download path tests.
- IPC payload sizes: derivable — Q3's 1100 full Book rows ≈ 1.4–1.8 MB JSON (est. from row width); series DTO target ≤150 KB.

## 5. Regression-guard hooks already in place

- `tests/perf/grouping.perf.test.ts` — runs in `npm test`, logs numbers, 10 s tripwire.
- `perf/bench/sql_bench.py --label <x>` — diff-able markdown per run.
- Existing repo guards: EXPLAIN-PLAN assertions in `search_service.rs` tests; bundle visualizer gated behind env var.
