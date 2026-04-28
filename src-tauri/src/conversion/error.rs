/// Unified conversion error type.
///
/// Implements `serde::Serialize` so errors can be returned directly from
/// Tauri commands without a separate wrapper.

use std::fmt;

#[allow(dead_code)]
#[derive(Debug)]
pub enum ConversionError {
    /// File extension is not a supported input format
    UnsupportedFormat(String),
    /// Standard I/O error
    IoError(std::io::Error),
    /// Format-specific parse failure with context
    ParseError { format: String, detail: String },
    /// ZIP archive error
    ZipError(zip::result::ZipError),
    /// Image decode/encode error
    ImageError(image::ImageError),
    /// File produced no readable text content
    EmptyContent,
    /// File is DRM-protected
    DrmProtected,
    /// Compressed data uses unsupported compression type
    UnsupportedCompression(u16),
    /// Generic format validation failure (backward compat with old parsers)
    InvalidFormat(String),
    /// A required external tool (pdftohtml, unrar) is missing
    MissingDependency(String),
    /// Text encoding conversion error
    Encoding(String),
    /// XML parse error
    Xml(String),
    /// Generic error with message
    Other(String),
}

impl fmt::Display for ConversionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedFormat(ext) => write!(f, "Unsupported format: .{ext}"),
            Self::IoError(e) => write!(f, "IO error: {e}"),
            Self::ParseError { format, detail } => write!(f, "Failed to parse {format}: {detail}"),
            Self::ZipError(e) => write!(f, "ZIP error: {e}"),
            Self::ImageError(e) => write!(f, "Image error: {e}"),
            Self::EmptyContent => write!(f, "The file produced no readable content"),
            Self::DrmProtected => write!(f, "This file is DRM-protected and cannot be converted"),
            Self::UnsupportedCompression(c) => write!(f, "Unsupported compression type: {c}"),
            Self::InvalidFormat(msg) => write!(f, "Invalid format: {msg}"),
            Self::MissingDependency(dep) => write!(f, "Missing dependency: {dep}"),
            Self::Encoding(msg) => write!(f, "Encoding error: {msg}"),
            Self::Xml(msg) => write!(f, "XML error: {msg}"),
            Self::Other(msg) => write!(f, "Conversion error: {msg}"),
        }
    }
}

impl From<std::io::Error> for ConversionError {
    fn from(e: std::io::Error) -> Self {
        Self::IoError(e)
    }
}

impl From<zip::result::ZipError> for ConversionError {
    fn from(e: zip::result::ZipError) -> Self {
        Self::ZipError(e)
    }
}

impl From<image::ImageError> for ConversionError {
    fn from(e: image::ImageError) -> Self {
        Self::ImageError(e)
    }
}

// Allow ConversionError to be returned from Tauri commands
impl serde::Serialize for ConversionError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}


