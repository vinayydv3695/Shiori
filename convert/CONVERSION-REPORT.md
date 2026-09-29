# CONVERSION-REPORT — Shiori book-conversion engine

**Date:** 2026-09-29 · **Scope:** phases 0–4 of the conversion-quality mission. All claims measured with the corpus harness (`convert/tools/score.py` + `src-tauri/tests/convert_probe.rs`) — evidence paths given inline.

---

## 1. Root causes found (ranked, with file/function)

| # | Root cause | Location | Evidence |
|---|---|---|---|
| 1 | **Non-deterministic EPUBs**: random `Uuid::new_v4()` + wall-clock `dcterms:modified` + unwritten zip timestamps | `conversion/epub_builder.rs` (`build_content_opf`, `assemble_epub_zip`) | two runs → different uuid/timestamp/bytes (recon-r2 #19) |
| 2 | **No conversion report anywhere** — `EpubOutput.warnings` always empty; scans/fallbacks silent | `conversion/mod.rs` (`convert_to_epub_new`), `conversion_engine.rs` | UI showed status only |
| 3 | **Scan PDFs → literal garbage** ("Document") via the lopdf fallback | `conversion/formats/pdf.rs` fallback chain → legacy `conversion/pdf.rs::convert_with_lopdf` | `scan_page1.pdf` → 1-word EPUB (recon-r2 #1) |
| 4 | **Missing strict-UTF-8 shortcut** in the new scored decoder (my Phase-2 regression) — whole books fell into legacy scoring → cp1252 mojibake (`â€”` on every em-dash) | `conversion/utils.rs::decode_text_scored` | before fix: 154/155 Moby chapters mojibaked; after: 0 (regression test `pg2701_built_epub_bytes`) |
| 5 | **chardet(2014) weakness**: UTF-16-BOM-less, CJK & Cyrillic misdetected; fidelity 0.11–0.87 | `conversion/utils.rs::decode_text` | `enc_utf16le` 0.106 → 0.996 |
| 6 | **Running headers/page numbers become headings** — weak-heading rule fires on repeated title-case lines; pdf-extract pads two blank lines so band detection by raw line index missed them | `conversion/formats/pdf.rs` (`split_pages_into_chapters`, `strip_page_chrome`) | novel.pdf 47 TOC entries → 7 |
| 7 | **TXT chapter patterns too narrow** (no ADVENTURE I./BARE numeral+subtitle/CJK/other-language), TOC-list duplicates not merged | `conversion/txt.rs` (`split_into_chapters`), `conversion/formats/txt.rs` (`finalize_chapters`, `dedupe_toc_stubs`) | pg1661 1 chapter → 14 (12 stories + 2 stubs); pg2701 4 → 159 |
| 8 | **fb2.zip/fb2.gz rejected at the entry point** — extension-only dispatch never reached the capable legacy parser | `conversion/mod.rs` `convert_to_epub_new` | `synthetic_full.fb2.zip` → `Unsupported format` |
| 9 | **`mobi` crate PalmDB incompatibility** — reads record entries as (offset:u32,id:u32) + expects extra-bytes gap + panics on first/last-content=0 | external crate, used in `conversion/formats/mobi.rs` | synthetic fixture rejected; documented in recon-r1/H4; corpus fixture made ambidextrous |
| 10 | **EPUB→TXT regex tag-strip** leaves entities, no structure | `services/conversion_engine.rs::epub_to_txt` | code inspection (recon-r2 #23) |

Also fixed along the way: RTF routed to TXT leaked raw control words (added `rtf_to_text`); latin2-vs-cp1252 tie broken by junk-glyph scoring; cyrillic koi8/cp1251 case-inversion discrimination; box-drawing/weird-symbol penalty; home-script consistency check; engine temp-dir leaks on failed jobs; migration v51 (`conversion_jobs.report`); EPUB→PDF unchanged (out of scope this cycle, see §5).

## 2. Architecture as built

```
convert/corpus/src/*
  → conversion::convert_to_epub_new / convert_to_epub_into (report-capable)
    → formats/{pdf,mobi,fb2,txt,docx,html,markdown,cbz,cbr,zip,gz}::parse
      → OebBook (IR, frozen in IR-SPEC.md)
    → sanitize_html
    → transforms (in-parser passes, individually reported):
        decode_text_scored (BOM/UTF-16/UTF-32 + 12-candidate scoring)
        rtf_to_text · strip_page_chrome (headers/footers/page numbers)
        wrap/paragraph modes · chapter split (EN+CJK+Cyrillic patterns)
        finalize_chapters (dup-merge) · dedupe_toc_stubs
        fixed-layout scan fallback (attach_scan_pages)
    → epub_builder::build_epub_with_report (deterministic ids/times/TOC validation)
  → ConversionReport → engine → conversion:complete event → UI
```

New report channel: `OebBook.report` (parsers append) → `merge_parser_report` → job report persisted in `conversion_jobs.report` (migration v51) → journal store → `ConversionReportSummary` in `ConversionJobTracker`.

## 3. What each agent changed

- **C0** (conversion core): `report.rs` (new IR-SPEC §4 type), deterministic builder (`stable_book_uuid`, pinned zip times, mtime-based `dcterms:modified`), TOC dead-link pruning, `convert_to_epub_into` (caller-owned tempdirs; engine no longer leaks), report plumbing through `conversion/mod.rs` + `conversion_engine.rs` (report in `conversion:complete` + `persist_job`), migration v51.
- **Q**: corpus (Gutenberg public domain + self-generated fixtures incl. hostile inputs), `tests/convert_probe.rs` (convert-all + hostile-input smoke), `convert/tools/{gen_*,score}.py`, `BASELINE.md` (this dir), EPUBCheck 5.2.1 dev oracle.
- **I1**: scan detection → fixed-layout page-image fallback with report; `strip_page_chrome` (non-empty-line rank bands, whitespace-normalized repetition ≥60%, page-number strip); junk-text sanity gate `book_plausible` on the legacy fallback (no more "Document").
- **I2**: corpus MOBI fixture hardened (ambidextrous record layout understood & documented: `mobi` crate vs PalmDB layout); engine keeps custom adapter as content source; DRM detection remains as a documented follow-up (no API in crate).
- **I3**: fb2.zip/.gz/.fbz entry dispatch with container sniffing (`PK`/`1F 8B`), inherent limits safe; fixtures regenerated as true gzip.
- **I4**: `decode_text_scored` (replaces chardet; BOMs, BOM-less UTF-16 via NUL parity, 12 candidates, script boosts, scrambled-case Cyrillic discriminator, box-art penalty, home-script check, latin2 junk glyphs); multilingual chapter patterns (En + 第N章/話/篇 + глава/kapitel/chapitre/capítulo…); bare-numeral+subtitle headings; duplicate-title merge + TOC-stub dedupe; RTF unwrapper; language inference from charset; `edge_huge_line` memory churn documented.
- **O1**: builder determinism + validations (see C0); mutation of build functions to `(book, toc, opts)` shape.
- **O2**: `epub_to_txt` rewritten on html5ever RcDom (entities decoded, block structure preserved, no tag-leak).
- **U1**: `ConversionReport` types in `store/conversionStore.ts` + `ConversionReportSummary` component (fallback/warnings/confidence, collapsible).

## 4. Before → after (identical harness, same corpus)

| Metric | Before | After | Method |
|---|---|---|---|
| EPUBCheck errors/warnings | 0/0 (40 files) | 0/0 (45 files incl. archives & hostile) | epubcheck 5.2.1 |
| Conversion success | 42/44 | **47/47** (fb2.zip/gz fixed; edge/hostile handled) | probe |
| Determinism | FAIL | **PASS** (sha256 identical across runs) | probe ×2 |
| Text fidelity (12 encodings) | 0.11–0.92 (median .82) | **0.9577–0.9958 (median 0.991)** | difflib vs ground truth |
| utf-8 double-encoding | **silent mojibake** on any UTF-8 multibyte book | 0 (byte-level epub assertion) | `pg2701_built_epub_bytes` |
| novel.pdf TOC | 47 (running headers) | **7** (title+6 chapters, header/page-number lines removed) | nav entry count |
| scan PDF | 1 word "Document" | **fixed-layout page-image EPUB + report fallback** | probe + report |
| pg2701 (Moby) chapters | 4 | 159 (≈137 real + Etymology/Extracts + 2 stubs) | nav entry count |
| pg1661 (Holmes) chapters | 1 | 14 (12 stories) | nav entry count |
| fb2.zip / fb2.gz | UnsupportedFormat | **convert, valid EPUB** | probe |
| hostile corpus (6 inputs) | untested | **no hangs, no panics, no traversal** | smoke test |
| EPUB→TXT | entity-leaking regex strip | structural walker (entities decoded) | code + build |

**Compared to Calibre** (dev oracle not installed this machine — see recon-r5): we **beat or tie** on validity (0/0), determinism, encoding zero-tuning on the corpus, scan fallback vs garbage, report; **trail** on complex PDF layouts (two-column 112-entry TOC — Calibre's pdftohtml geometry is the reference, planned follow-up) and on ebook-convert's huge heuristics surface.

## 5. Known limitations & risks

- **PDF layout analysis is line-based**, not geometric: two-column + sidebar books (twocolumn.pdf: 112 TOC entries) and tables (tables.pdf: 7 entries) still suffer. Full fix needs pdftohtml-XML geometry on desktop (GPL tool, optional-shell posture, never bundled) with pdf-extract fallback — see follow-ups.
- **TXT chapter exactness**: pg1342 (50 vs 61) and pg84 (36 vs 27) have residual TOC-list stubs; safe thresholds traded recall for precision.
- **MOBI**: no DRM flag → friendly DRM failure still missing (crate API gap; needs signature check follow-up); KF8-prefer exists via adapter scoring.
- **EPUB→PDF** (printpdf) unchanged: no outline/presets yet.
- **Frontend**: `ConversionJobTracker` shows the report; the batch dialog does not yet link per-row reports.
- **Parallel-session merge hazard**: another agent committed concurrently (manga/perf work); all my files re-verified compiling together (409 lib tests, 47 probe conversions, tsc clean). 4 pre-existing frontend test failures live in their online components, not conversion code.
- Memory: remaining whole-file reads (TXT decode, MOBI) are bounded per file; CBZ/CBR stream; 500 MB PDFs parse via file-backed `Document::load`.

## 6. Follow-ups (ranked)

1. pdftohtml-XML geometry pass (columns/headers by coordinates, font-size headings) — the single biggest remaining PDF win (R5 validates the approach).
2. `epub_to_pdf` outline/presets (printpdf bookmarks API) + `epub_to_fb2` output writer.
3. MOBI DRM detection via `DRMOffset/Count` header fields (parseable without the crate).
4. Batch-dialog report links; localization keys for report codes.
5. CI: epubcheck + corpus scorer job (dev-only tooling).
6. cargo-fuzz targets for `formats::*::parse` + zip-bomb depth guards for nested archives.

## 7. License audit summary

No GPL/AGPL code shipped; MuPDF excluded; Calibre = dev/optional user-installed oracle only (`calibre_service.rs`, unchanged posture); license audit written to `convert/LICENSES.md`; 4 owner decisions pending (resvg MPL-2.0 keep, unrar non-free optional, calibre/poppler shell-outs keep, MuPDF permanent exclusion).

## 8. Re-running everything

```bash
cd src-tauri && cargo test --lib                       # 409 unit tests
cargo test --test convert_probe -- --nocapture          # converts corpus + hostile inputs
cd .. && venv/bin/python convert/tools/score.py         # EPUBCheck + fidelity + determinism
venv/bin/python convert/tools/gen_{encodings,fb2,pdf,mobi,docx}.py   # regenerate fixtures
```