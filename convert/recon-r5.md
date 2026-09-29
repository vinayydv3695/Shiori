# R5 — Calibre Behavior Study (black-box only)

**Agent:** R5 (recon) · **Date:** 2026-09-28 · **Constraint:** Calibre source was NOT read or reused (GPL-3). This documents observable behavior from (a) the existing `calibre_service.rs` integration, (b) Calibre's public documentation of `ebook-convert`, (c) expected behavior; and it states clearly where the local oracle could not run.

## ⚠ Local-oracle limitation (honest)

`ebook-convert` is **not installed** on this dev box (checked: `which ebook-convert` → absent; no calibre package). A full black-box comparison run (calibre CLI on the corpus, side-by-side with native output) was therefore **not possible in this session**. The behavior notes below are from public documented behavior (https://manual.calibre-ebook.com/convert.html) and from the existing integration code. **Recommended follow-up: install calibre on the dev machine (`pacman -S calibre` or official installer) and re-run `convert/tools/compare_calibre.py` (Phase 3).** Adding calibre to CI is *not* recommended (oracle is dev-only per rule 2).

## What Shiori already does with Calibre (audit of calibre_service.rs)

- `convert_to_epub` shells out to `ebook-convert source target --output-profile generic_eink_hd`, with `--enable-heuristics` for GenericBook and `--pdf-engine calibre` for PDFs; parses `NN%` progress from stderr; timeout + cancel support. Posture: **user-installed optional accelerant** — same posture we keep; never bundled (LICENSES.md).
- This means some users currently get Calibre-quality conversions "for free" when they have Calibre — while everyone else (and Android) gets the native path. Closing the gap natively is the point of this project.

## Documented Calibre behaviors worth matching (from public docs)

1. **Heuristics toggle (`--enable-heuristics`)** — smart quotes, de-hyphenation, page-number removal, document-margin removal, line-unwrap, markdown-style conversion. Our native TXT path implements parts; page-number removal + de-hyphenation are missing in the PDF path (R2 #3/#7).
2. **TXT input**: Calibre auto-detects paragraph style (unformatted/hard-wrapped), encodings via a big charset auto-detect; our `decode_text` (chardet) is measurably weaker (R2 #9). Calibre also has `--input-encoding` override — we should add an override option too (U1 advanced panel).
3. **PDF input**: Calibre uses pdftohtml (`--pdf-engine poppler` default on Linux) — which is exactly what our legacy `conversion/pdf.rs` does — plus `pdftohtml` XML `<word>`-level geometry that it uses for reading-order and header/footer detection. **This validates our I1 approach: exploit pdftohtml XML when present, fall back to pure-Rust.** Calibre's PDF heuristic set includes: `--pdf-add-toc`, `--pdf-reflow-mode`, and "detect running headers/footers" (our missing piece).
4. **EPUB output**: Calibre emits epub2 by default (epub3 with `--output-profile` rules) with NCX; our builder is epub3+NCX (better). Calibre flattens CSS (`--epub-flatten`), removes inline styles etc.
5. **AZW3 output**: Calibre writes KF8 via its own writer; we currently don't produce AZW3 (matrix allows only to epub/pdf/txt) — O2 target.
6. **Metadata**: Calibre's metadata reader fetches from many sources; ours extracts from the file (PDF info dict / EXTH / FB2 description) — fine for a local convert.
7. **Where Calibre is weak (documented pain points)** — these are our "beat Calibre" levers:
   - Scanned PDFs: Calibre's OCR path requires external tesseract and off by default; plain conversion yields garbage or empty → our **fixed-layout fallback + report** beats it by never producing silent garbage.
   - Complex layouts (multi-column, sidebars): Calibre's linear reflow frequently splices columns; we can beat it with layout-band analysis + same-or-better fallback.
   - Encoding edge cases without tuning: Calibre misdetects too; our BOM+score-based detection targets zero-tuning correctness on the corpus.
   - Determinism: Calibre embeds conversion timestamps/uuid too; our deterministic ids beat it for cache/dedupe.
   - User-facing reports: Calibre's CLI logs thousands of words; we ship a per-book structured report.

## What an oracle run should measure (for Phase 3)

`convert/tools/compare_calibre.py` (to be written in Phase 3): run `ebook-convert` on the same corpus with default options + `--enable-heuristics`, then run the same score.py metrics (EPUBCheck, fidelity, TOC sanity, determinism) and emit a win/tie/loss table. Expected outcomes from R2 baseline: **we already tie on EPUBCheck validity; we trail on encoding fidelity and PDF heuristics today; the fallback/report/determinism are our wins by design.**