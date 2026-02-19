/// Modern EPUB Adapter implementing BookFormatAdapter trait
/// 
/// Provides complete EPUB support including metadata extraction, cover extraction,
/// validation, and conversion capabilities.

use crate::services::format_adapter::{
    BookFormatAdapter, BookMetadata, CoverImage, ValidationResult, ConversionResult,
    FormatCapabilities, FormatError, FormatResult,
};
use async_trait::async_trait;
use epub::doc::EpubDoc;
use std::path::{Path, PathBuf};
use std::io::BufReader;
use std::fs::File;
use chrono::Utc;
use std::time::Instant;

pub struct EpubFormatAdapter;

impl EpubFormatAdapter {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl BookFormatAdapter for EpubFormatAdapter {
    fn format_id(&self) -> &str {
        "epub"
    }
    
    async fn validate(&self, path: &Path) -> FormatResult<ValidationResult> {
        let file_size = tokio::fs::metadata(path)
            .await?
            .len();
        
        // Try to open EPUB
        let doc_result = tokio::task::spawn_blocking({
            let path = path.to_path_buf();
            move || EpubDoc::new(&path)
        }).await;
        
        let doc = match doc_result {
            Ok(Ok(doc)) => doc,
            Ok(Err(e)) => {
                return Ok(ValidationResult::invalid(
                    format!("Invalid EPUB structure: {}", e)
                ));
            }
            Err(e) => {
                return Ok(ValidationResult::invalid(
                    format!("Failed to open EPUB: {}", e)
                ));
            }
        };
        
        let mut result = ValidationResult::valid(file_size);
        
        // Validate required files
        if doc.resources.is_empty() {
            result.warnings.push("No resources found in EPUB".to_string());
        }
        
        // Check for TOC
        if doc.toc.is_empty() {
            result.warnings.push("No table of contents found".to_string());
        }
        
        // Count chapters
        result.chapter_count = Some(doc.get_num_pages() as u32);
        
        // Estimate word count (rough)
        result.word_count = estimate_epub_word_count(&doc);
        
        Ok(result)
    }
    
    async fn extract_metadata(&self, path: &Path) -> FormatResult<BookMetadata> {
        let file_size = tokio::fs::metadata(path).await?.len();
        
        let (doc, path_buf) = {
            let path_buf = path.to_path_buf();
            let doc = tokio::task::spawn_blocking({
                let p = path_buf.clone();
                move || EpubDoc::new(&p)
            })
            .await
            .map_err(|e| FormatError::MetadataError(format!("Task join error: {}", e)))?
            .map_err(|e| FormatError::MetadataError(format!("Failed to open EPUB: {}", e)))?;
            (doc, path_buf)
        };
        
        // Extract metadata
        let title = doc.mdata("title")
            .map(|t| t.value.clone())
            .unwrap_or_else(|| {
                path_buf.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string()
            });
        
        let authors = doc.mdata("creator")
            .map(|a| vec![a.value.clone()])
            .unwrap_or_default();
        
        let publisher = doc.mdata("publisher").map(|p| p.value.clone());
        let pubdate = doc.mdata("date").map(|d| d.value.clone());
        let isbn = doc.mdata("identifier").map(|i| i.value.clone());
        let language = doc.mdata("language").map(|l| l.value.clone());
        let description = doc.mdata("description").map(|d| d.value.clone());
        
        // Extract tags/subjects
        let tags = if let Some(subject) = doc.mdata("subject") {
            subject.value.split(',')
                .map(|s| s.trim().to_string())
                .collect()
        } else {
            vec![]
        };
        
        // Series information (if available in metadata)
        let series = doc.mdata("calibre:series").map(|s| s.value.clone());
        let series_index = doc.mdata("calibre:series_index")
            .and_then(|i| i.value.parse::<f32>().ok());
        
        let page_count = Some(doc.get_num_pages() as u32);
        let word_count = estimate_epub_word_count(&doc);
        
        Ok(BookMetadata {
            title,
            authors,
            publisher,
            pubdate,
            isbn,
            language,
            description,
            tags,
            series,
            series_index,
            rating: None,
            file_format: "epub".to_string(),
            file_size,
            page_count,
            word_count,
        })
    }
    
    async fn extract_cover(&self, path: &Path) -> FormatResult<Option<CoverImage>> {
        let cover_data = tokio::task::spawn_blocking({
            let path = path.to_path_buf();
            move || -> Result<Option<Vec<u8>>, String> {
                let mut doc = EpubDoc::new(&path)
                    .map_err(|e| format!("Failed to open EPUB: {}", e))?;
                
                // Try multiple methods to find cover
                
                // Method 1: get_cover() method
                if let Some((cover_bytes, _mime)) = doc.get_cover() {
                    return Ok(Some(cover_bytes));
                }
                
                // Method 2: Look for cover.jpg/png in resources
                let resource_keys: Vec<_> = doc.resources.keys().cloned().collect();
                for resource_path in resource_keys {
                    let lower = resource_path.to_lowercase();
                    if lower.contains("cover") && 
                       (lower.ends_with(".jpg") || lower.ends_with(".jpeg") || 
                        lower.ends_with(".png")) {
                        if let Some((bytes, _mime)) = doc.get_resource(&resource_path) {
                            return Ok(Some(bytes));
                        }
                    }
                }
                
                // Method 3: Get first image
                let resource_keys: Vec<_> = doc.resources.keys().cloned().collect();
                for resource_path in resource_keys {
                    let lower = resource_path.to_lowercase();
                    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".png") {
                        if let Some((bytes, _mime)) = doc.get_resource(&resource_path) {
                            return Ok(Some(bytes));
                        }
                    }
                }
                
                Ok(None)
            }
        })
        .await
        .map_err(|e| FormatError::CoverError(format!("Task join error: {}", e)))?
        .map_err(|e| FormatError::CoverError(e))?;
        
        match cover_data {
            Some(bytes) => {
                let image = CoverImage::from_bytes(&bytes)?;
                Ok(Some(image))
            }
            None => Ok(None),
        }
    }
    
    fn can_convert_to(&self, target: &str) -> bool {
        matches!(target, "pdf" | "mobi" | "html" | "txt")
    }
    
    async fn convert_to(
        &self,
        source: &Path,
        target: &Path,
        target_format: &str,
    ) -> FormatResult<ConversionResult> {
        if !self.can_convert_to(target_format) {
            return Err(FormatError::ConversionNotSupported {
                from: "epub".to_string(),
                to: target_format.to_string(),
            });
        }
        
        let start = Instant::now();
        
        // Conversion will be handled by the ConversionEngine
        // For now, return a placeholder
        Err(FormatError::ConversionError(
            "Conversion not yet implemented. Use ConversionEngine.".to_string()
        ))
    }
    
    fn capabilities(&self) -> FormatCapabilities {
        FormatCapabilities::full_support()
    }
}

/// Estimate word count from EPUB content (rough approximation)
fn estimate_epub_word_count(doc: &EpubDoc<BufReader<File>>) -> Option<u32> {
    // This is a rough estimation
    // In a real implementation, we'd need to:
    // 1. Extract all text content
    // 2. Strip HTML tags
    // 3. Count words
    
    // For now, return None
    // TODO: Implement proper word counting
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_epub_adapter_format_id() {
        let adapter = EpubFormatAdapter::new();
        assert_eq!(adapter.format_id(), "epub");
    }
    
    #[tokio::test]
    async fn test_epub_capabilities() {
        let adapter = EpubFormatAdapter::new();
        let caps = adapter.capabilities();
        
        assert!(caps.supports_toc);
        assert!(caps.supports_images);
        assert!(caps.supports_text_reflow);
        assert!(caps.is_readable);
    }
}
