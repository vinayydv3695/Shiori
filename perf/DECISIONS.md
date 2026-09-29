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

## F9 post-commit verification (2026-09-29, item #1 closed)
- `CARGO_INCREMENTAL=0 cargo test --lib`: **415 passed, 1 failed, 4 ignored**. The single failure is `conversion::formats::pdf_geometry::geometry_tests::tables_reconstructed` — inside the concurrent session's active PDF-geometry refactor, not F9. All download/reader/db tests pass. Re-run when their refactor lands.
- Still not done (fresh session, in order): #2 manual cancel→retry smoke, #3 GUI trace pass, #4 desktop cancel UI (DownloadQueuePanel) + `cancelled` status fidelity in `onlineDownloadStore`, #5 stale `.parts` age sweep, #6 EPUB base64 check (coordinate with reader session) / font subsetting / Android per-ABI + opt-level A/B, #7 RSS visibility bridge, #8 four pre-existing vitest failures (DownloadQueuePanel TooltipProvider ×3, OnlineMangaDetailView ×1).

## Measurement protocol (Phase 1 forward)
- Every optimization needs before/after numbers in the commit message + `perf/BASELINE.md` comparison.
- Benchmark harness must run the *identical* seed dataset for before/after (seed tool spec in RECON-SUMMARY → Agent B).
- Regression guards to add in Phase 3: DOM node cap on list pages, IPC payload cap, EXPLAIN-PLAN assertions for the 5 hottest queries, bundle-size budget check in CI.

## Fresh-session execution: F9 follow-ups #8/#4/#5/#2/#7, #6, #3 (2026-09-29, session 2)
- **#8 fixed:** all 4 pre-existing vitest failures were one root cause — `AppTooltip` requires the `TooltipProvider` mounted by `main.tsx`; both test files now wrap renders. Online folder 41/41; full vitest 294/294. Commit `41ea076f`.
- **#4 desktop cancel parity:** `DownloadQueuePanel` gains a cancel affordance on `downloading` rows (pages-unit only) routed through a `cancelTarget` slot in the shared `useDownloadQueueUI` store; `OnlineMangaView` registers the handler on mount (panel is mounted globally in `GlobalDialogs`). `onlineDownloadStore.DownloadProgress.status` gains `'cancelled'`; `DownloadProgressBar` renders it distinctly (amber badge, resume point `N / M pages`, dismiss). Commit `a18788db`.
- **#5 stale `.parts` sweep:** at download start, `.cbz.parts` dirs with dir-mtime >7 days are removed (`spawn_blocking`, best-effort), excluding the resuming chapter's own parts dir. 2 unit tests. Commit `bb9e0fa0`.
- **#2 parts-protocol round-trip:** extracted `part_path_for` / `pending_page_indices` / `assemble_cbz_from_parts`; test covers partial run → pending indices → retry → assembly (order, sniffed extensions, unknown→jpg, byte-identical, parts dir removed only after rename). Commit `1309c8fb`.
- **#7 RSS app-hidden pause bridge:** `BackgroundGate` (`Arc<AtomicBool>`) managed in `lib.rs`; flipped by desktop `Focused(false/true)`, mobile `Suspended/Resumed`, tray hide/show; the 30-min feed job skips its whole wakeup while paused. The daily EPUB job is deliberately NOT gated (tokio-cron has no missed-occurrence replay — gating would silently drop the digest for idle users). Commit `09d43aef`.
- **Rust suite now fully green:** `cargo test --lib` **420 passed / 0 failed / 4 ignored** (the concurrent session's `pdf_geometry` failure resolved itself).
- **#6a EPUB base64 (R4-H3) — RESOLVED (already fixed by the reader session):** `processEpubHtml` rewrites every resource to `shiori-epub://` URLs; CSS is inlined as `<style>` with `url()`s rewritten (`PremiumEpubReader.tsx:141-260`). No base64 path remains. Stale `lowMemory.ts` comment corrected.
- **#6b fonts — measured, no change:** 721.6 KB woff2 + 9.4 KB css. Only Inter (40.7 KB / 4 faces) is referenced by non-reader CSS; the other ~680 KB are reader-gated and lazy (no preload). Subsetting would only shrink dist/APK (<700 KB) with zero cold-start effect and risks missing glyphs for arbitrary book scripts. Do not subset.
- **#6c Android per-ABI — already implemented in CI:** `release.yml` matrix builds only `arm64-v8a` + `armeabi-v7a` with `--apk --split-per-abi` and R8/shrinkResources. x86/x86_64 never built. Remaining gap is measured APK size (needs a device/AVD or CI run) — not a config gap.
- **#6d opt-level A/B — BLOCKED by disk:** release build dir needs ~5 GB; root fs was at 100% (debug `target` is 17 GB, owned by the concurrent session). Baseline recorded: `opt-level=z` release bin **62,238,432 B (59.4 MiB)**, build 18m14s; release bench `reopen 8.43 ms vs persistent 535 µs (15.8×)`. Variant command for a machine with ≥8 GB free: `cargo build --release --bin shiori --config 'profile.release.opt-level="s"'`.
- **#3 GUI trace (desktop):** isolated XDG copy of the real profile (seeded 20-book library), 3 runs: window shell visible at **83-110 ms**, first non-blank app content at **0.58-0.80 s** — cold-start budget (<1.5 s) **MET** on this machine. RSS ~1.4 GB across 5 processes at idle.
- **#3 NEW BUG — idle CPU burn (not fixed):** a release build sits at **~98-101 % CPU in one `WebKitWebProcess`** while idle on Home. Reproduced with (a) XWayland and (b) native Wayland, and (c) with all covers loading (0 asset-protocol errors), so it is not a trace artifact. Prime suspect: `Layout.tsx:457-459` — three viewport-sized `blur-[120px]`/`blur-[150px]` blobs with `animate-ambient` / `animate-ambient-slow` infinite 15 s/20 s animations (plus `home.css` `meshBreath`/`orbFloat`). The idle-CPU budget is **FAILED** until an A/B (disable those layers → re-measure) attributes and fixes it. Scroll/page-turn FPS remains unmeasured (no scriptable reader driver in this harness).
