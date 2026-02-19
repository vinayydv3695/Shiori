use std::sync::Arc;
use std::path::PathBuf;
use tauri::State;

use crate::services::conversion_engine::{ConversionEngine, ConversionJob};

/// Submit a conversion job
#[tauri::command]
pub async fn convert_book(
    engine: State<'_, Arc<ConversionEngine>>,
    input_path: String,
    output_format: String,
    output_dir: Option<String>,
) -> Result<String, String> {
    let output_path = output_dir.map(PathBuf::from);
    
    let job_id = engine.submit_conversion(
        input_path.into(),
        &output_format,
        output_path,
    ).await.map_err(|e| e.to_string())?;

    Ok(job_id.to_string())
}

/// Get conversion job status
#[tauri::command]
pub async fn get_conversion_status(
    engine: State<'_, Arc<ConversionEngine>>,
    job_id: String,
) -> Result<ConversionJob, String> {
    let uuid = uuid::Uuid::parse_str(&job_id)
        .map_err(|e| format!("Invalid job ID: {}", e))?;

    engine.get_job_status(&uuid)
        .ok_or_else(|| "Job not found".to_string())
}

/// List all conversion jobs
#[tauri::command]
pub async fn list_conversion_jobs(
    engine: State<'_, Arc<ConversionEngine>>,
) -> Result<Vec<ConversionJob>, String> {
    Ok(engine.get_all_jobs())
}

/// Cancel a conversion job
#[tauri::command]
pub async fn cancel_conversion(
    engine: State<'_, Arc<ConversionEngine>>,
    job_id: String,
) -> Result<(), String> {
    let uuid = uuid::Uuid::parse_str(&job_id)
        .map_err(|e| format!("Invalid job ID: {}", e))?;

    engine.cancel_job(&uuid)
        .await
        .map_err(|e| e.to_string())
}

/// Get supported conversion formats
#[tauri::command]
pub async fn get_supported_conversions() -> Result<Vec<(String, Vec<String>)>, String> {
    Ok(vec![
        ("txt".to_string(), vec!["epub".to_string()]),
        ("html".to_string(), vec!["epub".to_string(), "txt".to_string()]),
        ("mobi".to_string(), vec!["epub".to_string()]),
        ("azw3".to_string(), vec!["epub".to_string()]),
        ("docx".to_string(), vec!["epub".to_string(), "txt".to_string()]),
        ("fb2".to_string(), vec!["epub".to_string(), "txt".to_string()]),
    ])
}
