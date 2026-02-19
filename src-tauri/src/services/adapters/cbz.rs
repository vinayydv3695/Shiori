/// CBZ (Comic Book ZIP) Format Adapter
/// 
/// Supports CBZ comic book archives (ZIP files containing images).
/// Extracts metadata from file structure and ComicInfo.xml if present.
/// Cover is extracted from first image in the archive.

use async_trait::async_trait;
use std::io::Cursor;
use std::path::Path;
use tokio::fs;
use zip::ZipArchive;

use crate::services::format_adapter::*;

pub struct CbzFormatAdapter;

impl CbzFormatAdapter {
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
    
    /// Extract ComicInfo.xml metadata if present
    fn extract_comic_info(_xml: &str) -> Option<(String, Vec<String>)> {
        // TODO: Parse ComicInfo.xml format
        // Contains: <ComicInfo><Title>, <Writer>, <Series>, <Number>, etc.
        // For now, return None
        None
    }
}

impl Default for CbzFormatAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl BookFormatAdapter for CbzFormatAdapter {
    fn format_id(&self) -> &str {
        "cbz"
    }
    
    async fn validate(&self, path: &Path) -> FormatResult<ValidationResult> {
        let file_data = fs::read(path).await?;
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();
        
        // Parse ZIP
        let cursor = Cursor::new(file_data);
        let mut archive = ZipArchive::new(cursor)
            .map_err(|e| FormatError::ValidationError(format!("Invalid CBZ/ZIP file: {}", e)))?;
        
        let mut result = ValidationResult::valid(file_size);
        
        // Count image files (pages)
        let mut page_count = 0;
        for i in 0..archive.len() {
            if let Ok(file) = archive.by_index(i) {
                if Self::is_image_file(file.name()) {
                    page_count += 1;
                }
            }
        }
        
        result.page_count = Some(page_count);
        
        if page_count == 0 {
            result.errors.push("No image files found in CBZ archive".to_string());
            result.is_valid = false;
        }
        
        Ok(result)
    }
    
    async fn extract_metadata(&self, path: &Path) -> FormatResult<BookMetadata> {
        let file_data = fs::read(path).await?;
        let metadata = fs::metadata(path).await?;
        let file_size = metadata.len();
        
        let cursor = Cursor::new(file_data);
        let mut archive = ZipArchive::new(cursor)
            .map_err(|e| FormatError::MetadataError(format!("Failed to load CBZ: {}", e)))?;
        
        let mut book_meta = BookMetadata {
            file_format: "cbz".to_string(),
            file_size,
            ..Default::default()
        };
        
        // Try to extract ComicInfo.xml
        if let Ok(mut info_file) = archive.by_name("ComicInfo.xml") {
            let mut xml_content = String::new();
            if let Ok(_) = std::io::Read::read_to_string(&mut info_file, &mut xml_content) {
                if let Some((title, writers)) = Self::extract_comic_info(&xml_content) {
                    book_meta.title = title;
                    book_meta.authors = writers;
                }
            }
        }
        
        // Count pages
        let mut page_count = 0;
        for i in 0..archive.len() {
            if let Ok(file) = archive.by_index(i) {
                if Self::is_image_file(file.name()) {
                    page_count += 1;
                }
            }
        }
        book_meta.page_count = Some(page_count);
        
        // Use filename as title if no metadata found
        if book_meta.title == "Unknown" {
            if let Some(filename) = path.file_stem() {
                let title = filename.to_string_lossy().to_string();
                // Clean up common comic naming patterns
                // e.g., "Batman_001.cbz" -> "Batman 001"
                book_meta.title = title.replace('_', " ");
            }
        }
        
        // Add "Comic" tag
        book_meta.tags = vec!["Comic".to_string()];
        
        Ok(book_meta)
    }
    
    async fn extract_cover(&self, path: &Path) -> FormatResult<Option<CoverImage>> {
        let file_data = fs::read(path).await?;
        let cursor = Cursor::new(file_data);
        let mut archive = ZipArchive::new(cursor)
            .map_err(|e| FormatError::CoverError(format!("Failed to load CBZ: {}", e)))?;
        
        // Find first image file (sorted alphabetically)
        let mut image_files: Vec<String> = Vec::new();
        for i in 0..archive.len() {
            if let Ok(file) = archive.by_index(i) {
                if Self::is_image_file(file.name()) {
                    image_files.push(file.name().to_string());
                }
            }
        }
        
        image_files.sort();
        
        if let Some(first_image) = image_files.first() {
            if let Ok(mut file) = archive.by_name(first_image) {
                let mut image_data = Vec::new();
                if std::io::Read::read_to_end(&mut file, &mut image_data).is_ok() {
                    match CoverImage::from_bytes(&image_data) {
                        Ok(cover) => return Ok(Some(cover)),
                        Err(e) => {
                            log::warn!("Failed to decode CBZ cover image: {}", e);
                        }
                    }
                }
            }
        }
        
        Ok(None)
    }
    
    fn can_convert_to(&self, _target: &str) -> bool {
        // CBZ doesn't need conversion - images can be extracted directly
        false
    }
    
    async fn convert_to(
        &self,
        _source: &Path,
        _target: &Path,
        target_format: &str,
    ) -> FormatResult<ConversionResult> {
        Err(FormatError::ConversionNotSupported {
            from: "cbz".to_string(),
            to: target_format.to_string(),
        })
    }
    
    fn capabilities(&self) -> FormatCapabilities {
        FormatCapabilities {
            supports_toc: false,        // Comics don't have TOC
            supports_images: true,       // Comics are all images
            supports_text_reflow: false, // Fixed image layout
            supports_annotations: false,
            supports_metadata: true,     // Limited metadata
            is_readable: true,           // Can be read as image viewer
            supports_search: false,      // No text content
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_format_id() {
        let adapter = CbzFormatAdapter::new();
        assert_eq!(adapter.format_id(), "cbz");
    }
    
    #[test]
    fn test_is_image_file() {
        assert!(CbzFormatAdapter::is_image_file("page01.jpg"));
        assert!(CbzFormatAdapter::is_image_file("cover.jpeg"));
        assert!(CbzFormatAdapter::is_image_file("image.PNG"));
        assert!(CbzFormatAdapter::is_image_file("pic.gif"));
        assert!(!CbzFormatAdapter::is_image_file("readme.txt"));
        assert!(!CbzFormatAdapter::is_image_file("ComicInfo.xml"));
    }
    
    #[test]
    fn test_capabilities() {
        let adapter = CbzFormatAdapter::new();
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
        let adapter = CbzFormatAdapter::new();
        
        assert!(!adapter.can_convert_to("epub"));
        assert!(!adapter.can_convert_to("pdf"));
    }
}
