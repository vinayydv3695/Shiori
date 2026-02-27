use crate::error::Result;
use crate::models::ExportOptions;
use crate::services::export_service::{self, ExportFormat};
use crate::AppState;
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
