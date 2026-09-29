# R4 — Reader Compatibility Requirements

**Agent:** R4 (recon) · **Date:** 2026-09-28 · **Scope:** what the EPUB reader actually consumes, so the converter's output never makes it choke.

## How books get read today

- Kindle-style EPUB reading: **epub.js in a WebView** (`src/components/reader/` — `ReaderLayout.tsx`, epubjs `book.js`); the file is served via Tauri asset protocol from the conversion temp dir (`services/reader_service.rs::resolve_book_open_path`, commands/conversion.rs `open_book_for_reading`).
- PDF books: **react-pdf** (`src/components/reader/PdfReader.tsx`) — only for original PDFs, not converted ones.
- Manga/comics: virtualized image viewer over extracted pages.
- Formats that aren't EPUB: converted **to EPUB on open** (`convert_book_to_epub`, reader_service.rs:1636) — so the EPUB writer is the single gate to the reader.

## Hard requirements (what the reader needs from the writer)

1. **Valid EPUB 3 ZIP**: `mimetype` first + STORED; container.xml; content.opf; NCX **or** nav — `epub_builder` produces both ✓ (EPUBCheck 0/0 on corpus ✓).
2. **Stable chapter XHTML filenames & ids** — epubjs builds CFI paths from spine item hrefs; `chapter_001.xhtml` scheme is stable ✓. Do **not** rename chapters in a way that changes CFIs between conversions of the same book — determinism also protects reader progress (see C1: uuid/timestamp churn is the current violation; chapter ids are fine).
3. **No scripts, iframes, forms, external URLs**: epubjs executes XHTML as-is in the WebView; script/style blocks must be stripped (oeb.rs sanitize does this ✓) and `common.rs::serialize_node` drops dangerous elements ✓. **Keep it that way for every future writer**.
4. **Images referenced relative to the chapter file** (`../Images/img_001.jpg`) — epubjs resolves relative hrefs ✓; every `<img>` must have a manifest item (epub_builder writes all `book.images` ✓).
5. **Cover**: `cover.xhtml` in spine + `meta name="cover"` (present ✓). Cover image should be ≤ ~2 MB and JPEG/PNG for mobile memory.
6. **Language**: `xml:lang`/`lang` on `<html>` + `dc:language` — present ✓; RTL books need `dir="rtl"` on the html element (currently always LTR — fix in O1 pass for RTL languages).
7. **Fonts**: the reader uses the app's own CSS + font-family stacks; embedded fonts are **not** currently expected by the reader UI — O1 font embedding is safe but must not interfere with the default stylesheet (keep `font-family` fallbacks).
8. **TOC**: epubjs uses the nav document when available (spine fallback otherwise). Every TOC `href` target must exist as an anchor or file — the current TOC hrefs (`chapter_001#anchor`) pass EPUBCheck, but the PDF heading flood (47 phantom chapters from running headers, R2 #2) makes the TOC useless in the reader.
9. **Size**: epubjs parses each chapter XHTML fully; a single 500 KB chapter slows pagination (R2 #20 — chapter splitting in O1).
10. **CSS**: `.epub` current default stylesheet is fine for epubjs (serif, text-indent paragraphs). Comic mode stylesheet exists for CBZ (✓). Avoid CSS that epubjs mishandles: no `position:fixed`, no `@page` dependence for layout, `max-height:100vh` OK in WebView.
11. **Fixed-layout EPUBs (future fallback)**: reader must still paginate — fixed-layout output should degrade to normal reflowable EPUBs with full-page `<div class="page">` + `<img>` (the comic path already does exactly this and renders in the manga/comic viewer and epubjs). So the "fixed-layout fallback" for scans = comic-style page-image EPUB, which the reader already renders ✓.
12. **`dcterms:modified`**: read by some readers for updates; must exist (present ✓) — but must be stable per source file (fix in C1/C0).
13. **DRM'd source**: reader should never receive a garbage book — reader_service must surface the conversion error to the UI (currently generic).

## Caveats observed

- The reader path converts PDFs via the same engine, so the scan-PDF "Document" garbage bug (R2 #1) lands **directly in the reader** — users open a "book" containing one word. This is the top reader-facing defect.
- epubjs is tolerant of sloppy XHTML but NOT of wrong media types in the manifest.
- The app's reading progress is keyed to CFI + chapter index — chapter count changes between conversions reset progress (acceptable for re-conversion, but determinism keeps it stable for identical inputs).