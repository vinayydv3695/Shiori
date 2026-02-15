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

    #[error("{0}")]
    Other(String),
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
