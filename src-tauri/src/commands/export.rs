use crate::error::Result;
use crate::models::ExportOptions;
use crate::services::export_service::{self, ExportFormat};
use crate::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub fn export_library(state: State<AppState>, options: ExportOptions) -> Result<String> {
    let db = &state.db;

    // Convert string format to enum
    let format = match options.format.to_lowercase().as_str() {
        "csv" => ExportFormat::Csv,
        "json" => ExportFormat::Json,
        "markdown" | "md" => ExportFormat::Markdown,
        _ => {
            return Err(crate::error::ShioriError::InvalidOperation(format!(
                "Unsupported export format: {}",
                options.format
            )))
        }
    };

    let export_opts = export_service::ExportOptions {
        format,
        include_metadata: options.include_metadata,
        include_collections: options.include_collections,
        include_reading_progress: options.include_reading_progress,
        file_path: options.file_path,
    };

    export_service::export_library(&db, export_opts)
}

/// Write arbitrary text content to a user-selected file path.
/// Used by the annotation export dialog's "Save to File" button.
#[tauri::command]
pub fn write_text_to_file(file_path: String, contents: String) -> Result<()> {
    let path = PathBuf::from(&file_path);

    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| crate::error::ShioriError::Io(e))?;
        }
    }

    std::fs::write(&path, contents).map_err(|e| crate::error::ShioriError::Io(e))?;

    Ok(())
}
