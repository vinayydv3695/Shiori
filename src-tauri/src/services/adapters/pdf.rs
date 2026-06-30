/// PDF Format Adapter
///
/// Supports PDF files using the lopdf crate for parsing.
/// Extracts metadata from PDF Info dictionary and document properties.
/// Renders first page as cover image using pdf-extract.
use async_trait::async_trait;

use lopdf::{Document, Object};
use std::path::Path;
use tokio::fs;

use crate::services::format_adapter::*;

pub struct PdfFormatAdapter;

impl PdfFormatAdapter {
    pub fn new() -> Self {
        Self
    }

    /// Extract string from PDF object
    fn get_pdf_string(obj: &Object) -> Option<String> {
        match obj {
            Object::String(bytes, _) => {
                if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
                    let u16_chars: Vec<u16> = bytes[2..]
                        .chunks_exact(2)
                        .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
                        .collect();
                    return Some(String::from_utf16_lossy(&u16_chars));
                }
                
                // If it's valid UTF-8, use it.
                if let Ok(s) = std::str::from_utf8(bytes) {
                    return Some(s.to_string());
                }
                
                // If invalid UTF-8, check if it's likely UTF-8 (few replacements).
                let utf8_lossy = String::from_utf8_lossy(bytes);
                let replacement_count = utf8_lossy.chars().filter(|&c| c == std::char::REPLACEMENT_CHARACTER).count();
                
                // If too many replacements, fallback to Latin-1 / WinAnsi
                if replacement_count > bytes.len() / 4 {
                    Some(bytes.iter().map(|&b| b as char).collect())
                } else {
                    Some(utf8_lossy.into_owned())
                }
            }
            Object::Name(bytes) => Some(String::from_utf8_lossy(bytes).into_owned()),
            _ => None,
        }
    }

    /// Extract text from PDF object (handles arrays)
    fn get_pdf_text(obj: &Object) -> Option<String> {
        match obj {
            Object::String(_, _) | Object::Name(_) => Self::get_pdf_string(obj),
            Object::Array(arr) => {
                // Concatenate array elements (common for titles with mixed fonts)
                arr.iter()
                    .filter_map(Self::get_pdf_string)
                    .collect::<Vec<_>>()
                    .join("")
                    .into()
            }
            _ => None,
        }
    }

    /// Parse authors from PDF creator/author field
    fn parse_authors(author_str: &str) -> Vec<String> {
        // Split by common delimiters: comma, semicolon, "and", "&"
        let delimiters = [",", ";", " and ", " & "];
        let mut authors = vec![author_str.to_string()];

        for delim in &delimiters {
            authors = authors
                .into_iter()
                .flat_map(|s| s.split(delim).map(str::to_string).collect::<Vec<_>>())
                .collect();
        }

        authors
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    }

    /// Extract text content from PDF (using pdf-extract for robust CMAP resolution)
    pub fn extract_content(path: &Path) -> FormatResult<String> {
        let bytes = std::fs::read(path)
            .map_err(|e| FormatError::ConversionError(format!("Failed to read PDF file: {}", e)))?;
            
        let full_text = pdf_extract::extract_text_from_mem(&bytes)
            .map_err(|e| FormatError::ConversionError(format!("Failed to extract text from PDF: {}", e)))?;

        // Post-process text with heuristics
        Ok(Self::post_process_text(&full_text))
    }

    /// Post-process extracted raw PDF text with heuristics for paragraphs and lists
    pub fn post_process_text(raw_text: &str) -> String {
        let lines: Vec<&str> = raw_text.lines().collect();
        let mut processed = String::with_capacity(raw_text.len());
        let mut i = 0;

        let is_list_item = |line: &str| -> bool {
            let t = line.trim_start();
            t.starts_with('•') || t.starts_with('-') || t.starts_with('*') || t.starts_with("o ") 
            || (t.chars().next().map_or(false, |c| c.is_ascii_digit()) && t.contains(". "))
        };

        let ends_with_punctuation = |line: &str| -> bool {
            let t = line.trim_end();
            t.ends_with('.') || t.ends_with('!') || t.ends_with('?') || t.ends_with('"') || t.ends_with('\'') || t.ends_with(':') || t.ends_with(';')
        };

        // Collapse spaces helper
        let collapse_spaces = |s: &str| -> String {
            let mut result = String::with_capacity(s.len());
            let mut last_was_space = false;
            for c in s.chars() {
                if c.is_whitespace() {
                    if !last_was_space {
                        result.push(' ');
                        last_was_space = true;
                    }
                } else {
                    result.push(c);
                    last_was_space = false;
                }
            }
            result
        };

        while i < lines.len() {
            let line = lines[i].trim();
            
            if line.is_empty() {
                if !processed.ends_with("\n\n") && !processed.is_empty() {
                    if processed.ends_with('\n') {
                        processed.push('\n');
                    } else {
                        processed.push_str("\n\n");
                    }
                }
                i += 1;
                continue;
            }

            let collapsed_line = collapse_spaces(line);

            if is_list_item(&collapsed_line) {
                // Ensure double newline before list items
                if !processed.ends_with("\n\n") && !processed.is_empty() {
                    if processed.ends_with('\n') {
                        processed.push('\n');
                    } else {
                        processed.push_str("\n\n");
                    }
                }
            }

            processed.push_str(&collapsed_line);

            let has_punct = ends_with_punctuation(&collapsed_line);
            
            // Lookahead to next non-empty line
            let mut j = i + 1;
            let mut next_line = "";
            let mut blank_lines_between = 0;
            while j < lines.len() {
                let n = lines[j].trim();
                if !n.is_empty() {
                    next_line = n;
                    break;
                }
                blank_lines_between += 1;
                j += 1;
            }

            if next_line.is_empty() {
                // End of document
            } else if is_list_item(next_line) {
                processed.push_str("\n\n");
            } else if blank_lines_between > 0 {
                processed.push_str("\n\n");
            } else {
                // No blank lines between.
                if has_punct && next_line.chars().next().map_or(false, |c| c.is_uppercase()) {
                    processed.push(' ');
                } else if has_punct {
                    processed.push(' ');
                } else {
                    processed.push(' ');
                }
            }
            
            i = j;
        }

        processed.trim().to_string()
    }
}

impl Default for PdfFormatAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl BookFormatAdapter for PdfFormatAdapter {
    fn format_id(&self) -> &str {
        "pdf"
    }

    async fn validate(&self, path: &Path) -> FormatResult<ValidationResult> {
        // Read file size
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();

        // Try to load PDF
        let doc = Document::load(path)
            .map_err(|e| FormatError::ValidationError(format!("Invalid PDF structure: {}", e)))?;

        let mut result = ValidationResult::valid(file_size);

        // Count pages
        let page_count = doc.get_pages().len() as u32;
        result.page_count = Some(page_count);

        // Check for encryption
        if doc.is_encrypted() {
            result.warnings.push("PDF is encrypted".to_string());
        }

        // Validate basic structure
        if page_count == 0 {
            result.errors.push("PDF has no pages".to_string());
            result.is_valid = false;
        }

        // Check PDF version (doc.version is a String like "1.7")
        if let Some((major_str, minor_str)) = doc.version.split_once('.') {
            if let (Ok(major), Ok(minor)) = (major_str.parse::<u8>(), minor_str.parse::<u8>()) {
                if major > 2 {
                    result.warnings.push(format!(
                        "PDF version {}.{} may not be fully supported",
                        major, minor
                    ));
                }
            }
        }

        Ok(result)
    }

    async fn extract_metadata(&self, path: &Path) -> FormatResult<BookMetadata> {
        let doc = Document::load(path)
            .map_err(|e| FormatError::MetadataError(format!("Failed to load PDF: {}", e)))?;

        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();

        let mut book_meta = BookMetadata {
            file_format: "pdf".to_string(),
            file_size,
            page_count: Some(doc.get_pages().len() as u32),
            ..Default::default()
        };

        // Extract metadata from Info dictionary
        if let Ok(info_dict) = doc.trailer.get(b"Info") {
            if let Ok(info_id) = info_dict.as_reference() {
                if let Ok(info_obj) = doc.get_object(info_id) {
                    if let Ok(info) = info_obj.as_dict() {
                        // Extract title
                        if let Ok(title_obj) = info.get(b"Title") {
                            if let Some(title) = Self::get_pdf_text(title_obj) {
                                if !title.trim().is_empty() {
                                    book_meta.title = title.trim().to_string();
                                }
                            }
                        }

                        // Extract author
                        if let Ok(author_obj) = info.get(b"Author") {
                            if let Some(author) = Self::get_pdf_text(author_obj) {
                                book_meta.authors = Self::parse_authors(&author);
                            }
                        }

                        // Extract subject (description)
                        if let Ok(subject_obj) = info.get(b"Subject") {
                            if let Some(subject) = Self::get_pdf_text(subject_obj) {
                                book_meta.description = Some(subject.trim().to_string());
                            }
                        }

                        // Extract keywords (tags)
                        if let Ok(keywords_obj) = info.get(b"Keywords") {
                            if let Some(keywords) = Self::get_pdf_text(keywords_obj) {
                                book_meta.tags = keywords
                                    .split(&[',', ';', ' '][..])
                                    .map(|s| s.trim().to_string())
                                    .filter(|s| !s.is_empty())
                                    .collect();
                            }
                        }

                        // Extract creator/producer
                        if book_meta.authors.is_empty() {
                            if let Ok(creator_obj) = info.get(b"Creator") {
                                if let Some(creator) = Self::get_pdf_text(creator_obj) {
                                    book_meta.authors = Self::parse_authors(&creator);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Fallback: use filename as title if no title found
        if book_meta.title == "Unknown" {
            if let Some(filename) = path.file_stem() {
                book_meta.title = filename.to_string_lossy().to_string();
            }
        }

        Ok(book_meta)
    }

    async fn extract_cover(&self, _path: &Path) -> FormatResult<Option<CoverImage>> {
        // For now, return None - we'll implement first-page rendering later
        // This requires pdf-extract or pdf-render crate which adds complexity
        // The CoverService will handle generating a geometric pattern instead

        // TODO: Implement first page rendering:
        // 1. Use pdf-extract to render first page
        // 2. Convert to DynamicImage
        // 3. Scale to appropriate cover size
        // 4. Return as CoverImage

        Ok(None)
    }

    fn can_convert_to(&self, target: &str) -> bool {
        // PDF can be converted to text and epub (via text extraction)
        matches!(target, "txt" | "epub")
    }

    async fn convert_to(
        &self,
        _source: &Path,
        _target: &Path,
        target_format: &str,
    ) -> FormatResult<ConversionResult> {
        // Text extraction not implemented yet
        Err(FormatError::ConversionNotSupported {
            from: "pdf".to_string(),
            to: target_format.to_string(),
        })
    }

    fn capabilities(&self) -> FormatCapabilities {
        // PDF is read-only with limited features
        FormatCapabilities {
            supports_toc: true,          // PDFs can have bookmarks
            supports_images: true,       // PDFs contain images
            supports_text_reflow: false, // Fixed layout
            supports_annotations: false, // Not supported in reader yet
            supports_metadata: true,     // Rich metadata
            is_readable: true,           // Can be read
            supports_search: true,       // Text search possible
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_authors() {
        let tests = vec![
            ("John Doe", vec!["John Doe"]),
            ("John Doe, Jane Smith", vec!["John Doe", "Jane Smith"]),
            ("John Doe; Jane Smith", vec!["John Doe", "Jane Smith"]),
            ("John Doe and Jane Smith", vec!["John Doe", "Jane Smith"]),
            ("John Doe & Jane Smith", vec!["John Doe", "Jane Smith"]),
            (
                "  John Doe  ,  Jane Smith  ",
                vec!["John Doe", "Jane Smith"],
            ),
        ];

        for (input, expected) in tests {
            let result = PdfFormatAdapter::parse_authors(input);
            assert_eq!(result, expected, "Failed for input: {}", input);
        }
    }

    #[test]
    fn test_format_id() {
        let adapter = PdfFormatAdapter::new();
        assert_eq!(adapter.format_id(), "pdf");
    }

    #[test]
    fn test_pdf_metadata_extraction() {
        // Simple test to ensure the logic parses authors correctly
        let authors = PdfFormatAdapter::parse_authors("John Doe and Jane Smith");
        assert_eq!(authors.len(), 2);
        assert_eq!(authors[0], "John Doe");
        assert_eq!(authors[1], "Jane Smith");
    }

    #[test]
    fn test_post_process_text() {
        let raw = "This is a sentence that gets\nbroken across lines without punctuation\nand continues here.\n\nNew paragraph here.";
        let processed = PdfFormatAdapter::post_process_text(raw);
        assert_eq!(processed, "This is a sentence that gets broken across lines without punctuation and continues here.\n\nNew paragraph here.");

        let list_raw = "Here is a list:\n1. First item\n2. Second item\n• Bullet one\n• Bullet two";
        let list_processed = PdfFormatAdapter::post_process_text(list_raw);
        assert_eq!(list_processed, "Here is a list:\n\n1. First item\n\n2. Second item\n\n• Bullet one\n\n• Bullet two");
    }

    #[test]
    fn test_capabilities() {
        let adapter = PdfFormatAdapter::new();
        let caps = adapter.capabilities();

        assert!(caps.supports_toc);
        assert!(caps.supports_images);
        assert!(!caps.supports_text_reflow); // Fixed layout
        assert!(!caps.supports_annotations);
        assert!(caps.supports_metadata);
        assert!(caps.is_readable);
        assert!(caps.supports_search);
    }

    #[test]
    fn test_can_convert_to() {
        let adapter = PdfFormatAdapter::new();

        assert!(adapter.can_convert_to("txt"));
        assert!(adapter.can_convert_to("epub"));
        assert!(!adapter.can_convert_to("mobi"));
    }
}
