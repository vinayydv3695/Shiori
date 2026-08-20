# Release Notes (v2.3.42)

## Fixes

- **Android build fix: TTS permission not found** — `tauri-plugin-tts` was an optional dependency registered behind a feature (`native-tts`) that was never defined in `Cargo.toml`, so the plugin (and its `tts:default` permission set) was silently excluded from Android builds. It is now a required non-Linux dependency registered unconditionally, restoring the Android permission set and the native TTS path.
- **Android TTS silent playback** — the reader now advances sentences on the plugin's real `speech:finish` events instead of a blind timer, surfaces engine/voice errors with a toast, and reports "No TTS audio" when the engine never starts (voice data or media volume).

# Release Notes (v2.3.41)

## Features & Improvements

- **Premium Android Settings Glass Cards & Icon Badges** — Redesigned the Android settings tab list into sleek floating glass cards with theme icon badges and right chevron navigation indicators.
- **Android Settings Header Back Navigation** — Integrated a prominent back arrow button in the header bar on mobile devices for seamless one-tap back navigation and closing.

# Release Notes (v2.3.40)

## Features & Improvements

- **Android SAF Folder Picker Unregistered Launcher Fix (`SafPlugin.kt`)** — Added `activity.startActivityForResult` fallback with `onActivityResult` callback handling in `SafPlugin.kt`, resolving `IllegalStateException: Attempting to launch an unregistered ActivityResultLauncher` on Android 14.
- **Android Settings Navigation Back Button (`SettingsDialog.tsx`)** — Added a prominent back arrow button in the Settings title bar on Android and mobile screens, enabling one-tap back navigation and dialog closing.
- **Resolved iOS CI Compilation (`Cargo.toml` & `secret_store.rs`)** — Updated desktop `keyring` dependency target rules to `cfg(not(any(target_os = "android", target_os = "ios")))`, eliminating iOS Keychain `protected` compilation failures.

# Release Notes (v2.3.39)

## Features & Improvements

- **Fixed Piper Audio Asset URL Protocol Handling** — Wrapped local synthesized Piper TTS audio file paths with `convertFileSrc()` to eliminate HTML5 `<audio>` playback errors in WebViews and browser contexts.
- **Automatic Fallback to Web Speech API** — Added automatic fallback to System / Web Speech TTS if a Piper voice fails to synthesize or play, guaranteeing unbroken text-to-speech reading.
- **IPC Access Control & Error Handling** — Added `try-catch` error boundaries around `save_reading_progress` and reading progress batch IPC invokes to gracefully catch protocol or CORS access control issues.

# Release Notes (v2.3.38)

## Features & Improvements

- **Sleek 100% Opaque Glassmorphic Pill Text Selection Toolbar** — Redesigned the text selection menu on Android and Desktop into a solid, 100% opaque floating pill bar (`var(--bg-elevated)`) with zero background transparency bleed-through.
- **Unified Single-Row Action Controls & Haptics** — Replaced multi-row expand dropdowns and sharp hairline dividers with a single horizontal action pill containing Translate, Note, Highlight, Aloud, Define, and Copy with touch-friendly spacing and tactile haptic feedback ticks.

# Release Notes (v2.3.37)

## Features & Improvements

- **Android Touch & Gesture Reader Controls** — Implemented tap left/right page turns, center toolbar toggle, swipe left/right navigation, and tactile haptic vibration ticks (`navigator.vibrate`) across all readers on Android.
- **2-Pass DOM Text Matching & Automatic Sentence Highlighting for TTS** — Built 2-pass normalized text node index mapping (`sentenceHighlighter.ts`) that matches spoken text across line breaks, hyphens, and whitespace, with theme-adaptive gold focus highlights and auto-scrolling line centering.
- **Redesigned Single-Page Book Loading Skeleton Screen** — Created a full-page, theme-adaptive single-page skeleton screen with silky `shiori-shimmer` wave animation, matching exact reader text line heights, chapter titles, side navigation arrows, and top/bottom floating controls.
- **Android Online Download Manager & View Queue Toasts** — Enabled the Download Queue manager on Mobile/Android with a dedicated header action button and added interactive "View Queue" toast notifications whenever a book or manga download begins.
- **Gutenberg Image Proxy & Google Books Rate Limit Protection** — Routed Project Gutenberg cover images through `shiori-proxy` to fix 503/504 CDN load errors, added image fallback handling, and implemented cover caching with 60s backoff for Google Books API lookups.

# Release Notes (v2.3.36)

## Features & Improvements

- **Smooth Floating Dynamic Island Pill Topbar on Mobile & Android** — Replaced full-width square bar with a rounded floating pill topbar across mobile devices and Android, eliminating sharp corners and integrating seamlessly into reading themes.
- **Unified Mobile Reading Controls** — Populated topbar with direct one-tap access to Search, Table of Contents, Appearance Settings, and secondary action dropdown, eliminating empty space on mobile reader topbars.
- **Reader Settings Dropdown Polish & Clean Typography** — Refined reader settings appearance modal with smooth circular aesthetics, removed redundant nested scroll tracks, and ensured opaque, theme-consistent backdrop styling.
- **In-Book Search Engine & Chapter Title Resolution** — Upgraded book search with robust internal manifest ID filtering (e.g. `id1051`, `item01`) and preceding TOC chapter matching, ensuring clean chapter names rather than raw file IDs.
- **Theme-Adaptive Search Highlight & Single-Click Jump** — Replaced harsh neon search boxes with soft rounded theme-adaptive highlights (`color-mix`), added luminous jump pulse animation, and fixed two-tap navigation bug to jump instantly to the matched line on the first click across paginated and continuous flow readers.
- **Doodle & Drawing Mode Polish** — Redesigned the floating drawing toolbar with a mobile-responsive pill layout, compact color swatches, and width slider, preventing off-screen toolbar cutoff. Fixed drawing coordinate alignment and touch capture on Android and desktop.
- **Sidebar Tab Bar Polish** — Redesigned sidebar tabs as an interactive segmented pill control with responsive equal grid distribution, preventing text truncation or overflow on any viewport size.

# Release Notes (v2.3.34)

## Features & Improvements

- **Mobile Reader Menu & Android Fullscreen Cleanup** — Removed redundant fullscreen toggles on Android reader and manga topbars, and ensured the 3-dots action menu automatically resets and closes when navigating, changing books, or tapping actions.
- **Library Mobile Scroll-to-Top Positioning** — Positioned the scroll-to-top button on the left in the mobile Library view so it never collides with or hides behind the primary `+` Import floating action button.
- **Fixed "Read" Action in Shelves Section** — Unified book opening in Shelves view to route through global reader actions and dialogs, ensuring reading progress resumes smoothly and books open immediately on click.
- **Removed Shelves Horizontal Slider / Overflow** — Eliminated unwanted horizontal scrollbar track and layout protrusion across Shelves grid and book details.
- **High-Speed Project Gutenberg Catalog on Homepage** — Populated Online Books homepage rails (Trending, Sci-Fi, Classics, Fantasy/Adventure) with 100% verified Project Gutenberg books featuring direct CDN cover artwork and instantaneous direct Gutenberg EPUB downloads.

# Release Notes (v2.3.33)

## Features & Improvements

- **Production Build CSP & Online Cover Network Connectivity** — Upgraded Tauri CSP `connect-src` and `img-src` to allow external image CDN requests and `shiori-proxy:` schemes, ensuring covers in trending and subject rails load reliably in production desktop and mobile builds.
- **Robust Book Card Image Loading** — Enhanced `ModernBookCard.tsx` with resilient synchronous image state management and automatic Google Books cover fallback resolution.

# Release Notes (v2.3.32)

## Features & Improvements

- **High-Definition Online Books Spotlight Banner & Ambient Color Trail** — Added rich atmospheric color trail effect sampling book cover palettes across the spotlight banner, un-magnified true-proportion illustrated book artwork, and elevated 3D foreground book card with glossy highlights.
- **Dedicated Hero Book Banner Component** — Created `HeroBookBanner.tsx` for Online Books, isolating book banner presentation from Manga.
- **Seamless Manga Hero Banner Blending** — Added alpha gradient masking and ambient glow to `HeroMangaBanner.tsx`, eliminating sharp rectangular edges.
- **Google Books Primary Cover Resolver & 404 Localhost Proxy Fix** — Upgraded `fetchCoverForBook` to query Google Books API first with direct HTTPS support, resolving missing cover errors and avoiding invalid local proxy routing for public CDN book artwork.

# Release Notes (v2.3.31)

## Features & Improvements

- **Reader Sidebar Tab Reordering** — Reorganized reader sidebar navigation to `Search` → `TOC` → `Notes` → `Highlights` for immediate search-first access.
- **Android Online Books Action Routing** — Replaced "Read Now" with "Download Now" on Android across Online Books spotlight banner, search cards, side panels, and Gutenberg/LibGen details dialogs.
- **Responsive Mobile & Android Catalog Grids** — Upgraded book and manga grids to adaptive CSS Grid (`grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6`) eliminating awkward auto-fill wraps on mobile viewports.
- **Online Manga Detail & Carousel Polish** — Refined hero header typography, mobile cover sizing, touch-friendly chapter row margins, and full-bleed horizontal content rows on mobile.

# Release Notes (v2.3.30)

## Bug Fixes & Android Layout Polish

- **Theme-Aware Annotation & Definition Hover Tooltips** — Created `ReaderAnnotationTooltip` with dynamic reader theme color integration (`Black`, `Dark`, `Paper`, `Paper-Dark`, `Sepia`, `Light`), rendering words, IPA phonetic pronunciation, part-of-speech badge, audio player, numbered definitions with quotes/examples, translations, and markdown notes.
- **Circular Pill Highlights & Theme Blend** — Refined reader highlights and notes with smooth circular pill curves (`border-radius: 9999px`), theme ink multiplication (`mix-blend-mode: multiply` on paper/sepia/light), and smooth ambient pill rings for notes/vocabulary.
- **EPUB Page Transition System (Slide, Fade, Instant)** — Fixed page transition trigger in `PageFlipEngine` across chapter loads and navigation, providing silky-smooth Slide and Fade transitions with configurable speed.
- **Android Annotations Categories Filter Visibility** — Resolved mobile clipping of the `Categories` filter button in `AnnotationsViewAndroid` by wrapping filter chips in a smooth horizontal scroll container with non-shrinking pills and whitespace preservation.
- **Android & Desktop Series View Layout Polish** — Eliminated broken grid sizing and large list gaps by replacing fragile virtualizer measurement with clean responsive CSS Grid (`grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6`) and stacked list layouts, ensuring volumes are cleanly spaced and 2-column on mobile.
- **Series Volume Jump Navigation** — Improved volume/chapter jump scrolling with smooth native scroll alignment and glowing ring animation.

# Release Notes (v2.3.29)

## Features & Improvements

- **Shelf Aesthetics & Glassmorphism** — Streamlined empty shelf presentation with soft ambient radial backdrops and floating frosted glass icon vessels.
- **Dedicated Bookshelf Navigation Icon** — Created a bespoke `BookshelfIcon` in the desktop NavigationRail and mobile BottomNav for intuitive collection browsing.
- **Inline Details Banner & Theme Lighting** — Restored dynamic inline book details banner in shelves view with active theme accent illumination, triangle caret indicator, and smooth unclipped ambient shadows.
- **Input & Search Alignment** — Fixed search input icon padding and text overlap across shelf views.

# Release Notes (v2.3.28)

## Features & Improvements

- **Shelves Overhaul (Desktop & Android)** — 3D book spine mockups, dynamic cover fan stacks, rich empty cards with "+ Add Books" actions, 3-dot action menus, search & filter chips bar (`All`, `Favorites`, `Smart`, `With Books`, `Empty`), and sort dropdowns.
- **Smart Shelf Presets** — 1-click templates for Currently Reading, Top Favorites, Manga & Comics, Novels & Fiction, and Plan to Read in shelf creation.
- **Inside-Shelf View** — Added Grid vs. List view switcher, in-shelf search/sort, reading progress % badges, and batch multi-select book removal.
- **Platform Separation & Touch Polish** — Android touch isolation for History (`HistoryViewAndroid`), Annotations, and Shelf cards with touch targets (≥36px).
- **Safe-Area Inset & Navigation Clearance** — Unified safe-area insets (`env(safe-area-inset-*)`) and bottom clearance (`pb-28`) across Library, Shelves, Online Manga, Online Books, and fullscreen dialogs.
- **Performance Optimization** — Collapsed sequential progress checks in Home tab to `getReadingProgressBatch()`, eliminating 20 IPC roundtrips per load.

# Release Notes (v2.3.27)

## Bug Fixes

- **AnnotationsViewDesktop** — Fixed `QuoteCardDialog` props to use correct `open`, `onOpenChange`, and `annotationData` interface.
- **HistoryView** — Corrected `saveReadingProgress` calls from object literal to positional arguments.
- **MangaHome** — Fixed Book property names (`file_format`, `added_date`), switched to per-book `getReadingProgress`, and corrected `StatsBar`/`ContinueReadingCard` props.
- **BookDetailsDialog** — Added missing `ConvertToEpubMenuItem` import.
- **SeriesView** — Added null guards for series in `DesktopSeriesHeader` and `MobileSeriesHeader`.
- **OnlineBooksView** — Added missing `api` import from `@/lib/tauri`.
- **OnlineMangaView** — Fixed `setSearchQuery` to pass required `'manga'` kind argument.

# Release Notes (v2.3.26)

## Improvements & Fixes

- **Reading Experience & Keyboard Navigation** — Disentangled `PageUp`/`PageDown` (page screen scrolling) from `Arrow` keys (line scrolling and chapter turns) across all reading modes.
- **Enhanced Dictionary & Vocabulary Workflow** — Added theme-styled tooltips with backdrop blur to dictionary actions and automated graceful exit animations upon saving definitions directly to notes/vocabulary.
- **Default Desktop Font Scaling** — Set default desktop book reader font size to 24px with enhanced typography scaling up to 48px.
- **Navigation & Library Polish** — Maintained clean desktop navigation hierarchy, enhanced book and manga cover sizing, reading analytics hero statistics, and mini activity heatmap.

# Release Notes (v2.3.25)

## Improvements

- **Source Health Checks** — Every online source now exposes a health status (Available / Unavailable / Blocked / Rate limited / Unknown) with a manual Check button in Settings → Online Sources; checks are conservative and never poll in the background.
- **Backend Source Enable/Disable** — The enable toggles now sync to the backend registry; disabled sources are rejected at the command layer (search, browse, chapters, pages, downloads, image proxy).
- **Structured Source Errors** — Sources now return typed errors (Network / Timeout / NotFound / RateLimited / AccessDenied / CloudflareChallenge / Parser / InvalidResponse) with friendly, human-readable messages instead of raw status codes.
- **Graceful Cloudflare Handling** — When a source requires browser verification, the app now detects it and explains it instead of retrying blindly. A **Verify in browser** button in the error panel lets you solve the challenge yourself (user-initiated, visible browser only — no automation). The previous automatic bypass machinery (headless stealth harvest, Turnstile auto-click, auto-solve windows, Playwright daemon) was removed in line with the security policy.
- **ToonGod Adapter Hardening** — Fetches through the shared Cloudflare-aware HTTP client (windowless), with 10-minute TTL caching for search and chapter lists.
- **MangaFire Adapter Hardening** — Health probe, structured error mapping, plain-HTTP XHR fast path with stored session cookies.
- **Shared Source Cache Module** — TTL-bounded generic cache used by both adapters.

## Testing

- Wiremock integration tests for ToonGod (search, popular, latest, chapters, pages, 403/404/429 mapping, cache single-fetch assertion) and registry enable/disable; 269 lib tests + 14 integration tests, all offline.

# Release Notes (v2.3.24)

## Improvements & Fixes

- **Direct Online Manga Library Navigation** — Clicking any online manga in your library directly opens that manga's full details and chapter list view instead of the generic browse homepage.
- **MangaFire Primary Source & Badge** — Set MangaFire as the top primary source across AniList import sync and updated library card badges to display MangaFire with quick-open actions.
- **High-Performance MangaFire Desktop RPC** — Connected the background Playwright browser daemon to MangaFire RPC requests with mutex locking and increased transfer chunk sizes, preventing timeout errors during parallel browse queries.
- **Scrollbar Consistency** — Enabled clean, theme-adaptive custom scrollbars across AniList Profile subviews, Dashboard, Reviews, Activities, Manga details dialogs, and Settings tabs.

# Release Notes (v2.3.23)

## Improvements & Fixes

- **Live Backup & Restore Progress with ETA** — Added real-time progress events from the Rust backend during backup creation and restoration, displaying percentage, processed items count, stage updates, and dynamic estimated time remaining.
- **Enhanced Sidebar Visual Hierarchy** — Fine-tuned desktop navigation sidebar layout to reach the bottom seamlessly, open all category groups by default, and scaled nested sub-item icons (16px) with clean row spacing for a clear subpart hierarchy.
- **Smooth Series Hero Banner** — Replaced sharp image division seams in manga and series detail views with full-width background coverage and multi-stop gradient masks.

# Release Notes (v2.3.22)

## Improvements & Fixes

- **AniList Profile & Activity Views** — Fully refreshed AniList user profile, activity feed, social tabs, and manga statistics views with theme-adaptive cards, smooth gradients, and Android-friendly touch targets.
- **AniList Reviews & Forum Discussions** — Added support for reading and opening AniList reviews as well as user forum discussion threads with rich previews and metric counters.
- **Redesigned AniList Import Dialog** — Upgraded the AniList manga import dialog to a spacious multi-column poster grid with high-resolution covers, live filters, and quick bulk actions.
- **Multi-Source Online Manga Fallback** — Added fast MangaDex lookup with resilient multi-source fallbacks (MangaFire, ToonGod, ManhwaRead) and timeout protection during AniList library sync.
- **Live Sync Dashboard** — Revamped the import progress view into an immersive split-canvas dashboard with a large hero cover showcase, smooth progress bar, and real-time sync queue.

# Release Notes (v2.3.17)

## Improvements & Fixes

- **Theme-Adaptive Custom Tooltips** — Replaced OS-level rectangular tooltips with rounded, frosted Radix tooltips with smooth entry animations.
- **Dynamic Reader Theme Matching** — Reader tooltips now reactively match the active reader theme (Sepia, Paper, Dark, OLED, Light) with matching palette backgrounds, text, and border styling.
- **Streamlined Menu Tooltips** — Cleaned up tooltips on menu dropdown items that already display visible text labels, keeping floating tooltips strictly on icon-only navigation and toolbar buttons.
- **Provider & Layout Safety** — Mounted `TooltipProvider` at the root and reader layout to ensure seamless tooltip rendering across all views and dialogs without runtime crashes.

# Release Notes (v2.3.15)

## Security

- **XSS chain closed** — AniList description HTML is now DOMPurify-sanitized in both detail views; RSS article links open in the system browser instead of hijacking the app webview; search-term highlighting HTML-escapes matches; backup restore only writes allow-listed `shiori-` localStorage keys; the debug store handle (`__PREFERENCES_STORE__`) is no longer exposed in production builds; pasted AniList tokens are shape-validated with clear errors instead of silently dropped.
- **SSRF hardening** — `is_safe_url` now blocks link-local (`169.254.0.0/16`), loopback `127.0.0.0/8`, CGNAT, IPv4-mapped IPv6, IPv6 loopback/link-local/ULA, and multicast ranges; fetches re-resolve DNS and pin the resolved public IP, and every redirect hop is re-validated; the guard is now applied to the manga image proxy, cover preview, Cloudflare image proxy (with host-match + cookie confinement), Discord resolve, ToonGod webview navigation and scraper chapter fetches; image proxies cap response size (25MB) and malformed URLs error instead of panicking.
- **Arbitrary file-write fixed** — annotation export (`write_text_to_file`) rejects NUL bytes, `.`/`..` segments and separator-terminated paths; Calibre conversion restricts `output_format` to alphanumerics; torrent downloads sanitize attacker-controlled filenames (CJK/space/multi-file paths preserved); library migration targets are confined to app-owned directories; `update_book` and background scans validate paths like `add_book` does.
- **Backup restore zip-slip fixed** — archive entries with traversal/absolute/NUL names are skipped and counted; restored database paths are validated (absolute, no traversal, parent must exist) so a crafted backup can no longer write outside extraction roots.
- **CSP tightened** — `script-src` drops `'unsafe-inline'` (no inline scripts exist; all three `eval` uses run in remote webviews, unaffected); dead scraper domains removed from `connect-src`; `fs:read-all` capability removed (zero usage); dev builds get a CSP meta tag.
- **Android update channel** — APK downloads are confined to GitHub release URLs, capped at 600MB, and SHA-256-verified against the release asset digest before install; release builds disable cleartext HTTP (debug keeps it for the dev server); `android:allowBackup` is disabled so the token-bearing database never leaves the device via adb/Drive backups.
- **Secrets & queries** — SQL limits from the frontend are clamped (0–1000); smart-shelf LIKE rules escape `%`/`_`; decompression bomb surfaces in FB2/MOBI/zip entry reads are capped; `embed_local_image` only inlines image-extension files ≤25MB; conversion temp dirs use 0700 `TempDir`; CBR extraction verifies all paths stay inside its temp root; poisoned-mutex unwraps replaced with `into_inner`; error messages no longer leak absolute paths.

## Bug Fixes

- **Migration data integrity** — v29 no longer drops six v8 preference columns (page-flip, paper-theme, doodle, adaptive-mode) on rebuild; new guarded v46 migration re-adds them for existing databases; v22 rebuild keeps the primary key and CHECK constraints; v5 normalizes lowercase conversion-job statuses so pre-v5 queued jobs resume correctly.
- **Misc** — shelf queries no longer return stale defaults for new book fields; trashed books stay visible in shelves as before (query parity across listing paths); conversion temp artifacts are cleaned up automatically.

# Release Notes (v2.3.12)

## Improvements

- **Smooth Advanced Filter Tab Transitions** — Switching between General, Metadata, Organization, and Status tabs now fades and glides content in with spring-animated sidebar pill highlights and a cross-fade panel transition.
- **Custom Theme-Aware Date Picker** — The calendar date picker now fully responds to pointer events inside Radix dialogs; selecting a date works correctly on all platforms.
- **Rating Section Layout** — Min/Max rating rows in Advanced Filters are now stacked full-width with a numeric value badge, preventing star rows from being clipped at the dialog edge.
- **Hidden Scrollbars** — Scrollbar sliders are now hidden across the main content area, Home section, filter panels, and dialogs while preserving full scroll functionality.
- **Collection Pills Redesign** — Favorites, Reading, Completed, and On Hold pills on the Home dashboard use `rounded-full` with proper padding so border outlines are always crisp and unclipped.
- **Theme Persistence Fix** — Fixed a `ReferenceError: Can't find variable: isDarkTheme` that blocked theme switching during onboarding and from the settings panel.
- **Recommended Section Icon** — The Recommended widget now shows a `ThumbsUp` icon instead of the generic Sparkles icon.

# Release Notes (v2.3.11)

## Improvements

- **Warmer Sepia Theme** — The Sepia palette has been richer and cozier: deeper golden parchment background (`hsl(36 50% 84%)`), warm cream book paper cards, and ultra-rich roasted coffee ink text. The theme now feels like a real vintage book rather than a plain off-white page.
- **Dialog Backdrop Blur** — All dialogs (Delete, Export, Settings, Metadata, etc.) now apply a clear `backdrop-filter: blur(12px)` with a comfortable semi-transparent dim behind them, so the library is softened instead of remaining fully visible or over-saturated.
- **Consistent Warning & Status Text Contrast** — Amber/warning banners (`bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200`), success badges (`text-emerald-800 dark:text-emerald-400`), and info alerts use proper high-contrast color pairs for both light/sepia and dark/OLED themes across AniList settings, backup restore, and storage mode indicators.

## Bug Fixes

- **No "Convert to EPUB" for comic archives** — CBZ and CBR formats no longer show the "Convert to EPUB" option in context menus or batch conversion, since comic archives are not convertible to EPUB.

# Release Notes (v2.3.10)

## Bug Fixes
- **Windows packaged builds: "Test Voice" failed with "Failed to initialize eSpeak-ng (code 0)"** — Tauri's canonicalized executable path carries a `\\?\` verbatim prefix on Windows, which espeak-ng's file APIs reject. The prefix is now stripped (`\\?\C:\` → `C:\`, `\\?\UNC\` → `\\`) before `PIPER_ESPEAKNG_DATA_DIRECTORY` is set, so bundled espeak-ng data resolves correctly in installed NSIS builds.

## Improvements
- **Real application logging** — Shiori now initializes `tauri-plugin-log` at startup, writing to `app_log_dir()/logs/shiori.log` (plus stdout). Piper/TTS diagnostics (resolved espeak-ng data path, searched candidates) are now visible in release builds on all platforms, including Windows where the console is hidden.

# Release Notes (v2.3.9)

## Improvements
- **Theme-aware notification toasts** — Sonner toasts and notification popups now adapt their colors to the active app theme instead of using a fixed dark navy style.
  - **Sepia / Light** (`[data-theme="white"]`): Warm Japanese parchment background (`#FAF6EC`), espresso ink text, sienna info badges, forest green success, ochre gold warning, terracotta error, and a soft warm shadow.
  - **OLED Midnight** (`[data-theme="black"]`): Pure pitch black (`#000000`), crisp white text, semi-transparent white border, and electric violet / neon emerald / radiant gold / vibrant coral type icons.
  - **Premium Dark** (`[data-theme="premium-dark"`): Deep obsidian charcoal (`#121218`), cool cream text, amber info, emerald success, amber warning, and crimson error icons.
- **Chapter Selector** — portaled to `document.body` on desktop (centered modal just below topbar) and a full bottom-sheet drawer on Android/mobile; no more Popper-flip collisions or out-of-bounds positions on either platform.
- **Floating Page Number icon** — replaced hash `#` with `FileDigit` icon on desktop to match the rest of the app.
- **Continuous Chapter Flow icon** — replaced the Sparkles icon with `Infinity` in both the sidebar and advanced settings panel for a clearer visual metaphor.

## Bug Fixes
- Fixed chapter list appearing upside down / outside viewport bounds on Android.
- Fixed syntax error in `MangaReaderHeader.tsx` that caused Vite's react-babel plugin to fail (`Unexpected token` at closing parenthesis).
- Fixed React hook-order error in `AdvancedSettingsPanel` caused by conditional hook calls.

# Release Notes (v2.3.5)

##  Performance
- **Scan/import cheap-first dedup** — rescanning a library no longer re-parses files or re-renders covers for books already known; scanning uses a bounded 3-thread pool.
- **Query layer** — new indexes for domain, reading status, trash, and progress; FTS is no longer reindexed on every reading-progress save; multi-word search fixed; formats lowercased for matching; bounded random sampling for recommendations; bucket-based duplicate finder.
- **Memory** — no whole-file reads: file-backed zip probing, CBZ/CBR cover reads touch a single entry, EPUB output streams, a decode-bomb guard, and lazy PDF text.
- **UI thread** — search, cleanup, thumbnail generation, and 10 more commands moved off the main thread.
- **Frontend** — search debounce, import payload cap, reader chapter cache, grid/page stability, per-download store subscriptions.

##  Bug Fixes
- **Backup restore is transactional** — a failed restore can no longer leave a half-wiped library.
- **Corrupt zip no longer panics** — malformed archives are handled gracefully.
- **Cancelled conversions stay cancelled**, and conversion workers survive panics instead of dying.
- **Temp files cleaned up** after conversions; stub conversions removed from the matrix.
- **Migrations no longer re-run on every startup**; the Cloudflare daemon is cleaned up.
- **Cover cache invalidation** fixed; MOBI/EPUB page-count display corrected.

##  Notes
- EPUB `page_count` is now chapter-based (spine length); MOBI `page_count` is `None` (word-scan removed).
- Full test suite green: 290 backend + 135 frontend tests.

# Release Notes (v2.3.3)

##  Bug Fixes
- **Android APK build fixed** — `createFileInTree` in the SAF plugin passed an unguarded nullable `mimeType` into `DocumentFile.createFile`, failing `:tauri-plugin-android-saf:compileReleaseKotlin` and blocking the release workflow's APK; coalesced to `*/*` default. The APK from v2.3.3 is the first to include the open-with ingestion and SAF Mode B features (v2.3.0/v2.3.2 desktop builds shipped without the Android artifact).

# Release Notes (v2.3.0)

##  New Features & Improvements
- **"Open with Shiori" ingestion (Android)** — file associations for epub/pdf/cbz/mobi/azw3/fb2: opening a book copies it into the managed library, indexes it (cover + metadata), and delete removes it; outcomes surface as toasts on launch/foreground; magic-byte sniffing handles extension-less content:// URIs.
- **SAF Mode B (Android)** — a user-chosen durable library folder via SAF that survives uninstall; one-time migration of managed books. App-private storage remains the default (wiped on uninstall — stated in the settings UI).
- **Selective backup/restore** — per-category selection (library/annotations/progress/preferences/sources/rss/covers/books), credentials off by default, conflict policy (skip/overwrite/keep both), uuid/hash re-linking, and a restore report. Old backups still restore (manifest v2, v1 treated as Everything); full backup/restore behaves like before.
- **Managed-book cleanup** — books owned by Shiori are removed from disk on delete instead of lingering.

##  Bug Fixes
- **Deleted books stay deleted** — a tombstone table (`deleted_books`) is written on permanent removal (recycle-bin-off delete, permanent delete, empty trash, 7-day auto-purge), so rescan/folder-watch no longer resurrects deleted books; managed (Shiori-owned) files are removed on delete. Explicit re-import of a tombstoned file prompts "Import anyway?" (clears the tombstone and re-imports); scans skip it silently.

##  Known Limitations
- No retroactive tombstones: books already resurrecting before this release can't be recovered automatically.
- Mode A folder is wiped on uninstall — use Mode B or backups.
- Android open-with and SAF Mode B need verification on a real device (emulator/desktop-tested code paths).
- The current library storage mode isn't shown after restart until a read command lands (cosmetic, tracked).

# Release Notes (v2.2.2)

##  New Features & Improvements
- **Android: keep screen on while reading** — the screen no longer dims mid-chapter (reader setting, default on).
- **Batch convert to EPUB** — multi-select books in the library → "Convert to EPUB" converts all, imports each and moves the originals to the recycle bin (per-book status in the dialog).
- **Bulk "Add to Shelf"** — assign multiple books to a shelf from the multi-select toolbar.
- **Download queue panel** — a Downloads slide-over shows every active book download with live progress (percent + MB); LibGen/Gutenberg register their titles.
- **Statistics: weekly trend chart** — pages-read and reading-time bars from real daily stats; reading-goal reached toast + badge.
- **MangaFire memory bound** — chapter/page caches capped at 50 series.

##  Bug Fixes
- `empty_trash` now also removes orphaned converted-EPUB files (only files no book references).
- Fixed a broken reference in OnlineMangaView (download-all button) and a missing reader-settings setter type (tsc clean).

# Release Notes (v2.2.0)

##  New Features & Improvements
- **Native multi-format reading**: PDF, MOBI, AZW3, DOCX, FB2, TXT, HTML and Markdown books now open in their original format — no more forced "Convert to EPUB" on open. Markdown (.md) is a fully supported new format (import, read, convert).
- **Convert-or-Open dialog**: opening a non-EPUB book offers "Convert to EPUB for the best reading experience" or "Open as-is" (per-book choice remembered for the session).
- **Convert to EPUB improvements**: live conversion percentage with stage labels; converted EPUB is auto-imported into the library and the original is moved to the recycle bin to avoid duplicates; the reader automatically swaps to the converted EPUB.
- **High-fidelity EPUB conversion**: real chapter/TOC/metadata/image extraction for every format (MOBI/AZW3 via the reader pipeline — 34 clean chapters vs. one giant blob before; PDF with line-based heading detection, no body text in titles, Info-dict title/author and embedded cover; DOCX with correct title/author; TXT with title heuristics; FB2/HTML/MD chapter structure). RSS "Generate Daily EPUB" output fixed and validated.
- **PDF reader matches the EPUB experience**: same topbar layout and controls, theme-adaptive pages (dark/black themes invert white PDFs, sepia/paper warm tints), typography settings applied to the text layer, "Page X of Y" indicator.
- **Book covers for every format**: embedded cover extraction for DOCX (first image) and FB2; Google Books → Open Library online lookup fallback when a book has no embedded cover.
- **Fixed the pdf.js worker**: worker bundled via Vite's worker pipeline + CSP worker-src + version-aligned pdfjs-dist — PDFs load reliably in built apps (previously stuck on "Rendering PDF Document…").

##  Bug Fixes
- MOBI: real decoder fixes — PalmDOC decompression (record padding, invalid matches), compression-2 books without huffman tables, hybrid UTF-8/cp1252 text decoding, vendored HUFF/CDIC decoder for huffman-compressed books. Garbled text is gone.
- DOCX: minimal-but-valid .docx files open and convert correctly (direct ZIP/XML fallback); corrupt files give a clean error.
- "Book N not opened" errors: TOC/chapter queries now lazy-open the book from the database — races on open are gone for every format.
- HTML/FB2/MOBI reader flicker on chapter change fixed (mount-effect churn guard + stale-response tokens); PDF endless loading loop fixed (same root cause class).
- EPUB conversion encoding: a byte-wise UTF-8 mangling bug corrupted every converted book ("â€™" mojibake) — all conversions are now byte-perfect.
- Light mode: "Convert to EPUB" menu item now visible on light themes.
- Android: convert-or-open dialog skipped on Android (Radix portal touch issues); verified with a full APK build, install and launch smoke test on an emulator.
- Converted EPUBs are written to a durable app-data location (survive reboots) and reliably auto-import (fixed a race where the 100% progress event skipped the import).

# Release Notes (v1.62.0)

##  New Features & Improvements
- **Auto-Updates**: Added background automatic update checking on startup!
  - **Desktop**: Automatically checks for updates and prompts you to install via the Tauri updater.
  - **Android**: Automatically checks the latest GitHub release and prompts you to download the newest `.apk`.
- **Text-to-Speech (TTS)**: Added a chapter-wise "Start Reading" button to Epub settings, allowing you to seamlessly start reading from the beginning of the current chapter without needing to highlight text.
- **Manga Reader - Floating Page Number**: Added a non-intrusive, theme-adaptive floating page number at the bottom of the manga reader to help you track your progress.
- **Manga Reader - Mobile UX**: Streamlined the Manga sidebar on Android, moving complex settings to the Advanced Settings panel to keep the interface smooth and lightweight.
- **Epub Reader - Mobile**: Disabled double page view for Android devices.

##  Bug Fixes
- Re-added the missing TTS controls/doodle icon on both Desktop and Android interfaces.
- Fixed the visual glitch and lingering loading spinner when switching from online books to online manga by implementing smooth skeleton loading screens.
