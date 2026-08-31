use crate::error::{Result, ShioriError};
use crate::services::renderer::{
    build_search_snippet, clean_html_for_search, BookMetadata, BookReaderAdapter, Chapter,
    SearchResult, TocEntry,
};
use async_trait::async_trait;
use epub::doc::EpubDoc;
use std::sync::RwLock;

/// Normalize a zip/resource path: convert `\` to `/`, drop `.` segments and a leading `/`, and resolve interior `..` via a segment stack.
fn normalize_zip_path(path: &str) -> String {
    let path = path.replace('\\', "/");
    let mut stack: Vec<&str> = Vec::new();
    for seg in path.split('/') {
        match seg {
            "" | "." => continue,
            ".." => {
                stack.pop();
            }
            s => stack.push(s),
        }
    }
    stack.join("/")
}

/// Resolves a resource path to its manifest ID (for aligned byte/MIME lookups), returning None if filename matches are ambiguous.
fn resolve_zip_path<R: std::io::Read + std::io::Seek>(
    doc: &EpubDoc<R>,
    path: &str,
) -> Option<String> {
    // 0. Direct manifest-id hit.
    if doc.resources.contains_key(path) {
        return Some(path.to_string());
    }

    let clean = normalize_zip_path(path);
    if clean.is_empty() {
        return None;
    }
    if doc.resources.contains_key(&clean) {
        return Some(clean);
    }

    // Snapshot resources with normalized forward-slash paths.
    let resources: Vec<(String, String)> = doc
        .resources
        .iter()
        .map(|(id, item)| {
            (
                id.clone(),
                normalize_zip_path(&item.path.to_string_lossy()),
            )
        })
        .collect();

    let clean_lower = clean.to_lowercase();

    // 1. Exact path match (case-insensitive), or common EPUB-root prefixed match.
    let prefixed: Vec<String> = ["OEBPS/", "OPS/", "EPUB/", "content/"]
        .iter()
        .map(|p| format!("{}{}", p, clean_lower))
        .collect();
    for (id, zip_path) in &resources {
        let zl = zip_path.to_lowercase();
        if zl == clean_lower || prefixed.iter().any(|c| *c == zl) {
            return Some(id.clone());
        }
    }

    // 2. Suffix match (case-insensitive)
    let slash_clean_lower = format!("/{}", clean_lower);
    for (id, zip_path) in &resources {
        if zip_path.to_lowercase().ends_with(&slash_clean_lower) {
            return Some(id.clone());
        }
    }

    // 3. Basename-only match, accept only when unambiguous.
    let requested_filename = clean.rsplit('/').next().unwrap_or(&clean).to_lowercase();
    let requested_dir = {
        let mut parts: Vec<&str> = clean.split('/').collect();
        parts.pop();
        parts.join("/").to_lowercase()
    };
    let basename_matches: Vec<&(String, String)> = resources
        .iter()
        .filter(|(_, zip_path)| {
            zip_path.rsplit('/').next().unwrap_or("").to_lowercase() == requested_filename
        })
        .collect();
    match basename_matches.len() {
        0 => None,
        1 => Some(basename_matches[0].0.clone()),
        // Ambiguous: only accept if a candidate's parent dir matches the request's dir; otherwise refuse rather than serve the wrong file.
        _ => basename_matches
            .iter()
            .find(|(_, zip_path)| {
                let mut parts: Vec<&str> = zip_path.split('/').collect();
                parts.pop();
                parts.join("/").to_lowercase() == requested_dir
            })
            .map(|(id, _)| id.clone()),
    }
}

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
            // Locations are the canonical `epubcfi(/{idx})` shape emitted by load_toc.
            let pattern1 = format!("/{})", spine_idx);
            let pattern2 = format!("(/{})", spine_idx);
            for entry in entries {
                if entry.location.contains(&pattern1) || entry.location.contains(&pattern2) {
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

                    // Resolve to a real spine index, or leave unresolved
                    let spine_idx: Option<usize> = matched_id
                        .and_then(|id| doc.spine.iter().position(|item| item.idref == id));

                    TocEntry {
                        label: nav_point.label.clone(),
                        // Empty location => non-navigable (frontend's parseTocLocationToIndex returns null and disables the click).
                        location: match spine_idx {
                            Some(idx) => format!("epubcfi(/{})", idx),
                            None => String::new(),
                        },
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
        log::debug!("[EpubAdapter::load] Opening file: {}", path);

        // Check if file exists
        use std::fs;
        match fs::metadata(path) {
            Ok(metadata) => {
                log::debug!("[EpubAdapter::load] File exists, size: {} bytes", metadata.len());
            }
            Err(e) => {
                log::warn!("[EpubAdapter::load] File not found or inaccessible: {}", e);
                return Err(ShioriError::EpubParseFailed {
                    path: path.to_string(),
                    cause: format!("File not accessible: {}", e),
                });
            }
        }

        let doc = EpubDoc::new(path).map_err(|e| {
            log::warn!("[EpubAdapter::load] EpubDoc::new failed: {}", e);
            ShioriError::EpubParseFailed {
                path: path.to_string(),
                cause: format!("{}", e),
            }
        })?;

        log::debug!("[EpubAdapter::load] EpubDoc created successfully");
        self.doc = Some(RwLock::new(doc));
        self.path = path.to_string();

        // Load metadata and TOC upfront (fast operations)
        log::trace!("[EpubAdapter::load] Loading metadata...");
        self.load_metadata()?;
        log::trace!("[EpubAdapter::load] Loading TOC...");
        self.load_toc()?;

        // DON'T load all chapters upfront - too slow!
        // Chapters will be loaded lazily in get_chapter()
        log::debug!("[EpubAdapter::load] Book opened successfully (chapters load on demand)");
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
        let (content, _mime) = doc.get_current_str().ok_or_else(|| {
            ShioriError::ChapterReadFailed {
                chapter_index: index,
                cause: "Failed to decode chapter content".to_string(),
            }
        })?;
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
            let (raw_content, _mime) = match doc.get_current_str() {
                Some(v) => v,
                None => {
                    log::warn!(
                        "[EpubAdapter::search] Skipping chapter {}: failed to decode content",
                        i
                    );
                    continue;
                }
            };
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
        log::trace!("[EpubAdapter::get_resource] Requesting resource: {}", path);

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

        // Fast path: exact archive entry at the raw path.
        if let Some(bytes) = doc.get_resource_by_path(path) {
            return Ok(bytes);
        }

        // Shared resolution (same as get_resource_mime) → manifest id → bytes.
        if let Some(id) = resolve_zip_path(&doc, path) {
            if let Some((bytes, _mime)) = doc.get_resource(&id) {
                return Ok(bytes);
            }
        }

        log::warn!(
            "[EpubAdapter::get_resource] Resource not found: '{}' ({} resources in manifest)",
            path,
            doc.resources.len()
        );
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

        // Exact path match first, then the same fallback resolution get_resource uses, so bytes and MIME always agree on the underlying entry.
        if let Some(mime) = doc.get_resource_mime_by_path(path) {
            return Ok(mime);
        }
        if let Some(id) = resolve_zip_path(&doc, path) {
            if let Some(mime) = doc.get_resource_mime(&id) {
                return Ok(mime);
            }
        }
        Err(ShioriError::Other(format!("MIME type not found for: {}", path)))
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

    #[test]
    fn test_normalize_zip_path() {
        assert_eq!(normalize_zip_path("a/b/../c"), "a/c");
        assert_eq!(normalize_zip_path("./a"), "a");
        assert_eq!(normalize_zip_path("../a"), "a");
        assert_eq!(normalize_zip_path("a/./b/../b"), "a/b");
        assert_eq!(normalize_zip_path("/OEBPS/images/x.jpg"), "OEBPS/images/x.jpg");
        assert_eq!(normalize_zip_path("chapters/../images/x.jpg"), "images/x.jpg");
        assert_eq!(normalize_zip_path("a\\b\\c.jpg"), "a/b/c.jpg");
    }
}
