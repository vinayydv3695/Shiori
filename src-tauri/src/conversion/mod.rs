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
pub async fn convert_to_epub(
    source_path: &Path,
    output_path: &Path,
    format: SourceFormat,
    progress_cb: Option<&(dyn Fn(u8, &str) + Send + Sync)>,
) -> Result<EpubOutput, ConversionError> {
    if !source_path.exists() {
        return Err(ConversionError::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Source file not found: {}", source_path.display()),
        )));
    }

    match format {
        SourceFormat::Mobi | SourceFormat::Azw3 => mobi::convert(source_path, output_path).await,
        SourceFormat::Pdf => pdf::convert(source_path, output_path, progress_cb).await,
        SourceFormat::Txt => txt::convert(source_path, output_path).await,
        SourceFormat::Fb2 => fb2::convert(source_path, output_path).await,
        SourceFormat::Docx => docx::convert(source_path, output_path).await,
    }
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

    // Prepare output path
    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("converted");
    let tmp_dir = std::env::temp_dir().join(format!("shiori_converted_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir)?;
    let output_path = tmp_dir.join(format!("{}.epub", stem));

    if let Some(db) = db {
        use crate::services::calibre_service::{self, CalibreProfile, CalibreError};
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
            ).await {
                Ok(_) => {
                    log::info!("[AutoConvert] Successfully converted with Calibre!");
                    return Ok(output_path);
                }
                Err(CalibreError::Disabled) | Err(CalibreError::NotFound) => {
                    log::info!("[AutoConvert] Calibre not available or disabled, falling back to native conversion");
                }
                Err(e) => {
                    log::warn!("[AutoConvert] Calibre conversion failed: {}. Falling back to native.", e);
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

        // For these, the existing async converters write the EPUB directly
        "pdf" => {
            report("Parsing PDF", 10);
            let pdf_report = |pct: u8, msg: &str| report(msg, pct);
            pdf::convert(input_path, &output_path, Some(&pdf_report))
                .await
                .map_err(|e| ConversionError::Other(e.to_string()))?;
        }

        "mobi" | "azw" | "azw3" | "prc" => {
            report("Parsing MOBI/AZW3", 10);
            mobi::convert(input_path, &output_path)
                .await
                .map_err(|e| ConversionError::Other(e.to_string()))?;
        }

        "docx" => {
            report("Parsing DOCX", 10);
            docx::convert(input_path, &output_path)
                .await
                .map_err(|e| ConversionError::Other(e.to_string()))?;
        }

        "fb2" | "fbz" => {
            report("Parsing FB2", 10);
            fb2::convert(input_path, &output_path)
                .await
                .map_err(|e| ConversionError::Other(e.to_string()))?;
        }

        "txt" | "rtf" => {
            report("Parsing text", 10);
            txt::convert(input_path, &output_path)
                .await
                .map_err(|e| ConversionError::Other(e.to_string()))?;
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

/// Delete the Shiori conversion cache directory.
/// Call this on app exit or "Clear Cache" user action.
pub fn cleanup_converted_cache() -> Result<(), ConversionError> {
    let tmp_dir = std::env::temp_dir().join("shiori_converted");
    if tmp_dir.exists() {
        std::fs::remove_dir_all(&tmp_dir)?;
    }
    Ok(())
}
