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
        "pdf" => extract_pdf_cover(file_path, book_uuid, covers_dir),
        "mobi" | "azw3" => extract_mobi_cover(file_path, book_uuid, covers_dir),
        _ => Ok(None),
    }
}

fn read_be_u16(data: &[u8], offset: usize) -> Option<u16> {
    data.get(offset..offset + 2)
        .map(|b| u16::from_be_bytes([b[0], b[1]]))
}

fn read_be_u32(data: &[u8], offset: usize) -> Option<u32> {
    data.get(offset..offset + 4)
        .map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
}

fn parse_pdb_record_offsets(data: &[u8]) -> Option<Vec<usize>> {
    let num_records = read_be_u16(data, 76)? as usize;
    let record_table_start = 78usize;
    let table_bytes = num_records.checked_mul(8)?;
    if data.len() < record_table_start.checked_add(table_bytes)? {
        return None;
    }

    let mut offsets = Vec::with_capacity(num_records);
    let mut prev_offset = None;
    for i in 0..num_records {
        let offset = read_be_u32(data, record_table_start + (i * 8))? as usize;
        if offset >= data.len() {
            return None;
        }
        if let Some(prev) = prev_offset {
            if offset < prev {
                return None;
            }
        }
        prev_offset = Some(offset);
        offsets.push(offset);
    }
    Some(offsets)
}

fn append_fallback_cover_candidates(offsets: &[usize], candidates: &mut Vec<usize>) {
    if offsets.len() <= 1 {
        return;
    }

    let mut push_unique = |idx: usize| {
        if idx < offsets.len() && !candidates.contains(&idx) {
            candidates.push(idx);
        }
    };

    for idx in 1..offsets.len().min(8) {
        push_unique(idx);
    }
}

fn parse_mobi_cover_record_candidates(data: &[u8]) -> Vec<usize> {
    let mut candidates = Vec::new();
    let offsets = match parse_pdb_record_offsets(data) {
        Some(v) if !v.is_empty() => v,
        _ => return candidates,
    };

    let record0 = offsets[0];
    let mobi_start = record0.saturating_add(16);
    if data.get(mobi_start..mobi_start + 4) != Some(b"MOBI") {
        append_fallback_cover_candidates(&offsets, &mut candidates);
        return candidates;
    }

    let mobi_header_len = read_be_u32(data, mobi_start + 4).unwrap_or(0) as usize;
    let first_image_index = read_be_u32(data, mobi_start + 92).unwrap_or(0) as usize;

    let mut push_unique = |idx: usize| {
        if idx < offsets.len() && !candidates.contains(&idx) {
            candidates.push(idx);
        }
    };

    let mut found_exth_cover_refs = false;

    if first_image_index > 0 {
        push_unique(first_image_index);
    }

    let exth_flags = read_be_u32(data, mobi_start + 112).unwrap_or(0);
    if (exth_flags & 0x40) != 0 {
        let exth_start = mobi_start.saturating_add(mobi_header_len);
        if data.get(exth_start..exth_start + 4) == Some(b"EXTH") {
            let exth_len = read_be_u32(data, exth_start + 4).unwrap_or(0) as usize;
            let exth_count = read_be_u32(data, exth_start + 8).unwrap_or(0) as usize;
            let exth_end = exth_start.saturating_add(exth_len).min(data.len());
            let mut cursor = exth_start + 12;

            for _ in 0..exth_count {
                if cursor + 8 > exth_end {
                    break;
                }
                let rec_type = read_be_u32(data, cursor).unwrap_or(0);
                let rec_len = read_be_u32(data, cursor + 4).unwrap_or(0) as usize;
                if rec_len < 8 || cursor + rec_len > exth_end {
                    break;
                }

                let payload = &data[cursor + 8..cursor + rec_len];
                if payload.len() >= 4 {
                    let offset_value =
                        u32::from_be_bytes([payload[0], payload[1], payload[2], payload[3]])
                            as usize;
                    if rec_type == 201 || rec_type == 202 {
                        let base = if first_image_index > 0 {
                            first_image_index
                        } else {
                            0
                        };
                        push_unique(base.saturating_add(offset_value));
                        found_exth_cover_refs = true;
                    }
                }

                cursor += rec_len;
            }
        }
    }

    if first_image_index > 0 {
        for idx in first_image_index..offsets.len().min(first_image_index.saturating_add(6)) {
            push_unique(idx);
        }
    }

    if candidates.is_empty() || (first_image_index == 0 && !found_exth_cover_refs) {
        append_fallback_cover_candidates(&offsets, &mut candidates);
    }

    candidates
}

fn detect_image_format(data: &[u8]) -> Option<(&'static str, usize)> {
    for start in 0..data.len().min(32) {
        let tail = &data[start..];
        if tail.len() >= 3 && tail[0..3] == [0xFF, 0xD8, 0xFF] {
            return Some(("jpg", start));
        }
        if tail.len() >= 8 && tail[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
            return Some(("png", start));
        }
        if tail.len() >= 6 && (&tail[0..6] == b"GIF87a" || &tail[0..6] == b"GIF89a") {
            return Some(("gif", start));
        }
        if tail.len() >= 12 && &tail[0..4] == b"RIFF" && &tail[8..12] == b"WEBP" {
            return Some(("webp", start));
        }
        if tail.len() >= 2 && &tail[0..2] == b"BM" {
            return Some(("bmp", start));
        }
    }
    None
}

fn extract_mobi_cover(
    file_path: &str,
    book_uuid: &str,
    covers_dir: &Path,
) -> Result<Option<String>> {
    log::info!("[extract_mobi_cover] Extracting cover from: {}", file_path);

    let data = fs::read(file_path).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to read MOBI/AZW3 file: {}", e))
    })?;

    let offsets = match parse_pdb_record_offsets(&data) {
        Some(v) if !v.is_empty() => v,
        _ => {
            log::warn!("[extract_mobi_cover] Invalid PDB record table");
            return Ok(None);
        }
    };

    let candidates = parse_mobi_cover_record_candidates(&data);
    for record_idx in candidates {
        if record_idx >= offsets.len() {
            continue;
        }

        let start = offsets[record_idx];
        let end = offsets.get(record_idx + 1).copied().unwrap_or(data.len());
        if start >= end || end > data.len() {
            continue;
        }

        let record_data = &data[start..end];
        let Some((ext, img_start)) = detect_image_format(record_data) else {
            continue;
        };

        let image_bytes = record_data[img_start..].to_vec();
        if image_bytes.len() < 64 {
            continue;
        }

        fs::create_dir_all(covers_dir).map_err(|e| {
            ShioriError::MetadataExtraction(format!("Failed to create covers dir: {}", e))
        })?;

        let cover_filename = format!("{}.{}", book_uuid, ext);
        let cover_path = covers_dir.join(&cover_filename);
        let mut file = fs::File::create(&cover_path).map_err(|e| {
            ShioriError::MetadataExtraction(format!("Failed to create cover file: {}", e))
        })?;
        file.write_all(&image_bytes).map_err(|e| {
            ShioriError::MetadataExtraction(format!("Failed to write cover data: {}", e))
        })?;

        log::info!(
            "[extract_mobi_cover] ✅ Cover extracted to: {} (record #{})",
            cover_path.display(),
            record_idx
        );
        return Ok(Some(cover_path.to_string_lossy().to_string()));
    }

    log::warn!("[extract_mobi_cover] No suitable image record found");
    Ok(None)
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

fn extract_pdf_cover(
    file_path: &str,
    book_uuid: &str,
    covers_dir: &Path,
) -> Result<Option<String>> {
    use lopdf::{Document, Object};

    log::info!("[extract_pdf_cover] Extracting cover from: {}", file_path);

    let doc = Document::load(file_path)
        .map_err(|e| ShioriError::MetadataExtraction(format!("Failed to load PDF: {}", e)))?;

    let pages = doc.get_pages();
    if pages.is_empty() {
        log::warn!("[extract_pdf_cover] PDF has no pages");
        return Ok(None);
    }

    let first_page_id = pages.iter().next().map(|(_, &id)| id);
    if first_page_id.is_none() {
        log::warn!("[extract_pdf_cover] Could not get first page ID");
        return Ok(None);
    }

    let page_id = first_page_id.unwrap();

    let page_dict = match doc.get_dictionary(page_id) {
        Ok(dict) => dict,
        Err(e) => {
            log::warn!("[extract_pdf_cover] Failed to get page dictionary: {}", e);
            return Ok(None);
        }
    };

    let resources_ref = match page_dict.get(b"Resources") {
        Ok(res) => res,
        Err(_) => {
            log::warn!("[extract_pdf_cover] No Resources found in first page");
            return Ok(None);
        }
    };

    let resources_dict = match resources_ref {
        Object::Reference(ref_id) => match doc.get_dictionary(*ref_id) {
            Ok(dict) => dict,
            Err(_) => {
                log::warn!("[extract_pdf_cover] Failed to resolve Resources reference");
                return Ok(None);
            }
        },
        Object::Dictionary(dict) => dict,
        _ => {
            log::warn!("[extract_pdf_cover] Resources is not a dictionary");
            return Ok(None);
        }
    };

    let xobject_ref = match resources_dict.get(b"XObject") {
        Ok(xobj) => xobj,
        Err(_) => {
            log::warn!("[extract_pdf_cover] No XObject found in Resources");
            return Ok(None);
        }
    };

    let xobject_dict = match xobject_ref {
        Object::Reference(ref_id) => match doc.get_dictionary(*ref_id) {
            Ok(dict) => dict,
            Err(_) => {
                log::warn!("[extract_pdf_cover] Failed to resolve XObject reference");
                return Ok(None);
            }
        },
        Object::Dictionary(dict) => dict,
        _ => {
            log::warn!("[extract_pdf_cover] XObject is not a dictionary");
            return Ok(None);
        }
    };

    for (_, xobj_ref) in xobject_dict.iter() {
        let stream = match xobj_ref {
            Object::Reference(ref_id) => match doc.get_object(*ref_id) {
                Ok(Object::Stream(s)) => s,
                _ => continue,
            },
            Object::Stream(s) => s,
            _ => continue,
        };

        let subtype = stream.dict.get(b"Subtype");
        if let Ok(Object::Name(ref name)) = subtype {
            if name != b"Image" {
                continue;
            }
        } else {
            continue;
        }

        let filter = stream.dict.get(b"Filter");
        let is_jpeg = match filter {
            Ok(Object::Name(ref name)) => name == b"DCTDecode",
            Ok(Object::Array(ref arr)) => arr
                .iter()
                .any(|obj| matches!(obj, Object::Name(ref name) if name == b"DCTDecode")),
            _ => false,
        };

        if !is_jpeg {
            log::info!("[extract_pdf_cover] Found image but not JPEG (DCTDecode), skipping");
            continue;
        }

        fs::create_dir_all(covers_dir).map_err(|e| {
            ShioriError::MetadataExtraction(format!("Failed to create covers dir: {}", e))
        })?;

        let cover_filename = format!("{}.jpg", book_uuid);
        let cover_path = covers_dir.join(&cover_filename);

        let mut file = fs::File::create(&cover_path).map_err(|e| {
            ShioriError::MetadataExtraction(format!("Failed to create cover file: {}", e))
        })?;

        file.write_all(&stream.content).map_err(|e| {
            ShioriError::MetadataExtraction(format!("Failed to write cover data: {}", e))
        })?;

        log::info!(
            "[extract_pdf_cover] ✅ Cover extracted to: {}",
            cover_path.display()
        );
        return Ok(Some(cover_path.to_string_lossy().to_string()));
    }

    log::warn!("[extract_pdf_cover] No suitable cover image found in first page");
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

    let clean_opt = |value: Option<String>| -> Option<String> {
        value.and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("unknown") {
                None
            } else {
                Some(trimmed)
            }
        })
    };

    let title = m.title().trim().to_string();
    if !title.is_empty() && !title.eq_ignore_ascii_case("unknown") {
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

    metadata.publisher = clean_opt(m.publisher());
    metadata.description = clean_opt(m.description());
    metadata.isbn = clean_opt(m.isbn());
    metadata.pubdate = clean_opt(m.publish_date());

    // Language — mobi crate returns Language enum directly
    let lang = format!("{:?}", m.language()).trim().to_string();
    metadata.language = if lang.is_empty() || lang.eq_ignore_ascii_case("unknown") {
        None
    } else {
        Some(lang)
    };

    // Word count / page estimate
    if let Ok(content) = m.content_as_string() {
        let words = content.split_whitespace().count();
        metadata.page_count = Some(((words + 249) / 250) as i32);
    }

    // Fallback title from filename
    if metadata.title.is_none() {
        let path = Path::new(file_path);
        metadata.title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.replace('_', " ").replace('-', " "));
    }

    Ok(metadata)
}

#[cfg(test)]
mod tests {
    use super::parse_mobi_cover_record_candidates;

    #[test]
    fn parses_cover_candidates_from_exth_and_first_image() {
        let mut data = vec![0u8; 1024];
        data[76..78].copy_from_slice(&3u16.to_be_bytes());

        data[78..82].copy_from_slice(&200u32.to_be_bytes());
        data[86..90].copy_from_slice(&600u32.to_be_bytes());
        data[94..98].copy_from_slice(&800u32.to_be_bytes());

        data[216..220].copy_from_slice(b"MOBI");
        data[220..224].copy_from_slice(&232u32.to_be_bytes()); // header len (@ +4)
        data[308..312].copy_from_slice(&1u32.to_be_bytes()); // first image index (@ +92)
        data[328..332].copy_from_slice(&0x40u32.to_be_bytes()); // EXTH flag

        let exth_start = 216 + 232;
        data[exth_start..exth_start + 4].copy_from_slice(b"EXTH");
        data[exth_start + 4..exth_start + 8].copy_from_slice(&24u32.to_be_bytes());
        data[exth_start + 8..exth_start + 12].copy_from_slice(&1u32.to_be_bytes());
        data[exth_start + 12..exth_start + 16].copy_from_slice(&201u32.to_be_bytes());
        data[exth_start + 16..exth_start + 20].copy_from_slice(&12u32.to_be_bytes());
        data[exth_start + 20..exth_start + 24].copy_from_slice(&1u32.to_be_bytes());

        let candidates = parse_mobi_cover_record_candidates(&data);
        assert!(candidates.contains(&1));
        assert!(candidates.contains(&2));
    }

    #[test]
    fn keeps_fallback_candidates_when_exth_is_missing() {
        let mut data = vec![0u8; 1200];
        data[76..78].copy_from_slice(&8u16.to_be_bytes());

        for i in 0..8usize {
            let offset = 200 + (i * 100);
            let table_offset = 78 + (i * 8);
            data[table_offset..table_offset + 4].copy_from_slice(&(offset as u32).to_be_bytes());
        }

        let mobi_start = 200 + 16;
        data[mobi_start..mobi_start + 4].copy_from_slice(b"MOBI");
        data[mobi_start + 4..mobi_start + 8].copy_from_slice(&232u32.to_be_bytes());
        data[mobi_start + 92..mobi_start + 96].copy_from_slice(&3u32.to_be_bytes());

        let candidates = parse_mobi_cover_record_candidates(&data);
        assert!(candidates.contains(&3));
        assert!(candidates.contains(&4));
        assert!(candidates.contains(&5));
    }

    #[test]
    fn rejects_non_monotonic_pdb_offsets() {
        let mut data = vec![0u8; 1024];
        data[76..78].copy_from_slice(&3u16.to_be_bytes());
        data[78..82].copy_from_slice(&500u32.to_be_bytes());
        data[86..90].copy_from_slice(&300u32.to_be_bytes());
        data[94..98].copy_from_slice(&700u32.to_be_bytes());

        let candidates = parse_mobi_cover_record_candidates(&data);
        assert!(candidates.is_empty());
    }

    #[test]
    fn falls_back_to_early_records_when_header_hints_missing() {
        let mut data = vec![0u8; 1600];
        data[76..78].copy_from_slice(&10u16.to_be_bytes());

        for i in 0..10usize {
            let offset = 200 + (i * 100);
            let table_offset = 78 + (i * 8);
            data[table_offset..table_offset + 4].copy_from_slice(&(offset as u32).to_be_bytes());
        }

        let mobi_start = 200 + 16;
        data[mobi_start..mobi_start + 4].copy_from_slice(b"MOBI");
        data[mobi_start + 4..mobi_start + 8].copy_from_slice(&232u32.to_be_bytes());
        // first image index = 0, no EXTH flag

        let candidates = parse_mobi_cover_record_candidates(&data);
        assert!(candidates.contains(&1));
        assert!(candidates.contains(&2));
        assert!(candidates.contains(&7));
    }
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
