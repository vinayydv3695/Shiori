# R2 — Defect Catalog (first corpus run)

**Agent:** R2 (recon, read-only) · **Date:** 2026-09-28 · **Method:** built `convert/corpus/` (public-domain Gutenberg + self-generated fixtures), converted every file with the **current** pipeline via `src-tauri/tests/convert_probe.rs`, scored with `convert/tools/score.py` (EPUBCheck 5.2.1, structure, character-level fidelity). Calibre was NOT used for this baseline (not installed on this dev box) — native path only.

## Corpus (36 sources → 44 EPUBs)

| Group | Files | Notes |
|---|---|---|
| txt | pg11, pg84, pg1342, pg1661, pg2701 (Gutenberg, public domain) | ASCII + UTF-8, varied chapter styles |
| txt synthetic | 12 encodings (UTF-16LE/BE, BOM, cp1251/1252, koi8-r, iso8859-1/2, shift_jis, gbk, big5, euc-kr) | ground-truth strings |
| txt edge | empty, CRLF, tabs, no-final-newline, BOM-only, RTF, control chars, 12 MB single line, markdown-ish, roman numerals | synthetic |
| epub | pg11, pg84 (Gutenberg epub3.images) | real-world EPUBs |
| pdf | novel (6 ch, running headers + page numbers), twocolumn (60 pp, 2 cols + sidebar), scan (3 pp image-only), tables | generated with fpdf2/PIL |
| fb2 | synthetic_full (+ .zip, .gz variants), sloppy_cp1251, two_bodies | generated |
| mobi | synthetic (PalmDOC/MOBI6, EXTH, uncompressed text) | generated |
| docx | synthetic (OPC-direct) | generated |

## Summary table (native pipeline, measured)

| Metric | Value |
|---|---|
| Conversion success | 42/44 (2 fail: fb2.zip, fb2.gz — unsupported at entry) |
| EPUBCheck errors | **0** on all 40 produced EPUBs |
| EPUBCheck warnings | **0** on all 40 |
| Text fidelity (chars, synthetic) | worst 0.11 (UTF-16LE/BE), median ~0.82, best 0.92 |
| TOC-structure sanity | 4/10 books sane; worst: pdf/novel 47 entries (expected 7), pdf/twocolumn 112 |
| Determinism | **FAIL** — uuid + dcterms:modified change every run |

## Defects by format (ranked; each with file/function + sample)

### PDF input (worst offender)
1. **CRITICAL — scan pages produce silent garbage.** `pdf/scan_page1..3.pdf` (image-only, no text layer) → "successful" EPUB whose only text is `Document` (chapter_001 == "Document"). Root: `conversion/formats/pdf.rs` pdf-extract fails silently-ish, legacy `conversion/pdf.rs` `convert_with_lopdf` yields junk. Sample: `convert/corpus/src/pdf/scan_page1.pdf`.
2. **CRITICAL — running headers flood the TOC.** `pdf/novel.pdf` → 47 chapters, TOC entries are the running head "The Test Novel — A Conversion Fixture" repeated per page + "Chapter N". Root: `formats/pdf.rs::split_pages_into_chapters`, weak-heading rule (title-case short line + blank line) matches the header; no cross-page repetition dedupe, no position (top/bottom band) filtering. Sample: `convert/out/pdf/novel.epub`.
3. **HIGH — two-column/sidebar reading-order corruption.** `pdf/twocolumn.pdf` → 112 TOC entries; body splices sidebar text between columns; per-issue band line duplicated as heading. Root: linear text extraction (pdf-extract/pdftotext) with no layout analysis. Sample: `convert/out/pdf/twocolumn.epub`.
4. **HIGH — page-number footers leak into text** (novel.pdf ends each page with "41", "42"… inside paragraphs); no page-footer stripping anywhere. Same files as #2.
5. **MEDIUM — tables flattened.** `pdf/tables.pdf` → cells as separate paragraphs; "Q1"…"Total" became TOC headings (7 entries). Root: no table detection in either PDF path. Sample: `convert/out/pdf/tables.epub`.
6. **MEDIUM — no fixed-layout fallback ever** (no detection of scan/comic pages; `EmptyContent` is a hard error, not a fallback trigger). `formats/pdf.rs` line ~55.
7. **LOW — de-hyphenation absent** in the pdf-extract path (`formats/pdf.rs`); only the legacy pdftohtml path has a line-unwrap heuristic.
8. **LOW — heading detection text-only** (no font size/weight from PDF layout); "DEDICATION" style pages can be missed or mis-read.

### TXT input
9. **CRITICAL — legacy/CJK encodings mis-decoded.** Fidelity vs ground truth: UTF-16LE 0.106, UTF-16BE 0.107, Big5 0.753, GBK 0.763, Shift-JIS 0.750, EUC-KR 0.824, cp1251 0.862, KOI8-R 0.866, cp1252 0.826, ISO-8859-2 0.578, UTF-8-BOM 0.823. Root: `conversion/utils.rs::decode_text` — chardet(2014) + windows-1252 fallback; UTF-16 path only works with BOM **and** falls through because `from_utf8` on UTF-16 bytes fails fast then BOM check order… (empirically failing). Samples: `convert/corpus/src/txt/enc_*.txt`.
10. **HIGH — chapter patterns too narrow.** pg1661 → 1 chapter ("ADVENTURE I. …" unmatched); pg2701 → 4/135; pg1342 → 50/61. Root: `conversion/formats/txt.rs` (heading regex set) + `services/epub_builder.rs::split_text_into_chapters`. Samples in `convert/corpus/src/txt`.
11. **LOW — RTF routed to TXT parser**: `edge_rtf.txt` output contains raw `{\rtf1\ansi…}` markup as visible text. `conversion/mod.rs` maps `.rtf`→Txt.
12. **LOW — unformatted mode marginal** on the 12 MB single-line fixture (works, but memory churn — see R1/L4).

### MOBI/AZW3 input
13. **MEDIUM — `mobi` crate incompatibility kills whole conversion.** `formats/mobi.rs` calls `mobi::Mobi::from_read` for metadata; the crate reads PalmDB record entries as (offset:u32,id:u32) and expects an `extra_bytes` u16 before record 0 — matches only its own writer, not the PalmDB layout; also panics on first/last-content-record=0 files. One malformed-but-readable MOBI → whole conversion error ("invalid header identifier"). Root: `formats/mobi.rs::build_oeb` lines ~50-70 (no `catch_unwind`, no fallback to the custom parser `services/mobi_adapter.rs` which already won the scoring for real books).
14. **MEDIUM — no DRM detection** (see R1/M5): DRM'd file → generic error/garbage.
15. **LOW — KF8 combo handling:** no explicit prefer-KF8 branch observed in `formats/mobi.rs`; content comes from the adapter (which does score KF8 vs MOBI), but TOC/NCX record usage is minimal.

### FB2 input
16. **MEDIUM — fb2.zip / fb2.gz rejected at the entry point** (`convert_to_epub_new` extension dispatch, `conversion/mod.rs`), even though the legacy parser (`conversion/fb2.rs`) supports both decompressions. Verified: `synthetic_full.fb2.zip` → `Unsupported format: .zip`.
17. **MEDIUM — nested sections flatten to flat TOC** in `synthetic_full.fb2` (TOC=3; expected 4 incl. the nested "A Sub-Section" and notes link). `conversion/fb2.rs` section walker keeps `body` sections only at depth 1 (verify during I3 pass).
18. **LOW — notes body (`body name="notes"`) not linked** as footnote anchors in output (superscript link target check needed); sloppy cp1251 file converted with correct `ru` language ✓.

### EPUB output (writer)
19. **CRITICAL — non-deterministic** (uuid + clock) — see R1/C1.
20. **MEDIUM — chapter splitting absent for big books** (a 500 KB single XHTML chapter is emitted as-is; epubjs parses it, but large chapters degrade readers).
21. **LOW — missing accessibility metadata** (no `schema.org` roles, no `dc:description` fallback, no `epub:type` on landmarks beyond cover; nav + NCX present ✓).
22. **LOW — default CSS is fixed** (Georgia/serif), custom stylesheet override exists but never surfaced in UI.

### Other outputs
23. **HIGH — EPUB→TXT destroys text** (entities raw, no structure) — R1/C3.
24. **MEDIUM — EPUB→PDF lacks outline/page numbers/margins/hyphenation** — R1/M3.
25. **MEDIUM — EPUB→FB2 / →MOBI / →DOCX advertised-but-unsupported** were already removed from the capability matrix (verified: `CONVERSION_MATRIX` — only epub→pdf/txt, and azw3/mobi→epub/pdf/txt remain); good, but mission targets AZW3/FB2 output for later passes.

### Validity, robustness, security
26. **GOOD — EPUBCheck clean** across the board; zip-bomb/path-traversal guards exist in CBZ/CBR (`formats/cbz.rs` entry size caps; `embed_local_image` extension+size gate in `formats/common.rs`).
27. **LOW — fuzzing absent** (no cargo-fuzz targets; only a handful of corrupt-input unit tests). See Phase 3.
28. **LOW — no memory bounds on TXT/PDF/EPUB parse** (whole-file Vec reads; 500 MB target unmet).

## Priority (drives Phase 1–2)

1. Deterministic writer + report plumbing (C0/O1)
2. Encoding detection overhaul (I4)
3. PDF header/footer/scan/heading fixes + fixed-layout fallback (I1)
4. TXT chapter pattern expansion (I4)
5. fb2.zip/gz + nested sections (I3)
6. EPUB→TXT rewrite (O2)
7. MOBI crate isolation/fix (I2)
8. EPUB→PDF outline/presets (O2)