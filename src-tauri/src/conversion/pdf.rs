/// PDF → EPUB converter inspired by calibre's pdf_input.py.
///
/// Strategy: shell out to pdftohtml (poppler-utils) then process the HTML.
/// If pdftohtml is not available, fall back to lopdf for basic text extraction.
///
/// Implements:
/// - pdftohtml subprocess invocation
/// - HTML post-processing with line-unwrap heuristic
/// - Chapter detection (heading tags + all-caps heuristic)
/// - Image extraction from pdftohtml output
/// - Fallback to lopdf for basic text-only extraction

use std::path::{Path, PathBuf};
use std::process::Command;

use super::epub_writer::{EpubDocument, escape_xml};
use super::utils;
use super::{ConversionError, EpubOutput};

/// Convert a PDF file to EPUB 3.
pub async fn convert(source: &Path, output: &Path) -> Result<EpubOutput, ConversionError> {
    let mut warnings = Vec::new();

    // Try pdftohtml first
    match convert_with_pdftohtml(source, output, &mut warnings).await {
        Ok(result) => Ok(result),
        Err(ConversionError::MissingDependency(msg)) => {
            warnings.push(format!("pdftohtml not available ({}), falling back to basic extraction", msg));
            convert_with_lopdf(source, output, &mut warnings).await
        }
        Err(e) => Err(e),
    }
}

// ──────────────────────────────────────────────────────────────────────────
// PDFTOHTML PATH
// ──────────────────────────────────────────────────────────────────────────

async fn convert_with_pdftohtml(
    source: &Path,
    output: &Path,
    warnings: &mut Vec<String>,
) -> Result<EpubOutput, ConversionError> {
    // Create temp directory for pdftohtml output
    let tmp_dir = tempfile::tempdir()
        .map_err(|e| ConversionError::Other(format!("Failed to create temp dir: {}", e)))?;
    let tmp_output = tmp_dir.path().join("output");

    // Check if pdftohtml exists
    let which_result = Command::new("which").arg("pdftohtml").output();
    if which_result.is_err() || !which_result.as_ref().unwrap().status.success() {
        return Err(ConversionError::MissingDependency(
            "pdftohtml (install poppler-utils: apt install poppler-utils)".to_string()
        ));
    }

    // Run pdftohtml
    let pdftohtml_result = Command::new("pdftohtml")
        .args([
            "-noframes",
            "-p",
            "-enc", "UTF-8",
            "-nodrm",
            source.to_str().ok_or_else(|| ConversionError::Other("Invalid source path".to_string()))?,
            tmp_output.to_str().ok_or_else(|| ConversionError::Other("Invalid output path".to_string()))?,
        ])
        .output()
        .map_err(|e| ConversionError::MissingDependency(format!("Failed to run pdftohtml: {}", e)))?;

    if !pdftohtml_result.status.success() {
        let stderr = String::from_utf8_lossy(&pdftohtml_result.stderr);
        warnings.push(format!("pdftohtml warnings: {}", stderr));
        // Continue anyway — pdftohtml may produce partial output even with errors
    }

    // Find the output HTML file(s)
    let html_files = find_html_files(tmp_dir.path())?;

    if html_files.is_empty() {
        return Err(ConversionError::Other("pdftohtml produced no output".to_string()));
    }

    // Read and process HTML
    let mut all_html = String::new();
    let mut images: Vec<(String, String, String, Vec<u8>)> = Vec::new();
    let mut img_counter = 0u32;

    for html_path in &html_files {
        let raw = tokio::fs::read(html_path).await?;
        let html = String::from_utf8_lossy(&raw).into_owned();
        all_html.push_str(&html);
        all_html.push('\n');
    }

    // Extract images from the temp directory
    let image_files = find_image_files(tmp_dir.path())?;
    for img_path in &image_files {
        let img_data = tokio::fs::read(img_path).await?;
        if let Some((mime, ext)) = utils::detect_image_format(&img_data) {
            let id = format!("pdf_img_{:04}", img_counter);
            let filename = format!("image_{:04}.{}", img_counter, ext);
            images.push((id, filename, mime.to_string(), img_data));
            img_counter += 1;
        }
    }

    // Post-process: extract text from HTML, apply line unwrap, detect chapters
    let processed = post_process_pdf_html(&all_html, warnings);

    // Split into chapters
    let chapters = split_pdf_chapters(&processed);

    // Infer title from filename
    let title = source.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.replace('_', " ").replace('-', " "))
        .unwrap_or_else(|| "Untitled".to_string());

    // Build EPUB
    let mut doc = EpubDocument::new(title.clone());

    for (id, filename, mime, img_data) in &images {
        doc.add_image(id.clone(), filename.clone(), mime.clone(), img_data.clone());
    }

    for (ch_title, ch_body) in &chapters {
        doc.add_chapter(ch_title.clone(), ch_body.clone());
    }

    let chapter_count = doc.chapters.len();
    doc.write_to_file(output).await?;

    Ok(EpubOutput {
        path: output.to_path_buf(),
        title,
        author: None,
        cover_data: None,
        chapter_count,
        warnings: warnings.clone(),
    })
}

// ──────────────────────────────────────────────────────────────────────────
// LOPDF FALLBACK
// ──────────────────────────────────────────────────────────────────────────

async fn convert_with_lopdf(
    source: &Path,
    output: &Path,
    warnings: &mut Vec<String>,
) -> Result<EpubOutput, ConversionError> {
    let data = tokio::fs::read(source).await?;

    let doc = lopdf::Document::load_mem(&data)
        .map_err(|e| ConversionError::InvalidFormat(format!("Failed to parse PDF: {}", e)))?;

    let mut text_content = String::new();
    let pages = doc.get_pages();

    for (page_num, _page_id) in &pages {
        match doc.extract_text(&[*page_num]) {
            Ok(text) => {
                text_content.push_str(&text);
                text_content.push_str("\n\n");
            }
            Err(e) => {
                warnings.push(format!("Failed to extract text from page {}: {}", page_num, e));
            }
        }
    }

    if text_content.trim().is_empty() {
        return Err(ConversionError::Other("Could not extract any text from PDF".to_string()));
    }

    // Apply text processing
    let text = utils::normalize_line_endings(&text_content);
    let text = utils::smart_quotes(&text);

    // Simple chapter detection and conversion
    let html = utils::text_to_html_paragraphs(&text);
    let chapters = split_pdf_chapters(&html);

    let title = source.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.replace('_', " ").replace('-', " "))
        .unwrap_or_else(|| "Untitled".to_string());

    let mut epub_doc = EpubDocument::new(title.clone());
    for (ch_title, ch_body) in &chapters {
        epub_doc.add_chapter(ch_title.clone(), ch_body.clone());
    }

    let chapter_count = epub_doc.chapters.len();
    epub_doc.write_to_file(output).await?;

    Ok(EpubOutput {
        path: output.to_path_buf(),
        title,
        author: None,
        cover_data: None,
        chapter_count,
        warnings: warnings.clone(),
    })
}

// ──────────────────────────────────────────────────────────────────────────
// HTML POST-PROCESSING
// ──────────────────────────────────────────────────────────────────────────

fn post_process_pdf_html(html: &str, warnings: &mut Vec<String>) -> String {
    // Extract paragraph text from HTML
    let paragraph_re = regex::Regex::new(r"(?is)<p[^>]*>(.*?)</p>").unwrap();
    let br_re = regex::Regex::new(r"(?i)<br\s*/?>").unwrap();

    let mut paragraphs: Vec<String> = Vec::new();

    for cap in paragraph_re.captures_iter(html) {
        let inner = &cap[1];
        // Replace <br> with newlines for line-unwrap processing
        let text = br_re.replace_all(inner, "\n").to_string();
        let text = utils::strip_html_tags(&text).trim().to_string();
        if !text.is_empty() {
            paragraphs.push(text);
        }
    }

    // If regex didn't capture much, fall back to simple extraction
    if paragraphs.is_empty() {
        let text = utils::strip_html_tags(html);
        for line in text.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                paragraphs.push(trimmed.to_string());
            }
        }
    }

    // Line unwrap using median line length (calibre's algorithm)
    let mut lengths: Vec<usize> = paragraphs.iter()
        .filter(|p| p.len() > 10)
        .map(|p| p.len())
        .collect();
    lengths.sort_unstable();
    let median = if lengths.is_empty() { 80 } else { lengths[lengths.len() / 2] };

    let mut result = String::new();
    let mut current_para = String::new();

    for para in &paragraphs {
        // Check if this paragraph is a chapter title candidate
        let is_heading = para.len() < 80
            && (para.chars().all(|c| c.is_uppercase() || c.is_whitespace() || c.is_numeric() || c == ':'))
            || para.starts_with("Chapter ")
            || para.starts_with("CHAPTER ");

        if is_heading {
            if !current_para.is_empty() {
                result.push_str(&format!("  <p>{}</p>\n", escape_xml(current_para.trim())));
                current_para.clear();
            }
            result.push_str(&format!("  <h2>{}</h2>\n", escape_xml(para.trim())));
            continue;
        }

        // Line unwrap heuristic
        let is_continuation = para.len() as f64 > median as f64 * 0.85
            && !para.ends_with('.')
            && !para.ends_with('!')
            && !para.ends_with('?');

        if is_continuation && !current_para.is_empty() {
            current_para.push(' ');
            current_para.push_str(para);
        } else {
            if !current_para.is_empty() {
                result.push_str(&format!("  <p>{}</p>\n", escape_xml(current_para.trim())));
            }
            current_para = para.clone();
        }
    }

    if !current_para.is_empty() {
        result.push_str(&format!("  <p>{}</p>\n", escape_xml(current_para.trim())));
    }

    let _ = warnings; // Used by caller
    result
}

// ──────────────────────────────────────────────────────────────────────────
// CHAPTER SPLITTING
// ──────────────────────────────────────────────────────────────────────────

fn split_pdf_chapters(html: &str) -> Vec<(String, String)> {
    let heading_re = regex::Regex::new(r"(?i)<h[1-3][^>]*>(.*?)</h[1-3]>").unwrap();

    let mut chapters: Vec<(String, String)> = Vec::new();
    let mut current_title = "Document".to_string();
    let mut current_body = String::new();

    for line in html.lines() {
        if let Some(cap) = heading_re.captures(line) {
            let title = utils::strip_html_tags(&cap[1]).trim().to_string();
            if !title.is_empty() {
                if !current_body.trim().is_empty() {
                    chapters.push((current_title.clone(), current_body.trim().to_string()));
                    current_body.clear();
                }
                current_title = title;
                current_body.push_str(line);
                current_body.push('\n');
                continue;
            }
        }
        current_body.push_str(line);
        current_body.push('\n');
    }

    if !current_body.trim().is_empty() {
        chapters.push((current_title, current_body.trim().to_string()));
    }

    // If no chapters detected, split every ~10 pages worth of content
    if chapters.len() <= 1 && html.len() > 50000 {
        let single = chapters.into_iter().next().unwrap_or(("Document".to_string(), html.to_string()));
        let lines: Vec<&str> = single.1.lines().collect();
        let chunk_size = (lines.len() / 10).max(50);
        let mut new_chapters = Vec::new();

        for (i, chunk) in lines.chunks(chunk_size).enumerate() {
            let title = format!("Section {}", i + 1);
            let body = chunk.join("\n");
            new_chapters.push((title, body));
        }

        return new_chapters;
    }

    if chapters.is_empty() {
        chapters.push(("Document".to_string(), html.to_string()));
    }

    chapters
}

// ──────────────────────────────────────────────────────────────────────────
// FILE DISCOVERY
// ──────────────────────────────────────────────────────────────────────────

fn find_html_files(dir: &Path) -> Result<Vec<PathBuf>, ConversionError> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                let ext = ext.to_str().unwrap_or("").to_lowercase();
                if ext == "html" || ext == "htm" {
                    files.push(path);
                }
            }
        }
    }
    files.sort();
    Ok(files)
}

fn find_image_files(dir: &Path) -> Result<Vec<PathBuf>, ConversionError> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                let ext = ext.to_str().unwrap_or("").to_lowercase();
                if ext == "png" || ext == "jpg" || ext == "jpeg" || ext == "gif" {
                    files.push(path);
                }
            }
        }
    }
    files.sort();
    Ok(files)
}
