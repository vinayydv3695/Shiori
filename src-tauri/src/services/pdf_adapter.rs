use crate::error::{ShioriError, ShioriResult};
use crate::services::renderer::{
    BookMetadata, BookReaderAdapter, Chapter, SearchResult, TocEntry,
};
use async_trait::async_trait;
use lopdf::{Document, Object, content::Content};

pub struct PdfAdapter {
    doc: Option<Document>,
    path: String,
    metadata: Option<BookMetadata>,
    page_count: usize,
    page_ids: Vec<lopdf::ObjectId>,
}

unsafe impl Send for PdfAdapter {}
unsafe impl Sync for PdfAdapter {}

impl PdfAdapter {
    pub fn new() -> Self {
        Self {
            doc: None,
            path: String::new(),
            metadata: None,
            page_count: 0,
            page_ids: Vec::new(),
        }
    }

    fn extract_text_from_page(&self, page_number: usize) -> ShioriResult<String> {
        let doc = self.doc.as_ref().ok_or_else(|| ShioriError::Other("PDF not loaded".into()))?;
        let mut full_text = String::new();
        
        if let Some(page_id) = self.page_ids.get(page_number) {
            if let Ok(content_data) = doc.get_page_content(*page_id) {
                 if let Ok(content) = Content::decode(&content_data) {
                     for operation in content.operations {
                         if operation.operator == "Tj" {
                             if let Some(obj) = operation.operands.get(0) {
                                 if let Some(text) = Self::get_pdf_text(obj) {
                                     full_text.push_str(&text);
                                 }
                             }
                         } else if operation.operator == "TJ" {
                             if let Some(Object::Array(arr)) = operation.operands.get(0) {
                                 for obj in arr {
                                     if let Some(text) = Self::get_pdf_text(obj) {
                                         full_text.push_str(&text);
                                     } else if let Object::Integer(spacing) = obj {
                                         if *spacing < -100 { full_text.push(' '); }
                                     } else if let Object::Real(spacing) = obj {
                                         if *spacing < -100.0 { full_text.push(' '); }
                                     }
                                 }
                             }
                         } else if operation.operator == "T*" || operation.operator == "ET" {
                             full_text.push('\n');
                         } else if operation.operator == "TD" || operation.operator == "Td" {
                             full_text.push('\n');
                         }
                     }
                 }
            }
        }
        
        if full_text.trim().is_empty() {
            Ok(format!("Page {}", page_number + 1))
        } else {
            Ok(full_text)
        }
    }

    fn get_pdf_string(obj: &Object) -> Option<String> {
        match obj {
            Object::String(bytes, _) => {
                String::from_utf8(bytes.clone())
                    .or_else(|_| Ok::<String, ()>(bytes.iter().map(|&b| b as char).collect()))
                    .ok()
            }
            Object::Name(bytes) => String::from_utf8(bytes.clone()).ok(),
            _ => None,
        }
    }
    
    fn get_pdf_text(obj: &Object) -> Option<String> {
        match obj {
            Object::String(_, _) | Object::Name(_) => Self::get_pdf_string(obj),
            Object::Array(arr) => {
                Some(arr.iter()
                    .filter_map(Self::get_pdf_string)
                    .collect::<Vec<_>>()
                    .join(""))
            }
            _ => None,
        }
    }
}

#[async_trait]
impl BookReaderAdapter for PdfAdapter {
    async fn load(&mut self, path: &str) -> ShioriResult<()> {
        let path_str = path.to_string();
        
        // Load in a blocking task using Tauri's runtime to avoid panic
        let doc_result = tauri::async_runtime::spawn_blocking(move || {
            Document::load(&path_str).map_err(|e| ShioriError::CorruptedPdf {
                path: path_str.clone(),
                details: format!("{:?}", e),
            })
        }).await.map_err(|e| ShioriError::Other(format!("Task spawn failed: {:?}", e)))?;

        let doc = doc_result?;
        let page_ids: Vec<_> = doc.get_pages().into_values().collect();
        let page_count = page_ids.len();

        let title = "Unknown Title".to_string();
        let author = None;

        self.metadata = Some(BookMetadata {
            title,
            author,
            total_chapters: page_count,
            total_pages: Some(page_count),
            format: "pdf".to_string(),
        });

        self.page_count = page_count;
        self.page_ids = page_ids;
        self.doc = Some(doc);
        self.path = path.to_string();

        Ok(())
    }

    fn get_metadata(&self) -> ShioriResult<BookMetadata> {
        self.metadata
            .clone()
            .ok_or_else(|| ShioriError::Other("Metadata not loaded".to_string()))
    }

    fn get_toc(&self) -> ShioriResult<Vec<TocEntry>> {
        let toc: Vec<TocEntry> = (0..self.page_count)
            .step_by(10)
            .map(|i| TocEntry {
                label: format!("Page {}", i + 1),
                location: format!("page:{}", i + 1),
                level: 0,
                children: Vec::new(),
            })
            .collect();
        Ok(toc)
    }

    fn get_chapter(&self, index: usize) -> ShioriResult<Chapter> {
        if index >= self.page_count {
            return Err(ShioriError::ChapterReadFailed {
                chapter_index: index,
                cause: "Page index out of bounds".to_string(),
            });
        }
        let content = self.extract_text_from_page(index)?;
        Ok(Chapter {
            index,
            title: format!("Page {}", index + 1),
            content,
            location: format!("page:{}", index + 1),
        })
    }

    fn chapter_count(&self) -> usize {
        self.page_count
    }

    fn search(&self, query: &str) -> ShioriResult<Vec<SearchResult>> {
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();
        for page_num in 0..self.page_count {
            if let Ok(content) = self.extract_text_from_page(page_num) {
                let content_lower = content.to_lowercase();
                let matches: Vec<_> = content_lower.match_indices(&query_lower).collect();
                if !matches.is_empty() {
                    let first_match_pos = matches[0].0;
                    let start = first_match_pos.saturating_sub(50);
                    let end = (first_match_pos + query.len() + 50).min(content.len());
                    let snippet = format!("...{}...", &content[start..end]);
                    results.push(SearchResult {
                        chapter_index: page_num,
                        chapter_title: format!("Page {}", page_num + 1),
                        snippet,
                        location: format!("page:{}", page_num + 1),
                        match_count: matches.len(),
                    });
                }
            }
        }
        Ok(results)
    }

    fn get_resource(&self, _path: &str) -> ShioriResult<Vec<u8>> {
        // Fallback or empty image to avoid errors
        Ok(Vec::new())
    }

    fn get_resource_mime(&self, _path: &str) -> ShioriResult<String> {
        Ok("application/octet-stream".to_string())
    }

    fn supports_pagination(&self) -> bool {
        true
    }

    fn supports_images(&self) -> bool {
        false
    }
    
    async fn render_page(&self, page_number: usize, _scale: f32) -> ShioriResult<Vec<u8>> {
         Err(ShioriError::Other("Native image rendering is configured off for lopdf".into()))
    }

    fn get_page_dimensions(&self, _page_number: usize) -> ShioriResult<(f32, f32)> {
        // Lopdf doesn't easily expose this through a standardized property without checking CropBox, MediaBox, etc.
        // Return standard A4 dimensions roughly as fallback
        Ok((595.0, 842.0))
    }

    fn page_count(&self) -> usize {
        self.page_count
    }
}
