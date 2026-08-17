use crate::error::{Result, ShioriError};
use crate::services::renderer::{
    build_search_snippet, clean_html_for_search, BookMetadata, BookReaderAdapter, Chapter,
    SearchResult, TocEntry,
};
use async_trait::async_trait;
use docx_rs::*;
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use std::fs;
use std::io::Read;

pub struct DocxAdapter {
    path: String,
    metadata: Option<BookMetadata>,
    html_content: String,
    toc: Vec<TocEntry>,
}

/// Result of the fallback ZIP parse for minimal DOCX files.
pub(crate) struct DocxFallback {
    /// Simple HTML rendering of word/document.xml.
    pub html: String,
    /// Plain text of word/document.xml (for word counts etc.).
    pub text: String,
    /// Title from docProps/core.xml <dc:title>, if present.
    pub title: Option<String>,
}

/// Parse a DOCX as a plain ZIP archive without docx-rs.
///
/// docx-rs 0.4 fails on minimal-but-valid DOCX files (e.g. only
/// [Content_Types].xml, _rels/.rels and word/document.xml). This fallback
/// reads word/document.xml directly and converts it to simple HTML
/// (`<w:p>` -> `<p>`, `<w:t>` -> escaped text, `<w:br>` -> `<br>`,
/// `<w:tab>` -> non-breaking spaces; other elements' tags are dropped but
/// their text is kept), and pulls the title from docProps/core.xml.
///
/// Returns None only when the file is not a readable ZIP or lacks
/// word/document.xml. Missing optional parts yield empty text, not an error.
pub(crate) fn parse_docx_zip(file_data: &[u8]) -> Option<DocxFallback> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(file_data)).ok()?;

    let mut document_xml: Option<Vec<u8>> = None;
    let mut core_xml: Option<Vec<u8>> = None;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).ok()?;
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).ok()?;
        match entry.name() {
            "word/document.xml" => document_xml = Some(buf),
            "docProps/core.xml" => core_xml = Some(buf),
            _ => {}
        }
    }

    let document_xml = document_xml?;
    let html = docx_xml_to_html(&document_xml);
    let text = docx_xml_to_text(&document_xml);
    let title = core_xml.as_deref().and_then(docx_core_title);

    Some(DocxFallback { html, text, title })
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn is_whitespace_only(s: &str) -> bool {
    s.chars().all(char::is_whitespace)
}

/// Convert word/document.xml into simple HTML. Whitespace-only text nodes
/// (XML indentation) are skipped so pretty-printed files parse cleanly.
fn docx_xml_to_html(xml: &[u8]) -> String {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut html = String::new();
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"w:p" => html.push_str("<p>"),
                b"w:br" => html.push_str("<br>"),
                b"w:tab" => html.push_str("&nbsp;&nbsp;"),
                _ => {}
            },
            Ok(Event::Empty(e)) => match e.name().as_ref() {
                b"w:br" => html.push_str("<br>"),
                b"w:tab" => html.push_str("&nbsp;&nbsp;"),
                _ => {}
            },
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"w:p" {
                    html.push_str("</p>");
                }
            }
            Ok(Event::Text(e)) => {
                if let Ok(txt) = e.unescape() {
                    if !is_whitespace_only(&txt) {
                        html.push_str(&escape_html(&txt));
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    html
}

/// Extract plain text from word/document.xml (paragraph breaks become \n).
fn docx_xml_to_text(xml: &[u8]) -> String {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut text = String::new();
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                if e.name().as_ref() == b"w:p" && !text.is_empty() && !text.ends_with('\n') {
                    text.push('\n');
                }
            }
            Ok(Event::Empty(e)) => match e.name().as_ref() {
                b"w:br" => text.push('\n'),
                b"w:tab" => text.push(' '),
                _ => {}
            },
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"w:p" {
                    text.push('\n');
                }
            }
            Ok(Event::Text(e)) => {
                if let Ok(txt) = e.unescape() {
                    if !is_whitespace_only(&txt) {
                        text.push_str(&txt);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    text
}

/// Extract <dc:title> from docProps/core.xml.
fn docx_core_title(xml: &[u8]) -> Option<String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut in_title = false;
    let mut title = String::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                if e.name().as_ref() == b"dc:title" {
                    in_title = true;
                }
            }
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"dc:title" {
                    break;
                }
            }
            Ok(Event::Text(e)) if in_title => {
                if let Ok(t) = e.unescape() {
                    title.push_str(&t);
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    let title = title.trim().to_string();
    if title.is_empty() {
        None
    } else {
        Some(title)
    }
}

impl DocxAdapter {
    pub fn new() -> Self {
        Self {
            path: String::new(),
            metadata: None,
            html_content: String::new(),
            toc: Vec::new(),
        }
    }

    fn generate_html(doc: &Docx) -> (String, Vec<TocEntry>) {
        let mut html = String::new();
        let mut toc = Vec::new();
        let mut toc_counter = 0;

        html.push_str("<div class=\"docx-content\">\n");

        for child in &doc.document.children {
            match child {
                DocumentChild::Paragraph(para) => {
                    let is_heading = para
                        .property
                        .style
                        .as_ref()
                        .map_or(false, |s| s.val.starts_with("Heading"));
                    let heading_level = if is_heading {
                        // is_heading guarantees style is Some; be defensive anyway
                        let level_str = para
                            .property
                            .style
                            .as_ref()
                            .map(|s| s.val.replace("Heading", ""))
                            .unwrap_or_default();
                        level_str.parse::<u8>().unwrap_or(2)
                    } else {
                        0
                    };

                    let mut para_html = String::new();
                    let mut para_text_only = String::new();

                    for run_child in &para.children {
                        if let ParagraphChild::Run(run) = run_child {
                            let is_bold = run.run_property.bold.is_some();
                            let is_italic = run.run_property.italic.is_some();

                            let mut tag_open = String::new();
                            let mut tag_close = String::new();

                            if is_bold {
                                tag_open.push_str("<strong>");
                                tag_close.insert_str(0, "</strong>");
                            }
                            if is_italic {
                                tag_open.push_str("<em>");
                                tag_close.insert_str(0, "</em>");
                            }

                            for r_child in &run.children {
                                if let RunChild::Text(t) = r_child {
                                    let safe_text =
                                        t.text.replace("<", "&lt;").replace(">", "&gt;");
                                    para_html.push_str(&tag_open);
                                    para_html.push_str(&safe_text);
                                    para_html.push_str(&tag_close);
                                    para_text_only.push_str(&t.text);
                                }
                            }
                        }
                    }

                    if is_heading && !para_text_only.trim().is_empty() {
                        let id = format!("heading-{}", toc_counter);
                        toc.push(TocEntry {
                            label: para_text_only.trim().to_string(),
                            location: id.clone(),
                            level: heading_level as usize,
                            children: Vec::new(),
                        });
                        toc_counter += 1;
                        html.push_str(&format!(
                            "\n<h{} id=\"{}\">{}</h{}>\n",
                            heading_level, id, para_html, heading_level
                        ));
                    } else {
                        html.push_str(&format!("<p>{}</p>\n", para_html));
                    }
                }
                DocumentChild::Table(_table) => {
                    // Simple table placeholder
                    html.push_str("<div class=\"docx-table\">[Table Content]</div>\n");
                }
                _ => {}
            }
        }

        html.push_str("</div>\n");

        (html, toc)
    }
}

unsafe impl Send for DocxAdapter {}
unsafe impl Sync for DocxAdapter {}

#[async_trait]
impl BookReaderAdapter for DocxAdapter {
    async fn load(&mut self, path: &str) -> Result<()> {
        let file_data = fs::read(path).map_err(|e| ShioriError::Io(e))?;

        // Parse DOCX. docx-rs 0.4 cannot parse minimal-but-valid DOCX files
        // (only [Content_Types].xml, _rels/.rels, word/document.xml); fall
        // back to a direct ZIP + quick-xml parse in that case.
        let (html, toc, fallback_title) = match read_docx(&file_data) {
            Ok(doc) => {
                let (html, toc) = Self::generate_html(&doc);
                (html, toc, None)
            }
            Err(e) => {
                let fallback = parse_docx_zip(&file_data)
                    .ok_or_else(|| ShioriError::Other(format!("Invalid DOCX file: {}", e)))?;
                let toc = vec![TocEntry {
                    label: fallback
                        .title
                        .clone()
                        .unwrap_or_else(|| "Document".to_string()),
                    location: "docx:start".to_string(),
                    level: 1,
                    children: Vec::new(),
                }];
                (fallback.html, toc, fallback.title)
            }
        };

        self.path = path.to_string();
        self.html_content = html;
        self.toc = toc;

        // Basic metadata
        let title = fallback_title.unwrap_or_else(|| {
            path.split('/')
                .last()
                .unwrap_or("Unknown Document")
                .to_string()
        });
        self.metadata = Some(BookMetadata {
            title,
            author: None,
            total_chapters: 1, // Treat as a single chapter
            total_pages: None,
            format: "docx".to_string(),
        });

        Ok(())
    }

    fn get_metadata(&self) -> Result<BookMetadata> {
        self.metadata
            .clone()
            .ok_or_else(|| ShioriError::Other("Metadata not loaded".to_string()))
    }

    fn get_toc(&self) -> Result<Vec<TocEntry>> {
        Ok(self.toc.clone())
    }

    fn get_chapter(&self, index: usize) -> Result<Chapter> {
        if index > 0 {
            return Err(ShioriError::ChapterReadFailed {
                chapter_index: index,
                cause: "DOCX is parsed as a single continuous chapter".to_string(),
            });
        }

        Ok(Chapter {
            index: 0,
            title: "Document".to_string(),
            content: self.html_content.clone(),
            location: "docx:start".to_string(),
        })
    }

    fn chapter_count(&self) -> usize {
        1
    }

    fn search(&self, query: &str) -> Result<Vec<SearchResult>> {
        let query_trim = query.trim();
        if query_trim.is_empty() {
            return Ok(Vec::new());
        }

        let query_lower = query_trim.to_lowercase();
        let query_char_count = query_trim.chars().count();
        let mut results = Vec::new();

        let content = clean_html_for_search(&self.html_content);
        if content.is_empty() {
            return Ok(Vec::new());
        }

        let content_lower = content.to_lowercase();
        let matches: Vec<_> = content_lower.match_indices(&query_lower).collect();
        if !matches.is_empty() {
            let first_match_pos = matches[0].0;
            let snippet = build_search_snippet(&content, first_match_pos, query_char_count, 60);

            results.push(SearchResult {
                chapter_index: 0,
                chapter_title: "Document".to_string(),
                snippet,
                location: "docx:start".to_string(),
                match_count: matches.len(),
            });
        }

        Ok(results)
    }

    fn get_resource(&self, _path: &str) -> Result<Vec<u8>> {
        Err(ShioriError::Other(
            "DOCX resources not currently exposed natively".into(),
        ))
    }

    fn get_resource_mime(&self, _path: &str) -> Result<String> {
        Err(ShioriError::Other(
            "DOCX resources not currently exposed natively".into(),
        ))
    }

    fn supports_pagination(&self) -> bool {
        false // Treat as flow
    }

    fn supports_images(&self) -> bool {
        false // Images not supported yet in this basic adapter
    }

    async fn render_page(&self, _page_number: usize, _scale: f32) -> Result<Vec<u8>> {
        Err(ShioriError::UnsupportedFeature(
            "DOCX does not support strict pagination rendering natively in Shiori".into(),
        ))
    }

    fn get_page_dimensions(&self, _page_number: usize) -> Result<(f32, f32)> {
        Err(ShioriError::UnsupportedFeature(
            "DOCX does not support strict pagination dimensions".into(),
        ))
    }

    fn page_count(&self) -> usize {
        0
    }
}
