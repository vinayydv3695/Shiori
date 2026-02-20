use crate::error::{Result, ShioriError};
use crate::models::Metadata;
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::Path;
use zip::ZipArchive;

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
        "cbz" | "cbr" => extract_cbz_cover(file_path, book_uuid),
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

fn extract_cbz_cover(file_path: &str, book_uuid: &str) -> Result<Option<String>> {
    log::info!("[extract_cbz_cover] Extracting cover from: {}", file_path);

    // Read the archive file
    let file_data = fs::read(file_path).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to read CBZ/CBR file: {}", e))
    })?;

    // Parse ZIP archive
    let cursor = Cursor::new(&file_data);
    let mut archive = ZipArchive::new(cursor).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to parse CBZ/CBR archive: {}", e))
    })?;

    // Helper to check if filename is an image
    let is_image = |name: &str| {
        let lower = name.to_lowercase();
        lower.ends_with(".jpg")
            || lower.ends_with(".jpeg")
            || lower.ends_with(".png")
            || lower.ends_with(".webp")
            || lower.ends_with(".gif")
            || lower.ends_with(".bmp")
    };

    // Collect all image files with natural sorting
    let mut image_files: Vec<(usize, String)> = Vec::new();
    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index(i) {
            let name = file.name().to_string();
            // Skip hidden files and directories
            if !name.starts_with('.') && !name.starts_with("__MACOSX") && is_image(&name) {
                image_files.push((i, name));
            }
        }
    }

    if image_files.is_empty() {
        log::warn!("[extract_cbz_cover] No image files found in archive");
        return Ok(None);
    }

    // Sort by natural order (page1.jpg < page10.jpg)
    image_files.sort_by(|a, b| natord::compare(&a.1, &b.1));

    // Get the first image (cover)
    let first_image_idx = image_files[0].0;
    let first_image_name = &image_files[0].1;

    log::info!(
        "[extract_cbz_cover] Using first image as cover: {}",
        first_image_name
    );

    // Extract the first image
    let mut archive = ZipArchive::new(Cursor::new(&file_data)).unwrap();
    let mut file = archive.by_index(first_image_idx).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to access first image: {}", e))
    })?;

    let mut cover_data = Vec::new();
    file.read_to_end(&mut cover_data).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to read image data: {}", e))
    })?;

    // Get app data directory
    let app_dir = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME").map(|h| format!("{}/.local/share", h)))
        .map_err(|_| ShioriError::MetadataExtraction("Failed to get app data dir".to_string()))?;

    let covers_dir = Path::new(&app_dir).join("com.tauri.shiori").join("covers");
    fs::create_dir_all(&covers_dir).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to create covers dir: {}", e))
    })?;

    // Determine file extension from original image
    let ext = Path::new(first_image_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg");

    let cover_filename = format!("{}.{}", book_uuid, ext);
    let cover_path = covers_dir.join(&cover_filename);

    // Save cover image
    let mut output_file = fs::File::create(&cover_path).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to create cover file: {}", e))
    })?;

    output_file.write_all(&cover_data).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to write cover data: {}", e))
    })?;

    log::info!(
        "[extract_cbz_cover] ✅ Cover extracted to: {}",
        cover_path.display()
    );
    Ok(Some(cover_path.to_string_lossy().to_string()))
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
