use crate::error::{Result, ShioriError};
use crate::services::renderer::{
    BookMetadata, BookReaderAdapter, Chapter, SearchResult, TocEntry,
};
use async_trait::async_trait;
use std::fs;

pub struct TxtReaderAdapter {
    path: String,
    metadata: Option<BookMetadata>,
    html_content: String,
}

impl TxtReaderAdapter {
    pub fn new() -> Self {
        Self {
            path: String::new(),
            metadata: None,
            html_content: String::new(),
        }
    }

    fn text_to_html(text: &str) -> String {
        let mut html = String::with_capacity(text.len() + text.len() / 4);
        html.push_str("<div class=\"txt-content\">\n");

        let paragraphs: Vec<&str> = text.split("\n\n").collect();

        for para in paragraphs {
            let trimmed = para.trim();
            if trimmed.is_empty() {
                continue;
            }
            let escaped = trimmed
                .replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;");
            let with_br = escaped.replace('\n', "<br>\n");
            html.push_str("<p>");
            html.push_str(&with_br);
            html.push_str("</p>\n");
        }

        html.push_str("</div>\n");
        html
    }
}

unsafe impl Send for TxtReaderAdapter {}
unsafe impl Sync for TxtReaderAdapter {}

#[async_trait]
impl BookReaderAdapter for TxtReaderAdapter {
    async fn load(&mut self, path: &str) -> Result<()> {
        let content = fs::read_to_string(path).map_err(ShioriError::Io)?;
        self.path = path.to_string();

        self.html_content = Self::text_to_html(&content);

        let title = path
            .split('/')
            .last()
            .unwrap_or("Unknown Document")
            .to_string();

        self.metadata = Some(BookMetadata {
            title,
            author: None,
            total_chapters: 1,
            total_pages: None,
            format: "txt".to_string(),
        });

        Ok(())
    }

    fn get_metadata(&self) -> Result<BookMetadata> {
        self.metadata
            .clone()
            .ok_or_else(|| ShioriError::Other("Metadata not loaded".to_string()))
    }

    fn get_toc(&self) -> Result<Vec<TocEntry>> {
        Ok(vec![TocEntry {
            label: "Start".to_string(),
            location: "txt:start".to_string(),
            level: 0,
            children: Vec::new(),
        }])
    }

    fn get_chapter(&self, index: usize) -> Result<Chapter> {
        if index > 0 {
            return Err(ShioriError::ChapterReadFailed {
                chapter_index: index,
                cause: "TXT is parsed as a single continuous chapter".to_string(),
            });
        }

        Ok(Chapter {
            index: 0,
            title: "Content".to_string(),
            content: self.html_content.clone(),
            location: "txt:start".to_string(),
        })
    }

    fn chapter_count(&self) -> usize {
        1
    }

    fn search(&self, query: &str) -> Result<Vec<SearchResult>> {
        let query_lower = query.to_lowercase();
        let content_lower = self.html_content.to_lowercase();
        let mut results = Vec::new();

        let matches: Vec<_> = content_lower.match_indices(&query_lower).collect();
        if !matches.is_empty() {
            let first_match_pos = matches[0].0;
            let char_indices: Vec<(usize, char)> = self.html_content.char_indices().collect();
            let char_idx = char_indices
                .iter()
                .position(|&(b_idx, _)| b_idx >= first_match_pos)
                .unwrap_or(0);
            let start_char_idx = char_idx.saturating_sub(50);
            let end_char_idx =
                (char_idx + query.chars().count() + 50).min(char_indices.len());
            let start_byte = char_indices
                .get(start_char_idx)
                .map(|&(b, _)| b)
                .unwrap_or(0);
            let end_byte = if end_char_idx >= char_indices.len() {
                self.html_content.len()
            } else {
                char_indices[end_char_idx].0
            };

            let snippet = format!(
                "...{}...",
                &self.html_content[start_byte..end_byte]
            );

            results.push(SearchResult {
                chapter_index: 0,
                chapter_title: "Content".to_string(),
                snippet,
                location: "txt:start".to_string(),
                match_count: matches.len(),
            });
        }

        Ok(results)
    }

    fn get_resource(&self, _path: &str) -> Result<Vec<u8>> {
        Err(ShioriError::Other(
            "TXT resources not supported".into(),
        ))
    }

    fn get_resource_mime(&self, _path: &str) -> Result<String> {
        Err(ShioriError::Other(
            "TXT resources not supported".into(),
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
            "TXT does not support pagination rendering".into(),
        ))
    }

    fn get_page_dimensions(&self, _page_number: usize) -> Result<(f32, f32)> {
        Err(ShioriError::UnsupportedFeature(
            "TXT does not support page dimensions".into(),
        ))
    }

    fn page_count(&self) -> usize {
        0
    }
}
