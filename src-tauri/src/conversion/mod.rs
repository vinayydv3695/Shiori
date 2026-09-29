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
pub mod report;

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
    Ok(
        convert_to_epub_new_with_report(input_path, progress, db)
            .await?
            .0,
    )
}

/// Like [`convert_to_epub_new`] but returns the full conversion report
/// (IR-SPEC §4) alongside the output path.
pub async fn convert_to_epub_new_with_report(
    input_path: &Path,
    progress: Option<ProgressCallback>,
    db: Option<&crate::db::Database>,
) -> Result<(PathBuf, report::ConversionReport), ConversionError> {
    convert_to_epub_into(input_path, None, progress, db).await
}

/// Convert into a caller-managed output directory. With `out_dir: None` the
/// output lands in a kept temp dir (reader session semantics). With
/// `Some(dir)` the pipeline writes `dir/{stem}.epub` and the caller owns
/// cleanup — used by the conversion engine so failed jobs leak nothing.
pub async fn convert_to_epub_into(
    input_path: &Path,
    out_dir: Option<&Path>,
    progress: Option<ProgressCallback>,
    db: Option<&crate::db::Database>,
) -> Result<(PathBuf, report::ConversionReport), ConversionError> {
    let started = std::time::Instant::now();
    let ext = input_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    let known = matches!(
        ext.as_str(),
        "epub" | "cbz" | "cbr" | "pdf" | "mobi" | "azw" | "azw3" | "prc" | "docx"
            | "fb2" | "fbz" | "zip" | "gz" | "txt" | "rtf" | "html" | "htm" | "xhtml" | "md"
            | "markdown"
    );
    if !known {
        return Err(ConversionError::UnsupportedFormat(ext));
    }

    let source_size = std::fs::metadata(input_path).map(|m| m.len()).unwrap_or(0);
    let source_sha256 = streamed_sha256(input_path)?;

    // Deterministic `dcterms:modified`: the source file's mtime in UTC.
    let modified = std::fs::metadata(input_path)
        .and_then(|m| m.modified())
        .ok()
        .map(|t| -> String {
            let d: chrono::DateTime<chrono::Utc> = t.into();
            d.format("%Y-%m-%dT%H:%M:%SZ").to_string()
        });
    let ext = input_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    let mut report = report::ConversionReport::new(
        if ext.is_empty() { "unknown" } else { &ext },
        source_size,
    );

    let progress_arc = progress.map(std::sync::Arc::new);
    let p = progress_arc.clone();
    let report_to_progress = move |stage: &str, percent: u8| {
        if let Some(ref cb) = p {
            cb(ConversionProgress {
                stage: stage.to_string(),
                percent,
            });
        }
    };

    report_to_progress("Detecting format", 2);

    // Prepare output path. Reader-session semantics (out_dir None): the dir is
    // a `tempfile::TempDir` (0700 perms, unique) that we `keep()` — the
    // returned EPUB path is handed to the frontend reader, which reads it
    // lazily for the whole session, so drop-time auto-cleanup would delete a
    // file still in use. Leftovers are reaped by `cleanup_converted_cache`.
    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("converted");
    let output_path = match out_dir {
        Some(dir) => dir.join(format!("{}.epub", stem)),
        None => {
            let tmp_handle = tempfile::Builder::new()
                .prefix("shiori_converted_")
                .tempdir()?;
            tmp_handle.keep().join(format!("{}.epub", stem))
        }
    };

    // Deterministic `dcterms:modified`: the source file's mtime in UTC.
    let modified = std::fs::metadata(input_path)
        .and_then(|m| m.modified())
        .ok()
        .map(|t| -> String {
            let d: chrono::DateTime<chrono::Utc> = t.into();
            d.format("%Y-%m-%dT%H:%M:%SZ").to_string()
        });
    let build_opts = epub_builder::BuildOptions {
        source_sha256: Some(source_sha256),
        modified,
    };

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
                    report.note_heuristic("calibre-user-installed");
                    report.info(
                        "calibre_used",
                        "Converted with Calibre (user-installed ebook-convert).",
                    );
                    return finalize_report(output_path, build_opts, report, started);
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
            report_to_progress("Ready", 100);
            report.chapter_count = 0;
            return Ok((input_path.to_path_buf(), report));
        }

        // FB2 archives: .fb2.zip / .fb2.gz / .fbz are one format family.
        // Sniff the container (zip PK, gzip 1F 8B) and refuse anything else
        // so an arbitrary .zip never reaches the FB2 parser.
        "zip" | "gz" | "fbz" => {
            report_to_progress("Parsing FB2 archive", 10);
            let head = std::fs::read(input_path).ok();
            let looks_zip = head.as_deref().map(|h| h.len() >= 4 && h[..4] == [0x50, 0x4B, 0x03, 0x04]).unwrap_or(false);
            let looks_gz = head.as_deref().map(|h| h.len() >= 2 && h[..2] == [0x1F, 0x8B]).unwrap_or(false);
            if !looks_zip && !looks_gz {
                return Err(ConversionError::InvalidFormat(
                    "Not an FB2 archive (expected .zip or .gz container)".to_string(),
                ));
            }
            let mut oeb = formats::fb2::parse(input_path)?;
            report_to_progress("Building EPUB", 60);
            oeb.sanitize_html();
            epub_builder::build_epub_with_report(&oeb, &output_path, &build_opts, &mut report)?;
            record_book_metrics(&oeb, &mut report);
            merge_parser_report(&mut report, &oeb.report);
        }

        "cbz" => {
            report_to_progress("Parsing comic archive", 10);
            let mut oeb = formats::cbz::parse(input_path)?;
            report_to_progress("Building EPUB", 60);
            oeb.sanitize_html();
            epub_builder::build_epub_with_report(&oeb, &output_path, &build_opts, &mut report)?;
            record_book_metrics(&oeb, &mut report);
            merge_parser_report(&mut report, &oeb.report);
        }

        "cbr" => {
            report_to_progress("Extracting comic archive", 10);
            let mut oeb = formats::cbr::parse(input_path)?;
            report_to_progress("Building EPUB", 60);
            oeb.sanitize_html();
            epub_builder::build_epub_with_report(&oeb, &output_path, &build_opts, &mut report)?;
            record_book_metrics(&oeb, &mut report);
            merge_parser_report(&mut report, &oeb.report);
        }

        // All book formats go through the OEB pipeline: real parser →
        // sanitize → epub_builder (high-fidelity structure/TOC/images).
        "pdf" | "mobi" | "azw" | "azw3" | "prc" | "docx" | "fb2" | "fbz" | "txt" | "rtf"
        | "html" | "htm" | "xhtml" | "md" | "markdown" => {
            let stage = format!("Parsing {}", ext.to_uppercase());
            report_to_progress(&stage, 10);
            let mut oeb = parse_oeb(input_path, &ext)?;
            report_to_progress("Building EPUB", 60);
            oeb.sanitize_html();
            epub_builder::build_epub_with_report(&oeb, &output_path, &build_opts, &mut report)?;
            record_book_metrics(&oeb, &mut report);
        }

        other => {
            return Err(ConversionError::UnsupportedFormat(other.to_string()));
        }
    }

    if !output_path.exists() {
        return Err(ConversionError::EmptyContent);
    }

    report_to_progress("Done", 100);
    finalize_report(output_path, build_opts, report, started)
}

/// Fill the report with post-build metrics + content digest.
fn finalize_report(
    output_path: PathBuf,
    _opts: epub_builder::BuildOptions,
    mut report: report::ConversionReport,
    started: std::time::Instant,
) -> Result<(PathBuf, report::ConversionReport), ConversionError> {
    report.duration_ms = started.elapsed().as_millis() as u64;
    if let Some(digest) = sha256_of_file(&output_path) {
        report.output_sha256 = Some(digest);
    }
    Ok((output_path, report))
}

fn record_book_metrics(book: &oeb::OebBook, report: &mut report::ConversionReport) {
    report.toc_entries = book.toc.len();
    report.chapter_count = book.chapters.len();
    report.image_count = book.images.len() + usize::from(book.cover_image.is_some());
}

/// Fold parser-level findings into the job report (IR-SPEC §4).
fn merge_parser_report(report: &mut report::ConversionReport, parser: &report::ConversionReport) {
    report.warnings.extend(parser.warnings.iter().cloned());
    for h in &parser.heuristics_used {
        if !report.heuristics_used.iter().any(|x| x == h) {
            report.heuristics_used.push(h.clone());
        }
    }
    if report.fallback_used.is_none() {
        report.fallback_used = parser.fallback_used.clone();
    }
    report.confidence = (report.confidence * parser.confidence).max(0.1);
}

/// Streaming SHA-256 of a file (bounded memory — reads in 1 MB chunks).
fn streamed_sha256(path: &Path) -> Result<[u8; 32], ConversionError> {
    use sha2::{Digest, Sha256};
    let mut file = std::fs::File::open(path).map_err(ConversionError::IoError)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 1024 * 1024];
    loop {
        use std::io::Read;
        let n = file.read(&mut buf).map_err(ConversionError::IoError)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().into())
}

fn sha256_of_file(path: &Path) -> Option<String> {
    streamed_sha256(path)
        .ok()
        .map(|h| h.iter().map(|b| format!("{:02x}", b)).collect())
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
