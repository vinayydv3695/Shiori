/// TXT → EPUB converter inspired by calibre's txt/processor.py.
///
/// Supports three paragraph modes:
/// - Markdown: >30% of lines start with # * - > [
/// - Formatted: blank lines separate paragraphs
/// - Unformatted: hard line breaks everywhere, needs unwrapping
///
/// Also: encoding detection, chapter detection, scene breaks, smart quotes.

use std::path::Path;

use super::epub_writer::EpubDocument;
use super::utils;
use super::{ConversionError, EpubOutput};

/// Convert a TXT file to EPUB 3.
pub async fn convert(source: &Path, output: &Path) -> Result<EpubOutput, ConversionError> {
    let raw = tokio::fs::read(source).await?;
    let text = utils::decode_text(&raw)?;
    let text = utils::normalize_line_endings(&text);

    // Detect format style
    let mode = detect_text_mode(&text);
    log::info!("[TXT→EPUB] Detected mode: {:?} for {}", mode, source.display());

    // Convert to HTML based on mode
    let html = match mode {
        TextMode::Markdown => markdown_to_html(&text),
        TextMode::Formatted => formatted_to_html(&text),
        TextMode::Unformatted => unformatted_to_html(&text),
    };

    // Split into chapters
    let chapters = split_into_chapters(&html);

    // Infer title from filename
    let title = source.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.replace('_', " ").replace('-', " "))
        .unwrap_or_else(|| "Untitled".to_string());

    // Build EPUB
    let mut doc = EpubDocument::new(title.clone());
    for (ch_title, ch_body) in &chapters {
        doc.add_chapter(ch_title.clone(), ch_body.clone());
    }

    doc.write_to_file(output).await?;

    Ok(EpubOutput {
        path: output.to_path_buf(),
        title,
        author: None,
        cover_data: None,
        chapter_count: chapters.len(),
        warnings: vec![],
    })
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
        let md_count = non_empty.iter().filter(|l| {
            let t = l.trim();
            t.starts_with('#') || t.starts_with("* ") || t.starts_with("- ")
                || t.starts_with("> ") || t.starts_with("```")
                || t.starts_with("1.") || t.starts_with("[ ")
                || t.starts_with("[^")
        }).count();
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
    use pulldown_cmark::{Parser, Options, html};

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
                        super::epub_writer::escape_xml(para.trim())
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
            super::epub_writer::escape_xml(para.trim())
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
    let mut lengths: Vec<usize> = lines.iter()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.len())
        .collect();
    lengths.sort_unstable();
    let median = if lengths.is_empty() { 80 } else { lengths[lengths.len() / 2] };

    let mut html = String::new();
    let mut para = String::new();

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            if !para.trim().is_empty() {
                html.push_str(&format!(
                    "  <p>{}</p>\n",
                    super::epub_writer::escape_xml(para.trim())
                ));
                para.clear();
            }
            continue;
        }

        if utils::is_scene_break(trimmed) {
            if !para.trim().is_empty() {
                html.push_str(&format!(
                    "  <p>{}</p>\n",
                    super::epub_writer::escape_xml(para.trim())
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
                super::epub_writer::escape_xml(para.trim())
            ));
            para.clear();
        }
    }

    if !para.trim().is_empty() {
        html.push_str(&format!(
            "  <p>{}</p>\n",
            super::epub_writer::escape_xml(para.trim())
        ));
    }

    html
}

// ──────────────────────────────────────────────────────────────────────────
// CHAPTER SPLITTING
// ──────────────────────────────────────────────────────────────────────────

/// Split HTML content into chapters based on heading detection.
fn split_into_chapters(html: &str) -> Vec<(String, String)> {
    let chapter_re = regex::Regex::new(
        r"(?im)^\s*<p>((?:chapter|part|book|prologue|epilogue|introduction|appendix|preface)\s*[\d\w]*\.?\s*)</p>\s*$"
    ).unwrap();

    // Also match all-caps lines that look like chapter titles
    let caps_re = regex::Regex::new(
        r"(?m)^\s*<p>([A-Z][A-Z\s\d]{2,58})</p>\s*$"
    ).unwrap();

    let mut chapters: Vec<(String, String)> = Vec::new();
    let mut current_title = "Chapter 1".to_string();
    let mut current_body = String::new();

    for line in html.lines() {
        if let Some(cap) = chapter_re.captures(line) {
            // Save previous chapter
            if !current_body.trim().is_empty() {
                chapters.push((current_title.clone(), current_body.trim().to_string()));
            }
            current_title = cap[1].trim().to_string();
            current_body.clear();
            current_body.push_str(&format!("  <h2>{}</h2>\n", super::epub_writer::escape_xml(&current_title)));
        } else if let Some(cap) = caps_re.captures(line) {
            let candidate = cap[1].trim();
            // Must not be a regular sentence fragment — require surrounded by context
            if candidate.len() < 60 && candidate.split_whitespace().count() <= 8 {
                if !current_body.trim().is_empty() {
                    chapters.push((current_title.clone(), current_body.trim().to_string()));
                }
                current_title = titlecase(candidate);
                current_body.clear();
                current_body.push_str(&format!("  <h2>{}</h2>\n", super::epub_writer::escape_xml(&current_title)));
                continue;
            }
            current_body.push_str(line);
            current_body.push('\n');
        } else {
            current_body.push_str(line);
            current_body.push('\n');
        }
    }

    if !current_body.trim().is_empty() {
        chapters.push((current_title, current_body.trim().to_string()));
    }

    if chapters.is_empty() {
        chapters.push(("Full Text".to_string(), html.to_string()));
    }

    chapters
}

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
