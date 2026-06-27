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
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::process::Command;

use super::oeb::{OebBook, OebChapter, OebImage};
use super::utils;
use super::ConversionError;

/// Parse a PDF file into an OebBook.
pub async fn parse(
    source: &Path,
    progress_cb: Option<&(dyn Fn(u8, &str) + Send + Sync)>,
) -> Result<OebBook, ConversionError> {
    let mut warnings = Vec::new();

    // Try pdftohtml first
    match convert_with_pdftohtml(source, &mut warnings, progress_cb).await {
        Ok(result) => Ok(result),
        Err(ConversionError::MissingDependency(msg)) => {
            warnings.push(format!(
                "pdftohtml not available ({}), falling back to basic extraction",
                msg
            ));
            convert_with_lopdf(source, &mut warnings).await
        }
        Err(ConversionError::EmptyContent) => {
            warnings.push(
                "pdftohtml produced empty/blank content, falling back to basic extraction"
                    .to_string(),
            );
            convert_with_lopdf(source, &mut warnings).await
        }
        Err(e) => Err(e),
    }
}

// ──────────────────────────────────────────────────────────────────────────
// PDFTOHTML PATH
// ──────────────────────────────────────────────────────────────────────────

async fn convert_with_pdftohtml(
    source: &Path,
    warnings: &mut Vec<String>,
    progress_cb: Option<&(dyn Fn(u8, &str) + Send + Sync)>,
) -> Result<OebBook, ConversionError> {
    // Create temp directory for pdftohtml output
    let tmp_dir = tempfile::tempdir()
        .map_err(|e| ConversionError::Other(format!("Failed to create temp dir: {}", e)))?;
    let tmp_output = tmp_dir.path().join("output");

    // Check if pdftohtml exists
    let which_result = Command::new("which").arg("pdftohtml").output().await;
    if which_result.is_err() || !which_result.as_ref().unwrap().status.success() {
        return Err(ConversionError::MissingDependency(
            "pdftohtml (install poppler-utils: apt install poppler-utils)".to_string(),
        ));
    }

    // Try to get total pages
    let mut total_pages = 0;
    if let Ok(info_out) = Command::new("pdfinfo").arg(source).output().await {
        if info_out.status.success() {
            let out_str = String::from_utf8_lossy(&info_out.stdout);
            if let Some(cap) = regex::Regex::new(r"Pages:\s+(\d+)").unwrap().captures(&out_str) {
                total_pages = cap[1].parse::<u32>().unwrap_or(0);
            }
        }
    }

    // Run pdftohtml with streaming output
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};

    let args = vec![
        "-noframes",
        "-p",
        "-enc",
        "UTF-8",
        "-nodrm",
        source
            .to_str()
            .ok_or_else(|| ConversionError::Other("Invalid source path".to_string()))?,
        tmp_output
            .to_str()
            .ok_or_else(|| ConversionError::Other("Invalid output path".to_string()))?,
    ];

    let mut child = if cfg!(unix) {
        let mut stdbuf_args = vec!["-oL", "pdftohtml"];
        stdbuf_args.extend(args.clone());
        Command::new("stdbuf")
            .args(&stdbuf_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .or_else(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    Command::new("pdftohtml")
                        .args(&args)
                        .stdout(Stdio::piped())
                        .stderr(Stdio::piped())
                        .spawn()
                } else {
                    Err(e)
                }
            })
    } else {
        Command::new("pdftohtml")
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    }
    .map_err(|e| {
        ConversionError::MissingDependency(format!("Failed to run pdftohtml: {}", e))
    })?;

    if let Some(stdout) = child.stdout.take() {
        let mut reader = BufReader::new(stdout).lines();
        let page_re = regex::Regex::new(r"^Page-(\d+)").unwrap();
        while let Ok(Some(line)) = reader.next_line().await {
            if let Some(caps) = page_re.captures(&line) {
                if let Ok(page) = caps[1].parse::<u32>() {
                    if total_pages > 0 && total_pages >= page {
                        let pct = 10 + (page as f32 / total_pages as f32 * 80.0) as u8;
                        if let Some(cb) = progress_cb {
                            cb(pct, &format!("Converting page {} of {}...", page, total_pages));
                        }
                    } else {
                        if let Some(cb) = progress_cb {
                            cb(10, &format!("Converting page {}...", page));
                        }
                    }
                }
            }
        }
    }

    let output = child.wait_with_output().await.map_err(|e| ConversionError::Other(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warnings.push(format!("pdftohtml warnings: {}", stderr));
        // Continue anyway — pdftohtml may produce partial output even with errors
    }

    // Find the output HTML file(s)
    let html_files = find_html_files(tmp_dir.path())?;

    if html_files.is_empty() {
        return Err(ConversionError::Other(
            "pdftohtml produced no output".to_string(),
        ));
    }

    // Read and process HTML
    let mut all_html = String::new();
    let mut images: Vec<(String, String, String, Vec<u8>)> = Vec::new();
    // Maps pdftohtml original basename → EPUB-internal image filename
    let mut img_rename_map: Vec<(String, String)> = Vec::new();
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
            // Record original filename so we can fix img src in the chapter HTML
            let orig_name = img_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let id = format!("pdf_img_{:04}", img_counter);
            let filename = format!("image_{:04}.{}", img_counter, ext);
            img_rename_map.push((orig_name, filename.clone()));
            images.push((id, filename, mime.to_string(), img_data));
            img_counter += 1;
        }
    }

    // Post-process: extract text from HTML, apply line unwrap, detect chapters
    let processed = post_process_pdf_html(&all_html, warnings);
    // Rewrite img src attributes to use EPUB-internal filenames
    // pdftohtml outputs e.g. src="output001.png" but we embed as image_0000.png
    let processed = rewrite_img_srcs(processed, &img_rename_map);

    // Try to extract TOC via lopdf
    let toc = extract_pdf_toc(source);

    // Split into chapters
    let chapters = split_pdf_chapters(&processed, toc.as_deref());

    // Guard: avoid generating a blank EPUB when pdftohtml output is structurally present
    // but text extraction produced no readable content.
    let has_readable_text = chapters
        .iter()
        .any(|(_, body)| !utils::strip_html_tags(body).trim().is_empty());
    if !has_readable_text && images.is_empty() {
        return Err(ConversionError::EmptyContent);
    }

    // Infer title from filename
    let title = source
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.replace('_', " ").replace('-', " "))
        .unwrap_or_else(|| "Untitled".to_string());

    // Build OebBook
    let mut book = OebBook::new(title);

    for (id, filename, mime, img_data) in images {
        book.images.push(OebImage {
            id,
            filename,
            mime_type: mime,
            data: img_data,
        });
    }

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
// LOPDF FALLBACK
// ──────────────────────────────────────────────────────────────────────────

async fn convert_with_lopdf(
    source: &Path,
    warnings: &mut Vec<String>,
) -> Result<OebBook, ConversionError> {
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
                warnings.push(format!(
                    "Failed to extract text from page {}: {}",
                    page_num, e
                ));
            }
        }
    }

    if text_content.trim().is_empty() {
        return Err(ConversionError::Other(
            "Could not extract any text from PDF".to_string(),
        ));
    }

    // Apply text processing
    let text = utils::normalize_line_endings(&text_content);
    let text = utils::smart_quotes(&text);

    // Try to extract TOC
    let toc = extract_pdf_toc(source);

    // Simple chapter detection and conversion
    let html = utils::text_to_html_paragraphs(&text);
    let chapters = split_pdf_chapters(&html, toc.as_deref());

    let title = source
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.replace('_', " ").replace('-', " "))
        .unwrap_or_else(|| "Untitled".to_string());

    let mut book = OebBook::new(title);
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

/// Convert a PDF file to EPUB 3 (Legacy wrapper for ConversionEngine).
pub async fn convert(
    source: &Path,
    output: &Path,
    progress_cb: Option<&(dyn Fn(u8, &str) + Send + Sync)>,
) -> Result<super::EpubOutput, ConversionError> {
    let mut book = parse(source, progress_cb).await?;
    book.sanitize_html();
    super::epub_builder::build_epub(&book, output)?;

    Ok(super::EpubOutput {
        path: output.to_path_buf(),
        title: book.title,
        author: book.authors.first().cloned(),
        cover_data: book.cover_image.map(|img| img.data),
        chapter_count: book.chapters.len(),
        warnings: vec![],
    })
}

// ──────────────────────────────────────────────────────────────────────────
// HTML POST-PROCESSING
// ──────────────────────────────────────────────────────────────────────────

fn fix_mojibake(mut text: String) -> String {
    text = text.replace("â€™", "’");
    text = text.replace("â€œ", "“");
    text = text.replace("â€\u{9d}", "”");
    text = text.replace("â€\u{94}", "”");
    text = text.replace("â€˜", "‘");
    text = text.replace("â€“", "–");
    text = text.replace("â€”", "—");
    text = text.replace("â€¦", "…");
    text = text.replace("â\u{80}\u{99}", "’");
    text = text.replace("â\u{80}\u{9c}", "“");
    text = text.replace("â\u{80}\u{9d}", "”");
    text = text.replace("â\u{80}\u{98}", "‘");
    text = text.replace("â\u{80}\u{93}", "–");
    text = text.replace("â\u{80}\u{94}", "—");
    text = text.replace("â\u{80}\u{a6}", "…");
    
    // Heuristic for orphaned "â" where control characters were dropped by the PDF generator
    text = text.replace("âs ", "’s ");
    text = text.replace("âs.", "’s.");
    text = text.replace("âs,", "’s,");
    text = text.replace("âd ", "’d ");
    text = text.replace("âm ", "’m ");
    text = text.replace("âre ", "’re ");
    text = text.replace("âve ", "’ve ");
    text = text.replace("âll ", "’ll ");
    text = text.replace("ât ", "’t ");
    
    text
}

fn post_process_pdf_html(html: &str, warnings: &mut Vec<String>) -> String {
    // 1. First, use our sanitize function to convert to valid XHTML,
    // which safely limits everything to approved tags (like <img>, <br>, <b>, etc).
    let html = fix_mojibake(utils::sanitize_html_for_epub(html));

    // Extract paragraph text and page anchors from HTML
    static BLOCK_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r#"(?is)(<p[^>]*>.*?</p>)|(<a[^>]*name=["']?\d+["']?[^>]*>)"#).unwrap()
    });
    static BR_RE: once_cell::sync::Lazy<regex::Regex> =
        once_cell::sync::Lazy::new(|| regex::Regex::new(r"(?i)<br\s*/?>").unwrap());
    static IMG_RE: once_cell::sync::Lazy<regex::Regex> =
        once_cell::sync::Lazy::new(|| regex::Regex::new(r"(?is)<img[^>]+>").unwrap());

    let mut blocks: Vec<String> = Vec::new();

    for cap in BLOCK_RE.captures_iter(&html) {
        if let Some(p_match) = cap.get(1) {
            let inner = p_match.as_str();
            
            // It's mostly text, we can strip remaining tags for line-length calculations
            let mut text = BR_RE.replace_all(inner, "\n").to_string();

            if IMG_RE.is_match(&text) {
                blocks.push(text.trim().to_string());
                continue;
            }

            text = utils::strip_html_tags(&text).trim().to_string();
            if !text.is_empty() {
                blocks.push(text);
            }
        } else if let Some(a_match) = cap.get(2) {
            // It's a page anchor
            blocks.push(a_match.as_str().to_string());
        }
    }

    // If regex didn't capture much, fall back to simple extraction
    if blocks.is_empty() {
        // Fallback: preserve order of images and text
        let html_lines = html.replace("<br/>", "\n").replace("<br>", "\n");
        let html_lines = IMG_RE.replace_all(&html_lines, |caps: &regex::Captures| {
            format!("\n{}\n", &caps[0])
        });

        for line in html_lines.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if IMG_RE.is_match(line) {
                for cap in IMG_RE.captures_iter(line) {
                    blocks.push(cap[0].to_string());
                }
            } else {
                let text = utils::strip_html_tags(line);
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    blocks.push(trimmed.to_string());
                }
            }
        }
    }

    // Line unwrap using median line length
    let mut lengths: Vec<usize> = blocks
        .iter()
        .filter(|p| p.len() > 10 && !p.starts_with("<a "))
        .map(|p| p.len())
        .collect();
    lengths.sort_unstable();
    let median = if lengths.is_empty() {
        80
    } else {
        lengths[lengths.len() / 2]
    };

    let mut result = String::new();
    let mut current_para = String::new();

    for block in &blocks {
        let plain = block.trim();
        
        // Output anchors as-is
        if plain.starts_with("<a name=") {
            if !current_para.is_empty() {
                result.push_str(&format!(
                    "  <p>{}</p>\n",
                    super::oeb::escape_xml(current_para.trim())
                ));
                current_para.clear();
            }
            result.push_str(&format!("  {}\n", plain));
            continue;
        }

        // Keep extracted image tags as block elements (not escaped text inside <p>)
        if IMG_RE.is_match(plain) {
            if !current_para.is_empty() {
                result.push_str(&format!(
                    "  <p>{}</p>\n",
                    super::oeb::escape_xml(current_para.trim())
                ));
                current_para.clear();
            }
            result.push_str("  ");
            result.push_str(plain);
            result.push('\n');
            continue;
        }

        // Check if this paragraph is a chapter/section title candidate
        let is_heading = utils::looks_like_heading(plain)
            && plain.len() <= 120
            && !plain.contains('@')
            && !plain.contains("://");

        if is_heading {
            if !current_para.is_empty() {
                result.push_str(&format!(
                    "  <p>{}</p>\n",
                    super::oeb::escape_xml(current_para.trim())
                ));
                current_para.clear();
            }
            result.push_str(&format!("  <h2>{}</h2>\n", super::oeb::escape_xml(plain)));
            continue;
        }

        // Line unwrap heuristic
        let is_continuation = block.len() as f64 > median as f64 * 0.85
            && !block.ends_with('.')
            && !block.ends_with('!')
            && !block.ends_with('?');

        if is_continuation && !current_para.is_empty() {
            if current_para.ends_with('-') {
                current_para.pop(); // remove hyphen
                current_para.push_str(plain);
            } else {
                current_para.push(' ');
                current_para.push_str(plain);
            }
        } else {
            if !current_para.is_empty() {
                result.push_str(&format!(
                    "  <p>{}</p>\n",
                    super::oeb::escape_xml(current_para.trim())
                ));
            }
            current_para = plain.to_string();
        }
    }

    if !current_para.is_empty() {
        result.push_str(&format!(
            "  <p>{}</p>\n",
            super::oeb::escape_xml(current_para.trim())
        ));
    }

    let _ = warnings; // Used by caller
    result
}

// ──────────────────────────────────────────────────────────────────────────
// CHAPTER SPLITTING
// ──────────────────────────────────────────────────────────────────────────

fn extract_pdf_toc(pdf_path: &std::path::Path) -> Option<Vec<(String, u32)>> {
    let doc = lopdf::Document::load(pdf_path).ok()?;
    let toc = doc.get_toc().ok()?;
    if toc.toc.is_empty() {
        return None;
    }
    
    let mut chapters = Vec::new();
    for item in toc.toc {
        chapters.push((item.title, item.page as u32));
    }
    Some(chapters)
}

fn split_pdf_chapters(html: &str, toc: Option<&[(String, u32)]>) -> Vec<(String, String)> {
    if let Some(toc) = toc {
        if !toc.is_empty() {
            return split_pdf_chapters_by_toc(html, toc);
        }
    }
    split_pdf_chapters_heuristic(html)
}

fn split_pdf_chapters_by_toc(html: &str, toc: &[(String, u32)]) -> Vec<(String, String)> {
    let mut chapters = Vec::new();
    let mut current_title = "Document".to_string();
    let mut current_body = String::new();
    
    // Convert TOC to a map/lookup of page -> title
    // Since multiple bookmarks can exist on one page, we just take the first one or combine them.
    let mut page_to_title = std::collections::HashMap::new();
    for (title, page) in toc {
        page_to_title.entry(*page).or_insert_with(Vec::new).push(title.clone());
    }

    static PAGE_ANCHOR_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r#"(?i)<a[^>]*name="(\d+)"[^>]*>"#).unwrap()
    });

    for line in html.lines() {
        if let Some(cap) = PAGE_ANCHOR_RE.captures(line) {
            if let Ok(page_num) = cap[1].parse::<u32>() {
                if let Some(titles) = page_to_title.get(&page_num) {
                    let title = titles.join(" / ");
                    
                    if !current_body.trim().is_empty() {
                        chapters.push((current_title.clone(), current_body.trim().to_string()));
                        current_body.clear();
                    }
                    
                    current_title = title.clone();
                    current_body.push_str(&format!("  <h2>{}</h2>\n", super::oeb::escape_xml(&current_title)));
                }
            }
        }
        current_body.push_str(line);
        current_body.push('\n');
    }

    if !current_body.trim().is_empty() {
        chapters.push((current_title, current_body.trim().to_string()));
    }
    
    chapters
}

fn split_pdf_chapters_heuristic(html: &str) -> Vec<(String, String)> {
    static HEADING_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r"(?i)<h[1-6][^>]*>(.*?)</h[1-6]>").unwrap()
    });
    static PARA_RE: once_cell::sync::Lazy<regex::Regex> =
        once_cell::sync::Lazy::new(|| regex::Regex::new(r"(?is)<p[^>]*>(.*?)</p>").unwrap());

    let mut raw_chapters: Vec<(String, String, bool)> = Vec::new();
    let mut current_title = "Document".to_string();
    let mut current_body = String::new();
    let mut has_body_text = false;

    for line in html.lines() {
        let mut heading_title: Option<String> = None;

        if let Some(cap) = HEADING_RE.captures(line) {
            let title = utils::strip_html_tags(&cap[1]).trim().to_string();
            let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
            if !title.is_empty() {
                heading_title = Some(title.clone());
            }
        } else if let Some(cap) = PARA_RE.captures(line) {
            let candidate = utils::strip_html_tags(&cap[1]).trim().to_string();
            let candidate = candidate.split_whitespace().collect::<Vec<_>>().join(" ");
            if utils::looks_like_heading(&candidate) {
                heading_title = Some(candidate.clone());
            }
        }

        if let Some(title) = heading_title {
            let is_definitive = {
                let t = title.trim().to_lowercase();
                let kw = ["chapter ", "part ", "book ", "prologue", "epilogue", "introduction", "preface", "afterword", "appendix", "interlude"];
                kw.iter().any(|&k| t.starts_with(k))
            };
            
            let force_break = is_definitive && !current_title.is_empty() && current_title != "Document";

            if has_body_text || force_break {
                raw_chapters.push((current_title.clone(), current_body.trim().to_string(), has_body_text));
                current_body.clear();
                has_body_text = false;
                current_title = title;
                current_body.push_str(&format!("  <h2>{}</h2>\n", super::oeb::escape_xml(&current_title)));
            } else {
                if current_title == "Document" {
                    current_title = title;
                    current_body.push_str(&format!("  <h2>{}</h2>\n", super::oeb::escape_xml(&current_title)));
                } else {
                    current_title = format!("{} {}", current_title, title);
                    if let Some(idx) = current_body.rfind("  <h2>") {
                        current_body.truncate(idx);
                    }
                    current_body.push_str(&format!("  <h2>{}</h2>\n", super::oeb::escape_xml(&current_title)));
                }
            }
            continue;
        }

        let plain = utils::strip_html_tags(line).trim().to_string();
        let has_image = line.to_lowercase().contains("<img");
        if !plain.is_empty() || has_image {
            has_body_text = true;
        }

        current_body.push_str(line);
        current_body.push('\n');
    }

    if !current_body.trim().is_empty() {
        raw_chapters.push((current_title, current_body.trim().to_string(), has_body_text));
    }

    // Post-process to merge empty chapters (like TOC entries) into the previous chapter
    let mut chapters: Vec<(String, String)> = Vec::new();
    for (title, body, had_body) in raw_chapters {
        if !had_body && !chapters.is_empty() {
            // It's likely a TOC entry or a structural page with no body.
            // Demote its <h2> to <p><strong> and append it to the previous chapter.
            let demoted_body = body.replace("<h2>", "<p><strong>").replace("</h2>", "</strong></p>");
            let last = chapters.last_mut().unwrap();
            last.1.push_str("\n<br/>\n");
            last.1.push_str(&demoted_body);
        } else {
            chapters.push((title, body));
        }
    }

    // If no chapters detected, split every ~10 pages worth of content
    if chapters.len() <= 1 && html.len() > 50000 {
        let single = chapters.pop().unwrap_or_else(|| ("Document".to_string(), "".to_string()));
        
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

// ──────────────────────────────────────────────────────────────────────────
// IMAGE SRC REWRITING
// ──────────────────────────────────────────────────────────────────────────

/// Rewrite image src attributes to EPUB-internal image paths.
/// Handles quoted/unquoted values, single/double quotes, and basename/path variants.
fn rewrite_img_srcs(html: String, map: &[(String, String)]) -> String {
    if map.is_empty() {
        return html;
    }

    let mut by_exact: HashMap<String, String> = HashMap::new();
    let mut by_basename: HashMap<String, String> = HashMap::new();
    for (original, epub_name) in map {
        let normalized = normalize_src_for_lookup(original);
        by_exact.insert(normalized.clone(), epub_name.clone());

        if let Some(base) = std::path::Path::new(&normalized)
            .file_name()
            .and_then(|n| n.to_str())
        {
            by_basename.insert(base.to_lowercase(), epub_name.clone());
        }
    }

    static IMG_TAG_RE: once_cell::sync::Lazy<regex::Regex> =
        once_cell::sync::Lazy::new(|| regex::Regex::new(r"(?is)<img\b[^>]*>").unwrap());
    static SRC_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r#"(?i)\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))"#).unwrap()
    });

    IMG_TAG_RE
        .replace_all(&html, |caps: &regex::Captures| {
            let tag = caps.get(0).map(|m| m.as_str()).unwrap_or("");
            let Some(src_cap) = SRC_RE.captures(tag) else {
                return tag.to_string();
            };

            let src_val = src_cap
                .get(1)
                .or_else(|| src_cap.get(2))
                .or_else(|| src_cap.get(3))
                .map(|m| m.as_str())
                .unwrap_or("");

            let lowered = src_val.to_lowercase();
            if lowered.starts_with("data:")
                || lowered.starts_with("http://")
                || lowered.starts_with("https://")
                || lowered.starts_with("../images/")
            {
                return tag.to_string();
            }

            let normalized = normalize_src_for_lookup(src_val);
            let mapped = by_exact.get(&normalized).cloned().or_else(|| {
                std::path::Path::new(&normalized)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .and_then(|base| by_basename.get(&base.to_lowercase()).cloned())
            });

            if let Some(epub_name) = mapped {
                SRC_RE
                    .replace(tag, format!("src=\"../Images/{}\"", epub_name))
                    .to_string()
            } else {
                tag.to_string()
            }
        })
        .to_string()
}

fn normalize_src_for_lookup(src: &str) -> String {
    let mut s = src.trim().replace('\\', "/").to_lowercase();

    while s.starts_with("./") {
        s = s[2..].to_string();
    }
    while s.starts_with("../") {
        s = s[3..].to_string();
    }

    s
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_chapters_from_heading_like_paragraphs() {
        let html = r#"
  <p>Chapter 1</p>
  <p>First body paragraph.</p>
  <p>CHAPTER 2</p>
  <p>Second body paragraph.</p>
"#;

        let chapters = split_pdf_chapters(html);
        assert!(chapters.len() >= 2);
        assert!(chapters[0].0.to_lowercase().contains("chapter"));
        assert!(chapters[1].0.to_lowercase().contains("chapter"));
    }

    #[test]
    fn post_process_escapes_special_chars() {
        let html = r#"<p>AT&T and R&D</p>"#;
        let mut warnings = Vec::new();
        let out = post_process_pdf_html(html, &mut warnings);
        assert!(out.contains("AT&amp;T"));
        assert!(out.contains("R&amp;D"));
    }

    #[test]
    fn post_process_keeps_image_tags() {
        let html = r#"<p><img src=\"x.png\" alt=\"\"/></p>"#;
        let mut warnings = Vec::new();
        let out = post_process_pdf_html(html, &mut warnings);
        assert!(out.contains("<img"));
    }
}
