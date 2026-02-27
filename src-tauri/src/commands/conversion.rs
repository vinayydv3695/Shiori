use std::sync::Arc;
use std::path::PathBuf;
use tauri::State;

use crate::error::ShioriError;
use crate::services::conversion_engine::{ConversionEngine, ConversionJob, CONVERSION_MATRIX};
use crate::utils::validate;

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
