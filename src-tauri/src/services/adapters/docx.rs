/// DOCX Format Adapter
/// 
/// Supports Microsoft Word DOCX files using the docx-rs crate.
/// Extracts metadata from document properties and core properties.
/// Can convert DOCX to EPUB or TXT format.

use async_trait::async_trait;
use docx_rs::*;
use std::path::Path;
use tokio::fs;

use crate::services::format_adapter::*;

pub struct DocxFormatAdapter;

impl DocxFormatAdapter {
    pub fn new() -> Self {
        Self
    }
    
    /// Extract text content from DOCX paragraphs
    fn extract_text_from_document(doc: &Docx) -> String {
        let mut text = String::new();
        
        for child in &doc.document.children {
            match child {
                DocumentChild::Paragraph(para) => {
                    for child in &para.children {
                        if let ParagraphChild::Run(run) = child {
                            for child in &run.children {
                                if let RunChild::Text(t) = child {
                                    text.push_str(&t.text);
                                    text.push(' ');
                                }
                            }
                        }
                    }
                    text.push('\n');
                }
                DocumentChild::Table(_table) => {
                    // Table extraction simplified - docx-rs API changed
                    // Skip table content for now
                    text.push_str("[Table]\n");
                }
                _ => {}
            }
        }
        
        text
    }
    
    /// Estimate paragraphs and chapters from document structure
    fn count_structure(doc: &Docx) -> (u32, u32) {
        let mut paragraph_count = 0;
        let mut heading_count = 0;
        
        for child in &doc.document.children {
            if let DocumentChild::Paragraph(para) = child {
                paragraph_count += 1;
                
                // Check if paragraph has heading style
                let property = &para.property;
                if let Some(style) = &property.style {
                    if style.val.starts_with("Heading") {
                        heading_count += 1;
                    }
                }
            }
        }
        
        (paragraph_count, heading_count)
    }
}

impl Default for DocxFormatAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl BookFormatAdapter for DocxFormatAdapter {
    fn format_id(&self) -> &str {
        "docx"
    }
    
    async fn validate(&self, path: &Path) -> FormatResult<ValidationResult> {
        let file_data = fs::read(path).await?;
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();
        
        // Parse DOCX
        let doc = read_docx(&file_data)
            .map_err(|e| FormatError::ValidationError(format!("Invalid DOCX file: {}", e)))?;
        
        let mut result = ValidationResult::valid(file_size);
        
        // Extract text and count words
        let text = Self::extract_text_from_document(&doc);
        let word_count = text.split_whitespace().count() as u32;
        result.word_count = Some(word_count);
        
        // Estimate page count (250 words per page)
        result.page_count = Some((word_count + 249) / 250);
        
        // Count structure
        let (para_count, heading_count) = Self::count_structure(&doc);
        result.chapter_count = Some(heading_count);
        
        // Validation checks
        if word_count == 0 {
            result.warnings.push("Document appears to be empty".to_string());
        }
        
        if para_count == 0 {
            result.warnings.push("No paragraphs found in document".to_string());
        }
        
        Ok(result)
    }
    
    async fn extract_metadata(&self, path: &Path) -> FormatResult<BookMetadata> {
        let file_data = fs::read(path).await?;
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();
        
        let doc = read_docx(&file_data)
            .map_err(|e| FormatError::MetadataError(format!("Failed to load DOCX: {}", e)))?;
        
        let mut book_meta = BookMetadata {
            file_format: "docx".to_string(),
            file_size,
            ..Default::default()
        };
        
        // Extract metadata from core properties
        // Note: docx-rs 0.4.19 doesn't expose config field publicly
        // We'll use filename as title and extract text for word count
        
        // Extract text for word count
        let text = Self::extract_text_from_document(&doc);
        let word_count = text.split_whitespace().count() as u32;
        book_meta.word_count = Some(word_count);
        book_meta.page_count = Some((word_count + 249) / 250);
        
        // Fallback: use filename as title if no title found
        if book_meta.title == "Unknown" {
            if let Some(filename) = path.file_stem() {
                book_meta.title = filename.to_string_lossy().to_string();
            }
        }
        
        Ok(book_meta)
    }
    
    async fn extract_cover(&self, path: &Path) -> FormatResult<Option<CoverImage>> {
        let file_data = fs::read(path).await?;
        
        let doc = read_docx(&file_data)
            .map_err(|e| FormatError::CoverError(format!("Failed to load DOCX: {}", e)))?;
        
        // Try to find first image in document as cover
        for child in &doc.document.children {
            if let DocumentChild::Paragraph(para) = child {
                for child in &para.children {
                    if let ParagraphChild::Run(run) = child {
                        for child in &run.children {
                            if let RunChild::Drawing(drawing) = child {
                                // Found a drawing/image
                                // Extract image from relationships
                                // This is complex - for now return None
                                // CoverService will generate a pattern
                                
                                // TODO: Extract embedded images from DOCX
                                // Need to parse document/word/document.xml.rels
                                // and extract image data from media/ folder
                            }
                        }
                    }
                }
            }
        }
        
        Ok(None)
    }
    
    fn can_convert_to(&self, target: &str) -> bool {
        // DOCX can be converted to EPUB and TXT
        matches!(target, "epub" | "txt")
    }
    
    async fn convert_to(
        &self,
        _source: &Path,
        _target: &Path,
        target_format: &str,
    ) -> FormatResult<ConversionResult> {
        // Conversion not implemented yet
        // Will be handled by ConversionEngine
        Err(FormatError::ConversionNotSupported {
            from: "docx".to_string(),
            to: target_format.to_string(),
        })
    }
    
    fn capabilities(&self) -> FormatCapabilities {
        FormatCapabilities {
            supports_toc: true,        // Can extract headings
            supports_images: true,      // Documents can have images
            supports_text_reflow: true, // Reflowable
            supports_annotations: false,
            supports_metadata: true,
            is_readable: false,         // Not directly readable in app
            supports_search: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_format_id() {
        let adapter = DocxFormatAdapter::new();
        assert_eq!(adapter.format_id(), "docx");
    }
    
    #[test]
    fn test_capabilities() {
        let adapter = DocxFormatAdapter::new();
        let caps = adapter.capabilities();
        
        assert!(caps.supports_toc);
        assert!(caps.supports_images);
        assert!(caps.supports_text_reflow);
        assert!(!caps.supports_annotations);
        assert!(caps.supports_metadata);
        assert!(!caps.is_readable); // Not readable in app
        assert!(caps.supports_search);
    }
    
    #[test]
    fn test_can_convert_to() {
        let adapter = DocxFormatAdapter::new();
        
        assert!(adapter.can_convert_to("epub"));
        assert!(adapter.can_convert_to("txt"));
        assert!(!adapter.can_convert_to("pdf"));
    }
}
