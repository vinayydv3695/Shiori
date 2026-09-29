/// TXT / RTF → OEB parser.
///
/// Delegates to the legacy `crate::conversion::txt::parse` pipeline, which
/// detects paragraph mode (markdown / formatted / unformatted), handles
/// encoding detection and splits chapters with heading heuristics
/// (`Chapter One`, `PART II`, all-caps lines, …; blank-line paragraphs merge
/// into the current chapter).
///
/// A post-pass then fixes the legacy title/chapter behaviour:
/// - the book title comes from the first non-empty line when it reads like a
///   title page ("Sample Book" directly followed by "by Test Author"); that
///   front matter is excluded from the first chapter body;
/// - a placeholder first chapter ("Chapter 1" / "Full Text") that only held
///   front matter is dropped; a surviving placeholder first chapter is
///   retitled with the book title;
/// - empty chapters are removed and ids renumbered;
/// - trailing junk paragraphs (page numbers like "42", "- 42 -", "Page 42")
///   are dropped from the last chapter.
use std::path::Path;

use crate::conversion::error::ConversionError;
use crate::conversion::formats::common;
use crate::conversion::oeb::{OebBook, OebChapter};
use crate::conversion::utils;

/// Parse a TXT/RTF file into an OebBook.
pub fn parse(path: &Path) -> Result<OebBook, ConversionError> {
    let path_buf = path.to_path_buf();
    let mut book =
        common::block_on(async move { crate::conversion::txt::parse(&path_buf).await })??;

    // Drop trailing junk (page numbers etc.) from the last chapter.
    strip_trailing_junk(&mut book);

    // Title-page front matter: "Sample Book" + "by Test Author" must become
    // book metadata, not the first chapter's body.
    let front_matter = detect_front_matter(&book.chapters);
    if let Some(fm) = &front_matter {
        book.title = fm.title.clone();
        if book.authors.is_empty() {
            if let Some(a) = &fm.author {
                book.authors.push(a.clone());
            }
        }
        if let Some(ch0) = book.chapters.first_mut() {
            ch0.html = strip_front_matter(&ch0.html, &fm.line1, fm.line2.as_deref());
        }
    }

    // A surviving placeholder first chapter (heading-less book) is retitled
    // with the book title so the TOC does not show a generated label.
    if let Some(ch0) = book.chapters.first_mut() {
        if !ch0.html.trim().is_empty()
            && placeholder_title(ch0.title.as_deref())
            && !body_starts_with_heading(&ch0.html)
        {
            ch0.title = Some(book.title.clone());
        }
    }

    finalize_chapters(&mut book);
    Ok(book)
}

// ──────────────────────────────────────────────────────────────────────────
// TITLE / FRONT-MATTER POST-PROCESSING
// ──────────────────────────────────────────────────────────────────────────

/// Front matter detected at the start of the book: a title line/paragraph and
/// an optional "by …" author line, together with the exact HTML lines to
/// remove from the first chapter body.
struct FrontMatter {
    title: String,
    author: Option<String>,
    line1: String,
    line2: Option<String>,
}

/// Detect a title-page block in the first chapter. Only fires when the legacy
/// pipeline left a generated placeholder title ("Chapter 1" / "Full Text"),
/// i.e. body content preceded the first heading.
fn detect_front_matter(chapters: &[OebChapter]) -> Option<FrontMatter> {
    let ch0 = chapters.first()?;
    if !placeholder_title(ch0.title.as_deref()) {
        return None;
    }
    if body_starts_with_heading(&ch0.html) {
        return None;
    }
    let paras = first_paragraphs(&ch0.html);
    let (p1, l1) = paras.first()?;
    if !title_candidate(p1) {
        return None;
    }
    let (p2, l2) = paras.get(1)?;
    let author = author_from_by_line(p2)?;
    Some(FrontMatter {
        title: p1.clone(),
        author: Some(author),
        line1: l1.clone(),
        line2: Some(l2.clone()),
    })
}

/// A title candidate: short (≤ 60 chars), no sentence-ending punctuation,
/// and not a chapter/section heading (keyword, all-caps or numbered).
fn title_candidate(text: &str) -> bool {
    let t = text.trim();
    !t.is_empty()
        && t.chars().count() <= 60
        && !(t.ends_with('.')
            || t.ends_with('!')
            || t.ends_with('?')
            || t.ends_with(':')
            || t.ends_with(';')
            || t.ends_with('…'))
        && !utils::looks_like_heading(t)
}

/// "by Test Author" → Some("Test Author") (case-insensitive "by " prefix).
fn author_from_by_line(text: &str) -> Option<String> {
    let t = text.trim();
    if t.get(..3).map_or(true, |p| !p.eq_ignore_ascii_case("by ")) {
        return None;
    }
    let author = t[3..].trim();
    if author.is_empty() {
        None
    } else {
        Some(author.to_string())
    }
}

/// First non-empty `<p>` paragraphs of a chapter body as (plain text, exact
/// trimmed HTML line). Heading elements are skipped.
fn first_paragraphs(html: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for line in html.lines() {
        let t = line.trim();
        if t.starts_with("<h1")
            || t.starts_with("<h2")
            || t.starts_with("<h3")
            || t.starts_with("<h4")
            || t.starts_with("<h5")
            || t.starts_with("<h6")
        {
            continue;
        }
        if let Some(inner) = t.strip_prefix("<p>").and_then(|s| s.strip_suffix("</p>")) {
            let plain = utils::strip_html_tags(inner).trim().to_string();
            if !plain.is_empty() {
                out.push((plain, t.to_string()));
            }
        }
    }
    out
}

/// Remove the two front-matter lines from the leading paragraphs of a chapter
/// body. Later occurrences of the same text are kept.
fn strip_front_matter(html: &str, line1: &str, line2: Option<&str>) -> String {
    let mut pending: Option<&str> = Some(line1);
    let mut out = String::new();
    for line in html.lines() {
        let t = line.trim();
        let drop = match pending {
            Some(want) if !t.is_empty() && t == want => {
                // Advance: line1 → line2 → done (line1 == line2 → done).
                pending = if want == line1 && line2.is_some() && line2 != Some(line1) {
                    line2
                } else {
                    None
                };
                true
            }
            Some(_) if !t.is_empty() => {
                // First non-front-matter paragraph reached — stop stripping.
                pending = None;
                false
            }
            _ => false,
        };
        if !drop {
            out.push_str(line);
            out.push('\n');
        }
    }
    out
}

/// True for generated placeholder chapter titles ("Chapter 1", "Full Text",
/// "Document", "Untitled") that never make good book titles.
fn placeholder_title(title: Option<&str>) -> bool {
    let Some(t) = title else {
        return true;
    };
    let lower = t.trim().to_lowercase();
    if matches!(lower.as_str(), "full text" | "document" | "untitled") {
        return true;
    }
    if let Some(rest) = lower.strip_prefix("chapter ") {
        if !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()) {
            return true;
        }
    }
    false
}

/// Whether a chapter body opens with a real (authored) heading element.
fn body_starts_with_heading(html: &str) -> bool {
    let t = html.trim_start();
    t.starts_with("<h1")
        || t.starts_with("<h2")
        || t.starts_with("<h3")
        || t.starts_with("<h4")
        || t.starts_with("<h5")
        || t.starts_with("<h6")
}

/// Drop empty chapters, renumber ids sequentially, and guarantee at least
/// one chapter exists.
/// Drop empty chapters, merge consecutive chapters with the same title (a
/// book's own TOC list + the real headings produce duplicate titles — the
/// later duplicate's body folds into the first), renumber ids sequentially,
/// and guarantee at least one chapter exists.
fn finalize_chapters(book: &mut OebBook) {
    let mut merged: Vec<OebChapter> = Vec::with_capacity(book.chapters.len());
    for ch in book.chapters.drain(..) {
        let ch_title = ch.title.as_deref().map(title_key).unwrap_or_default();
        let duplicate = merged
            .last()
            .map(|p| p.title.as_deref().map(title_key) == Some(ch_title.clone()))
            .unwrap_or(false);
        if duplicate {
            if std::env::var("SHIORI_DBG_TXT").is_ok() {
                eprintln!("[txt] SAME-TITLE MERGE: {:?}", ch.title);
            }
            let prev = merged.last_mut().unwrap();
            if !prev.html.trim().is_empty() && !ch.html.trim().is_empty() {
                prev.html.push('\n');
            }
            if !ch.html.trim().is_empty() {
                prev.html.push_str(&ch.html);
            }
        } else {
            merged.push(ch);
        }
    }
    merged.retain(|ch| !ch.html.trim().is_empty());
    book.chapters = merged;
    dedupe_toc_stubs(book);
    for (i, ch) in book.chapters.iter_mut().enumerate() {
        ch.id = format!("chapter_{:03}", i + 1);
    }
    if book.chapters.is_empty() {
        book.chapters.push(OebChapter {
            id: "chapter_001".to_string(),
            title: Some(book.title.clone()),
            html: "<p>&#160;</p>".to_string(),
        });
    }
}

/// Canonical key for duplicate-title comparison: lowercase, trailing
/// punctuation/brackets and trailing page-number tokens stripped, whitespace
/// collapsed — so the TOC's "Chapter I.]" and the real "CHAPTER I." compare
/// equal.
fn title_key(title: &str) -> String {
    let mut t = title.trim().to_lowercase();
    while t.ends_with(|c: char| c.is_ascii_punctuation() || c == ']' || c == '[' || c == ')') {
        t.pop();
    }
    // Strip a trailing bare page number (" 12") — but only when the word
    // before it is NOT a chapter keyword, otherwise "Chapter 2" would
    // collapse into "chapter" and merge with "Chapter 1".
    let words: Vec<&str> = t.split_whitespace().collect();
    if let Some(last) = words.last() {
        let prev_is_keyword = words.len() >= 2
            && matches!(
                words[words.len() - 2],
                "chapter" | "letter" | "part" | "book" | "section" | "act" | "scene"
                    | "lesson" | "volume" | "adventure" | "canto" | "prologue"
                    | "epilogue" | "appendix" | "preface" | "introduction"
                    | "глава" | "kapitel" | "chapitre" | "capítulo" | "capitulo"
                    | "kapitola"
            );
        if !prev_is_keyword && last.chars().all(|c| c.is_ascii_digit()) {
            t = words[..words.len() - 1].join(" ").trim_end().to_string();
        }
    }
    t.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// A book's own table of contents produces short stub chapters bearing the
/// same titles as the real chapters further on (Moby Dick, Frankenstein,
/// Pride & Prejudice all have this). A stub is a chapter whose title repeats
/// elsewhere, whose body is short, and whose twin holds real content (≥10x
/// larger or ≥ 500 chars). The stub is dropped, the twin stays.
fn dedupe_toc_stubs(book: &mut OebBook) {
    use std::collections::HashMap;
    let mut longest: HashMap<String, usize> = HashMap::new();
    let mut counts: HashMap<String, usize> = HashMap::new();
    for ch in &book.chapters {
        let Some(title) = ch.title.as_deref().map(title_key) else {
            continue;
        };
        let len = ch.html.len();
        let e = longest.entry(title.clone()).or_insert(0);
        *e = (*e).max(len);
        *counts.entry(title).or_insert(0) += 1;
    }
    book.chapters.retain(|ch| {
        let Some(title) = ch.title.as_deref().map(title_key) else {
            return true;
        };
        let repeated = counts.get(&title).copied().unwrap_or(0) > 1;
        if !repeated {
            return true;
        }
        let len = ch.html.len();
        let twins_longest = longest.get(&title).copied().unwrap_or(0);
        let stub = len < 200 && (twins_longest >= 500 || twins_longest >= len * 10) && twins_longest != len;
        if stub && std::env::var("SHIORI_DBG_TXT").is_ok() {
            eprintln!("[txt] STUB DROP: {:?} len={} twin={}", ch.title, len, twins_longest);
        }
        !stub
    });
}

// ──────────────────────────────────────────────────────────────────────────
// TRAILING JUNK (page numbers etc.)
// ──────────────────────────────────────────────────────────────────────────

/// Drop trailing junk paragraphs (page numbers like "42", "- 42 -",
/// "Page 42") from the last chapter body.
fn strip_trailing_junk(book: &mut OebBook) {
    let Some(last) = book.chapters.last_mut() else {
        return;
    };
    let lines: Vec<String> = last.html.lines().map(|l| l.to_string()).collect();
    let mut end = lines.len();
    while end > 0 {
        let t = lines[end - 1].trim();
        let junk = match t.strip_prefix("<p>").and_then(|s| s.strip_suffix("</p>")) {
            Some(inner) => is_junk_line(utils::strip_html_tags(inner).trim()),
            None => false,
        };
        if !junk {
            break;
        }
        end -= 1;
    }
    last.html = lines[..end].join("\n");
}

/// Page-number-ish line: "42", "- 42 -", "(42)", "Page 42", "p. 42", …
fn is_junk_line(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return true;
    }
    if t.chars().count() > 16 {
        return false;
    }
    let lower = t.to_lowercase();
    let page_label = ["page ", "p. ", "pg. "].iter().any(|prefix| {
        lower.strip_prefix(prefix).map_or(false, |rest| {
            let rest = rest.trim();
            !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())
        })
    });
    let bare_number = t.chars().any(|c| c.is_ascii_digit())
        && t.chars().all(|c| {
            c.is_ascii_digit()
                || c.is_whitespace()
                || matches!(c, '.' | ',' | '-' | '—' | '–' | '(' | ')' | '·' | '|')
        });
    page_label || bare_number
}

#[cfg(test)]
mod stub_tests {
    use crate::conversion::oeb::{OebBook, OebChapter};

    fn book_with(titles: &[&str], lens: &[usize]) -> OebBook {
        let mut b = OebBook::new("t");
        for (i, (t, l)) in titles.iter().zip(lens).enumerate() {
            b.chapters.push(OebChapter {
                id: format!("c{i}"),
                title: Some(t.to_string()),
                html: format!("<p>{}</p>", "x".repeat(*l)),
            });
        }
        b
    }

    #[test]
    fn toc_stub_variant_titles_dedupe() {
        // TOC "Chapter I.]" (short stub) + real "CHAPTER I." (long body).
        let mut b = book_with(
            &["Chapter I.]", "CHAPTER I.", "Chapter II.", "CHAPTER II."],
            &[30, 900, 30, 900],
        );
        super::dedupe_toc_stubs(&mut b);
        assert_eq!(b.chapters.len(), 2, "stubs must be dropped: {:?}", b.chapters.iter().map(|c| c.title.clone()).collect::<Vec<_>>());
    }

    #[test]
    fn title_key_normalizes() {
        assert_eq!(super::title_key("  Chapter I.] "), "chapter i");
        assert_eq!(super::title_key("CHAPTER 12."), "chapter 12");
        assert_eq!(super::title_key("Letter 1"), "letter 1");
    }
}



