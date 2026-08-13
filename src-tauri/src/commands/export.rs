use crate::error::Result;
use crate::models::ExportOptions;
use crate::services::export_service::{self, ExportFormat};
use crate::AppState;
use std::path::{Component, Path, PathBuf};
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
        include_shelves: options.include_shelves,
        include_reading_progress: options.include_reading_progress,
        file_path: options.file_path,
    };

    export_service::export_library(db, export_opts)
}

/// Validate a save path for `write_text_to_file` (finding S-02).
///
/// The path must end in a single clean file-name segment: no NUL bytes, no
/// `.`/`..` components (checked both via `Path::components()` and on the raw
/// split, since `components()` normalizes away interior `.` segments), and no
/// trailing separator. Absolute/relative paths, dot-directories (e.g. `.ssh`),
/// any number of parent dirs, any extension, and Windows drive prefixes are
/// allowed — parents are created by the caller.
fn validate_export_path(file_path: &str) -> Result<()> {
    if file_path.contains('\0') {
        return Err(crate::error::ShioriError::Validation(
            "file_path contains a NUL byte".to_string(),
        ));
    }

    let path = Path::new(file_path);
    for component in path.components() {
        if matches!(component, Component::CurDir | Component::ParentDir) {
            return Err(crate::error::ShioriError::Validation(
                "file_path contains invalid path segments".to_string(),
            ));
        }
    }

    // Normalize `\` -> `/` so Windows-style separators are handled
    // identically on every platform.
    let normalized = file_path.replace('\\', "/");

    for segment in normalized.split('/') {
        if segment == "." || segment == ".." {
            return Err(crate::error::ShioriError::Validation(
                "file_path contains invalid path segments".to_string(),
            ));
        }
    }

    // The file name (last segment) must be a single clean name: reject
    // trailing separators (`dir/`, `x/y/`) and paths with no file name at
    // all (``, `/`).
    if normalized.ends_with('/') {
        return Err(crate::error::ShioriError::Validation(
            "file_path must end with a file name, not a path separator".to_string(),
        ));
    }
    if normalized.rsplit('/').next().unwrap_or("").is_empty() {
        return Err(crate::error::ShioriError::Validation(
            "file_path must end with a valid file name".to_string(),
        ));
    }

    Ok(())
}

/// Write arbitrary text content to a user-selected file path.
/// Used by the annotation export dialog's "Save to File" button.
#[tauri::command]
pub fn write_text_to_file(file_path: String, contents: String) -> Result<()> {
    validate_export_path(&file_path)?;

    let path = PathBuf::from(&file_path);

    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(crate::error::ShioriError::Io)?;
        }
    }

    std::fs::write(&path, contents).map_err(crate::error::ShioriError::Io)?;

    Ok(())
}

#[cfg(test)]
mod validate_export_path_tests {
    use super::*;

    #[test]
    fn accepts_legitimate_save_paths() {
        // Native save-dialog style paths: absolute, Windows, relative, nested.
        assert!(validate_export_path("/home/u/Documents/x.md").is_ok());
        assert!(validate_export_path("C:\\Users\\u\\x.txt").is_ok());
        assert!(validate_export_path("x.md").is_ok());
        assert!(validate_export_path("/tmp/sub/dir/y.json").is_ok());
        // A save dialog may legitimately target a dot-directory like .ssh.
        assert!(validate_export_path("/home/u/.ssh/authorized_keys").is_ok());
        // Any number of parent dirs with a clean last segment is fine.
        assert!(validate_export_path("x/y").is_ok());
    }

    #[test]
    fn rejects_traversal_and_dot_components() {
        assert!(validate_export_path("a/../b.txt").is_err());
        assert!(validate_export_path("..").is_err());
        assert!(validate_export_path(".").is_err());
        assert!(validate_export_path("a/./b.txt").is_err());
        assert!(validate_export_path("..\\x.txt").is_err());
    }

    #[test]
    fn rejects_empty_paths_and_root_only_paths() {
        assert!(validate_export_path("").is_err());
        assert!(validate_export_path("/").is_err());
        assert!(validate_export_path("C:\\").is_err());
    }

    #[test]
    fn rejects_nul_bytes() {
        assert!(validate_export_path("x.md\0").is_err());
        assert!(validate_export_path("a\0/b.txt").is_err());
    }

    #[test]
    fn file_name_must_be_a_single_clean_segment() {
        // "x/y" has a clean last segment -> accepted...
        assert!(validate_export_path("x/y").is_ok());
        // ...but a trailing separator leaves no clean file name.
        assert!(validate_export_path("x/y/").is_err());
        assert!(validate_export_path("x/y\\").is_err());
        assert!(validate_export_path("dir/").is_err());
        assert!(validate_export_path("dir\\").is_err());
    }

    #[test]
    fn traversal_error_message_is_stable() {
        let err = validate_export_path("a/../b.txt").unwrap_err();
        assert_eq!(
            err.to_string(),
            "Validation error: file_path contains invalid path segments"
        );
    }

    #[test]
    fn command_rejects_bad_paths_before_any_fs_access() {
        // Validation runs before create_dir_all/fs::write, so these must
        // fail without touching the file system.
        assert!(write_text_to_file("../evil.txt".to_string(), "x".to_string()).is_err());
        assert!(write_text_to_file("/tmp/evil\0.txt".to_string(), "x".to_string()).is_err());
    }
}
