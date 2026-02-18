use thiserror::Error;

#[derive(Error, Debug)]
pub enum ShioriError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("CSV error: {0}")]
    Csv(#[from] csv::Error),

    #[error("PDF library error: {0}")]
    LopdfError(String),

    #[error("Book not found: {0}")]
    BookNotFound(String),

    #[error("Tag not found: {0}")]
    TagNotFound(String),

    #[error("Invalid file format: {0}")]
    InvalidFormat(String),

    #[error("Metadata extraction failed: {0}")]
    MetadataExtraction(String),

    #[error("Duplicate book: {0}")]
    DuplicateBook(String),

    #[error("Invalid operation: {0}")]
    InvalidOperation(String),

    // Reader-specific errors with detailed context
    #[error("File not found: {path}")]
    FileNotFound { path: String },

    #[error("File has no read permissions: {path}")]
    FilePermissionDenied { path: String },

    #[error("Corrupted EPUB file: {details}")]
    CorruptedEpub { path: String, details: String },

    #[error("Corrupted PDF file: {details}")]
    CorruptedPdf { path: String, details: String },

    #[error("Unsupported book format: {format}")]
    UnsupportedFormat { format: String, path: String },

    #[error("Failed to read chapter {chapter_index}: {cause}")]
    ChapterReadFailed { chapter_index: usize, cause: String },

    #[error("Failed to parse EPUB structure: {cause}")]
    EpubParseFailed { path: String, cause: String },

    #[error("PDF rendering failed on page {page}: {cause}")]
    PdfRenderFailed { page: usize, cause: String },

    #[error("Book file is empty or truncated")]
    EmptyOrTruncatedFile { path: String },

    #[error("Format detection failed: could not determine file type")]
    FormatDetectionFailed { path: String },

    #[error("Book file size exceeds limit: {size_mb}MB (max: {max_mb}MB)")]
    FileSizeLimitExceeded { size_mb: u64, max_mb: u64 },

    #[error("{0}")]
    Other(String),
}

impl From<lopdf::Error> for ShioriError {
    fn from(err: lopdf::Error) -> Self {
        ShioriError::CorruptedPdf {
            path: String::new(),
            details: format!("{}", err),
        }
    }
}

impl ShioriError {
    /// Get a user-friendly error message suitable for display in the UI
    pub fn user_message(&self) -> String {
        match self {
            Self::FileNotFound { path } => {
                format!("The book file could not be found. It may have been moved or deleted.")
            }
            Self::FilePermissionDenied { path } => {
                "You don't have permission to read this file. Check file permissions.".to_string()
            }
            Self::CorruptedEpub { path, details } => {
                "This EPUB file appears to be corrupted or incomplete.".to_string()
            }
            Self::CorruptedPdf { path, details } => {
                "This PDF file appears to be corrupted or incomplete.".to_string()
            }
            Self::UnsupportedFormat { format, path } => {
                format!("The '{}' format is not currently supported.", format)
            }
            Self::ChapterReadFailed { chapter_index, cause } => {
                format!("Failed to load chapter {}. The file may be corrupted.", chapter_index + 1)
            }
            Self::EpubParseFailed { path, cause } => {
                "Failed to parse the EPUB file structure. The file may be corrupted.".to_string()
            }
            Self::PdfRenderFailed { page, cause } => {
                format!("Failed to render page {}. The PDF may be corrupted.", page + 1)
            }
            Self::EmptyOrTruncatedFile { path } => {
                "The book file appears to be empty or incomplete.".to_string()
            }
            Self::FormatDetectionFailed { path } => {
                "Could not determine the file format. The file may be corrupted or have an incorrect extension.".to_string()
            }
            Self::FileSizeLimitExceeded { size_mb, max_mb } => {
                format!("This file ({} MB) exceeds the maximum size limit of {} MB.", size_mb, max_mb)
            }
            Self::BookNotFound(msg) => format!("Book not found: {}", msg),
            Self::InvalidFormat(msg) => format!("Invalid format: {}", msg),
            _ => self.to_string(),
        }
    }

    /// Get recovery suggestions for the error
    pub fn recovery_suggestions(&self) -> Vec<String> {
        match self {
            Self::FileNotFound { .. } => vec![
                "Check if the file still exists at its original location".to_string(),
                "Try re-importing the book".to_string(),
                "Remove this book from the library and add it again".to_string(),
            ],
            Self::FilePermissionDenied { .. } => vec![
                "Check file permissions in your file manager".to_string(),
                "Try copying the file to a different location".to_string(),
            ],
            Self::CorruptedEpub { .. }
            | Self::CorruptedPdf { .. }
            | Self::EpubParseFailed { .. } => vec![
                "Try re-downloading the book from the original source".to_string(),
                "Check if the file opens in other reader applications".to_string(),
                "The file may be DRM-protected or incompatible".to_string(),
            ],
            Self::UnsupportedFormat { format, .. } => vec![
                format!("Convert the file to EPUB or PDF format"),
                "Check for app updates that may add support for this format".to_string(),
            ],
            Self::EmptyOrTruncatedFile { .. } => vec![
                "The download may have been interrupted - try re-downloading".to_string(),
                "Check available disk space during import".to_string(),
            ],
            Self::FormatDetectionFailed { .. } => vec![
                "Ensure the file has the correct extension (.epub, .pdf, etc.)".to_string(),
                "Try opening the file in another application to verify it's valid".to_string(),
            ],
            Self::FileSizeLimitExceeded { .. } => vec![
                "Try splitting the book into smaller volumes".to_string(),
                "Compress images within the book file".to_string(),
            ],
            Self::ChapterReadFailed { .. } | Self::PdfRenderFailed { .. } => vec![
                "Try restarting the application".to_string(),
                "Re-import the book file".to_string(),
            ],
            _ => vec![],
        }
    }

    /// Get technical details for debugging (for copy-to-clipboard)
    pub fn technical_details(&self) -> String {
        match self {
            Self::CorruptedEpub { path, details } => {
                format!("EPUB Error\nFile: {}\nDetails: {}", path, details)
            }
            Self::CorruptedPdf { path, details } => {
                format!("PDF Error\nFile: {}\nDetails: {}", path, details)
            }
            Self::EpubParseFailed { path, cause } => {
                format!("EPUB Parse Failed\nFile: {}\nCause: {}", path, cause)
            }
            Self::FileNotFound { path } => {
                format!("File Not Found\nPath: {}", path)
            }
            _ => format!("{:?}", self),
        }
    }
}

impl serde::Serialize for ShioriError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, ShioriError>;
pub type ShioriResult<T> = std::result::Result<T, ShioriError>;
