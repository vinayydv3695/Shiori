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
        "mobi" | "azw3" => extract_mobi_metadata(file_path),
        "fb2" => extract_fb2_metadata(file_path),
        "docx" => extract_docx_metadata(file_path),
        _ => Ok(Metadata::default_from_filename(path)),
    }
}

pub fn extract_cover(
    file_path: &str,
    book_uuid: &str,
    covers_dir: &Path,
) -> Result<Option<String>> {
    let path = Path::new(file_path);
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .ok_or_else(|| ShioriError::InvalidFormat("No file extension".to_string()))?
        .to_lowercase();

    match extension.as_str() {
        "epub" => extract_epub_cover(file_path, book_uuid, covers_dir),
        "cbz" | "cbr" => extract_cbz_cover(file_path, book_uuid, covers_dir),
        "pdf" => Ok(None), // PDF cover extraction not yet implemented
        _ => Ok(None),
    }
}

fn extract_epub_cover(
    file_path: &str,
    book_uuid: &str,
    covers_dir: &Path,
) -> Result<Option<String>> {
    log::info!("[extract_epub_cover] Extracting cover from: {}", file_path);
    let mut doc = epub::doc::EpubDoc::new(file_path)
        .map_err(|e| ShioriError::MetadataExtraction(format!("Failed to parse EPUB: {}", e)))?;

    // Try to get cover image - returns (Vec<u8>, String) where String is media type
    if let Some((cover_data, media_type)) = doc.get_cover() {
        fs::create_dir_all(covers_dir).map_err(|e| {
            ShioriError::MetadataExtraction(format!("Failed to create covers dir: {}", e))
        })?;

        // Determine extension from media type or image data
        let ext = match media_type.as_str() {
            "image/jpeg" | "image/jpg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            "image/gif" => "gif",
            _ => {
                // Try to detect from image data (magic bytes)
                if cover_data.len() >= 4 {
                    match &cover_data[0..4] {
                        [0xFF, 0xD8, 0xFF, ..] => "jpg",
                        [0x89, 0x50, 0x4E, 0x47] => "png",
                        [0x52, 0x49, 0x46, 0x46] => "webp",
                        [0x47, 0x49, 0x46, ..] => "gif",
                        _ => "jpg", // fallback
                    }
                } else {
                    "jpg" // fallback
                }
            }
        };

        let cover_filename = format!("{}.{}", book_uuid, ext);
        let cover_path = covers_dir.join(&cover_filename);

        // Save cover image
        let mut file = fs::File::create(&cover_path).map_err(|e| {
            ShioriError::MetadataExtraction(format!("Failed to create cover file: {}", e))
        })?;

        file.write_all(&cover_data).map_err(|e| {
            ShioriError::MetadataExtraction(format!("Failed to write cover data: {}", e))
        })?;

        log::info!(
            "[extract_epub_cover] ✅ Cover extracted to: {}",
            cover_path.display()
        );
        return Ok(Some(cover_path.to_string_lossy().to_string()));
    }

    log::warn!("[extract_epub_cover] No cover found in EPUB");
    Ok(None)
}

fn extract_cbz_cover(
    file_path: &str,
    book_uuid: &str,
    covers_dir: &Path,
) -> Result<Option<String>> {
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
    let mut archive = ZipArchive::new(Cursor::new(&file_data)).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to open ZIP archive: {}", e))
    })?;
    let mut file = archive.by_index(first_image_idx).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to access first image: {}", e))
    })?;

    let mut cover_data = Vec::new();
    file.read_to_end(&mut cover_data).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to read image data: {}", e))
    })?;

    // Save cover to provided covers directory
    fs::create_dir_all(covers_dir).map_err(|e| {
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

fn extract_mobi_metadata(file_path: &str) -> Result<Metadata> {
    use mobi::Mobi;

    let file_data = fs::read(file_path)
        .map_err(|e| ShioriError::MetadataExtraction(format!("Failed to read MOBI: {}", e)))?;

    let m = Mobi::from_read(&mut &file_data[..])
        .map_err(|e| ShioriError::MetadataExtraction(format!("Failed to parse MOBI: {}", e)))?;

    let mut metadata = Metadata {
        title: None,
        authors: vec![],
        isbn: None,
        publisher: None,
        pubdate: None,
        language: None,
        description: None,
        page_count: None,
    };

    // Title
    let title = m.title();
    if !title.is_empty() && title != "Unknown" {
        metadata.title = Some(title);
    }

    // Author — may be semicolon-separated
    if let Some(author) = m.author() {
        let authors: Vec<String> = author
            .split(';')
            .map(|a| a.trim().to_string())
            .filter(|a| !a.is_empty())
            .collect();
        metadata.authors = authors;
    }

    metadata.publisher = m.publisher();
    metadata.description = m.description();
    metadata.isbn = m.isbn();
    metadata.pubdate = m.publish_date();

    // Language — mobi crate returns Language enum directly
    let lang = m.language();
    metadata.language = Some(format!("{:?}", lang));

    // Word count / page estimate
    if let Ok(content) = m.content_as_string() {
        let words = content.split_whitespace().count();
        metadata.page_count = Some(((words + 249) / 250) as i32);
    }

    // Fallback title from filename
    if metadata.title.is_none() {
        let path = Path::new(file_path);
        metadata.title = path.file_stem().and_then(|s| s.to_str()).map(String::from);
    }

    Ok(metadata)
}

fn extract_fb2_metadata(file_path: &str) -> Result<Metadata> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let content = fs::read_to_string(file_path)
        .map_err(|e| ShioriError::MetadataExtraction(format!("Failed to read FB2: {}", e)))?;

    let mut metadata = Metadata {
        title: None,
        authors: vec![],
        isbn: None,
        publisher: None,
        pubdate: None,
        language: None,
        description: None,
        page_count: None,
    };

    let mut reader = Reader::from_str(&content);
    reader.config_mut().trim_text(true);

    // Track element path for context
    let mut path_stack: Vec<String> = Vec::new();
    let mut current_text = String::new();

    // Author name parts
    let mut in_author = false;
    let mut first_name = String::new();
    let mut middle_name = String::new();
    let mut last_name = String::new();

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "author" && path_stack.last().map_or(false, |p| p == "title-info") {
                    in_author = true;
                    first_name.clear();
                    middle_name.clear();
                    last_name.clear();
                }
                path_stack.push(name);
                current_text.clear();
            }
            Ok(Event::End(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();

                if in_author {
                    match name.as_str() {
                        "first-name" => first_name = current_text.trim().to_string(),
                        "middle-name" => middle_name = current_text.trim().to_string(),
                        "last-name" => last_name = current_text.trim().to_string(),
                        "author" => {
                            let full_name = [&first_name, &middle_name, &last_name]
                                .iter()
                                .filter(|s| !s.is_empty())
                                .map(|s| s.as_str())
                                .collect::<Vec<_>>()
                                .join(" ");
                            if !full_name.is_empty() {
                                metadata.authors.push(full_name);
                            }
                            in_author = false;
                        }
                        _ => {}
                    }
                }

                let in_title_info = path_stack.iter().any(|p| p == "title-info");
                let in_publish_info = path_stack.iter().any(|p| p == "publish-info");

                match name.as_str() {
                    "book-title" if in_title_info => {
                        let t = current_text.trim().to_string();
                        if !t.is_empty() {
                            metadata.title = Some(t);
                        }
                    }
                    "lang" if in_title_info => {
                        let l = current_text.trim().to_string();
                        if !l.is_empty() {
                            metadata.language = Some(l);
                        }
                    }
                    "date" if in_title_info => {
                        let d = current_text.trim().to_string();
                        if !d.is_empty() {
                            metadata.pubdate = Some(d);
                        }
                    }
                    "publisher" if in_publish_info => {
                        let p = current_text.trim().to_string();
                        if !p.is_empty() {
                            metadata.publisher = Some(p);
                        }
                    }
                    "isbn" if in_publish_info => {
                        let i = current_text.trim().to_string();
                        if !i.is_empty() {
                            metadata.isbn = Some(i);
                        }
                    }
                    "annotation" if in_title_info => {
                        let desc = current_text.trim().to_string();
                        if !desc.is_empty() {
                            metadata.description = Some(desc);
                        }
                    }
                    _ => {}
                }

                path_stack.pop();
                current_text.clear();
            }
            Ok(Event::Text(ref e)) => {
                if let Ok(text) = e.unescape() {
                    current_text.push_str(&text);
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    // Fallback title from filename
    if metadata.title.is_none() {
        let path = Path::new(file_path);
        metadata.title = path.file_stem().and_then(|s| s.to_str()).map(String::from);
    }

    Ok(metadata)
}

fn extract_docx_metadata(file_path: &str) -> Result<Metadata> {
    // DOCX files are ZIP archives with metadata in docProps/core.xml (Dublin Core)
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let file_data = fs::read(file_path)
        .map_err(|e| ShioriError::MetadataExtraction(format!("Failed to read DOCX: {}", e)))?;

    let cursor = Cursor::new(&file_data);
    let mut archive = ZipArchive::new(cursor).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to open ZIP archive: {}", e))
    })?;

    let mut metadata = Metadata {
        title: None,
        authors: vec![],
        isbn: None,
        publisher: None,
        pubdate: None,
        language: None,
        description: None,
        page_count: None,
    };

    // Try to read docProps/core.xml for Dublin Core metadata
    if let Ok(mut core_xml) = archive.by_name("docProps/core.xml") {
        let mut xml_content = String::new();
        if core_xml.read_to_string(&mut xml_content).is_ok() {
            let mut reader = Reader::from_str(&xml_content);
            reader.config_mut().trim_text(true);

            let mut current_element = String::new();
            let mut buf = Vec::new();

            loop {
                match reader.read_event_into(&mut buf) {
                    Ok(Event::Start(ref e)) => {
                        // Extract local name (strip namespace prefix)
                        let full_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                        current_element = full_name
                            .split(':')
                            .last()
                            .unwrap_or(&full_name)
                            .to_string();
                    }
                    Ok(Event::Text(ref e)) => {
                        if let Ok(text) = e.unescape() {
                            let text = text.trim().to_string();
                            if !text.is_empty() {
                                match current_element.as_str() {
                                    "title" => metadata.title = Some(text),
                                    "creator" => metadata.authors.push(text),
                                    "description" | "subject" => {
                                        if metadata.description.is_none() {
                                            metadata.description = Some(text);
                                        }
                                    }
                                    "language" => metadata.language = Some(text),
                                    _ => {}
                                }
                            }
                        }
                    }
                    Ok(Event::End(_)) => {
                        current_element.clear();
                    }
                    Ok(Event::Eof) => break,
                    Err(_) => break,
                    _ => {}
                }
                buf.clear();
            }
        }
    }

    // Fallback title from filename
    if metadata.title.is_none() {
        let path = Path::new(file_path);
        metadata.title = path.file_stem().and_then(|s| s.to_str()).map(String::from);
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
