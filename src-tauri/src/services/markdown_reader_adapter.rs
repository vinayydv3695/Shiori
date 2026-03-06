use crate::error::{Result, ShioriError};
use crate::services::renderer::{
    BookMetadata, BookReaderAdapter, Chapter, SearchResult, TocEntry,
};
use async_trait::async_trait;
use pulldown_cmark::{html, Options, Parser};
use regex::Regex;
use std::fs;

pub struct MarkdownReaderAdapter {
    path: String,
    metadata: Option<BookMetadata>,
    chapters: Vec<Chapter>,
    toc: Vec<TocEntry>,
}

impl MarkdownReaderAdapter {
    pub fn new() -> Self {
        Self {
            path: String::new(),
            metadata: None,
            chapters: Vec::new(),
            toc: Vec::new(),
        }
    }

    fn md_to_html(markdown: &str) -> String {
        let options = Options::all();
        let parser = Parser::new_ext(markdown, options);
        let mut html_output = String::new();
        html::push_html(&mut html_output, parser);
        html_output
    }

    fn extract_first_heading(markdown: &str) -> Option<String> {
        for line in markdown.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("# ") {
                let heading = rest.trim().to_string();
                if !heading.is_empty() {
                    return Some(heading);
                }
            }
        }
        None
    }

    fn split_html_by_headings(html_content: &str) -> (Vec<Chapter>, Vec<TocEntry>) {
        let heading_re = Regex::new(r"(?i)<h([1-3])([^>]*)>(.*?)</h[1-3]>").unwrap();
        let strip_tags = Regex::new(r"<[^>]+>").unwrap();

        let mut chapters: Vec<Chapter> = Vec::new();
        let mut toc: Vec<TocEntry> = Vec::new();

        let heading_matches: Vec<_> = heading_re.find_iter(html_content).collect();

        if heading_matches.is_empty() {
            chapters.push(Chapter {
                index: 0,
                title: "Content".to_string(),
                content: format!("<div class=\"md-chapter\">{}</div>", html_content),
                location: "md-chapter-0".to_string(),
            });
            toc.push(TocEntry {
                label: "Content".to_string(),
                location: "md-chapter-0".to_string(),
                level: 0,
                children: Vec::new(),
            });
            return (chapters, toc);
        }

        let first_start = heading_matches[0].start();
        if first_start > 0 {
            let preamble = html_content[..first_start].trim();
            if !preamble.is_empty() {
                let idx = chapters.len();
                chapters.push(Chapter {
                    index: idx,
                    title: "Introduction".to_string(),
                    content: format!("<div class=\"md-chapter\">{}</div>", preamble),
                    location: format!("md-chapter-{}", idx),
                });
                toc.push(TocEntry {
                    label: "Introduction".to_string(),
                    location: format!("md-chapter-{}", idx),
                    level: 0,
                    children: Vec::new(),
                });
            }
        }

        for (i, heading_match) in heading_matches.iter().enumerate() {
            let caps = heading_re.captures(heading_match.as_str()).unwrap();
            let level: usize = caps[1].parse().unwrap_or(1);
            let heading_html = &caps[3];
            let plain_text = strip_tags
                .replace_all(heading_html, "")
                .trim()
                .to_string();

            let section_start = heading_match.start();
            let section_end = if i + 1 < heading_matches.len() {
                heading_matches[i + 1].start()
            } else {
                html_content.len()
            };

            let section_content = &html_content[section_start..section_end];
            let idx = chapters.len();

            chapters.push(Chapter {
                index: idx,
                title: if plain_text.is_empty() {
                    format!("Section {}", idx + 1)
                } else {
                    plain_text.clone()
                },
                content: format!("<div class=\"md-chapter\">{}</div>", section_content),
                location: format!("md-chapter-{}", idx),
            });

            toc.push(TocEntry {
                label: if plain_text.is_empty() {
                    format!("Section {}", idx + 1)
                } else {
                    plain_text
                },
                location: format!("md-chapter-{}", idx),
                level: level.saturating_sub(1),
                children: Vec::new(),
            });
        }

        (chapters, toc)
    }

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

unsafe impl Send for MarkdownReaderAdapter {}
unsafe impl Sync for MarkdownReaderAdapter {}

#[async_trait]
impl BookReaderAdapter for MarkdownReaderAdapter {
    async fn load(&mut self, path: &str) -> Result<()> {
        let markdown = fs::read_to_string(path).map_err(ShioriError::Io)?;
        self.path = path.to_string();

        let title = Self::extract_first_heading(&markdown).unwrap_or_else(|| {
            path.split('/')
                .last()
                .unwrap_or("Unknown")
                .to_string()
        });

        let html_content = Self::md_to_html(&markdown);
        let (chapters, toc) = Self::split_html_by_headings(&html_content);

        self.metadata = Some(BookMetadata {
            title,
            author: None,
            total_chapters: chapters.len(),
            total_pages: None,
            format: "markdown".to_string(),
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
            "Markdown resources not currently exposed natively".into(),
        ))
    }

    fn get_resource_mime(&self, _path: &str) -> Result<String> {
        Err(ShioriError::Other(
            "Markdown resources not currently exposed natively".into(),
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
            "Markdown does not support pagination rendering".into(),
        ))
    }

    fn get_page_dimensions(&self, _page_number: usize) -> Result<(f32, f32)> {
        Err(ShioriError::UnsupportedFeature(
            "Markdown does not support page dimensions".into(),
        ))
    }

    fn page_count(&self) -> usize {
        0
    }
}
