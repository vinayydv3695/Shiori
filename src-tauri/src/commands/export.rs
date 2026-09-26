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
/// trailing separator. Absolute/relative paths, dot-directories, any number
/// of parent dirs, any extension, and Windows drive prefixes are allowed —
/// but the parent directory must already exist: `write_text_to_file` never
/// creates directories, and paths under well-known sensitive home dot-dirs
/// (`~/.ssh`, `~/.gnupg`, `~/.config`) are refused.
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

    // The parent directory must already exist. A native save dialog only
    // ever returns a path inside an existing, user-picked directory, so we
    // never create directories on the webview's behalf — a compromised
    // webview could otherwise fabricate `~/.ssh`, `~/.config`, etc. out of
    // thin air. Relative paths with no parent segment write to the cwd.
    let parent = path.parent().filter(|p| !p.as_os_str().is_empty());
    if let Some(parent) = parent {
        if !parent.is_dir() {
            return Err(crate::error::ShioriError::Validation(format!(
                "parent directory does not exist: {}",
                parent.display()
            )));
        }
    }

    // Defense-in-depth for a compromised webview: refuse paths under
    // well-known sensitive dot-dirs of the user's home (SSH keys, GPG
    // keyrings, editor configs). Lexical check — save dialogs only produce
    // absolute paths, and the parent-exists check above keeps this honest.
    if is_sensitive_dest(&path) {
        return Err(crate::error::ShioriError::Validation(
            "refusing to write into a sensitive directory (~/.ssh, ~/.gnupg, ~/.config)"
                .to_string(),
        ));
    }

    std::fs::write(&path, contents).map_err(crate::error::ShioriError::Io)?;

    Ok(())
}

/// True when `path` resolves into one of the well-known sensitive
/// dot-directories of the user's home (`~/.ssh`, `~/.gnupg`, `~/.config`).
/// Case-insensitive so it also catches Windows spellings of those names.
fn is_sensitive_dest(path: &Path) -> bool {
    let Some(home) = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
    else {
        return false;
    };
    let Ok(rest) = path.strip_prefix(&home) else {
        return false;
    };
    matches!(
        rest.components().next(),
        Some(Component::Normal(seg))
            if matches!(seg.to_string_lossy().to_ascii_lowercase().as_str(), ".ssh" | ".gnupg" | ".config")
    )
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
        // Any number of existing parent dirs with a clean last segment is fine.
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
        // Validation runs before the parent-exists check and fs::write, so
        // these must fail without touching the file system.
        assert!(write_text_to_file("../evil.txt".to_string(), "x".to_string()).is_err());
        assert!(write_text_to_file("/tmp/evil\0.txt".to_string(), "x".to_string()).is_err());
    }

    #[test]
    fn write_rejects_paths_whose_parent_does_not_exist() {
        // No create_dir_all: a missing parent must fail the write.
        let dir = std::env::temp_dir().join(format!("shiori-export-s02-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let err = write_text_to_file(
            dir.join("x.md").to_string_lossy().into_owned(),
            "x".to_string(),
        )
        .unwrap_err();
        assert!(
            err.to_string().contains("parent directory does not exist"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn write_succeeds_when_parent_exists() {
        let dir = std::env::temp_dir().join(format!("shiori-export-s02-ok-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("notes.md");
        write_text_to_file(target.to_string_lossy().into_owned(), "hello".to_string()).unwrap();
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "hello");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sensitive_dest_detects_home_dot_dirs() {
        let Some(home) = std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(PathBuf::from)
        else {
            return;
        };
        for dir in [".ssh", ".gnupg", ".config"] {
            assert!(
                is_sensitive_dest(&home.join(dir).join("x.txt")),
                "{dir} should be sensitive"
            );
        }
        // Case-insensitive spelling.
        assert!(is_sensitive_dest(&home.join(".SSH").join("x.txt")));
        // Non-sensitive controls.
        assert!(!is_sensitive_dest(&home.join("Documents").join("x.md")));
        assert!(!is_sensitive_dest(Path::new("/elsewhere/x.md")));
    }
}
