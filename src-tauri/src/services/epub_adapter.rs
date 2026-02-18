use crate::error::{ShioriError, ShioriResult};
use crate::services::renderer::{
    BookMetadata, BookRenderer, Chapter, EpubRenderer, SearchResult, TocEntry,
};
use epub::doc::EpubDoc;
use std::sync::RwLock;

pub struct EpubAdapter {
    doc: Option<RwLock<EpubDoc<std::io::BufReader<std::fs::File>>>>,
    path: String,
    toc: Vec<TocEntry>,
    metadata: Option<BookMetadata>,
}

impl EpubAdapter {
    pub fn new() -> Self {
        Self {
            doc: None,
            path: String::new(),
            toc: Vec::new(),
            metadata: None,
        }
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
        println!("[EpubAdapter::open] Opening file: {}", path);

        // Check if file exists
        use std::fs;
        match fs::metadata(path) {
            Ok(metadata) => {
                println!(
                    "[EpubAdapter::open] File exists, size: {} bytes",
                    metadata.len()
                );
            }
            Err(e) => {
                println!(
                    "[EpubAdapter::open] ❌ File not found or inaccessible: {}",
                    e
                );
                return Err(ShioriError::EpubParseFailed {
                    path: path.to_string(),
                    cause: format!("File not accessible: {}", e),
                });
            }
        }

        let doc = EpubDoc::new(path).map_err(|e| {
            println!("[EpubAdapter::open] ❌ EpubDoc::new failed: {}", e);
            ShioriError::EpubParseFailed {
                path: path.to_string(),
                cause: format!("{}", e),
            }
        })?;

        println!("[EpubAdapter::open] ✅ EpubDoc created successfully");
        self.doc = Some(RwLock::new(doc));
        self.path = path.to_string();

        // Load metadata and TOC upfront (fast operations)
        println!("[EpubAdapter::open] Loading metadata...");
        self.load_metadata()?;
        println!("[EpubAdapter::open] Loading TOC...");
        self.load_toc()?;

        // DON'T load all chapters upfront - too slow!
        // Chapters will be loaded lazily in get_chapter()
        println!("[EpubAdapter::open] ✅ Book opened successfully (chapters will load on demand)");
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
        // Load chapter on-demand from EpubDoc
        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let mut doc = doc_ref.write().unwrap();
        let spine_len = doc.get_num_chapters();

        if index >= spine_len {
            return Err(ShioriError::ChapterReadFailed {
                chapter_index: index,
                cause: "Chapter index out of bounds".to_string(),
            });
        }

        doc.set_current_chapter(index);
        let (content, _mime) = doc.get_current_str().unwrap_or_default();
        let title = doc
            .get_current_id()
            .unwrap_or_else(|| format!("Chapter {}", index + 1));

        Ok(Chapter {
            index,
            title,
            content,
            location: format!("epubcfi(/{})", index),
        })
    }

    fn chapter_count(&self) -> usize {
        // Get chapter count from EpubDoc, not from cached chapters
        if let Some(doc_ref) = &self.doc {
            let doc = doc_ref.read().unwrap();
            doc.get_num_chapters()
        } else {
            0
        }
    }

    fn search(&self, query: &str) -> ShioriResult<Vec<SearchResult>> {
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();

        // For search, we need to iterate through all chapters
        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let mut doc = doc_ref.write().unwrap();
        let spine_len = doc.get_num_chapters();

        for i in 0..spine_len {
            doc.set_current_chapter(i);
            let (content, _mime) = doc.get_current_str().unwrap_or_default();
            let title = doc
                .get_current_id()
                .unwrap_or_else(|| format!("Chapter {}", i + 1));

            let content_lower = content.to_lowercase();
            let matches: Vec<_> = content_lower.match_indices(&query_lower).collect();

            if !matches.is_empty() {
                // Get snippet around first match
                let first_match_pos = matches[0].0;
                let start = first_match_pos.saturating_sub(50);
                let end = (first_match_pos + query.len() + 50).min(content.len());
                let snippet = format!("...{}...", &content[start..end]);

                results.push(SearchResult {
                    chapter_index: i,
                    chapter_title: title,
                    snippet,
                    location: format!("epubcfi(/{})", i),
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
