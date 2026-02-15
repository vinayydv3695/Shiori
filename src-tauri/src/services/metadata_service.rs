use crate::error::{Result, ShioriError};
use crate::models::Metadata;
use std::path::Path;

pub fn extract_from_file(file_path: &str) -> Result<Metadata> {
    let path = Path::new(file_path);
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .ok_or_else(|| ShioriError::InvalidFormat("No file extension".to_string()))?
        .to_lowercase();

    match extension.as_str() {
        "epub" => extract_epub_metadata(file_path),
        "pdf" => extract_pdf_metadata(file_path),
        _ => Ok(Metadata::default_from_filename(path)),
    }
}

fn extract_epub_metadata(file_path: &str) -> Result<Metadata> {
    let doc = epub::doc::EpubDoc::new(file_path)
        .map_err(|e| ShioriError::MetadataExtraction(format!("Failed to parse EPUB: {}", e)))?;

    let mut metadata = Metadata {
        title: doc.mdata("title"),
        authors: vec![],
        isbn: doc.mdata("identifier"),
        publisher: doc.mdata("publisher"),
        pubdate: doc.mdata("date"),
        language: doc.mdata("language"),
        description: doc.mdata("description"),
        page_count: None,
    };

    // Get authors (can be multiple)
    if let Some(creator) = doc.mdata("creator") {
        metadata.authors.push(creator);
    }

    Ok(metadata)
}

fn extract_pdf_metadata(file_path: &str) -> Result<Metadata> {
    let doc = lopdf::Document::load(file_path)
        .map_err(|e| ShioriError::MetadataExtraction(format!("Failed to parse PDF: {}", e)))?;

    let mut metadata = Metadata {
        title: None,
        authors: vec![],
        isbn: None,
        publisher: None,
        pubdate: None,
        language: None,
        description: None,
        page_count: Some(doc.get_pages().len() as i32),
    };

    // Extract metadata from PDF info dictionary
    if let Ok(info) = doc.trailer.get(b"Info") {
        if let Ok(info_dict) = info.as_dict() {
            if let Ok(title) = info_dict.get(b"Title") {
                metadata.title = title.as_str().ok().map(String::from);
            }
            if let Ok(author) = info_dict.get(b"Author") {
                if let Ok(author_str) = author.as_str() {
                    metadata.authors.push(author_str.to_string());
                }
            }
        }
    }

    Ok(metadata)
}

impl Metadata {
    fn default_from_filename(path: &Path) -> Self {
        let title = path.file_stem().and_then(|s| s.to_str()).map(String::from);

        Metadata {
            title,
            authors: vec![],
            isbn: None,
            publisher: None,
            pubdate: None,
            language: Some("eng".to_string()),
            description: None,
            page_count: None,
        }
    }
}
