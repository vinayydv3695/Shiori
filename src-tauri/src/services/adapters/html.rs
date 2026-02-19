/// HTML Format Adapter
/// 
/// Supports HTML files using html5ever for parsing.
/// Extracts metadata from HTML meta tags and document structure.
/// Can convert HTML to EPUB format.

use async_trait::async_trait;
use html5ever::parse_document;
use html5ever::tendril::TendrilSink;
use markup5ever_rcdom::{Handle, NodeData, RcDom};
use std::path::Path;
use tokio::fs;

use crate::services::format_adapter::*;

pub struct HtmlFormatAdapter;

impl HtmlFormatAdapter {
    pub fn new() -> Self {
        Self
    }
    
    /// Extract text content from HTML DOM
    fn extract_text(handle: &Handle) -> String {
        let mut text = String::new();
        
        match &handle.data {
            NodeData::Text { contents } => {
                text.push_str(&contents.borrow());
            }
            NodeData::Element { .. } => {
                for child in handle.children.borrow().iter() {
                    text.push_str(&Self::extract_text(child));
                }
            }
            _ => {}
        }
        
        text
    }
    
    /// Find meta tag content by name or property
    fn find_meta_content(dom: &RcDom, attr_name: &str, attr_value: &str) -> Option<String> {
        Self::find_meta_in_node(&dom.document, attr_name, attr_value)
    }
    
    fn find_meta_in_node(handle: &Handle, attr_name: &str, attr_value: &str) -> Option<String> {
        if let NodeData::Element { name, attrs, .. } = &handle.data {
            if &name.local == "meta" {
                let attrs = attrs.borrow();
                
                // Check if this meta tag matches our search
                let has_target = attrs.iter().any(|attr| {
                    &attr.name.local.to_string() == attr_name
                        && attr.value.to_string().to_lowercase() == attr_value.to_lowercase()
                });
                
                if has_target {
                    // Find content attribute
                    for attr in attrs.iter() {
                        if &attr.name.local == "content" {
                            return Some(attr.value.to_string());
                        }
                    }
                }
            }
        }
        
        // Recursively search children
        for child in handle.children.borrow().iter() {
            if let Some(content) = Self::find_meta_in_node(child, attr_name, attr_value) {
                return Some(content);
            }
        }
        
        None
    }
    
    /// Find title element content
    fn find_title(handle: &Handle) -> Option<String> {
        if let NodeData::Element { name, .. } = &handle.data {
            if &name.local == "title" {
                return Some(Self::extract_text(handle).trim().to_string());
            }
        }
        
        for child in handle.children.borrow().iter() {
            if let Some(title) = Self::find_title(child) {
                return Some(title);
            }
        }
        
        None
    }
    
    /// Count headings for chapter estimation
    fn count_headings(handle: &Handle) -> u32 {
        let mut count = 0;
        
        if let NodeData::Element { name, .. } = &handle.data {
            let tag = name.local.to_string();
            if tag == "h1" || tag == "h2" {
                count += 1;
            }
        }
        
        for child in handle.children.borrow().iter() {
            count += Self::count_headings(child);
        }
        
        count
    }
}

impl Default for HtmlFormatAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl BookFormatAdapter for HtmlFormatAdapter {
    fn format_id(&self) -> &str {
        "html"
    }
    
    async fn validate(&self, path: &Path) -> FormatResult<ValidationResult> {
        let content = fs::read_to_string(path).await?;
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();
        
        // Parse HTML
        let dom = parse_document(RcDom::default(), Default::default())
            .from_utf8()
            .read_from(&mut content.as_bytes())
            .map_err(|e| FormatError::ValidationError(format!("Failed to parse HTML: {}", e)))?;
        
        let mut result = ValidationResult::valid(file_size);
        
        // Extract text and count words
        let text = Self::extract_text(&dom.document);
        let word_count = text.split_whitespace().count() as u32;
        result.word_count = Some(word_count);
        
        // Estimate page count
        result.page_count = Some((word_count + 249) / 250);
        
        // Count headings for chapter estimation
        let heading_count = Self::count_headings(&dom.document);
        result.chapter_count = Some(heading_count);
        
        // Validation checks
        if word_count == 0 {
            result.warnings.push("Document appears to be empty".to_string());
        }
        
        if !content.to_lowercase().contains("<html") {
            result.warnings.push("File may not be valid HTML".to_string());
        }
        
        Ok(result)
    }
    
    async fn extract_metadata(&self, path: &Path) -> FormatResult<BookMetadata> {
        let content = fs::read_to_string(path).await?;
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();
        
        let dom = parse_document(RcDom::default(), Default::default())
            .from_utf8()
            .read_from(&mut content.as_bytes())
            .map_err(|e| FormatError::MetadataError(format!("Failed to parse HTML: {}", e)))?;
        
        let mut book_meta = BookMetadata {
            file_format: "html".to_string(),
            file_size,
            ..Default::default()
        };
        
        // Extract title from <title> tag
        if let Some(title) = Self::find_title(&dom.document) {
            if !title.is_empty() {
                book_meta.title = title;
            }
        }
        
        // Extract metadata from meta tags
        // Author
        if let Some(author) = Self::find_meta_content(&dom, "name", "author") {
            book_meta.authors = vec![author];
        }
        
        // Description
        if let Some(description) = Self::find_meta_content(&dom, "name", "description") {
            book_meta.description = Some(description);
        }
        
        // Keywords (tags)
        if let Some(keywords) = Self::find_meta_content(&dom, "name", "keywords") {
            book_meta.tags = keywords
                .split(&[',', ';'][..])
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
        }
        
        // Language
        if let Some(language) = Self::find_meta_content(&dom, "http-equiv", "content-language") {
            book_meta.language = Some(language);
        }
        
        // Try Open Graph metadata as fallback
        if book_meta.title == "Unknown" {
            if let Some(og_title) = Self::find_meta_content(&dom, "property", "og:title") {
                book_meta.title = og_title;
            }
        }
        
        if book_meta.description.is_none() {
            if let Some(og_desc) = Self::find_meta_content(&dom, "property", "og:description") {
                book_meta.description = Some(og_desc);
            }
        }
        
        // Extract text for word count
        let text = Self::extract_text(&dom.document);
        let word_count = text.split_whitespace().count() as u32;
        book_meta.word_count = Some(word_count);
        book_meta.page_count = Some((word_count + 249) / 250);
        
        // Fallback: use filename as title
        if book_meta.title == "Unknown" {
            if let Some(filename) = path.file_stem() {
                book_meta.title = filename.to_string_lossy().to_string();
            }
        }
        
        Ok(book_meta)
    }
    
    async fn extract_cover(&self, path: &Path) -> FormatResult<Option<CoverImage>> {
        // HTML files don't typically have embedded covers
        // Could potentially extract first <img> tag, but that's often not a cover
        // Let CoverService generate a pattern instead
        Ok(None)
    }
    
    fn can_convert_to(&self, target: &str) -> bool {
        // HTML can be converted to EPUB and TXT
        matches!(target, "epub" | "txt")
    }
    
    async fn convert_to(
        &self,
        _source: &Path,
        _target: &Path,
        target_format: &str,
    ) -> FormatResult<ConversionResult> {
        // Conversion not implemented yet
        Err(FormatError::ConversionNotSupported {
            from: "html".to_string(),
            to: target_format.to_string(),
        })
    }
    
    fn capabilities(&self) -> FormatCapabilities {
        FormatCapabilities {
            supports_toc: true,        // Can extract from headings
            supports_images: true,      // HTML can have images
            supports_text_reflow: true,
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
        let adapter = HtmlFormatAdapter::new();
        assert_eq!(adapter.format_id(), "html");
    }
    
    #[test]
    fn test_capabilities() {
        let adapter = HtmlFormatAdapter::new();
        let caps = adapter.capabilities();
        
        assert!(caps.supports_toc);
        assert!(caps.supports_images);
        assert!(caps.supports_text_reflow);
        assert!(!caps.supports_annotations);
        assert!(caps.supports_metadata);
        assert!(!caps.is_readable);
        assert!(caps.supports_search);
    }
    
    #[test]
    fn test_can_convert_to() {
        let adapter = HtmlFormatAdapter::new();
        
        assert!(adapter.can_convert_to("epub"));
        assert!(adapter.can_convert_to("txt"));
        assert!(!adapter.can_convert_to("pdf"));
    }
}
