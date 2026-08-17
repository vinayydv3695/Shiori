use crate::error::Result;
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
#[allow(dead_code)]
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
#[allow(dead_code)]
pub trait BookReaderAdapter: Send + Sync {
    /// Open and initialize the book
    async fn load(&mut self, path: &str) -> Result<()>;

    /// Get book metadata
    fn get_metadata(&self) -> Result<BookMetadata>;

    /// Get table of contents
    fn get_toc(&self) -> Result<Vec<TocEntry>>;

    /// Get a specific chapter by index (used primarily by flow-content like EPUB/DOCX)
    fn get_chapter(&self, index: usize) -> Result<Chapter>;

    /// Get total number of chapters
    fn chapter_count(&self) -> usize;

    /// Search within the book content
    fn search(&self, query: &str) -> Result<Vec<SearchResult>>;

    /// Get resource by path (images, stylesheets, etc. inside the archive)
    fn get_resource(&self, path: &str) -> Result<Vec<u8>>;

    /// Get resource MIME type
    fn get_resource_mime(&self, path: &str) -> Result<String>;

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
    fn get_spine(&self) -> Result<Vec<String>> {
        Ok(Vec::new())
    }

    // ─── Paginated-content Specific (PDF) ────────────────────────────────────

    /// Get total page count
    fn page_count(&self) -> usize {
        0
    }

    /// Render a specific page to a PNG buffer
    async fn render_page(&self, _page_number: usize, _scale: f32) -> Result<Vec<u8>> {
        Err(crate::error::ShioriError::Other(
            "Pagination rendering is not supported by this format".into(),
        ))
    }

    /// Get physical/logical dimensions of a page
    fn get_page_dimensions(&self, _page_number: usize) -> Result<(f32, f32)> {
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

/// Strip all HTML tags, styles, and scripts while preserving text and normalizing whitespace.
pub fn clean_html_for_search(html: &str) -> String {
    let lower = html.to_lowercase();
    let mut output = String::with_capacity(html.len());
    let mut pos = 0;
    let bytes = html.as_bytes();
    let len = bytes.len();

    while pos < len {
        if bytes[pos] == b'<' {
            let rem = &lower[pos..];
            if rem.starts_with("<style") {
                if let Some(end_idx) = lower[pos..].find("</style>") {
                    pos += end_idx + 8;
                    continue;
                } else {
                    break;
                }
            } else if rem.starts_with("<script") {
                if let Some(end_idx) = lower[pos..].find("</script>") {
                    pos += end_idx + 9;
                    continue;
                } else {
                    break;
                }
            } else if rem.starts_with("<head") {
                if let Some(end_idx) = lower[pos..].find("</head>") {
                    pos += end_idx + 7;
                    continue;
                } else {
                    break;
                }
            } else {
                if let Some(end_idx) = bytes[pos..].iter().position(|&b| b == b'>') {
                    pos += end_idx + 1;
                    if !output.ends_with(' ') {
                        output.push(' ');
                    }
                    continue;
                } else {
                    break;
                }
            }
        } else {
            let next_tag = bytes[pos..]
                .iter()
                .position(|&b| b == b'<')
                .unwrap_or(len - pos);
            if let Ok(text_slice) = std::str::from_utf8(&bytes[pos..pos + next_tag]) {
                output.push_str(text_slice);
            }
            pos += next_tag;
        }
    }

    let unescaped = output
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&mdash;", "—")
        .replace("&ndash;", "–")
        .replace("&hellip;", "…");

    let mut normalized = String::with_capacity(unescaped.len());
    let mut last_was_space = false;
    for c in unescaped.chars() {
        if c.is_whitespace() {
            if !last_was_space {
                normalized.push(' ');
                last_was_space = true;
            }
        } else {
            normalized.push(c);
            last_was_space = false;
        }
    }

    normalized.trim().to_string()
}

/// Safely construct a snippet around a search match index.
pub fn build_search_snippet(
    text: &str,
    first_match_byte_pos: usize,
    query_char_count: usize,
    context_chars: usize,
) -> String {
    let char_indices: Vec<(usize, char)> = text.char_indices().collect();
    if char_indices.is_empty() {
        return String::new();
    }

    let char_idx = char_indices
        .iter()
        .position(|&(b_idx, _)| b_idx >= first_match_byte_pos)
        .unwrap_or(0);

    let start_char_idx = char_idx.saturating_sub(context_chars);
    let end_char_idx = (char_idx + query_char_count + context_chars).min(char_indices.len());

    let start_byte = char_indices
        .get(start_char_idx)
        .map(|&(b, _)| b)
        .unwrap_or(0);
    let end_byte = if end_char_idx >= char_indices.len() {
        text.len()
    } else {
        char_indices[end_char_idx].0
    };

    let slice = text[start_byte..end_byte].trim();
    let prefix = if start_char_idx > 0 { "..." } else { "" };
    let suffix = if end_char_idx < char_indices.len() {
        "..."
    } else {
        ""
    };

    format!("{}{}{}", prefix, slice, suffix)
}
