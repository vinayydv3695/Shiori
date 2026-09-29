# DECISIONS — tried, measured, rejected (kept for later rounds)

- **chardet → own scorer**: replaced; measured before/after on 12 encodings (0.11–0.92 → 0.958–0.996). chardet's structure (single heuristic, no scoring) can't win; do not reintroduce.
- **Strict-UTF-8 must come AFTER the NUL-parity check** (NULs are legal UTF-8): my first reorder dropped it entirely → whole-book cp1252 mojibake for 154/155 chapters. Guarded by byte-level regression test.
- **koi8-r vs cp1251**: byte-level case inverses; resolve via uppercase-ratio + word-initial-uppercase and box-drawing penalty, NOT balance heuristics (tie went to the earlier candidate).
- **CJK (gbk/big5/euc-kr/shift_jis)**: kana/hangul presence is decisive (+0.5/0.4 boosts); hanzi-only ambiguous ties favor gbk; big5 wins via had_errors on gbk-invalid pairs.
- **Running headers**: raw line index fails (pdf-extract pads blanks); rank among NON-EMPTY lines; normalize inner whitespace for repetition matching (pdf-extract emits "  —  ").
- **TOC duplicates (TXT)**: same-title adjacent merge is insufficient (TOC run and body run aren't adjacent); added cross-chapter stub dedupe (short body + repeated title + long twin). Remaining stubs on pg84/pg1342 are tolerated (precision > recall).
- **Scan fallback**: page-image EPUB via lopdf first-image-per-page; no OCR this cycle (no tesseract on Android; fixed-layout is the mandated fallback).
- **mobi crate**: record list parse (offset:u32,id:u32 + extra-bytes gap) is incompatible with PalmDB (id,attr,u24); content stays on the in-house adapter; the crate is metadata-only, optional, wrapped (never panics through).
- **Rejected**: pdfium renderer (Android binary weight, not needed), MuPDF (AGPL), poppler as crate (GPL), tesseract OCR (external + models).
- **Determinism**: uuid v5 from sha256(source); dcterms:modified = source mtime; zip timestamps pinned 1980-01-01 (zip crate defaults to NOW under the `time` feature — must set explicitly).
