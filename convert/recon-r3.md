# R3 — Libraries, Licenses & Android Feasibility

**Agent:** R3 (recon) · **Date:** 2026-09-28 · Full table written to `convert/LICENSES.md` (owner-facing). Scope: every conversion-relevant dependency in `src-tauri/Cargo.toml`, plus candidates NOT yet used (pdfium, MuPDF, poppler) and Android build constraints.

## Status quo (already in Cargo.toml)

| Crate | Purpose | License | Verdict |
|---|---|---|---|
| pdf-extract 0.12 | PDF text (per-page) | Apache-2.0 | ✓ keep (basis for I1) |
| lopdf 0.33 | PDF low-level parse/cover | MIT | ✓ keep |
| mobi 0.6 | MOBI metadata (EXTH) | MIT | ⚠ keep but isolate (see R1/H4) |
| docx-rs 0.4 | DOCX parse | MIT | ✓ |
| quick-xml 0.36 | FB2/XML | MIT | ✓ |
| html5ever 0.27 + markup5ever_rcdom | HTML DOM | MIT/Apache-2.0 | ✓ |
| ammonia 4.0 | HTML sanitize | MIT/Apache-2.0 | ✓ (optionally reused) |
| pulldown-cmark 0.12 | Markdown | MIT | ✓ |
| encoding_rs 0.8 | charset decode | MIT/Apache-2.0 | ✓ (fix detection logic, keep crate) |
| chardet 0.2 | charset guess | MPL/LGPL (dual) | ⚠ replace in favor of own heuristic + encoding_rs; last release 2014 |
| zip 2.x | EPUB zip | MIT | ✓ |
| flate2 | gzip | MIT/Apache-2.0 | ✓ |
| image 0.25 / imageproc / resvg 0.42 / tiny-skia / ab_glyph | images, SVG render | image: MIT/Apache; **resvg: MPL-2.0**; tiny-skia: Apache-2.0/BSD-3; ab_glyph: Apache-2.0 | ⚠ resvg MPL-2.0 is file-level copyleft — acceptable for commercial use with notice; owner decision in LICENSES.md |
| printpdf 0.7 | EPUB→PDF | MIT | ✓ (O2 will build presets/outline on it) |
| epub 2.1 | EPUB *reading* (export path) | MIT | ✓ |
| unrar 0.5 (optional) | CBR | ⚠ libunrar is **non-free** (RAR license) | Owner decision: keep behind optional feature, never bundle |
| reqwest/axum/… | infra | MIT/Apache | n/a |

## Candidates (NOT yet used)

- **pdfium (pdfium-render / pdfium-sys): BSD-3.** Best-in-class layout+position+font info; needs the pdfium native lib — building for Android requires the prebuilt android.pdfium (available), but it's a large binary dependency and adds JNI-ish complexity; **not needed** if we exploit pdftohtml XML (desktop) and pdf-extract positions (Android fallback). Defer; revisit if I1 quality targets miss.
- **MuPDF: AGPL-3** → **excluded** (rule 2) unless owner explicitly approves — flagged, not used.
- **poppler (pdftohtml): GPL-2**, shelled out on desktop only. It's not linked and not bundled (same posture as the Calibre service — user's system package). Keep as optional desktop accelerator; Android path never uses it (there is no poppler on Android). Flagged in LICENSES.md for the owner.
- **OCR (tesseract): Apache-2.0** but external binary — Android impossible, and adds a model download; NOT part of this plan. Fixed-layout fallback (page images + hidden text layer) is the mandated replacement.
- **Hyphenation dictionaries (LaTeX hyph-utf8): LPPL** — fine for embedding; deferred (PDF output pass).
- **charset detection improvement**: no new crate needed — scoring-based detection on top of `encoding_rs` covers UTF-8 strict → BOM → UTF-16 probe → statistical (CJK ranges, cp125x/koi8 sanity) with per-encoding "decode quality" scoring. This replaces chardet.

## Android feasibility (rule 4)

- Conversion is already pure-Rust in-process: `convert_to_epub_new` → `formats::*::parse` → `epub_builder`. **No subprocess on Android** — the pdftohtml branch is `#[cfg]-free but never available on Android` (it degrades to lopdf/pdf-extract). Correct posture: make pdf-extract the primary path everywhere (it already is in `formats/pdf.rs`), keep pdftohtml only as an optional desktop enhancement via availability check.
- `pdf-extract` (Apache) and `lopdf` (MIT) build on Android (pure Rust, no C). `unrar` is optional already and should stay off for Android builds.
- Memory: image streaming (`ImageSource::{Path,ZipEntry}`) is already memory-bounded; the gaps are TXT/PDF whole-file reads (see I1/I4 mitigation: pdf-extract is file-backed in `Document::load`; the raw + String copies should be dropped in favor of file-backed page iteration).
- Binary-size risk: `resvg`/`tiny-skia` already shipped; adding pdfium would be the only significant new Android weight. Not needed now.
- Cancel/progress: engine-level `check_cancel()` exists; parsers need internal cancel checks (budgeted work).

## Maintenance health

- chardet: unmaintained (2014) → replace logic, drop dependency.
- mobi 0.6: last release ~2023, has layout bugs (R1/H4) → isolate behind fallback, keep custom adapter as source of truth.
- pdf-extract: active, Apache-2.0, pure Rust → core of I1.
- printpdf: low activity but adequate for O2 baseline (bookmarks API exists).
- epubcheck 5.2.1 (Apache-2.0): dev-only oracle, downloaded to `convert/tools/` (gitignored), Java 17 present on dev box; on CI it can be fetched per job. Never shipped.

## Owner decisions needed (moved to LICENSES.md)

1. resvg (MPL-2.0) — keep with notice? (recommend: keep)
2. libunrar (non-free) — keep optional? (recommend: keep optional, off on Android)
3. poppler/pdftohtml + calibre as desktop-only external accelerators — acceptable? (recommend: yes, same posture as now)
4. MuPDF — excluded unless explicitly approved (recommend: never)