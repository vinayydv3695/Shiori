use crate::error::{ShioriError, ShioriResult};
use crate::services::renderer::{
    BookMetadata, BookRenderer, Chapter, EpubRenderer, SearchResult, TocEntry,
};
use epub::doc::EpubDoc;
use std::collections::HashMap;
use std::path::Path;
use std::sync::RwLock;

pub struct EpubAdapter {
    doc: Option<RwLock<EpubDoc<std::io::BufReader<std::fs::File>>>>,
    path: String,
    chapters: Vec<Chapter>,
    toc: Vec<TocEntry>,
    metadata: Option<BookMetadata>,
}

impl EpubAdapter {
    pub fn new() -> Self {
        Self {
            doc: None,
            path: String::new(),
            chapters: Vec::new(),
            toc: Vec::new(),
            metadata: None,
        }
    }

    fn load_chapters(&mut self) -> ShioriResult<()> {
        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let mut doc = doc_ref.write().unwrap();
        let mut chapters = Vec::new();
        let spine_len = doc.get_num_chapters();

        for i in 0..spine_len {
            doc.set_current_chapter(i);

            let (content, _mime) = doc.get_current_str().unwrap_or_default();
            let title = doc
                .get_current_id()
                .unwrap_or_else(|| format!("Chapter {}", i + 1));

            chapters.push(Chapter {
                index: i,
                title,
                content,
                location: format!("epubcfi(/{})", i),
            });
        }

        self.chapters = chapters;
        Ok(())
    }

    fn load_toc(&mut self) -> ShioriResult<()> {
        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let doc = doc_ref.read().unwrap();
        let toc_entries: Vec<TocEntry> = doc
            .toc
            .iter()
            .enumerate()
            .map(|(idx, nav_point)| TocEntry {
                label: nav_point.label.clone(),
                location: format!("epubcfi(/{}/)", idx),
                level: 0,
                children: Vec::new(),
            })
            .collect();

        self.toc = toc_entries;
        Ok(())
    }

    fn load_metadata(&mut self) -> ShioriResult<()> {
        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let doc = doc_ref.read().unwrap();
        let title = doc
            .get_title()
            .unwrap_or_else(|| "Unknown Title".to_string());
        let author = doc.mdata("creator").map(|item| item.value.clone());
        let total_chapters = doc.get_num_chapters();

        self.metadata = Some(BookMetadata {
            title,
            author,
            total_chapters,
            total_pages: None, // EPUB doesn't have fixed pages
            format: "epub".to_string(),
        });

        Ok(())
    }
}

impl BookRenderer for EpubAdapter {
    fn open(&mut self, path: &str) -> ShioriResult<()> {
        let doc = EpubDoc::new(path).map_err(|e| ShioriError::EpubParseFailed {
            path: path.to_string(),
            cause: format!("{}", e),
        })?;

        self.doc = Some(RwLock::new(doc));
        self.path = path.to_string();

        // Load all data upfront
        self.load_metadata()?;
        self.load_toc()?;
        self.load_chapters()?;

        Ok(())
    }

    fn get_metadata(&self) -> ShioriResult<BookMetadata> {
        self.metadata
            .clone()
            .ok_or_else(|| ShioriError::Other("Metadata not loaded".to_string()))
    }

    fn get_toc(&self) -> ShioriResult<Vec<TocEntry>> {
        Ok(self.toc.clone())
    }

    fn get_chapter(&self, index: usize) -> ShioriResult<Chapter> {
        self.chapters
            .get(index)
            .cloned()
            .ok_or_else(|| ShioriError::ChapterReadFailed {
                chapter_index: index,
                cause: "Chapter index out of bounds".to_string(),
            })
    }

    fn chapter_count(&self) -> usize {
        self.chapters.len()
    }

    fn search(&self, query: &str) -> ShioriResult<Vec<SearchResult>> {
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();

        for chapter in &self.chapters {
            let content_lower = chapter.content.to_lowercase();
            let matches: Vec<_> = content_lower.match_indices(&query_lower).collect();

            if !matches.is_empty() {
                // Get snippet around first match
                let first_match_pos = matches[0].0;
                let start = first_match_pos.saturating_sub(50);
                let end = (first_match_pos + query.len() + 50).min(chapter.content.len());
                let snippet = format!("...{}...", &chapter.content[start..end]);

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
}

impl EpubRenderer for EpubAdapter {
    fn get_spine(&self) -> ShioriResult<Vec<String>> {
        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let doc = doc_ref.read().unwrap();
        // Extract idref from each SpineItem
        Ok(doc.spine.iter().map(|item| item.idref.clone()).collect())
    }

    fn get_resource(&self, path: &str) -> ShioriResult<Vec<u8>> {
        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let mut doc = doc_ref.write().unwrap();
        // get_resource() returns Option<(Vec<u8>, String)> - bytes and mime
        doc.get_resource(path)
            .map(|(bytes, _mime)| bytes)
            .ok_or_else(|| ShioriError::Other(format!("Resource not found: {}", path)))
    }

    fn get_resource_mime(&self, path: &str) -> ShioriResult<String> {
        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let doc = doc_ref.read().unwrap();
        doc.get_resource_mime_by_path(path)
            .ok_or_else(|| ShioriError::Other(format!("MIME type not found for: {}", path)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_epub_adapter_creation() {
        let adapter = EpubAdapter::new();
        assert_eq!(adapter.chapter_count(), 0);
    }
}
