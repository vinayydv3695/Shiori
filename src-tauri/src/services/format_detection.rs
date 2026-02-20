/// Format Detection Service - Detects book formats using magic bytes and content inspection
/// 
/// This service provides robust format detection with three stages:
/// 1. Extension check (fast path)
/// 2. Magic byte verification
/// 3. Deep content inspection

use crate::services::format_adapter::{FormatError, FormatInfo, FormatResult, DetectionMethod};
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncReadExt;

/// Magic byte patterns for format detection
const MAGIC_PDF: &[u8] = b"%PDF";
const MAGIC_ZIP: &[u8] = b"PK\x03\x04";
const MAGIC_MOBI: &[u8] = b"BOOKMOBI";
const MAGIC_XML: &[u8] = b"<?xml";
const MAGIC_HTML_DOCTYPE: &[u8] = b"<!DOCTYPE html";
const MAGIC_HTML_TAG: &[u8] = b"<html";

lazy_static::lazy_static! {
    static ref EXTENSION_MAP: HashMap<&'static str, &'static str> = {
        let mut m = HashMap::new();
        m.insert("epub", "epub");
        m.insert("pdf", "pdf");
        m.insert("mobi", "mobi");
        m.insert("azw", "mobi");
        m.insert("azw3", "azw3");
        m.insert("fb2", "fb2");
        m.insert("docx", "docx");
        m.insert("doc", "docx");
        m.insert("txt", "txt");
        m.insert("text", "txt");
        m.insert("html", "html");
        m.insert("htm", "html");
        m.insert("xhtml", "html");
        m.insert("cbz", "cbz");
        m.insert("cbr", "cbr");
        m
    };
}

/// Main format detection function
pub async fn detect_format(path: &Path) -> FormatResult<FormatInfo> {
    // Stage 1: Extension check (fast path)
    if let Some(ext) = get_extension(path) {
        if let Some(format) = EXTENSION_MAP.get(ext.as_str()) {
            // Stage 2: Verify with magic bytes
            if verify_magic_bytes(path, format).await? {
                let mut info = FormatInfo::new(format);
                info.detected_by = DetectionMethod::Extension;
                return Ok(info);
            }
        }
    }
    
    // Stage 3: Deep content inspection
    let magic = read_magic_bytes(path, 512).await?;
    
    // PDF check
    if magic.starts_with(MAGIC_PDF) {
        let mut info = FormatInfo::pdf();
        info.detected_by = DetectionMethod::MagicBytes;
        return Ok(info);
    }
    
    // ZIP-based formats (EPUB, DOCX, CBZ)
    if magic.starts_with(MAGIC_ZIP) {
        let format_info = classify_zip_format(path).await?;
        return Ok(format_info);
    }
    
    // MOBI/AZW3 check (magic bytes at offset 60)
    if magic.len() >= 68 && &magic[60..68] == MAGIC_MOBI {
        let format_info = classify_mobi_format(path).await?;
        return Ok(format_info);
    }
    
    // XML-based formats (FB2, HTML)
    if magic.starts_with(MAGIC_XML) {
        let format_info = classify_xml_format(&magic).await?;
        return Ok(format_info);
    }
    
    // HTML check
    if magic.starts_with(MAGIC_HTML_DOCTYPE) || magic.starts_with(MAGIC_HTML_TAG) {
        let mut info = FormatInfo::html();
        info.detected_by = DetectionMethod::ContentInspection;
        return Ok(info);
    }
    
    // Text file check (UTF-8 validation)
    if is_valid_utf8(&magic) && is_text_like(&magic) {
        let mut info = FormatInfo::txt();
        info.detected_by = DetectionMethod::ContentInspection;
        return Ok(info);
    }
    
    Err(FormatError::UnsupportedFormat(
        format!("Could not detect format for file: {}", path.display())
    ))
}

/// Get file extension in lowercase
fn get_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_lowercase())
}

/// Read first N bytes from file for magic byte detection
async fn read_magic_bytes(path: &Path, num_bytes: usize) -> FormatResult<Vec<u8>> {
    let mut file = File::open(path).await?;
    let mut buffer = vec![0u8; num_bytes];
    let bytes_read = file.read(&mut buffer).await?;
    buffer.truncate(bytes_read);
    Ok(buffer)
}

/// Verify magic bytes for a specific format
async fn verify_magic_bytes(path: &Path, format: &str) -> FormatResult<bool> {
    let magic = read_magic_bytes(path, 512).await?;
    
    let is_valid = match format {
        "pdf" => magic.starts_with(MAGIC_PDF),
        "epub" | "docx" | "cbz" => {
            // ZIP-based formats
            magic.starts_with(MAGIC_ZIP)
        }
        "mobi" | "azw3" => {
            // MOBI magic bytes at offset 60
            magic.len() >= 68 && &magic[60..68] == MAGIC_MOBI
        }
        "fb2" => {
            // FB2 is XML with FictionBook root
            magic.starts_with(MAGIC_XML)
        }
        "html" => {
            magic.starts_with(MAGIC_HTML_DOCTYPE) || magic.starts_with(MAGIC_HTML_TAG)
        }
        "txt" => {
            // Text files should be valid UTF-8
            is_valid_utf8(&magic)
        }
        _ => false,
    };
    
    Ok(is_valid)
}

/// Classify ZIP-based formats (EPUB, DOCX, CBZ)
async fn classify_zip_format(path: &Path) -> FormatResult<FormatInfo> {
    
    use std::io::Cursor;
    
    let file_data = tokio::fs::read(path).await?;
    let cursor = Cursor::new(file_data);
    
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| FormatError::InvalidFormat(format!("Invalid ZIP: {}", e)))?;
    
    // EPUB: contains "mimetype" file with "application/epub+zip"
    if let Ok(mut mimetype) = archive.by_name("mimetype") {
        let mut content = String::new();
        mimetype.read_to_string(&mut content)
            .map_err(|e| FormatError::InvalidFormat(format!("Failed to read mimetype: {}", e)))?;
        
        if content.trim().contains("epub") {
            let mut info = FormatInfo::epub();
            info.detected_by = DetectionMethod::ContentInspection;
            return Ok(info);
        }
    }
    
    // DOCX: contains "[Content_Types].xml" and "word/document.xml"
    if archive.by_name("[Content_Types].xml").is_ok() 
        && archive.by_name("word/document.xml").is_ok() {
        let mut info = FormatInfo::docx();
        info.detected_by = DetectionMethod::ContentInspection;
        return Ok(info);
    }
    
    // CBZ: contains image files (jpg, png, webp)
    let has_images = (0..archive.len()).any(|i| {
        if let Ok(file) = archive.by_index(i) {
            let name = file.name().to_lowercase();
            name.ends_with(".jpg") || name.ends_with(".jpeg") || 
            name.ends_with(".png") || name.ends_with(".webp")
        } else {
            false
        }
    });
    
    if has_images {
        let mut info = FormatInfo::cbz();
        info.detected_by = DetectionMethod::ContentInspection;
        return Ok(info);
    }
    
    Err(FormatError::UnsupportedFormat(
        "ZIP file does not match EPUB, DOCX, or CBZ format".to_string()
    ))
}

/// Classify MOBI vs AZW3 format
async fn classify_mobi_format(path: &Path) -> FormatResult<FormatInfo> {
    let magic = read_magic_bytes(path, 256).await?;
    
    // Check for KF8 marker (AZW3)
    // KF8 books have "BOUNDARY" or "EXTH" after the MOBI header
    let content_str = String::from_utf8_lossy(&magic);
    
    let format = if content_str.contains("BOUNDARY") || content_str.contains("KF8") {
        "azw3"
    } else {
        "mobi"
    };
    
    let mut info = FormatInfo::new(format);
    info.detected_by = DetectionMethod::ContentInspection;
    Ok(info)
}

/// Classify XML-based formats (FB2, HTML)
async fn classify_xml_format(magic: &[u8]) -> FormatResult<FormatInfo> {
    let content = String::from_utf8_lossy(magic);
    
    // FB2: has <FictionBook> root element
    if content.contains("<FictionBook") || content.contains("<fictionbook") {
        let mut info = FormatInfo::fb2();
        info.detected_by = DetectionMethod::ContentInspection;
        return Ok(info);
    }
    
    // Check if it's actually XHTML (treat as HTML)
    if content.contains("<html") || content.contains("<HTML") {
        let mut info = FormatInfo::html();
        info.detected_by = DetectionMethod::ContentInspection;
        return Ok(info);
    }
    
    Err(FormatError::UnsupportedFormat(
        "XML file does not match FB2 or XHTML format".to_string()
    ))
}

/// Check if bytes are valid UTF-8
fn is_valid_utf8(bytes: &[u8]) -> bool {
    std::str::from_utf8(bytes).is_ok()
}

/// Check if content looks like text (heuristic)
fn is_text_like(bytes: &[u8]) -> bool {
    if bytes.is_empty() {
        return false;
    }
    
    // Count printable characters
    let printable_count = bytes.iter()
        .filter(|&&b| {
            // Printable ASCII + whitespace + UTF-8 continuation bytes
            (b >= 32 && b <= 126) || b == 9 || b == 10 || b == 13 || b >= 128
        })
        .count();
    
    // At least 95% should be printable/whitespace
    let ratio = printable_count as f32 / bytes.len() as f32;
    ratio >= 0.95
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;
    
    #[tokio::test]
    async fn test_detect_pdf() {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(b"%PDF-1.7\n%\xE2\xE3\xCF\xD3\n").unwrap();
        
        let result = detect_format(file.path()).await.unwrap();
        assert_eq!(result.format, "pdf");
    }
    
    #[tokio::test]
    async fn test_detect_text() {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(b"This is a plain text file.\nWith multiple lines.").unwrap();
        
        let result = detect_format(file.path()).await.unwrap();
        assert_eq!(result.format, "txt");
    }
    
    #[test]
    fn test_is_text_like() {
        assert!(is_text_like(b"Hello, world!"));
        assert!(is_text_like(b"Line 1\nLine 2\nLine 3"));
        assert!(!is_text_like(&[0xFF, 0xFE, 0x00, 0x01]));
    }
}
