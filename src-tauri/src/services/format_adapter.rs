/// Format Adapter Trait - Unified interface for all book formats
/// 
/// This is the foundational trait that all format-specific adapters must implement.
/// It provides a consistent API for metadata extraction, validation, cover extraction,
/// and format conversion across all 11 supported book formats.

use async_trait::async_trait;
use image::DynamicImage;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum FormatError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Image error: {0}")]
    Image(#[from] image::ImageError),
    
    #[error("Invalid format: {0}")]
    InvalidFormat(String),
    
    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),
    
    #[error("Metadata extraction failed: {0}")]
    MetadataError(String),
    
    #[error("Cover extraction failed: {0}")]
    CoverError(String),
    
    #[error("Validation failed: {0}")]
    ValidationError(String),
    
    #[error("Conversion not supported: {from} -> {to}")]
    ConversionNotSupported { from: String, to: String },
    
    #[error("Conversion failed: {0}")]
    ConversionError(String),
}

pub type FormatResult<T> = Result<T, FormatError>;

/// Core trait that all format adapters must implement
#[async_trait]
pub trait BookFormatAdapter: Send + Sync {
    /// Get format identifier (e.g., "epub", "pdf", "mobi")
    fn format_id(&self) -> &str;
    
    /// Validate file integrity and structure
    async fn validate(&self, path: &Path) -> FormatResult<ValidationResult>;
    
    /// Extract complete metadata from the book file
    async fn extract_metadata(&self, path: &Path) -> FormatResult<BookMetadata>;
    
    /// Extract cover image (returns None if not found)
    async fn extract_cover(&self, path: &Path) -> FormatResult<Option<CoverImage>>;
    
    /// Check if this format can be converted to the target format
    fn can_convert_to(&self, target: &str) -> bool;
    
    /// Convert to target format
    async fn convert_to(
        &self,
        source: &Path,
        target: &Path,
        target_format: &str,
    ) -> FormatResult<ConversionResult>;
    
    /// Get reading capabilities of this format
    fn capabilities(&self) -> FormatCapabilities;
}

/// Validation result containing file integrity information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub file_size: u64,
    pub page_count: Option<u32>,
    pub word_count: Option<u32>,
    pub chapter_count: Option<u32>,
}

impl ValidationResult {
    pub fn valid(file_size: u64) -> Self {
        Self {
            is_valid: true,
            errors: vec![],
            warnings: vec![],
            file_size,
            page_count: None,
            word_count: None,
            chapter_count: None,
        }
    }
    
    pub fn invalid(error: String) -> Self {
        Self {
            is_valid: false,
            errors: vec![error],
            warnings: vec![],
            file_size: 0,
            page_count: None,
            word_count: None,
            chapter_count: None,
        }
    }
}

/// Complete book metadata extracted from a file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookMetadata {
    pub title: String,
    pub authors: Vec<String>,
    pub publisher: Option<String>,
    pub pubdate: Option<String>,
    pub isbn: Option<String>,
    pub language: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub series: Option<String>,
    pub series_index: Option<f32>,
    pub rating: Option<i32>,
    pub file_format: String,
    pub file_size: u64,
    pub page_count: Option<u32>,
    pub word_count: Option<u32>,
}

impl Default for BookMetadata {
    fn default() -> Self {
        Self {
            title: "Unknown".to_string(),
            authors: vec![],
            publisher: None,
            pubdate: None,
            isbn: None,
            language: None,
            description: None,
            tags: vec![],
            series: None,
            series_index: None,
            rating: None,
            file_format: String::new(),
            file_size: 0,
            page_count: None,
            word_count: None,
        }
    }
}

/// Cover image with metadata
#[derive(Clone)]
pub struct CoverImage {
    pub image: DynamicImage,
    pub width: u32,
    pub height: u32,
    pub format: ImageFormat,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ImageFormat {
    Jpeg,
    Png,
    Gif,
    WebP,
    Bmp,
}

impl CoverImage {
    pub fn new(image: DynamicImage) -> Self {
        let (width, height) = (image.width(), image.height());
        Self {
            image,
            width,
            height,
            format: ImageFormat::Jpeg, // Default
        }
    }
    
    pub fn from_bytes(data: &[u8]) -> FormatResult<Self> {
        let image = image::load_from_memory(data)
            .map_err(|e| FormatError::CoverError(format!("Failed to decode image: {}", e)))?;
        Ok(Self::new(image))
    }
}

/// Result of a format conversion operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversionResult {
    pub success: bool,
    pub output_path: PathBuf,
    pub output_size: u64,
    pub duration_ms: u64,
    pub warnings: Vec<String>,
}

/// Format capabilities describing what features are supported
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct FormatCapabilities {
    pub supports_toc: bool,           // Table of contents
    pub supports_images: bool,        // Embedded images
    pub supports_text_reflow: bool,   // Reflowable text
    pub supports_annotations: bool,   // Highlights/notes
    pub supports_metadata: bool,      // Rich metadata
    pub is_readable: bool,            // Can be read in app
    pub supports_search: bool,        // Text search
}

impl FormatCapabilities {
    pub fn full_support() -> Self {
        Self {
            supports_toc: true,
            supports_images: true,
            supports_text_reflow: true,
            supports_annotations: true,
            supports_metadata: true,
            is_readable: true,
            supports_search: true,
        }
    }
    
    pub fn read_only() -> Self {
        Self {
            supports_toc: true,
            supports_images: true,
            supports_text_reflow: false,
            supports_annotations: false,
            supports_metadata: true,
            is_readable: true,
            supports_search: true,
        }
    }
    
    pub fn metadata_only() -> Self {
        Self {
            supports_toc: false,
            supports_images: false,
            supports_text_reflow: false,
            supports_annotations: false,
            supports_metadata: true,
            is_readable: false,
            supports_search: false,
        }
    }
}

/// Format information with detection metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatInfo {
    pub format: String,
    pub extension: String,
    pub mime_type: String,
    pub detected_by: DetectionMethod,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum DetectionMethod {
    Extension,
    MagicBytes,
    ContentInspection,
}

impl FormatInfo {
    pub fn new(format: &str) -> Self {
        let (extension, mime_type) = match format {
            "epub" => ("epub", "application/epub+zip"),
            "pdf" => ("pdf", "application/pdf"),
            "mobi" => ("mobi", "application/x-mobipocket-ebook"),
            "azw3" => ("azw3", "application/vnd.amazon.ebook"),
            "fb2" => ("fb2", "application/x-fictionbook+xml"),
            "docx" => ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            "txt" => ("txt", "text/plain"),
            "html" => ("html", "text/html"),
            "cbz" => ("cbz", "application/vnd.comicbook+zip"),
            "cbr" => ("cbr", "application/vnd.comicbook-rar"),
            _ => ("bin", "application/octet-stream"),
        };
        
        Self {
            format: format.to_string(),
            extension: extension.to_string(),
            mime_type: mime_type.to_string(),
            detected_by: DetectionMethod::Extension,
        }
    }
    
    pub fn epub() -> Self { Self::new("epub") }
    pub fn pdf() -> Self { Self::new("pdf") }
    pub fn mobi() -> Self { Self::new("mobi") }
    pub fn azw3() -> Self { Self::new("azw3") }
    pub fn fb2() -> Self { Self::new("fb2") }
    pub fn docx() -> Self { Self::new("docx") }
    pub fn txt() -> Self { Self::new("txt") }
    pub fn html() -> Self { Self::new("html") }
    pub fn cbz() -> Self { Self::new("cbz") }
    pub fn cbr() -> Self { Self::new("cbr") }
}

/// Format support level
pub enum FormatSupport {
    /// Fully supported with all features
    FullySupported {
        adapter: Box<dyn BookFormatAdapter>,
    },
    /// Read-only support (no conversion)
    ReadOnly {
        adapter: Box<dyn BookFormatAdapter>,
        reason: String,
    },
    /// Metadata extraction only
    MetadataOnly {
        format: String,
        reason: String,
    },
    /// Not supported
    Unsupported {
        format: String,
        suggestion: String,
    },
}
