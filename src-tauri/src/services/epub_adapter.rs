use crate::error::{Result, ShioriError};
use crate::services::renderer::{
    build_search_snippet, clean_html_for_search, BookMetadata, BookReaderAdapter, Chapter,
    SearchResult, TocEntry,
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

    pub fn find_toc_title_for_spine(&self, spine_idx: usize) -> Option<String> {
        fn parse_idx_from_loc(loc: &str) -> Option<usize> {
            if let Some(start) = loc.find("/(") {
                let rest = &loc[start + 2..];
                if let Some(end) = rest.find(')') {
                    return rest[..end].split('/').next()?.parse::<usize>().ok();
                }
            }
            if let Some(start) = loc.find("(/") {
                let rest = &loc[start + 2..];
                let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                return num_str.parse::<usize>().ok();
            }
            None
        }

        fn search_exact(entries: &[TocEntry], spine_idx: usize) -> Option<String> {
            let pattern1 = format!("/{}/", spine_idx);
            let pattern2 = format!("/{})", spine_idx);
            let pattern3 = format!("(/{})", spine_idx);
            for entry in entries {
                if entry.location.contains(&pattern1)
                    || entry.location.contains(&pattern2)
                    || entry.location.contains(&pattern3)
                {
                    let trimmed = entry.label.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
                if let Some(child_match) = search_exact(&entry.children, spine_idx) {
                    return Some(child_match);
                }
            }
            None
        }

        if let Some(exact) = search_exact(&self.toc, spine_idx) {
            return Some(exact);
        }

        // Closest preceding TOC match
        fn search_preceding<'a>(
            entries: &'a [TocEntry],
            spine_idx: usize,
            best: &mut Option<(usize, &'a str)>,
        ) {
            for entry in entries {
                if let Some(idx) = parse_idx_from_loc(&entry.location) {
                    if idx <= spine_idx {
                        let trimmed = entry.label.trim();
                        if !trimmed.is_empty() && (best.is_none() || idx >= best.as_ref().unwrap().0) {
                            *best = Some((idx, trimmed));
                        }
                    }
                }
                search_preceding(&entry.children, spine_idx, best);
            }
        }

        let mut best = None;
        search_preceding(&self.toc, spine_idx, &mut best);
        best.map(|(_, label)| label.to_string())
    }

    fn load_toc(&mut self) -> Result<()> {
        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let doc = doc_ref.read().map_err(|e| {
            ShioriError::Other(format!(
                "Failed to acquire read lock on EPUB document: {}",
                e
            ))
        })?;

        fn parse_nav_points(
            nav_points: &[epub::doc::NavPoint],
            doc: &EpubDoc<std::io::BufReader<std::fs::File>>,
            level: usize,
        ) -> Vec<TocEntry> {
            nav_points
                .iter()
                .map(|nav_point| {
                    let path_str = nav_point.content.to_string_lossy().replace("\\", "/");
                    let clean_path = path_str.split('#').next().unwrap_or("").to_string();

                    let mut matched_id = None;
                    for (id, item) in doc.resources.iter() {
                        let res_path = item.path.to_string_lossy().replace("\\", "/");
                        if res_path == clean_path
                            || res_path.ends_with(&clean_path)
                            || clean_path.ends_with(&res_path)
                        {
                            matched_id = Some(id.clone());
                            break;
                        }
                    }

                    let mut spine_idx = 0;
                    if let Some(id) = matched_id {
                        if let Some(pos) = doc.spine.iter().position(|item| item.idref == id) {
                            spine_idx = pos;
                        }
                    }

                    TocEntry {
                        label: nav_point.label.clone(),
                        location: format!("epubcfi(/{}/)", spine_idx),
                        level,
                        children: parse_nav_points(&nav_point.children, doc, level + 1),
                    }
                })
                .collect()
        }

        self.toc = parse_nav_points(&doc.toc, &doc, 0);
        Ok(())
    }

    fn load_metadata(&mut self) -> Result<()> {
        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let doc = doc_ref.read().map_err(|e| {
            ShioriError::Other(format!(
                "Failed to acquire read lock on EPUB document: {}",
                e
            ))
        })?;
        let title = doc
            .get_title()
            .unwrap_or_else(|| "Unknown Title".to_string());
        let author = doc.mdata("creator").map(|item| item.value.clone());
        let total_chapters = doc.get_num_chapters();

        self.metadata = Some(BookMetadata {
            title,
            author,
            total_chapters,
            total_pages: None,
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
        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let mut doc = doc_ref.write().map_err(|e| {
            ShioriError::Other(format!(
                "Failed to acquire write lock on EPUB document: {}",
                e
            ))
        })?;
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
        if let Some(doc_ref) = &self.doc {
            if let Ok(doc) = doc_ref.read() {
                doc.get_num_chapters()
            } else {
                0
            }
        } else {
            0
        }
    }

    fn search(&self, query: &str) -> Result<Vec<SearchResult>> {
        let query_trim = query.trim();
        if query_trim.is_empty() {
            return Ok(Vec::new());
        }
        let query_lower = query_trim.to_lowercase();
        let query_char_count = query_trim.chars().count();
        let mut results = Vec::new();

        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let mut doc = doc_ref.write().map_err(|e| {
            ShioriError::Other(format!(
                "Failed to acquire write lock on EPUB document: {}",
                e
            ))
        })?;
        let spine_len = doc.get_num_chapters();

        for i in 0..spine_len {
            doc.set_current_chapter(i);
            let (raw_content, _mime) = doc.get_current_str().unwrap_or_default();
            let content = clean_html_for_search(&raw_content);
            if content.is_empty() {
                continue;
            }
            let content_lower = content.to_lowercase();
            let matches: Vec<_> = content_lower.match_indices(&query_lower).collect();

            if !matches.is_empty() {
                let first_match_pos = matches[0].0;
                let snippet = build_search_snippet(&content, first_match_pos, query_char_count, 60);

                let title = self.find_toc_title_for_spine(i).unwrap_or_else(|| {
                    let raw_id = doc.get_current_id().unwrap_or_default();
                    let s = raw_id.trim().to_lowercase();
                    let is_tech = s.is_empty()
                        || s.len() <= 2
                        || s.ends_with(".xhtml")
                        || s.ends_with(".html")
                        || s.ends_with(".xml")
                        || s.ends_with(".htm")
                        || s.ends_with(".php")
                        || s.ends_with(".txt")
                        || s.starts_with("id")
                        || s.starts_with("item")
                        || s.starts_with("ch")
                        || s.starts_with("sec")
                        || s.starts_with("part")
                        || s.starts_with("page")
                        || s.starts_with("split")
                        || s.starts_with("text")
                        || s.chars().all(|c| c.is_ascii_digit());
                    if is_tech {
                        format!("Chapter {}", i + 1)
                    } else {
                        raw_id
                    }
                });

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

        let doc = doc_ref.read().map_err(|e| {
            ShioriError::Other(format!(
                "Failed to acquire read lock on EPUB document: {}",
                e
            ))
        })?;
        Ok(doc.spine.iter().map(|item| item.idref.clone()).collect())
    }

    fn get_resource(&self, path: &str) -> Result<Vec<u8>> {
        println!("[EpubAdapter::get_resource] Requesting resource: {}", path);

        let doc_ref = self
            .doc
            .as_ref()
            .ok_or_else(|| ShioriError::Other("EPUB document not opened".to_string()))?;

        let mut doc = doc_ref.write().map_err(|e| {
            ShioriError::Other(format!(
                "Failed to acquire write lock on EPUB document: {}",
                e
            ))
        })?;

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
            .map(|(id, item)| {
                (
                    id.clone(),
                    item.path.to_string_lossy().to_string().replace("\\", "/"),
                )
            })
            .collect();

        // ── Pass 3: Common EPUB root prefixes ─────────────────────────────
        for prefix in &["OEBPS/", "OPS/", "EPUB/", "content/"] {
            let candidate = format!("{}{}", prefix, clean);
            if let Some((bytes, _)) = doc.get_resource(&candidate) {
                println!(
                    "[EpubAdapter] Found with prefix '{}': {}",
                    prefix, candidate
                );
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
                println!(
                    "[EpubAdapter] Case-insensitive suffix match: {} -> (id: {})",
                    path, id
                );
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
            path,
            all_resources.len()
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

        let doc = doc_ref.read().map_err(|e| {
            ShioriError::Other(format!(
                "Failed to acquire read lock on EPUB document: {}",
                e
            ))
        })?;
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
