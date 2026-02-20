use crate::error::{ShioriError, ShioriResult};
use std::fs::File;
use std::io::Read;
use std::path::Path;

/// Maximum file size in MB (500 MB)
const MAX_FILE_SIZE_MB: u64 = 500;

/// Magic bytes for different formats
const EPUB_MAGIC: &[u8] = b"PK\x03\x04";
const PDF_MAGIC: &[u8] = b"%PDF";
const ZIP_MAGIC: &[u8] = b"PK\x03\x04";

/// Supported book formats
#[derive(Debug, Clone, PartialEq)]
pub enum BookFormat {
    Epub,
    Pdf,
    Mobi,
    Azw3,
    Cbz,
    Cbr,
    Txt,
}

impl BookFormat {
    pub fn as_str(&self) -> &str {
        match self {
            BookFormat::Epub => "epub",
            BookFormat::Pdf => "pdf",
            BookFormat::Mobi => "mobi",
            BookFormat::Azw3 => "azw3",
            BookFormat::Cbz => "cbz",
            BookFormat::Cbr => "cbr",
            BookFormat::Txt => "txt",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "epub" => Some(BookFormat::Epub),
            "pdf" => Some(BookFormat::Pdf),
            "mobi" => Some(BookFormat::Mobi),
            "azw3" => Some(BookFormat::Azw3),
            "cbz" => Some(BookFormat::Cbz),
            "cbr" => Some(BookFormat::Cbr),
            "txt" => Some(BookFormat::Txt),
            _ => None,
        }
    }
}

/// Detect book format using multiple strategies
pub async fn detect_format(path: &Path) -> ShioriResult<String> {
    // Strategy 1: Check if file exists and is readable
    if !path.exists() {
        return Err(ShioriError::FileNotFound {
            path: path.to_string_lossy().to_string(),
        });
    }

    // Strategy 2: Check file size
    let metadata = std::fs::metadata(path).map_err(|_| ShioriError::FileNotFound {
        path: path.to_string_lossy().to_string(),
    })?;

    let size_mb = metadata.len() / (1024 * 1024);
    if size_mb > MAX_FILE_SIZE_MB {
        return Err(ShioriError::FileSizeLimitExceeded {
            size_mb,
            max_mb: MAX_FILE_SIZE_MB,
        });
    }

    if metadata.len() == 0 {
        return Err(ShioriError::EmptyOrTruncatedFile {
            path: path.to_string_lossy().to_string(),
        });
    }

    // Strategy 3: Try extension first (fast path)
    if let Some(ext) = path.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        if let Some(format) = BookFormat::from_str(&ext_str) {
            // Verify with magic bytes
            if verify_format_with_magic(path, &format)? {
                return Ok(format.as_str().to_string());
            }
        }
    }

    // Strategy 4: Fall back to magic byte detection
    detect_format_from_magic(path)
}

/// Verify format using magic bytes
fn verify_format_with_magic(path: &Path, format: &BookFormat) -> ShioriResult<bool> {
    let mut file = File::open(path)?;
    let mut buffer = vec![0u8; 512];
    let bytes_read = file.read(&mut buffer)?;
    
    if bytes_read == 0 {
        return Ok(false);
    }

    match format {
        BookFormat::Epub => {
            // EPUB is a ZIP file containing mimetype file
            if buffer.starts_with(EPUB_MAGIC) {
                // Try to find "mimetype" entry and "application/epub+zip"
                let content = String::from_utf8_lossy(&buffer);
                Ok(content.contains("mimetype") || content.contains("epub"))
            } else {
                Ok(false)
            }
        }
        BookFormat::Pdf => Ok(buffer.starts_with(PDF_MAGIC)),
        BookFormat::Cbz => Ok(buffer.starts_with(ZIP_MAGIC)),
        BookFormat::Mobi | BookFormat::Azw3 => {
            // MOBI files often start with these bytes
            Ok(buffer.len() >= 68 
                && &buffer[60..68] == b"BOOKMOBI" 
                || buffer.starts_with(b"TPZ"))
        }
        BookFormat::Txt => {
            // Text files should be mostly valid UTF-8
            let sample = String::from_utf8_lossy(&buffer[..bytes_read.min(512)]);
            Ok(sample.chars().filter(|c| c.is_control() && *c != '\n' && *c != '\r' && *c != '\t').count() < bytes_read / 10)
        }
        BookFormat::Cbr => {
            // CBR files are RAR archives
            Ok(buffer.starts_with(&[0x52, 0x61, 0x72, 0x21]))
        }
    }
}

/// Detect format purely from magic bytes
fn detect_format_from_magic(path: &Path) -> ShioriResult<String> {
    let mut file = File::open(path)?;
    let mut buffer = vec![0u8; 512];
    let bytes_read = file.read(&mut buffer)?;

    if bytes_read == 0 {
        return Err(ShioriError::EmptyOrTruncatedFile {
            path: path.to_string_lossy().to_string(),
        });
    }

    // Check PDF
    if buffer.starts_with(PDF_MAGIC) {
        return Ok("pdf".to_string());
    }

    // Check MOBI/AZW3
    if buffer.len() >= 68 && &buffer[60..68] == b"BOOKMOBI" {
        return Ok("mobi".to_string());
    }

    // Check ZIP-based formats (EPUB, CBZ)
    if buffer.starts_with(ZIP_MAGIC) {
        let content = String::from_utf8_lossy(&buffer);
        if content.contains("epub") || content.contains("mimetype") {
            return Ok("epub".to_string());
        }
        // Could be CBZ
        return Ok("cbz".to_string());
    }

    // Check RAR (CBR)
    if buffer.starts_with(&[0x52, 0x61, 0x72, 0x21]) {
        return Ok("cbr".to_string());
    }

    // Check if it's text
    let sample = String::from_utf8_lossy(&buffer[..bytes_read.min(512)]);
    let control_chars = sample.chars().filter(|c| c.is_control() && *c != '\n' && *c != '\r' && *c != '\t').count();
    if control_chars < bytes_read / 10 {
        return Ok("txt".to_string());
    }

    Err(ShioriError::FormatDetectionFailed {
        path: path.to_string_lossy().to_string(),
    })
}

/// Validate book file integrity based on format
pub async fn validate_file_integrity(path: &Path, format: &str) -> ShioriResult<bool> {
    let format_enum = BookFormat::from_str(format).ok_or_else(|| {
        ShioriError::UnsupportedFormat {
            format: format.to_string(),
            path: path.to_string_lossy().to_string(),
        }
    })?;

    match format_enum {
        BookFormat::Epub => validate_epub(path),
        BookFormat::Pdf => validate_pdf(path),
        BookFormat::Mobi | BookFormat::Azw3 => validate_mobi(path),
        BookFormat::Cbz => validate_cbz(path),
        BookFormat::Cbr => validate_cbr(path),
        BookFormat::Txt => validate_txt(path),
    }
}

fn validate_epub(path: &Path) -> ShioriResult<bool> {
    use epub::doc::EpubDoc;
    
    match EpubDoc::new(path) {
        Ok(_doc) => Ok(true),
        Err(e) => Err(ShioriError::CorruptedEpub {
            path: path.to_string_lossy().to_string(),
            details: format!("{}", e),
        }),
    }
}

fn validate_pdf(path: &Path) -> ShioriResult<bool> {
    use lopdf::Document;
    
    match Document::load(path) {
        Ok(_doc) => Ok(true),
        Err(e) => Err(ShioriError::CorruptedPdf {
            path: path.to_string_lossy().to_string(),
            details: format!("{}", e),
        }),
    }
}

fn validate_mobi(path: &Path) -> ShioriResult<bool> {
    // Basic check: file should start with proper MOBI header
    let mut file = File::open(path)?;
    let mut buffer = vec![0u8; 68];
    file.read_exact(&mut buffer)?;

    if &buffer[60..68] == b"BOOKMOBI" {
        Ok(true)
    } else {
        Err(ShioriError::InvalidFormat(
            "Invalid MOBI file structure".to_string(),
        ))
    }
}

fn validate_cbz(path: &Path) -> ShioriResult<bool> {
    use zip::ZipArchive;
    
    let file = File::open(path)?;
    match ZipArchive::new(file) {
        Ok(mut archive) => {
            // Check if it contains at least one image
            let has_images = (0..archive.len()).any(|i| {
                if let Ok(file) = archive.by_index(i) {
                    let name = file.name().to_lowercase();
                    name.ends_with(".jpg") || name.ends_with(".jpeg") 
                        || name.ends_with(".png") || name.ends_with(".gif")
                        || name.ends_with(".webp")
                } else {
                    false
                }
            });
            
            if has_images {
                Ok(true)
            } else {
                Err(ShioriError::InvalidFormat(
                    "CBZ archive contains no images".to_string(),
                ))
            }
        }
        Err(e) => Err(ShioriError::InvalidFormat(format!("Invalid CBZ file: {}", e))),
    }
}

fn validate_cbr(path: &Path) -> ShioriResult<bool> {
    // RAR support requires external library (unrar)
    // For now, just check magic bytes
    let mut file = File::open(path)?;
    let mut buffer = vec![0u8; 4];
    file.read_exact(&mut buffer)?;

    if buffer == [0x52, 0x61, 0x72, 0x21] {
        Ok(true)
    } else {
        Err(ShioriError::InvalidFormat(
            "Invalid CBR/RAR file".to_string(),
        ))
    }
}

fn validate_txt(path: &Path) -> ShioriResult<bool> {
    let mut file = File::open(path)?;
    let mut buffer = vec![0u8; 4096];
    let bytes_read = file.read(&mut buffer)?;

    // Check if file is valid UTF-8
    match std::str::from_utf8(&buffer[..bytes_read]) {
        Ok(_) => Ok(true),
        Err(_) => Err(ShioriError::InvalidFormat(
            "Text file is not valid UTF-8".to_string(),
        )),
    }
}
