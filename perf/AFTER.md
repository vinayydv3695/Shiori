# perf/AFTER.md — Phase 3 verification results

Date: 2026-09-29. Same machine/dataset as `perf/BASELINE.md` (3,150 books, 1,100-chapter series, FTS).

## Gates
| Gate | Result |
|---|---|
| `cargo check --lib` | clean (0 errors) |
| `cargo test --lib` | **408 passed, 0 failed**, 4 ignored |
| `cargo test --test manga_page_bench` | pass (F4 A/B, see below) |
| `npx tsc -b` | clean |
| `npx eslint` (touched files) | no new errors vs HEAD (verified per-file counts) |
| `npx vitest run` | 287 passed, **4 failed — all pre-existing** (proven at base commit 4e3b7c87: DownloadQueuePanel ×3 + OnlineMangaDetailView ×1) |
| `perf/bench/assert_budgets.py` | all SQL budgets met |
| `perf/bench/bundle_budget.sh` | pass (entry 1480 KB / budget 1500 KB; dist 6680 KB / budget 6800 KB) |

## Measured wins
| Metric | Before | After | Method |
|---|---|---|---|
| Manga page extraction (100 pages) | 14.34 ms | **2.15 ms (6.7×)** | `cargo test --test manga_page_bench -- --nocapture` |
| Status updates ×200, one transaction vs autocommit pattern | 18.84 ms (autocommit) | **1.30 ms (14.5×)** | `perf/bench/sql_bench.py` Q4/Q4b |
| Series linkage updates ×200, one tx vs autocommit | 2.76 ms | **0.83 ms (3.3×)** | Q5/Q5b |
| Entry JS chunk | 1505 KB | **1480 KB (−25 KB)** | `vite build` + `bundle_budget.sh` |
| v52 composite index query plan | `TEMP B-TREE FOR ORDER BY` | `TEMP B-TREE FOR LAST TERM` | `EXPLAIN QUERY PLAN` in `perf/bench/results/ab_*.md` |

Timing noise note: all read queries measured within ±35 % across runs while the machine was compiling in parallel; an isolated A/B of the v52 index (3.85 ms vs 3.97 ms, Q3) is within noise — the index is kept for the plan improvement, **not** claimed as a timing win.

## Structural changes (measured only as counts, not wall-clock)
| Change | Before | After |
|---|---|---|
| SeriesView DOM cards mounted (1100-chapter series, 4-col grid) | 1000 cards | ~24 cards (visible rows + 3 overscan) |
| Mark-all-read IPC calls | 1000 | 1 |
| Download progress events per 1000-chapter batch (20 pages/ch) | ~20,000 | ~≤4/sec while downloading (≥250 ms coalescing) |
| Chapter download page throughput | 1 page / (fetch + 150 ms) | 3 pages in flight, no fixed per-page sleep (60 ms per-worker stagger) |
| Chapter-level download parallelism | 1 | 2 |
| HomePage favorite fetch IPC | ≤100 getBook | 1 getBooksByIds |
| `book-updated` store patch IPC | N getBook | 1 getBooksByIds |
| Per-page SQLite query in reader path | 1 per rendered page | 0 (hash cached per path) |
| Page reads re-opening the ZIP | every page | none (persistent archive) |
| Startup: CF clients + hidden RPC webviews | during setup (cold-start path) | 8 s after setup (post-paint) |

## Regression guards added
- `tests/perf/grouping.perf.test.ts` — grouping micro-bench + tripwire (runs in `npm test`).
- `perf/bench/assert_budgets.py` — SQL budget assertions (read ≤5–20 ms, batched writes ≤10 ms, autocommit loops bounded).
- `perf/bench/bundle_budget.sh` — entry ≤1500 KB, dist ≤6800 KB (tighten as the bundle shrinks).
- Existing: EXPLAIN-PLAN assertions in `search_service.rs` tests; visualizer gated behind `VITE_BUNDLE_VISUALIZER`.

## Re-run everything
```bash
python3 perf/seed/seed_db.py            # rebuild deterministic dataset
python3 perf/bench/sql_bench.py --label after
python3 perf/bench/assert_budgets.py
npx vitest run
cd src-tauri && cargo test --lib && cargo test --test manga_page_bench -- --nocapture
cd .. && npx vite build && bash perf/bench/bundle_budget.sh
```
