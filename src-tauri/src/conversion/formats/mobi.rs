/// MOBI / AZW3 → OEB parser.
///
/// Drives the SAME extraction pipeline the reader uses
/// (`services::mobi_adapter::MobiAdapter`): multi-strategy PalmDB record
/// extraction (PalmDOC + HUFF/CDIC decompression, extra-byte trimming, hybrid
/// UTF-8/cp1252 decoding) and heading/pagebreak chapter splitting. Chapters,
/// metadata and TOC come straight from the adapter.
///
/// The adapter inlines images as base64 data URIs when it can; for files where
/// the recindex links survive instead (e.g. the Briar Club sample), this parser
/// recovers the image records from the raw PDB and rewrites the `<img>` tags to
/// real EPUB resources under `OEBPS/Images/`. The cover is picked with the same
/// candidate order as `metadata_service::extract_mobi_cover` (EXTH 201/202 +
/// first-image index).
///
/// The legacy `crate::conversion::mobi` PalmDB pipeline is no longer called by
/// conversion (kept untouched in conversion/mobi.rs as dead code).
use std::collections::HashMap;
use std::path::Path;

use crate::conversion::error::ConversionError;
use crate::conversion::formats::common;
use crate::conversion::oeb::{OebBook, OebChapter, OebImage, TocEntry};
use crate::services::mobi_adapter::MobiAdapter;
use crate::services::renderer::BookReaderAdapter;

// ──────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ──────────────────────────────────────────────────────────────────────────

/// Parse a MOBI/AZW3 file into an OebBook.
pub fn parse(path: &Path) -> Result<OebBook, ConversionError> {
    let file_data = std::fs::read(path)?;
    let path_buf = path.to_path_buf();

    let book = common::block_on(async move {
        let mut adapter = MobiAdapter::new();
        adapter
            .load(&path_buf.to_string_lossy())
            .await
            .map_err(|e| ConversionError::ParseError {
                format: "MOBI".to_string(),
                detail: e.to_string(),
            })?;
        build_oeb(&adapter, &file_data)
    })?;
    book
}

// ──────────────────────────────────────────────────────────────────────────
// OEB BUILDING (adapter → OebBook)
// ──────────────────────────────────────────────────────────────────────────

fn build_oeb(adapter: &MobiAdapter, file_data: &[u8]) -> Result<OebBook, ConversionError> {
    let meta = adapter
        .get_metadata()
        .map_err(|e| ConversionError::Other(e.to_string()))?;

    let mut book = OebBook::new(meta.title);

    // Richer metadata straight from the EXTH header (the adapter only exposes
    // title/author). All optional — the reader path stays the source of truth
    // for content, this only decorates the OPF.
    if let Ok(m) = mobi::Mobi::from_read(&mut &file_data[..]) {
        if let Some(author) = m.author() {
            book.authors = split_authors(&author);
        }
        book.publisher = m.publisher();
        book.description = m.description();
        book.isbn = m.isbn();
        book.published_date = m.publish_date();
        book.language = language_code(m.language()).to_string();
    }
    if book.authors.is_empty() {
        if let Some(author) = meta.author {
            book.authors = split_authors(&author);
        }
    }

    // Chapters — exactly what the reader renders.
    let count = adapter.chapter_count();
    for i in 0..count {
        let ch = adapter
            .get_chapter(i)
            .map_err(|e| ConversionError::Other(e.to_string()))?;
        book.chapters.push(OebChapter {
            id: format!("chapter_{:03}", i + 1),
            title: Some(ch.title),
            html: clean_chapter_html(&ch.content),
        });
    }

    // TOC — adapter entries point at `mobi-chapter-N` locations; map them to
    // the OEB chapter ids.
    let toc = adapter
        .get_toc()
        .map_err(|e| ConversionError::Other(e.to_string()))?;
    for (pos, entry) in toc.into_iter().enumerate() {
        book.toc.push(TocEntry {
            title: entry.label,
            href: toc_href(&entry.location, pos),
            children: Vec::new(),
        });
    }

    // Cover first so inline-image export can skip the duplicate bytes.
    let records = mobi_image_records(file_data);
    book.cover_image = extract_cover(file_data, &records);

    // Real image resources: resolve recindex/src references against the PDB
    // image records and rewrite `<img>` tags to `../Images/…`.
    attach_images(&mut book, &records);

    Ok(book)
}

/// Strip MOBI-only markup that is meaningless (or invalid) inside an EPUB
/// chapter: `<mbp:pagebreak/>` markers and stray `</img>` closers.
fn clean_chapter_html(html: &str) -> String {
    let re = regex::Regex::new(r"(?is)<mbp:pagebreak\b[^>]*?/?>").unwrap();
    let cleaned = re.replace_all(html, "").into_owned();
    cleaned.replace("</img>", "")
}

fn split_authors(raw: &str) -> Vec<String> {
    raw.split([';', ','])
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// Adapter TOC locations look like `mobi-chapter-16`; map back to `chapter_017`.
fn toc_href(location: &str, pos: usize) -> String {
    if let Some(idx) = location
        .rsplit('-')
        .next()
        .and_then(|s| s.parse::<usize>().ok())
    {
        if idx < 10_000 {
            return format!("chapter_{:03}", idx + 1);
        }
    }
    format!("chapter_{:03}", pos + 1)
}

fn language_code(lang: mobi::headers::Language) -> &'static str {
    use mobi::headers::Language::*;
    match lang {
        English => "en",
        French => "fr",
        German => "de",
        Spanish => "es",
        Italian => "it",
        Portuguese => "pt",
        Dutch => "nl",
        Russian => "ru",
        Chinese => "zh",
        Japanese => "ja",
        Korean => "ko",
        Arabic => "ar",
        Hindi => "hi",
        Turkish => "tr",
        Polish => "pl",
        Swedish => "sv",
        Danish => "da",
        Finnish => "fi",
        Norwegian => "no",
        Greek => "el",
        Hebrew => "he",
        Ukrainian => "uk",
        Czech => "cs",
        Hungarian => "hu",
        Romanian => "ro",
        Catalan => "ca",
        Indonesian => "id",
        Vietnamese => "vi",
        Thai => "th",
        Malay => "ms",
        Farsi => "fa",
        Basque => "eu",
        Georgian => "ka",
        Icelandic => "is",
        Latvian => "lv",
        Lithuanian => "lt",
        Estonian => "et",
        Slovenian => "sl",
        Slovak => "sk",
        Bulgarian => "bg",
        Serbian => "sr",
        Bengali => "bn",
        Tamil => "ta",
        Telugu => "te",
        Kannada => "kn",
        Malayalam => "ml",
        Gujarati => "gu",
        Marathi => "mr",
        Punjabi => "pa",
        Urdu => "ur",
        Nepali => "ne",
        Swahili => "sw",
        Xhosa => "xh",
        Zulu => "zu",
        Sutu => "st",
        Tswana => "tn",
        Tsonga => "ts",
        Sami => "se",
        Oriya => "or",
        Assamese => "as",
        Azeri => "az",
        Belarusian => "be",
        Kazak => "kk",
        Tatar => "tt",
        Uzbek => "uz",
        Armenian => "hy",
        Albanian => "sq",
        Macedonian => "mk",
        Maltese => "mt",
        Sanskrit => "sa",
        Faeroese => "fo",
        Konkani => "kok",
        Rhaetoromanic => "rm",
        Afrikaans => "af",
        Sorbian => "hsb",
        Neutral | Unknown => "en",
    }
}

// ──────────────────────────────────────────────────────────────────────────
// PDB IMAGE RECORDS
// ──────────────────────────────────────────────────────────────────────────

/// A raw image recovered from the PDB image records.
struct PdbImage {
    /// Absolute PDB record index.
    index: usize,
    /// Image bytes (trimmed at the format's end marker).
    data: Vec<u8>,
    mime: &'static str,
    ext: &'static str,
}

fn read_be_u16(data: &[u8], offset: usize) -> Option<u16> {
    data.get(offset..offset + 2)
        .map(|b| u16::from_be_bytes([b[0], b[1]]))
}

fn read_be_u32(data: &[u8], offset: usize) -> Option<u32> {
    data.get(offset..offset + 4)
        .map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
}

fn pdb_record_offsets(data: &[u8]) -> Option<Vec<usize>> {
    let num_records = read_be_u16(data, 76)? as usize;
    let table_bytes = num_records.checked_mul(8)?;
    if data.len() < 78usize.checked_add(table_bytes)? {
        return None;
    }
    let mut offsets = Vec::with_capacity(num_records);
    for i in 0..num_records {
        let offset = read_be_u32(data, 78 + i * 8)? as usize;
        if offset >= data.len() {
            return None;
        }
        if let Some(prev) = offsets.last() {
            if offset < *prev {
                return None;
            }
        }
        offsets.push(offset);
    }
    Some(offsets)
}

/// First image record index from the MOBI header (offset 92), 0 when absent.
fn mobi_first_image_index(data: &[u8], offsets: &[usize]) -> usize {
    let mobi_start = offsets.first().copied().unwrap_or(0).saturating_add(16);
    if data.get(mobi_start..mobi_start + 4) != Some(b"MOBI") {
        return 0;
    }
    read_be_u32(data, mobi_start + 92).unwrap_or(0) as usize
}

/// EXTH 201/202 cover-offset records → absolute record indices.
fn exth_cover_offsets(
    data: &[u8],
    offsets: &[usize],
    first_image_index: usize,
) -> Option<Vec<usize>> {
    let mobi_start = offsets.first().copied()?.saturating_add(16);
    if data.get(mobi_start..mobi_start + 4) != Some(b"MOBI") {
        return None;
    }
    let mobi_header_len = read_be_u32(data, mobi_start + 4).unwrap_or(0) as usize;
    let exth_flags = read_be_u32(data, mobi_start + 112).unwrap_or(0);
    if (exth_flags & 0x40) == 0 {
        return None;
    }
    let exth_start = mobi_start.saturating_add(mobi_header_len);
    if data.get(exth_start..exth_start + 4) != Some(b"EXTH") {
        return None;
    }
    let exth_len = read_be_u32(data, exth_start + 4).unwrap_or(0) as usize;
    let exth_count = read_be_u32(data, exth_start + 8).unwrap_or(0) as usize;
    let exth_end = exth_start.saturating_add(exth_len).min(data.len());

    let mut out = Vec::new();
    let mut cursor = exth_start + 12;
    for _ in 0..exth_count {
        if cursor + 8 > exth_end {
            break;
        }
        let rec_type = read_be_u32(data, cursor).unwrap_or(0);
        let rec_len = read_be_u32(data, cursor + 4).unwrap_or(0) as usize;
        if rec_len < 8 || cursor + rec_len > exth_end {
            break;
        }
        let payload = &data[cursor + 8..cursor + rec_len];
        if (rec_type == 201 || rec_type == 202) && payload.len() >= 4 {
            let offset_value =
                u32::from_be_bytes([payload[0], payload[1], payload[2], payload[3]]) as usize;
            let base = if first_image_index > 0 {
                first_image_index
            } else {
                0
            };
            out.push(base.saturating_add(offset_value));
        }
        cursor += rec_len;
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

/// Detect an embedded image, returning (mime, ext, offset of the image start).
fn detect_image(data: &[u8]) -> Option<(&'static str, &'static str, usize)> {
    for start in 0..data.len().min(32) {
        let tail = &data[start..];
        if tail.len() >= 3 && tail[0..3] == [0xFF, 0xD8, 0xFF] {
            return Some(("image/jpeg", "jpg", start));
        }
        if tail.len() >= 8 && tail[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
            return Some(("image/png", "png", start));
        }
        if tail.len() >= 6 && (&tail[0..6] == b"GIF87a" || &tail[0..6] == b"GIF89a") {
            return Some(("image/gif", "gif", start));
        }
        if tail.len() >= 12 && &tail[0..4] == b"RIFF" && &tail[8..12] == b"WEBP" {
            return Some(("image/webp", "webp", start));
        }
        if tail.len() >= 2 && &tail[0..2] == b"BM" {
            return Some(("image/bmp", "bmp", start));
        }
    }
    None
}

/// Cut trailing bytes after the format's end marker (PDB records are padded).
fn trim_image_tail<'a>(data: &'a [u8], mime: &str) -> &'a [u8] {
    let end = match mime {
        "image/jpeg" => data
            .windows(2)
            .rposition(|w| w == [0xFF, 0xD9])
            .map(|p| p + 2),
        "image/png" => data.windows(4).rposition(|w| w == b"IEND").map(|p| p + 8),
        "image/gif" => data.iter().rposition(|b| *b == 0x3B).map(|p| p + 1),
        _ => None,
    };
    match end {
        Some(end) if end > 0 => data.get(..end).unwrap_or(data),
        _ => data,
    }
}

/// All image records of the file, in record order.
fn mobi_image_records(data: &[u8]) -> Vec<PdbImage> {
    let Some(offsets) = pdb_record_offsets(data) else {
        return Vec::new();
    };
    let first = mobi_first_image_index(data, &offsets);
    // When the header lacks a first-image index, fall back to scanning the
    // leading records (mirrors metadata_service's fallback candidates).
    let start = if first > 0 && first < offsets.len() {
        first
    } else {
        1
    };

    let mut out = Vec::new();
    for idx in start..offsets.len() {
        let start = offsets[idx];
        let end = offsets.get(idx + 1).copied().unwrap_or(data.len());
        if start >= end || end > data.len() {
            continue;
        }
        let rec = &data[start..end];
        let Some((mime, ext, img_start)) = detect_image(rec) else {
            continue;
        };
        let bytes = trim_image_tail(&rec[img_start..], mime).to_vec();
        if bytes.len() < 64 {
            continue;
        }
        out.push(PdbImage {
            index: idx,
            data: bytes,
            mime,
            ext,
        });
    }
    out
}

// ──────────────────────────────────────────────────────────────────────────
// COVER
// ──────────────────────────────────────────────────────────────────────────

/// Pick the cover image. Candidate order mirrors
/// `metadata_service::extract_mobi_cover`: EXTH cover offsets first (falling
/// back to the first-image index), then the leading image records, then the
/// first few records of the PDB.
fn extract_cover(data: &[u8], records: &[PdbImage]) -> Option<OebImage> {
    if records.is_empty() {
        return None;
    }
    let offsets = pdb_record_offsets(data);
    let first = offsets
        .as_deref()
        .map(|o| mobi_first_image_index(data, o))
        .unwrap_or(0);

    let mut candidates: Vec<usize> = Vec::new();
    let mut push = |idx: usize| {
        if idx > 0 && !candidates.contains(&idx) {
            candidates.push(idx);
        }
    };
    if first > 0 {
        push(first);
    }
    if let Some(offsets) = &offsets {
        if let Some(exth) = exth_cover_offsets(data, offsets, first) {
            for idx in exth {
                push(idx);
            }
        }
        if first > 0 {
            for idx in first..offsets.len().min(first.saturating_add(6)) {
                push(idx);
            }
        }
        for idx in 1..offsets.len().min(8) {
            push(idx);
        }
    }

    for idx in candidates {
        if let Some(rec) = records.iter().find(|r| r.index == idx) {
            return Some(OebImage {
                id: "cover".to_string(),
                filename: format!("cover.{}", rec.ext),
                mime_type: rec.mime.to_string(),
                source: crate::conversion::oeb::ImageSource::Bytes(rec.data.clone()),
            });
        }
    }
    // Last resort: whatever the first image record is.
    records.first().map(|rec| OebImage {
        id: "cover".to_string(),
        filename: format!("cover.{}", rec.ext),
        mime_type: rec.mime.to_string(),
        source: crate::conversion::oeb::ImageSource::Bytes(rec.data.clone()),
    })
}

// ──────────────────────────────────────────────────────────────────────────
// INLINE IMAGES → REAL RESOURCES
// ──────────────────────────────────────────────────────────────────────────

/// Resolve `recindex`/`src` references in chapter HTML against the PDB image
/// records and rewrite the `<img>` tags to `../Images/…`. Byte-identical
/// images (and the cover) are only exported once.
fn attach_images(book: &mut OebBook, records: &[PdbImage]) {
    if records.is_empty() {
        return;
    }
    let first = records[0].index;

    // Aliases → absolute record index. recindex is 1-based relative to the
    // first image record; some books use absolute indices or `kindle:embed:`
    // / `images/…` src forms — cover them all.
    let mut alias: HashMap<String, usize> = HashMap::new();
    for rec in records {
        let one_based = rec.index - first + 1;
        for n in [one_based, rec.index] {
            alias.insert(n.to_string(), rec.index);
            alias.insert(format!("{:04}", n), rec.index);
            alias.insert(format!("{:05}", n), rec.index);
            alias.insert(format!("image{}", n), rec.index);
            alias.insert(format!("images/image{}.{}", n, rec.ext), rec.index);
            alias.insert(format!("images/image{}.jpeg", n), rec.index);
            alias.insert(format!("images/{:05}.{}", n, rec.ext), rec.index);
            alias.insert(format!("images/{:05}.jpeg", n), rec.index);
        }
    }

    let img_re = regex::Regex::new(r#"(?is)<img\b([^>]*)>"#).unwrap();
    let src_attr_re =
        regex::Regex::new(r#"(?is)\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))"#).unwrap();
    let recindex_re = regex::Regex::new(r#"(?i)\brecindex\s*=\s*["']?(\d+)"#).unwrap();
    let strip_src_re =
        regex::Regex::new(r#"(?i)\s+src\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)"#).unwrap();

    let mut by_bytes: HashMap<Vec<u8>, String> = HashMap::new();
    let mut counter: u32 = 0;

    // Disjoint field borrows: the rewrite closure pushes into `images` and
    // compares against `cover` while the loop walks `book.chapters`.
    let images = &mut book.images;
    let cover = book.cover_image.as_ref();

    for chapter in &mut book.chapters {
        let rewritten = img_re
            .replace_all(&chapter.html, |caps: &regex::Captures| {
                let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                let recindex = recindex_re
                    .captures(attrs)
                    .and_then(|c| c.get(1))
                    .map(|m| m.as_str().to_string());
                let src = src_attr_re
                    .captures(attrs)
                    .and_then(|c| c.get(1).or_else(|| c.get(2)).or_else(|| c.get(3)))
                    .map(|m| m.as_str().to_string());

                let rec_idx = recindex
                    .as_deref()
                    .and_then(|r| resolve_alias(r, &alias))
                    .or_else(|| src.as_deref().and_then(|s| resolve_src(s, &alias)));

                let Some(rec) = rec_idx.and_then(|i| records.iter().find(|r| r.index == i)) else {
                    return caps
                        .get(0)
                        .map(|m| m.as_str())
                        .unwrap_or_default()
                        .to_string();
                };

                let attrs = strip_src_re.replace_all(attrs, "").into_owned();

                // Byte-dedup across chapters, and skip the cover entirely.
                if let Some(existing) = by_bytes.get(&rec.data) {
                    return format!("<img{} src=\"{}\">", attrs, existing);
                }
                if let Some(cover) = cover {
                    if matches!(
                        &cover.source,
                        crate::conversion::oeb::ImageSource::Bytes(b) if b == &rec.data
                    ) {
                        let src = format!("../Images/{}", cover.filename);
                        by_bytes.insert(rec.data.clone(), src.clone());
                        return format!("<img{} src=\"{}\">", attrs, src);
                    }
                }

                counter += 1;
                let id = format!("img_{:03}", counter);
                let filename = format!("img_{:03}.{}", counter, rec.ext);
                let src = format!("../Images/{}", filename);
                by_bytes.insert(rec.data.clone(), src.clone());
                images.push(OebImage {
                    id,
                    filename,
                    mime_type: rec.mime.to_string(),
                    source: crate::conversion::oeb::ImageSource::Bytes(rec.data.clone()),
                });

                format!("<img{} src=\"{}\">", attrs, src)
            })
            .into_owned();
        chapter.html = rewritten;
    }
}

/// Look up a raw `recindex` value (e.g. `00001`) — try the padded form first,
/// then the stripped digits.
fn resolve_alias(raw: &str, alias: &HashMap<String, usize>) -> Option<usize> {
    if let Some(&idx) = alias.get(raw) {
        return Some(idx);
    }
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    let stripped = digits.trim_start_matches('0');
    if stripped.is_empty() {
        return None;
    }
    alias.get(stripped).copied()
}

/// Resolve an `src` attribute value (kindle:embed:N, images/…, bare digits).
fn resolve_src(src: &str, alias: &HashMap<String, usize>) -> Option<usize> {
    let lowered = src.trim().to_lowercase();
    if lowered.starts_with("http://")
        || lowered.starts_with("https://")
        || lowered.starts_with("data:")
        || lowered.starts_with('#')
    {
        return None;
    }
    if let Some(rest) = lowered.strip_prefix("kindle:embed:") {
        return resolve_alias(rest, alias);
    }
    let basename = lowered.rsplit('/').next().unwrap_or(&lowered);
    if let Some(&idx) = alias.get(basename) {
        return Some(idx);
    }
    // Strip the extension for `images/00001.jpeg`-style references.
    let stem = basename
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(basename);
    if let Some(&idx) = alias.get(stem) {
        return Some(idx);
    }
    if basename.chars().all(|c| c.is_ascii_digit()) {
        return resolve_alias(basename, alias);
    }
    None
}
