use crate::error::{ShioriError, ShioriResult};
use crate::services::renderer::{
    BookMetadata, BookReaderAdapter, Chapter, SearchResult, TocEntry,
};
use async_trait::async_trait;
use mobi::Mobi;
use std::fs;

pub struct MobiAdapter {
    path: String,
    metadata: Option<BookMetadata>,
    html_content: String,
}

impl MobiAdapter {
    pub fn new() -> Self {
        Self {
            path: String::new(),
            metadata: None,
            html_content: String::new(),
        }
    }
}

unsafe impl Send for MobiAdapter {}
unsafe impl Sync for MobiAdapter {}

#[async_trait]
impl BookReaderAdapter for MobiAdapter {
    async fn load(&mut self, path: &str) -> ShioriResult<()> {
        let file_data = fs::read(path).map_err(|e| ShioriError::Io(e))?;
        
        let m = Mobi::from_read(&mut &file_data[..])
            .map_err(|e| ShioriError::Other(format!("Invalid MOBI file: {}", e)))?;
        
        self.path = path.to_string();

        let html = m.content_as_string()
            .map_err(|e| ShioriError::Other(format!("Failed to read MOBI content: {}", e)))?;
            
        self.html_content = html;

        // Basic metadata
        let title = m.title();
        
        // Author extraction logic (same as the format_adapter one)
        let author = m.author().map(|a| {
            a.split(';')
             .map(|s| s.trim().to_string())
             .filter(|s| !s.is_empty())
             .collect::<Vec<String>>()
             .join(", ")
        });

        self.metadata = Some(BookMetadata {
            title,
            author,
            total_chapters: 1, // Treat as a single chapter
            total_pages: None,
            format: "mobi".to_string(),
        });

        Ok(())
    }

    fn get_metadata(&self) -> ShioriResult<BookMetadata> {
        self.metadata
            .clone()
            .ok_or_else(|| ShioriError::Other("Metadata not loaded".to_string()))
    }

    fn get_toc(&self) -> ShioriResult<Vec<TocEntry>> {
        // MOBI crate does not easily expose TOC records from EXTH headers out-of-the-box
        // We will just provide a single entry for the whole book
        Ok(vec![TocEntry {
            label: "Start".to_string(),
            location: "mobi:start".to_string(),
            level: 0,
            children: Vec::new(),
        }])
    }

    fn get_chapter(&self, index: usize) -> ShioriResult<Chapter> {
        if index > 0 {
            return Err(ShioriError::ChapterReadFailed {
                chapter_index: index,
                cause: "MOBI is parsed as a single continuous chapter".to_string(),
            });
        }

        Ok(Chapter {
            index: 0,
            title: "Content".to_string(),
            content: self.html_content.clone(),
            location: "mobi:start".to_string(),
        })
    }

    fn chapter_count(&self) -> usize {
        1
    }

    fn search(&self, query: &str) -> ShioriResult<Vec<SearchResult>> {
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
                chapter_title: "Content".to_string(),
                snippet,
                location: "mobi:start".to_string(),
                match_count: matches.len(),
            });
        }

        Ok(results)
    }

    fn get_resource(&self, _path: &str) -> ShioriResult<Vec<u8>> {
        Err(ShioriError::Other("MOBI resources not exposed natively yet".into()))
    }

    fn get_resource_mime(&self, _path: &str) -> ShioriResult<String> {
        Err(ShioriError::Other("MOBI resources not exposed natively yet".into()))
    }

    fn supports_pagination(&self) -> bool {
        false // Treat as flow
    }

    fn supports_images(&self) -> bool {
        false // Base64 encoding images could be done later if parsed from records
    }
    
    async fn render_page(&self, _page_number: usize, _scale: f32) -> ShioriResult<Vec<u8>> {
        Err(ShioriError::UnsupportedFeature("MOBI does not support strict pagination rendering".into()))
    }

    fn get_page_dimensions(&self, _page_number: usize) -> ShioriResult<(f32, f32)> {
        Err(ShioriError::UnsupportedFeature("MOBI does not support strict pagination dimensions".into()))
    }

    fn page_count(&self) -> usize {
        0
    }
}
