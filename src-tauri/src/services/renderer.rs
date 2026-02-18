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

/// Common interface for all book format renderers
pub trait BookRenderer: Send + Sync {
    /// Open and initialize the book
    fn open(&mut self, path: &str) -> ShioriResult<()>;

    /// Get book metadata
    fn get_metadata(&self) -> ShioriResult<BookMetadata>;

    /// Get table of contents
    fn get_toc(&self) -> ShioriResult<Vec<TocEntry>>;

    /// Get a specific chapter by index
    fn get_chapter(&self, index: usize) -> ShioriResult<Chapter>;

    /// Get total number of chapters
    fn chapter_count(&self) -> usize;

    /// Search within the book content
    fn search(&self, query: &str) -> ShioriResult<Vec<SearchResult>>;
}

/// PDF-specific renderer trait
pub trait PdfRenderer: BookRenderer {
    /// Render a specific page to PNG
    fn render_page(&self, page_number: usize, scale: f32) -> ShioriResult<Vec<u8>>;

    /// Get page dimensions
    fn get_page_dimensions(&self, page_number: usize) -> ShioriResult<(f32, f32)>;

    /// Get total page count
    fn page_count(&self) -> usize;
}

/// EPUB-specific renderer trait
pub trait EpubRenderer: BookRenderer {
    /// Get spine (reading order)
    fn get_spine(&self) -> ShioriResult<Vec<String>>;

    /// Get resource by path (images, stylesheets, etc.)
    fn get_resource(&self, path: &str) -> ShioriResult<Vec<u8>>;

    /// Get resource MIME type
    fn get_resource_mime(&self, path: &str) -> ShioriResult<String>;
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
