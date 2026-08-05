//! Library root resolution.
//!
//! The library root is the directory Shiori treats as home for its managed
//! books. Two modes, selected by the `library_mode` preference (id=1):
//!
//! - `app` (default, Mode A): `app_data_dir/Library`.
//! - `saf` (Mode B, Android only): a user-chosen durable folder behind a
//!   SAF tree URI (`ACTION_OPEN_DOCUMENT_TREE`). Managed files survive
//!   uninstall. Cheap filesystem ops still run against a local mirror at
//!   `app_data_dir/Library` (see [`ManagedRoot::Saf`]); the tree itself is
//!   the durable copy.
//!
//! The `library_mode`/`library_root_uri` columns are added by migration v44
//! and are always present at runtime.

use std::path::{Path, PathBuf};

use crate::db::Database;
use crate::error::Result;

/// Where managed books live, resolved from preferences.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManagedRoot {
    /// Mode A — app-private directory (`app_data_dir/Library`).
    AppDir(PathBuf),
    /// Mode B — user-chosen SAF tree. `local_cache` is the app-private
    /// mirror used for cheap fs ops (reads, hashing, metadata); `uri` is
    /// the persisted tree URI the durable copy lives under.
    Saf { uri: String, local_cache: PathBuf },
}

impl ManagedRoot {
    /// The local filesystem path usable for cheap fs operations in both
    /// modes (Mode A is its own root; Mode B uses the local mirror).
    pub fn local_path(&self) -> &Path {
        match self {
            ManagedRoot::AppDir(p) => p,
            ManagedRoot::Saf { local_cache, .. } => local_cache,
        }
    }
}

/// Resolve the managed-library root.
///
/// Reads `library_mode`/`library_root_uri` from `user_preferences` (id=1)
/// with COALESCE defaults. The columns are guaranteed by migration v44, but
/// a failed read still falls back to Mode A so an exotic DB can never brick
/// library resolution.
///
/// - `app`: `app_data_dir/Library`, created if missing.
/// - `saf` with a URI: the local mirror dir, created if missing.
/// - `saf` with an empty URI (hand-edited DB): warn + Mode A fallback.
pub fn resolve_managed_root(db: &Database, app_data_dir: &Path) -> Result<ManagedRoot> {
    let conn = db.get_connection()?;

    let (mode, root_uri) = conn
        .query_row(
            "SELECT COALESCE(library_mode, 'app'), COALESCE(library_root_uri, '')
             FROM user_preferences WHERE id = 1",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        // Defensive: if the columns are somehow missing, behave as Mode A.
        .unwrap_or(("app".to_string(), String::new()));

    match mode.as_str() {
        "saf" if !root_uri.is_empty() => Ok(ManagedRoot::Saf {
            uri: root_uri,
            local_cache: app_library_dir(app_data_dir)?,
        }),
        "saf" => {
            log::warn!(
                "[LibraryRoot] SAF mode requested with an empty root URI; \
                 falling back to the app Library directory"
            );
            Ok(ManagedRoot::AppDir(app_library_dir(app_data_dir)?))
        }
        _ => Ok(ManagedRoot::AppDir(app_library_dir(app_data_dir)?)),
    }
}

/// Resolve the local filesystem path of the library root.
///
/// Returns the Mode A directory, or the Mode B local mirror path (the SAF
/// tree itself is not a plain filesystem path). Kept for callers that only
/// need a `PathBuf` (existing delete/ingest code); SAF-aware callers should
/// use [`resolve_managed_root`] to reach the tree URI.
pub fn resolve_library_root(db: &Database, app_data_dir: &Path) -> Result<PathBuf> {
    Ok(resolve_managed_root(db, app_data_dir)?.local_path().to_path_buf())
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
