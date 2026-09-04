# Shiori Desktop EPUB Reader — Full Audit & Fix Report

**Session**: 1 — Desktop Audit  
**Branch**: `audit/epub-desktop`  
**Target Architecture**: Desktop only (Linux, macOS, Windows)  
**Date**: September 4, 2026  

---

## 1. Inventory & Classification

All files participating in EPUB rendering, chapter lifecycle, navigation, annotations, and reading state were inventoried and classified into one of three platform tiers:
- **`DESKTOP-ONLY`**: Platform-gated to non-mobile, or only reachable from desktop UI paths.
- **`SHARED`**: Core logic and UI components used on both Desktop and Android.
- **`ANDROID-ONLY`**: Mobile-gated or Android-specific implementations (skipped per audit scope).

### 1.1 Frontend Inventory (`src/`)

| File Path | Classification | Role / Purpose |
| :--- | :---: | :--- |
| `src/components/reader/PageFlipEngine.tsx` | **DESKTOP-ONLY** | Framer Motion page flip & 3D book-curl transition engine (gated by `!isAndroid && pageFlipEnabled`). |
| `src/components/reader/DoodleCanvas.tsx` | **DESKTOP-ONLY** | SVG stylus/pen overlay for handwriting directly onto book pages. |
| `src/components/reader/DoodleToolbar.tsx` | **DESKTOP-ONLY** | Floating drawing tools palette (pen, colors, widths, undo/redo). |
| `src/components/reader/ReaderTooltip.tsx` | **DESKTOP-ONLY** | Desktop hover tooltip primitive for reader actions. |
| `src/components/reader/ReaderAnnotationTooltip.tsx` | **DESKTOP-ONLY** | Hover & click popover previewing annotations, notes, and vocabulary definitions. |
| `src/components/annotations/AnnotationsViewDesktop.tsx` | **DESKTOP-ONLY** | Full-window desktop annotations manager with multi-column masonry and sidebar. |
| `src/components/reader/ContinuousEpubView.tsx` | **SHARED** | Virtualized vertical continuous scrolling canvas for EPUB chapters. |
| `src/components/reader/PremiumEpubReader.tsx` | **SHARED** | Root reading controller coordinating pagination, settings, layout, and IPC. |
| `src/components/reader/ReaderLayout.tsx` | **SHARED** | Full-screen container mounting format-specific reader engines. |
| `src/components/reader/ReaderTopBar.tsx` | **SHARED** | Floating / auto-hiding top navigation and tool bar. |
| `src/components/reader/ReaderSettings.tsx` | **SHARED** | Typography, margins, themes, and reading layout preferences panel. |
| `src/components/reader/PremiumSidebar.tsx` | **SHARED** | Slide-over drawer housing Table of Contents, Bookmarks, and in-book search. |
| `src/components/reader/TextSelectionToolbar.tsx` | **SHARED** | Contextual floating toolbar for highlighting, note-taking, and dictionary lookups. |
| `src/components/reader/TranslationPopup.tsx` | **SHARED** | In-reader definition and translation modal. |
| `src/components/reader/AnnotationSidebar.tsx` | **SHARED** | Side list of notes and bookmarks for quick jumping. |
| `src/components/reader/AnnotationExportDialog.tsx` | **SHARED** | Modal for exporting annotations to Markdown, JSON, or text. |
| `src/components/reader/TTSControlBar.tsx` | **SHARED** | Text-To-Speech control bar (Piper / eSpeak on desktop; Android TTS bridge). |
| `src/components/reader/ResumeReadingDialog.tsx` | **SHARED** | Prompt to resume reading from last position or start from beginning. |
| `src/components/reader/ReadingProgressIndicator.tsx` | **SHARED** | Reading percentage, chapter progress, and time estimate footer. |
| `src/components/reader/ReaderErrorBoundary.tsx` | **SHARED** | Crash containment boundary for corrupted or malformed chapters. |
| `src/components/reader/BookSkeletonLoading.tsx` | **SHARED** | Loading placeholder during initial chapter parsing. |
| `src/components/reader/epubChapterCache.ts` | **SHARED** | In-memory LRU cache of parsed and sanitized chapter HTML. |
| `src/components/reader/readerContent.ts` | **SHARED** | Chapter content fetching and DOM extraction adapters. |
| `src/components/reader/readerCapabilities.ts` | **SHARED** | Format feature flags (search, pagination, continuous, TOC). |
| `src/components/reader/readerRouting.ts` | **SHARED** | Navigation path helpers. |
| `src/components/annotations/AnnotationsView.tsx` | **SHARED** | Router dispatching to Desktop or Android annotation views. |
| `src/components/annotations/AnnotationCard.tsx` | **SHARED** | Card component rendering highlights, notes, and vocabulary definitions. |
| `src/components/annotations/AnnotationsGraphView.tsx` | **SHARED** | Knowledge graph visualization of cross-book notes. |
| `src/components/annotations/QuoteCardDialog.tsx` | **SHARED** | Visual image generator for sharing quotes. |
| `src/components/annotations/useAnnotationsData.ts` | **SHARED** | Hook managing annotation filtering, sorting, and stats. |
| `src/hooks/usePremiumReaderKeyboard.ts` | **SHARED** | Global reader keyboard shortcut listener. |
| `src/hooks/useReaderAutoHide.ts` | **SHARED** | Timer-based auto-hiding of reader top bar and chrome. |
| `src/hooks/useReaderTheme.ts` | **SHARED** | Theme synchronization (paper, dark, sepia, midnight). |
| `src/hooks/useReadingProgress.ts` | **SHARED** | Keystroke and scroll debounce for persisting reading progress. |
| `src/hooks/useReadingSession.ts` | **SHARED** | Duration tracking for reader analytics. |
| `src/hooks/useKeepScreenOn.ts` | **SHARED** | Wake lock management during active reading. |
| `src/hooks/useTTS.ts` | **SHARED** | Sentence parsing and audio synthesis controller. |
| `src/lib/highlightAnnotations.ts` | **SHARED** | DOM range highlight serialization, anchoring, and styling. |
| `src/lib/readingProgressCache.ts` | **SHARED** | Client-side memory cache of chapter progress. |
| `src/styles/page-flip.css` | **DESKTOP-ONLY** | 3D perspective and transition styling for `PageFlipEngine`. |
| `src/styles/premium-reader.css` | **SHARED** | Theme variables, font sizing, margin widths, and highlight styling. |
| `src/components/annotations/AnnotationsViewAndroid.tsx` | **ANDROID-ONLY** | Mobile-only drawer view for annotations (skipped). |
| `src/components/annotations/AndroidAnnotationCard.tsx` | **ANDROID-ONLY** | Mobile-optimized touch card for highlights (skipped). |

### 1.2 Backend Inventory (`src-tauri/`)

| File Path | Classification | Role / Purpose |
| :--- | :---: | :--- |
| `src-tauri/src/commands/reader.rs` | **SHARED** | Tauri IPC commands for annotations, reading progress, goals, stats, and TTS. |
| `src-tauri/src/services/reader_service.rs` | **SHARED** | Database queries and transactions for annotations and progress. |
| `src-tauri/src/services/epub_adapter.rs` | **SHARED** | ZIP archive unpacker, spine reader, and resource extraction for EPUB. |
| `src-tauri/src/services/epub_builder.rs` | **SHARED** | EPUB generation and compilation engine. |
| `src-tauri/src/commands/rendering.rs` | **SHARED** | IPC handler for custom protocol resource serving (`shiori-epub://`). |

---

## 2. Desktop-Only Bug Audit & Applied Fixes

In accordance with Prompt A instructions, all bugs residing strictly in **DESKTOP-ONLY** files were remediated and committed individually.

### Bug D-01: PageFlipEngine Strips Custom Protocol Resources & Inline CSS Styles
- **Severity**: Major / Rendering Glitch
- **File**: `src/components/reader/PageFlipEngine.tsx` (Lines 181–195, 219–223)
- **Classification**: `DESKTOP-ONLY`
- **Root Cause**:
  `PageFlipEngine` sanitized incoming chapter HTML twice: first via `sanitizeBookContent`, and second via a raw `DOMPurify.sanitize(safeCurrentContent)` directly inside `dangerouslySetInnerHTML`. The raw call omitted options:
  1. Default DOMPurify strips unknown URI schemes, removing all `shiori-epub://` and `tauri://` protocols from `<img>`, `<picture>`, and font `<link>` tags. All images in 3D page-flip mode rendered as broken blanks.
  2. Default DOMPurify removes `style` attributes, stripping chapter-specific indentation, paragraph spacing, and formatting.
  3. Running full DOMPurify parsing synchronously on every React render caused rendering stutter during animations.
- **Applied Fix**:
  Configured `sanitizePageFlipContent` using `EPUB_SAFE_URI_REGEXP` allowing `shiori-epub:` and `tauri:` protocols and preserving `style` attributes. Replaced the double sanitization with a single memoized sanitize pass.
- **Commit**: `0b0c6f4c` — *fix(reader): preserve protocol resources and prevent timeout leaks in PageFlipEngine*

### Bug D-02: PageFlipEngine Timeout Leaks on Rapid Flips & Stale Memo Comparators
- **Severity**: Major / UX Glitch
- **File**: `src/components/reader/PageFlipEngine.tsx` (Lines 157–176, 228–236)
- **Classification**: `DESKTOP-ONLY`
- **Root Cause**:
  1. Imperative methods `flipForward` and `flipBackward` initiated `setTimeout(() => handleAnimationComplete(...), flipSpeed + 30)`. These timers were not assigned to a cleanup ref. Rapidly pressing next/prev keys or unmounting the component during a transition fired state updates and chapter jumps on unmounted components.
  2. The custom `memo` comparator omitted `className` and `onFlipComplete`. Changing reading settings that altered layout classes (margins, font families, theme styles) caused `PageFlipEngine` to suppress re-renders.
- **Applied Fix**:
  Added `flipTimerRef` to clear and reset timers on successive flips and component unmount. Updated `memo` comparison to check `prev.className === next.className` and `prev.onFlipComplete === next.onFlipComplete`.
- **Commit**: `0b0c6f4c` — *fix(reader): preserve protocol resources and prevent timeout leaks in PageFlipEngine*

### Bug D-03: DoodleCanvas Data Loss on Page Turn or Reader Exit
- **Severity**: Data-loss
- **File**: `src/components/reader/DoodleCanvas.tsx` (Lines 70–106, 203–212)
- **Classification**: `DESKTOP-ONLY`
- **Root Cause**:
  User strokes were saved via a 2000ms debounce timer. The `useEffect` cleanup hook executed `clearTimeout(saveTimeoutRef.current)` without committing pending strokes. Flipping chapters or closing the reader within 2 seconds of drawing guaranteed 100% data loss of all new strokes. Additionally, `crypto.randomUUID()` lacked a runtime fallback on legacy environments.
- **Applied Fix**:
  Implemented an immediate `flushSave` routine executed during unmount and chapter transition if `isDirty` is true, persisting pending drawings to SQLite before teardown. Added a secure fallback for UUID generation.
- **Commit**: `aa86e59a` — *fix(reader): flush pending doodle strokes on unmount and page change*

### Bug D-04: Detached Ghost Tooltip When Scrolling Past Annotations
- **Severity**: Minor / UX Glitch
- **File**: `src/components/reader/ReaderAnnotationTooltip.tsx` (Lines 84–136)
- **Classification**: `DESKTOP-ONLY`
- **Root Cause**:
  `ReaderAnnotationTooltip` calculated viewport coordinates from `mark.getBoundingClientRect()` on hover/click. However, event listeners were only attached to `mouseover`, `mouseout`, and `click`. When the user scrolled the reading container via mouse wheel, trackpad, or scrollbar, the tooltip remained pinned to absolute viewport coordinates while the referenced text scrolled away, displaying a disconnected ghost popup over unrelated text.
- **Applied Fix**:
  Attached passive capturing `scroll` and `resize` listeners to `window` that automatically dismiss unpinned and pinned tooltips as soon as viewport content moves.
- **Commit**: `b7f4d9dc` — *fix(reader): dismiss detached annotation tooltip on scroll and resize*

### Bug D-05: Multi-Column Margin Collapse Layout Glitch in AnnotationsViewDesktop
- **Severity**: Cosmetic / Layout Glitch
- **File**: `src/components/annotations/AnnotationsViewDesktop.tsx` (Lines 523, 553)
- **Classification**: `DESKTOP-ONLY`
- **Root Cause**:
  Containers used `columns-1 md:columns-2 xl:columns-3` with Tailwind's `space-y-4 md:space-y-6`. In CSS multi-column layouts, top margins applied by `space-y-*` (`> * + *`) cause margin-collapsing anomalies across column breaks. Cards positioned at the top of columns 2 and 3 received unwanted `margin-top: 1.5rem`, creating an uneven, jagged top baseline across columns.
- **Applied Fix**:
  Removed `space-y-4 md:space-y-6` from both `columns-*` containers. Cards already feature `break-inside-avoid mb-4 md:mb-6`, which properly handles natural column spacing.
- **Commit**: `078dac30` — *fix(annotations): align multi-column card tops in AnnotationsViewDesktop*

---

## 3. Shared/Cross-Platform Issues — Needs Manual Review

Per instructions for Step 3, the following issues were discovered in **SHARED** files during this audit. They have been left unedited to avoid collisions with the Android audit, and are documented below with root causes, proposed solutions, and cross-platform risk assessments for unification in Session 3 (`audit/epub-shared`).

### Issue S-01: Intra-Book Anchor & Footnote Navigation Trap in ContinuousEpubView
- **Severity**: Major
- **File**: `src/components/reader/ContinuousEpubView.tsx` (Lines 718–740)
- **Classification**: `SHARED`
- **Root Cause**:
  `ContinuousEpubView` intercepts clicks on `target.closest('a')` by invoking `handleExternalLinkClick(e.nativeEvent, contentRef?.current ?? null)` followed immediately by `return;`.
  `handleExternalLinkClick` exclusively handles `http:`, `https:`, and `mailto:` links, returning `false` for internal anchors (such as `<a href="#footnote-1">` or `<a href="chapter04.xhtml#note">`). Because `return;` is called unconditionally on any `<a>` element, internal anchor links are dropped entirely. The browser never navigates to the footnote or cross-reference target.
- **Proposed Fix**:
  Inspect `anchor.getAttribute('href')`. If it starts with `#` or points to an internal EPUB document ID:
  1. Parse the target element ID or filename.
  2. Search rendered chapters for the matching ID (`document.getElementById(targetId)`).
  3. If the chapter is already loaded, execute `targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })`.
  4. If the target chapter is outside the current virtual window, load that chapter into the window first, then scroll to the element.
- **Risk Assessment**:
  Low risk for both Desktop and Android. Enhances standard academic and fiction reading flows on both platforms by enabling footnotes and endnotes to jump accurately.

### Issue S-02: Late Image Decode Layout Shift Above Viewport in ContinuousEpubView
- **Severity**: Major
- **File**: `src/components/reader/ContinuousEpubView.tsx` (Lines 371–397)
- **Classification**: `SHARED`
- **Root Cause**:
  In `ContinuousEpubView`, the `ResizeObserver` compensates for height changes (late image/font decodes) by adding height deltas to `container.scrollTop`. However, it checks:
  ```ts
  if (target.getBoundingClientRect().bottom <= 0) {
    delta += size - prev;
  }
  ```
  If a large chapter is currently visible in the viewport (i.e. `target.getBoundingClientRect().top < 0` but `bottom > 0`), and an image located in the *off-screen portion above the user's current reading position* finishes decoding, `bottom <= 0` evaluates to `false`.
  Consequently, `delta` is NOT added to `container.scrollTop`. The text the user is actively reading abruptly jumps downward by the height of the newly decoded image.
- **Proposed Fix**:
  Measure the position of images within the active chapter relative to `scrollTop`. When an element above `scrollTop` within the current active chapter resizes, add that element's specific height delta to `scrollTop`.
- **Risk Assessment**:
  Moderate. Scroll compensation logic directly governs reading stability. Must be verified on both high-DPI desktop displays and mobile touch screens with momentum scrolling.

### Issue S-03: Search Highlight Helper Injects `<style>` into Head of Fragment
- **Severity**: Major / Rendering Quirk
- **File**: `src/components/reader/PremiumEpubReader.tsx` (Lines 281–304)
- **Classification**: `SHARED`
- **Root Cause**:
  `highlightSearchTerm` parses HTML using `new DOMParser().parseFromString(html, 'text/html')`, creates `<style>` in `doc.head`, and returns `doc.documentElement.outerHTML`.
  When this outerHTML string is rendered inside `<div dangerouslySetInnerHTML={{ __html: content }} />`, putting `<html>`, `<head>`, and `<style>` inside a `<div>` is non-standard HTML. While WebKit and Chromium tolerate it, the inner `<style>` tag can be discarded or purged depending on browser sanitation passes.
- **Proposed Fix**:
  Extract the `.search-highlight` styling into `src/styles/premium-reader.css` (which is already loaded globally). Have `highlightSearchTerm` return `doc.body.innerHTML` instead of `doc.documentElement.outerHTML`.
- **Risk Assessment**:
  Low. Consolidating CSS into global stylesheets is cleaner and avoids DOMParser fragment head bloat on both desktop WebView and Android WebView.

### Issue S-04: Unhandled Promise in TTSControlBar Event Listener Unmount
- **Severity**: Minor / Memory Leak
- **File**: `src/components/reader/TTSControlBar.tsx` (Lines 121–137)
- **Classification**: `SHARED`
- **Root Cause**:
  `listen<PiperDownloadProgressPayload>(...)` returns a `Promise<UnlistenFn>`. In `useEffect`:
  ```ts
  listen(...).then((fn) => { unlisten = fn; });
  return () => { if (unlisten) unlisten(); };
  ```
  If the reader unmounts before `listen()` resolves, `unlisten` is undefined at cleanup time. When the Promise resolves later, `unlisten` is assigned but never called, leaking the event listener in the Tauri runtime.
- **Proposed Fix**:
  Adopt the standard cancelled flag pattern:
  ```ts
  let cancelled = false;
  let unlisten: (() => void) | undefined;
  listen(...).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  });
  return () => {
    cancelled = true;
    if (unlisten) unlisten();
  };
  ```
- **Risk Assessment**:
  Negligible. Safe, standard Tauri event cleanup.

### Issue S-05: Mod+F Shortcut Not Bound in Desktop Reader View
- **Severity**: Minor / Desktop UX
- **File**: `src/hooks/usePremiumReaderKeyboard.ts` (Lines 41–65)
- **Classification**: `SHARED`
- **Root Cause**:
  Desktop users expect `Ctrl+F` (Windows/Linux) or `Cmd+F` (macOS) to trigger in-book search. Currently, `f` alone toggles Focus Mode, but `isMod && key === 'f'` is not captured, causing either the default browser search or no action.
- **Proposed Fix**:
  In `usePremiumReaderKeyboard`, add a handler for `isMod && key === 'f'` that opens the sidebar and switches the active tab to `search`.
- **Risk Assessment**:
  Low. Needs guard to ensure it doesn't conflict with any Android external keyboard setups.

---

## 4. Verification Checklist

Execute the following manual test procedures on Linux, macOS, or Windows to verify the desktop reader fixes and regressions:

### 1. 3D Page Curl & Page Transitions (PageFlipEngine)
- [ ] Open an EPUB containing illustrations and formatted chapters in Paginated mode (`Page Flip` enabled).
- [ ] Verify that images load immediately with `shiori-epub://` protocol URLs without missing graphics or broken icon placeholders.
- [ ] Test all four animation styles (`slide`, `fade`, `curl`, `none`) via Reader Settings (`Settings -> Animation`).
- [ ] Verify that chapter CSS styling (indents, margins, font sizes) is fully preserved during page curl transitions.
- [ ] Rapidly press the Right Arrow key (10+ times in succession). Verify there are no console errors, no unmounted state warnings, and navigation lands on the correct chapter without freezing.

### 2. Stylus & Mouse Doodling (DoodleCanvas)
- [ ] Enable Drawing Mode from the top bar or toolbar.
- [ ] Draw several colored pen strokes and an eraser stroke on the active page.
- [ ] Immediately press `Next Chapter` or close the reader without waiting for the 2-second debounce timer.
- [ ] Reopen the book and return to that chapter. Verify all drawn strokes are preserved and rendered accurately from SQLite.
- [ ] Test undo, redo, and color switching.

### 3. Annotation Tooltips on Scroll (ReaderAnnotationTooltip)
- [ ] Highlight a word or sentence and add a note.
- [ ] Hover the mouse cursor over the highlight to reveal the annotation tooltip.
- [ ] While the tooltip is displayed, scroll the reading canvas using the mouse scroll wheel.
- [ ] Confirm that the tooltip dismisses cleanly and does not remain floating in empty space.
- [ ] Click the highlight to pin the tooltip; scroll the page and confirm it dismisses or re-anchors properly.

### 4. Annotations Manager Multi-Column Layout (AnnotationsViewDesktop)
- [ ] Open the Annotations View (`Ctrl+Shift+A` or via the sidebar button).
- [ ] Select `All Annotations` and set view mode to `Grid`.
- [ ] Resize the desktop window across single-column, 2-column, and 3-column widths.
- [ ] Confirm that cards at the top of columns 2 and 3 align to the same top baseline as column 1 without unwanted top whitespace.
- [ ] Test live search, category filtering, and the `Copy All` markdown action.

### 5. Reading Position & Layout Stability
- [ ] Read a book in continuous vertical scroll mode past several chapters.
- [ ] Verify that chapter transitions show smooth dividers without layout jumping.
- [ ] Close the app and relaunch. Confirm that reading resume lands on the exact chapter and scroll offset previously reached.
