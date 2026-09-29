# R6 — Startup & Bundle Recon (READ-ONLY pass)

Scope: what runs before first paint, eager imports, bundle composition, assets, Vite/Tauri config, APK/installer size.

## Measured (this pass, `dist/` from the 1.0.16 build of 2026-09-27)
| Asset | Size | Note |
|---|---|---|
| `dist/assets/index-*.js` (entry) | **1.5 MB** minified | biggest JS by far |
| `dist/assets/index-*.css` | 464 KB | Tailwind + themes |
| `pdf.worker.min-*.js` | 964 KB | should load only with PDF reader |
| `pdfjs-*.js` | 416 KB | manualChunks-split (good) |
| `SettingsDialog-*.js` | 544 KB | lazy? verify trigger |
| `AniListDashboard-*.js` | 436 KB | lazy route (good) |
| `vendor-*.js` (react, react-dom, framer-motion) | 140 KB | manualChunks |
| `MangaReader-*.js` | 96 KB | lazy |
| `public/fonts/` (20 woff2) | 844 KB | all referenced from `fonts.css` |

## High

### H1. Entry chunk is 1.5 MB: what is eager?
- **Evidence:** `src/main.tsx` → `App.tsx` (eager) → `ViewRouter` (eager import at `App.tsx:2`) → **`LibraryGrid` is the one eager view** (`ViewRouter.tsx:3`) — everything else is `lazy()` (good). But the entry also statically pulls: all zustand stores imported by App (`App.tsx:9-32`), `lib/tauri.ts` (63 KB source, 2128 lines — the whole API surface in one module), framer-motion (in vendor), Radix tooltip, `lucide-react` icons used across eager components, `lib/sync`, hooks (`useKeyboardShortcuts`, `useBookActions`, `useLibraryFilter`…).
- **Action for F5:** chunk-audit the entry (rollup visualizer is already wired: `VITE_BUNDLE_VISUALIZER=true vite build`); split `lib/tauri.ts` type-only vs runtime; consider lazy `LibraryGrid` behind the library route like every other view; defer DevBanner; check whether `recharts` (statistics) or `cmdk` leak into the entry via shared imports.

### H2. Startup warms Cloudflare clients + hidden RPC webviews on desktop
- **File:** `src-tauri/src/lib.rs` (~lines 750-860)
- **Evidence:** in `setup()`: `CfClient::new("https://www.toongod.org")` and `CfClient::new("https://mangafire.to")` spawned at startup; and `BrowserRpc::new("shiori-rpc-manhwaread", …)` + `BrowserRpc::new("shiori-rpc-mangafire", …)` — **persistent hidden webviews** created and warmed during app setup (`#[cfg(not(android/ios))]`). Hidden webviews are the single most expensive desktop-side startup item here (each is a full WebKit/Blink process). They exist so the first MangaFire/ManhwaRead search is fast, but they cost every user — including users who never open online sources — at every cold start, and sit resident in RAM at idle.
- **Action:** lazy-init on first source use (keep warm thereafter); or init after first paint + idle. Same for the RSS scheduler (M2).

## Medium

### M1. Fonts: 20 woff2 files, no subsetting, all via one stylesheet
- **Evidence:** `public/fonts/` 844 KB total; `index.html:11` loads `/fonts/fonts.css` unconditionally at parse time. Reading fonts (CrimsonPro, EBGaramond, LibreBaskerville, Literata, AtkinsonHyperlegible) are only needed inside the reader; `fonts.css` `@font-face` blocks don't download until used (browser lazy-loads unused faces) — **verify** none are `preload`ed and that reader-only families aren't referenced by base styles (otherwise they fetch at startup).

### M2. Background services start at boot regardless of usage
- **File:** `src-tauri/src/lib.rs:957-984` — RSS `JobScheduler` created+started unconditionally in setup (even with zero feeds: `rss_scheduler.rs:35-118` adds a 30-min job + daily cron at boot). Frontend: `useAutoUpdate` checks 3 s after mount (`useAutoUpdate.ts:51,117`); `useDiscordRPCUpdater` on mount (desktop); `useOpenedFiles` drain; conversion event listeners; download listeners (`App.tsx:160-185`); `syncRegistrySources` (`App.tsx:150-153`). Individually small; together they define the first seconds of main-thread + IPC traffic. Gate scheduler start on "≥1 enabled feed"; defer updater/discord to post-paint idle.

### M3. APK/installer size contributors
- `tauri.conf.json` bundles `resources/espeak-ng-data/**/*` on all desktop targets (size unverified this pass — measure in Phase 1).
- Android `release`: R8 minify + resource shrinking ON (`gen/android/app/build.gradle.kts:41-52`) — good; **no per-ABI splits configured** in the app module (Tauri's gradle plugin builds per-ABI only if configured — verify `tauri.build.gradle.kts`; a universal APK carries 3-4 × `libshiori.so`).
- Rust deps suspected heavy (verify with `cargo bloat` in Phase 1): `symphonia features=["all"]`, `printpdf`, `resvg`, `wasmi`, `pdf-extract`, `lopdf`.

## Low
- `pdf.worker.min.js` (964 KB) sits in `dist/assets`; it's referenced by pdfjs only when the PDF reader mounts — verify no eager import (`react-pdf` chunk is split; good).
- `index.html` inline CSP meta is duplicated with `tauri.conf.json` CSP — drift risk, not perf.
- `StrictMode` in `main.tsx` — dev-only double render; production unaffected.
- Vite `modulePreload.polyfill=false` + crossorigin strip are load-bearing (documented in `vite.config.ts`) — do not revert (skill: tauri-dev).

## Fix directions for F5
1. Entry-chunk diet: lazy `LibraryGrid`, split `tauri.ts`, audit icons (lucide per-icon imports are already tree-shaken — confirm), move `recharts`/`SettingsDialog`/`TorboxControlCenter` firmly behind routes.
2. Post-paint scheduling: `requestIdleCallback`/setTimeout gates for updater, discord, sync-registry, source config hydration; RSS scheduler only when feeds exist.
3. Lazy Cloudflare/RPC webviews (with F7).
4. Font subsetting (pyftsubset) for UI fonts; reader fonts stay full but reader-gated.
5. Android per-ABI splits for release; measure `espeak-ng-data` and decide.
