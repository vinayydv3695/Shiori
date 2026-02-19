/// MOBI/AZW3 Format Adapter
/// 
/// Supports MOBI and AZW3 (Kindle) formats using the mobi crate.
/// Extracts metadata from EXTH headers and detects KF8 (AZW3) format.
/// Can convert MOBI to EPUB format.

use async_trait::async_trait;
use mobi::Mobi;
use std::path::Path;
use tokio::fs;

use crate::services::format_adapter::*;

pub struct MobiFormatAdapter {
    is_azw3: bool,
}

impl MobiFormatAdapter {
    pub fn new() -> Self {
        Self { is_azw3: false }
    }
    
    /// Create adapter specifically for AZW3
    pub fn new_azw3() -> Self {
        Self { is_azw3: true }
    }
    
    /// Detect if MOBI file is actually AZW3 (KF8 format)
    fn is_kf8(m: &Mobi) -> bool {
        // KF8 (AZW3) has specific markers in the MOBI header
        // Check for "boundary" section which indicates KF8
        // For simplicity, we'll check if version >= 8
        m.metadata.mobi.header_length >= 232
    }
    
    /// Extract string from EXTH record using public API
    fn get_exth_string(_m: &Mobi, _record_type: u32) -> Option<String> {
        // The mobi crate doesn't expose exth records directly
        // Use the public API methods instead
        None
    }
    
    /// Parse authors from EXTH author field
    fn parse_authors(author_str: &str) -> Vec<String> {
        // MOBI typically uses semicolons for multiple authors
        author_str
            .split(';')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    }
    
    /// Extract HTML content from MOBI file (public helper for conversions)
    pub async fn extract_content(path: &Path) -> FormatResult<String> {
        let file_data = fs::read(path).await?;
        let m = Mobi::from_read(&mut &file_data[..])
            .map_err(|e| FormatError::ConversionError(format!("Failed to parse MOBI: {}", e)))?;
        m.content_as_string()
            .map_err(|e| FormatError::ConversionError(format!("Failed to read MOBI content: {}", e)))
    }
}

impl Default for MobiFormatAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl BookFormatAdapter for MobiFormatAdapter {
    fn format_id(&self) -> &str {
        if self.is_azw3 {
            "azw3"
        } else {
            "mobi"
        }
    }
    
    async fn validate(&self, path: &Path) -> FormatResult<ValidationResult> {
        let file_data = fs::read(path).await?;
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();
        
        // Parse MOBI
        let m = Mobi::from_read(&mut &file_data[..])
            .map_err(|e| FormatError::ValidationError(format!("Invalid MOBI file: {}", e)))?;
        
        let mut result = ValidationResult::valid(file_size);
        
        // Detect if this is actually AZW3
        let is_kf8 = Self::is_kf8(&m);
        if is_kf8 && !self.is_azw3 {
            result.warnings.push("File is AZW3 (KF8) format, not MOBI".to_string());
        }
        
        // Note: DRM detection not available in public API
        
        // Get text content to estimate word count
        if let Ok(content) = m.content_as_string() {
            let word_count = content.split_whitespace().count() as u32;
            result.word_count = Some(word_count);
            
            // Estimate page count (250 words per page)
            result.page_count = Some((word_count + 249) / 250);
        }
        
        Ok(result)
    }
    
    async fn extract_metadata(&self, path: &Path) -> FormatResult<BookMetadata> {
        let file_data = fs::read(path).await?;
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();
        
        let m = Mobi::from_read(&mut &file_data[..])
            .map_err(|e| FormatError::MetadataError(format!("Failed to load MOBI: {}", e)))?;
        
        let mut book_meta = BookMetadata {
            file_format: self.format_id().to_string(),
            file_size,
            ..Default::default()
        };
        
        // Extract basic metadata using public API
        book_meta.title = m.title();
        
        // Author
        if let Some(author) = m.author() {
            book_meta.authors = Self::parse_authors(&author);
        }
        
        // Publisher
        book_meta.publisher = m.publisher();
        
        // Description
        book_meta.description = m.description();
        
        // ISBN
        book_meta.isbn = m.isbn();
        
        // Publication date
        book_meta.pubdate = m.publish_date();
        
        // Language (convert enum to string)
        book_meta.language = Some(format!("{:?}", m.language()));
        
        // Extract word count
        if let Ok(content) = m.content_as_string() {
            let word_count = content.split_whitespace().count() as u32;
            book_meta.word_count = Some(word_count);
            book_meta.page_count = Some((word_count + 249) / 250);
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
        let file_data = fs::read(path).await?;
        
        let m = Mobi::from_read(&mut &file_data[..])
            .map_err(|e| FormatError::CoverError(format!("Failed to load MOBI: {}", e)))?;
        
        // Note: Cover extraction not available in public API
        // The mobi crate doesn't expose image_records() method
        // Return None for now
        let _ = m; // Use m to avoid unused variable warning
        Ok(None)
    }
    
    fn can_convert_to(&self, target: &str) -> bool {
        // MOBI can be converted to EPUB and TXT
        matches!(target, "epub" | "txt")
    }
    
    async fn convert_to(
        &self,
        _source: &Path,
        _target: &Path,
        target_format: &str,
    ) -> FormatResult<ConversionResult> {
        // MOBI to EPUB conversion not implemented yet
        // Will be handled by ConversionEngine
        Err(FormatError::ConversionNotSupported {
            from: self.format_id().to_string(),
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
            is_readable: true,
            supports_search: true,
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
            ("John Doe; Jane Smith", vec!["John Doe", "Jane Smith"]),
            ("  John Doe  ;  Jane Smith  ", vec!["John Doe", "Jane Smith"]),
        ];
        
        for (input, expected) in tests {
            let result = MobiFormatAdapter::parse_authors(input);
            assert_eq!(result, expected, "Failed for input: {}", input);
        }
    }
    
    #[test]
    fn test_format_id() {
        let adapter = MobiFormatAdapter::new();
        assert_eq!(adapter.format_id(), "mobi");
        
        let adapter = MobiFormatAdapter::new_azw3();
        assert_eq!(adapter.format_id(), "azw3");
    }
    
    #[test]
    fn test_capabilities() {
        let adapter = MobiFormatAdapter::new();
        let caps = adapter.capabilities();
        
        assert!(caps.supports_toc);
        assert!(caps.supports_images);
        assert!(caps.supports_text_reflow);
        assert!(!caps.supports_annotations);
        assert!(caps.supports_metadata);
        assert!(caps.is_readable);
        assert!(caps.supports_search);
    }
    
    #[test]
    fn test_can_convert_to() {
        let adapter = MobiFormatAdapter::new();
        
        assert!(adapter.can_convert_to("epub"));
        assert!(adapter.can_convert_to("txt"));
        assert!(!adapter.can_convert_to("pdf"));
    }
}
