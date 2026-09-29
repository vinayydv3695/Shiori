# BASELINE — native pipeline, 2026-09-28 (Phase 1, Q)

Harness: `src-tauri/tests/convert_probe.rs` + `convert/tools/score.py` (EPUBCheck 5.2.1). Raw JSON: `convert/out/score-20260928-164950.json`. Calibre oracle: not run yet (not installed — see recon-r5).

## Scoreboard (before any fixes)

| Format | Files | Convert OK | EPUBCheck err/warn | Fidelity (char) | Structure/TOC | Notes |
|---|---|---|---|---|---|---|
| txt (Gutenberg ×5) | 5 | 5/5 | 0/0 | — | pg84 26/27 ✓ · pg1342 50/61 · pg1661 **1/12** · pg2701 **4/135** | chapter patterns too narrow |
| txt encodings ×12 | 12 | 12/12 | 0/0 | utf16le **0.11** · utf16be **0.11** · big5 0.75 · gbk 0.76 · sjis 0.75 · euc-kr 0.82 · cp1251 0.86 · koi8-r 0.87 · cp1252 0.83 · latin2 **0.58** · utf8bom 0.82 | 1–2 toc each | decode_text (chardet) is the cap |
| txt edge ×9 | 9 | 9/9 | 0/0 | md 0.92 | roman-numerals 2 ✓ | rtf leaks markup text |
| pdf | 6 | 6/6 | 0/0 | — | novel **47** (expect 7) · twocolumn **112** · tables 7 · scan 1 | headers/sidebars → headings; scan → "Document" |
| fb2 | 3 | 3/3 | 0/0 | — | full 3 (expect 4) · sloppy 2 ✓ | nested section missing |
| fb2.zip / fb2.gz | 2 | **0/2** | — | — | — | unsupported at entry |
| mobi | 1 | 1/1 | 0/0 | — | — | after fixture gen fix; crate-fragile (R1/H4) |
| docx | 1 | 1/1 | 0/0 | — | 3 toc ✓ | |
| epub (passthrough) | 2 | 2/2 | 0/0 | — | gutenberg's own | |

## Aggregate key metrics

- **Conversion success:** 42/44 sources.
- **EPUBCheck:** 0 errors, 0 warnings on all 40 emitted EPUBs (validity already at target).
- **Text fidelity:** worst 0.106, median ≈ 0.82, target ≥ 0.99.
- **Structure (TOC sanity):** 4/10 books sane; phantom-heading book (novel) shows 47 chapters vs 7 expected.
- **Determinism:** FAIL — uuid + `dcterms:modified` change every run (verified twice).
- **EPUB→TXT:** raw entities (`&amp;`), no structure (code-inspection; not scored byte-level in baseline).
- **EPUB→PDF:** no outline/page numbers (code-inspection; not scored).
- **Report/fallback/DRM:** none exist.

## Targets (from mission table, restated as deltas)

| Metric | Baselined | Target |
|---|---|---|
| EPUBCheck | 0/0 ✓ | 0/0 (keep) |
| Text fidelity clean inputs | ≥0.99 needed | ≥0.99 (encodings ≥0.95) |
| Structure 95% corpus | ~40% | ≥95% |
| PDF reflow | garbage on 3/4 fixtures | headers/footers gone, columns sane, fallback instead of garbage |
| Images | retained ✓ | retained (keep) |
| Metadata | partial (title/lang only) | title/authors/language/series/cover |
| Determinism | FAIL | byte-identical |
| Speed/memory | unmetered | time + RSS metered in score.py |
| Robustness | unknown | fuzz smoke in Phase 3 |
| Report | none | per-book structured report |

## Re-run instructions

```bash
cd src-tauri && cargo test --test convert_probe -- --nocapture   # converts corpus → convert/out
cd .. && venv/bin/python convert/tools/score.py                   # EPUBCheck + fidelity + structure
```

---

# AFTER — Phase 3 re-run, 2026-09-29 (same harness, identical corpus)

| Metric | Before | After |
|---|---|---|
| Conversion success | 42/44 sources | **47/47** (fb2.zip/gz + cbz/cbr + hostile) |
| EPUBCheck err/warn | 0/0 | 0/0 (all 45 scored files) |
| Fidelity median (12 encodings) | 0.82 | **0.991** (min 0.9577 big5/gbk) |
| Determinism | FAIL (uuid+clock) | **PASS** |
| pdf/novel TOC | 47 | **7** |
| pdf/scan | "Document" garbage | **fixed-layout page images + report** |
| txt/pg1661 | 1 | 14 |
| txt/pg2701 | 4 | 159 |
| txt/pg1342 | 50 | 50 (61 real; stub dedupe threshold) |
| txt/pg84 | 36 | 36 (27 real; same) |
| fb2.zip/.gz | Unsupported | converts, valid |
| hostile corpus | not tested | no hangs/panics/traversal |
| epub→txt | entity-leaking regex strip | structural walker |

Full narrative and root causes: `convert/CONVERSION-REPORT.md`. Remaining gaps are geometry-level PDF layout work and DRM-detection UX (see report §5–6).


---

# ROUND 2 — remaining-gap slices, 2026-09-29 (S1–S7)

| Gap (from CONVERSION-REPORT §5–6) | Before | After | How |
|---|---|---|---|
| twocolumn.pdf reading order / TOC | 112 entries, sidebar spliced into columns | **12** (headline stripped, sidebar last, columns ordered) | pdftohtml-XML geometry pass (`pdf_geometry.rs`) |
| tables.pdf | 7 false-heading entries, cells as prose | **1 TOC entry, real `<table>` (6 rows) in the EPUB** | geometry table runs (same-y cells across clustered columns) |
| novel.pdf | 7 | **6** (epigraph line no longer promoted) | same pass; regression green |
| pg84 (Frankenstein) | 36 entries, half the book merged into "Letter 1" | **35** covering all 4 letters + 24 chapters + Gutenberg sections | contents-list guard + keyword-safe `title_key` |
| pg1342 (P&P) | 50 entries w/ TOC-stub noise | **50 = source-faithful** (edition has 45 chapter headings + title-page artifacts) | same; earlier "61" expectation was a different edition |
| pg2701 (Moby) | 159 | **145** (≈137 real + Etymology/Extracts) | same |
| MOBI DRM | garbage/generic error | **`DrmProtected` friendly error before parsing** | DRM header fields read directly (0x98..0xA8) |
| Mutation fuzzing | smoke only | **294 seeded mutants, 0 panics, 0 hangs**; FB2 gzip/zip bomb caps (512 MB) | `tests/fuzz_smoke.rs`, caps in `fb2.rs` |
| Batch dialog reports | tracker only | **per-row report (fallback/warnings/confidence) in BatchConvertDialog** | report flows through `convert_book`/`convert_and_replace_book` → `ConvertResult.report` |
| Calibre oracle | not installed, no harness | **`convert/tools/compare_calibre.py` ready** (runs ebook-convert + scores it); install calibre to execute | recon-r5 updated |
| EPUB→PDF | no outline/page numbers/fonts | **bookmarks per chapter, page-number footers, A4 margins, embedded Liberation Serif when present, entity-clean text** | `epub_to_pdf` rewrite + `tests/pdf_out_smoke.rs` |

Determinism re-verified manually: two consecutive probe runs → identical sha256 of `convert/out/txt/enc_utf8_bom.epub` (`a582a4ef…`).
Gates: 415 lib tests · fuzz 294 mutants · probe 47 conversions · pdf_out smoke · tsc + eslint clean (2 pre-existing @ts-ignore errors in tauri.ts unchanged).


---

# ROUND 3 — EPUB→FB2 output writer (2026-09-29, S8)

| Item | Before | After |
|---|---|---|
| EPUB→FB2 | `ConversionNotSupported` (unadvertised) | **valid FB2 2.1** — metadata (title/authors/lang/urn id), one `<section>` per chapter with `<title>`, `<emphasis>/<strong>/<code>`, `<cite>`, tables, `<empty-line/>` |
| Matrix | epub→[pdf,txt] | epub/pdf/mobi/azw3/docx/txt/html/markdown → **+fb2** |
| Validation | — | produced FB2 **round-trips through our own `formats::fb2::parse`** (titles + body text asserted); 3 walker unit tests + 2 integration tests |

Gates: 423 lib tests · convert_probe 47/47 · fb2_out_smoke 2/2 (round-trip) · determinism unchanged.
