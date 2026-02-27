use crate::error::{ShioriError, Result};
use crate::services::renderer::{
    BookMetadata, BookReaderAdapter, Chapter, SearchResult, TocEntry,
};
use async_trait::async_trait;
use docx_rs::*;
use std::fs;

pub struct DocxAdapter {
    path: String,
    metadata: Option<BookMetadata>,
    html_content: String,
    toc: Vec<TocEntry>,
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
                    let is_heading = para.property.style.as_ref().map_or(false, |s| s.val.starts_with("Heading"));
                    let heading_level = if is_heading {
                        let level_str = para.property.style.as_ref().unwrap().val.replace("Heading", "");
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
                                    let safe_text = t.text.replace("<", "&lt;").replace(">", "&gt;");
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
                        html.push_str(&format!("\n<h{} id=\"{}\">{}</h{}>\n", heading_level, id, para_html, heading_level));
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
        
        // Parse DOCX
        let doc = read_docx(&file_data)
            .map_err(|e| ShioriError::Other(format!("Invalid DOCX file: {}", e)))?;
        
        self.path = path.to_string();

        let (html, toc) = Self::generate_html(&doc);
        self.html_content = html;
        self.toc = toc;

        // Basic metadata
        let title = path.split('/').last().unwrap_or("Unknown Document").to_string();
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
        let query_lower = query.to_lowercase();
        let content_lower = self.html_content.to_lowercase();
        let mut results = Vec::new();

        let matches: Vec<_> = content_lower.match_indices(&query_lower).collect();
        if !matches.is_empty() {
            let first_match_pos = matches[0].0;
            let start = first_match_pos.saturating_sub(50);
            let end = (first_match_pos + query.len() + 50).min(self.html_content.len());
            let snippet = format!("...{}...", &self.html_content[start..end]);

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
        Err(ShioriError::Other("DOCX resources not currently exposed natively".into()))
    }

    fn get_resource_mime(&self, _path: &str) -> Result<String> {
        Err(ShioriError::Other("DOCX resources not currently exposed natively".into()))
    }

    fn supports_pagination(&self) -> bool {
        false // Treat as flow
    }

    fn supports_images(&self) -> bool {
        false // Images not supported yet in this basic adapter
    }
    
    async fn render_page(&self, _page_number: usize, _scale: f32) -> Result<Vec<u8>> {
        Err(ShioriError::UnsupportedFeature("DOCX does not support strict pagination rendering natively in Shiori".into()))
    }

    fn get_page_dimensions(&self, _page_number: usize) -> Result<(f32, f32)> {
        Err(ShioriError::UnsupportedFeature("DOCX does not support strict pagination dimensions".into()))
    }

    fn page_count(&self) -> usize {
        0
    }
}
