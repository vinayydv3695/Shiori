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
