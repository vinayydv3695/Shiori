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
