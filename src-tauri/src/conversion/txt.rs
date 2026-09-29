/// TXT → EPUB converter inspired by calibre's txt/processor.py.
///
/// Supports three paragraph modes:
/// - Markdown: >30% of lines start with # * - > [
/// - Formatted: blank lines separate paragraphs
/// - Unformatted: hard line breaks everywhere, needs unwrapping
///
/// Also: encoding detection, chapter detection, scene breaks, smart quotes.
use std::path::Path;

use super::oeb::{OebBook, OebChapter};
use super::utils;
use super::ConversionError;

/// Parse a TXT file into an OebBook.
pub async fn parse(source: &Path) -> Result<OebBook, ConversionError> {
    let raw = tokio::fs::read(source).await?;
    let (mut text, enc_label, enc_score) = utils::decode_text_scored(&raw);
    let mut book = OebBook::new("Untitled");
    book.report.note_heuristic(&format!("encoding:{}", enc_label));
    if enc_score >= 0.9 {
        book.report.info(
            "encoding_detected",
            format!("Detected encoding {} (confidence {:.2}).", enc_label, enc_score),
        );
    } else {
        book.report.warn(
            "encoding_guess",
            format!(
                "Encoding uncertain (best guess {} at {:.2}); some characters may be wrong.",
                enc_label, enc_score
            ),
        );
    }
    // Language inference from the detected charset (zero-tuning CJK/Cyrillic).
    let inferred_lang = match enc_label.as_str() {
        "shift_jis" | "euc-jp" => Some("ja"),
        "gbk" | "big5" => Some("zh"),
        "euc-kr" => Some("ko"),
        "koi8-r" | "windows-1251" | "iso-8859-5" => Some("ru"),
        "windows-1256" => Some("ar"),
        "iso-8859-7" => Some("el"),
        "iso-8859-2" => Some("cs"),
        _ => None,
    };
    if let Some(lang) = inferred_lang {
        book.language = lang.to_string();
        book.report.info(
            "language_inferred",
            format!("Inferred language \"{}\" from the encoding.", lang),
        );
    }

    // Lightweight RTF unwrap: `{\rtf…}` sources arrive here via the .rtf
    // mapping; pull plain text out instead of leaking control words.
    if text.trim_start().starts_with("{\\rtf") || text.trim_start().starts_with("{\\rtf1") {
        text = utils::rtf_to_text(&text);
        book.report.note_heuristic("rtf-unwrap");
    }
    let text = utils::normalize_line_endings(&text);

    // Detect format style
    let mode = detect_text_mode(&text);
    log::info!(
        "[TXT→EPUB] Detected mode: {:?} for {}",
        mode,
        source.display()
    );

    // Convert to HTML based on mode
    let html = match mode {
        TextMode::Markdown => markdown_to_html(&text),
        TextMode::Formatted => formatted_to_html(&text),
        TextMode::Unformatted => unformatted_to_html(&text),
    };

    // Split into chapters
    let chapters = split_into_chapters(&html);

    // Infer title from filename
    let title = source
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.replace('_', " ").replace('-', " "))
        .unwrap_or_else(|| "Untitled".to_string());
    book.title = title;

    for (i, (ch_title, ch_body)) in chapters.into_iter().enumerate() {
        let id = format!("chapter_{:03}", i + 1);
        book.chapters.push(OebChapter {
            id,
            title: Some(ch_title),
            html: ch_body,
        });
    }

    Ok(book)
}

// ──────────────────────────────────────────────────────────────────────────
// TEXT MODE DETECTION
// ──────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy)]
enum TextMode {
    Markdown,
    Formatted,
    Unformatted,
}

fn detect_text_mode(text: &str) -> TextMode {
    let lines: Vec<&str> = text.lines().take(200).collect();
    if lines.is_empty() {
        return TextMode::Formatted;
    }

    // Markdown detection: >30% of non-empty lines start with markdown markers
    let non_empty: Vec<&&str> = lines.iter().filter(|l| !l.trim().is_empty()).collect();
    if !non_empty.is_empty() {
        let md_count = non_empty
            .iter()
            .filter(|l| {
                let t = l.trim();
                t.starts_with('#')
                    || t.starts_with("* ")
                    || t.starts_with("- ")
                    || t.starts_with("> ")
                    || t.starts_with("```")
                    || t.starts_with("1.")
                    || t.starts_with("[ ")
                    || t.starts_with("[^")
            })
            .count();
        if md_count as f64 / non_empty.len() as f64 > 0.3 {
            return TextMode::Markdown;
        }
    }

    // Formatted vs unformatted: check for blank-line paragraph separators
    let blank_lines = lines.iter().filter(|l| l.trim().is_empty()).count();
    let ratio = blank_lines as f64 / lines.len() as f64;

    if ratio > 0.05 {
        TextMode::Formatted
    } else {
        TextMode::Unformatted
    }
}

// ──────────────────────────────────────────────────────────────────────────
// MARKDOWN CONVERSION
// ──────────────────────────────────────────────────────────────────────────

fn markdown_to_html(text: &str) -> String {
    use pulldown_cmark::{html, Options, Parser};

    let options = Options::ENABLE_TABLES
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_HEADING_ATTRIBUTES;
    let parser = Parser::new_ext(text, options);

    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

// ──────────────────────────────────────────────────────────────────────────
// FORMATTED TEXT (blank-line paragraphs)
// ──────────────────────────────────────────────────────────────────────────

fn formatted_to_html(text: &str) -> String {
    let text = utils::smart_quotes(text);
    let mut html = String::new();
    let mut para = String::new();

    for line in text.lines() {
        if line.trim().is_empty() {
            if !para.trim().is_empty() {
                if utils::is_scene_break(para.trim()) {
                    html.push_str("  <hr class=\"scene-break\"/>\n");
                } else {
                    html.push_str(&format!(
                        "  <p>{}</p>\n",
                        super::oeb::escape_xml(para.trim())
                    ));
                }
                para.clear();
            }
        } else {
            if !para.is_empty() {
                para.push(' ');
            }
            para.push_str(line.trim());
        }
    }
    // Last paragraph
    if !para.trim().is_empty() {
        html.push_str(&format!(
            "  <p>{}</p>\n",
            super::oeb::escape_xml(para.trim())
        ));
    }
    html
}

// ──────────────────────────────────────────────────────────────────────────
// UNFORMATTED TEXT (hard line breaks — needs unwrapping)
// ──────────────────────────────────────────────────────────────────────────

fn unformatted_to_html(text: &str) -> String {
    let text = utils::smart_quotes(text);
    let lines: Vec<&str> = text.lines().collect();

    // Compute median line length for unwrapping heuristic
    let mut lengths: Vec<usize> = lines
        .iter()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.len())
        .collect();
    lengths.sort_unstable();
    let median = if lengths.is_empty() {
        80
    } else {
        lengths[lengths.len() / 2]
    };

    let mut html = String::new();
    let mut para = String::new();

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            if !para.trim().is_empty() {
                html.push_str(&format!(
                    "  <p>{}</p>\n",
                    super::oeb::escape_xml(para.trim())
                ));
                para.clear();
            }
            continue;
        }

        if utils::is_scene_break(trimmed) {
            if !para.trim().is_empty() {
                html.push_str(&format!(
                    "  <p>{}</p>\n",
                    super::oeb::escape_xml(para.trim())
                ));
                para.clear();
            }
            html.push_str("  <hr class=\"scene-break\"/>\n");
            continue;
        }

        // Line unwrap heuristic (calibre-style):
        let is_soft_wrap = {
            let next_line = lines.get(i + 1).map(|l| l.trim());
            let ends_with_sentence = trimmed.ends_with('.')
                || trimmed.ends_with('!')
                || trimmed.ends_with('?')
                || trimmed.ends_with(':')
                || trimmed.ends_with('"')
                || trimmed.ends_with('\u{201D}');
            let next_starts_lower = next_line
                .and_then(|l| l.chars().next())
                .map_or(false, |c| c.is_lowercase());

            !ends_with_sentence
                && trimmed.len() > 45
                && line.len() as f64 > median as f64 * 0.85
                && next_starts_lower
        };

        if !para.is_empty() {
            para.push(' ');
        }
        para.push_str(trimmed);

        if !is_soft_wrap {
            html.push_str(&format!(
                "  <p>{}</p>\n",
                super::oeb::escape_xml(para.trim())
            ));
            para.clear();
        }
    }

    if !para.trim().is_empty() {
        html.push_str(&format!(
            "  <p>{}</p>\n",
            super::oeb::escape_xml(para.trim())
        ));
    }

    html
}

// ──────────────────────────────────────────────────────────────────────────
// CHAPTER SPLITTING
// ──────────────────────────────────────────────────────────────────────────

/// Split HTML content into chapters based on heading detection.
fn split_into_chapters(html: &str) -> Vec<(String, String)> {
    // "Chapter N[: Title]", "PART I", "ADVENTURE I. A SCANDAL IN BOHEMIA",
    // "Letter 2", "Volume One", … — a leading book-structure keyword with an
    // optional number/roman numeral and an optional subtitle. The subtitle is
    // kept in the heading, never swallowed into the body.
    static CHAPTER_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(
            r"(?im)^\s*<p>((?:chapter|part|book|prologue|epilogue|introduction|appendix|preface|adventure|letter|volume|section|act|scene|lesson|canto|interlude|afterword|глава|kapitel|chapitre|capítulo|capitulo|kapitola|розділ|partie|шолом|bab|پاره)\s+(?:[0-9]+|[ivxlcdm]+|[а-яё]+|[a-z]+)(?:\s*[.:–—-]?\s*.*)?)</p>\s*$",
        )
        .unwrap()
    });

    // CJK headings: 第1章 / 第一章 / 第一話 / 第一篇 etc.
    static CJK_HEAD_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(
            r"(?im)^\s*<p>(第[^<]{0,12}[章篇話话节節回卷部])</p>\s*$",
        )
        .unwrap()
    });

    // Also match all-caps lines that look like chapter titles
    static CAPS_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r"(?m)^\s*<p>([A-Z][A-Z\s\d]{2,58})</p>\s*$").unwrap()
    });

    // Bare roman numerals ("I.", "XII") and bare numbers ("1.") standing
    // alone as a paragraph — conventional chapter markers in old texts.
    static BARE_NUM_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r"(?m)^\s*<p>([IVXLCivxlc]{1,6}\.?|[0-9]{1,3}\.?)</p>\s*$").unwrap()
    });

    // "IV. THE BOSCOMBE VALLEY MYSTERY" — bare numeral followed by a
    // subtitle on the same paragraph (Sherlock Holmes, classic novels).
    static BARE_NUM_TITLE_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(
            r"(?m)^\s*<p>([IVXLCivxlc]{1,6}\.([\s&]+[A-Za-z0-9][^<]*?)?)</p>\s*$",
        )
        .unwrap()
    });

    let mut chapters: Vec<(String, String)> = Vec::new();
    let mut current_title = "Chapter 1".to_string();
    let mut current_body = String::new();

    /// Start a new chapter from a heading line: push the previous chapter,
    /// reset the body, and seed the new body with an `<h2>` heading.
    fn heading_split(
        chapters: &mut Vec<(String, String)>,
        current_title: &mut String,
        current_body: &mut String,
        title: &str,
    ) {
        if !current_body.trim().is_empty() {
            chapters.push((current_title.clone(), current_body.trim().to_string()));
        }
        *current_title = title.to_string();
        current_body.clear();
        current_body.push_str(&format!(
            "  <h2>{}</h2>\n",
            super::oeb::escape_xml(current_title)
        ));
    }

    let lines: Vec<&str> = html.lines().collect();
    let mut i = 0usize;
    while i < lines.len() {
        let line = lines[i];
        let mut pushed = false;
        if let Some(cap) = CHAPTER_RE.captures(line) {
            heading_split(&mut chapters, &mut current_title, &mut current_body, cap[1].trim());
            pushed = true;
        } else if let Some(cap) = BARE_NUM_TITLE_RE.captures(line) {
            let raw = cap[1].trim();
            // Only a heading when the following paragraph is real body text
            // and this doesn't duplicate the preceding heading (the "I."
            // paragraph right after "I. A SCANDAL IN BOHEMIA" is a section
            // marker inside the story, not a new chapter).
            let prev_is_heading = lines[..i]
                .iter()
                .rev()
                .find(|l| !l.trim().is_empty())
                .map(|l| {
                    CHAPTER_RE.is_match(l)
                        || CJK_HEAD_RE.is_match(l)
                        || CAPS_RE.is_match(l)
                        || BARE_NUM_TITLE_RE.is_match(l)
                })
                .unwrap_or(false);
            let body_follows = lines[i + 1..]
                .iter()
                .find(|l| !l.trim().is_empty())
                .map(|l| {
                    let p = utils::strip_html_tags(l.trim()).trim().to_string();
                    !p.is_empty() && p.chars().count() > 4 && !utils::is_scene_break(&p)
                })
                .unwrap_or(false);
            if !prev_is_heading && body_follows && raw.chars().count() <= 60 {
                let title = if raw.trim_end_matches('.').chars().all(|c| c.is_ascii_digit())
                {
                    format!("Chapter {}", raw.trim_end_matches('.'))
                } else if raw
                    .trim_end_matches('.')
                    .chars()
                    .all(|c| matches!(c, 'I' | 'V' | 'X' | 'L' | 'C'))
                {
                    format!("Chapter {}", raw.trim_end_matches('.'))
                } else {
                    format!("Chapter {}", titlecase(raw.trim_end_matches('.')))
                };
                heading_split(&mut chapters, &mut current_title, &mut current_body, &title);
                pushed = true;
            }
        } else if let Some(cap) = CJK_HEAD_RE.captures(line) {
            heading_split(&mut chapters, &mut current_title, &mut current_body, cap[1].trim());
            pushed = true;
        } else if let Some(cap) = CAPS_RE.captures(line) {
            let candidate = cap[1].trim();
            // Must not be a regular sentence fragment — require surrounded by context
            if candidate.len() < 60 && candidate.split_whitespace().count() <= 8 {
                heading_split(
                    &mut chapters,
                    &mut current_title,
                    &mut current_body,
                    &titlecase(candidate),
                );
                pushed = true;
            }
        } else if let Some(cap) = BARE_NUM_RE.captures(line) {
            // Bare "I." / "1.": only a heading when real body text follows
            // (protects page-number footers and list items).
            let next_nonempty = lines[i + 1..]
                .iter()
                .find(|l| !l.trim().is_empty())
                .map(|l| utils::strip_html_tags(l.trim()).trim().to_string());
            let body_follows = next_nonempty
                .as_ref()
                .map(|n| {
                    !n.is_empty()
                        && n.chars().count() > 4
                        && !utils::is_scene_break(n)
                        && !n.eq_ignore_ascii_case("contents")
                })
                .unwrap_or(false);
            if body_follows {
                let raw = cap[1].trim();
                let title = if raw.trim_end_matches('.').chars().all(|c| c.is_ascii_digit())
                {
                    format!("Chapter {}", raw.trim_end_matches('.'))
                } else if raw
                    .trim_end_matches('.')
                    .chars()
                    .all(|c| matches!(c, 'I' | 'V' | 'X' | 'L' | 'C'))
                {
                    format!("Chapter {}", raw.trim_end_matches('.'))
                } else {
                    format!("Chapter {}", titlecase(raw.trim_end_matches('.')))
                };
                heading_split(&mut chapters, &mut current_title, &mut current_body, &title);
                pushed = true;
            }
        }

        if !pushed {
            current_body.push_str(line);
            current_body.push('\n');
        }
        i += 1;
    }

    if !current_body.trim().is_empty() {
        chapters.push((current_title, current_body.trim().to_string()));
    }

    if chapters.is_empty() {
        chapters.push(("Full Text".to_string(), html.to_string()));
    }

    chapters
}

/// Convert a TXT file to EPUB 3 — now handled by `formats::txt::parse`
/// through `conversion::convert_to_epub`.

/// Convert "ALL CAPS TITLE" to "All Caps Title"
fn titlecase(s: &str) -> String {
    s.split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(c) => {
                    let mut s = c.to_uppercase().to_string();
                    s.extend(chars.map(|c| c.to_lowercase().next().unwrap_or(c)));
                    s
                }
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
