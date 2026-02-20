use crate::error::{ShioriError, ShioriResult};
use crate::services::renderer::{
    BookMetadata, BookRenderer, Chapter, PdfRenderer, SearchResult, TocEntry,
};
use lopdf::Document;

pub struct PdfAdapter {
    doc: Option<Document>,
    path: String,
    metadata: Option<BookMetadata>,
    page_count: usize,
}

impl PdfAdapter {
    pub fn new() -> Self {
        Self {
            doc: None,
            path: String::new(),
            metadata: None,
            page_count: 0,
        }
    }

    fn load_metadata(&mut self) -> ShioriResult<()> {
        let doc = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("PDF document not opened".to_string()))?;

        let page_count = doc.get_pages().len();

        // Try to extract PDF metadata
        let title = doc
            .trailer
            .get(b"Info")
            .ok()
            .and_then(|info| info.as_dict().ok())
            .and_then(|dict| dict.get(b"Title").ok())
            .and_then(|title| {
                title
                    .as_str()
                    .ok()
                    .and_then(|bytes| std::str::from_utf8(bytes).ok().map(|s| s.to_string()))
            })
            .unwrap_or_else(|| "Unknown Title".to_string());

        let author = doc
            .trailer
            .get(b"Info")
            .ok()
            .and_then(|info| info.as_dict().ok())
            .and_then(|dict| dict.get(b"Author").ok())
            .and_then(|author| {
                author
                    .as_str()
                    .ok()
                    .and_then(|bytes| std::str::from_utf8(bytes).ok().map(|s| s.to_string()))
            });

        self.metadata = Some(BookMetadata {
            title,
            author,
            total_chapters: page_count, // For PDF, treat each page as a "chapter"
            total_pages: Some(page_count),
            format: "pdf".to_string(),
        });

        self.page_count = page_count;
        Ok(())
    }

    fn extract_text_from_page(&self, page_number: usize) -> ShioriResult<String> {
        let doc = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("PDF document not opened".to_string()))?;

        let pages = doc.get_pages();
        let page_id = *pages
            .get(&((page_number + 1) as u32))
            .ok_or_else(|| ShioriError::Other(format!("Page {} not found", page_number)))?;

        // Extract text content from the page
        // Note: This is a simplified version. Real text extraction from PDF is complex.
        let content = doc
            .extract_text(&[page_id.0])
            .unwrap_or_else(|_| format!("Page {}", page_number + 1));

        Ok(content)
    }
}

impl BookRenderer for PdfAdapter {
    fn open(&mut self, path: &str) -> ShioriResult<()> {
        let doc = Document::load(path).map_err(|e| ShioriError::CorruptedPdf {
            path: path.to_string(),
            details: format!("{}", e),
        })?;

        self.doc = Some(doc);
        self.path = path.to_string();
        self.load_metadata()?;

        Ok(())
    }

    fn get_metadata(&self) -> ShioriResult<BookMetadata> {
        self.metadata
            .clone()
            .ok_or_else(|| ShioriError::Other("Metadata not loaded".to_string()))
    }

    fn get_toc(&self) -> ShioriResult<Vec<TocEntry>> {
        // PDF ToC extraction is complex and not supported by lopdf easily
        // For now, return a simple page-based ToC
        let page_count = self.page_count;
        let toc: Vec<TocEntry> = (0..page_count)
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
}

impl PdfRenderer for PdfAdapter {
    fn render_page(&self, _page_number: usize, _scale: f32) -> ShioriResult<Vec<u8>> {
        // Note: PDF rendering to image requires pdfium-render or similar
        // For now, this is a placeholder that would need pdfium-render integration
        //
        // TODO: Integrate pdfium-render for actual rasterization
        // Example:
        // let pdfium = Pdfium::new(...);
        // let document = pdfium.load_pdf_from_file(path)?;
        // let page = document.pages().get(page_number)?;
        // let bitmap = page.render_with_config(...)?;
        // return bitmap.as_image_buffer().as_bytes();

        Err(ShioriError::Other(
            "PDF rendering not yet implemented - requires pdfium-render integration".to_string(),
        ))
    }

    fn get_page_dimensions(&self, page_number: usize) -> ShioriResult<(f32, f32)> {
        let doc = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("PDF document not opened".to_string()))?;

        let pages = doc.get_pages();
        let page_id = *pages
            .get(&((page_number + 1) as u32))
            .ok_or_else(|| ShioriError::Other(format!("Page {} not found", page_number)))?;

        // Get the page object
        let page_object = doc.get_object(page_id)?;
        let page_dict = page_object
            .as_dict()
            .map_err(|_| ShioriError::Other("Page is not a dictionary".to_string()))?;

        // Try to get MediaBox
        let media_box = page_dict
            .get(b"MediaBox")
            .map_err(|_| ShioriError::Other("Page has no MediaBox".to_string()))?;

        let media_box_array = media_box
            .as_array()
            .map_err(|_| ShioriError::Other("MediaBox is not an array".to_string()))?;

        if media_box_array.len() < 4 {
            return Err(ShioriError::Other("MediaBox array too short".to_string()));
        }

        // Extract width and height, handling both Integer and Real types
        let width = media_box_array[2].as_float().unwrap_or(612.0);
        let height = media_box_array[3].as_float().unwrap_or(792.0);

        Ok((width, height))
    }

    fn page_count(&self) -> usize {
        self.page_count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pdf_adapter_creation() {
        let adapter = PdfAdapter::new();
        assert_eq!(adapter.chapter_count(), 0);
    }
}
