use crate::error::{Result, ShioriError};
use crate::services::renderer::{BookMetadata, BookReaderAdapter, Chapter, SearchResult, TocEntry};
use async_trait::async_trait;
use lopdf::{content::Content, Document, Object};

pub struct PdfAdapter {
    doc: Option<Document>,
    path: String,
    metadata: Option<BookMetadata>,
    page_count: usize,
    page_ids: Vec<lopdf::ObjectId>,
    /// Per-page extracted text (pdf-extract), computed lazily on the first
    /// search (the only consumer) via a file-backed extractor — no second
    /// whole-file read at load time. Empty when the PDF has no text layer
    /// (scanned pages).
    page_texts: std::sync::OnceLock<Vec<String>>,
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
            page_texts: std::sync::OnceLock::new(),
        }
    }

    fn extract_text_from_page(&self, page_number: usize) -> Result<String> {
        let doc = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("PDF not loaded".into()))?;
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
                                        if *spacing < -100 {
                                            full_text.push(' ');
                                        }
                                    } else if let Object::Real(spacing) = obj {
                                        if *spacing < -100.0 {
                                            full_text.push(' ');
                                        }
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
            Object::String(bytes, _) => String::from_utf8(bytes.clone())
                .or_else(|_| Ok::<String, ()>(bytes.iter().map(|&b| b as char).collect()))
                .ok(),
            Object::Name(bytes) => String::from_utf8(bytes.clone()).ok(),
            _ => None,
        }
    }

    fn get_pdf_text(obj: &Object) -> Option<String> {
        match obj {
            Object::String(_, _) | Object::Name(_) => Self::get_pdf_string(obj),
            Object::Array(arr) => Some(
                arr.iter()
                    .filter_map(Self::get_pdf_string)
                    .collect::<Vec<_>>()
                    .join(""),
            ),
            _ => None,
        }
    }
}

#[async_trait]
impl BookReaderAdapter for PdfAdapter {
    async fn load(&mut self, path: &str) -> Result<()> {
        let path_str = path.to_string();

        // Load in a blocking task using Tauri's runtime to avoid panic
        let doc_result = tauri::async_runtime::spawn_blocking(move || {
            Document::load(&path_str).map_err(|e| ShioriError::CorruptedPdf {
                path: path_str.clone(),
                details: format!("{:?}", e),
            })
        })
        .await
        .map_err(|e| ShioriError::Other(format!("Task spawn failed: {:?}", e)))?;

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

    fn get_metadata(&self) -> Result<BookMetadata> {
        self.metadata
            .clone()
            .ok_or_else(|| ShioriError::Other("Metadata not loaded".to_string()))
    }

    fn get_toc(&self) -> Result<Vec<TocEntry>> {
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

    fn get_chapter(&self, index: usize) -> Result<Chapter> {
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

    fn search(&self, query: &str) -> Result<Vec<SearchResult>> {
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();
        // Lazy, file-backed pdf-extract text — computed once, on first search.
        let page_texts: Vec<String> = self.page_texts.get_or_init(|| {
            let mut page_texts: Vec<String> = Vec::new();
            match pdf_extract::extract_text_by_pages(&self.path) {
                Ok(pages) if pages.iter().any(|p| !p.trim().is_empty()) => {
                    page_texts = pages;
                }
                _ => {
                    // by_pages empty (common for many real-world PDFs) — fall
                    // back to the whole-document extractor as a single "page".
                    if let Ok(all) = pdf_extract::extract_text(&self.path) {
                        if !all.trim().is_empty() {
                            page_texts.push(all);
                        }
                    }
                }
            }
            page_texts
        }).clone();
        // Same fallback as before: lopdf per-page walk when pdf-extract
        // produced nothing (scanned / exotic PDFs).
        let text_pages: Vec<String> = if page_texts.is_empty() {
            (0..self.page_count)
                .filter_map(|n| self.extract_text_from_page(n).ok())
                .collect()
        } else {
            page_texts
        };
        for (page_num, content) in text_pages.iter().enumerate() {
            {
                let content_lower = content.to_lowercase();
                let matches: Vec<_> = content_lower.match_indices(&query_lower).collect();
                if !matches.is_empty() {
                    let first_match_pos = matches[0].0;

                    // Safely slice using character boundaries to avoid panics on multi-byte UTF-8
                    let char_indices: Vec<(usize, char)> = content.char_indices().collect();
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
                        content.len()
                    } else {
                        char_indices[end_char_idx].0
                    };

                    let snippet = format!("...{}...", &content[start_byte..end_byte]);
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

    fn get_resource(&self, _path: &str) -> Result<Vec<u8>> {
        // Fallback or empty image to avoid errors
        Ok(Vec::new())
    }

    fn get_resource_mime(&self, _path: &str) -> Result<String> {
        Ok("application/octet-stream".to_string())
    }

    fn supports_pagination(&self) -> bool {
        true
    }

    fn supports_images(&self) -> bool {
        false
    }

    async fn render_page(&self, _page_number: usize, _scale: f32) -> Result<Vec<u8>> {
        Err(ShioriError::Other(
            "Native image rendering is configured off for lopdf".into(),
        ))
    }

    fn get_page_dimensions(&self, _page_number: usize) -> Result<(f32, f32)> {
        // Lopdf doesn't easily expose this through a standardized property without checking CropBox, MediaBox, etc.
        // Return standard A4 dimensions roughly as fallback
        Ok((595.0, 842.0))
    }

    fn page_count(&self) -> usize {
        self.page_count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression guard for the user-reported "never opens" PDF:
    /// load must return Ok or Err — never panic.
    #[test]
    fn broken_pdf_load_never_panics() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../broken-files/Teachers_Pet_The_Shadows_of_Darkness_Universe_Book_2_Katerina_St.pdf"
        );
        if !std::path::Path::new(path).exists() {
            // Fixture absent (e.g. CI checkout) — nothing to guard, skip.
            return;
        }

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            tauri::async_runtime::block_on(async {
                let mut adapter = PdfAdapter::new();
                adapter.load(path).await
            })
        }));

        match result {
            Ok(_) => {
                // Ok(_) and Err(_) are both acceptable — the invariant is "no panic".
            }
            Err(_) => panic!("PdfAdapter::load panicked on the broken PDF at {}", path),
        }
    }
}
