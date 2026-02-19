/// CBR (Comic Book RAR) Format Adapter
/// 
/// Supports CBR comic book archives (RAR files containing images).
/// Note: RAR support requires unrar library to be installed on the system.
/// Extracts metadata from file structure and ComicInfo.xml if present.

use async_trait::async_trait;
use std::path::Path;
use tokio::fs;

use crate::services::format_adapter::*;

pub struct CbrFormatAdapter;

impl CbrFormatAdapter {
    pub fn new() -> Self {
        Self
    }
    
    /// Check if filename is an image
    fn is_image_file(filename: &str) -> bool {
        let lower = filename.to_lowercase();
        lower.ends_with(".jpg")
            || lower.ends_with(".jpeg")
            || lower.ends_with(".png")
            || lower.ends_with(".gif")
            || lower.ends_with(".webp")
            || lower.ends_with(".bmp")
    }
}

impl Default for CbrFormatAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl BookFormatAdapter for CbrFormatAdapter {
    fn format_id(&self) -> &str {
        "cbr"
    }
    
    async fn validate(&self, path: &Path) -> FormatResult<ValidationResult> {
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();
        
        // Note: Full RAR support requires libunrar which is optional
        // For now, we'll do basic validation
        
        let mut result = ValidationResult::valid(file_size);
        result.warnings.push(
            "CBR support is limited. Consider converting to CBZ format.".to_string()
        );
        
        // TODO: Implement full RAR support using unrar crate
        // This requires libunrar to be installed on the system
        // For now, accept the file but warn about limited support
        
        Ok(result)
    }
    
    async fn extract_metadata(&self, path: &Path) -> FormatResult<BookMetadata> {
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();
        
        let mut book_meta = BookMetadata {
            file_format: "cbr".to_string(),
            file_size,
            ..Default::default()
        };
        
        // Use filename as title
        if let Some(filename) = path.file_stem() {
            let title = filename.to_string_lossy().to_string();
            book_meta.title = title.replace('_', " ");
        }
        
        // Add "Comic" tag
        book_meta.tags = vec!["Comic".to_string()];
        
        // Note: Full metadata extraction requires RAR library
        log::warn!("CBR full metadata extraction not yet implemented");
        
        Ok(book_meta)
    }
    
    async fn extract_cover(&self, _path: &Path) -> FormatResult<Option<CoverImage>> {
        // TODO: Implement RAR extraction and cover extraction
        // Requires unrar crate and libunrar system library
        
        log::warn!("CBR cover extraction not yet implemented");
        Ok(None)
    }
    
    fn can_convert_to(&self, target: &str) -> bool {
        // CBR can be converted to CBZ (re-archive as ZIP)
        matches!(target, "cbz")
    }
    
    async fn convert_to(
        &self,
        _source: &Path,
        _target: &Path,
        target_format: &str,
    ) -> FormatResult<ConversionResult> {
        // Conversion not implemented yet
        Err(FormatError::ConversionNotSupported {
            from: "cbr".to_string(),
            to: target_format.to_string(),
        })
    }
    
    fn capabilities(&self) -> FormatCapabilities {
        FormatCapabilities {
            supports_toc: false,
            supports_images: true,
            supports_text_reflow: false,
            supports_annotations: false,
            supports_metadata: true,
            is_readable: true,           // Limited support
            supports_search: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_format_id() {
        let adapter = CbrFormatAdapter::new();
        assert_eq!(adapter.format_id(), "cbr");
    }
    
    #[test]
    fn test_is_image_file() {
        assert!(CbrFormatAdapter::is_image_file("page01.jpg"));
        assert!(CbrFormatAdapter::is_image_file("cover.jpeg"));
        assert!(CbrFormatAdapter::is_image_file("image.PNG"));
        assert!(!CbrFormatAdapter::is_image_file("readme.txt"));
    }
    
    #[test]
    fn test_capabilities() {
        let adapter = CbrFormatAdapter::new();
        let caps = adapter.capabilities();
        
        assert!(!caps.supports_toc);
        assert!(caps.supports_images);
        assert!(!caps.supports_text_reflow);
        assert!(!caps.supports_annotations);
        assert!(caps.supports_metadata);
        assert!(caps.is_readable);
        assert!(!caps.supports_search);
    }
    
    #[test]
    fn test_can_convert_to() {
        let adapter = CbrFormatAdapter::new();
        
        assert!(adapter.can_convert_to("cbz"));
        assert!(!adapter.can_convert_to("epub"));
    }
}
