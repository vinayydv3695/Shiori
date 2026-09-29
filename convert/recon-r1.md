# R1 — Current Pipeline Audit

**Agent:** R1 (recon, read-only) · **Date:** 2026-09-28 · **Scope:** how conversion works today and why it fails.

## Architecture as built

```
Library book file
  → format_detection::detect_format (services/format_detector.rs)
  → ConversionEngine (services/conversion_engine.rs)   [queue, 4 workers, SQLite jobs]
     → per-target pipeline:
       source → EPUB: conversion::convert_to_epub_new (conversion/mod.rs)
                     → optional Calibre (services/calibre_service.rs) if installed+enabled
                     → native: conversion/formats/<fmt>::parse → oeb::OebBook
                               → epub_builder::build_epub (conversion/epub_builder.rs)
       EPUB → target (pdf/txt): conversion_engine::epub_to_pdf / epub_to_txt (printpdf / regex strip)
  → result emitted as Tauri events conversion:progress/complete/error
  → src/store/conversionStore.ts + src/components/conversion/* dialogs
```

Two entry points exist:
1. `convert_file` (commands/conversion.rs) — user-initiated target conversion via `ConversionEngine::convert_direct` (line ~1327) which stages through a temp EPUB.
2. `convert_book_to_epub` / `open_book_for_reading` (services/reader_service.rs:1636, commands/conversion.rs:465) — read path converts to EPUB on demand, also silently via Calibre first (conversion/mod.rs:213).

## Findings (ranked)

### Critical

- **C1. Non-deterministic output.** `epub_builder.rs` `build_content_opf` uses `Uuid::new_v4()` for `dc:identifier` and `chrono::Utc::now()` for `dcterms:modified` (epub_builder.rs ~line 190). Two conversions of the same input produce different bytes (verified: uuid `1fb5eade…` vs `c48abbf9…`, timestamp 11:19:29Z vs 11:19:42Z). Breaks caching, dedupe, and byte-identical re-output (mission rule 9).
- **C2. No conversion report exists anywhere.** `EpubOutput` carries only `warnings: Vec<String>` which is always `vec![]` (conversion/mod.rs:114). PDF scan fallbacks, encoding guesses, heuristics applied — all silent. The UI (BatchConvertDialog, ConversionJobTracker) shows status/error only. Mission requires a structured report per conversion (fixed-layout fallback notice, DRM detection, confidence).
- **C3. EPUB→TXT is a regex tag-strip** (`conversion_engine.rs` `epub_to_txt`, ~line 862): `html.replace("<br>","\n")…` + `/<[^>]*>/` — leaves HTML entities (`&amp;`, `&#8212;`) as literal text, no heading/chapter structure, no TOC, strips whitespace of `<pre>`, concatenates entire book into one block. Any (mis)use of `&lt;` in prose is destroyed.
- **C4. Silent garbage on scan PDFs.** A textless (image-only) PDF converts "successfully" to an EPUB whose only text is the literal word `Document` (verified: `convert/out/pdf/scan_page1.epub` chapter_001 = `"Document"` + page image). No fixed-layout fallback, no report, no warning. This is exactly the "never silent garbage" violation. Root path: legacy `conversion/pdf.rs` `convert_with_lopdf` (lopdf basic extraction returns junk page text; `EmptyContent` never raised because lopdf yields a token, or pdf-extract returns a stray word).

### High

- **H1. Running headers/footers pollute TOC and chapters.** `formats/pdf.rs` `split_pages_into_chapters` (line ~210) + `pdf.rs` legacy: a repeated short title-case line (e.g. "The Test Novel — A Conversion Fixture") on every page is a "weak heading" → 47 chapters/47 TOC entries from a 6-chapter book (verified: `convert/out/pdf/novel.epub`). Page-number footers pollute body text. No position-based header/footer stripping exists anywhere.
- **H2. TXT chapter detection too narrow.** pg1661.txt (Sherlock Holmes) yields **1 chapter** — "ADVENTURE I. A SCANDAL IN BOHEMIA" headings not matched (verified). pg2701 (Moby Dick, 135 chapters) yields 4. pg1342 yields 50/61. Only pg84 (26) is near-correct.
- **H3. Encoding detection is weak.** `conversion/utils.rs` `decode_text` relies on `chardet 0.2` (last release 2014). Measured fidelity (character-level vs ground truth): UTF-16LE 0.11, UTF-16BE 0.11, Big5 0.75, GBK 0.76, Shift-JIS 0.75, EUC-KR 0.82, cp1251 0.86, KOI8-R 0.87, ISO-8859-2 0.58. Note UTF-16 *should* be caught by BOM check — it isn't, and there is no UTF-16-without-BOM path.
- **H4. Mobi input lacks a synthetic/ro** real-format guarantee: the `mobi 0.6` crate (used at `formats/mobi.rs` for EXTH metadata) reads PalmDB record entries as (offset:u32, id:u32) — NOT the PalmDB layout (id:u32, attr:u8, offset:u24) — and depends on `extra_bytes` positioning; it also panics on `first_content=(1),last=(0)` files (observed while building a fixture). Any real-world file that trips the crate's assumptions fails `Mobi::from_read` and the whole conversion aborts (observed: synthetic file → "invalid header identifier").
- **H5. fb2.zip / .fbz / .gz inputs unsupported at the conversion entry point.** `convert_to_epub_new` dispatches by extension only (conversion/mod.rs:268): `.zip`/`.gz` → `UnsupportedFormat`. The legacy `conversion/fb2.rs` *can* decompress, but it's unreachable for these extensions. (`.fbz` is routed.)

### Medium

- **M1. Two-column PDFs → reading order & TOC junk.** `twocolumn.pdf` → 112 TOC entries (every "Issue N" band + repeated "SIDEBAR"), body splices sidebar between columns (verified `convert/out/pdf/twocolumn.epub`).
- **M2. Table detection absent.** `tables.pdf` → 7 TOC entries ("Quarterly Results" + "Q1".."Total" cells as headings), table cells as bare paragraphs. No `<table>` reconstruction in either PDF path.
- **M3. EPUB→PDF has no bookmarks/pagination options** — `epub_to_pdf` (conversion_engine.rs:1214) via printpdf draws flowing text; no PDF outline, no page numbers, no margins/presets, no hyphenation, no CJK font embedding strategy.
- **M4. `dcterms:modified`, UUID and ZIP timestamps** make output non-reproducible (see C1); also `zip` crate default writes current timestamp into entries.
- **M5. No DRM detection.** `mobi 0.6` has no DRM flag API exposed; `adapters/mobi.rs` comments "DRM detection not available". A DRM'd file currently produces garbage text or a generic decode error — never a friendly, explicit message.
- **M6. Progress/cancel are loosely wired.** `convert_to_epub_new` ignores `_progress_cb` entirely (`conversion/mod.rs` — progress param is `None`-able but the function body only calls `report()`), so big-file conversion shows a spinner with no %; cancel is only honored between stages (`check_cancel()` in the engine, not inside parsers). 500 MB PDFs parse wholly into RAM (pdf-extract pages Vec<String>, lopdf Document) with no streaming.

### Low

- **L1. `sanitize_html` (oeb.rs) does no tag-balancing** — malformed HTML from MOBI/TXT can emit unclosed tags; EPUBCheck stays silent (0/0) but readers may mis-render.
- **L2. Conversion engine emits `conversion:progress` only per stage** — no byte-level progress in native path.
- **L3. `.rtf` routed to TXT parser** (`conversion/mod.rs` SourceFormat::from_extension + parse_oeb) with no RTF handling at all (observed: `edge_rtf.txt` "converts" to EPUB containing raw RTF markup text).
- **L4. TXT huge-line fixture `edge_huge_line.txt`** (~12 MB single line) converts but holds multiple full copies of the text in RAM during paragraph joining (String churn); memory not bounded for the stated 500 MB goal.

## What works today

- EPUBCheck 5.2.1: **0 errors / 0 warnings** on every corpus EPUB produced by `epub_builder` (40/40 files). mimetype-first, STORED, container.xml, NCX+nav, cover page, streaming image write (CBZ/CBR path) are all correct.
- MOBI/AZW3, DOCX, FB2, CBZ/CBR, HTML, Markdown all convert end-to-end without crashing on the corpus (17/18 formats OK including the synthetic MOBI after fixture fix).
- Conversion queue, persistence, soft-cancel, event streaming, and capability matrix are solid (tests pass: 47 conversion tests).
- Memory-bounded streaming exists for CBZ/CBR images (`ImageSource::ZipEntry/Path`).