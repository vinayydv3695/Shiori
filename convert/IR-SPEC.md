# IR-SPEC — Intermediate Book Model (frozen contract)

**Version 1.0 (frozen 2026-09-28).** This is the contract between readers and writers. It mirrors the existing `src-tauri/src/conversion/oeb.rs` types (EPUBCheck-clean since day one) and adds the report + determinism requirements. **Any change requires an Orchestrator decision and a version bump.**

## 1. Book

```rust
pub struct OebBook {
    // Metadata
    pub title: String,
    pub authors: Vec<String>,
    pub language: String,          // BCP-47, e.g. "en", "ru", "zh-CN"
    pub publisher: Option<String>,
    pub description: Option<String>,
    pub isbn: Option<String>,
    pub published_date: Option<String>,
    pub cover_image: Option<OebImage>,
    // Structure
    pub toc: Vec<TocEntry>,        // hierarchical
    pub chapters: Vec<OebChapter>, // spine order; each self-contained XHTML fragment
    pub images: Vec<OebImage>,     // all inline images, referenced from chapter HTML
    pub custom_stylesheet: Option<String>,
    pub temp_dir: Option<tempfile::TempDir>,  // keeps Path images alive (CBR)
}
```

Rules:
- `language` must be a valid BCP-47 tag; readers default it, writers MUST emit it in OPF + `xml:lang`.
- `chapters[].id` must be unique, slug-safe (`[a-z0-9_-]+`), stable across conversions of the same input. Writers emit `OEBPS/Text/{id}.xhtml`.
- `chapters[].html` is a **body fragment**: no `<html>/<head>/<body>` wrappers; sanitized (`sanitize_html()` strips script/style/PI; bare text wrapped in `<p>`).
- `toc[].href` is `"{chapter_id}"` or `"{chapter_id}#anchor"`.
- `images[].filename` unique; `src` in HTML uses `../Images/{filename}`.
- Images are ONE of `Bytes(Vec<u8>)` (memory), `Path` (disk, streamed), `ZipEntry { archive, entry }` (streamed from CBZ). Zero-copy streaming mandatory for comics/scans.

## 2. Chapter

```rust
pub struct OebChapter { pub id: String, pub title: Option<String>, pub html: String }
```

- `title: None` for untitled chapters — writers must derive a fallback label and mark it (report `toc_labels_derived`).
- Chapter content is **reflowable XHTML**: allowed elements p, h1..h6, ul/ol/li, table/tr/td/th, blockquote, pre, img, a, br, hr, em/strong, sup/sub, div (wrapper only: `.poem`, `.epigraph`, `.scene-break`, `.page` for fixed-layout fallback), span (inline styling). Disallowed: script, style, iframe, object, embed, form, canvas, svg (sanitizer drops them — `formats/common.rs::DROP_ELEMENTS`).

## 3. TOC

```rust
pub struct TocEntry { pub title: String, pub href: String, pub children: Vec<TocEntry> }
```

- Writers emit BOTH nav.xhtml (epub3) and toc.ncx (epub2 compat) from this tree.
- Every href must resolve; the writer validates and drops dead entries **with a report warning** (never a broken nav).

## 4. Report (new in this phase — C0)

```rust
pub struct ConversionReport {
    pub warnings: Vec<ReportItem>,   // structured, machine-readable
    pub heuristics_used: Vec<String>,// e.g. "running-header-removal", "encoding:windows-1251(score 0.97)"
    pub fallback_used: Option<String>,// e.g. "fixed-layout (image-only pages 2..9)"
    pub confidence: f32,             // 0..1 overall
    pub source_format: String,
    pub source_size_bytes: u64,
    pub duration_ms: u64,
    pub output_sha256: String,       // deterministic digest of the produced file
    pub toc_entries: usize,
    pub chapter_count: usize,
}
```

`ReportItem { level: Warn|Info, code: &'static str, message: String }`. Codes are stable identifiers the UI can localize. The report is embedded in the `conversion:complete` event and persisted on the job row (JSON column — new migration v44, C0+Q).

## 5. Determinism contract (C0)

For identical input bytes + identical settings + identical library version:
- `dc:identifier` = `urn:uuid:{sha256(source_bytes + title)[..32] with uuid formatting}` — stable per source, unique per book.
- `dcterms:modified` = source file mtime (filesystem) or, when unavailable, a fixed epoch per (source hash) — NEVER wall-clock.
- ZIP entry timestamps = fixed epoch (1980-01-01) for all entries.
- No other wall-clock or random values anywhere in output.
- `output_sha256` enables cheap cache verification.

## 6. Transform passes (phase registry, toggleable)

`conversion/transforms/mod.rs` (new, C0): each pass is a pure `fn(&mut OebBook, &mut ConversionReport)`, ordered:

1. `de_hyphenate` (PDF/TXT) — only at line-end, only when the joined word exists in a dictionary-let-loose rule (lowercase 2+ letters both sides; never inside URLs/numbers).
2. `strip_running_headers` (PDF) — remove lines that repeat identically on ≥60% of pages in the same vertical band; report count.
3. `strip_page_numbers` (PDF) — standalone integer lines in the bottom band.
4. `detect_chapters` (per-format heads; PDF heading font-size when geometry available).
5. `clean_whitespace` — collapse runs, blank-line policy.
6. `normalize_css` — remove inline styles in HTML sources (already in serialize_node), map `class` allowlist.
7. `smart_typography` (optional, off by default; TXT-only) — quotes/dashes when the source language is Western; never in code blocks.
8. `cover_fallback` — first image becomes cover when metadata has none and size is sane.
9. `split_large_chapters` (O1 writer-side) — >N KB fragments split at heading boundaries for reader performance.

Report records which passes ran and what each changed (`heuristics_used`, item counts).

## 7. Non-goals for v1 of this spec

- No inline style preservation from DOCX/HTML (flattened; class allowlist only).
- No embedded fonts in v1 (CSS fallback stacks only; safe `font-family` list).
- No `epub:switch`/fixed-layout property flags; "fixed layout" = `.page` divs + full-page images (comic pattern, reader-proven).
- No SVG/aside/notes EPUB extensions beyond `epub:type` on nav/landmarks.