/// Calibre-quality format conversion module for Shiori.
///
/// Implements proper format parsing for MOBI/AZW3, PDF, TXT, FB2, and DOCX
/// with output to EPUB 3. Algorithms inspired by calibre (GPL-3.0) but
/// reimplemented from scratch in Rust.

pub mod epub_writer;
pub mod utils;
pub mod mobi;
pub mod pdf;
pub mod txt;
pub mod fb2;
pub mod docx;

use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

// ──────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ──────────────────────────────────────────────────────────────────────────

/// Output of a successful format → EPUB conversion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpubOutput {
    /// Absolute path to the written .epub file
    pub path: PathBuf,
    /// Extracted or inferred title
    pub title: String,
    /// Extracted author (if any)
    pub author: Option<String>,
    /// JPEG bytes of cover image (if extracted)
    pub cover_data: Option<Vec<u8>>,
    /// Number of chapters in the output EPUB
    pub chapter_count: usize,
    /// Warnings encountered during conversion (non-fatal)
    pub warnings: Vec<String>,
}

/// Source format for conversion
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceFormat {
    Mobi,
    Azw3,
    Pdf,
    Txt,
    Fb2,
    Docx,
}

impl SourceFormat {
    /// Parse from file extension string
    #[allow(dead_code)]
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "mobi" => Some(Self::Mobi),
            "azw3" | "azw" => Some(Self::Azw3),
            "pdf" => Some(Self::Pdf),
            "txt" | "text" => Some(Self::Txt),
            "fb2" | "fb2.zip" | "fbz" => Some(Self::Fb2),
            "docx" => Some(Self::Docx),
            _ => None,
        }
    }
}

/// Conversion error types
#[allow(dead_code)]
#[derive(Debug, thiserror::Error)]
pub enum ConversionError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid format: {0}")]
    InvalidFormat(String),

    #[error("Unsupported compression type: {0}")]
    UnsupportedCompression(u16),

    #[error("Missing dependency: {0}")]
    MissingDependency(String),

    #[error("Encoding error: {0}")]
    Encoding(String),

    #[error("XML parse error: {0}")]
    Xml(String),

    #[error("ZIP error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("Conversion error: {0}")]
    Other(String),
}

impl From<ConversionError> for crate::services::format_adapter::FormatError {
    fn from(e: ConversionError) -> Self {
        crate::services::format_adapter::FormatError::ConversionError(e.to_string())
    }
}

/// Convert a source file to EPUB 3.
///
/// This is the primary public API. It dispatches to the appropriate
/// format-specific converter based on `format`.
pub async fn convert_to_epub(
    source_path: &Path,
    output_path: &Path,
    format: SourceFormat,
) -> Result<EpubOutput, ConversionError> {
    if !source_path.exists() {
        return Err(ConversionError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Source file not found: {}", source_path.display()),
        )));
    }

    match format {
        SourceFormat::Mobi | SourceFormat::Azw3 => {
            mobi::convert(source_path, output_path).await
        }
        SourceFormat::Pdf => {
            pdf::convert(source_path, output_path).await
        }
        SourceFormat::Txt => {
            txt::convert(source_path, output_path).await
        }
        SourceFormat::Fb2 => {
            fb2::convert(source_path, output_path).await
        }
        SourceFormat::Docx => {
            docx::convert(source_path, output_path).await
        }
    }
}
