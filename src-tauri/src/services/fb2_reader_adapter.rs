use crate::error::{Result, ShioriError};
use crate::services::renderer::{
    BookMetadata, BookReaderAdapter, Chapter, SearchResult, TocEntry,
};
use async_trait::async_trait;
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use std::fs;

pub struct Fb2ReaderAdapter {
    path: String,
    metadata: Option<BookMetadata>,
    chapters: Vec<Chapter>,
    toc: Vec<TocEntry>,
}

impl Fb2ReaderAdapter {
    pub fn new() -> Self {
        Self {
            path: String::new(),
            metadata: None,
            chapters: Vec::new(),
            toc: Vec::new(),
        }
    }

    /// Extract book title from <title-info><book-title>
    fn extract_book_title(xml: &str) -> Option<String> {
        let mut reader = Reader::from_str(xml);
        reader.config_mut().trim_text(true);
        let mut buf = Vec::new();
        let mut in_title_info = false;
        let mut in_book_title = false;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let name = e.name();
                    if name.as_ref() == b"title-info" {
                        in_title_info = true;
                    } else if in_title_info && name.as_ref() == b"book-title" {
                        in_book_title = true;
                    }
                }
                Ok(Event::End(ref e)) => {
                    let name = e.name();
                    if name.as_ref() == b"title-info" {
                        in_title_info = false;
                    } else if name.as_ref() == b"book-title" {
                        in_book_title = false;
                    }
                }
                Ok(Event::Text(e)) if in_book_title => {
                    if let Ok(txt) = e.unescape() {
                        let t = txt.trim().to_string();
                        if !t.is_empty() {
                            return Some(t);
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }
        None
    }

    /// Extract author from <title-info><author>
    fn extract_author(xml: &str) -> Option<String> {
        let mut reader = Reader::from_str(xml);
        reader.config_mut().trim_text(true);
        let mut buf = Vec::new();
        let mut in_title_info = false;
        let mut in_author = false;
        let mut in_first = false;
        let mut in_middle = false;
        let mut in_last = false;
        let mut first_name = String::new();
        let mut middle_name = String::new();
        let mut last_name = String::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let name = e.name();
                    if name.as_ref() == b"title-info" {
                        in_title_info = true;
                    } else if in_title_info && name.as_ref() == b"author" {
                        in_author = true;
                        first_name.clear();
                        middle_name.clear();
                        last_name.clear();
                    } else if in_author {
                        match name.as_ref() {
                            b"first-name" => in_first = true,
                            b"middle-name" => in_middle = true,
                            b"last-name" => in_last = true,
                            _ => {}
                        }
                    }
                }
                Ok(Event::End(ref e)) => {
                    let name = e.name();
                    if name.as_ref() == b"title-info" {
                        in_title_info = false;
                    } else if name.as_ref() == b"author" && in_author {
                        let mut parts = Vec::new();
                        if !first_name.is_empty() {
                            parts.push(first_name.clone());
                        }
                        if !middle_name.is_empty() {
                            parts.push(middle_name.clone());
                        }
                        if !last_name.is_empty() {
                            parts.push(last_name.clone());
                        }
                        if !parts.is_empty() {
                            return Some(parts.join(" "));
                        }
                        in_author = false;
                    } else if name.as_ref() == b"first-name" {
                        in_first = false;
                    } else if name.as_ref() == b"middle-name" {
                        in_middle = false;
                    } else if name.as_ref() == b"last-name" {
                        in_last = false;
                    }
                }
                Ok(Event::Text(e)) => {
                    if let Ok(txt) = e.unescape() {
                        if in_first {
                            first_name.push_str(txt.trim());
                        } else if in_middle {
                            middle_name.push_str(txt.trim());
                        } else if in_last {
                            last_name.push_str(txt.trim());
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }
        None
    }

    /// Parse FB2 <body> into chapters (each <section> = 1 chapter).
    /// Returns (chapters, toc).
    fn parse_body(xml: &str) -> (Vec<Chapter>, Vec<TocEntry>) {
        let mut reader = Reader::from_str(xml);
        reader.config_mut().trim_text(true);
        let mut buf = Vec::new();

        let mut chapters: Vec<Chapter> = Vec::new();
        let mut toc: Vec<TocEntry> = Vec::new();

        // Track nesting
        let mut in_body = false;
        let mut section_depth = 0; // depth of <section> nesting
        let mut in_title = false;

        // Current section state
        let mut current_html = String::new();
        let mut current_title = String::new();
        let mut title_parts: Vec<String> = Vec::new();

        // Inline formatting stack
        let mut in_emphasis = false;
        let mut in_strong = false;
        let mut in_p = false;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let name_bytes = e.name().as_ref().to_vec();
                    let name = String::from_utf8_lossy(&name_bytes);

                    match name.as_ref() {
                        "body" => {
                            in_body = true;
                        }
                        "section" if in_body => {
                            // If we have a section at depth 0 with content, save it
                            if section_depth == 0 && !current_html.is_empty() {
                                let idx = chapters.len();
                                let title = if current_title.is_empty() {
                                    format!("Section {}", idx + 1)
                                } else {
                                    current_title.clone()
                                };
                                chapters.push(Chapter {
                                    index: idx,
                                    title: title.clone(),
                                    content: format!("<div class=\"fb2-chapter\">{}</div>", current_html),
                                    location: format!("fb2-chapter-{}", idx),
                                });
                                toc.push(TocEntry {
                                    label: title,
                                    location: format!("fb2-chapter-{}", idx),
                                    level: 0,
                                    children: Vec::new(),
                                });
                                current_html.clear();
                                current_title.clear();
                                title_parts.clear();
                            }
                            section_depth += 1;
                        }
                        "title" if in_body && section_depth > 0 => {
                            in_title = true;
                            title_parts.clear();
                        }
                        "p" if in_body => {
                            in_p = true;
                            if in_title {
                                // title <p> — collect text
                            } else {
                                current_html.push_str("<p>");
                            }
                        }
                        "emphasis" if in_body => {
                            in_emphasis = true;
                            if !in_title {
                                current_html.push_str("<em>");
                            }
                        }
                        "strong" if in_body => {
                            in_strong = true;
                            if !in_title {
                                current_html.push_str("<strong>");
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::Empty(ref e)) => {
                    let name_bytes = e.name().as_ref().to_vec();
                    let name = String::from_utf8_lossy(&name_bytes);
                    if name.as_ref() == "empty-line" && in_body && !in_title {
                        current_html.push_str("<br/><br/>");
                    }
                }
                Ok(Event::End(ref e)) => {
                    let name_bytes = e.name().as_ref().to_vec();
                    let name = String::from_utf8_lossy(&name_bytes);

                    match name.as_ref() {
                        "body" => {
                            in_body = false;
                        }
                        "section" if in_body => {
                            section_depth -= 1;
                            if section_depth == 0 {
                                // Save the section as a chapter
                                let idx = chapters.len();
                                let title = if current_title.is_empty() {
                                    format!("Section {}", idx + 1)
                                } else {
                                    current_title.clone()
                                };
                                chapters.push(Chapter {
                                    index: idx,
                                    title: title.clone(),
                                    content: format!("<div class=\"fb2-chapter\">{}</div>", current_html),
                                    location: format!("fb2-chapter-{}", idx),
                                });
                                toc.push(TocEntry {
                                    label: title,
                                    location: format!("fb2-chapter-{}", idx),
                                    level: 0,
                                    children: Vec::new(),
                                });
                                current_html.clear();
                                current_title.clear();
                                title_parts.clear();
                            }
                        }
                        "title" if in_title => {
                            in_title = false;
                            current_title = title_parts.join(" ").trim().to_string();
                        }
                        "p" if in_body => {
                            in_p = false;
                            if !in_title {
                                current_html.push_str("</p>\n");
                            }
                        }
                        "emphasis" if in_body => {
                            in_emphasis = false;
                            if !in_title {
                                current_html.push_str("</em>");
                            }
                        }
                        "strong" if in_body => {
                            in_strong = false;
                            if !in_title {
                                current_html.push_str("</strong>");
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::Text(e)) => {
                    if !in_body {
                        // skip
                    } else if let Ok(txt) = e.unescape() {
                        let safe_text = txt.replace('<', "&lt;").replace('>', "&gt;");
                        if in_title && in_p {
                            title_parts.push(txt.trim().to_string());
                        } else if in_p || in_emphasis || in_strong {
                            current_html.push_str(&safe_text);
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(err) => {
                    log::warn!("Error parsing FB2 body: {:?}", err);
                    break;
                }
                _ => {}
            }
            buf.clear();
        }

        // If no sections were found, treat entire collected content as single chapter
        if chapters.is_empty() && !current_html.is_empty() {
            chapters.push(Chapter {
                index: 0,
                title: "Content".to_string(),
                content: format!("<div class=\"fb2-content\">{}</div>", current_html),
                location: "fb2-chapter-0".to_string(),
            });
            toc.push(TocEntry {
                label: "Content".to_string(),
                location: "fb2-chapter-0".to_string(),
                level: 0,
                children: Vec::new(),
            });
        }

        // Edge case: file has body but no sections and no content collected
        // (e.g. body contains only raw <p> elements without <section>)
        if chapters.is_empty() {
            // Re-parse collecting all body text as a single chapter
            let mut fallback_html = String::new();
            let mut reader2 = Reader::from_str(xml);
            reader2.config_mut().trim_text(true);
            let mut buf2 = Vec::new();
            let mut in_body2 = false;

            loop {
                match reader2.read_event_into(&mut buf2) {
                    Ok(Event::Start(ref e)) => {
                        if e.name().as_ref() == b"body" {
                            in_body2 = true;
                        }
                    }
                    Ok(Event::End(ref e)) => {
                        if e.name().as_ref() == b"body" {
                            in_body2 = false;
                        }
                    }
                    Ok(Event::Text(e)) if in_body2 => {
                        if let Ok(txt) = e.unescape() {
                            let trimmed = txt.trim();
                            if !trimmed.is_empty() {
                                fallback_html.push_str("<p>");
                                fallback_html.push_str(
                                    &trimmed.replace('<', "&lt;").replace('>', "&gt;"),
                                );
                                fallback_html.push_str("</p>\n");
                            }
                        }
                    }
                    Ok(Event::Eof) => break,
                    Err(_) => break,
                    _ => {}
                }
                buf2.clear();
            }

            if !fallback_html.is_empty() {
                chapters.push(Chapter {
                    index: 0,
                    title: "Content".to_string(),
                    content: format!("<div class=\"fb2-content\">{}</div>", fallback_html),
                    location: "fb2-chapter-0".to_string(),
                });
                toc.push(TocEntry {
                    label: "Content".to_string(),
                    location: "fb2-chapter-0".to_string(),
                    level: 0,
                    children: Vec::new(),
                });
            }
        }

        (chapters, toc)
    }

    /// UTF-8-safe search snippet extraction
    fn safe_snippet(content: &str, match_pos: usize, query_char_len: usize) -> String {
        let char_indices: Vec<(usize, char)> = content.char_indices().collect();
        let char_idx = char_indices
            .iter()
            .position(|&(b_idx, _)| b_idx >= match_pos)
            .unwrap_or(0);
        let start_char = char_idx.saturating_sub(50);
        let end_char = (char_idx + query_char_len + 50).min(char_indices.len());
        let start_byte = char_indices
            .get(start_char)
            .map(|&(b, _)| b)
            .unwrap_or(0);
        let end_byte = if end_char >= char_indices.len() {
            content.len()
        } else {
            char_indices[end_char].0
        };
        format!("...{}...", &content[start_byte..end_byte])
    }
}

unsafe impl Send for Fb2ReaderAdapter {}
unsafe impl Sync for Fb2ReaderAdapter {}

#[async_trait]
impl BookReaderAdapter for Fb2ReaderAdapter {
    async fn load(&mut self, path: &str) -> Result<()> {
        let content = fs::read_to_string(path).map_err(ShioriError::Io)?;

        self.path = path.to_string();

        let title = Self::extract_book_title(&content)
            .unwrap_or_else(|| {
                path.split('/')
                    .last()
                    .unwrap_or("Unknown")
                    .to_string()
            });
        let author = Self::extract_author(&content);

        let (chapters, toc) = Self::parse_body(&content);

        let total_chapters = if chapters.is_empty() { 1 } else { chapters.len() };

        self.metadata = Some(BookMetadata {
            title,
            author,
            total_chapters,
            total_pages: None,
            format: "fb2".to_string(),
        });

        self.chapters = chapters;
        self.toc = toc;

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
        self.chapters.get(index).cloned().ok_or_else(|| {
            ShioriError::ChapterReadFailed {
                chapter_index: index,
                cause: format!(
                    "Chapter index {} out of range (total: {})",
                    index,
                    self.chapters.len()
                ),
            }
        })
    }

    fn chapter_count(&self) -> usize {
        self.chapters.len()
    }

    fn search(&self, query: &str) -> Result<Vec<SearchResult>> {
        let query_lower = query.to_lowercase();
        let query_char_len = query.chars().count();
        let mut results = Vec::new();

        for chapter in &self.chapters {
            let content_lower = chapter.content.to_lowercase();
            let matches: Vec<_> = content_lower.match_indices(&query_lower).collect();
            if !matches.is_empty() {
                let snippet =
                    Self::safe_snippet(&chapter.content, matches[0].0, query_char_len);
                results.push(SearchResult {
                    chapter_index: chapter.index,
                    chapter_title: chapter.title.clone(),
                    snippet,
                    location: chapter.location.clone(),
                    match_count: matches.len(),
                });
            }
        }

        Ok(results)
    }

    fn get_resource(&self, _path: &str) -> Result<Vec<u8>> {
        Err(ShioriError::Other(
            "FB2 resources not currently exposed natively".into(),
        ))
    }

    fn get_resource_mime(&self, _path: &str) -> Result<String> {
        Err(ShioriError::Other(
            "FB2 resources not currently exposed natively".into(),
        ))
    }

    fn supports_pagination(&self) -> bool {
        false
    }

    fn supports_images(&self) -> bool {
        false
    }

    async fn render_page(&self, _page_number: usize, _scale: f32) -> Result<Vec<u8>> {
        Err(ShioriError::UnsupportedFeature(
            "FB2 does not support pagination rendering".into(),
        ))
    }

    fn get_page_dimensions(&self, _page_number: usize) -> Result<(f32, f32)> {
        Err(ShioriError::UnsupportedFeature(
            "FB2 does not support page dimensions".into(),
        ))
    }

    fn page_count(&self) -> usize {
        0
    }
}
