//! Library root resolution.
//!
//! The library root is the directory Shiori treats as home for its managed
//! books (Slice 0 ships Mode A — an app-data `Library` dir). SAF routing
//! arrives in a later slice.

use std::path::{Path, PathBuf};

use crate::db::Database;
use crate::error::Result;

/// Resolve the library root directory.
///
/// Reads `library_mode` and `library_root_uri` from `user_preferences`
/// (id=1) with COALESCE defaults. The columns may not exist until a later
/// slice, so a failed read falls back to the defaults (`app` mode) via
/// `query_row`'s `.unwrap_or`.
///
/// - `app` (default): `app_data_dir.join("Library")`, created if missing.
/// - `saf` with a URI: for now logs a warning and falls back to Mode A.
pub fn resolve_library_root(db: &Database, app_data_dir: &Path) -> Result<PathBuf> {
    let conn = db.get_connection()?;

    let (mode, root_uri) = conn
        .query_row(
            "SELECT COALESCE(library_mode, 'app'), COALESCE(library_root_uri, '')
             FROM user_preferences WHERE id = 1",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        // Columns may not exist until a later slice — fall back to Mode A.
        .unwrap_or(("app".to_string(), String::new()));

    match mode.as_str() {
        "saf" if !root_uri.is_empty() => {
            // ponytail: real SAF routing is slice 3 — for now fall back to Mode A.
            log::warn!(
                "[LibraryRoot] SAF mode requested ({}) but not yet supported; \
                 falling back to the app Library directory (slice 3 will route via SAF)",
                root_uri
            );
            app_library_dir(app_data_dir)
        }
        _ => app_library_dir(app_data_dir),
    }
}

fn app_library_dir(app_data_dir: &Path) -> Result<PathBuf> {
    let dir = app_data_dir.join("Library");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn resolve_library_root_mode_a_creates_library_dir() {
        let tmp = tempdir().unwrap();
        let db = Database::new(&tmp.path().join("test.db")).unwrap();

        let root = resolve_library_root(&db, tmp.path()).unwrap();

        assert_eq!(root, tmp.path().join("Library"));
        assert!(root.is_dir());
    }
}
