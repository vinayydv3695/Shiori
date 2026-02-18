use crate::error::{Result, ShioriError};
use crate::models::Metadata;
use std::fs;
use std::io::Write;
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

pub fn extract_cover(file_path: &str, book_uuid: &str) -> Result<Option<String>> {
    let path = Path::new(file_path);
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .ok_or_else(|| ShioriError::InvalidFormat("No file extension".to_string()))?
        .to_lowercase();

    match extension.as_str() {
        "epub" => extract_epub_cover(file_path, book_uuid),
        "pdf" => Ok(None), // PDF cover extraction not yet implemented
        _ => Ok(None),
    }
}

fn extract_epub_cover(file_path: &str, book_uuid: &str) -> Result<Option<String>> {
    let mut doc = epub::doc::EpubDoc::new(file_path)
        .map_err(|e| ShioriError::MetadataExtraction(format!("Failed to parse EPUB: {}", e)))?;

    // Try to get cover image - returns (Vec<u8>, String) where String is media type
    if let Some((cover_data, _media_type)) = doc.get_cover() {
        // Get app data directory
        let app_dir = std::env::var("APPDATA")
            .or_else(|_| std::env::var("HOME").map(|h| format!("{}/.local/share", h)))
            .map_err(|_| {
                ShioriError::MetadataExtraction("Failed to get app data dir".to_string())
            })?;

        let covers_dir = Path::new(&app_dir).join("com.tauri.shiori").join("covers");
        fs::create_dir_all(&covers_dir).map_err(|e| {
            ShioriError::MetadataExtraction(format!("Failed to create covers dir: {}", e))
        })?;

        let cover_filename = format!("{}.jpg", book_uuid);
        let cover_path = covers_dir.join(&cover_filename);

        // Save cover image
        let mut file = fs::File::create(&cover_path).map_err(|e| {
            ShioriError::MetadataExtraction(format!("Failed to create cover file: {}", e))
        })?;

        file.write_all(&cover_data).map_err(|e| {
            ShioriError::MetadataExtraction(format!("Failed to write cover data: {}", e))
        })?;

        return Ok(Some(cover_path.to_string_lossy().to_string()));
    }

    Ok(None)
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
            // Extract title
            if let Ok(title) = info_dict.get(b"Title") {
                if let Ok(title_bytes) = title.as_str() {
                    let title_str = String::from_utf8_lossy(title_bytes).trim().to_string();
                    if !title_str.is_empty() {
                        metadata.title = Some(title_str);
                    }
                }
            }

            // Extract author
            if let Ok(author) = info_dict.get(b"Author") {
                if let Ok(author_bytes) = author.as_str() {
                    let author_str = String::from_utf8_lossy(author_bytes).trim().to_string();
                    if !author_str.is_empty() {
                        metadata.authors.push(author_str);
                    }
                }
            }

            // Extract subject (can be used as description)
            if let Ok(subject) = info_dict.get(b"Subject") {
                if let Ok(subject_bytes) = subject.as_str() {
                    let subject_str = String::from_utf8_lossy(subject_bytes).trim().to_string();
                    if !subject_str.is_empty() {
                        metadata.description = Some(subject_str);
                    }
                }
            }
        }
    }

    // If no title found in metadata, try to extract from filename
    if metadata.title.is_none() {
        let path = Path::new(file_path);
        if let Some(file_stem) = path.file_stem().and_then(|s| s.to_str()) {
            // Clean up filename (remove common patterns)
            let cleaned = file_stem.replace('_', " ").replace('-', " ");
            metadata.title = Some(cleaned);
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
