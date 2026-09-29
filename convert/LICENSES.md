# LICENSES — Audit for the conversion engine

**Date:** 2026-09-28 · Owner-facing decisions are marked **[OWNER]**. Policy: Shiori is commercial → no GPL/AGPL code may be copied, ported, translated, or bundled. Calibre is a behavioral reference and dev-only oracle only. **No Calibre source has been read or reused anywhere in this project** (verified: all parsers are original Rust; comments referencing `calibre's X` mean "designed to match observed behavior").

## In-tree conversion dependencies (already in Cargo.lock)

| Crate | Version | License | Use | Verdict |
|---|---|---|---|---|
| pdf-extract | 0.12 | Apache-2.0 | PDF text, primary path | ✅ keep |
| lopdf | 0.33 | MIT | PDF low-level, cover extraction | ✅ keep |
| mobi | 0.6 | MIT | MOBI EXTH metadata only (content via own adapter) | ✅ keep, isolated (I2) |
| docx-rs | 0.4 | MIT | DOCX | ✅ |
| quick-xml | 0.36 | MIT | FB2/XML | ✅ |
| html5ever / markup5ever_rcdom | 0.27/0.3 | MIT/Apache-2.0 | HTML DOM | ✅ |
| ammonia | 4.0 | MIT/Apache-2.0 | sanitize | ✅ |
| pulldown-cmark | 0.12 | MIT | Markdown | ✅ |
| encoding_rs | 0.8 | MIT/Apache-2.0 | character decoding | ✅ |
| chardet | 0.2 | MPL-1.1/LGPL-2.1 dual | charset guess — **being replaced** by own scorer | 🔄 remove in I4 |
| zip | 2.x | MIT | EPUB zip | ✅ |
| flate2 | 1.0 | MIT/Apache-2.0 | gzip (fb2) | ✅ |
| base64 / byteorder | — | MIT/Apache-2.0 | fb2 images / binary | ✅ |
| image / imageproc | 0.25/0.24 | MIT/Apache-2.0 | image processing | ✅ |
| resvg | 0.42 | **MPL-2.0** | SVG rasterize | ⚠ **[OWNER]** MPL is file-level copyleft: keeping is fine for a commercial product if MPL notice preserved; recommend KEEP |
| tiny-skia | 0.11 | Apache-2.0/BSD-3 | 2D raster | ✅ |
| ab_glyph | 0.2 | Apache-2.0 | font render | ✅ |
| printpdf | 0.7 | MIT | EPUB→PDF | ✅ |
| epub | 2.1 | MIT | EPUB read (export) | ✅ |
| unrar | 0.5 (optional) | libunrar **non-free** | CBR | ⚠ **[OWNER]** optional feature already; recommend keep optional, OFF on Android/CI; never bundle the lib |
| uuid/chrono/tempfile/regex/once_cell/… | — | MIT/Apache-2.0 | infra | ✅ |

## External executables (never bundled; optional accelerators)

| Tool | License | Use | Verdict |
|---|---|---|---|
| Calibre `ebook-convert` | GPL-3 | dev/optional user-installed oracle + conversion service (`services/calibre_service.rs`, opt-in, disabled by default on Android paths) | ⚠ **[OWNER]** same posture as today; it runs only if the *user* installed it — no code from it is embedded. Recommend KEEP (opt-in), never auto-install |
| poppler `pdftohtml` | GPL-2 | desktop PDF geometry accelerator (legacy path `conversion/pdf.rs`) | ⚠ **[OWNER]** same posture; Android never uses it. Recommend KEEP behind availability probe |
| Java + EPUBCheck 5.2.1 | Apache-2.0 | dev-only validation oracle in `convert/tools/` (gitignored, not shipped) | ✅ keep dev-only |

## Explicitly excluded (do not add without owner approval)

- **MuPDF — AGPL-3** — never use (rule 2). Any PR adding `mupdf`/`mupdf-rs` is rejected automatically.
- **poppler as a linked Rust crate** (only the shell-out probe above is acceptable, same as calibre).
- **tesseract OCR** — Apache-2.0 but external binary + models; out of scope; fallback is fixed-layout EPUB.
- **pdfium** — BSD-3 (fine license); not needed this cycle (R3); allowed later with owner note.

## No-copy attestation

- All format parsers (`conversion/{mobi,pdf,fb2,txt,docx}.rs`, `conversion/formats/*`, `services/*adapter*`) are original implementations. The **PalmDOC LZ77** decompressor, **HUFF/CDIC** decompressor, **PDB/EXTH/MOBI** parsers were implemented from the *public format specifications* (both the MOBI spec and the PalmDOC spec are documentation, not code).
- The PDF pipeline is built on pdf-extract/pdftohtml behavior — no poppler source used.
- `ebook-convert` behavior is observed via CLI/docs only (see `recon-r5.md`).
- KindleGen/.mobi reference outputs in tests were produced by our own generator (`convert/tools/gen_mobi.py`) or are user-provided samples.

## Open items for the owner

1. resvg MPL-2.0 — keep? (recommend: keep)
2. unrar non-free optional feature — keep? (recommend: keep, off on Android)
3. Calibre/poppler opt-in shell-outs — keep? (recommend: keep)
4. MuPDF — permanently excluded unless explicitly approved per-feature.