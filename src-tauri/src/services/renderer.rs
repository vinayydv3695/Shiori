use crate::error::ShioriResult;
use serde::{Deserialize, Serialize};

/// Represents a single chapter/section in a book
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub index: usize,
    pub title: String,
    pub content: String,
    /// For EPUB: CFI (Canonical Fragment Identifier)
    /// For PDF: Page number as string
    pub location: String,
}

/// Represents a rendered page (for PDF or paginated views)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderedPage {
    pub page_number: usize,
    pub total_pages: usize,
    /// Base64-encoded image data for PDF pages
    pub image_data: Option<String>,
    /// HTML content for EPUB pages
    pub html_content: Option<String>,
}

/// Metadata about the book structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookMetadata {
    pub title: String,
    pub author: Option<String>,
    pub total_chapters: usize,
    pub total_pages: Option<usize>,
    pub format: String,
}

/// Table of contents entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TocEntry {
    pub label: String,
    pub location: String,
    pub level: usize,
    pub children: Vec<TocEntry>,
}

use async_trait::async_trait;

/// Common unified interface for all book format renderers (EPUB, PDF, DOCX, MOBI)
#[async_trait]
pub trait BookReaderAdapter: Send + Sync {
    /// Open and initialize the book
    async fn load(&mut self, path: &str) -> ShioriResult<()>;

    /// Get book metadata
    fn get_metadata(&self) -> ShioriResult<BookMetadata>;

    /// Get table of contents
    fn get_toc(&self) -> ShioriResult<Vec<TocEntry>>;

    /// Get a specific chapter by index (used primarily by flow-content like EPUB/DOCX)
    fn get_chapter(&self, index: usize) -> ShioriResult<Chapter>;

    /// Get total number of chapters
    fn chapter_count(&self) -> usize;

    /// Search within the book content
    fn search(&self, query: &str) -> ShioriResult<Vec<SearchResult>>;

    /// Get resource by path (images, stylesheets, etc. inside the archive)
    fn get_resource(&self, path: &str) -> ShioriResult<Vec<u8>>;

    /// Get resource MIME type
    fn get_resource_mime(&self, path: &str) -> ShioriResult<String>;

    // ─── Format Feature Flags ────────────────────────────────────────────────

    /// Whether this format supports extracting embedded images
    fn supports_images(&self) -> bool {
        true
    }

    /// Whether this format strictly uses paginated rendering (e.g. PDF/CBZ)
    fn supports_pagination(&self) -> bool {
        false
    }

    // ─── Flow-content Specific (EPUB) ────────────────────────────────────────

    /// Get spine (reading order of chapters/resources).
    /// Default implementation returns empty for formats that don't use spines.
    fn get_spine(&self) -> ShioriResult<Vec<String>> {
        Ok(Vec::new())
    }

    // ─── Paginated-content Specific (PDF) ────────────────────────────────────

    /// Get total page count
    fn page_count(&self) -> usize {
        0
    }

    /// Render a specific page to a PNG buffer
    async fn render_page(&self, _page_number: usize, _scale: f32) -> ShioriResult<Vec<u8>> {
        Err(crate::error::ShioriError::Other(
            "Pagination rendering is not supported by this format".into(),
        ))
    }

    /// Get physical/logical dimensions of a page
    fn get_page_dimensions(&self, _page_number: usize) -> ShioriResult<(f32, f32)> {
        Err(crate::error::ShioriError::Other(
            "Page dimensions are not available for this format".into(),
        ))
    }
}

/// Search result entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub chapter_index: usize,
    pub chapter_title: String,
    pub snippet: String,
    pub location: String,
    pub match_count: usize,
}
