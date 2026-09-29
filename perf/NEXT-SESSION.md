# NEXT SESSION — kickoff

Paste to the new session: **"Read perf/NEXT-SESSION.md and execute the handoff list."**

## Status snapshot (session 2 complete, 2026-09-29)
- HEAD: `09d43aef` + session-2 docs commit. Perf follow-ups #8, #4, #5, #2, #7 are **done**; #6 and #3 are measured/reported; one **new bug** found.
- Rust: `cargo test --lib` **420 pass / 0 fail / 4 ignored** (fully green, incl. the once-failing pdf_geometry test).
- Frontend: `tsc -b` clean; `vitest run` **294/294** (the 4 pre-existing failures fixed, #8).
- Working tree: concurrent session's files only — **do not touch `src-tauri/src/conversion/**`, `src/components/online/{OnlineMangaView,OnlineMangaDetailView}.tsx`, `src/components/library/ModernBookCard.tsx`, `src-tauri/tests/convert_probe.rs`**.
- Disk warning: `/` is at ~97 % (debug `target/` is 17 GB and shared with the concurrent session). A full release build needs ~5 GB more than currently free.

## Session-2 outcomes (details: `perf/DECISIONS.md` §session 2, `perf/PERF-REPORT.md` §4)
- **#8** TooltipProvider wraps in 2 test files (`41ea076f`).
- **#4** Desktop cancel in DownloadQueuePanel via `useDownloadQueueUI.cancelTarget`; store `'cancelled'` status (`a18788db`).
- **#5** 7-day stale `.parts` sweep at download start (`bb9e0fa0`).
- **#2** Network-free cancel→retry→assembly round-trip test (`1309c8fb`).
- **#7** `BackgroundGate` app-hidden pause bridge for the 30-min RSS job (`09d43aef`).
- **#6a** EPUB base64: **resolved already** (resources go through `shiori-epub://`); stale comment fixed.
- **#6b** Fonts measured (721.6 KB; only Inter 40.7 KB non-reader) — decision: **no subsetting**.
- **#6c** Android per-ABI: already in CI (`--split-per-abi`, arm64+armv7, R8). APK size measurement still open.
- **#6d** `opt-level` A/B: baseline `z` recorded (59.4 MiB bin; bench 8.43 ms vs 535 µs); `s` variant **aborted — disk 100 %**.
- **#3** Desktop trace: cold start **0.58–0.80 s content** (budget met ✅); **idle CPU ~98–101 % in one WebKitWebProcess** (❌) — suspect `Layout.tsx:457-459` ambient blur animations.

## Execute in this order
1. **Idle CPU bug (highest value).** Reproduce (launch the release bin, wait 26 s, sample `/proc` jiffies of the process tree — scripts in `/tmp/shiori-trace/` if still present, else re-create). A/B: disable only the three `animate-ambient` blobs in `Layout.tsx` (or gate them behind `document.hidden`/reduced-motion), rebuild, re-measure. If that drops to ~0 %, ship the fix; if not, next suspects are `home.css` `meshBreath`/`orbFloat` and `skeleton.tsx` `animate-glass-shimmer`.
2. **`opt-level` A/B** — free ≥8 GB first (do **not** delete the concurrent session's debug `target/`); then `cargo build --release --bin shiori --config 'profile.release.opt-level="s"'`, compare binary size + release `manga_page_bench` against the `z` baseline.
3. **Android APK size** per ABI — needs a device/AVD or a CI run (`tauri android build --apk --split-per-abi --target arm64`).
4. **FPS / page-turn traces** on desktop (and Android when available) — the reader was not scriptable in the harness; a manual session or added instrumentation is required.
5. Re-run gates after any code change: `cargo test --lib`, `npx tsc -b`, `npx vitest run`, budget scripts.

## Rules (unchanged)
- Explicit-path `git add` only. Never `-A` (concurrent session edits this repo live).
- `CARGO_INCREMENTAL=0` for cargo commands (shared target dir).
- Budget guards: `python3 perf/bench/assert_budgets.py`, `bash perf/bench/bundle_budget.sh` (entry ≤900 KB).
- Entry-chunk questions: `node perf/tools/eager-graph.mjs <lib>`.
