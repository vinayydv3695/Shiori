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
- Seed DB at schema v50 (real copy). F2 migrations must append at v51+.
- `panic = "abort"` for size: rejected in-repo (breaks conversion panic containment). 
- Vite `crossorigin` restoration / modulepreload polyfill: rejected in-repo (blank white screen on AUR webkit2gtk).
- Fat LTO: OOMs 7-15 GB CI runners.

## Measurement protocol (Phase 1 forward)
- Every optimization needs before/after numbers in the commit message + `perf/BASELINE.md` comparison.
- Benchmark harness must run the *identical* seed dataset for before/after (seed tool spec in RECON-SUMMARY → Agent B).
- Regression guards to add in Phase 3: DOM node cap on list pages, IPC payload cap, EXPLAIN-PLAN assertions for the 5 hottest queries, bundle-size budget check in CI.
