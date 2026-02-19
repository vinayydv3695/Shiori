/// TXT Format Adapter - Plain text file support
/// 
/// Provides basic support for plain text files including metadata inference,
/// validation, and conversion to EPUB.

use crate::services::format_adapter::{
    BookFormatAdapter, BookMetadata, CoverImage, ValidationResult, ConversionResult,
    FormatCapabilities, FormatError, FormatResult,
};
use async_trait::async_trait;
use std::path::Path;
use tokio::fs;
use tokio::io::AsyncReadExt;

pub struct TxtFormatAdapter;

impl TxtFormatAdapter {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl BookFormatAdapter for TxtFormatAdapter {
    fn format_id(&self) -> &str {
        "txt"
    }
    
    async fn validate(&self, path: &Path) -> FormatResult<ValidationResult> {
        let mut file = fs::File::open(path).await?;
        let file_size = file.metadata().await?.len();
        
        // Read first 4KB to validate it's text
        let mut buffer = vec![0u8; 4096];
        let bytes_read = file.read(&mut buffer).await?;
        buffer.truncate(bytes_read);
        
        // Check if valid UTF-8
        match std::str::from_utf8(&buffer) {
            Ok(_) => {
                let mut result = ValidationResult::valid(file_size);
                
                // Estimate word and page count
                let content = fs::read_to_string(path).await?;
                result.word_count = Some(count_words(&content));
                result.page_count = Some(estimate_pages(&content));
                
                Ok(result)
            }
            Err(e) => {
                Ok(ValidationResult::invalid(
                    format!("Invalid UTF-8 encoding: {}", e)
                ))
            }
        }
    }
    
    async fn extract_metadata(&self, path: &Path) -> FormatResult<BookMetadata> {
        let file_size = fs::metadata(path).await?.len();
        let content = fs::read_to_string(path).await?;
        
        // Infer title from filename
        let title = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();
        
        // Try to extract author from first line if it looks like "by Author Name"
        let author = extract_author_from_content(&content);
        
        let word_count = Some(count_words(&content));
        let page_count = Some(estimate_pages(&content));
        
        Ok(BookMetadata {
            title,
            authors: author.map(|a| vec![a]).unwrap_or_default(),
            publisher: None,
            pubdate: None,
            isbn: None,
            language: Some("en".to_string()),
            description: None,
            tags: vec![],
            series: None,
            series_index: None,
            rating: None,
            file_format: "txt".to_string(),
            file_size,
            page_count,
            word_count,
        })
    }
    
    async fn extract_cover(&self, _path: &Path) -> FormatResult<Option<CoverImage>> {
        // Text files don't have covers
        Ok(None)
    }
    
    fn can_convert_to(&self, target: &str) -> bool {
        matches!(target, "epub" | "html" | "pdf")
    }
    
    async fn convert_to(
        &self,
        _source: &Path,
        _target: &Path,
        target_format: &str,
    ) -> FormatResult<ConversionResult> {
        if !self.can_convert_to(target_format) {
            return Err(FormatError::ConversionNotSupported {
                from: "txt".to_string(),
                to: target_format.to_string(),
            });
        }
        
        // Conversion will be handled by ConversionEngine
        Err(FormatError::ConversionError(
            "Conversion not yet implemented. Use ConversionEngine.".to_string()
        ))
    }
    
    fn capabilities(&self) -> FormatCapabilities {
        FormatCapabilities {
            supports_toc: false,
            supports_images: false,
            supports_text_reflow: true,
            supports_annotations: true,
            supports_metadata: false, // Limited metadata
            is_readable: true,
            supports_search: true,
        }
    }
}

/// Count words in text
fn count_words(text: &str) -> u32 {
    text.split_whitespace().count() as u32
}

/// Estimate page count (assuming ~250 words per page)
fn estimate_pages(text: &str) -> u32 {
    let words = count_words(text);
    (words / 250).max(1)
}

/// Try to extract author from content
/// Looks for patterns like "by Author Name" in the first few lines
fn extract_author_from_content(content: &str) -> Option<String> {
    let first_lines: Vec<&str> = content.lines().take(10).collect();
    
    for line in first_lines {
        let lower = line.to_lowercase();
        if lower.starts_with("by ") {
            return Some(line[3..].trim().to_string());
        }
        if lower.starts_with("author: ") {
            return Some(line[8..].trim().to_string());
        }
    }
    
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_count_words() {
        assert_eq!(count_words("Hello world"), 2);
        assert_eq!(count_words("  Multiple   spaces  "), 2);
        assert_eq!(count_words("Line 1\nLine 2\nLine 3"), 6);
    }
    
    #[test]
    fn test_estimate_pages() {
        let text = "word ".repeat(500);
        assert_eq!(estimate_pages(&text), 2); // 500 words / 250 = 2 pages
    }
    
    #[test]
    fn test_extract_author() {
        let content = "Title\nby John Doe\nChapter 1";
        assert_eq!(extract_author_from_content(content), Some("John Doe".to_string()));
        
        let content2 = "Title\nAuthor: Jane Smith\nChapter 1";
        assert_eq!(extract_author_from_content(content2), Some("Jane Smith".to_string()));
    }
}
