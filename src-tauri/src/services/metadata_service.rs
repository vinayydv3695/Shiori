use crate::error::{Result, ShioriError};
use crate::models::Metadata;
use base64::Engine as _;
use std::fs;
use std::io::{Read, Write};
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
        "cbz" | "cbr" | "zip" => extract_cbz_metadata(file_path),
        _ => Ok(Metadata::default_from_filename(path)),
    }
}

/// Reject covers whose declared dimensions exceed this (either side) BEFORE
/// decoding — a tiny "PNG" declaring 100k×100k px would otherwise OOM the
/// process trying to allocate the pixel buffer.
const MAX_COVER_DIM: u32 = 12000;

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

    let raw_cover = match extension.as_str() {
        "epub" => extract_epub_cover(file_path, book_uuid, covers_dir),
        "cbz" | "cbr" | "zip" => extract_cbz_cover(file_path, book_uuid, covers_dir),
        "pdf" => extract_pdf_cover(file_path, book_uuid, covers_dir),
        "mobi" | "azw3" => extract_mobi_cover(file_path, book_uuid, covers_dir),
        "docx" => extract_docx_cover(file_path, book_uuid, covers_dir),
        "fb2" => extract_fb2_cover(file_path, book_uuid, covers_dir),
        // Markdown has no embedded-cover concept — the caller falls back to an
        // online lookup and, last, to the generated geometric cover.
        "md" | "markdown" => return Ok(None),
        _ => return Ok(None),
    }?;

    if let Some(raw_path_str) = raw_cover {
        let raw_path = Path::new(&raw_path_str);
        // Decode-bomb guard: read the header dims BEFORE allocating any
        // pixel buffer; reject absurd dimensions without decoding.
        if let Ok(reader) = image::ImageReader::open(&raw_path) {
            if let Ok(dims) = reader.into_dimensions() {
                if dims.0 > MAX_COVER_DIM || dims.1 > MAX_COVER_DIM {
                    log::warn!(
                        "[extract_cover] Rejecting cover with absurd dimensions {}x{} (decode bomb?)",
                        dims.0, dims.1
                    );
                    let _ = std::fs::remove_file(&raw_path);
                    return Ok(None);
                }
            }
        }
        if let Ok(img) = image::open(&raw_path) {
            let webp_filename = format!("{}.webp", book_uuid);
            let webp_path = covers_dir.join(&webp_filename);

            // Resize to a sensible thumbnail size (e.g. max 600px height or width)
            let thumb = img.thumbnail(600, 800);

            if thumb.save(&webp_path).is_ok() {
                // Remove the original raw extracted file if it's different
                if raw_path != webp_path {
                    let _ = std::fs::remove_file(&raw_path);
                }
                return Ok(Some(webp_path.to_string_lossy().to_string()));
            }
        }
        return Ok(Some(raw_path_str));
    }

    Ok(None)
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
    let mut cover_result = doc.get_cover();

    // Fallback: search resources for a cover if explicit metadata is missing
    if cover_result.is_none() {
        let mut fallback_id = None;
        let resources = doc.resources.clone();

        // 1. Look for 'cover' in resource ID or path
        for (id, res) in &resources {
            if res.mime.starts_with("image/") {
                let id_lower = id.to_lowercase();
                let path_lower = res.path.to_string_lossy().to_lowercase();
                if id_lower.contains("cover") || path_lower.contains("cover") {
                    fallback_id = Some(id.clone());
                    break;
                }
            }
        }

        // 2. Look for 'title' or 'front' in image name
        if fallback_id.is_none() {
            for (id, res) in &resources {
                if res.mime.starts_with("image/") {
                    let id_lower = id.to_lowercase();
                    let path_lower = res.path.to_string_lossy().to_lowercase();
                    if id_lower.contains("title")
                        || path_lower.contains("title")
                        || id_lower.contains("front")
                        || path_lower.contains("front")
                    {
                        fallback_id = Some(id.clone());
                        break;
                    }
                }
            }
        }

        // 3. Fallback to the very first image found
        if fallback_id.is_none() {
            for (id, res) in &resources {
                if res.mime.starts_with("image/") {
                    fallback_id = Some(id.clone());
                    break;
                }
            }
        }

        if let Some(id) = fallback_id {
            log::info!(
                "[extract_epub_cover] Falling back to image resource ID: {}",
                id
            );
            if let Some((data, mime)) = doc.get_resource(&id) {
                let final_mime = resources
                    .get(&id)
                    .map(|res| res.mime.clone())
                    .unwrap_or(mime);
                cover_result = Some((data, final_mime));
            }
        }
    }

    if let Some((cover_data, media_type)) = cover_result {
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

    // File-backed archive: only the central directory + the first image
    // entry are ever read — a 1 GB CBZ is never slurped into RAM.
    let file = std::fs::File::open(file_path).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to open CBZ/CBR file: {}", e))
    })?;
    let mut archive = ZipArchive::new(file).map_err(|e| {
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

    // Extract the first image (reuses the file-backed archive)
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

    // Check up to the first 5 pages for an image
    let page_ids: Vec<lopdf::ObjectId> = pages.values().take(5).copied().collect();

    for page_id in page_ids {
        let page_dict = match doc.get_dictionary(page_id) {
            Ok(dict) => dict,
            Err(_) => continue,
        };

        let resources_ref = match page_dict.get(b"Resources") {
            Ok(res) => res,
            Err(_) => continue,
        };

        let resources_dict = match resources_ref {
            Object::Reference(ref_id) => match doc.get_dictionary(*ref_id) {
                Ok(dict) => dict,
                Err(_) => continue,
            },
            Object::Dictionary(dict) => dict,
            _ => continue,
        };

        let xobject_ref = match resources_dict.get(b"XObject") {
            Ok(xobj) => xobj,
            Err(_) => continue,
        };

        let xobject_dict = match xobject_ref {
            Object::Reference(ref_id) => match doc.get_dictionary(*ref_id) {
                Ok(dict) => dict,
                Err(_) => continue,
            },
            Object::Dictionary(dict) => dict,
            _ => continue,
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
    }

    log::warn!("[extract_pdf_cover] No suitable cover image found in first pages");
    Ok(None)
}

/// Write raw image bytes to the covers dir under the book's uuid.
fn save_raw_cover(covers_dir: &Path, book_uuid: &str, ext: &str, data: &[u8]) -> Result<String> {
    fs::create_dir_all(covers_dir).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to create covers dir: {}", e))
    })?;

    let cover_filename = format!("{}.{}", book_uuid, ext);
    let cover_path = covers_dir.join(&cover_filename);
    let mut file = fs::File::create(&cover_path).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to create cover file: {}", e))
    })?;
    file.write_all(data).map_err(|e| {
        ShioriError::MetadataExtraction(format!("Failed to write cover data: {}", e))
    })?;

    Ok(cover_path.to_string_lossy().to_string())
}

/// DOCX covers: the first image embedded in the document part, in document
/// order. Primary path walks the OOXML package directly (document.xml blips
/// resolved through document.xml.rels — true reading order); docx-rs is kept
/// as a fallback for files our direct parse can't handle.
fn extract_docx_cover(
    file_path: &str,
    book_uuid: &str,
    covers_dir: &Path,
) -> Result<Option<String>> {
    log::info!("[extract_docx_cover] Extracting cover from: {}", file_path);

    // Primary path is file-backed: only the OOXML parts needed are read.
    if let Some((ext, image_bytes)) = first_docx_embedded_image(file_path) {
        let cover_path = save_raw_cover(covers_dir, book_uuid, ext, &image_bytes)?;
        log::info!("[extract_docx_cover] ✅ Cover extracted to: {}", cover_path);
        return Ok(Some(cover_path));
    }

    // Fallback: docx-rs enumerates media (ordered by relationship id rather
    // than document order, so it is not the primary path). docx-rs is
    // bytes-only, so this rare path still reads the file.
    if let Ok(file_data) = fs::read(file_path) {
        if let Ok(doc) = docx_rs::read_docx(&file_data) {
            for (media_path, data) in &doc.media {
                let ext = Path::new(media_path)
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_lowercase())
                    .filter(|e| matches!(e.as_str(), "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp"))
                    .or_else(|| detect_image_format(data).map(|(e, _)| e.to_string()));
                if let Some(ext) = ext {
                    let cover_path = save_raw_cover(covers_dir, book_uuid, &ext, data)?;
                    log::info!("[extract_docx_cover] ✅ Cover extracted to: {}", cover_path);
                    return Ok(Some(cover_path));
                }
            }
        }
    }

    log::warn!("[extract_docx_cover] No embedded image found");
    Ok(None)
}

/// Find the first embedded image in a DOCX (zip) package, in document order.
/// Returns (extension, image bytes).
fn first_docx_embedded_image(file_path: &str) -> Option<(&'static str, Vec<u8>)> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let file = std::fs::File::open(file_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;

    // 1. Locate the main document part via the package-level relationships.
    let mut doc_path = "word/document.xml".to_string();
    if let Ok(mut package_rels) = archive.by_name("_rels/.rels") {
        let mut xml = String::new();
        if package_rels.read_to_string(&mut xml).is_ok() {
            let mut reader = Reader::from_str(&xml);
            let mut buf = Vec::new();
            loop {
                match reader.read_event_into(&mut buf) {
                    Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                        let mut is_office_doc = false;
                        let mut target = None;
                        for attr in e.attributes().filter_map(|a| a.ok()) {
                            let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            let value = String::from_utf8_lossy(&attr.value).to_string();
                            if key == "Type" && value.ends_with("relationships/officeDocument") {
                                is_office_doc = true;
                            } else if key == "Target" {
                                target = Some(value);
                            }
                        }
                        if is_office_doc {
                            if let Some(t) = target {
                                doc_path = t.trim_start_matches('/').to_string();
                            }
                        }
                    }
                    Ok(Event::Eof) => break,
                    Err(_) => break,
                    _ => {}
                }
                buf.clear();
            }
        }
    }

    // 2. Map relationship ids to media targets (resolved relative to the
    // document part directory, e.g. word/media/image1.png).
    let rels_path = format!(
        "{}/_rels/{}.rels",
        Path::new(&doc_path).parent()?.to_string_lossy(),
        Path::new(&doc_path).file_name()?.to_string_lossy()
    );
    let rels_dir = Path::new(&doc_path).parent()?.to_path_buf();
    let mut rid_to_target: std::collections::HashMap<String, String> = Default::default();
    if let Ok(mut doc_rels) = archive.by_name(&rels_path) {
        let mut xml = String::new();
        if doc_rels.read_to_string(&mut xml).is_ok() {
            let mut reader = Reader::from_str(&xml);
            let mut buf = Vec::new();
            loop {
                match reader.read_event_into(&mut buf) {
                    Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                        let mut rid = None;
                        let mut target = None;
                        let mut is_image_rel = false;
                        for attr in e.attributes().filter_map(|a| a.ok()) {
                            let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                            let clean = key.rsplit(':').next().unwrap_or(&key).to_string();
                            let value = String::from_utf8_lossy(&attr.value).to_string();
                            match clean.as_str() {
                                "Id" => rid = Some(value),
                                "Target" => target = Some(value),
                                "Type" => is_image_rel = value.ends_with("relationships/image"),
                                _ => {}
                            }
                        }
                        if is_image_rel {
                            if let (Some(rid), Some(target)) = (rid, target) {
                                let resolved = if target.starts_with('/') {
                                    target.trim_start_matches('/').to_string()
                                } else {
                                    rels_dir.join(&target).to_string_lossy().to_string()
                                };
                                rid_to_target.insert(rid, resolved);
                            }
                        }
                    }
                    Ok(Event::Eof) => break,
                    Err(_) => break,
                    _ => {}
                }
                buf.clear();
            }
        }
    }
    if rid_to_target.is_empty() {
        return None;
    }

    // 3. Walk the document XML: the first r:embed / r:id image reference wins.
    let document_xml: Option<String> = archive.by_name(&doc_path).ok().and_then(|mut f| {
        let mut s = String::new();
        f.read_to_string(&mut s).ok().map(|_| s)
    });
    let Some(xml) = document_xml else {
        return None;
    };
    let mut reader = Reader::from_str(&xml);
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                let elem = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let elem_local = elem.rsplit(':').next().unwrap_or(&elem).to_string();
                for attr in e.attributes().filter_map(|a| a.ok()) {
                    let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                    let key_local = key.rsplit(':').next().unwrap_or(&key).to_string();
                    // <a:blip r:embed="rIdN"/> and legacy <v:imagedata r:id="rIdN"/>
                    let is_embed =
                        key_local == "embed" || (key_local == "id" && elem_local == "imagedata");
                    if !is_embed {
                        continue;
                    }
                    let rid = String::from_utf8_lossy(&attr.value).to_string();
                    if let Some(media_path) = rid_to_target.get(&rid) {
                        if let Ok(mut entry) = archive.by_name(media_path) {
                            let mut image_bytes = Vec::new();
                            if entry.read_to_end(&mut image_bytes).is_ok() {
                                if let Some((ext, _)) = detect_image_format(&image_bytes) {
                                    return Some((ext, image_bytes));
                                }
                            }
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    None
}

/// FB2 covers: <description><title-info><coverpage><image l:href="#id"/>,
/// resolved against <binary id="..." content-type="image/...">base64</binary>.
/// Falls back to the first <image> in the body, then to the first image
/// content-type binary.
fn extract_fb2_cover(
    file_path: &str,
    book_uuid: &str,
    covers_dir: &Path,
) -> Result<Option<String>> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    log::info!("[extract_fb2_cover] Extracting cover from: {}", file_path);

    // FB2 is XML; tolerate non-UTF8 files by reading bytes and converting lossily.
    let content = match fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(_) => fs::read(file_path)
            .map(|b| String::from_utf8_lossy(&b).into_owned())
            .map_err(|e| ShioriError::MetadataExtraction(format!("Failed to read FB2: {}", e)))?,
    };

    let xml_local_name = |name: &[u8]| -> String {
        let full = String::from_utf8_lossy(name).to_string();
        full.rsplit_once(':')
            .map(|(_, n)| n.to_string())
            .unwrap_or(full)
    };
    let xml_attr = |e: &quick_xml::events::BytesStart, name: &str| -> Option<String> {
        for attr in e.attributes().filter_map(|a| a.ok()) {
            let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
            if key.rsplit(':').next() == Some(name) {
                return Some(String::from_utf8_lossy(&attr.value).to_string());
            }
        }
        None
    };

    let mut reader = Reader::from_str(&content);
    reader.config_mut().trim_text(false);

    let mut in_coverpage = false;
    let mut body_depth = 0usize;
    let mut coverpage_href: Option<String> = None;
    let mut body_image_href: Option<String> = None;

    // (id, content-type, base64 payload)
    let mut binaries: Vec<(String, Option<String>, String)> = Vec::new();
    let mut in_binary = false;
    let mut binary_id = String::new();
    let mut binary_content_type: Option<String> = None;
    let mut binary_data = String::new();

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = xml_local_name(e.name().as_ref());
                match name.as_str() {
                    "coverpage" => in_coverpage = true,
                    "body" => body_depth += 1,
                    "image" => {
                        if let Some(href) = xml_attr(e, "href") {
                            let id = href.trim_start_matches('#').to_string();
                            if !id.is_empty() {
                                if in_coverpage && coverpage_href.is_none() {
                                    coverpage_href = Some(id);
                                } else if body_depth > 0 && body_image_href.is_none() {
                                    body_image_href = Some(id);
                                }
                            }
                        }
                    }
                    "binary" => {
                        in_binary = true;
                        binary_id = xml_attr(e, "id").unwrap_or_default();
                        binary_content_type = xml_attr(e, "content-type");
                        binary_data.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                let name = xml_local_name(e.name().as_ref());
                match name.as_str() {
                    "coverpage" => in_coverpage = false,
                    "body" => body_depth = body_depth.saturating_sub(1),
                    "binary" => {
                        if in_binary {
                            binaries.push((
                                binary_id.clone(),
                                binary_content_type.clone(),
                                binary_data.clone(),
                            ));
                            in_binary = false;
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_binary {
                    if let Ok(t) = e.unescape() {
                        binary_data.push_str(&t);
                    }
                }
            }
            Ok(Event::CData(ref e)) => {
                // CDATA is raw content (no entity escaping) — take it as-is.
                if in_binary {
                    binary_data.push_str(&String::from_utf8_lossy(e.as_ref()));
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    // Prefer the coverpage reference, then the first body image, then any
    // image content-type binary.
    let target_id = coverpage_href.clone().or_else(|| body_image_href.clone());
    let picked = target_id
        .and_then(|id| {
            binaries
                .iter()
                .find(|(b_id, _, _)| b_id == &id)
                .map(|(i, ct, b)| (i.as_str(), ct.as_deref(), b.as_str()))
        })
        .or_else(|| {
            binaries
                .iter()
                .find(|(_, ct, _)| {
                    ct.as_deref()
                        .map(|c| c.starts_with("image/"))
                        .unwrap_or(false)
                })
                .map(|(i, ct, b)| (i.as_str(), ct.as_deref(), b.as_str()))
        });

    let Some((_id, content_type, b64)) = picked else {
        log::warn!("[extract_fb2_cover] No cover image found");
        return Ok(None);
    };

    // Base64 payloads may be wrapped across lines — strip whitespace first.
    let compact: String = b64.chars().filter(|c| !c.is_whitespace()).collect();
    let image_bytes = match base64::engine::general_purpose::STANDARD.decode(compact.as_bytes()) {
        Ok(b) => b,
        Err(e) => {
            log::warn!("[extract_fb2_cover] Failed to decode base64 binary: {}", e);
            return Ok(None);
        }
    };

    let ext = content_type
        .map(|ct| match ct.to_ascii_lowercase().as_str() {
            "image/jpeg" | "image/jpg" => "jpg",
            "image/png" => "png",
            "image/gif" => "gif",
            "image/webp" => "webp",
            "image/bmp" => "bmp",
            _ => detect_image_format(&image_bytes)
                .map(|(e, _)| e)
                .unwrap_or("jpg"),
        })
        .unwrap_or_else(|| {
            detect_image_format(&image_bytes)
                .map(|(e, _)| e)
                .unwrap_or("jpg")
        });

    let cover_path = save_raw_cover(covers_dir, book_uuid, ext, &image_bytes)?;
    log::info!("[extract_fb2_cover] ✅ Cover extracted to: {}", cover_path);
    Ok(Some(cover_path))
}

fn extract_cbz_metadata(file_path: &str) -> Result<Metadata> {
    let path = Path::new(file_path);
    let mut metadata = Metadata::default_from_filename(path);

    // File-backed archive — only entry names are read, never the payloads.
    if let Ok(file) = std::fs::File::open(file_path) {
        if let Ok(mut archive) = ZipArchive::new(file) {
            let mut image_count = 0;
            for i in 0..archive.len() {
                if let Ok(file) = archive.by_index(i) {
                    if file.is_file() {
                        let name = file.name().to_string();
                        let lower = name.to_lowercase();
                        if !name.starts_with('.')
                            && !name.starts_with("__MACOSX")
                            && (lower.ends_with(".jpg")
                                || lower.ends_with(".jpeg")
                                || lower.ends_with(".png")
                                || lower.ends_with(".webp")
                                || lower.ends_with(".gif")
                                || lower.ends_with(".bmp")
                                || lower.ends_with(".avif")
                                || lower.ends_with(".heic"))
                        {
                            image_count += 1;
                        }
                    }
                }
            }
            if image_count > 0 {
                metadata.page_count = Some(image_count);
            }
        }
    }

    Ok(metadata)
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
        series: None,
        series_index: None,
    };

    // Get authors (can be multiple)
    if let Some(creator) = doc.mdata("creator") {
        metadata.authors.push(creator.value.clone());
    }

    // Estimate page count from the SPINE (chapter count). The previous
    // every-chapter word count decompressed the entire book to count words
    // (unbounded RAM on huge EPUBs); a spine-length estimate is bounded,
    // deterministic and is what most readers display as a proxy anyway.
    let spine_len = doc.get_num_chapters();
    metadata.page_count = Some(spine_len as i32);

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
        series: None,
        series_index: None,
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

    // File-backed parse (the crate reads the file itself). The mobi crate
    // has no bounded API, but we no longer hold a second full copy AND we
    // never decompress the full text (see page_count below).
    let m = Mobi::from_path(file_path)
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
        series: None,
        series_index: None,
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

    // Page count: no longer estimated from a full-text word count
    // (`content_as_string` decompresses the ENTIRE book — unbounded RAM on
    // huge MOBI files). The mobi crate exposes no bounded per-record API, so
    // page_count stays None and the UI falls back to its own estimate.
    // (BEHAVIOR CHANGE: MOBI books no longer show a word-derived page count.)

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
        series: None,
        series_index: None,
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

    // File-backed archive — only docProps/core.xml is ever read.
    let file = std::fs::File::open(file_path)
        .map_err(|e| ShioriError::MetadataExtraction(format!("Failed to open DOCX: {}", e)))?;
    let mut archive = ZipArchive::new(file).map_err(|e| {
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
        series: None,
        series_index: None,
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
        let title_str = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown Title");
        let mut title = Some(title_str.to_string());
        let mut series = None;
        let mut series_index = None;

        if let Some((s_name, c_name)) = title_str.rsplit_once(" - ") {
            series = Some(s_name.trim().to_string());
            title = Some(c_name.trim().to_string());

            let lower_c = c_name.to_lowercase();
            let num_str = if lower_c.starts_with("chapter ") {
                lower_c.strip_prefix("chapter ").unwrap()
            } else if lower_c.starts_with("ch ") {
                lower_c.strip_prefix("ch ").unwrap()
            } else if lower_c.starts_with("ch.") {
                lower_c.strip_prefix("ch.").unwrap()
            } else {
                c_name
            };

            if let Ok(idx) = num_str.trim().parse::<f64>() {
                series_index = Some(idx);
            }
        }

        Metadata {
            title,
            authors: vec![],
            isbn: None,
            publisher: None,
            pubdate: None,
            language: Some("eng".to_string()),
            description: None,
            page_count: None,
            series,
            series_index,
        }
    }
}

#[cfg(test)]
mod format_pipeline_tests {
    use super::*;
    use std::io::Write;

    // ── helpers ────────────────────────────────────────────────────────

    fn temp_dir() -> tempfile::TempDir {
        tempfile::Builder::new()
            .prefix("shiori_meta_test_")
            .tempdir()
            .unwrap()
    }

    /// Minimal valid PNG: signature + IHDR (with correct CRC). `idat` may be
    /// empty for the decode-bomb case (the guard must reject before decode).
    fn png_bytes(width: u32, height: u32, idat: &[u8]) -> Vec<u8> {
        fn crc32(data: &[u8]) -> u32 {
            let mut crc = 0xFFFF_FFFFu32;
            for &b in data {
                crc ^= b as u32;
                for _ in 0..8 {
                    let mask = (crc & 1).wrapping_neg();
                    crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
                }
            }
            !crc
        }
        fn chunk(out: &mut Vec<u8>, ctype: &[u8; 4], data: &[u8]) {
            out.extend_from_slice(&(data.len() as u32).to_be_bytes());
            out.extend_from_slice(ctype);
            out.extend_from_slice(data);
            let mut crc_input = Vec::with_capacity(4 + data.len());
            crc_input.extend_from_slice(ctype);
            crc_input.extend_from_slice(data);
            out.extend_from_slice(&crc32(&crc_input).to_be_bytes());
        }
        let mut png = Vec::new();
        png.extend_from_slice(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
        let mut ihdr = Vec::new();
        ihdr.extend_from_slice(&width.to_be_bytes());
        ihdr.extend_from_slice(&height.to_be_bytes());
        ihdr.extend_from_slice(&[8, 2, 0, 0, 0]); // 8-bit RGB, no interlace
        chunk(&mut png, b"IHDR", &ihdr);
        // read_info() requires an IDAT chunk to exist (even an empty one).
        chunk(&mut png, b"IDAT", idat);
        png
    }

    /// A 2×2 solid red PNG via the image crate (valid enough to decode).
    fn sane_png() -> Vec<u8> {
        let img = image::RgbaImage::from_pixel(2, 2, image::Rgba([255u8, 0, 0, 255]));
        let mut bytes = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        bytes
    }

    fn write_cbz(path: &Path, entries: &[(&str, &[u8])]) {
        let file = std::fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let opts: zip::write::FileOptions<()> = zip::write::FileOptions::default();
        for (name, data) in entries {
            zip.start_file(*name, opts).unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap();
    }

    // ── decode-bomb guard ──────────────────────────────────────────────

    #[test]
    fn cover_decode_bomb_is_rejected_without_decoding() {
        let dir = temp_dir();
        let cbz = dir.path().join("bomb.cbz");
        let covers = dir.path().join("covers");
        // 100k × 100k declared in a ~40-byte file. The old code would try to
        // allocate 100k×100k×4 bytes and OOM/hang; the guard must reject it
        // from the header alone, fast.
        let bomb = png_bytes(100_000, 100_000, &[]);
        assert!(bomb.len() < 200, "bomb png must stay tiny");
        write_cbz(&cbz, &[("page1.png", &bomb)]);

        let result = extract_cover(cbz.to_str().unwrap(), "uuid-bomb", &covers).unwrap();
        assert!(result.is_none(), "decode bomb must yield no cover, got {:?}", result);
        // No leftover raw cover file in the covers dir.
        let leftovers = std::fs::read_dir(&covers)
            .map(|rd| rd.flatten().count())
            .unwrap_or(0);
        assert_eq!(leftovers, 0, "bomb raw file must be cleaned up");
    }

    #[test]
    fn sane_cover_still_thumbnails() {
        let dir = temp_dir();
        let cbz = dir.path().join("sane.cbz");
        let covers = dir.path().join("covers");
        write_cbz(&cbz, &[("page1.png", &sane_png())]);

        let result = extract_cover(cbz.to_str().unwrap(), "uuid-sane", &covers).unwrap();
        let path = result.expect("sane cover must thumbnail");
        assert!(Path::new(&path).exists(), "webp thumbnail must exist");
        assert!(path.ends_with(".webp"));
        // Raw PNG must have been removed after thumbnailing.
        assert!(!covers.join("uuid-sane.png").exists());
    }

    // ── epub metadata: spine-based page count ──────────────────────────

    #[test]
    fn epub_page_count_comes_from_spine_not_word_scan() {
        let dir = temp_dir();
        let epub_path = dir.path().join("spine-test.epub");

        let mut book = crate::conversion::oeb::OebBook::new("Spine Test");
        for i in 0..3 {
            book.chapters.push(crate::conversion::oeb::OebChapter {
                id: format!("chapter_{:03}", i + 1),
                title: Some(format!("Chapter {}", i + 1)),
                html: format!("<p>Chapter {} body text with words.</p>", i + 1),
            });
        }
        crate::conversion::epub_builder::build_epub(&book, &epub_path)
            .expect("build_epub failed");

        let meta = extract_from_file(epub_path.to_str().unwrap()).expect("metadata extraction");
        // Spine length (3 chapters) — NOT a word-derived estimate, and no
        // per-chapter decompression happened.
        assert_eq!(meta.page_count, Some(3));
        assert_eq!(meta.title.as_deref(), Some("Spine Test"));
    }
}
