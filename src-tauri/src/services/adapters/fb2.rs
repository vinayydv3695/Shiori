/// FB2 (FictionBook 2) Format Adapter
/// 
/// Supports FB2 XML-based eBook format using quick-xml.
/// FictionBook is popular in Russia and Eastern Europe.
/// Extracts metadata from XML tags and can convert to EPUB.

use async_trait::async_trait;
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use std::path::Path;
use tokio::fs;

use crate::services::format_adapter::*;

pub struct Fb2FormatAdapter;

impl Fb2FormatAdapter {
    pub fn new() -> Self {
        Self
    }
    
    /// Parse FB2 XML and extract text content
    pub fn extract_text(xml: &str) -> String {
        let mut reader = Reader::from_str(xml);
        reader.config_mut().trim_text(true);
        
        let mut text = String::new();
        let mut buf = Vec::new();
        let mut in_body = false;
        
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    if e.name().as_ref() == b"body" {
                        in_body = true;
                    }
                }
                Ok(Event::End(ref e)) => {
                    if e.name().as_ref() == b"body" {
                        in_body = false;
                    }
                }
                Ok(Event::Text(e)) if in_body => {
                    if let Ok(txt) = e.unescape() {
                        text.push_str(&txt);
                        text.push(' ');
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => {
                    log::warn!("Error parsing FB2: {:?}", e);
                    break;
                }
                _ => {}
            }
            buf.clear();
        }
        
        text
    }
    
    /// Extract element content by path (e.g., "title-info/book-title")
    fn extract_element(xml: &str, target_path: &str) -> Option<String> {
        let mut reader = Reader::from_str(xml);
        reader.config_mut().trim_text(true);
        
        let mut buf = Vec::new();
        let mut path = Vec::new();
        let mut capture = false;
        let mut content = String::new();
        
        let target_parts: Vec<&str> = target_path.split('/').collect();
        
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    path.push(name.clone());
                    
                    // Check if current path matches target
                    if path.len() >= target_parts.len() {
                        let current_path = path[path.len() - target_parts.len()..].to_vec();
                        if current_path == target_parts {
                            capture = true;
                        }
                    }
                }
                Ok(Event::End(_)) => {
                    if capture {
                        return Some(content.trim().to_string());
                    }
                    path.pop();
                }
                Ok(Event::Text(e)) if capture => {
                    if let Ok(txt) = e.unescape() {
                        content.push_str(&txt);
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }
        
        None
    }
    
    /// Extract all authors from FB2
    fn extract_authors(xml: &str) -> Vec<String> {
        let mut reader = Reader::from_str(xml);
        reader.config_mut().trim_text(true);
        
        let mut buf = Vec::new();
        let mut authors = Vec::new();
        let mut in_author = false;
        let mut first_name = String::new();
        let mut middle_name = String::new();
        let mut last_name = String::new();
        
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    match e.name().as_ref() {
                        b"author" => {
                            in_author = true;
                            first_name.clear();
                            middle_name.clear();
                            last_name.clear();
                        }
                        _ => {}
                    }
                }
                Ok(Event::End(ref e)) => {
                    if e.name().as_ref() == b"author" && in_author {
                        // Construct full name
                        let mut full_name = Vec::new();
                        if !first_name.is_empty() {
                            full_name.push(first_name.clone());
                        }
                        if !middle_name.is_empty() {
                            full_name.push(middle_name.clone());
                        }
                        if !last_name.is_empty() {
                            full_name.push(last_name.clone());
                        }
                        
                        if !full_name.is_empty() {
                            authors.push(full_name.join(" "));
                        }
                        
                        in_author = false;
                    }
                }
                Ok(Event::Text(e)) if in_author => {
                    if let Ok(txt) = e.unescape() {
                        // Simple heuristic: assign to first empty field
                        if first_name.is_empty() {
                            first_name = txt.to_string();
                        } else if last_name.is_empty() {
                            last_name = txt.to_string();
                        } else if middle_name.is_empty() {
                            middle_name = txt.to_string();
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }
        
        authors
    }
}

impl Default for Fb2FormatAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl BookFormatAdapter for Fb2FormatAdapter {
    fn format_id(&self) -> &str {
        "fb2"
    }
    
    async fn validate(&self, path: &Path) -> FormatResult<ValidationResult> {
        let content = fs::read_to_string(path).await?;
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();
        
        let mut result = ValidationResult::valid(file_size);
        
        // Check if it's valid XML
        if !content.contains("<?xml") || !content.contains("<FictionBook") {
            result.errors.push("Not a valid FB2 file".to_string());
            result.is_valid = false;
            return Ok(result);
        }
        
        // Extract text and count words
        let text = Self::extract_text(&content);
        let word_count = text.split_whitespace().count() as u32;
        result.word_count = Some(word_count);
        
        // Estimate page count
        result.page_count = Some((word_count + 249) / 250);
        
        if word_count == 0 {
            result.warnings.push("Book appears to be empty".to_string());
        }
        
        Ok(result)
    }
    
    async fn extract_metadata(&self, path: &Path) -> FormatResult<BookMetadata> {
        let content = fs::read_to_string(path).await?;
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();
        
        let mut book_meta = BookMetadata {
            file_format: "fb2".to_string(),
            file_size,
            ..Default::default()
        };
        
        // Extract title
        if let Some(title) = Self::extract_element(&content, "title-info/book-title") {
            book_meta.title = title;
        }
        
        // Extract authors
        let authors = Self::extract_authors(&content);
        if !authors.is_empty() {
            book_meta.authors = authors;
        }
        
        // Extract genre (use as tags)
        if let Some(genre) = Self::extract_element(&content, "title-info/genre") {
            book_meta.tags = vec![genre];
        }
        
        // Extract annotation (description)
        if let Some(annotation) = Self::extract_element(&content, "title-info/annotation") {
            book_meta.description = Some(annotation);
        }
        
        // Extract language
        if let Some(lang) = Self::extract_element(&content, "title-info/lang") {
            book_meta.language = Some(lang);
        }
        
        // Extract date
        if let Some(date) = Self::extract_element(&content, "title-info/date") {
            book_meta.pubdate = Some(date);
        }
        
        // Extract publisher
        if let Some(publisher) = Self::extract_element(&content, "publish-info/publisher") {
            book_meta.publisher = Some(publisher);
        }
        
        // Extract ISBN
        if let Some(isbn) = Self::extract_element(&content, "publish-info/isbn") {
            book_meta.isbn = Some(isbn);
        }
        
        // Extract text for word count
        let text = Self::extract_text(&content);
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
        // FB2 can have base64-encoded images in <binary> tags
        // Extracting this requires parsing the XML and decoding base64
        // For now, return None and let CoverService generate a pattern
        
        // TODO: Extract cover from FB2 binary sections
        // Look for <binary id="cover.jpg" content-type="image/jpeg">
        // Decode base64 content and return as CoverImage
        
        Ok(None)
    }
    
    fn can_convert_to(&self, target: &str) -> bool {
        // FB2 can be converted to EPUB and TXT
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
            from: "fb2".to_string(),
            to: target_format.to_string(),
        })
    }
    
    fn capabilities(&self) -> FormatCapabilities {
        FormatCapabilities {
            supports_toc: true,
            supports_images: true,
            supports_text_reflow: true,
            supports_annotations: false,
            supports_metadata: true,
            is_readable: false,
            supports_search: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_format_id() {
        let adapter = Fb2FormatAdapter::new();
        assert_eq!(adapter.format_id(), "fb2");
    }
    
    #[test]
    fn test_capabilities() {
        let adapter = Fb2FormatAdapter::new();
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
        let adapter = Fb2FormatAdapter::new();
        
        assert!(adapter.can_convert_to("epub"));
        assert!(adapter.can_convert_to("txt"));
        assert!(!adapter.can_convert_to("pdf"));
    }
}
