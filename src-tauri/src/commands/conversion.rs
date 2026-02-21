use std::sync::Arc;
use std::path::PathBuf;
use tauri::State;

use crate::services::conversion_engine::{ConversionEngine, ConversionJob, CONVERSION_MATRIX};

/// Submit a conversion job
#[tauri::command]
pub async fn convert_book(
    engine: State<'_, Arc<ConversionEngine>>,
    input_path: String,
    output_format: String,
    output_dir: Option<String>,
    book_id: Option<i64>,
) -> Result<String, String> {
    engine
        .submit_conversion(
            PathBuf::from(&input_path),
            &output_format,
            output_dir.map(PathBuf::from),
            book_id,
        )
        .await
        .map_err(|e| e.to_string())
}

/// Get conversion job status
#[tauri::command]
pub async fn get_conversion_status(
    engine: State<'_, Arc<ConversionEngine>>,
    job_id: String,
) -> Result<ConversionJob, String> {
    engine
        .get_job_status(&job_id)
        .ok_or_else(|| "Job not found".to_string())
}

/// List all in-memory conversion jobs
#[tauri::command]
pub async fn list_conversion_jobs(
    engine: State<'_, Arc<ConversionEngine>>,
) -> Result<Vec<ConversionJob>, String> {
    Ok(engine.get_all_jobs())
}

/// Cancel a conversion job (works for both Queued and Processing)
#[tauri::command]
pub async fn cancel_conversion(
    engine: State<'_, Arc<ConversionEngine>>,
    job_id: String,
) -> Result<(), String> {
    engine.cancel_job(&job_id).await.map_err(|e| e.to_string())
}

/// Get supported conversions — derived from the CONVERSION_MATRIX constant
#[tauri::command]
pub async fn get_supported_conversions() -> Result<Vec<serde_json::Value>, String> {
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
