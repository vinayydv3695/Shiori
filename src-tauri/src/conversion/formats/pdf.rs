/// PDF → OEB parser.
///
/// Primary path: pure-Rust, per-page text extraction via `pdf-extract`, with
/// a line-oriented chapter-heading heuristic and PDF Info-dict metadata
/// (title/author via `metadata_service`). Chapter headings are detected on
/// single lines only, so body text can never leak into a TOC title.
///
/// When pdf-extract fails (unusual encodings, exotic CMaps), falls back to
/// the legacy `crate::conversion::pdf::parse` pipeline (pdftohtml when
/// available, lopdf otherwise).
use std::path::Path;

use crate::conversion::error::ConversionError;
use crate::conversion::formats::common;
use crate::conversion::oeb::{escape_xml, OebBook, OebChapter, OebImage};
use crate::conversion::utils;
use crate::services::metadata_service;

/// Longest line (after trim) that may still be a chapter heading.
/// Anything longer is body text — this is what previously let
/// "Chapter TwoSed do eiusmod tempor incididunt…" become a TOC title.
const MAX_HEADING_LEN: usize = 60;

/// Lines shorter than this are never headings (drop caps, stray letters).
const MIN_HEADING_LEN: usize = 2;

/// "Chapter N" heading — arabic or roman numerals, or spelled-out numbers
/// ("Chapter One", "CHAPTER 1"), optionally followed by a colon + subtitle.
/// Anchored to the full line so body text can never be swallowed.
static CHAPTER_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
    regex::Regex::new(r"(?i)^chapter\s+[a-z0-9]+(\s*[:.].*)?$").unwrap()
});

/// Bare numeral heading: "2", "12", "IV", "XII" (no "Chapter" prefix).
static BARE_NUMERAL_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
    regex::Regex::new(r"^(?:[0-9]{1,3}|[IVXLCivxlc]{1,6})[.:]?$").unwrap()
});

/// Spelled-out numbers used for bare-numeral headings ("Two" → "Chapter Two").
static WORD_NUMERAL_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
    regex::Regex::new(
        r"(?i)^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)[.:]?$",
    )
    .unwrap()
});

/// Parse a PDF file into an OebBook.
pub fn parse(path: &Path) -> Result<OebBook, ConversionError> {
    let path_buf = path.to_path_buf();
    common::block_on(async move {
        match parse_with_pdf_extract(&path_buf).await {
            Ok(book) => Ok(book),
            Err(pdf_extract_err) => {
                log::warn!(
                    "[PDF→EPUB] pdf-extract parse failed ({}), falling back to pdftohtml pipeline",
                    pdf_extract_err
                );
                crate::conversion::pdf::parse(&path_buf, None).await
            }
        }
    })?
}

/// Pure-Rust path: per-page text extraction → line-based chapter detection.
///
/// Both pdf-extract calls are file-backed (`Document::load` internally) and
/// the cover pass parses the PDF separately via lopdf — the two parses are
/// sequential, so peak memory is one document, never two plus a raw byte
/// buffer held by us.
async fn parse_with_pdf_extract(path: &Path) -> Result<OebBook, ConversionError> {
    // One String per page (best for heading detection); fall back to a
    // single "page" if the per-page API rejects the document.
    let pages: Vec<String> = pdf_extract::extract_text_by_pages(path)
        .or_else(|_| pdf_extract::extract_text(path).map(|t| vec![t]))
        .map_err(|e| ConversionError::ParseError {
            format: "PDF".to_string(),
            detail: e.to_string(),
        })?;

    if pages.iter().all(|p| p.trim().is_empty()) {
        return Err(ConversionError::EmptyContent);
    }

    let (title, authors, description, language) = extract_book_metadata(path);

    let chapters = split_pages_into_chapters(&pages);

    let mut book = OebBook::new(title);
    book.authors = authors;
    book.language = language;
    book.description = description;
    book.cover_image = extract_cover_image(path);

    for (i, (ch_title, ch_body)) in chapters.into_iter().enumerate() {
        book.chapters.push(OebChapter {
            id: format!("chapter_{:03}", i + 1),
            title: Some(ch_title),
            html: ch_body,
        });
    }

    Ok(book)
}

/// Title/author/description from the PDF Info dict (via metadata_service);
/// falls back to a cleaned filename stem.
fn extract_book_metadata(path: &Path) -> (String, Vec<String>, Option<String>, String) {
    let meta = path
        .to_str()
        .and_then(|s| metadata_service::extract_from_file(s).ok());

    let title = meta
        .as_ref()
        .and_then(|m| m.title.as_ref())
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty() && t != "Unknown")
        .or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.replace('_', " ").replace('-', " "))
        })
        .unwrap_or_else(|| "Untitled".to_string());

    let authors = meta.as_ref().map(|m| m.authors.clone()).unwrap_or_default();
    let description = meta.as_ref().and_then(|m| m.description.clone());
    let language = meta
        .as_ref()
        .and_then(|m| m.language.clone())
        .filter(|l| !l.trim().is_empty())
        .unwrap_or_else(|| "en".to_string());

    (title, authors, description, language)
}

// ──────────────────────────────────────────────────────────────────────────
// CHAPTER DETECTION
// ──────────────────────────────────────────────────────────────────────────

/// Split per-page text into (title, body-html) chapters.
///
/// Rules:
/// - A heading is a SINGLE short line — body text can never join a title.
/// - "Chapter N" lines (numbers, roman numerals or spelled-out numbers) are
///   strong headings on any page.
/// - Title-case/all-caps short lines (e.g. "THE BRIAR CLUB", "Dedication")
///   are weak headings: only on pages after the first, only when followed by
///   a blank line, and never when they end with ':'/';'/','.
/// - Bare numerals ("2", "IV", "Two") are headings only when followed by a
///   blank line AND real body content (protects against page-number footers).
/// - The first page only yields "Chapter N" headings (the book title page
///   must not become a chapter).
/// - Content before the first heading merges into the first chapter; pages
///   without headings merge into the previous chapter. If no heading exists
///   at all, falls back to ~5-page chunks titled "Page N".
fn split_pages_into_chapters(pages: &[String]) -> Vec<(String, String)> {
    let mut chapters: Vec<(String, String)> = Vec::new();
    let mut current_title: Option<String> = None;
    let mut current_body: Vec<String> = Vec::new();
    let mut front_matter: Vec<String> = Vec::new();

    for (page_idx, page) in pages.iter().enumerate() {
        let lines: Vec<&str> = page.lines().collect();
        let n = lines.len();
        let mut i = 0;
        while i < n {
            let t = lines[i].trim();
            if t.is_empty() {
                i += 1;
                continue;
            }

            let blank_after = lines.get(i + 1).is_some_and(|l| l.trim().is_empty());

            let next_nonempty = next_nonempty_line(&lines, i + 1);
            if is_heading_line(t, page_idx, blank_after, next_nonempty) {
                if let Some(title) = current_title.take() {
                    chapters.push((title, current_body.join("\n")));
                    current_body.clear();
                }
                let title = normalize_heading_title(t);
                current_title = Some(title.clone());
                // Front matter (title page etc.) becomes part of the first chapter.
                current_body.append(&mut front_matter);
                current_body.push(format!("  <h2>{}</h2>", escape_xml(&title)));
                i += 1;
                continue;
            }

            // Accumulate a paragraph: this line plus following non-empty
            // lines. STOP at a heading line — PDF text extraction often has
            // no blank line between heading and body, and a preceding line
            // (drop cap, page furniture) would otherwise swallow the heading.
            let mut para = String::from(t);
            i += 1;
            while i < n && !lines[i].trim().is_empty() {
                let nt = lines[i].trim();
                let n_blank_after = lines.get(i + 1).is_some_and(|l| l.trim().is_empty());
                let n_next = next_nonempty_line(&lines, i + 1);
                if is_heading_line(nt, page_idx, n_blank_after, n_next) {
                    break;
                }
                para.push(' ');
                para.push_str(nt);
                i += 1;
            }
            let html = format!("  <p>{}</p>", escape_xml(&para));
            if current_title.is_some() {
                current_body.push(html);
            } else {
                front_matter.push(html);
            }
        }
    }

    if let Some(title) = current_title.take() {
        chapters.push((title, current_body.join("\n")));
    }

    if chapters.is_empty() {
        return chunk_pages_into_chapters(pages);
    }

    chapters
}

/// Is this single line a chapter-heading candidate?
fn next_nonempty_line<'a>(lines: &'a [&'a str], from: usize) -> Option<&'a str> {
    lines[from..]
        .iter()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
}

fn is_heading_line(
    t: &str,
    page_idx: usize,
    blank_after: bool,
    next_nonempty: Option<&str>,
) -> bool {
    if t.is_empty() || t.len() > MAX_HEADING_LEN || utils::is_scene_break(t) {
        return false;
    }

    if !t.chars().any(|c| c.is_alphabetic()) {
        // Bare numeral: only when followed by a blank line AND real body
        // content (avoids page-number footers becoming headings).
        // (No MIN_HEADING_LEN here — "1" and "I" are valid headings.)
        return blank_after && next_nonempty.is_some() && BARE_NUMERAL_RE.is_match(t);
    }

    if t.len() < MIN_HEADING_LEN {
        return false;
    }

    // "Chapter N …" — strong on any page, no blank line required.
    if CHAPTER_RE.is_match(t) {
        return true;
    }

    // Weak (title-case / all-caps) candidates:
    // - must be followed by a blank line (the brief's "short sentence"
    //   heuristic; also keeps list items / playlist entries out),
    // - on the first page, reject title-page lines ("Sample Book" followed
    //   by "by Author" / "Copyright …"); other weak candidates may be real
    //   headings ("Playlist", "Dedication" on early pages),
    // - must not end with a colon/semicolon/comma.
    if !blank_after {
        return false;
    }
    let last = t.chars().last().unwrap_or(' ');
    if matches!(last, ':' | ';' | ',') {
        return false;
    }
    if page_idx == 0 {
        if let Some(next) = next_nonempty {
            let nl = next.to_lowercase();
            let author_like = [
                "by ",
                "written by",
                "edited by",
                "illustrated by",
                "translated by",
                "published by",
                "copyright",
            ];
            if author_like.iter().any(|p| nl.starts_with(p)) {
                return false;
            }
        }
    }
    // Dash-separated list items ("Song- Artist", "Item- Note") look
    // title-case but are body text; real headings use the CHAPTER_RE or
    // keyword paths above.
    if DASH_LIST_RE.is_match(t) {
        return false;
    }
    is_title_case(t)
}

/// Dash-separated list items ("Song- Artist") — title-case but body text.
static DASH_LIST_RE: once_cell::sync::Lazy<regex::Regex> =
    once_cell::sync::Lazy::new(|| regex::Regex::new(r"\w-\s").unwrap());

/// Every word must start with an uppercase letter (or be non-alphabetic,
/// e.g. "©", "2025"), with at most 10 words. Body sentences contain
/// lowercase-initial words and therefore fail this test.
fn is_title_case(t: &str) -> bool {
    let words: Vec<&str> = t.split_whitespace().collect();
    if words.is_empty() || words.len() > 10 {
        return false;
    }
    words.iter().all(|w| {
        w.chars()
            .find(|c| c.is_alphabetic())
            .is_none_or(|c| c.is_uppercase())
    })
}

/// Normalize a heading line into a display title:
/// - "Chapter 2", "CHAPTER 2", "Chapter 1:" → "Chapter 2"
/// - "2", "IV", "Two" → "Chapter 2" / "Chapter IV" / "Chapter Two"
/// - anything else → the line itself, trimmed.
fn normalize_heading_title(t: &str) -> String {
    let t = t.trim().trim_end_matches(['.', ':']).trim();
    let lower = t.to_lowercase();
    if lower.starts_with("chapter") {
        let rest = t[7..].trim();
        if !rest.is_empty() {
            return format!("Chapter {}", rest);
        }
    }
    if BARE_NUMERAL_RE.is_match(t) || WORD_NUMERAL_RE.is_match(t) {
        return format!("Chapter {}", t);
    }
    t.to_string()
}

/// Fallback when the document has no headings at all: one chapter per
/// ~5-page chunk, titled "Page N".
fn chunk_pages_into_chapters(pages: &[String]) -> Vec<(String, String)> {
    const CHUNK_SIZE: usize = 5;
    let mut chapters: Vec<(String, String)> = Vec::new();

    for (chunk_idx, chunk) in pages.chunks(CHUNK_SIZE).enumerate() {
        let mut body: Vec<String> = Vec::new();
        for page in chunk {
            let lines: Vec<&str> = page.lines().collect();
            let n = lines.len();
            let mut i = 0;
            while i < n {
                if lines[i].trim().is_empty() {
                    i += 1;
                    continue;
                }
                let mut para = String::from(lines[i].trim());
                i += 1;
                while i < n && !lines[i].trim().is_empty() {
                    para.push(' ');
                    para.push_str(lines[i].trim());
                    i += 1;
                }
                body.push(format!("  <p>{}</p>", escape_xml(&para)));
            }
        }
        if body.is_empty() {
            continue;
        }
        let first_page = chunk_idx * CHUNK_SIZE + 1;
        chapters.push((format!("Page {}", first_page), body.join("\n")));
    }

    if chapters.is_empty() {
        chapters.push(("Document".to_string(), String::new()));
    }
    chapters
}

// ──────────────────────────────────────────────────────────────────────────
// COVER (BONUS)
// ──────────────────────────────────────────────────────────────────────────

/// Extract a JPEG cover from the first pages' XObjects (lopdf). Returns
/// `None` when the PDF has no embedded raster cover or the scan fails —
/// the EPUB builder simply omits the cover page then.
fn extract_cover_image(path: &Path) -> Option<OebImage> {
    let doc = lopdf::Document::load(path).ok()?;
    for (_, object_id) in doc.get_pages().into_iter().take(3) {
        // Tolerant per-page scan: a page without Resources/XObjects just
        // moves us on to the next page (mirrors the legacy cover logic).
        let page_dict = match doc
            .get_object(object_id)
            .ok()
            .and_then(|o| o.as_dict().ok())
        {
            Some(d) => d.clone(),
            None => continue,
        };
        let resources = page_dict
            .get(b"Resources")
            .ok()
            .and_then(|obj| match obj {
                lopdf::Object::Reference(id) => doc.get_object(*id).ok(),
                _ => Some(obj),
            })
            .and_then(|o| o.as_dict().ok().cloned())
            .unwrap_or(page_dict);
        let xobjects = match resources.get(b"XObject") {
            Ok(lopdf::Object::Reference(id)) => {
                match doc.get_object(*id).ok().and_then(|o| o.as_dict().ok()) {
                    Some(d) => d.clone(),
                    None => continue,
                }
            }
            Ok(lopdf::Object::Dictionary(d)) => d.clone(),
            _ => continue,
        };
        for (_key, xobj_ref) in xobjects.iter() {
            let Some(stream) = xobj_ref
                .as_reference()
                .ok()
                .and_then(|id| doc.get_object(id).ok())
                .and_then(|o| match o {
                    lopdf::Object::Stream(s) => Some(s),
                    _ => None,
                })
            else {
                continue;
            };
            let is_jpeg = stream
                .dict
                .get(b"Filter")
                .and_then(|obj| match obj {
                    lopdf::Object::Name(n) => Ok(vec![n.to_vec()]),
                    lopdf::Object::Array(arr) => {
                        let mut names = vec![];
                        for item in arr {
                            if let Ok(n) = item.as_name() {
                                names.push(n.to_vec());
                            }
                        }
                        Ok(names)
                    }
                    _ => Err(lopdf::Error::Header),
                })
                .map(|filters| filters.iter().any(|f| f == b"DCTDecode"))
                .unwrap_or(false);
            if is_jpeg {
                return Some(OebImage {
                    id: "cover_img".to_string(),
                    filename: "cover.jpg".to_string(),
                    mime_type: "image/jpeg".to_string(),
                    source: crate::conversion::oeb::ImageSource::Bytes(stream.content.clone()),
                });
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pages_of(lines: &[&str]) -> Vec<String> {
        vec![lines.join("\n")]
    }

    #[test]
    fn detects_chapter_lines_without_swallowing_body() {
        let pages = pages_of(&[
            "Sample Book",
            "by Test Author",
            "",
            "Chapter One",
            "",
            "Once upon a time there was a test book with enough text to paginate.",
            "consectetur adipiscing elit.",
            "",
            "Chapter Two",
            "",
            "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
        ]);
        let chapters = split_pages_into_chapters(&pages);
        assert_eq!(chapters.len(), 2, "expected 2 chapters");
        assert_eq!(chapters[0].0, "Chapter One");
        assert_eq!(chapters[1].0, "Chapter Two");
        // Body text must never appear inside a title.
        assert!(!chapters[0].0.contains("Once upon"));
        assert!(!chapters[1].0.contains("Sed do eiusmod"));
        // Front matter merges into the first chapter.
        assert!(chapters[0].1.contains("Sample Book"));
        assert!(chapters[0].1.contains("Once upon a time"));
    }

    #[test]
    fn first_page_only_yields_chapter_lines() {
        // "Sample Book" is title-case but on page 1 → must NOT be a heading.
        let pages = vec![
            "Sample Book\n\nby Test Author\n\nChapter One\n\nOnce upon a time.".to_string(),
            "Dedication\n\nFor all the girls.".to_string(),
        ];
        let chapters = split_pages_into_chapters(&pages);
        assert_eq!(chapters.len(), 2, "expected Chapter One + Dedication");
        assert_eq!(chapters[0].0, "Chapter One");
        assert_eq!(chapters[1].0, "Dedication");
    }

    #[test]
    fn weak_headings_need_blank_line_and_title_case() {
        // List items in a run must not become headings.
        let pages = pages_of(&[
            "Playlist",
            "",
            "Teacher's Pet- Melanie Martinez",
            "Cigarette- Shaya Zamora",
            "Daddy Issues- The Neighbourhood",
            "",
            "Dedication",
            "",
            "For all the girls.",
        ]);
        let chapters = split_pages_into_chapters(&pages);
        assert_eq!(chapters.len(), 2, "expected Playlist + Dedication");
        assert_eq!(chapters[0].0, "Playlist");
        assert_eq!(chapters[1].0, "Dedication");
        assert!(!chapters[0].1.contains("Teacher's Pet- Melanie Martinez"));
    }

    #[test]
    fn chapter_lines_work_without_blank_lines() {
        // Real novels often have no blank line between heading and body.
        let pages = pages_of(&[
            "S",
            "Chapter 1",
            "Anastasia",
            "pokehaven University.",
            "My one shot at doing something right in my life.",
        ]);
        let chapters = split_pages_into_chapters(&pages);
        assert_eq!(chapters.len(), 1, "expected 1 chapter");
        assert_eq!(chapters[0].0, "Chapter 1");
        assert!(chapters[0].1.contains("Anastasia"));
        // Drop cap "S" must not become a heading.
        assert!(!chapters[0].1.contains("<h2>S</h2>"));
    }

    #[test]
    fn bare_numerals_become_chapter_titles() {
        let pages = pages_of(&["1", "", "Some body text here.", "and more text."]);
        let chapters = split_pages_into_chapters(&pages);
        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].0, "Chapter 1");

        let pages = pages_of(&["Two", "", "Some body text here.", "and more text."]);
        let chapters = split_pages_into_chapters(&pages);
        assert_eq!(chapters[0].0, "Chapter Two");
    }

    #[test]
    fn page_number_footers_are_not_headings() {
        // A bare page number at the bottom of a page (no body after it)
        // must not become a heading — it falls through to the chunk fallback.
        let pages = pages_of(&["Some body text.", "more text.", "13"]);
        let chapters = split_pages_into_chapters(&pages);
        assert_eq!(chapters.len(), 1, "no headings → chunk fallback");
        assert_eq!(chapters[0].0, "Page 1");
    }

    #[test]
    fn no_headings_falls_back_to_page_chunks() {
        let pages: Vec<String> = (0..12)
            .map(|i| format!("Page {} body text line.\nMore text here.", i + 1))
            .collect();
        let chapters = split_pages_into_chapters(&pages);
        assert_eq!(chapters.len(), 3, "12 pages / 5 per chunk = 3 chunks");
        assert_eq!(chapters[0].0, "Page 1");
        assert_eq!(chapters[1].0, "Page 6");
        assert_eq!(chapters[2].0, "Page 11");
    }

    #[test]
    fn normalize_titles() {
        assert_eq!(normalize_heading_title("Chapter One"), "Chapter One");
        assert_eq!(normalize_heading_title("CHAPTER 1"), "Chapter 1");
        assert_eq!(normalize_heading_title("Chapter 1:"), "Chapter 1");
        assert_eq!(
            normalize_heading_title("Chapter 2: The Truth"),
            "Chapter 2: The Truth"
        );
        assert_eq!(normalize_heading_title("IV"), "Chapter IV");
        assert_eq!(normalize_heading_title("Two"), "Chapter Two");
        assert_eq!(normalize_heading_title("The Briar Club"), "The Briar Club");
    }
}
