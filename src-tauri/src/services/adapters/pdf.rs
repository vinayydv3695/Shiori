/// PDF Format Adapter
/// 
/// Supports PDF files using the lopdf crate for parsing.
/// Extracts metadata from PDF Info dictionary and document properties.
/// Renders first page as cover image using pdf-extract.

use async_trait::async_trait;
use lopdf::{Document, Object, ObjectId};
use std::path::Path;
use tokio::fs;
use lopdf::content::Content;

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
                // Try UTF-8 first, fallback to latin1
                String::from_utf8(bytes.clone())
                    .or_else(|_| {
                        // Latin1/Windows-1252 decoding
                        Ok::<String, ()>(bytes.iter().map(|&b| b as char).collect())
                    })
                    .ok()
            }
            Object::Name(bytes) => String::from_utf8(bytes.clone()).ok(),
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

    /// Extract text content from PDF (simple extraction)
    pub fn extract_content(path: &Path) -> FormatResult<String> {
        let doc = Document::load(path)
            .map_err(|e| FormatError::ConversionError(format!("Failed to load PDF: {}", e)))?;
        
        // PDF pages are stored in a BTreeMap<u32, ObjectId>, so iteration is sorted by page number
        let mut full_text = String::new();
        
        for (_page_num, page_id) in doc.get_pages() {
            if let Ok(content_data) = doc.get_page_content(page_id) {
                 if let Ok(content) = Content::decode(&content_data) {
                     for operation in content.operations {
                         // Very basic text extraction
                         if operation.operator == "Tj" {
                             if let Some(obj) = operation.operands.get(0) {
                                 if let Some(text) = Self::get_pdf_text(obj) {
                                     full_text.push_str(&text);
                                 }
                             }
                         } else if operation.operator == "TJ" {
                             if let Some(Object::Array(arr)) = operation.operands.get(0) {
                                 for obj in arr {
                                     if let Some(text) = Self::get_pdf_text(obj) {
                                         full_text.push_str(&text);
                                     } else if let Object::Integer(spacing) = obj {
                                         if *spacing < -100 { full_text.push(' '); }
                                     } else if let Object::Real(spacing) = obj {
                                         if *spacing < -100.0 { full_text.push(' '); }
                                     }
                                 }
                             }
                         } else if operation.operator == "T*" || operation.operator == "ET" {
                             full_text.push('\n');
                         } else if operation.operator == "TD" || operation.operator == "Td" {
                             full_text.push('\n');
                         }
                     }
                     full_text.push_str("\n\n");
                 }
            }
        }
        
        Ok(full_text)
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
    
    async fn extract_cover(&self, path: &Path) -> FormatResult<Option<CoverImage>> {
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
            supports_toc: true,        // PDFs can have bookmarks
            supports_images: true,      // PDFs contain images
            supports_text_reflow: false, // Fixed layout
            supports_annotations: false, // Not supported in reader yet
            supports_metadata: true,    // Rich metadata
            is_readable: true,          // Can be read
            supports_search: true,      // Text search possible
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
            ("  John Doe  ,  Jane Smith  ", vec!["John Doe", "Jane Smith"]),
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
        assert!(!adapter.can_convert_to("epub"));
        assert!(!adapter.can_convert_to("mobi"));
    }
}
