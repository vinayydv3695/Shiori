# RECON SUMMARY (Orchestrator merge of R1–R5)

**Date:** 2026-09-28 · Merges `recon-r1..r5.md`. Freezes architecture, libraries, priorities, and agent assignments for Phases 1–3.

## Ranked defect list (top 12, drives all implementation)

| # | Defect | Evidence | Owner |
|---|---|---|---|
| 1 | Non-deterministic EPUB (uuid + clock) | R1/C1, R2 #19 | C0/O1 |
| 2 | No conversion report; PDF scan fallback silent | R1/C2 | C0/U1 |
| 3 | Scan PDF → "Document" garbage EPUB | R2 #1 | I1 |
| 4 | Encoding detection weak (fidelity 0.11–0.87) | R2 #9 | I4 |
| 5 | Running headers/footers flood TOC (novel: 47 vs 7) | R2 #2 | I1 |
| 6 | TXT chapter patterns too narrow (pg1661: 1 chapter) | R2 #10 | I4 |
| 7 | EPUB→TXT regex strip destroys text | R1/C3 | O2 |
| 8 | Two-column/sidebar PDF reading order | R2 #3 | I1 |
| 9 | fb2.zip/.gz rejected at entry; nested sections flat | R2 #16/17 | I3 |
| 10 | `mobi` crate incompatibility kills conversions | R1/H4 | I2 |
| 11 | No PDF outline/presets in EPUB→PDF | R1/M3 | O2 |
| 12 | No DRM detection / friendly failure | R1/M5 | I2 |

**Wins already locked:** EPUBCheck 0 errors / 0 warnings on the whole corpus; streaming image writes; sanitization; queue/cancel/persistence; capability matrix honest.

## Chosen architecture (unchanged from mission, now concrete)

```
convert/corpus/src/* → [conversion::convert_to_epub_new] → OebBook (IR) → transforms → epub_builder
                    ↘ (existing ConversionEngine for epub→pdf/txt + queue)
```

Deliberate choices:
1. **Keep the existing OEB IR + epub_builder** (EPUBCheck-clean) — rewrite in place, don't re-platform. IR spec frozen in `IR-SPEC.md` with the fields OebBook supports today (`oeb.rs`) — no breaking model change; add report + determinism around it.
2. **PDF:** pdf-extract (pure Rust, Android-safe) is the primary path **everywhere**; pdftohtml XML stays a *desktop-only accelerator* used for geometry (columns/headers) when present. Fixed-layout fallback = comic-style page-image EPUB (reader already renders that — R4 #11).
3. **Encoding:** replace chardet logic with a scoring detector on encoding_rs (no new deps).
4. **MOBI:** custom PDB extractor (`services/mobi_adapter.rs`) is the content source of truth; the `mobi` crate metadata call becomes optional (fallback-tolerant, DRM check added).
5. **EPUB→PDF:** extend printpdf writer with outline, margins/presets, page numbers (O2).
6. **No OCR, no MuPDF, no pdfium** this cycle (R3).

## Libraries (final)

Added: **none** (encoding logic replaces chardet usage). Kept: pdf-extract, lopdf, encoding_rs, quick-xml, html5ever, printpdf, zip, image, resvg(MPL — owner note). Dev-only: epubcheck 5.2.1 (Apache-2.0) in `convert/tools/`. See `LICENSES.md`.

## Agent assignments (sequential passes; files owned per mission table)

- **C0** (Phase 1, first): IR unchanged + `ConversionReport` plumbing, deterministic OPF (hash-derived uuid, source-mtime-based `dcterms:modified`), transform pass registry, progress emissision from `convert_to_epub_new`.
- **Q** (Phase 1, parallel): corpus (done), harness `src-tauri/tests/convert_probe.rs` (done), `convert/tools/score.py` (done), **BASELINE.md** (this phase).
- **I1** (Phase 2a): PDF header/footer/page-number removal, heading dedup by repetition, scan detection → fixed-layout fallback + report, de-hyphenation, two-column band analysis, reading-order fix, table detection (basic), headings by font size when geometry available.
- **I2** (Phase 2b): MOBI crate isolation, DRM detection & friendly failure, KF8 prefer, NCX TOC when present.
- **I3** (Phase 2c): fb2.zip/.fbz/.gz at entry, nested-section TOC, notes-body anchor links, entity/encoding robustness.
- **I4** (Phase 2d): encoding detector rewrite, chapter-pattern expansion (ADVENTURE I., BOOK/CHAPTER mixes, numbered 1., roman), memory-bounded huge-line path.
- **O1** (Phase 2e): chapter splitting, accessibility metadata + landmarks, RTL dir, stable ids (with C0).
- **O2** (Phase 2f): EPUB→TXT rewrite (entity decode + structure), EPUB→PDF outline/presets/page numbers + own writer module.
- **U1** (Phase 2g): conversion report surfaced in dialog + store; preset dropdown; friendly error text for DRM/scan fallback.
- **Phase 3**: merge, full harness re-run vs BASELINE, Calibre oracle (needs calibre installed — see R5), fuzz (cargo-fuzz smoke on parsers), round-trips, visual inspection of rendered EPUBs where possible.

## Verification loop (each phase)

`cargo test --lib conversion` → `cargo test --test convert_probe` → `venv/bin/python convert/tools/score.py` → compare vs `convert/BASELINE.md`.