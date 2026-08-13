pub mod docx;
pub mod fb2;
pub mod mobi;
pub mod pdf;
pub mod txt;
/// Calibre-quality format conversion module for Shiori.
///
/// Implements proper format parsing for MOBI/AZW3, PDF, TXT, FB2, DOCX, CBZ, CBR
/// with output to EPUB 3. Algorithms inspired by calibre (GPL-3.0) but
/// reimplemented from scratch in Rust.
///
/// ## Architecture
///
/// ```text
/// Input File → [Format Parser] → existing EPUB writer OR OebBook → [epub_builder] → .epub
/// ```
///
/// ## Public API
///
/// - `convert_to_epub(path, progress_cb)` — main entry point, returns path to generated .epub
/// - `ConversionProgress { stage, percent }` — emitted through the progress callback
// ── Existing format parsers (kept for ConversionEngine compat) ──────────
pub mod utils;

// ── New OEB-based pipeline ───────────────────────────────────────────────
pub mod epub_builder;
pub mod error;
pub mod formats;
pub mod oeb;

#[cfg(test)]
pub mod tests;

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub use error::ConversionError;

// ──────────────────────────────────────────────────────────────────────────
// PUBLIC API TYPES (kept for ConversionEngine backward compat)
// ──────────────────────────────────────────────────────────────────────────

/// Output of a successful format → EPUB conversion (used by ConversionEngine)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpubOutput {
    pub path: PathBuf,
    pub title: String,
    pub author: Option<String>,
    pub cover_data: Option<Vec<u8>>,
    pub chapter_count: usize,
    pub warnings: Vec<String>,
}

/// Source format for conversion (used by ConversionEngine)
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceFormat {
    Mobi,
    Azw3,
    Pdf,
    Txt,
    Fb2,
    Docx,
    Html,
    Markdown,
}

impl SourceFormat {
    #[allow(dead_code)]
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "mobi" => Some(Self::Mobi),
            "azw3" | "azw" => Some(Self::Azw3),
            "pdf" => Some(Self::Pdf),
            "txt" | "text" | "rtf" => Some(Self::Txt),
            "fb2" | "fb2.zip" | "fbz" => Some(Self::Fb2),
            "docx" => Some(Self::Docx),
            "html" | "htm" | "xhtml" => Some(Self::Html),
            "md" | "markdown" => Some(Self::Markdown),
            _ => None,
        }
    }
}

/// Bridge ConversionError → FormatError for ConversionEngine compatibility.
impl From<ConversionError> for crate::services::format_adapter::FormatError {
    fn from(e: ConversionError) -> Self {
        crate::services::format_adapter::FormatError::ConversionError(e.to_string())
    }
}

/// Legacy convert_to_epub (used by ConversionEngine worker).
/// Takes explicit source/output paths and SourceFormat.
///
/// All formats go through the OEB pipeline: `formats::*::parse` →
/// `epub_builder::build_epub`.
pub async fn convert_to_epub(
    source_path: &Path,
    output_path: &Path,
    format: SourceFormat,
    _progress_cb: Option<&(dyn Fn(u8, &str) + Send + Sync)>,
) -> Result<EpubOutput, ConversionError> {
    if !source_path.exists() {
        return Err(ConversionError::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Source file not found: {}", source_path.display()),
        )));
    }

    let mut book = match format {
        SourceFormat::Mobi | SourceFormat::Azw3 => formats::mobi::parse(source_path)?,
        SourceFormat::Pdf => formats::pdf::parse(source_path)?,
        SourceFormat::Txt => formats::txt::parse(source_path)?,
        SourceFormat::Fb2 => formats::fb2::parse(source_path)?,
        SourceFormat::Docx => formats::docx::parse(source_path)?,
        SourceFormat::Html => formats::html::parse(source_path)?,
        SourceFormat::Markdown => formats::markdown::parse(source_path)?,
    };

    book.sanitize_html();
    epub_builder::build_epub(&book, output_path)?;

    Ok(EpubOutput {
        path: output_path.to_path_buf(),
        title: book.title,
        author: book.authors.first().cloned(),
        cover_data: book.cover_image.as_ref().and_then(|img| match &img.source {
            crate::conversion::oeb::ImageSource::Bytes(b) => Some(b.clone()),
            _ => None,
        }),
        chapter_count: book.chapters.len(),
        warnings: vec![],
    })
}

// ──────────────────────────────────────────────────────────────────────────
// NEW PUBLIC API — used by the new Tauri commands
// ──────────────────────────────────────────────────────────────────────────

/// Progress event emitted during conversion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversionProgress {
    /// Human-readable stage name, e.g. "Parsing MOBI"
    pub stage: String,
    /// Completion percentage 0–100
    pub percent: u8,
}

/// Progress callback type
pub type ProgressCallback = Box<dyn Fn(ConversionProgress) + Send + Sync>;

/// Convert any supported book format to EPUB 3.
///
/// If the input is already an EPUB, returns its path unchanged.
/// Output is written to `{temp_dir}/shiori_converted/{stem}.epub`.
///
/// # Arguments
/// - `input_path` — path to the source file
/// - `progress` — optional callback for progress events
///
/// # Returns
/// Path to the generated (or unchanged EPUB) file.
pub async fn convert_to_epub_new(
    input_path: &Path,
    progress: Option<ProgressCallback>,
    db: Option<&crate::db::Database>,
) -> Result<PathBuf, ConversionError> {
    let ext = input_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let progress_arc = progress.map(std::sync::Arc::new);
    let report = {
        let p = progress_arc.clone();
        move |stage: &str, percent: u8| {
            if let Some(ref cb) = p {
                cb(ConversionProgress {
                    stage: stage.to_string(),
                    percent,
                });
            }
        }
    };

    report("Detecting format", 2);

    // Prepare output path. The intermediate dir is a `tempfile::TempDir`
    // (0700 perms, unique) that we `keep()`: the returned EPUB path is handed
    // to the frontend reader, which reads it lazily for the whole session, so
    // drop-time auto-cleanup would delete a file still in use. Leftovers are
    // reaped by `cleanup_converted_cache` (Clear Cache / app exit).
    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("converted");
    let tmp_handle = tempfile::Builder::new()
        .prefix("shiori_converted_")
        .tempdir()?;
    let tmp_dir = tmp_handle.keep();
    let output_path = tmp_dir.join(format!("{}.epub", stem));

    if let Some(db) = db {
        use crate::services::calibre_service::{self, CalibreError, CalibreProfile};
        let profile = match ext.as_str() {
            "pdf" => Some(CalibreProfile::Pdf),
            "mobi" | "azw" | "azw3" | "prc" | "fb2" | "docx" => Some(CalibreProfile::GenericBook),
            _ => None,
        };

        if let Some(profile) = profile {
            let p_calibre = progress_arc.clone();
            let calibre_cb = move |percent: u8, msg: &str| {
                if let Some(ref cb) = p_calibre {
                    cb(ConversionProgress {
                        stage: msg.to_string(),
                        percent,
                    });
                }
            };

            match calibre_service::convert_to_epub(
                input_path,
                &output_path,
                db,
                profile,
                || false,
                Some(calibre_cb),
            )
            .await
            {
                Ok(_) => {
                    log::info!("[AutoConvert] Successfully converted with Calibre!");
                    return Ok(output_path);
                }
                Err(CalibreError::Disabled) | Err(CalibreError::NotFound) => {
                    log::info!("[AutoConvert] Calibre not available or disabled, falling back to native conversion");
                }
                Err(e) => {
                    log::warn!(
                        "[AutoConvert] Calibre conversion failed: {}. Falling back to native.",
                        e
                    );
                }
            }
        }
    }

    match ext.as_str() {
        "epub" => {
            // Already EPUB — return path unchanged
            report("Ready", 100);
            return Ok(input_path.to_path_buf());
        }

        "cbz" => {
            report("Parsing comic archive", 10);
            let mut oeb = formats::cbz::parse(input_path)?;
            report("Building EPUB", 60);
            oeb.sanitize_html();
            epub_builder::build_epub(&oeb, &output_path)?;
        }

        "cbr" => {
            report("Extracting comic archive", 10);
            let mut oeb = formats::cbr::parse(input_path)?;
            report("Building EPUB", 60);
            oeb.sanitize_html();
            epub_builder::build_epub(&oeb, &output_path)?;
        }

        // All book formats go through the OEB pipeline: real parser →
        // sanitize → epub_builder (high-fidelity structure/TOC/images).
        "pdf" | "mobi" | "azw" | "azw3" | "prc" | "docx" | "fb2" | "fbz" | "txt" | "rtf"
        | "html" | "htm" | "xhtml" | "md" | "markdown" => {
            let stage = format!("Parsing {}", ext.to_uppercase());
            report(&stage, 10);
            let mut oeb = parse_oeb(input_path, &ext)?;
            report("Building EPUB", 60);
            oeb.sanitize_html();
            epub_builder::build_epub(&oeb, &output_path)?;
        }

        other => {
            return Err(ConversionError::UnsupportedFormat(other.to_string()));
        }
    }

    if !output_path.exists() {
        return Err(ConversionError::EmptyContent);
    }

    report("Done", 100);
    Ok(output_path)
}

/// Dispatch a source file to the matching OEB parser by extension.
fn parse_oeb(input_path: &Path, ext: &str) -> Result<oeb::OebBook, ConversionError> {
    match ext {
        "pdf" => formats::pdf::parse(input_path),
        "mobi" | "azw" | "azw3" | "prc" => formats::mobi::parse(input_path),
        "docx" => formats::docx::parse(input_path),
        "fb2" | "fbz" => formats::fb2::parse(input_path),
        "txt" | "rtf" => formats::txt::parse(input_path),
        "html" | "htm" | "xhtml" => formats::html::parse(input_path),
        "md" | "markdown" => formats::markdown::parse(input_path),
        _ => Err(ConversionError::UnsupportedFormat(ext.to_string())),
    }
}

/// Delete the Shiori conversion cache directory.
/// Call this on app exit or "Clear Cache" user action.
///
/// Reaps every `shiori_converted_*` directory under the system temp dir
/// (the intermediate dirs produced by [`convert_to_epub_new`], which are
/// kept alive for the reading session rather than dropped).
pub fn cleanup_converted_cache() -> Result<(), ConversionError> {
    let tmp_root = std::env::temp_dir();
    let entries = std::fs::read_dir(&tmp_root).map_err(ConversionError::IoError)?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        if name.to_string_lossy().starts_with("shiori_converted_") && entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            std::fs::remove_dir_all(entry.path())?;
        }
    }
    Ok(())
}
