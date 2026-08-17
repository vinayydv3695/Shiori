use crate::error::{Result, ShioriError};
use crate::services::renderer::{
    build_search_snippet, clean_html_for_search, BookMetadata, BookReaderAdapter, Chapter,
    SearchResult, TocEntry,
};
use async_trait::async_trait;
use regex::Regex;
use std::fs;

pub struct HtmlReaderAdapter {
    path: String,
    metadata: Option<BookMetadata>,
    chapters: Vec<Chapter>,
    toc: Vec<TocEntry>,
}

impl HtmlReaderAdapter {
    pub fn new() -> Self {
        Self {
            path: String::new(),
            metadata: None,
            chapters: Vec::new(),
            toc: Vec::new(),
        }
    }

    fn extract_title(html: &str) -> Option<String> {
        let re = Regex::new(r"(?i)<title[^>]*>(.*?)</title>").ok()?;
        re.captures(html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim().to_string())
            .filter(|s| !s.is_empty())
    }

    fn split_into_chapters(html: &str) -> (Vec<Chapter>, Vec<TocEntry>) {
        // Static patterns — never fail, but avoid panicking if they somehow do.
        let Some(heading_re) = Regex::new(r"(?i)<h([1-3])([^>]*)>(.*?)</h[1-3]>").ok() else {
            // Degrade gracefully: single flat chapter
            return (
                vec![Chapter {
                    index: 0,
                    title: "Content".to_string(),
                    content: format!("<div class=\"html-chapter\">{}</div>", html),
                    location: "html-chapter-0".to_string(),
                }],
                vec![TocEntry {
                    label: "Content".to_string(),
                    location: "html-chapter-0".to_string(),
                    level: 0,
                    children: Vec::new(),
                }],
            );
        };
        let strip_re = Regex::new(r"<[^>]+>").ok();
        let mut chapters: Vec<Chapter> = Vec::new();
        let mut toc: Vec<TocEntry> = Vec::new();

        let heading_matches: Vec<_> = heading_re.find_iter(html).collect();

        if heading_matches.is_empty() {
            chapters.push(Chapter {
                index: 0,
                title: "Content".to_string(),
                content: format!("<div class=\"html-chapter\">{}</div>", html),
                location: "html-chapter-0".to_string(),
            });
            toc.push(TocEntry {
                label: "Content".to_string(),
                location: "html-chapter-0".to_string(),
                level: 0,
                children: Vec::new(),
            });
            return (chapters, toc);
        }

        // Content before first heading
        let first_start = heading_matches[0].start();
        if first_start > 0 {
            let preamble = html[..first_start].trim();
            if !preamble.is_empty() {
                let idx = chapters.len();
                chapters.push(Chapter {
                    index: idx,
                    title: "Introduction".to_string(),
                    content: format!("<div class=\"html-chapter\">{}</div>", preamble),
                    location: format!("html-chapter-{}", idx),
                });
                toc.push(TocEntry {
                    label: "Introduction".to_string(),
                    location: format!("html-chapter-{}", idx),
                    level: 0,
                    children: Vec::new(),
                });
            }
        }

        for (i, heading_match) in heading_matches.iter().enumerate() {
            let Some(caps) = heading_re.captures(heading_match.as_str()) else {
                continue;
            };
            let level: usize = caps[1].parse().unwrap_or(1);
            let heading_text = caps[3].to_string();
            let plain_text = strip_re
                .as_ref()
                .map(|re| re.replace_all(&heading_text, "").trim().to_string())
                .unwrap_or_else(|| heading_text.trim().to_string());

            let section_start = heading_match.start();
            let section_end = if i + 1 < heading_matches.len() {
                heading_matches[i + 1].start()
            } else {
                html.len()
            };

            let section_content = &html[section_start..section_end];
            let idx = chapters.len();

            chapters.push(Chapter {
                index: idx,
                title: if plain_text.is_empty() {
                    format!("Section {}", idx + 1)
                } else {
                    plain_text.clone()
                },
                content: format!("<div class=\"html-chapter\">{}</div>", section_content),
                location: format!("html-chapter-{}", idx),
            });

            toc.push(TocEntry {
                label: if plain_text.is_empty() {
                    format!("Section {}", idx + 1)
                } else {
                    plain_text
                },
                location: format!("html-chapter-{}", idx),
                level: level.saturating_sub(1),
                children: Vec::new(),
            });
        }

        (chapters, toc)
    }
}

unsafe impl Send for HtmlReaderAdapter {}
unsafe impl Sync for HtmlReaderAdapter {}

#[async_trait]
impl BookReaderAdapter for HtmlReaderAdapter {
    async fn load(&mut self, path: &str) -> Result<()> {
        let content = fs::read_to_string(path).map_err(ShioriError::Io)?;
        self.path = path.to_string();

        let title = Self::extract_title(&content)
            .unwrap_or_else(|| path.split('/').last().unwrap_or("Unknown").to_string());

        let (chapters, toc) = Self::split_into_chapters(&content);

        self.metadata = Some(BookMetadata {
            title,
            author: None,
            total_chapters: chapters.len(),
            total_pages: None,
            format: "html".to_string(),
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
        self.chapters
            .get(index)
            .cloned()
            .ok_or_else(|| ShioriError::ChapterReadFailed {
                chapter_index: index,
                cause: format!(
                    "Chapter index {} out of range (total: {})",
                    index,
                    self.chapters.len()
                ),
            })
    }

    fn chapter_count(&self) -> usize {
        self.chapters.len()
    }

    fn search(&self, query: &str) -> Result<Vec<SearchResult>> {
        let query_trim = query.trim();
        if query_trim.is_empty() {
            return Ok(Vec::new());
        }

        let query_lower = query_trim.to_lowercase();
        let query_char_len = query_trim.chars().count();
        let mut results = Vec::new();

        for chapter in &self.chapters {
            let content = clean_html_for_search(&chapter.content);
            if content.is_empty() {
                continue;
            }
            let content_lower = content.to_lowercase();
            let matches: Vec<_> = content_lower.match_indices(&query_lower).collect();
            if !matches.is_empty() {
                let snippet = build_search_snippet(&content, matches[0].0, query_char_len, 60);
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
            "HTML resources not currently exposed natively".into(),
        ))
    }

    fn get_resource_mime(&self, _path: &str) -> Result<String> {
        Err(ShioriError::Other(
            "HTML resources not currently exposed natively".into(),
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
            "HTML does not support pagination rendering".into(),
        ))
    }

    fn get_page_dimensions(&self, _page_number: usize) -> Result<(f32, f32)> {
        Err(ShioriError::UnsupportedFeature(
            "HTML does not support page dimensions".into(),
        ))
    }

    fn page_count(&self) -> usize {
        0
    }
}
