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
        title: doc.mdata("title").map(|s| s.value.clone()),
        authors: vec![],
        isbn: doc.mdata("identifier").map(|s| s.value.clone()),
        publisher: doc.mdata("publisher").map(|s| s.value.clone()),
        pubdate: doc.mdata("date").map(|s| s.value.clone()),
        language: doc.mdata("language").map(|s| s.value.clone()),
        description: doc.mdata("description").map(|s| s.value.clone()),
        page_count: None,
    };

    // Get authors (can be multiple)
    if let Some(creator) = doc.mdata("creator") {
        metadata.authors.push(creator.value.clone());
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
                if let Ok(title_bytes) = title.as_str() {
                    metadata.title = String::from_utf8_lossy(title_bytes).into_owned().into();
                }
            }
            if let Ok(author) = info_dict.get(b"Author") {
                if let Ok(author_bytes) = author.as_str() {
                    metadata
                        .authors
                        .push(String::from_utf8_lossy(author_bytes).into_owned());
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
