/// CBR (Comic Book RAR) → OEB converter.
///
/// Extracts the RAR archive to a temp directory then delegates to the CBZ
/// image-directory parser. Requires the system `unrar` utility or libunrar.
///
/// If RAR extraction fails (e.g. libunrar not installed), returns a
/// `ConversionError::ParseError` with a helpful installation message rather
/// than crashing the process.

use std::path::Path;

use crate::conversion::error::ConversionError;
use crate::conversion::oeb::OebBook;

/// Parse a CBR file and produce an OebBook.
pub fn parse(path: &Path) -> Result<OebBook, ConversionError> {
    // Create a temp directory for extracted files
    let tmp_dir = tempfile::Builder::new()
        .prefix("shiori_cbr_")
        .tempdir()
        .map_err(|e| ConversionError::IoError(e))?;

    // Extract using the unrar crate (requires libunrar at link time)
    extract_rar(path, tmp_dir.path())?;

    // Delegate to the CBZ image-directory parser
    let mut book = super::cbz::parse_image_dir(tmp_dir.path())?;

    // Override the title with the CBR filename (parse_image_dir uses the temp dir name)
    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
        book.title = stem.replace('_', " ").replace('-', " ");
    }

    // tmp_dir is dropped here, cleaning up extracted files
    Ok(book)
}

/// Extract a RAR archive to the given directory.
///
/// Uses the `unrar` crate which links against libunrar. If libunrar is
/// unavailable the crate will still compile but extraction will return an
/// error.
#[cfg(feature = "unrar")]
fn extract_rar(rar_path: &Path, dest: &Path) -> Result<(), ConversionError> {
    use unrar::Archive;

    Archive::new(rar_path.to_str().unwrap_or_default())
        .extract_to(dest.to_str().unwrap_or_default())
        .map_err(|e| ConversionError::ParseError {
            format: "CBR".to_string(),
            detail: format!(
                "RAR extraction failed: {}. Ensure libunrar is installed (e.g. 'pacman -S unrar' on Arch Linux).",
                e
            ),
        })?
        .process()
        .map_err(|e| ConversionError::ParseError {
            format: "CBR".to_string(),
            detail: format!("RAR processing failed: {}", e),
        })?;

    Ok(())
}

/// Fallback when the `unrar` feature is not enabled — extracts using the
/// system `unrar` command-line tool via `std::process::Command`.
#[cfg(not(feature = "unrar"))]
fn extract_rar(rar_path: &Path, dest: &Path) -> Result<(), ConversionError> {
    let output = std::process::Command::new("unrar")
        .args(["x", "-y", "-inul"])
        .arg(rar_path)
        .arg(dest)
        .output()
        .map_err(|_| ConversionError::ParseError {
            format: "CBR".to_string(),
            detail: "The 'unrar' command was not found. Install unrar to open CBR files (e.g. 'pacman -S unrar' on Arch Linux or 'sudo apt install unrar' on Ubuntu).".to_string(),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ConversionError::ParseError {
            format: "CBR".to_string(),
            detail: format!("unrar exited with error: {}", stderr.trim()),
        });
    }

    Ok(())
}
