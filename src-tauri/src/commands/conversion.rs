use std::sync::Arc;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::State;
use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::error::ShioriError;
use crate::services::conversion_engine::{ConversionEngine, ConversionJob, CONVERSION_MATRIX};
use crate::utils::validate;
use crate::AppState;

/// Submit a conversion job
#[tauri::command]
pub async fn convert_book(
    engine: State<'_, Arc<ConversionEngine>>,
    input_path: String,
    output_format: String,
    output_dir: Option<String>,
    book_id: Option<i64>,
) -> crate::error::Result<String> {
    validate::require_safe_path(&input_path, "input_path")?;
    validate::require_non_empty(&output_format, "output_format")?;
    if let Some(ref dir) = output_dir {
        validate::require_safe_path(dir, "output_dir")?;
    }
    if let Some(id) = book_id {
        validate::require_positive_id(id, "book_id")?;
    }
    engine
        .submit_conversion(
            PathBuf::from(&input_path),
            &output_format,
            output_dir.map(PathBuf::from),
            book_id,
        )
        .await
        .map_err(|e| ShioriError::Other(e.to_string()))
}

/// Get conversion job status
#[tauri::command]
pub async fn get_conversion_status(
    engine: State<'_, Arc<ConversionEngine>>,
    job_id: String,
) -> crate::error::Result<ConversionJob> {
    validate::require_non_empty(&job_id, "job_id")?;
    engine
        .get_job_status(&job_id)
        .ok_or_else(|| ShioriError::Other("Job not found".to_string()))
}

/// List all in-memory conversion jobs
#[tauri::command]
pub async fn list_conversion_jobs(
    engine: State<'_, Arc<ConversionEngine>>,
) -> crate::error::Result<Vec<ConversionJob>> {
    Ok(engine.get_all_jobs())
}

/// Cancel a conversion job (works for both Queued and Processing)
#[tauri::command]
pub async fn cancel_conversion(
    engine: State<'_, Arc<ConversionEngine>>,
    job_id: String,
) -> crate::error::Result<()> {
    validate::require_non_empty(&job_id, "job_id")?;
    engine.cancel_job(&job_id).await.map_err(|e| ShioriError::Other(e.to_string()))
}

/// Get supported conversions — derived from the CONVERSION_MATRIX constant
#[tauri::command]
pub async fn get_supported_conversions() -> crate::error::Result<Vec<serde_json::Value>> {
    let result = CONVERSION_MATRIX
        .iter()
        .map(|(from, targets)| {
            serde_json::json!({
                "from": from,
                "to": targets,
            })
        })
        .collect();
    Ok(result)
}

// ==================== Calibre Conversion ====================

/// Response for Calibre conversion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalibreConversionResult {
    pub success: bool,
    pub output_path: String,
    pub message: String,
}

/// Check if Calibre's ebook-convert is available on the system
#[tauri::command]
pub async fn check_calibre_available() -> crate::error::Result<bool> {
    let result = Command::new("ebook-convert")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await;
    
    Ok(result.map(|s| s.success()).unwrap_or(false))
}

/// Convert a book using Calibre's ebook-convert CLI
/// This provides higher quality conversion than the built-in converters,
/// especially for PDF → EPUB conversion.
/// 
/// Arguments:
/// - input_path: Path to the source file (PDF, MOBI, AZW3, etc.)
/// - output_format: Target format (typically "epub")
/// - replace_original: If true, replaces the original file with the converted one
/// - book_id: Optional book ID to update the database record after conversion
#[tauri::command]
pub async fn convert_with_calibre(
    input_path: String,
    output_format: String,
    replace_original: bool,
    book_id: Option<i64>,
    state: State<'_, AppState>,
) -> crate::error::Result<CalibreConversionResult> {
    validate::require_safe_path(&input_path, "input_path")?;
    validate::require_non_empty(&output_format, "output_format")?;
    if let Some(id) = book_id {
        validate::require_positive_id(id, "book_id")?;
    }

    let input = PathBuf::from(&input_path);
    
    // Verify input file exists
    if !input.exists() {
        return Err(ShioriError::Other(format!("Input file not found: {}", input_path)));
    }

    // Check Calibre is available
    let calibre_check = Command::new("ebook-convert")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await;
    
    if !calibre_check.map(|s| s.success()).unwrap_or(false) {
        return Err(ShioriError::Other(
            "Calibre's ebook-convert is not installed or not in PATH. Please install Calibre.".to_string()
        ));
    }

    // Build output path
    let stem = input.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("converted");
    let output = input.with_file_name(format!("{}.{}", stem, output_format));

    log::info!("[Calibre] Converting {} → {}", input.display(), output.display());

    // Run ebook-convert
    let result = Command::new("ebook-convert")
        .arg(&input)
        .arg(&output)
        // Calibre conversion options for better EPUB output
        .arg("--enable-heuristics")
        .arg("--chapter-mark=pagebreak")
        .arg("--preserve-cover-aspect-ratio")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to run ebook-convert: {}", e)))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        log::error!("[Calibre] Conversion failed: {}", stderr);
        return Err(ShioriError::Other(format!("Calibre conversion failed: {}", stderr)));
    }

    log::info!("[Calibre] Conversion successful: {}", output.display());

    let final_path = if replace_original {
        // Remove original and rename converted file to original name with new extension
        let original_stem = input.file_stem().and_then(|s| s.to_str()).unwrap_or("book");
        let final_name = format!("{}.{}", original_stem, output_format);
        let final_path = input.parent().unwrap_or(&input).join(&final_name);

        // If original has different extension, delete it
        if input.extension() != output.extension() {
            if let Err(e) = tokio::fs::remove_file(&input).await {
                log::warn!("[Calibre] Could not remove original file: {}", e);
            }
        }

        // Rename output to final path if they differ
        if output != final_path {
            tokio::fs::rename(&output, &final_path)
                .await
                .map_err(|e| ShioriError::Other(format!("Failed to rename converted file: {}", e)))?;
        }

        final_path
    } else {
        output.clone()
    };

    // Update database if book_id provided
    if let Some(id) = book_id {
        let conn = state.db.get_connection()?;
        let new_path = final_path.to_string_lossy().to_string();
        conn.execute(
            "UPDATE books SET file_path = ?1, format = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
            rusqlite::params![new_path, output_format, id],
        )?;
        log::info!("[Calibre] Updated book {} with new path: {}", id, new_path);
    }

    Ok(CalibreConversionResult {
        success: true,
        output_path: final_path.to_string_lossy().to_string(),
        message: format!("Successfully converted to {}", output_format.to_uppercase()),
    })
}

// ==================== Auto-Convert on Open ====================

/// Response for the auto-convert-and-replace operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvertAndReplaceResult {
    pub new_path: String,
    pub new_format: String,
    pub title: String,
    pub cover_path: Option<String>,
}

/// Synchronously convert a book to EPUB using the built-in conversion engine,
/// update the DB record, and delete the original file.
///
/// This is used when opening a non-EPUB book — the user confirms conversion
/// and we convert+replace before handing off to the EPUB reader.
#[tauri::command]
pub async fn convert_and_replace_book(
    book_id: i64,
    state: State<'_, AppState>,
) -> crate::error::Result<ConvertAndReplaceResult> {
    validate::require_positive_id(book_id, "book_id")?;

    // 1. Look up the book
    let conn = state.db.get_connection()?;
    let (title, file_path, file_format, cover_path): (String, String, String, Option<String>) =
        conn.query_row(
            "SELECT title, file_path, file_format, cover_path FROM books WHERE id = ?1",
            rusqlite::params![book_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        ).map_err(|_| ShioriError::BookNotFound(format!("Book {} not found", book_id)))?;
    drop(conn);

    let source = PathBuf::from(&file_path);
    let source_format = file_format.to_lowercase();

    // 2. Validate source exists
    if !source.exists() {
        return Err(ShioriError::FileNotFound { path: file_path });
    }

    // 3. Format already EPUB — no-op
    if source_format == "epub" {
        return Ok(ConvertAndReplaceResult {
            new_path: file_path,
            new_format: "epub".to_string(),
            title,
            cover_path,
        });
    }

    // 4. Check conversion is supported
    if !crate::services::conversion_engine::can_convert(&source_format, "epub") {
        return Err(ShioriError::Other(format!(
            "Conversion from {} to EPUB is not supported",
            source_format.to_uppercase()
        )));
    }

    // 5. Build output path (same dir, same stem, .epub extension)
    let output = source.with_extension("epub");

    log::info!(
        "[AutoConvert] Converting book {} ({}) from {} → EPUB",
        book_id,
        title,
        source_format.to_uppercase()
    );

    // 6. Run conversion (synchronous — wraps blocking work on Tokio)
    let src_clone = source.clone();
    let out_clone = output.clone();
    let fmt_clone = source_format.clone();

    let convert_result = crate::services::conversion_engine::ConversionEngine::convert_direct(
        &src_clone,
        &out_clone,
        &fmt_clone,
        "epub",
    )
    .await;

    if let Err(e) = convert_result {
        // Cleanup on failure — remove incomplete output if it exists
        let _ = tokio::fs::remove_file(&output).await;
        return Err(ShioriError::Other(format!("Conversion failed: {}", e)));
    }

    // 7. Verify output was created
    if !output.exists() {
        return Err(ShioriError::Other(
            "Conversion completed but output file was not created".to_string(),
        ));
    }

    // 8. Canonicalize the new path for DB storage
    let canonical_path = std::fs::canonicalize(&output)
        .unwrap_or_else(|_| output.clone());
    let new_path_str = canonical_path.to_string_lossy().to_string();

    // 9. Update DB
    let conn = state.db.get_connection()?;
    
    // Check if the filesystem watcher already added the new file to the DB.
    // If so, delete that new row to preempt a UNIQUE constraint failure.
    // We want to retain the original book_id (so progress is preserved).
    conn.execute(
        "DELETE FROM books WHERE file_path = ?1 AND id != ?2",
        rusqlite::params![new_path_str, book_id],
    )?;

    conn.execute(
        "UPDATE books SET file_path = ?1, file_format = 'epub', modified_date = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![new_path_str, book_id],
    )?;
    drop(conn);

    log::info!(
        "[AutoConvert] DB updated for book {}. New path: {}",
        book_id,
        new_path_str
    );

    // 10. Delete original file (only if different from output)
    if source != output {
        if let Err(e) = tokio::fs::remove_file(&source).await {
            log::warn!(
                "[AutoConvert] Could not delete original file {}: {}",
                source.display(),
                e
            );
            // Non-fatal — conversion succeeded, just couldn't clean up
        } else {
            log::info!("[AutoConvert] Deleted original: {}", source.display());
        }
    }

    Ok(ConvertAndReplaceResult {
        new_path: new_path_str,
        new_format: "epub".to_string(),
        title,
        cover_path,
    })
}
