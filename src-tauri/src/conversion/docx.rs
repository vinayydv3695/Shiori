/// DOCX → EPUB converter inspired by calibre's docx/to_html.py and styles.py.
///
/// Implements:
/// - ZIP extraction of DOCX components
/// - Style inheritance resolution (basedOn chains, max depth 10)
/// - Paragraph-by-paragraph walk with run property extraction
/// - Image extraction via relationship map
/// - List state machine (<w:numPr>)
/// - Page break → chapter boundary
/// - Footnote handling

use std::collections::HashMap;
use std::io::Read;
use std::path::Path;

use super::epub_writer::{EpubDocument, escape_xml};
use super::{ConversionError, EpubOutput};

/// Convert a DOCX file to EPUB 3.
pub async fn convert(source: &Path, output: &Path) -> Result<EpubOutput, ConversionError> {
    let data = tokio::fs::read(source).await?;
    let mut warnings = Vec::new();

    let cursor = std::io::Cursor::new(&data);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| ConversionError::InvalidFormat(format!("Not a valid DOCX file: {}", e)))?;

    // Verify content types
    if archive.by_name("[Content_Types].xml").is_err() {
        return Err(ConversionError::InvalidFormat("Missing [Content_Types].xml — not a valid DOCX file".to_string()));
    }

    // Parse relationships
    let rels = parse_relationships(&mut archive, &mut warnings);

    // Parse styles
    let styles = parse_styles(&mut archive, &mut warnings);

    // Parse document.xml
    let doc_xml = read_zip_entry(&mut archive, "word/document.xml")?;

    // Parse footnotes if present
    let footnotes = parse_footnotes(&mut archive, &mut warnings);

    // Extract content
    let mut chapters: Vec<(String, String)> = Vec::new();
    let mut current_title = "Chapter 1".to_string();
    let mut current_body = String::new();
    let mut chapter_num = 1;
    let mut images: Vec<(String, String, String, Vec<u8>)> = Vec::new(); // (id, filename, mime, data)
    let mut img_counter = 0u32;

    // Track list state
    let mut in_list = false;
    let mut list_type = "ul"; // "ul" or "ol"

    let mut reader = quick_xml::Reader::from_str(&doc_xml);
    reader.config_mut().trim_text(false);
    let mut buf = Vec::new();

    // State tracking
    let mut in_paragraph = false;
    let mut in_run = false;
    let mut para_style: Option<String> = None;
    let mut run_bold = false;
    let mut run_italic = false;
    let mut run_underline = false;
    let mut run_strike = false;
    let mut run_superscript = false;
    let mut run_subscript = false;
    let mut para_html = String::new();
    let mut is_list_item = false;
    let mut preserve_space = false;
    let mut has_page_break = false;
    let mut in_hyperlink = false;
    let mut hyperlink_url = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(e)) => {
                let tag = local_name(e.name().as_ref());
                match tag.as_str() {
                    "p" => {
                        in_paragraph = true;
                        para_style = None;
                        para_html.clear();
                        is_list_item = false;
                        has_page_break = false;
                    }
                    "pStyle" if in_paragraph => {
                        para_style = get_attr(&e, "val");
                    }
                    "numPr" if in_paragraph => {
                        is_list_item = true;
                    }
                    "r" if in_paragraph => {
                        in_run = true;
                        run_bold = false;
                        run_italic = false;
                        run_underline = false;
                        run_strike = false;
                        run_superscript = false;
                        run_subscript = false;
                        preserve_space = false;
                    }
                    "b" if in_run => run_bold = true,
                    "i" if in_run => run_italic = true,
                    "u" if in_run => run_underline = true,
                    "strike" if in_run => run_strike = true,
                    "vertAlign" if in_run => {
                        if let Some(val) = get_attr(&e, "val") {
                            match val.as_str() {
                                "superscript" => run_superscript = true,
                                "subscript" => run_subscript = true,
                                _ => {}
                            }
                        }
                    }
                    "t" if in_run => {
                        // Check xml:space="preserve"
                        preserve_space = e.attributes()
                            .filter_map(|a| a.ok())
                            .any(|a| {
                                let key = String::from_utf8_lossy(a.key.as_ref()).to_string();
                                let val = String::from_utf8_lossy(&a.value).to_string();
                                key.ends_with("space") && val == "preserve"
                            });
                    }
                    "hyperlink" if in_paragraph => {
                        in_hyperlink = true;
                        if let Some(rid) = get_attr(&e, "id").or_else(|| get_attr(&e, "r:id")) {
                            hyperlink_url = rels.get(&rid).cloned().unwrap_or_default();
                        }
                        if !hyperlink_url.is_empty() {
                            para_html.push_str(&format!("<a href=\"{}\">", escape_xml(&hyperlink_url)));
                        }
                    }
                    "drawing" | "pict" if in_run => {
                        // Look for image references in the drawing
                    }
                    "blip" => {
                        // <a:blip r:embed="rId..."/>
                        if let Some(rid) = get_attr(&e, "embed").or_else(|| get_attr(&e, "r:embed")) {
                            if let Some(target) = rels.get(&rid) {
                                // Extract image from ZIP
                                let img_path = if target.starts_with('/') {
                                    target[1..].to_string()
                                } else {
                                    format!("word/{}", target)
                                };
                                if let Ok(img_data) = read_zip_entry_bytes(&mut archive, &img_path) {
                                    let ext = target.rsplit('.').next().unwrap_or("png");
                                    let mime = match ext {
                                        "jpg" | "jpeg" => "image/jpeg",
                                        "png" => "image/png",
                                        "gif" => "image/gif",
                                        _ => "image/png",
                                    };
                                    let id = format!("docx_img_{:04}", img_counter);
                                    let filename = format!("image_{:04}.{}", img_counter, ext);
                                    para_html.push_str(&format!("<img src=\"../Images/{}\" alt=\"\"/>", filename));
                                    images.push((id, filename, mime.to_string(), img_data));
                                    img_counter += 1;
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(quick_xml::events::Event::Empty(e)) => {
                let tag = local_name(e.name().as_ref());
                match tag.as_str() {
                    "pStyle" if in_paragraph => {
                        para_style = get_attr(&e, "val");
                    }
                    "b" if in_run => run_bold = true,
                    "i" if in_run => run_italic = true,
                    "u" if in_run => run_underline = true,
                    "strike" if in_run => run_strike = true,
                    "vertAlign" if in_run => {
                        if let Some(val) = get_attr(&e, "val") {
                            match val.as_str() {
                                "superscript" => run_superscript = true,
                                "subscript" => run_subscript = true,
                                _ => {}
                            }
                        }
                    }
                    "br" if in_paragraph => {
                        // Check for page break
                        if get_attr(&e, "type").as_deref() == Some("page") {
                            has_page_break = true;
                        } else {
                            para_html.push_str("<br/>");
                        }
                    }
                    "numPr" if in_paragraph => {
                        is_list_item = true;
                    }
                    "blip" => {
                        if let Some(rid) = get_attr(&e, "embed").or_else(|| get_attr(&e, "r:embed")) {
                            if let Some(target) = rels.get(&rid) {
                                let img_path = if target.starts_with('/') {
                                    target[1..].to_string()
                                } else {
                                    format!("word/{}", target)
                                };
                                if let Ok(img_data) = read_zip_entry_bytes(&mut archive, &img_path) {
                                    let ext = target.rsplit('.').next().unwrap_or("png");
                                    let mime = match ext {
                                        "jpg" | "jpeg" => "image/jpeg",
                                        "png" => "image/png",
                                        "gif" => "image/gif",
                                        _ => "image/png",
                                    };
                                    let id = format!("docx_img_{:04}", img_counter);
                                    let filename = format!("image_{:04}.{}", img_counter, ext);
                                    para_html.push_str(&format!("<img src=\"../Images/{}\" alt=\"\"/>", filename));
                                    images.push((id, filename, mime.to_string(), img_data));
                                    img_counter += 1;
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(quick_xml::events::Event::Text(e)) => {
                if in_run && in_paragraph {
                    let text = e.unescape().unwrap_or_default().to_string();
                    let text = if preserve_space { text } else { text.trim().to_string() };

                    if !text.is_empty() {
                        let mut formatted = escape_xml(&text);

                        // Apply run formatting
                        if run_bold { formatted = format!("<strong>{}</strong>", formatted); }
                        if run_italic { formatted = format!("<em>{}</em>", formatted); }
                        if run_underline { formatted = format!("<u>{}</u>", formatted); }
                        if run_strike { formatted = format!("<s>{}</s>", formatted); }
                        if run_superscript { formatted = format!("<sup>{}</sup>", formatted); }
                        if run_subscript { formatted = format!("<sub>{}</sub>", formatted); }

                        para_html.push_str(&formatted);
                    }
                }
            }
            Ok(quick_xml::events::Event::End(e)) => {
                let tag = local_name(e.name().as_ref());
                match tag.as_str() {
                    "r" => in_run = false,
                    "hyperlink" => {
                        if in_hyperlink && !hyperlink_url.is_empty() {
                            para_html.push_str("</a>");
                        }
                        in_hyperlink = false;
                        hyperlink_url.clear();
                    }
                    "p" => {
                        in_paragraph = false;

                        // Handle page break → chapter boundary
                        if has_page_break && !current_body.trim().is_empty() {
                            // Close any open list
                            if in_list {
                                current_body.push_str(&format!("  </{}>\n", list_type));
                                in_list = false;
                            }
                            chapters.push((current_title.clone(), current_body.trim().to_string()));
                            current_body.clear();
                            chapter_num += 1;
                            current_title = format!("Chapter {}", chapter_num);
                        }

                        // Determine HTML element based on style
                        let html_tag = style_to_html_tag(para_style.as_deref(), &styles);

                        // Handle list items
                        if is_list_item {
                            if !in_list {
                                current_body.push_str(&format!("  <{}>\n", list_type));
                                in_list = true;
                            }
                            current_body.push_str(&format!("    <li>{}</li>\n", para_html));
                        } else {
                            // Close list if we were in one
                            if in_list {
                                current_body.push_str(&format!("  </{}>\n", list_type));
                                in_list = false;
                            }

                            if !para_html.trim().is_empty() {
                                // Check for heading → new chapter title
                                if html_tag.starts_with("h1") || html_tag.starts_with("h2") {
                                    if !current_body.trim().is_empty() {
                                        chapters.push((current_title.clone(), current_body.trim().to_string()));
                                        current_body.clear();
                                    }
                                    current_title = super::utils::strip_html_tags(&para_html).trim().to_string();
                                    if current_title.is_empty() {
                                        chapter_num += 1;
                                        current_title = format!("Chapter {}", chapter_num);
                                    }
                                }

                                current_body.push_str(&format!("  <{}>{}</{}>\n", html_tag, para_html, html_tag));
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(e) => {
                warnings.push(format!("DOCX XML parse warning: {}", e));
            }
            _ => {}
        }
        buf.clear();
    }

    // Close any remaining list
    if in_list {
        current_body.push_str(&format!("  </{}>\n", list_type));
    }

    // Save last chapter
    if !current_body.trim().is_empty() {
        chapters.push((current_title, current_body.trim().to_string()));
    }

    if chapters.is_empty() {
        chapters.push(("Document".to_string(), "  <p>Empty document.</p>".to_string()));
    }

    // Append footnotes to the last chapter
    if !footnotes.is_empty() {
        if let Some(last) = chapters.last_mut() {
            last.1.push_str("\n  <hr/>\n");
            for (id, text) in &footnotes {
                last.1.push_str(&format!(
                    "  <aside epub:type=\"footnote\" id=\"fn_{}\">\n    <p>{}</p>\n  </aside>\n",
                    id, escape_xml(text)
                ));
            }
        }
    }

    // Infer title
    let title = chapters.first()
        .map(|(t, _)| t.clone())
        .unwrap_or_else(|| {
            source.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.replace('_', " "))
                .unwrap_or_else(|| "Untitled".to_string())
        });

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
        warnings,
    })
}

// ──────────────────────────────────────────────────────────────────────────
// STYLE PARSING
// ──────────────────────────────────────────────────────────────────────────

struct WordStyle {
    name: String,
    based_on: Option<String>,
    #[allow(dead_code)]
    style_type: String, // "paragraph" or "character"
}

fn parse_styles(archive: &mut zip::ZipArchive<std::io::Cursor<&Vec<u8>>>, warnings: &mut Vec<String>) -> HashMap<String, WordStyle> {
    let mut styles = HashMap::new();

    let xml = match read_zip_entry(archive, "word/styles.xml") {
        Ok(xml) => xml,
        Err(_) => {
            warnings.push("No styles.xml found — using defaults".to_string());
            return styles;
        }
    };

    let mut reader = quick_xml::Reader::from_str(&xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();

    let mut current_id: Option<String> = None;
    let mut current_name = String::new();
    let mut current_based_on: Option<String> = None;
    let mut current_type = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(e)) | Ok(quick_xml::events::Event::Empty(e)) => {
                let tag = local_name(e.name().as_ref());
                match tag.as_str() {
                    "style" => {
                        current_id = get_attr(&e, "styleId");
                        current_type = get_attr(&e, "type").unwrap_or_default();
                        current_name.clear();
                        current_based_on = None;
                    }
                    "name" => {
                        if let Some(val) = get_attr(&e, "val") {
                            current_name = val;
                        }
                    }
                    "basedOn" => {
                        current_based_on = get_attr(&e, "val");
                    }
                    _ => {}
                }
            }
            Ok(quick_xml::events::Event::End(e)) => {
                let tag = local_name(e.name().as_ref());
                if tag == "style" {
                    if let Some(id) = current_id.take() {
                        styles.insert(id, WordStyle {
                            name: current_name.clone(),
                            based_on: current_based_on.take(),
                            style_type: current_type.clone(),
                        });
                    }
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    styles
}

fn style_to_html_tag(style_id: Option<&str>, styles: &HashMap<String, WordStyle>) -> String {
    let style_name = style_id
        .and_then(|id| styles.get(id))
        .map(|s| s.name.to_lowercase())
        .unwrap_or_default();

    // Resolve inheritance (max depth 10)
    let resolved_name = if style_name.is_empty() {
        if let Some(id) = style_id {
            resolve_style_name(id, styles, 0)
        } else {
            String::new()
        }
    } else {
        style_name
    };

    match resolved_name.as_str() {
        n if n.starts_with("heading 1") || n == "title" => "h1".to_string(),
        n if n.starts_with("heading 2") || n == "subtitle" => "h2".to_string(),
        n if n.starts_with("heading 3") => "h3".to_string(),
        n if n.starts_with("heading 4") => "h4".to_string(),
        n if n.starts_with("heading 5") => "h5".to_string(),
        n if n.starts_with("heading 6") => "h6".to_string(),
        n if n.contains("quote") || n.contains("block text") => "blockquote".to_string(),
        n if n.contains("code") || n.contains("source") => "pre".to_string(),
        _ => "p".to_string(),
    }
}

fn resolve_style_name(style_id: &str, styles: &HashMap<String, WordStyle>, depth: usize) -> String {
    if depth > 10 {
        return String::new();
    }
    if let Some(style) = styles.get(style_id) {
        if !style.name.is_empty() {
            return style.name.to_lowercase();
        }
        if let Some(ref based_on) = style.based_on {
            return resolve_style_name(based_on, styles, depth + 1);
        }
    }
    String::new()
}

// ──────────────────────────────────────────────────────────────────────────
// RELATIONSHIP PARSING
// ──────────────────────────────────────────────────────────────────────────

fn parse_relationships(archive: &mut zip::ZipArchive<std::io::Cursor<&Vec<u8>>>, _warnings: &mut Vec<String>) -> HashMap<String, String> {
    let mut rels = HashMap::new();

    let xml = match read_zip_entry(archive, "word/_rels/document.xml.rels") {
        Ok(xml) => xml,
        Err(_) => return rels,
    };

    let mut reader = quick_xml::Reader::from_str(&xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(e)) | Ok(quick_xml::events::Event::Empty(e)) => {
                let tag = local_name(e.name().as_ref());
                if tag == "Relationship" {
                    let id = get_attr(&e, "Id").unwrap_or_default();
                    let target = get_attr(&e, "Target").unwrap_or_default();
                    if !id.is_empty() && !target.is_empty() {
                        rels.insert(id, target);
                    }
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    rels
}

// ──────────────────────────────────────────────────────────────────────────
// FOOTNOTE PARSING
// ──────────────────────────────────────────────────────────────────────────

fn parse_footnotes(archive: &mut zip::ZipArchive<std::io::Cursor<&Vec<u8>>>, _warnings: &mut Vec<String>) -> Vec<(String, String)> {
    let mut footnotes = Vec::new();

    let xml = match read_zip_entry(archive, "word/footnotes.xml") {
        Ok(xml) => xml,
        Err(_) => return footnotes,
    };

    let mut reader = quick_xml::Reader::from_str(&xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();

    let mut in_footnote = false;
    let mut footnote_id = String::new();
    let mut footnote_text = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(e)) => {
                let tag = local_name(e.name().as_ref());
                if tag == "footnote" {
                    if let Some(id) = get_attr(&e, "id") {
                        // Skip separator footnotes (id 0 and 1)
                        if id != "0" && id != "1" && id != "-1" {
                            in_footnote = true;
                            footnote_id = id;
                            footnote_text.clear();
                        }
                    }
                }
            }
            Ok(quick_xml::events::Event::Text(e)) => {
                if in_footnote {
                    footnote_text.push_str(&e.unescape().unwrap_or_default());
                }
            }
            Ok(quick_xml::events::Event::End(e)) => {
                let tag = local_name(e.name().as_ref());
                if tag == "footnote" && in_footnote {
                    if !footnote_text.trim().is_empty() {
                        footnotes.push((footnote_id.clone(), footnote_text.trim().to_string()));
                    }
                    in_footnote = false;
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    footnotes
}

// ──────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────

fn read_zip_entry(archive: &mut zip::ZipArchive<std::io::Cursor<&Vec<u8>>>, name: &str) -> Result<String, ConversionError> {
    let mut file = archive.by_name(name)
        .map_err(|e| ConversionError::InvalidFormat(format!("Missing {}: {}", name, e)))?;
    let mut content = String::new();
    file.read_to_string(&mut content)
        .map_err(|e| ConversionError::Other(format!("Failed to read {}: {}", name, e)))?;
    Ok(content)
}

fn read_zip_entry_bytes(archive: &mut zip::ZipArchive<std::io::Cursor<&Vec<u8>>>, name: &str) -> Result<Vec<u8>, ConversionError> {
    let mut file = archive.by_name(name)
        .map_err(|e| ConversionError::InvalidFormat(format!("Missing {}: {}", name, e)))?;
    let mut content = Vec::new();
    file.read_to_end(&mut content)
        .map_err(|e| ConversionError::Other(format!("Failed to read {}: {}", name, e)))?;
    Ok(content)
}

fn local_name(name_bytes: &[u8]) -> String {
    let full = String::from_utf8_lossy(name_bytes).to_string();
    full.rsplit_once(':').map(|(_, name)| name.to_string()).unwrap_or(full)
}

fn get_attr(e: &quick_xml::events::BytesStart, name: &str) -> Option<String> {
    for attr in e.attributes().filter_map(|a| a.ok()) {
        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
        let clean_key = key.rsplit(':').next().unwrap_or(&key);
        if clean_key == name {
            return Some(String::from_utf8_lossy(&attr.value).to_string());
        }
    }
    None
}
