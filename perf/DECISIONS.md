# perf/DECISIONS.md — Running decision & dead-end log

Orchestrator: Kimi K3 (Lead Architect). Mission start: 2026-09-28.
Rule: nothing here is repeated in later rounds. New entries append with date + phase.

## Mission constraints recorded
- Rule 10 engaged: this harness has **no parallel subagent tool** → each swarm role (R1-R8, B, F1-F8) runs as a separate **sequential pass** with its own output file. Ownership table still enforced.
- Repo state at start: dirty working tree — **another session is actively editing this repo right now**. At mission start the dirty set was `commands/ai.rs`, `commands/mod.rs`, `db/migrations.rs`, `services/secret_store.rs`; by end of Phase 0 those were clean and the dirty set is `conversion/epub_builder.rs`, `translation_service.rs`, `ContinuousEpubView.tsx`, `PremiumEpubReader.tsx`, `TextSelectionToolbar.tsx`, `premium-reader.css` (+ untracked `convert/`, `conversion/report.rs`, `tests/convert_probe.rs`). **Collision risk: F4 owns `PremiumEpubReader.tsx`/`ContinuousEpubView.tsx` — verify the other session's changes landed before F4 edits; never clobber uncommitted work. F2 must re-check `db/migrations.rs` head version before appending.**
- Cargo release profile already tuned (`thin LTO, cgu=1, opt-level=z, strip, panic=unwind`). `panic="abort"` is a documented dead end (conversion engine relies on catch_unwind). **Do not retry.**
- Prior perf rounds exist (code comments `K3-007/013/025/027`, Slices 1/4/6): keyset pagination, batch author/tag hydration, cover micro-batcher, grid virtualization, online image LRU, EPUB chapter windowing are DONE. Verify-don't-redo.

## Phase 0 decisions (recon)
- Recon executed as 8 sequential passes; evidence gathered by reading hot-path files directly (graphify-out/ exists and is fresh but file:line evidence was required by mission rule 1).
- Ranked master bottleneck list → `perf/RECON-SUMMARY.md`.
- Areas deliberately NOT deep-audited this round (flagged for fixers to verify, not assumed broken): `PdfReader.tsx`, `renderer.rs` base64-vs-protocol question (R4-H3), `torbox.rs` internals, `piper_service.rs`, ABI split config in `tauri.build.gradle.kts`, `CfClient` cfg-gating.

## Phase 1 decisions (baseline)
- Baseline harness: Python SQL bench (faithful rusqlite-autocommit simulation) + vitest grouping micro-bench + visualizer bundle audit. GUI-level traces (FPS, cold start) deferred: documented gap, not claimed.
- **R1-M3 DOWNGRADED by measurement:** groupBooksBySeries = 2.1 ms at 2,050 books (series_index short-circuits the regex). Series jank = DOM render, not sort. Do not optimize the sorter.
- **R2 batching validated:** 200 autocommit status updates 18.8 ms vs 1.3 ms in one tx (14.5×); linkage 2.8 ms vs 0.8 ms (3.3×). Proceed with F2 batch commands.
- **Entry chunk confirmed (visualizer):** react-markdown+unified, plugin-updater, all src/lib TTS/AI/character modules, 21 stores eager in index-*.js (1.5 MB). F5 target list set.
- Seed DB at schema v50 (real copy); migration head in tree is v51 — F2 added v52 for the series composite index.

## Commit hygiene incident (2026-09-29, F2-a)
- `git add -A` in the F2-a commit (9fad881e) swept the concurrent session's in-flight files (TranslationPopup.tsx, conversion/epub_builder.rs, translation_service.rs, ContinuousEpubView.tsx, PremiumEpubReader.tsx, TextSelectionToolbar.tsx, premium-reader.css + untracked convert/…). No work was lost (all preserved in history), but the commit is not a clean single-purpose diff.
- Corrective rule for all further commits: explicit paths only (`git add <paths>`), never -A. Not rewriting history — the concurrent session's work must not be disturbed.
- TranslationPopup.tsx had a type error (`variant:'default'` not in the Toast union); fixed minimally to keep the tsc gate green (noted for the owning session).

## Dead ends / rejected (do not re-propose)
- `panic = "abort"` for size: rejected in-repo (breaks conversion panic containment). 
- Vite `crossorigin` restoration / modulepreload polyfill: rejected in-repo (blank white screen on AUR webkit2gtk).
- Fat LTO: OOMs 7-15 GB CI runners.

## Phase 2/3 decisions (fixes + verification)
- **v52 index kept without a timing claim:** controlled A/B 3.85 vs 3.97 ms (noise) at 1,100 rows; plan improved (`TEMP B-TREE FOR LAST TERM` vs full) — hygiene, not a win. Do not cite as speedup.
- **R1-M3 closed as non-issue** (grouping 2.1 ms @2050 books); **R1-H2 closed as dead code** (ModernListView/TableView have no importers).
- **Arc<[u8]> page cache rejected:** hit path copies at the `tauri::ipc::Response`/disk-write boundary anyway, so it would add diff churn without a measurable win. Revisit only with a zero-copy IPC path.
- **Download cancel/resume deferred:** needs a cancel registry + `.part` resume protocol; out of budget, listed as follow-up #3.
- **RSS scheduler gating rejected:** resident JobScheduler cost is tiny; gating on feed count risks disabling scheduling when the first feed is added later.
- **Entry-chunk literal grep is the reliable evidence method here** (visualizer JSON parsing failed twice; tree dump ≠ per-chunk mapping). Verified eager in entry: `plugin:updater`, `remarkPlugins`/`rehypePlugins` (react-markdown), `en-US-AriaNeural` (edgeTTS), `speechSynthesis`, `graphql.anilist.co`. Only the updater was removed (dynamic import, −25 KB).
- **Pre-existing test failures (4) proven at base commit 4e3b7c87** via `git worktree` (DownloadQueuePanel ×3 TooltipProvider, OnlineMangaDetailView ×1). Not ours; do not chase.
- **F1 test contract update:** `libraryMutation.test.ts` now asserts one `getBooksByIds` call (was N `getBook`) — intentional contract change, matches F2-a.

## Pass A2 decisions (entry-chunk split, 2026-09-29)
- **Root cause found with `perf/tools/eager-graph.mjs`:** `App.tsx -> lib/lowMemory.ts -> PremiumEpubReader.tsx` was the single eager edge putting the reader stack (react-markdown, TTS, AniList) in the entry. Fixed with dynamic imports in `lowMemory.ts`. **Entry 1480 -> 837 KB (-43%)**; literal grep confirms the libs are gone; budgets tightened (entry 900 KB / dist 7000 KB).
- Visualizer JSON parsing abandoned as unreliable here; the static import-graph tool is the supported method (`node perf/tools/eager-graph.mjs <pattern>`). Keep imports static→dynamic parity in mind: tree-shaking is NOT modelled.
- **Pass B (download cancel + `.part` resume) briefed, not implemented:** full contract + anchors in `perf/slices/F9-download-cancel-resume.md`. Attempting the backend rewrite with the remaining context would have risked correctness (mission rule 9) — execute it as the next session's first slice.

## Pass F9 decisions (download cancel + resume, 2026-09-29)
- **Implemented.** Cancel registry: `ActiveDownloads::cancel_flags` (DashMap chapter_id → Arc<AtomicBool>), drop guard removes registrations on every exit path; loop checks the flag before request and after body (error sentinel: exact message `download cancelled`, frontend matches `includes('cancel')`). Resume: `<cbz>.cbz.parts/NNNN.bin` (presence = page done), CBZ assembled in index order to `<cbz>.cbz.tmp` then renamed; parts removed only after rename. Frontend: `cancelled` status + dock "Cancel" affordance + info toast (not an error).
- **Full `cargo test --lib` not re-run this session** (shared target dir held by the concurrent session's `cargo test --test convert_probe`); `CARGO_INCREMENTAL=0 cargo check --lib` finished clean (0 errors). Re-run the suite before release. `cargo check` also required `CARGO_INCREMENTAL=0` once because the shared incremental cache was corrupted by two concurrent cargo processes.
- Test contract updated: downloading rows are no longer disabled — `MangaDownloadDock.test.tsx` now asserts click-to-cancel (16/16 pass); `countChapterStatuses` gains `cancelled`.

## Measurement protocol (Phase 1 forward)
- Every optimization needs before/after numbers in the commit message + `perf/BASELINE.md` comparison.
- Benchmark harness must run the *identical* seed dataset for before/after (seed tool spec in RECON-SUMMARY → Agent B).
- Regression guards to add in Phase 3: DOM node cap on list pages, IPC payload cap, EXPLAIN-PLAN assertions for the 5 hottest queries, bundle-size budget check in CI.
