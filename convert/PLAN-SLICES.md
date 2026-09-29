# Remaining-gap slices (orchestrate loop — sequential passes, commit per slice)

| # | Slice | Acceptance criteria | Owned files | Est |
|---|---|---|---|---|
| S0 | Baseline commit of Phase 2–4 work | clean tree; convert/out + epubcheck gitignored | repo hygiene | S |
| S1 | TXT TOC-stub residue (pg1342 50/61, pg84 36/27) | pg1342 ≈61 real chapters; pg84 ≈29; no giant multi-item heading | conversion/txt.rs, conversion/formats/txt.rs | S |
| S2 | MOBI DRM → friendly error + report | DRM'd MOBI (drm_count>0) fails with explicit message, not garbage | conversion/formats/mobi.rs | S |
| S3 | Mutation fuzzer + zip/gzip bomb caps | seeded byte-flip test over corpus parsers: no panic/hang; gzip/zip decompression size caps | tests/fuzz_smoke.rs, conversion/fb2.rs, formats/cbz.rs | M |
| S4 | Batch dialog per-row report | report shown per completed row in BatchConvertDialog (data via store or convert response) | commands/conversion.rs (reader path), BatchConvertDialog.tsx | M |
| S5 | Calibre oracle harness | compare_calibre.py runs `ebook-convert` when present; best-effort install attempt recorded | convert/tools/compare_calibre.py, recon-r5.md | S |
| S6 | EPUB→PDF outline/page numbers/presets + embedded TTF when available | produced PDF has bookmarks, page numbers, A4/Letter presets; CJK/Cyrillic glyphs when font present | conversion_engine.rs epub_to_pdf | M |
| S7 | PDF geometry: two-column reorder, sidebar, page headlines, simple tables | twocolumn.pdf TOC ≪ 112 + ordered columns; tables.pdf rows as <table>; novel.pdf stays 7 | conversion/formats/pdf.rs (pdftohtml-XML path) | L |

Gates per slice: `cargo test --lib` + `cargo test --test convert_probe` (+ score.py where structure touched) + tsc/eslint for UI slices.
| S8 | EPUB→FB2 output writer | valid FB2 round-tripping through our parser; matrix advertises fb2 for all book sources | conversion/fb2_writer.rs, conversion_engine.rs matrix | — done 2026-09-29 |
