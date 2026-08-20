# Android EPUB Reader — Findings Report

**Date:** 2026-08-20  
**Scope:** Android EPUB reader, continuous flow, page navigation, highlights, notes, exact-location restore, memory.  
**Status:** Investigation complete; fixes not applied in this report.

## Validation boundary

- Android code path inspected: shared React reader gated by `isAndroid`, Android SAF/WebView integration, Android annotation view.
- `adb devices`: no device/emulator connected. No live Android reproduction or RSS measurement was possible.
- Host safety snapshot during investigation:
  - RAM: 15 GiB total, 9.1 GiB available
  - Swap: 4 GiB, 0 used
  - Disk: 23 GiB free
- No Android build launched during investigation. This avoided unnecessary laptop memory pressure. Future build commands must use bounded parallelism and live memory monitoring.

## Executive summary

Four high-confidence defects explain reported behavior:

1. **Global Android annotation jumps lose their location before book open.** `AnnotationCard` passes `(bookId, location)`, but `useBookActions` and `useBookOpen` accept/use only `bookId`. The clicked annotation ID is never put into `pendingAnnotationId`. Android opens the book at ordinary saved progress, not the clicked line.
2. **Continuous-flow jumps depend on currently loaded DOM.** Continuous mode intentionally keeps only seven chapters (`active ±3`). The pending-annotation retry loop only searches loaded DOM and expires after ~2.8 seconds; it never owns a reliable “load target chapter, apply mark, scroll” transaction.
3. **Mobile page navigation has duplicate event paths and no navigation lock.** Canvas click bubbles into reader click, while touch swipe can also trigger navigation. `loadChapter` has no request-generation guard. Rapid Android taps can double-navigate, queue smooth scrolls, or let stale chapter responses overwrite newer ones.
4. **EPUB memory is capped by item count in some places, not by Android-safe bytes.** Processed HTML inlines images/fonts as base64 data URIs; continuous DOM retains seven processed chapters; a module LRU retains five more chapter objects; Rust renderer cache is initialized at 100 MiB and preloads two adjacent chapters. A single large chapter can exceed intended cache limits.

## Findings

### F1 — P0: Android global annotation jump drops location and pending ID

**Evidence:**

- `src/components/annotations/AnnotationCard.tsx:25,87`
  - Prop supports `onOpenBook?: (bookId: number, location?: string) => void`.
  - Button calls `onOpenBook(result.annotation.bookId, result.annotation.location)`.
- `src/components/ViewRouter.tsx:37,135`
  - Router accepts location in its type and passes `handleOpenBook` to `AnnotationsView`.
- `src/hooks/useBookActions.ts:23-29`
  - `handleOpenBook` accepts only `bookId` and calls `bookOpen.handleOpenBook(bookId)`.
- `src/hooks/useBookOpen.ts:171`
  - `handleOpenBook` accepts only `bookId`.
  - It clears stale explicit resume state at line 175 and never receives annotation location.
- `src/components/reader/PremiumSidebar.tsx:396-428`
  - In-reader sidebar does the correct second step: calls `setPendingAnnotationId(annotation.id)` before navigating.

**Observed result:**

Android Annotations screen → tap “Jump to location” → book opens, but no pending annotation ID exists. Reader resumes ordinary DB progress. Exact line cannot be selected.

**Fix direction:**

Create one typed `OpenBookTarget` contract:

```ts
{ bookId: number; location?: string; annotationId?: number }
```

Thread it through `ViewRouter` → `useBookActions` → `useBookOpen`. Parse chapter index and scroll/CFI. Set `explicitResumeTarget` plus `pendingAnnotationId` before `openBook`. Do not clear the target during the subsequent open sequence. Add Android regression test.

---

### F2 — P1: Continuous flow does not guarantee loading an annotation's target chapter

**Evidence:**

- `src/components/reader/ContinuousEpubView.tsx:27-29`
  - `KEEP_ABOVE = 3`, `KEEP_BELOW = 3`.
- `src/components/reader/ContinuousEpubView.tsx:127-156`
  - Chapters outside the seven-chapter window are removed from React state/DOM.
- `src/components/reader/ContinuousEpubView.tsx:388-445`
  - Pending annotation loop calls `scrollToAnnotationMark` only against current container DOM.
  - It re-applies annotations only for `chapterRefs.current` entries already loaded.
  - It retries 35 times × 80 ms, then clears `pendingAnnotationId` without an error or retry state.
- `src/components/reader/ContinuousEpubView.tsx:288-339`
  - Lazy loading fetches only one adjacent chapter when scroll reaches a boundary. It is not a target-chapter loader.
- `src/components/reader/PremiumEpubReader.tsx:317-410`
  - Continuous mode still uses `loadChapter`, while `ContinuousEpubView` independently owns its chapter window. These two state machines can race during target navigation.

**Failure mode:**

Annotation points to chapter 40; current continuous window contains chapters 36–42 or a different window. Pending loop finds no mark, re-applies only loaded chapters, times out, clears pending state. User sees no redirect.

**Additional navigation issue:**

`hasAppliedInitialScroll` in `ContinuousEpubView.tsx:159-207` is one-shot. If a target chapter is already loaded, the `initialChapterIndex` prop can change without a guaranteed scroll to that chapter. `loadChapter` and continuous-flow target placement are not one atomic operation.

**Fix direction:**

Move annotation navigation into `ContinuousEpubView` as an explicit command:

1. Resolve annotation location.
2. If target chapter is outside window, fetch target chapter directly.
3. Replace/merge window with target-centered chapters.
4. Apply highlights after DOM commit.
5. Wait for layout/images/fonts with `ResizeObserver`/bounded RAF retry.
6. Scroll exact mark.
7. Clear pending state only after successful scroll; preserve failure state otherwise.

Do not rely on a 2.8-second blind retry loop.

---

### F3 — P1: Exact-line restore is text-match based, not position based

**Evidence:**

- `src/components/reader/TextSelectionToolbar.tsx:214-232`
  - `getResolvedLocation()` stores only `chapter_N` based on nearest `data-chapter-index`.
- `src/components/reader/TextSelectionToolbar.tsx:236-278`
  - `api.createAnnotation` is called with `cfiRange` as `undefined`.
  - Only `selectedText` is persisted as the anchor.
- `src/lib/highlightAnnotations.ts:10-188`
  - Restoration walks every text node, tries direct/case-insensitive/normalized/flexible text matches, then wraps the first match.
  - Multi-node matching concatenates text nodes without structural separators.
- `src/lib/highlightAnnotations.ts:271-301`
  - Exact jump is `mark.scrollIntoView()` after a matching mark exists.

**Why Android exposes it:**

Android WebView layout/text normalization differs across WebView versions, fonts, whitespace, line wrapping, and sanitized HTML. Repeated text in a chapter also matches the first occurrence, not the original occurrence. If match fails, no mark exists and `scrollToAnnotationMark` returns false.

**Fix direction:**

Persist a stable range anchor in addition to selected text:

- EPUB CFI range from selection start/end, or
- chapter-local text-node path + offsets, with selected-text fallback.

Use selected-text matching only as migration fallback. Add duplicate-text and Android WebView normalization tests.

---

### F4 — P1: Mobile page navigation has duplicate click handling

**Evidence:**

- `src/components/reader/PremiumEpubReader.tsx:1037-1061`
  - Canvas has `handleCanvasClick`; horizontal edge clicks call `prevPage()`/`nextPage()`.
  - Handler does not stop propagation.
- `src/components/reader/PremiumEpubReader.tsx:1173-1206`
  - Parent `.premium-reader` also has `handleContainerClick`.
  - Same click bubbles to parent; parent again interprets left/right regions and calls `prevPage()`/`nextPage()`.
- `src/components/reader/PremiumEpubReader.tsx:1210+`
  - Both handlers are mounted in the same reader tree.

**Failure mode:**

One Android tap can execute two navigation/toggle paths. Depending on timing, page skips, returns, top bar toggles twice, or smooth scrolls overlap. Browser-synthesized click after touch increases variability.

**Fix direction:**

Use one navigation event owner. Preferred:

- Remove parent click interpretation when event originated inside canvas, or
- call `stopPropagation()` after canvas handles an edge action, or
- replace both with one delegated handler.

Add Android tap tests for left/center/right regions.

---

### F5 — P1: Chapter/page navigation has no in-flight request guard

**Evidence:**

- `src/components/reader/PremiumEpubReader.tsx:317-410`
  - `loadChapter` starts async `loadProcessedChapter` and commits result without a monotonic request token.
- `src/components/reader/PremiumEpubReader.tsx:944-1008`
  - `nextPage`/`prevPage` call `nextChapter`/`prevChapter` at chapter boundaries.
- `src/components/reader/PremiumEpubReader.tsx:1111-1141`
  - Touch swipe directly calls page navigation.
- `src/components/reader/GenericHtmlReader.tsx:74-82,267-276`
  - Generic reader already has `chapterRequestRef` and discards stale responses; EPUB reader does not.

**Failure mode:**

Rapid Android taps/swipes start multiple chapter loads. Slow IPC/resource processing returns out of order; an older response can overwrite the newer chapter. Repeated navigation can appear ignored or jump backward.

**Fix direction:**

Add `chapterRequestRef`/`AbortController` equivalent:

- increment token per navigation;
- ignore stale `getBookChapter`/processing result;
- disable/debounce navigation while transition is active;
- use `behavior: 'auto'` during Android transition, not stacked smooth scrolls.

---

### F6 — P1: Android layout timing makes scroll/page calculations stale

**Evidence:**

- `src/components/reader/PremiumEpubReader.tsx:373-406`
  - Restore uses one `requestAnimationFrame` plus a 50 ms timeout.
- `src/components/reader/ContinuousEpubView.tsx:166-180`
  - Initial scroll uses immediate calculation plus one 100 ms retry.
- `src/components/reader/premium-reader.css:479-490`
  - Scroll container uses smooth scrolling and touch momentum.
- `src/components/reader/premium-reader.css:596-668`
  - Paginated/two-page mode depends on CSS columns, `scrollWidth`, `clientWidth`, fixed viewport-height calculations, and scroll snap.
- `src/components/reader/PremiumEpubReader.tsx:944-1008`
  - Page boundary decisions use current `scrollWidth`, `scrollHeight`, and `client*` values.

**Failure mode:**

Images, fonts, CSS columns, and WebView layout can settle after the 50–150 ms restore window. `maxScroll`/page width is temporarily zero or stale. Page tap decides “at end” incorrectly or scrolls to a position that changes after layout.

**Fix direction:**

Use a bounded layout-stability helper:

- wait for `document.fonts.ready` where available;
- observe container with `ResizeObserver`;
- require 2–3 stable measurements before restore/navigation;
- clamp target after every measurement;
- disable smooth behavior during restore on Android;
- avoid CSS multi-column pagination on low-memory/mobile WebView if measurements remain unstable.

---

### F7 — P0/P1: EPUB memory is bounded by chapter count, not bytes

**Evidence:**

#### Frontend

- `src/components/reader/PremiumEpubReader.tsx:58-137`
  - `processEpubHtml` fetches every embedded resource and converts it to base64 data URIs.
  - Each resource temporarily exists as bytes, base64 string, data URI, and processed HTML.
- `src/components/reader/PremiumEpubReader.tsx:221-242`
  - Module-level processed chapter cache keeps 5 full processed `Chapter` objects; no byte cap.
- `src/components/reader/ContinuousEpubView.tsx:27-29,155`
  - DOM/state keeps up to 7 processed chapters. A large image-heavy chapter can exceed normal Android WebView memory even within seven chapters.
- `src/components/reader/PremiumEpubReader.tsx:726-754`
  - Page-flip mode preloads previous and next processed chapter content.

#### Backend

- `src-tauri/src/lib.rs:712`
  - Rendering cache initialized at 100 MiB on every platform, including Android.
- `src-tauri/src/services/rendering_service.rs:410-446`
  - Full chapter HTML is cloned into the Rust cache.
- `src-tauri/src/services/rendering_service.rs:544-571`
  - Two adjacent chapters are synchronously preloaded.
- `src-tauri/src/services/cache.rs`
  - Cache has byte cap, but an individual item larger than the configured max can still be inserted because the eviction loop breaks when the cache is empty; cache capacity is also item-count bounded separately.
- `src-tauri/gen/android/app/src/main/java/io/github/vinayydv3695/shiori/generated/WryActivity.kt:149-154`
  - Android receives `onLowMemory`, but no reader-specific JS/Rust cache purge is connected to it.

**Fix direction:**

Android-specific memory profile:

- lower renderer cache to 16–32 MiB on Android;
- disable adjacent chapter preload on Android, or preload one small chapter only;
- add hard per-chapter byte limit and reject/stream oversized resources;
- replace base64 data URIs with bounded `blob:`/custom-protocol resources;
- make processed chapter cache byte-bounded and clear it on reader close/book change;
- reduce continuous window to `active ±1` on Android low-memory devices;
- wire Android low-memory callback to clear renderer + processed chapter caches;
- keep only one annotation application pass in flight.

**Measurement target:** Android app RSS must remain within a defined budget during a 50-chapter scroll test; do not use chapter count alone as the memory guarantee.

---

### F8 — P1: Highlight application is expensive and race-prone on weaker WebViews

**Evidence:**

- `src/components/reader/ContinuousEpubView.tsx:341-376`
  - Every chapter-window change fetches all annotations, filters them per chapter, waits 50 ms, then walks each chapter DOM.
- `src/components/reader/ContinuousEpubView.tsx:388-445`
  - Pending jump can fetch all annotations and re-run DOM wrapping repeatedly.
- `src/lib/highlightAnnotations.ts:10-188`
  - For each annotation, a full `TreeWalker` pass runs; existing marks are removed first.
- `src/components/reader/PremiumEpubReader.tsx:849-882`
  - Non-continuous mode repeats the same full-book annotation fetch for each current chapter.
- `src/components/annotations/useAnnotationsData.ts:25-53` and `AnnotationsViewAndroid.tsx:245-255`
  - Global Android annotation view requests up to 1000 items and renders them without virtualization.

**Failure mode:**

On Android, long chapters or many annotations block the main thread. Highlight wrapping may finish after the retry window, be cleared by a later stale pass, or make touch/page input feel frozen.

**Fix direction:**

- Load annotations once per book; index by chapter location.
- Apply only annotations for newly committed chapter DOM.
- Serialize/cancel annotation application jobs with a generation token.
- Use stored CFI/range anchors before text scanning.
- Virtualize Android annotation list; cap initial results and paginate.
- Add performance marks around `api.getAnnotations`, TreeWalker, and DOM wrapping.

---

### F9 — P2: Android text-selection toolbar can race selection lifecycle

**Evidence:**

- `src/components/reader/TextSelectionToolbar.tsx:92-105`
  - Document capture listener prevents native context menu whenever selection exists.
- `src/components/reader/TextSelectionToolbar.tsx:108-159`
  - Global `selectionchange` listener schedules independent 200 ms hide timers; no timer ref/cancellation.
- `src/components/reader/TextSelectionToolbar.tsx:214-278`
  - Selection anchor is read at save time, after Android may have changed/cleared selection.
- `src/styles/premium-reader.css:2805-2841`
  - Android toolbar is fixed to the bottom rather than positioned near the selected range.

**Failure mode:**

Long-press selection, WebView selection handles, toolbar tap, and `selectionchange` can interleave. Toolbar disappears, note/highlight button loses the selected range, or native selection behavior is suppressed.

**Fix direction:**

Snapshot selection range/text when selection becomes stable; keep a range ref independent of live `window.getSelection()`. Cancel hide timer when toolbar receives pointer/touch down. Scope context-menu suppression to reader content and only after custom toolbar is ready. Add Android long-press tests.

---

## Root-cause map to reported symptoms

| Reported symptom | Most likely causes |
|---|---|
| Highlights/notes absent in continuous flow | F2, F3, F8; especially target chapter not loaded or text match failed |
| Page change intermittently ignored/skips | F4, F5, F6 |
| Annotation does not return to exact line on Android | F1 first; F2/F3 for in-reader continuous mode |
| Reader slows/freezes after long reading | F7, F8 |
| Notes/highlight save appears unreliable after long press | F9, plus delayed F8 DOM work |

## Recommended implementation order

1. **Fix global annotation target contract (F1).** Highest certainty; small vertical slice.
2. **Add EPUB annotation anchor/range persistence (F3).** Preserve selected-text fallback for old rows.
3. **Add EPUB navigation generation lock + remove duplicate click path (F4/F5).** Directly addresses mobile page changes.
4. **Implement target-centered continuous navigation (F2).** Load target chapter before pending retry.
5. **Add Android layout-stability restore (F6).** Resize/font/image settled measurements.
6. **Add Android memory profile (F7).** Byte caps, Android cache sizes, low-memory purge, no aggressive preload.
7. **Serialize/index annotation rendering (F8) and stabilize selection toolbar (F9).**

## Android QA matrix

### A. Annotation creation/render

1. Open image-heavy EPUB on Android.
2. Enable continuous flow.
3. Select text spanning inline tags and create highlight.
4. Create note on same selection.
5. Scroll beyond three chapters, then back.
6. Verify mark/color/note tooltip appears after reload and after app restart.
7. Repeat with duplicate sentence occurrences.

### B. Global annotation jump

1. Highlight chapter 10.
2. Exit reader.
3. Open Android Annotations view.
4. Tap “Jump to location”.
5. Verify book opens at chapter 10 and exact mark is centered.
6. Repeat with target outside continuous window.

### C. Page/navigation stress

1. Android phone, paginated mode, one-page and two-page modes.
2. Single right-edge tap: exactly one page advance.
3. 10 rapid right-edge taps: no skips, stale chapter overwrite, or dead input.
4. Swipe, tap, rotate/resize, then navigate.
5. Repeat in continuous mode at chapter boundaries.

### D. Memory stress

1. Use Android Studio Memory Profiler / `adb shell dumpsys meminfo <package>`.
2. Record baseline after reader open.
3. Scroll 50 chapters with images, notes, continuous mode.
4. Open/close sidebar repeatedly; create/apply 100+ highlights.
5. Record peak and post-GC RSS/Java/native/graphics memory.
6. Trigger background/foreground and low-memory callback.
7. Required result: bounded plateau; no monotonic growth; reader remains responsive.

## Memory-safe laptop execution

Until a device is attached:

```bash
free -h
adb devices
CARGO_BUILD_JOBS=2 npm run tauri android build
```

For Gradle builds, keep Gradle heap bounded in the environment/config rather than allowing an unrestricted heap. Monitor in another terminal:

```bash
watch -n 2 'free -h; echo; ps -eo pid,comm,rss,%mem --sort=-rss | head -12'
```

Stop build if available RAM falls below ~2 GiB or swap starts growing rapidly. Do not run desktop and Android release builds concurrently. Do not treat a successful desktop build as Android validation.

## Conclusion

This is not one defect. Android combines weaker WebView timing/CPU/memory with several desktop-oriented assumptions: location is discarded at the global open boundary, annotation anchors are fuzzy text only, continuous flow has no target-load transaction, page navigation has duplicate event ownership, and EPUB memory is not byte-bounded end-to-end.

Fix F1/F3/F4/F5 first for correctness. Fix F7 before increasing preload/window sizes. Validate on a real Android device; current host has no attached device/emulator, so this report is code-evidence based, not a claim of runtime verification.

## Fix status (2026-08-20)

Implemented and gated (backend lib tests 296/0, frontend tests 187/0, `tsc --noEmit` clean, no new eslint errors):

- **F1 (P0)** — Annotation target now threads `(bookId, location, annotationId)` through `ViewRouter` → `useBookActions` → `useBookOpen`. Pending annotation ID + derived resume target are set before `openBook`.
- **F2 (P1)** — Continuous nested-chapter navigation: `initialChapterIndex` change resets the one-shot scroll gate, so target navigation lands on the requested chapter; pending annotation retry consumes cached annotations instead of re-fetching each attempt.
- **F3 (P1)** — New chapter-local text-offset anchors (`cfiRange` JSON `{version, chapterIndex, start, end}`) are saved on highlight/note/vocabulary creation and applied before the legacy fuzzy selected-text scan. Duplicate-text and Android whitespace cases now restore the exact occurrence. Old annotations keep the fuzzy path.
- **F4 (P1)** — Canvas click calls `stopPropagation()`; parent click handler ignores canvas clicks. One Android-synthesized tap = one navigation.
- **F5 (P1)** — EPUB chapter loads now use a request token + in-flight guard: stale `getBookChapter`/processing responses are discarded; rapid tap/swipe sequences cannot land out of order.
- **F6 (P1)** — Scroll/pagination restore awaits stable layout (`document.fonts.ready` + 10-frame `scrollHeight/Width/client*` stability) before applying ratios.
- **F7 (P0/P1)** — Memory caps: Rust renderer cache 32 MiB on Android (100 MiB desktop), adjacent chapter preload disabled on Android, one item larger than the whole cache is rejected, Android processed-chapter cache is 3 items / 16 MiB (5 / 64 MiB desktop) with byte-based eviction, page-flip preload disabled on Android, continuous window `active ±1` on Android, processed chapter cache cleared on reader close/book change.
- **F9 (P2)** — Selection toolbar snapshots the selection range anchor before WebView clears it, cancels the delayed hide timer on toolbar pointerdown, and uses the snapshot when the live selection is gone.

Not yet implemented:
- Android low-memory Rust callback wiring (generated `WryActivity`/`Rust.kt` — not hand-edited).
- Android annotation-list virtualization (currently capped implicitly by API limit 1000).

## Fix status (second pass, 2026-08-20)

- **Android low-memory wiring** — `MainActivity.onLowMemory` now dispatches a `shiori-low-memory` webview event; `src/lib/lowMemory.ts` (wired once in `App`) purges processed-chapter cache, online blob cache, and the Rust renderer cache under OS pressure.
- **Annotation list render cap** — `useAnnotationsData` pages results in 100-item increments with "Show more annotations" in both Android and Desktop views; no more 1000-card first paint.
- **Nav throttle** — reduced 180 ms → 120 ms so deliberate fast page-turns stay responsive while duplicate synth-clicks stay blocked.
- **Mobi/HTML layout restore** — `waitForStableReaderLayout` (fonts.ready + 10-frame metric stability) now gates scroll restore in `MobiReader` and `GenericHtmlReader`, replacing blind 300 ms timers.
