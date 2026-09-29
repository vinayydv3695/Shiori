# R8 — Android & Low-End Device Recon (READ-ONLY pass)

Scope: WebView config, hardware accel, memory pressure, touch/scroll, thermal/battery, storage costs, APK.

## Already good
- `MainActivity.kt` implements `onLowMemory()` → posts `shiori-low-memory` JS event → frontend purges processed-chapter cache, online image LRU, Rust renderer cache (`src/lib/lowMemory.ts`, wired in `App.tsx:54`). Exactly the right pattern.
- Android-specific resource caps: renderer cache 32 MB (`lib.rs:~927`), conversion workers = 1 (`lib.rs:~940`), DB `mmap=64MB / cache=-8000` (`db/mod.rs:55-58`), manga disk page cache capped 512 MB (`commands/manga.rs:96`).
- `MotionConfig reducedMotion="always"` on Android (`main.tsx`) + `is-android` root class (`App.tsx:69-73`) — animations already reduced platform-wide.
- Release build: R8 minify + resource shrinking (`gen/android/app/build.gradle.kts:41-52`); debug symbols only in debug.
- `androidx.webkit:webkit:1.14.0` present (modern WebView APIs available).

## High

### H1. CBZ download destination is broken-ish on Android
- **File:** `src-tauri/src/commands/sources.rs:681-707`
- **Evidence:** if `defaultImportPath` is a `content://` SAF URI it is skipped; else `app_handle.path().download_dir()`; final fallback `PathBuf::from(".")` — the process CWD, not a valid writable location on Android. So on Android the downloaded CBZ either lands in an app-private dir (fine but accidental) or the chapter download fails outright after all pages were fetched. The subsequent `import_online_manga_chapters` takes **file paths** — with SAF-managed storage (Mode B, `lib.rs:571-581` installs an SAF tree bridge) plain-path imports of those CBZs may not resolve.
- **Fix:** on Android, download into `app_local_data_dir()/downloads` (guaranteed writable, asset-protocol covered) or write via the SAF plugin into the user's tree; then import from the same scheme. Add a regression test with `content://` default path.

### H2. Backdrop-filter / heavy CSS on the series & reader chrome
- **Evidence:** `SeriesView.tsx` overlay `backdrop-blur-sm`, sticky controls `backdrop-blur-3xl` (~line 745), hero `blur-3xl scale-125` (~line 87); similar `backdrop-blur-*` classes across cards/dialogs. Backdrop-filter forces per-frame offscreen compositing passes — a known jank source on Android WebView with big scroll surfaces (1000-card dialog = worst case). `reducedMotion` does not cover CSS blur/shadow.
- **Fix:** an `is-android` (or capability-detected "low-effects") CSS variant: swap backdrop-blur → solid/ translucent backgrounds, drop `shadow-2xl`/multi-layer gradients on list items.

## Medium

### M1. No per-ABI splits for release APK
- **Evidence:** `gen/android/app/build.gradle.kts` has no `splits { abi { … } }` block; whether per-ABI APKs are produced depends on `tauri.build.gradle.kts` (applied, not inspected line-by-line here — **verify**). A universal APK bundles arm64+armv7+x86(_64) `libshiori.so`; with `opt-level="z"` each `.so` is size-tuned but ×4 ABIs is still large. Per-ABI splits (or AAB for Play) directly cut install size.

### M2. Touch/scroll: `useMangaScroll` + zoom containers on low-end
- `react-zoom-pan-pinch` + `@use-gesture/react` are in the reader path (`ZoomPanContainer.tsx`, `useMangaScroll.ts`); not profiled here. Flag for F8: verify wheel/touch handlers are passive and transforms are compositor-only (`transform`, not layout props). The scroll views (`ContinuousWebtoonView.tsx` etc.) use TanStack virtual — good base.

### M3. Startup on Android does desktop-grade work
- Extension WASM scan (`lib.rs:637-683`), source store hydration, Torbox key load, RSS scheduler start, Discord skip (desktop-only — good), Cloudflare clients are `cfg(not(android))`-gated for RPC webviews but `CfClient::new` spawns looked unconditional in setup (verify cfg gates around `lib.rs:~750-860` during F8) — on a weak CPU each of these adds to cold start. Budget target 2.5 s to first paint needs a startup trace to allocate costs (Phase 1 harness).

## Low
- `minSdk = 26`, `targetSdk = 36` — sane. `usesCleartextTraffic=false` in release — good.
- `tauri-plugin-android-saf` + `android-auth` local plugins — keep; SAF import path documented in skill.
- WebView hardware acceleration: Tauri default is on; no evidence of `setLayerType` overrides — fine.
- Image decode on `<img>` tags happens on the WebView main thread for full-size pages (R4-M2) — more pronounced on Android; adopt `createImageBitmap`/`img.decode()` (F4).

## Fix directions for F8
1. Android-safe download/import path (H1) with SAF test.
2. Low-effects CSS mode keyed off `isAndroid` (+ optional manual toggle) for blur/shadow-heavy surfaces (H2), prioritizing `SeriesView`, dialogs, reader chrome.
3. Verify ABI splits + measure APK per-ABI; confirm `CfClient` cfg-gating; move nonessential startup inits post-paint.
4. Passive touch listeners + transform-only animations audit in reader zoom/scroll (M2).
