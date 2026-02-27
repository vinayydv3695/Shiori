use crate::error::{ShioriError, Result};
use crate::services::renderer::{
    BookMetadata, BookReaderAdapter, Chapter, SearchResult, TocEntry,
};
use async_trait::async_trait;
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

    fn load_toc(&mut self) -> Result<()> {
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

    fn load_metadata(&mut self) -> Result<()> {
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

#[async_trait]
impl BookReaderAdapter for EpubAdapter {
    async fn load(&mut self, path: &str) -> Result<()> {
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

    fn get_metadata(&self) -> Result<BookMetadata> {
        self.metadata
            .clone()
            .ok_or_else(|| ShioriError::Other("Metadata not loaded".to_string()))
    }

    fn get_toc(&self) -> Result<Vec<TocEntry>> {
        Ok(self.toc.clone())
    }

    fn get_chapter(&self, index: usize) -> Result<Chapter> {
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

    fn search(&self, query: &str) -> Result<Vec<SearchResult>> {
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
                
                // Safely slice strings using character boundaries to avoid panics on emoji/unicode
                let char_indices: Vec<(usize, char)> = content.char_indices().collect();
                
                // Find the index in our char array that corresponds to the byte position
                let char_idx = char_indices.iter().position(|&(b_idx, _)| b_idx >= first_match_pos).unwrap_or(0);
                
                let start_char_idx = char_idx.saturating_sub(50);
                let end_char_idx = (char_idx + query.chars().count() + 50).min(char_indices.len());
                
                let start_byte = char_indices.get(start_char_idx).map(|&(b, _)| b).unwrap_or(0);
                let end_byte = if end_char_idx >= char_indices.len() {
                    content.len()
                } else {
                    char_indices[end_char_idx].0
                };
                
                let snippet = format!("...{}...", &content[start_byte..end_byte]);

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

    fn get_spine(&self) -> Result<Vec<String>> {
        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let doc = doc_ref.read().unwrap();
        // Extract idref from each SpineItem
        Ok(doc.spine.iter().map(|item| item.idref.clone()).collect())
    }

    fn get_resource(&self, path: &str) -> Result<Vec<u8>> {
        println!("[EpubAdapter::get_resource] Requesting resource: {}", path);

        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let mut doc = doc_ref.write().unwrap();

        // ── Pass 1: Exact path ────────────────────────────────────────────
        if let Some((bytes, _)) = doc.get_resource(path) {
            return Ok(bytes);
        }

        // ── Pass 2: Iteratively strip leading ../ and ./ ──────────────────
        // '../images/foo.jpg' → 'images/foo.jpg'
        let clean = {
            let mut s = path.trim_start_matches('/').to_string();
            loop {
                if s.starts_with("../") {
                    s = s[3..].to_string();
                } else if s.starts_with("./") {
                    s = s[2..].to_string();
                } else {
                    break;
                }
            }
            s
        };

        if clean != path {
            if let Some((bytes, _)) = doc.get_resource(&clean) {
                return Ok(bytes);
            }
        }
        
        // Find mapped zip paths from doc.resources
        let all_resources: Vec<(String, String)> = doc
            .resources
            .iter()
            .map(|(id, item)| (id.clone(), item.path.to_string_lossy().to_string().replace("\\", "/")))
            .collect();
            
        // ── Pass 3: Common EPUB root prefixes ─────────────────────────────
        for prefix in &["OEBPS/", "OPS/", "EPUB/", "content/"] {
            let candidate = format!("{}{}", prefix, clean);
            if let Some((bytes, _)) = doc.get_resource(&candidate) {
                println!("[EpubAdapter] Found with prefix '{}': {}", prefix, candidate);
                return Ok(bytes);
            }
        }

        // ── Pass 4: Case-insensitive suffix match ─────────────────────────
        // Handles: zip_path="OEBPS/Images/foo.jpg", clean="images/foo.jpg"
        let clean_lower = clean.to_lowercase();
        let slash_clean_lower = format!("/{}", clean_lower);

        let mut suffix_match_id: Option<String> = None;
        for (id, zip_path) in &all_resources {
            let path_lower = zip_path.to_lowercase();
            if path_lower == clean_lower || path_lower.ends_with(&slash_clean_lower) {
                suffix_match_id = Some(id.clone());
                break;
            }
        }
        if let Some(ref id) = suffix_match_id {
            if let Some((bytes, _)) = doc.get_resource(id) {
                println!("[EpubAdapter] Case-insensitive suffix match: {} -> (id: {})", path, id);
                return Ok(bytes);
            }
        }

        // ── Pass 5: Case-insensitive filename-only match ──────────────────
        let requested_filename = std::path::Path::new(&clean)
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or(&clean)
            .to_lowercase();

        for (id, zip_path) in &all_resources {
            let key_file = std::path::Path::new(zip_path)
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or("")
                .to_lowercase();
            if key_file == requested_filename {
                if let Some((bytes, _)) = doc.get_resource(id) {
                    println!("[EpubAdapter] Filename match: {} -> (id: {})", path, id);
                    return Ok(bytes);
                }
            }
        }

        // ── Not found: log available paths for debugging ───────────────────
        println!(
            "[EpubAdapter::get_resource] ❌ Resource not found: '{}'. Available paths ({}):",
            path, all_resources.len()
        );
        for (_id, zip_path) in all_resources.iter().take(20) {
            println!("  • {}", zip_path);
        }

        Err(ShioriError::Other(format!("Resource not found: {}", path)))
    }

    fn get_resource_mime(&self, path: &str) -> Result<String> {

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
