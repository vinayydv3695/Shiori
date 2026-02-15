use crate::services::metadata_service;
use crate::{error::Result, models::Metadata};

#[tauri::command]
pub fn extract_metadata(file_path: String) -> Result<Metadata> {
    metadata_service::extract_from_file(&file_path)
}
