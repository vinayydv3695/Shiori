use crate::db::Database;
use crate::error::{Result, ShioriError};
use crate::models::{
    BackupCategory, BackupSelection, ConflictPolicy, RestoreReport, RestoreSelection,
};
use chrono::Utc;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;
use tempfile::TempDir;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

const BACKUP_VERSION: &str = "2.0";
const SCHEMA_VERSION: u32 = 2;
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Backup manifest.
///
/// `#[serde(default)]` makes restore forward- and backward-compatible across app
/// versions: a field added in a newer app is filled with its default when an
/// older backup lacks it, and serde already ignores unknown fields, so a backup
/// written by a newer app still restores on an older one. Either way, changing
/// this struct never makes an existing backup unreadable.
///
/// A v1 manifest (no `schema_version`/`categories`) is treated as an Everything
/// backup: `categories` defaults to empty and restore maps that to all eight
/// categories.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct BackupInfo {
    pub version: String,
    pub created_at: String,
    pub app_version: String,
    pub book_count: usize,
    pub annotation_count: usize,
    pub shelf_count: usize,
    pub includes_books: bool,
    pub total_size_bytes: u64,
    // v2 fields — all defaulted so v1 manifests still parse.
    pub schema_version: u32,
    /// Included category names (snake_case). Empty = Everything (v1 or legacy
    /// full snapshot written before categories existed).
    pub categories: Vec<String>,
    /// Per-category counts of exported rows/files.
    pub category_counts: HashMap<String, u64>,
    /// Book files that could not be resolved at backup time (missing on disk).
    pub skipped_files: Vec<String>,
    /// uuid → zip entry name for book files in subset backups (Books category).
    pub book_files: HashMap<String, String>,
}

/// Column names of `table` within the given attached `schema` ("main" for the
/// live DB, "backup_db" for the attached backup), in column order.
fn table_columns(conn: &rusqlite::Connection, schema: &str, table: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(&format!("PRAGMA {}.table_info({})", schema, table))?;
    // PRAGMA table_info columns: (cid, name, type, notnull, dflt_value, pk).
    let cols = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(cols)
}

// ─── Category → table mapping ────────────────────────────────────────────────

/// Tables belonging to a category, in restore-safe order (parents first).
fn category_tables(cat: BackupCategory) -> &'static [&'static str] {
    match cat {
        BackupCategory::Library => &[
            "books",
            "authors",
            "books_authors",
            "tags",
            "books_tags",
            "book_formats",
            "shelves",
            "shelf_books",
        ],
        BackupCategory::Annotations => &["annotation_categories", "annotations"],
        BackupCategory::Progress => &["reading_progress", "reading_sessions"],
        BackupCategory::Preferences => &["user_preferences"],
        BackupCategory::Sources => &[],
        BackupCategory::Rss => &["rss_feeds", "rss_settings", "rss_articles"],
        BackupCategory::Covers => &[],
        BackupCategory::Books => &[],
    }
}

/// Tables restored by the legacy full-snapshot path (everything archive).
///
/// This is the exact list the pre-selective backup code restored
/// unconditionally. Several tables here have NO category mapping (reading_goals,
/// shares, share_access_log, conversion_jobs, conversion_profiles, cover_cache,
/// book_preference_overrides, manga_preference_overrides, library_settings,
/// conversion_settings, onboarding_state, metadata_cache, doodles,
/// tts_preferences) — an Everything restore must iterate this list unfiltered or
/// those orphans are silently dropped. `tts_preferences` is not a real table
/// (v12 only added TTS columns to user_preferences); it is skipped by the
/// table-exists check, same as in the baseline.
pub const FULL_TABLES: &[&str] = &[
    "books",
    "authors",
    "books_authors",
    "tags",
    "books_tags",
    "book_formats",
    "reading_progress",
    "annotations",
    "annotation_categories",
    "reading_sessions",
    "reading_goals",
    "rss_feeds",
    "rss_articles",
    "shares",
    "share_access_log",
    "conversion_jobs",
    "conversion_profiles",
    "cover_cache",
    "user_preferences",
    "book_preference_overrides",
    "manga_preference_overrides",
    "library_settings",
    "rss_settings",
    "conversion_settings",
    "onboarding_state",
    "metadata_cache",
    "doodles",
    "tts_preferences",
    "shelves",
    "shelf_books",
];

// ─── Partial-write guard ──────────────────────────────────────────────────────

/// Backups are written to `<dest>.part` and renamed over the destination only
/// on success. On ANY error path (including panics) this guard removes the
/// partial file, so a failed backup never leaves a truncated zip at the
/// destination path.
struct PartFileGuard {
    path: PathBuf,
    committed: bool,
}

impl PartFileGuard {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            committed: false,
        }
    }

    /// Mark the part as published (renamed over the destination); Drop no
    /// longer removes it.
    fn commit(&mut self) {
        self.committed = true;
    }
}

impl Drop for PartFileGuard {
    fn drop(&mut self) {
        if !self.committed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

// ─── Value conversion helpers ────────────────────────────────────────────────

fn sql_value_to_json(v: rusqlite::types::Value) -> Option<Value> {
    match v {
        rusqlite::types::Value::Null => Some(Value::Null),
        rusqlite::types::Value::Integer(i) => Some(Value::from(i)),
        rusqlite::types::Value::Real(f) => Some(Value::from(f)),
        rusqlite::types::Value::Text(s) => Some(Value::String(s)),
        rusqlite::types::Value::Blob(_) => None, // no blob columns in category tables
    }
}

fn json_to_sql(v: &Value) -> rusqlite::types::Value {
    match v {
        Value::Null => rusqlite::types::Value::Null,
        Value::Bool(b) => rusqlite::types::Value::Integer(*b as i64),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                rusqlite::types::Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                rusqlite::types::Value::Real(f)
            } else {
                rusqlite::types::Value::Null
            }
        }
        Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        other => rusqlite::types::Value::Text(other.to_string()),
    }
}

fn quote_col(c: &str) -> String {
    format!("\"{}\"", c.replace('"', "\"\""))
}

/// Read every row of `table` as a JSON object keyed by column name.
fn export_table_rows(conn: &rusqlite::Connection, table: &str) -> Result<Vec<Map<String, Value>>> {
    let cols = table_columns(conn, "main", table)?;
    let col_list = cols.iter().map(|c| quote_col(c)).collect::<Vec<_>>().join(", ");
    let mut stmt = conn.prepare(&format!("SELECT {col_list} FROM main.{table}"))?;
    let mut rows = stmt.query([])?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut m = Map::new();
        for (i, c) in cols.iter().enumerate() {
            let v: rusqlite::types::Value = row.get(i)?;
            if let Some(jv) = sql_value_to_json(v) {
                m.insert(c.clone(), jv);
            }
        }
        out.push(m);
    }
    Ok(out)
}

/// Add `_book_uuid` / `_book_hash` link keys to rows referencing `book_id_col`.
fn add_book_links(
    conn: &rusqlite::Connection,
    rows: &mut [Map<String, Value>],
    book_id_col: &str,
) -> Result<()> {
    let mut stmt = conn.prepare("SELECT id, uuid, file_hash FROM books")?;
    let map: HashMap<i64, (String, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, (row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?)))
        })?
        .collect::<std::result::Result<_, _>>()?;
    for row in rows {
        if let Some(id) = row.get(book_id_col).and_then(|v| v.as_i64()) {
            if let Some((uuid, hash)) = map.get(&id) {
                row.insert("_book_uuid".to_string(), Value::String(uuid.clone()));
                if let Some(h) = hash {
                    row.insert("_book_hash".to_string(), Value::String(h.clone()));
                }
            }
        }
    }
    Ok(())
}

/// Add `_author_name` link keys (id → name lookup).
fn add_name_links(
    conn: &rusqlite::Connection,
    rows: &mut [Map<String, Value>],
    id_col: &str,
    table: &str,
    name_col: &str,
    link_key: &str,
) -> Result<()> {
    let mut stmt = conn.prepare(&format!("SELECT id, {name_col} FROM {table}"))?;
    let map: HashMap<i64, String> = stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))?
        .collect::<std::result::Result<_, _>>()?;
    for row in rows {
        if let Some(id) = row.get(id_col).and_then(|v| v.as_i64()) {
            if let Some(name) = map.get(&id) {
                row.insert(link_key.to_string(), Value::String(name.clone()));
            }
        }
    }
    Ok(())
}

// ─── create_backup ───────────────────────────────────────────────────────────

/// Create a backup honoring the given selection. Empty (or all-eight)
/// categories take the legacy full-snapshot fast path.
pub fn create_backup(
    db: &Database,
    app_data_dir: &Path,
    backup_path: &Path,
    selection: &BackupSelection,
    frontend_settings_json: Option<&str>,
) -> Result<BackupInfo> {
    let mut cats: HashSet<BackupCategory> = selection.categories.iter().copied().collect();
    if selection.include_books {
        cats.insert(BackupCategory::Books);
    }
    let is_everything = cats.is_empty() || cats.len() == BackupCategory::ALL.len();
    let include_books = selection.include_books || cats.contains(&BackupCategory::Books);

    if is_everything {
        create_full_backup(db, app_data_dir, backup_path, include_books, frontend_settings_json)
    } else {
        create_subset_backup(
            db,
            app_data_dir,
            backup_path,
            &cats,
            selection.include_credentials,
            selection.frontend_settings,
            frontend_settings_json,
        )
    }
}

/// True for SQLITE_BUSY / SQLITE_LOCKED — transient lock errors that a short
/// retry can ride out (another pool connection mid-transaction).
fn is_transient_lock(e: &rusqlite::Error) -> bool {
    matches!(
        e.sqlite_error_code(),
        Some(rusqlite::ErrorCode::DatabaseBusy | rusqlite::ErrorCode::DatabaseLocked)
    )
}

/// Legacy fast path: `VACUUM INTO` snapshot + covers + optional books +
/// optional frontend settings. Manifest is stamped v2 with all categories.
fn create_full_backup(
    db: &Database,
    app_data_dir: &Path,
    backup_path: &Path,
    include_books: bool,
    frontend_settings_json: Option<&str>,
) -> Result<BackupInfo> {
    let conn = db.get_connection()?;

    let temp_dir = TempDir::new()
        .map_err(|e| ShioriError::Other(format!("Failed to create temp directory: {}", e)))?;
    let temp_db_path = temp_dir.path().join("library.db");

    // VACUUM INTO can hit SQLITE_BUSY/LOCKED when another pool connection is
    // mid-transaction (background sync, reading progress, RSS refresh, ...).
    // busy_timeout only covers BUSY — retry both for a short while first.
    let vacuum_sql = format!(
        "VACUUM INTO '{}'",
        temp_db_path.display().to_string().replace('\'', "''")
    );
    let mut attempt = 0;
    loop {
        match conn.execute_batch(&vacuum_sql) {
            Ok(()) => break,
            Err(e) if is_transient_lock(&e) && attempt < 5 => {
                attempt += 1;
                thread::sleep(Duration::from_millis(200 * attempt));
            }
            Err(e) => return Err(e.into()),
        }
    }

    let book_count: usize = conn.query_row("SELECT COUNT(*) FROM books", [], |row| row.get(0))?;
    let annotation_count: usize =
        conn.query_row("SELECT COUNT(*) FROM annotations", [], |row| row.get(0))?;
    let shelf_count: usize =
        conn.query_row("SELECT COUNT(*) FROM shelves", [], |row| row.get(0))?;

    // Write to `<dest>.part`, rename on success (see PartFileGuard).
    let part_path = backup_path.with_extension("part");
    let mut part_guard = PartFileGuard::new(part_path.clone());
    let zip_file = File::create(&part_path)?;
    let buf_writer = BufWriter::new(zip_file);
    let mut zip = ZipWriter::new(buf_writer);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut total_size: u64 = 0;
    let mut skipped_files: Vec<String> = Vec::new();

    zip.start_file("database/library.db", options)?;
    let mut db_file = File::open(&temp_db_path)?;
    total_size += std::io::copy(&mut db_file, &mut zip)?;

    let covers_dir = app_data_dir.join("covers");
    let mut cover_count: u64 = 0;
    if covers_dir.exists() {
        for entry in WalkDir::new(&covers_dir).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                if let Ok(relative) = path.strip_prefix(&covers_dir) {
                    let zip_path = format!("covers/{}", relative.display());
                    // Cover being replaced/removed mid-backup: skip it,
                    // don't abort the whole backup.
                    if let Ok(mut file) = File::open(path) {
                        zip.start_file(&zip_path, options)?;
                        total_size += std::io::copy(&mut file, &mut zip)?;
                        cover_count += 1;
                    }
                }
            }
        }
    }

    let mut book_file_count: u64 = 0;
    if include_books {
        let mut stmt = conn.prepare("SELECT file_path FROM books")?;
        let paths: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        for file_path in paths {
            let book_path = Path::new(&file_path);
            if book_path.exists() && book_path.is_file() {
                if let Some(filename) = book_path.file_name() {
                    let zip_path = format!("books/{}", filename.to_string_lossy());
                    match File::open(book_path) {
                        Ok(mut file) => {
                            zip.start_file(&zip_path, options)?;
                            total_size += std::io::copy(&mut file, &mut zip)?;
                            book_file_count += 1;
                        }
                        // In-use or unreadable file (Windows lock, in-progress
                        // download, moved on disk): skip it, don't abort the
                        // whole backup. Recorded in the manifest.
                        Err(_) => skipped_files.push(file_path.clone()),
                    }
                }
            } else {
                skipped_files.push(file_path);
            }
        }
    }

    if let Some(settings_json) = frontend_settings_json {
        zip.start_file("settings/frontend_settings.json", options)?;
        zip.write_all(settings_json.as_bytes())?;
        total_size += settings_json.len() as u64;
    }

    let mut category_counts = HashMap::new();
    category_counts.insert("library".to_string(), book_count as u64);
    category_counts.insert("annotations".to_string(), annotation_count as u64);
    category_counts.insert("progress".to_string(), 0);
    category_counts.insert("preferences".to_string(), 1);
    category_counts.insert("sources".to_string(), 0);
    category_counts.insert("rss".to_string(), 0);
    category_counts.insert("covers".to_string(), cover_count);
    category_counts.insert("books".to_string(), book_file_count);

    let backup_info = BackupInfo {
        version: BACKUP_VERSION.to_string(),
        created_at: Utc::now().to_rfc3339(),
        app_version: APP_VERSION.to_string(),
        book_count,
        annotation_count,
        shelf_count,
        includes_books: include_books,
        total_size_bytes: total_size,
        schema_version: SCHEMA_VERSION,
        categories: BackupCategory::ALL.iter().map(|c| c.as_str().to_string()).collect(),
        category_counts,
        skipped_files,
        book_files: HashMap::new(),
    };

    let manifest_json = serde_json::to_string_pretty(&backup_info)?;
    zip.start_file("manifest.json", options)?;
    zip.write_all(manifest_json.as_bytes())?;

    zip.finish()?;
    let _ = fs::remove_file(backup_path);
    fs::rename(&part_path, backup_path)?;
    part_guard.commit();
    Ok(backup_info)
}

/// Selective path: one `category_<name>.json` per category + covers/* + books/*
/// + optional settings. No `database/library.db` — restore is per-category.
#[allow(clippy::too_many_arguments)]
fn create_subset_backup(
    db: &Database,
    app_data_dir: &Path,
    backup_path: &Path,
    cats: &HashSet<BackupCategory>,
    include_credentials: bool,
    include_frontend_settings: bool,
    frontend_settings_json: Option<&str>,
) -> Result<BackupInfo> {
    let conn = db.get_connection()?;

    // Write to `<dest>.part`, rename on success (see PartFileGuard).
    let part_path = backup_path.with_extension("part");
    let mut part_guard = PartFileGuard::new(part_path.clone());
    let zip_file = File::create(&part_path)?;
    let buf_writer = BufWriter::new(zip_file);
    let mut zip = ZipWriter::new(buf_writer);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut total_size: u64 = 0;
    let mut category_counts: HashMap<String, u64> = HashMap::new();
    let mut skipped_files: Vec<String> = Vec::new();
    let mut book_files: HashMap<String, String> = HashMap::new();
    let mut book_count = 0usize;
    let mut annotation_count = 0usize;
    let mut shelf_count = 0usize;

    // Per-category JSON exports.
    for cat in BackupCategory::ALL.iter() {
        if !cats.contains(cat) {
            continue;
        }
        match cat {
            BackupCategory::Covers | BackupCategory::Books | BackupCategory::Sources => continue,
            _ => {}
        }
        let json = export_category_json(&conn, *cat, include_credentials)?;
        let rows: usize = json
            .get("tables")
            .and_then(|t| t.as_object())
            .map(|t| t.values().map(|v| v.as_array().map_or(0, |a| a.len())).sum())
            .unwrap_or(0);
        let entry = format!("category_{}.json", cat.as_str());
        let size = write_json_entry(&mut zip, &entry, &json)?;
        total_size += size;
        category_counts.insert(cat.as_str().to_string(), rows as u64);
        match cat {
            BackupCategory::Library => {
                if let Some(tables) = json.get("tables").and_then(|t| t.as_object()) {
                    book_count = tables
                        .get("books")
                        .and_then(|v| v.as_array())
                        .map_or(0, |a| a.len());
                    shelf_count = tables
                        .get("shelves")
                        .and_then(|v| v.as_array())
                        .map_or(0, |a| a.len());
                }
            }
            BackupCategory::Annotations => annotation_count = rows,
            _ => {}
        }
    }

    // Sources: sources.json store (redacted unless include_credentials) +
    // Cloudflare session files (only with include_credentials — they are
    // pure credentials).
    if cats.contains(&BackupCategory::Sources) {
        if let Some((json, session_files)) = export_sources(app_data_dir, include_credentials)? {
            let size = write_json_entry(&mut zip, "category_sources.json", &json)?;
            total_size += size;
            let mut count = 1u64;
            for (entry, src) in session_files {
                if let Ok(mut file) = File::open(&src) {
                    zip.start_file(&entry, options)?;
                    total_size += std::io::copy(&mut file, &mut zip)?;
                    count += 1;
                }
            }
            category_counts.insert("sources".to_string(), count);
        }
    }

    // Covers tree.
    let mut cover_count: u64 = 0;
    if cats.contains(&BackupCategory::Covers) {
        let covers_dir = app_data_dir.join("covers");
        if covers_dir.exists() {
            for entry in WalkDir::new(&covers_dir).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_file() {
                    if let Ok(relative) = path.strip_prefix(&covers_dir) {
                        let zip_path = format!("covers/{}", relative.display());
                        zip.start_file(&zip_path, options)?;
                        let mut file = File::open(path)?;
                        total_size += std::io::copy(&mut file, &mut zip)?;
                        cover_count += 1;
                    }
                }
            }
        }
        category_counts.insert("covers".to_string(), cover_count);
    }

    // Book files: managed books resolve via the managed root, referenced books
    // use their absolute file_path. Unresolvable paths are recorded in the
    // manifest and skipped, not fatal.
    if cats.contains(&BackupCategory::Books) {
        let managed_root = crate::services::library_root::resolve_managed_root(db, app_data_dir)?;
        let mut stmt = conn.prepare(
            "SELECT uuid, file_path, is_managed, managed_relpath, file_format FROM books",
        )?;
        let books = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, bool>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let mut book_file_count: u64 = 0;
        for (uuid, file_path, is_managed, managed_relpath, _file_format) in books {
            let resolved: Option<PathBuf> = if is_managed {
                managed_relpath
                    .map(|rel| managed_root.local_path().join(rel))
            } else {
                Some(PathBuf::from(&file_path))
            };
            let Some(resolved) = resolved else {
                skipped_files.push(file_path.clone());
                continue;
            };
            if !resolved.exists() || !resolved.is_file() {
                skipped_files.push(file_path);
                continue;
            }
            let ext = resolved
                .extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_default();
            let entry = format!("books/{uuid}.{ext}");
            if let Ok(mut file) = File::open(&resolved) {
                zip.start_file(&entry, options)?;
                total_size += std::io::copy(&mut file, &mut zip)?;
                book_files.insert(uuid, entry);
                book_file_count += 1;
            } else {
                skipped_files.push(file_path);
            }
        }
        category_counts.insert("books".to_string(), book_file_count);
    }

    // Frontend settings blob (Preferences-adjacent, controlled by its own flag).
    if include_frontend_settings {
        if let Some(settings_json) = frontend_settings_json {
            zip.start_file("settings/frontend_settings.json", options)?;
            zip.write_all(settings_json.as_bytes())?;
            total_size += settings_json.len() as u64;
        }
    }

    let backup_info = BackupInfo {
        version: BACKUP_VERSION.to_string(),
        created_at: Utc::now().to_rfc3339(),
        app_version: APP_VERSION.to_string(),
        book_count,
        annotation_count,
        shelf_count,
        includes_books: cats.contains(&BackupCategory::Books),
        total_size_bytes: total_size,
        schema_version: SCHEMA_VERSION,
        categories: BackupCategory::ALL
            .iter()
            .filter(|c| cats.contains(c))
            .map(|c| c.as_str().to_string())
            .collect(),
        category_counts,
        skipped_files,
        book_files,
    };

    let manifest_json = serde_json::to_string_pretty(&backup_info)?;
    zip.start_file("manifest.json", options)?;
    zip.write_all(manifest_json.as_bytes())?;

    zip.finish()?;
    let _ = fs::remove_file(backup_path);
    fs::rename(&part_path, backup_path)?;
    part_guard.commit();
    Ok(backup_info)
}

/// JSON for one DB-backed category: `{ version, redacted, tables: { table: [row] } }`.
/// Child rows carry `_book_uuid`/`_book_hash` (and name links) for restore-time
/// re-linking. Credential columns in Preferences are nulled out unless
/// `include_credentials`.
fn export_category_json(
    conn: &rusqlite::Connection,
    cat: BackupCategory,
    include_credentials: bool,
) -> Result<Value> {
    let mut tables = Map::new();
    let mut redacted = false;
    let mut redacted_columns: Vec<String> = Vec::new();

    for table in category_tables(cat) {
        let mut rows = export_table_rows(conn, table)?;
        match *table {
            "books_authors" => {
                add_book_links(conn, &mut rows, "book_id")?;
                add_name_links(conn, &mut rows, "author_id", "authors", "name", "_author_name")?;
            }
            "books_tags" => {
                add_book_links(conn, &mut rows, "book_id")?;
                add_name_links(conn, &mut rows, "tag_id", "tags", "name", "_tag_name")?;
            }
            "book_formats" | "reading_progress" | "reading_sessions" => {
                add_book_links(conn, &mut rows, "book_id")?;
            }
            "annotations" => {
                add_book_links(conn, &mut rows, "book_id")?;
                add_name_links(
                    conn,
                    &mut rows,
                    "category_id",
                    "annotation_categories",
                    "name",
                    "_category_name",
                )?;
            }
            "shelf_books" => {
                add_book_links(conn, &mut rows, "book_id")?;
                add_name_links(conn, &mut rows, "shelf_id", "shelves", "name", "_shelf_name")?;
            }
            "rss_articles" => {
                add_book_links(conn, &mut rows, "epub_book_id")?;
                add_name_links(conn, &mut rows, "feed_id", "rss_feeds", "url", "_feed_url")?;
            }
            "user_preferences" if !include_credentials => {
                // Credential columns (AniList token, Prowlarr key) are secrets:
                // null them out and mark the export redacted.
                for col in ["anilist_token", "prowlarr_api_key"] {
                    if rows.iter().any(|r| r.contains_key(col)) {
                        redacted_columns.push(col.to_string());
                        for r in &mut rows {
                            if let Some(v) = r.get_mut(col) {
                                *v = Value::Null;
                            }
                        }
                    }
                }
                redacted = !redacted_columns.is_empty();
            }
            _ => {}
        }
        tables.insert((*table).to_string(), Value::Array(rows.into_iter().map(Value::Object).collect()));
    }

    let mut obj = Map::new();
    obj.insert("version".to_string(), Value::from(1));
    obj.insert("redacted".to_string(), Value::Bool(redacted));
    if !redacted_columns.is_empty() {
        obj.insert(
            "redacted_columns".to_string(),
            Value::Array(redacted_columns.into_iter().map(Value::String).collect()),
        );
    }
    obj.insert("tables".to_string(), Value::Object(tables));
    Ok(Value::Object(obj))
}

/// Sources config: the `sources.json` tauri-store (credentials removed unless
/// `include_credentials`) plus Cloudflare session files (only ever included
/// with `include_credentials`). Returns (category JSON, [(zip entry, source)]).
fn export_sources(
    app_data_dir: &Path,
    include_credentials: bool,
) -> Result<Option<(Value, Vec<(String, PathBuf)>)>> {
    const CREDENTIAL_KEYS: &[&str] = &["torbox.api_key", "toongod.cf_clearance"];

    let sources_path = app_data_dir.join("sources.json");
    let sessions_dir = app_data_dir.join("cloudflare_sessions");

    if !sources_path.exists() && !sessions_dir.exists() {
        return Ok(None);
    }

    let mut redacted = false;
    let store: Value = if sources_path.exists() {
        let raw = fs::read_to_string(&sources_path)?;
        match serde_json::from_str::<Value>(&raw) {
            Ok(v) => v,
            Err(_) => Value::Object(Map::new()),
        }
    } else {
        Value::Object(Map::new())
    };

    let mut store_obj = store.as_object().cloned().unwrap_or_default();
    if !include_credentials {
        for key in CREDENTIAL_KEYS {
            if store_obj.remove(*key).is_some() {
                redacted = true;
            }
        }
    }

    let mut session_files = Vec::new();
    if include_credentials && sessions_dir.exists() {
        for entry in WalkDir::new(&sessions_dir).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                if let Ok(relative) = path.strip_prefix(&sessions_dir) {
                    session_files.push((
                        format!("sources/cloudflare_sessions/{}", relative.display()),
                        path.to_path_buf(),
                    ));
                }
            }
        }
    } else if sessions_dir.exists() {
        redacted = true;
    }

    let mut obj = Map::new();
    obj.insert("version".to_string(), Value::from(1));
    obj.insert("redacted".to_string(), Value::Bool(redacted));
    obj.insert("store".to_string(), Value::Object(store_obj));
    Ok(Some((Value::Object(obj), session_files)))
}

fn write_json_entry(zip: &mut ZipWriter<BufWriter<File>>, entry: &str, json: &Value) -> Result<u64> {
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let bytes = serde_json::to_vec_pretty(json)?;
    zip.start_file(entry, options)?;
    zip.write_all(&bytes)?;
    Ok(bytes.len() as u64)
}

// ─── restore_backup ──────────────────────────────────────────────────────────

/// Validate an archive entry name for extraction and return the normalized
/// relative path, or `None` when the entry must be skipped: empty names, NUL
/// bytes, `.`/`..` components, absolute paths (RootDir), and Windows prefixes
/// (drive letters / UNC) are all rejected. Backslashes are normalized to
/// forward slashes first, so Windows-style traversal (`covers\..\evil`) is
/// caught even when the archive was stored with `\` separators.
fn safe_archive_rel_path(entry_name: &str) -> Option<PathBuf> {
    if entry_name.is_empty() || entry_name.contains('\0') {
        return None;
    }
    let normalized = entry_name.replace('\\', "/");
    let mut out = PathBuf::new();
    for comp in Path::new(&normalized).components() {
        match comp {
            std::path::Component::Normal(part) => out.push(part),
            std::path::Component::CurDir | std::path::Component::ParentDir => return None,
            std::path::Component::RootDir | std::path::Component::Prefix(_) => return None,
        }
    }
    if out.as_os_str().is_empty() {
        return None;
    }
    Some(out)
}

/// Validate a non-managed book's `file_path` (from the restore manifest) for
/// writing: it must be absolute (RootDir or Windows Prefix present), contain
/// no NUL bytes and no `.`/`..` components, and not be root-only. Returns the
/// path when acceptable. Symlink/containment of the parent is not checked
/// here — callers additionally require the parent directory to already exist
/// on this machine.
fn safe_absolute_restore_path(file_path: &str) -> Option<PathBuf> {
    if file_path.is_empty() || file_path.contains('\0') {
        return None;
    }
    let mut out = PathBuf::new();
    let mut absolute = false;
    let mut has_normal = false;
    for comp in Path::new(file_path).components() {
        match comp {
            std::path::Component::Normal(part) => {
                has_normal = true;
                out.push(part);
            }
            std::path::Component::CurDir | std::path::Component::ParentDir => return None,
            std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                absolute = true;
                out.push(comp.as_os_str());
            }
        }
    }
    if absolute && has_normal {
        Some(out)
    } else {
        None
    }
}

/// True when `rel` is a plain relative path: non-empty, no NUL bytes, and only
/// Normal components (no `.`/`..`, no absolute or Windows-prefix components).
/// Fallback check used when the managed root or the target parent can't be
/// canonicalized.
fn rel_component_safe(rel: &str) -> bool {
    if rel.is_empty() || rel.contains('\0') {
        return false;
    }
    Path::new(rel)
        .components()
        .all(|c| matches!(c, std::path::Component::Normal(_)))
}

/// Validate a managed book's restore target: the canonicalized target parent
/// must live under the canonicalized managed root (canonicalization resolves
/// symlinks, so a relpath that walks out via an existing symlink is caught).
/// When the parent can't be canonicalized because it doesn't exist yet (fresh
/// library), fall back to [`rel_component_safe`] — the managed-root join is
/// then inherently bounded by the root.
fn managed_target_allowed(managed_root: &Path, target: &Path, rel: &str) -> bool {
    let parent = target.parent().unwrap_or(target);
    match (fs::canonicalize(managed_root), fs::canonicalize(parent)) {
        (Ok(root), Ok(parent_canon)) => parent_canon.starts_with(&root),
        _ => rel_component_safe(rel),
    }
}

/// Restore from an archive honoring the selection.
///
/// - Full snapshot archives (`database/library.db` present, i.e. v1 manifests
///   and v2 Everything backups) take the legacy ATTACH-merge path, filtered to
///   the selected categories' tables. The legacy path always replaces rows
///   (delete + insert) regardless of `conflict_policy`, preserving today's
///   "restore = replace" semantics for full backups.
/// - Subset archives restore the per-category JSON with the conflict policy.
pub fn restore_backup(
    db: &Database,
    app_data_dir: &Path,
    backup_path: &Path,
    selection: &RestoreSelection,
) -> Result<RestoreReport> {
    let file = File::open(backup_path)?;
    let mut archive = ZipArchive::new(file)?;

    let manifest: BackupInfo = {
        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|_| ShioriError::Other("Invalid backup: missing manifest.json".to_string()))?;
        let mut content = String::new();
        manifest_file.read_to_string(&mut content)?;
        serde_json::from_str(&content)?
    };

    // Categories present in the archive. Empty manifest categories = v1 or
    // v2-Everything → all eight.
    let archive_cats: Vec<BackupCategory> = if manifest.categories.is_empty() {
        BackupCategory::ALL.to_vec()
    } else {
        manifest
            .categories
            .iter()
            .filter_map(|n| BackupCategory::from_name(n))
            .collect()
    };

    // Effective restore set: selection ∩ archive (empty selection = all).
    let mut report = RestoreReport::default();
    let effective: Vec<BackupCategory> = if selection.categories.is_empty() {
        archive_cats.clone()
    } else {
        for c in &selection.categories {
            if !archive_cats.contains(c) {
                report
                    .errors
                    .push(format!("Category '{}' not present in archive", c.as_str()));
            }
        }
        selection
            .categories
            .iter()
            .filter(|c| archive_cats.contains(c))
            .copied()
            .collect()
    };

    if effective.is_empty() {
        return Ok(report);
    }

    let is_full = archive.by_name("database/library.db").is_ok();
    if is_full {
        restore_full_snapshot(db, app_data_dir, &mut archive, &effective, &mut report)?;
    } else {
        restore_subset_archive(
            db,
            app_data_dir,
            &mut archive,
            &manifest,
            &effective,
            selection,
            &mut report,
        )?;
    }

    Ok(report)
}

/// Legacy ATTACH-merge restore for full snapshots. Always delete + insert
/// (today's semantics).
///
/// When the effective selection covers Everything (empty selection, v1
/// manifest, or all categories) the FULL baseline table set is restored
/// unfiltered — filtering by category would drop the orphan tables that no
/// category maps to (reading_goals, shares, conversion_*, onboarding_state,
/// ...). Subset selections keep the category filter.
fn restore_full_snapshot(
    db: &Database,
    app_data_dir: &Path,
    archive: &mut ZipArchive<File>,
    effective: &[BackupCategory],
    report: &mut RestoreReport,
) -> Result<()> {
    let is_everything = {
        let set: HashSet<&BackupCategory> = effective.iter().collect();
        set.len() == BackupCategory::ALL.len()
    };
    let selected_tables: HashSet<&str> = if is_everything {
        FULL_TABLES.iter().copied().collect()
    } else {
        effective
            .iter()
            .flat_map(|c| category_tables(*c))
            .copied()
            .collect()
    };

    // Temp DB extracted from the archive lives in a TempDir — self-cleaning on
    // every exit path (success, error, panic), unlike the old `.keep()`ed path.
    let temp_dir = TempDir::new()
        .map_err(|e| ShioriError::Other(format!("Failed to create temp directory: {}", e)))?;
    let temp_db_path = temp_dir.path().join("library.db");

    {
        let mut db_file = archive
            .by_name("database/library.db")
            .map_err(|_| ShioriError::Other("Invalid backup: missing database/library.db".to_string()))?;
        let mut temp_file = File::create(&temp_db_path)?;
        std::io::copy(&mut db_file, &mut temp_file)?;
    }

    let conn = db.get_connection()?;

    let attach_sql = format!(
        "ATTACH DATABASE '{}' AS backup_db",
        temp_db_path.display().to_string().replace('\'', "''")
    );

    let cat_of_table: HashMap<&str, &str> = BackupCategory::ALL
        .iter()
        .flat_map(|c| category_tables(*c).iter().map(move |t| (*t, c.as_str())))
        .collect();

    // ATTACH, then run ALL table DELETEs + INSERTs inside ONE transaction so a
    // mid-restore failure (corrupt snapshot, constraint violation, crash) rolls
    // back instead of leaving the library half-wiped. DETACH and the temp-dir
    // cleanup run in a path that fires even on error.
    let db_result: Result<()> = (|| {
        conn.execute_batch(&attach_sql)?;
        let tx = conn.unchecked_transaction()?;

        for table in FULL_TABLES {
            if !selected_tables.contains(table) {
                continue;
            }
            let table_exists: bool = tx
                .query_row(
                    "SELECT COUNT(*) FROM backup_db.sqlite_master WHERE type='table' AND name=?",
                    rusqlite::params![table],
                    |row| {
                        let count: i32 = row.get(0)?;
                        Ok(count > 0)
                    },
                )
                .unwrap_or(false);
            if !table_exists {
                continue;
            }

            let current_cols = table_columns(&tx, "main", table)?;
            let backup_cols: HashSet<String> =
                table_columns(&tx, "backup_db", table)?.into_iter().collect();
            let shared: Vec<String> =
                current_cols.into_iter().filter(|c| backup_cols.contains(c)).collect();
            if shared.is_empty() {
                continue;
            }

            let col_list = shared
                .iter()
                .map(|c| quote_col(c))
                .collect::<Vec<_>>()
                .join(", ");

            tx.execute(&format!("DELETE FROM main.{table}"), [])?;
            let inserted = tx.execute(
                &format!(
                    "INSERT INTO main.{table} ({cols}) SELECT {cols} FROM backup_db.{table}",
                    table = table,
                    cols = col_list
                ),
                [],
            )?;
            if let Some(cat) = cat_of_table.get(table) {
                *report.restored.entry((*cat).to_string()).or_insert(0) += inserted as u64;
            }
        }

        tx.commit()?;
        Ok(())
    })();

    // Cleanup that must fire on success AND error.
    let _ = conn.execute_batch("DETACH DATABASE backup_db");
    db_result?;

    // File trees, gated by category.
    let mut covers_restored = 0u64;
    if effective.contains(&BackupCategory::Covers) {
        let covers_dir = app_data_dir.join("covers");
        fs::create_dir_all(&covers_dir)?;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i)?;
            let file_path = file.name().to_string();
            if !file_path.ends_with('/') {
                if let Some(relative_path) = file_path.strip_prefix("covers/") {
                    let Some(relative_path) = safe_archive_rel_path(relative_path) else {
                        report.skipped += 1;
                        report.skipped_invalid_paths += 1;
                        report
                            .errors
                            .push(format!("Skipped unsafe archive entry '{file_path}'"));
                        continue;
                    };
                    let target_path = covers_dir.join(relative_path);
                    if let Some(parent) = target_path.parent() {
                        fs::create_dir_all(parent)?;
                    }
                    let mut target_file = File::create(&target_path)?;
                    std::io::copy(&mut file, &mut target_file)?;
                    covers_restored += 1;
                }
            }
        }
        *report.restored.entry("covers".to_string()).or_insert(0) += covers_restored;
    }

    if effective.contains(&BackupCategory::Books) {
        let storage_books_dir = app_data_dir.join("storage").join("books");
        fs::create_dir_all(&storage_books_dir)?;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i)?;
            let file_path = file.name().to_string();
            if !file_path.ends_with('/') {
                if let Some(filename) = file_path.strip_prefix("books/") {
                    let Some(filename) = safe_archive_rel_path(filename) else {
                        report.skipped += 1;
                        report.skipped_invalid_paths += 1;
                        report
                            .errors
                            .push(format!("Skipped unsafe archive entry '{file_path}'"));
                        continue;
                    };
                    let target_path = storage_books_dir.join(filename);
                    let mut target_file = File::create(&target_path)?;
                    std::io::copy(&mut file, &mut target_file)?;
                    *report.restored.entry("books".to_string()).or_insert(0) += 1;
                }
            }
        }
    }

    if effective.contains(&BackupCategory::Preferences) {
        let settings_result = archive.by_name("settings/frontend_settings.json");
        if let Ok(mut settings_file) = settings_result {
            let mut settings_content = String::new();
            settings_file.read_to_string(&mut settings_content)?;
            report.frontend_settings = Some(settings_content);
        }
    }

    Ok(())
}

/// Restore a subset archive: per-category JSON import + covers/books/sources
/// file trees.
fn restore_subset_archive(
    db: &Database,
    app_data_dir: &Path,
    archive: &mut ZipArchive<File>,
    manifest: &BackupInfo,
    effective: &[BackupCategory],
    selection: &RestoreSelection,
    report: &mut RestoreReport,
) -> Result<()> {
    let conn = db.get_connection()?;

    // DB-backed categories: ALL table writes (across every category) run in
    // ONE transaction so a mid-restore failure (corrupt JSON, constraint
    // violation) rolls back every category instead of leaving a partially
    // imported library.
    let db_result: Result<()> = (|| {
        let tx = conn.unchecked_transaction()?;
        for cat in BackupCategory::ALL.iter() {
            if !effective.contains(cat) {
                continue;
            }
            if matches!(
                cat,
                BackupCategory::Covers | BackupCategory::Books | BackupCategory::Sources
            ) {
                continue; // file trees, handled after the DB work
            }
            let entry_name = format!("category_{}.json", cat.as_str());
            match archive.by_name(&entry_name) {
                Ok(mut file) => {
                    let mut content = String::new();
                    file.read_to_string(&mut content)?;
                    let json: Value = serde_json::from_str(&content)?;
                    restore_category_json(
                        &tx,
                        *cat,
                        &json,
                        selection.conflict_policy,
                        selection.include_credentials,
                        report,
                    )?;
                }
                Err(_) => report
                    .errors
                    .push(format!("Category '{}' not present in archive", cat.as_str())),
            }
        }
        tx.commit()?;
        Ok(())
    })();
    db_result?;

    // File-tree categories (covers / books / sources) — not transactional.
    for cat in BackupCategory::ALL.iter() {
        if !effective.contains(cat) {
            continue;
        }
        match cat {
            BackupCategory::Covers => {
                let covers_dir = app_data_dir.join("covers");
                fs::create_dir_all(&covers_dir)?;
                for i in 0..archive.len() {
                    let mut file = archive.by_index(i)?;
                    let file_path = file.name().to_string();
                    if !file_path.ends_with('/') {
                        if let Some(relative_path) = file_path.strip_prefix("covers/") {
                            let Some(relative_path) = safe_archive_rel_path(relative_path) else {
                                report.skipped += 1;
                                report.skipped_invalid_paths += 1;
                                report
                                    .errors
                                    .push(format!("Skipped unsafe archive entry '{file_path}'"));
                                continue;
                            };
                            let target_path = covers_dir.join(relative_path);
                            if let Some(parent) = target_path.parent() {
                                fs::create_dir_all(parent)?;
                            }
                            let mut target_file = File::create(&target_path)?;
                            std::io::copy(&mut file, &mut target_file)?;
                            *report.restored.entry("covers".to_string()).or_insert(0) += 1;
                        }
                    }
                }
            }
            BackupCategory::Books => {
                restore_book_files(db, app_data_dir, archive, manifest, report)?;
            }
            BackupCategory::Sources => {
                restore_sources(app_data_dir, archive, selection, report)?;
            }
            _ => {}
        }
    }

    // Frontend settings blob (Preferences).
    if effective.contains(&BackupCategory::Preferences) {
        if let Ok(mut settings_file) = archive.by_name("settings/frontend_settings.json") {
            let mut settings_content = String::new();
            settings_file.read_to_string(&mut settings_content)?;
            report.frontend_settings = Some(settings_content);
        }
    }

    Ok(())
}

/// Extract book files (Books category, subset archives). Targets: managed books
/// → managed root + managed_relpath; referenced books → original file_path.
///
/// DB-supplied paths are validated before any write: non-managed `file_path`
/// must be absolute with no `.`/`..` components and its parent must already
/// exist on this machine (no directory creation from manifest data); managed
/// `managed_relpath` must resolve inside the managed root. Rejected targets
/// are skipped and counted in `skipped_invalid_paths`.
// ponytail: crafted manifests pointing at existing dirs (e.g. ~/.ssh) still
// write; restore is a trusted-file op — XSS chain + UI confirmation are the
// remaining mitigations.
fn restore_book_files(
    db: &Database,
    app_data_dir: &Path,
    archive: &mut ZipArchive<File>,
    manifest: &BackupInfo,
    report: &mut RestoreReport,
) -> Result<()> {
    if manifest.book_files.is_empty() {
        return Ok(());
    }
    let conn = db.get_connection()?;
    let managed_root = crate::services::library_root::resolve_managed_root(db, app_data_dir)?;

    let mut stmt = conn.prepare(
        "SELECT uuid, file_path, is_managed, managed_relpath FROM books WHERE uuid = ?1",
    )?;

    for (uuid, entry) in &manifest.book_files {
        let row = stmt
            .query_row(rusqlite::params![uuid], |row| {
                Ok((
                    row.get::<_, String>(1)?,
                    row.get::<_, bool>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })
            .optional()?;
        let Some((file_path, is_managed, managed_relpath)) = row else {
            report.skipped += 1;
            report
                .errors
                .push(format!("Book file skipped: no book row for uuid {uuid}"));
            continue;
        };
        let target: Option<PathBuf> = if is_managed {
            let Some(rel) = managed_relpath else {
                report.skipped += 1;
                report
                    .errors
                    .push(format!("Book file skipped: managed book {uuid} has no managed_relpath"));
                continue;
            };
            let target = managed_root.local_path().join(&rel);
            if managed_target_allowed(managed_root.local_path(), &target, &rel) {
                Some(target)
            } else {
                report.skipped += 1;
                report.skipped_invalid_paths += 1;
                report.errors.push(format!(
                    "Book file skipped: managed_relpath '{rel}' for book {uuid} escapes the managed library root"
                ));
                None
            }
        } else {
            match safe_absolute_restore_path(&file_path) {
                Some(path) => Some(path),
                None => {
                    report.skipped += 1;
                    report.skipped_invalid_paths += 1;
                    report.errors.push(format!(
                        "Book file skipped: invalid file_path '{file_path}' for book {uuid}: must be absolute with no '.'/'..' components"
                    ));
                    None
                }
            }
        };
        let Some(target) = target else {
            continue;
        };

        // Non-managed: the target's parent must ALREADY exist — a crafted
        // manifest must not create directories outside the managed tree.
        if !is_managed {
            let parent = target.parent().unwrap_or(target.as_path());
            if !matches!(fs::metadata(parent), Ok(m) if m.is_dir()) {
                report.skipped += 1;
                report.skipped_invalid_paths += 1;
                report.errors.push(format!(
                    "Book file skipped: parent directory '{}' of file_path for book {uuid} does not exist",
                    parent.display()
                ));
                continue;
            }
        }

        // The archive entry name must itself be a safe relative path (defense
        // in depth — the write target is already validated above).
        if safe_archive_rel_path(entry).is_none() {
            report.skipped += 1;
            report.skipped_invalid_paths += 1;
            report
                .errors
                .push(format!("Book file skipped: unsafe archive entry '{entry}'"));
            continue;
        }
        match archive.by_name(entry) {
            Ok(mut file) => {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }
                let mut target_file = File::create(&target)?;
                if let Err(e) = std::io::copy(&mut file, &mut target_file) {
                    report.skipped += 1;
                    report
                        .errors
                        .push(format!("Failed to extract book file {entry}: {e}"));
                } else {
                    *report.restored.entry("books".to_string()).or_insert(0) += 1;
                }
            }
            Err(_) => {
                report.skipped += 1;
                report
                    .errors
                    .push(format!("Book file {entry} missing from archive"));
            }
        }
    }
    Ok(())
}

/// Restore the sources.json store and Cloudflare session files.
fn restore_sources(
    app_data_dir: &Path,
    archive: &mut ZipArchive<File>,
    selection: &RestoreSelection,
    report: &mut RestoreReport,
) -> Result<()> {
    const CREDENTIAL_KEYS: &[&str] = &["torbox.api_key", "toongod.cf_clearance"];

    let mut any = false;
    if let Ok(mut file) = archive.by_name("category_sources.json") {
        let mut content = String::new();
        file.read_to_string(&mut content)?;
        let json: Value = serde_json::from_str(&content)?;
        let redacted = json.get("redacted").and_then(|v| v.as_bool()).unwrap_or(false);
        let store = json.get("store").and_then(|v| v.as_object());

        if let Some(store) = store {
            let mut out = store.clone();
            if !selection.include_credentials {
                for key in CREDENTIAL_KEYS {
                    if out.remove(*key).is_some() {
                        report.skipped += 1;
                    }
                }
            } else if redacted {
                // User asked for credentials the backup never captured.
                report.skipped += 1;
                report
                    .errors
                    .push("Sources backup was made without credentials; credential keys not restored".to_string());
            }
            let sources_path = app_data_dir.join("sources.json");
            if let Some(parent) = sources_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&sources_path, serde_json::to_string_pretty(&Value::Object(out))?)?;
            *report.restored.entry("sources".to_string()).or_insert(0) += 1;
            any = true;
        }
    }

    let sessions_dir = app_data_dir.join("cloudflare_sessions");
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let file_path = file.name().to_string();
        if let Some(relative) = file_path.strip_prefix("sources/cloudflare_sessions/") {
            if selection.include_credentials {
                let Some(relative) = safe_archive_rel_path(relative) else {
                    report.skipped += 1;
                    report.skipped_invalid_paths += 1;
                    report
                        .errors
                        .push(format!("Skipped unsafe archive entry '{file_path}'"));
                    any = true;
                    continue;
                };
                fs::create_dir_all(&sessions_dir)?;
                let target_path = sessions_dir.join(relative);
                let mut target_file = File::create(&target_path)?;
                std::io::copy(&mut file, &mut target_file)?;
                *report.restored.entry("sources".to_string()).or_insert(0) += 1;
            } else {
                report.skipped += 1;
            }
            any = true;
        }
    }

    if !any {
        report
            .errors
            .push("Category 'sources' not present in archive".to_string());
    }
    Ok(())
}

// ─── Per-category JSON restore ───────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
fn restore_category_json(
    conn: &rusqlite::Connection,
    cat: BackupCategory,
    json: &Value,
    policy: ConflictPolicy,
    include_credentials: bool,
    report: &mut RestoreReport,
) -> Result<()> {
    let Some(tables) = json.get("tables").and_then(|t| t.as_object()) else {
        return Ok(());
    };
    let redacted_columns: HashSet<String> = json
        .get("redacted_columns")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    let cat_name = cat.as_str();

    for table in category_tables(cat) {
        let Some(rows) = tables.get(*table).and_then(|v| v.as_array()) else {
            continue;
        };
        let mut rows: Vec<&Map<String, Value>> = rows.iter().filter_map(|v| v.as_object()).collect();

        match *table {
            "books" => restore_books(conn, &mut rows, policy, cat_name, report)?,
            "authors" => restore_unique_name_rows(conn, "authors", &mut rows, policy, cat_name, report)?,
            "tags" => restore_unique_name_rows(conn, "tags", &mut rows, policy, cat_name, report)?,
            "books_authors" => restore_junction(conn, "books_authors", &mut rows, policy, cat_name, report)?,
            "books_tags" => restore_junction(conn, "books_tags", &mut rows, policy, cat_name, report)?,
            "book_formats" => restore_book_formats(conn, &mut rows, policy, cat_name, report)?,
            "shelves" => restore_shelves(conn, &mut rows, policy, cat_name, report)?,
            "shelf_books" => restore_shelf_books(conn, &mut rows, policy, cat_name, report)?,
            "annotation_categories" => {
                restore_unique_name_rows(conn, "annotation_categories", &mut rows, policy, cat_name, report)?
            }
            "annotations" => restore_annotations(conn, &mut rows, policy, cat_name, report)?,
            "reading_progress" => restore_reading_progress(conn, &mut rows, policy, cat_name, report)?,
            "reading_sessions" => restore_reading_sessions(conn, &mut rows, policy, cat_name, report)?,
            "rss_feeds" => restore_rss_feeds(conn, &mut rows, policy, cat_name, report)?,
            "rss_settings" => restore_singleton(conn, "rss_settings", &mut rows, policy, cat_name, report)?,
            "rss_articles" => restore_rss_articles(conn, &mut rows, policy, cat_name, report)?,
            "user_preferences" => {
                restore_singleton_redacted(
                    conn,
                    "user_preferences",
                    &mut rows,
                    policy,
                    cat_name,
                    &redacted_columns,
                    include_credentials,
                    report,
                )?
            }
            _ => {}
        }
    }
    Ok(())
}

/// Look up a book id by `_book_uuid` (preferred) or `_book_hash` (fallback).
fn find_book_id(conn: &rusqlite::Connection, row: &Map<String, Value>) -> Result<Option<i64>> {
    if let Some(u) = row.get("_book_uuid").and_then(|v| v.as_str()) {
        if let Some(id) = conn
            .query_row("SELECT id FROM books WHERE uuid = ?1", rusqlite::params![u], |r| {
                r.get::<_, i64>(0)
            })
            .optional()?
        {
            return Ok(Some(id));
        }
    }
    if let Some(h) = row.get("_book_hash").and_then(|v| v.as_str()) {
        if let Some(id) = conn
            .query_row(
                "SELECT id FROM books WHERE file_hash = ?1",
                rusqlite::params![h],
                |r| r.get::<_, i64>(0),
            )
            .optional()?
        {
            return Ok(Some(id));
        }
    }
    Ok(None)
}

/// Insert `row` into `table`, dropping the `_`-prefixed link keys and any
/// columns in `drop_cols` (typically the autoincrement `id` so the DB assigns
/// a fresh one). If `replace_uuid` is set, the books uuid is regenerated
/// (keep_both semantics).
fn insert_row(
    conn: &rusqlite::Connection,
    table: &str,
    row: &Map<String, Value>,
    drop_cols: &[&str],
    replace_uuid: Option<&str>,
) -> Result<()> {
    let mut cols: Vec<&String> = row
        .keys()
        .filter(|k| !k.starts_with('_') && !drop_cols.contains(&k.as_str()))
        .collect();
    // Sort for deterministic SQL (serde_json Map is a BTreeMap, but be safe).
    cols.sort();
    let col_list = cols.iter().map(|c| quote_col(c)).collect::<Vec<_>>().join(", ");
    let placeholders = (1..=cols.len())
        .map(|i| format!("?{i}"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!("INSERT INTO {table} ({col_list}) VALUES ({placeholders})");
    let vals: Vec<rusqlite::types::Value> = cols
        .iter()
        .map(|c| {
            let mut v = json_to_sql(&row[*c]);
            if replace_uuid.is_some() && c.as_str() == "uuid" {
                v = rusqlite::types::Value::Text(replace_uuid.unwrap().to_string());
            }
            v
        })
        .collect();
    conn.execute(&sql, rusqlite::params_from_iter(vals))?;
    Ok(())
}

/// UPDATE `row` onto the row identified by `id` (all columns except id and the
/// `_`-prefixed link keys).
fn update_row_by_id(
    conn: &rusqlite::Connection,
    table: &str,
    row: &Map<String, Value>,
    id: i64,
) -> Result<()> {
    let mut cols: Vec<&String> = row
        .keys()
        .filter(|k| !k.starts_with('_') && k.as_str() != "id")
        .collect();
    cols.sort();
    if cols.is_empty() {
        return Ok(());
    }
    let set_list = cols
        .iter()
        .enumerate()
        .map(|(i, c)| format!("{} = ?{}", quote_col(c), i + 1))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!("UPDATE {table} SET {set_list} WHERE id = ?{}", cols.len() + 1);
    let mut vals: Vec<rusqlite::types::Value> = cols.iter().map(|c| json_to_sql(&row[*c])).collect();
    vals.push(rusqlite::types::Value::Integer(id));
    conn.execute(&sql, rusqlite::params_from_iter(vals))?;
    Ok(())
}

fn restore_books(
    conn: &rusqlite::Connection,
    rows: &mut Vec<&Map<String, Value>>,
    policy: ConflictPolicy,
    cat_name: &str,
    report: &mut RestoreReport,
) -> Result<()> {
    for row in rows {
        let uuid = row.get("uuid").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let hash = row.get("file_hash").and_then(|v| v.as_str()).map(str::to_string);

        let existing = if !uuid.is_empty() {
            conn.query_row("SELECT id FROM books WHERE uuid = ?1", rusqlite::params![uuid], |r| {
                r.get::<_, i64>(0)
            })
            .optional()?
        } else {
            None
        };
        let existing = match existing {
            Some(id) => Some(id),
            None => {
                if let Some(h) = &hash {
                    conn.query_row(
                        "SELECT id FROM books WHERE file_hash = ?1",
                        rusqlite::params![h],
                        |r| r.get::<_, i64>(0),
                    )
                    .optional()?
                } else {
                    None
                }
            }
        };

        match policy {
            ConflictPolicy::Skip => {
                if existing.is_some() {
                    report.skipped += 1;
                    continue;
                }
                insert_row(conn, "books", row, &["id"], None)?;
            }
            ConflictPolicy::Overwrite => {
                if let Some(id) = existing {
                    update_row_by_id(conn, "books", row, id)?;
                } else {
                    insert_row(conn, "books", row, &["id"], None)?;
                }
            }
            ConflictPolicy::KeepBoth => {
                // New row, fresh id and fresh uuid. Children in the same
                // archive still re-link to the ORIGINAL book by uuid. file_path
                // is UNIQUE — mangle it so the copy can coexist.
                let new_uuid = uuid::Uuid::new_v4().to_string();
                let mut r = (*row).clone();
                if let Some(fp) = r.get("file_path").and_then(|v| v.as_str()) {
                    let short = &new_uuid[..8];
                    r.insert(
                        "file_path".to_string(),
                        Value::String(format!("{fp} (restored-{short})")),
                    );
                }
                insert_row(conn, "books", &r, &["id"], Some(&new_uuid))?;
            }
        }
        *report.restored.entry(cat_name.to_string()).or_insert(0) += 1;
    }
    Ok(())
}

/// Tables keyed by a unique name column: insert missing, update existing.
fn restore_unique_name_rows(
    conn: &rusqlite::Connection,
    table: &str,
    rows: &mut Vec<&Map<String, Value>>,
    policy: ConflictPolicy,
    cat_name: &str,
    report: &mut RestoreReport,
) -> Result<()> {
    let name_col = "name";
    for row in rows {
        let name = row.get(name_col).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let existing = conn
            .query_row(
                &format!("SELECT id FROM {table} WHERE {name_col} = ?1"),
                rusqlite::params![name],
                |r| r.get::<_, i64>(0),
            )
            .optional()?;
        match policy {
            ConflictPolicy::Skip => {
                if existing.is_some() {
                    report.skipped += 1;
                    continue;
                }
                insert_row(conn, table, row, &["id"], None)?;
            }
            ConflictPolicy::Overwrite => {
                if let Some(id) = existing {
                    update_row_by_id(conn, table, row, id)?;
                } else {
                    insert_row(conn, table, row, &["id"], None)?;
                }
            }
            ConflictPolicy::KeepBoth => {
                if existing.is_some() {
                    // name is UNIQUE — can't keep both under the same name.
                    report.skipped += 1;
                    continue;
                }
                insert_row(conn, table, row, &["id"], None)?;
            }
        }
        *report.restored.entry(cat_name.to_string()).or_insert(0) += 1;
    }
    Ok(())
}

/// Junction tables (books_authors / books_tags): re-link by uuid + name; the
/// composite PK makes keep_both identical to overwrite.
fn restore_junction(
    conn: &rusqlite::Connection,
    table: &str,
    rows: &mut Vec<&Map<String, Value>>,
    policy: ConflictPolicy,
    cat_name: &str,
    report: &mut RestoreReport,
) -> Result<()> {
    let (name_col, ref_table): (&str, &str) = if table == "books_authors" {
        ("_author_name", "authors")
    } else {
        ("_tag_name", "tags")
    };
    for row in rows {
        let Some(book_id) = find_book_id(conn, row)? else {
            report.skipped += 1;
            continue;
        };
        let Some(name) = row.get(name_col).and_then(|v| v.as_str()) else {
            report.skipped += 1;
            continue;
        };
        // Ensure the referenced author/tag exists (create minimal row if needed).
        let ref_id = match conn
            .query_row(
                &format!("SELECT id FROM {ref_table} WHERE name = ?1"),
                rusqlite::params![name],
                |r| r.get::<_, i64>(0),
            )
            .optional()?
        {
            Some(id) => id,
            None => {
                conn.execute(
                    &format!("INSERT INTO {ref_table} (name) VALUES (?1)"),
                    rusqlite::params![name],
                )?;
                conn.last_insert_rowid()
            }
        };

        let exists: bool = conn
            .query_row(
                &format!("SELECT 1 FROM {table} WHERE book_id = ?1 AND {} = ?2", if table == "books_authors" { "author_id" } else { "tag_id" }),
                rusqlite::params![book_id, ref_id],
                |r| r.get::<_, i64>(0).map(|v| v > 0),
            )
            .optional()?
            .unwrap_or(false);

        if policy == ConflictPolicy::Skip && exists {
            report.skipped += 1;
            continue;
        }
        if !exists {
            conn.execute(
                &format!(
                    "INSERT INTO {table} (book_id, {}) VALUES (?1, ?2)",
                    if table == "books_authors" { "author_id" } else { "tag_id" }
                ),
                rusqlite::params![book_id, ref_id],
            )?;
        }
        *report.restored.entry(cat_name.to_string()).or_insert(0) += 1;
    }
    Ok(())
}

fn restore_book_formats(
    conn: &rusqlite::Connection,
    rows: &mut Vec<&Map<String, Value>>,
    policy: ConflictPolicy,
    cat_name: &str,
    report: &mut RestoreReport,
) -> Result<()> {
    for row in rows {
        let Some(book_id) = find_book_id(conn, row)? else {
            report.skipped += 1;
            continue;
        };
        // Re-point the row at the resolved book (archive ids differ).
        let mut r = (*row).clone();
        r.remove("_book_uuid");
        r.remove("_book_hash");
        r.insert("book_id".to_string(), Value::from(book_id));

        let hash = r.get("file_hash").and_then(|v| v.as_str()).map(str::to_string);
        let existing = match &hash {
            Some(h) => conn
                .query_row(
                    "SELECT id FROM book_formats WHERE file_hash = ?1",
                    rusqlite::params![h],
                    |r| r.get::<_, i64>(0),
                )
                .optional()?,
            None => None,
        };
        match policy {
            ConflictPolicy::Skip => {
                if existing.is_some() {
                    report.skipped += 1;
                    continue;
                }
                insert_row(conn, "book_formats", &r, &["id"], None)?;
            }
            ConflictPolicy::Overwrite => {
                if let Some(id) = existing {
                    update_row_by_id(conn, "book_formats", &r, id)?;
                } else {
                    insert_row(conn, "book_formats", &r, &["id"], None)?;
                }
            }
            ConflictPolicy::KeepBoth => {
                if existing.is_some() {
                    // file_hash is UNIQUE — cannot keep both.
                    report.skipped += 1;
                    continue;
                }
                insert_row(conn, "book_formats", &r, &["id"], None)?;
            }
        }
        *report.restored.entry(cat_name.to_string()).or_insert(0) += 1;
    }
    Ok(())
}

fn restore_shelves(
    conn: &rusqlite::Connection,
    rows: &mut Vec<&Map<String, Value>>,
    policy: ConflictPolicy,
    cat_name: &str,
    report: &mut RestoreReport,
) -> Result<()> {
    for row in rows {
        let name = row.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let existing = conn
            .query_row(
                "SELECT id FROM shelves WHERE name = ?1",
                rusqlite::params![name],
                |r| r.get::<_, i64>(0),
            )
            .optional()?;
        match policy {
            ConflictPolicy::Skip => {
                if existing.is_some() {
                    report.skipped += 1;
                    continue;
                }
                insert_row(conn, "shelves", row, &["id"], None)?;
            }
            ConflictPolicy::Overwrite => {
                if let Some(id) = existing {
                    update_row_by_id(conn, "shelves", row, id)?;
                } else {
                    insert_row(conn, "shelves", row, &["id"], None)?;
                }
            }
            ConflictPolicy::KeepBoth => {
                insert_row(conn, "shelves", row, &["id"], None)?;
            }
        }
        *report.restored.entry(cat_name.to_string()).or_insert(0) += 1;
    }
    Ok(())
}

fn restore_shelf_books(
    conn: &rusqlite::Connection,
    rows: &mut Vec<&Map<String, Value>>,
    policy: ConflictPolicy,
    cat_name: &str,
    report: &mut RestoreReport,
) -> Result<()> {
    for row in rows {
        let Some(book_id) = find_book_id(conn, row)? else {
            report.skipped += 1;
            continue;
        };
        let Some(shelf_name) = row.get("_shelf_name").and_then(|v| v.as_str()) else {
            report.skipped += 1;
            continue;
        };
        let Some(shelf_id) = conn
            .query_row(
                "SELECT id FROM shelves WHERE name = ?1",
                rusqlite::params![shelf_name],
                |r| r.get::<_, i64>(0),
            )
            .optional()?
        else {
            report.skipped += 1;
            continue;
        };
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM shelf_books WHERE shelf_id = ?1 AND book_id = ?2",
                rusqlite::params![shelf_id, book_id],
                |r| r.get::<_, i64>(0).map(|v| v > 0),
            )
            .optional()?
            .unwrap_or(false);
        if policy == ConflictPolicy::Skip && exists {
            report.skipped += 1;
            continue;
        }
        if !exists {
            conn.execute(
                "INSERT INTO shelf_books (shelf_id, book_id, added_at, sort_order) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![
                    shelf_id,
                    book_id,
                    row.get("added_at").and_then(|v| v.as_str()).unwrap_or(""),
                    row.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0)
                ],
            )?;
        }
        *report.restored.entry(cat_name.to_string()).or_insert(0) += 1;
    }
    Ok(())
}

fn restore_annotations(
    conn: &rusqlite::Connection,
    rows: &mut Vec<&Map<String, Value>>,
    policy: ConflictPolicy,
    cat_name: &str,
    report: &mut RestoreReport,
) -> Result<()> {
    for row in rows {
        let Some(book_id) = find_book_id(conn, row)? else {
            report.skipped += 1;
            continue;
        };
        // Resolve category by name captured at export time.
        let mut row = (*row).clone();
        let category_id = match row.get("_category_name").and_then(|v| v.as_str()) {
            Some(name) => conn
                .query_row(
                    "SELECT id FROM annotation_categories WHERE name = ?1",
                    rusqlite::params![name],
                    |r| r.get::<_, i64>(0),
                )
                .optional()?,
            None => None,
        };
        row.remove("_category_name");
        row.remove("_book_uuid");
        row.remove("_book_hash");
        row.insert("book_id".to_string(), Value::from(book_id));
        if let Some(cid) = category_id {
            row.insert("category_id".to_string(), Value::from(cid));
        } else {
            row.insert("category_id".to_string(), Value::Null);
        }

        let key = |r: &Map<String, Value>| {
            (
                r.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                r.get("location").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                r.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            )
        };
        let existing = conn
            .query_row(
                "SELECT id FROM annotations WHERE book_id = ?1 AND type = ?2 AND location = ?3 AND created_at = ?4",
                rusqlite::params![book_id, key(&row).0, key(&row).1, key(&row).2],
                |r| r.get::<_, i64>(0),
            )
            .optional()?;

        match policy {
            ConflictPolicy::Skip => {
                if existing.is_some() {
                    report.skipped += 1;
                    continue;
                }
                insert_row(conn, "annotations", &row, &["id"], None)?;
            }
            ConflictPolicy::Overwrite => {
                if let Some(id) = existing {
                    update_row_by_id(conn, "annotations", &row, id)?;
                } else {
                    insert_row(conn, "annotations", &row, &["id"], None)?;
                }
            }
            ConflictPolicy::KeepBoth => {
                insert_row(conn, "annotations", &row, &["id"], None)?;
            }
        }
        *report.restored.entry(cat_name.to_string()).or_insert(0) += 1;
    }
    Ok(())
}

fn restore_reading_progress(
    conn: &rusqlite::Connection,
    rows: &mut Vec<&Map<String, Value>>,
    policy: ConflictPolicy,
    cat_name: &str,
    report: &mut RestoreReport,
) -> Result<()> {
    for row in rows {
        let Some(book_id) = find_book_id(conn, row)? else {
            report.skipped += 1;
            continue;
        };
        // Re-point the row at the resolved book (archive ids differ).
        let mut r = (*row).clone();
        r.remove("_book_uuid");
        r.remove("_book_hash");
        r.insert("book_id".to_string(), Value::from(book_id));

        let existing = conn
            .query_row(
                "SELECT id FROM reading_progress WHERE book_id = ?1",
                rusqlite::params![book_id],
                |r| r.get::<_, i64>(0),
            )
            .optional()?;
        match policy {
            ConflictPolicy::Skip => {
                if existing.is_some() {
                    report.skipped += 1;
                    continue;
                }
                insert_row(conn, "reading_progress", &r, &["id"], None)?;
            }
            ConflictPolicy::Overwrite | ConflictPolicy::KeepBoth => {
                // UNIQUE(book_id) — keep_both falls back to overwrite.
                if let Some(id) = existing {
                    update_row_by_id(conn, "reading_progress", &r, id)?;
                } else {
                    insert_row(conn, "reading_progress", &r, &["id"], None)?;
                }
            }
        }
        *report.restored.entry(cat_name.to_string()).or_insert(0) += 1;
    }
    Ok(())
}

fn restore_reading_sessions(
    conn: &rusqlite::Connection,
    rows: &mut Vec<&Map<String, Value>>,
    policy: ConflictPolicy,
    cat_name: &str,
    report: &mut RestoreReport,
) -> Result<()> {
    for row in rows {
        let Some(book_id) = find_book_id(conn, row)? else {
            report.skipped += 1;
            continue;
        };
        // Re-point the row at the resolved book (archive ids differ).
        let mut r = (*row).clone();
        r.remove("_book_uuid");
        r.remove("_book_hash");
        r.insert("book_id".to_string(), Value::from(book_id));

        let id = r.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let existing = if id.is_empty() {
            None
        } else {
            conn.query_row(
                "SELECT 1 FROM reading_sessions WHERE id = ?1",
                rusqlite::params![id],
                |r| r.get::<_, i64>(0).map(|v| v > 0),
            )
            .optional()?
        };
        match policy {
            ConflictPolicy::Skip => {
                if existing.is_some() {
                    report.skipped += 1;
                    continue;
                }
                // Keep the original text pk.
                insert_row(conn, "reading_sessions", &r, &[], None)?;
            }
            ConflictPolicy::Overwrite => {
                if existing.is_some() {
                    // UPDATE by pk id, re-pointing book_id.
                    let cols: Vec<String> = r
                        .keys()
                        .filter(|k| !k.starts_with('_') && k.as_str() != "id")
                        .cloned()
                        .collect();
                    let set_list = cols
                        .iter()
                        .enumerate()
                        .map(|(i, c)| format!("{} = ?{}", quote_col(c), i + 1))
                        .collect::<Vec<_>>()
                        .join(", ");
                    let sql = format!("UPDATE reading_sessions SET {set_list} WHERE id = ?{}", cols.len() + 1);
                    let mut vals: Vec<rusqlite::types::Value> =
                        cols.iter().map(|c| json_to_sql(&r[c])).collect();
                    vals.push(rusqlite::types::Value::Text(id.clone()));
                    conn.execute(&sql, rusqlite::params_from_iter(vals))?;
                } else {
                    insert_row(conn, "reading_sessions", &r, &[], None)?;
                }
            }
            ConflictPolicy::KeepBoth => {
                // New id (pk is a text uuid).
                let new_id = uuid::Uuid::new_v4().to_string();
                r.insert("id".to_string(), Value::String(new_id));
                insert_row(conn, "reading_sessions", &r, &[], None)?;
            }
        }
        *report.restored.entry(cat_name.to_string()).or_insert(0) += 1;
    }
    Ok(())
}

/// Singleton tables (rss_settings) — replace fields on the single row.
fn restore_singleton(
    conn: &rusqlite::Connection,
    table: &str,
    rows: &mut Vec<&Map<String, Value>>,
    policy: ConflictPolicy,
    cat_name: &str,
    report: &mut RestoreReport,
) -> Result<()> {
    for row in rows {
        if policy == ConflictPolicy::Skip {
            let exists: bool = conn
                .query_row(
                    &format!("SELECT 1 FROM {table} WHERE id = 1"),
                    [],
                    |r| r.get::<_, i64>(0).map(|v| v > 0),
                )
                .optional()?
                .unwrap_or(false);
            if exists {
                report.skipped += 1;
                continue;
            }
        }
        let mut r = (*row).clone();
        r.insert("id".to_string(), Value::from(1));
        let cols: Vec<String> = r
            .keys()
            .filter(|k| !k.starts_with('_') && k.as_str() != "id")
            .cloned()
            .collect();
        if cols.is_empty() {
            continue;
        }
        let set_list = cols
            .iter()
            .enumerate()
            .map(|(i, c)| format!("{} = ?{}", quote_col(c), i + 1))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "INSERT INTO {table} (id, {}) VALUES (1, {}) ON CONFLICT(id) DO UPDATE SET {}",
            cols.iter().map(|c| quote_col(c)).collect::<Vec<_>>().join(", "),
            (1..=cols.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(", "),
            set_list
        );
        let vals: Vec<rusqlite::types::Value> = cols.iter().map(|c| json_to_sql(&r[c])).collect();
        conn.execute(&sql, rusqlite::params_from_iter(vals))?;
        *report.restored.entry(cat_name.to_string()).or_insert(0) += 1;
    }
    Ok(())
}

/// user_preferences singleton with credential-column handling: credential
/// columns are only ever written when the archive captured them
/// (not redacted) AND the user asked for credentials.
fn restore_singleton_redacted(
    conn: &rusqlite::Connection,
    table: &str,
    rows: &mut Vec<&Map<String, Value>>,
    policy: ConflictPolicy,
    cat_name: &str,
    redacted_columns: &HashSet<String>,
    include_credentials: bool,
    report: &mut RestoreReport,
) -> Result<()> {
    for row in rows {
        if policy == ConflictPolicy::Skip {
            let exists: bool = conn
                .query_row(&format!("SELECT 1 FROM {table} WHERE id = 1"), [], |r| {
                    r.get::<_, i64>(0).map(|v| v > 0)
                })
                .optional()?
                .unwrap_or(false);
            if exists {
                report.skipped += 1;
                continue;
            }
        }
        let mut r = (*row).clone();
        r.insert("id".to_string(), Value::from(1));
        let cols: Vec<String> = r
            .keys()
            .filter(|k| !k.starts_with('_') && k.as_str() != "id")
            .filter(|k| {
                // Never write credential columns when they were redacted out of
                // the archive, or when the user didn't ask for credentials.
                if redacted_columns.contains(k.as_str()) {
                    return false;
                }
                if !include_credentials && is_credential_column(k) {
                    return false;
                }
                true
            })
            .cloned()
            .collect();
        if cols.is_empty() {
            report.skipped += 1;
            continue;
        }
        let set_list = cols
            .iter()
            .enumerate()
            .map(|(i, c)| format!("{} = ?{}", quote_col(c), i + 1))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "INSERT INTO {table} (id, {}) VALUES (1, {}) ON CONFLICT(id) DO UPDATE SET {}",
            cols.iter().map(|c| quote_col(c)).collect::<Vec<_>>().join(", "),
            (1..=cols.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(", "),
            set_list
        );
        let vals: Vec<rusqlite::types::Value> = cols.iter().map(|c| json_to_sql(&r[c])).collect();
        conn.execute(&sql, rusqlite::params_from_iter(vals))?;
        *report.restored.entry(cat_name.to_string()).or_insert(0) += 1;
    }
    Ok(())
}

fn is_credential_column(c: &str) -> bool {
    matches!(c, "anilist_token" | "prowlarr_api_key")
}

fn restore_rss_feeds(
    conn: &rusqlite::Connection,
    rows: &mut Vec<&Map<String, Value>>,
    policy: ConflictPolicy,
    cat_name: &str,
    report: &mut RestoreReport,
) -> Result<()> {
    for row in rows {
        let url = row.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let existing = conn
            .query_row(
                "SELECT id FROM rss_feeds WHERE url = ?1",
                rusqlite::params![url],
                |r| r.get::<_, i64>(0),
            )
            .optional()?;
        match policy {
            ConflictPolicy::Skip => {
                if existing.is_some() {
                    report.skipped += 1;
                    continue;
                }
                insert_row(conn, "rss_feeds", row, &["id"], None)?;
            }
            ConflictPolicy::Overwrite => {
                if let Some(id) = existing {
                    update_row_by_id(conn, "rss_feeds", row, id)?;
                } else {
                    insert_row(conn, "rss_feeds", row, &["id"], None)?;
                }
            }
            ConflictPolicy::KeepBoth => {
                if existing.is_some() {
                    // url is UNIQUE — cannot keep both.
                    report.skipped += 1;
                    continue;
                }
                insert_row(conn, "rss_feeds", row, &["id"], None)?;
            }
        }
        *report.restored.entry(cat_name.to_string()).or_insert(0) += 1;
    }
    Ok(())
}

fn restore_rss_articles(
    conn: &rusqlite::Connection,
    rows: &mut Vec<&Map<String, Value>>,
    policy: ConflictPolicy,
    cat_name: &str,
    report: &mut RestoreReport,
) -> Result<()> {
    for row in rows {
        let Some(feed_url) = row.get("_feed_url").and_then(|v| v.as_str()) else {
            report.skipped += 1;
            continue;
        };
        let Some(feed_id) = conn
            .query_row(
                "SELECT id FROM rss_feeds WHERE url = ?1",
                rusqlite::params![feed_url],
                |r| r.get::<_, i64>(0),
            )
            .optional()?
        else {
            report.skipped += 1;
            continue;
        };
        // epub_book_id is nullable — link only when the parent book exists.
        let book_id = find_book_id(conn, row)?;

        let mut r = (*row).clone();
        r.remove("_feed_url");
        r.remove("_book_uuid");
        r.remove("_book_hash");
        r.insert("feed_id".to_string(), Value::from(feed_id));
        match book_id {
            Some(bid) => r.insert("epub_book_id".to_string(), Value::from(bid)),
            None => r.insert("epub_book_id".to_string(), Value::Null),
        };

        let guid = r.get("guid").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let existing = conn
            .query_row(
                "SELECT id FROM rss_articles WHERE feed_id = ?1 AND guid = ?2",
                rusqlite::params![feed_id, guid],
                |r| r.get::<_, i64>(0),
            )
            .optional()?;

        match policy {
            ConflictPolicy::Skip => {
                if existing.is_some() {
                    report.skipped += 1;
                    continue;
                }
                insert_row(conn, "rss_articles", &r, &["id"], None)?;
            }
            ConflictPolicy::Overwrite => {
                if let Some(id) = existing {
                    update_row_by_id(conn, "rss_articles", &r, id)?;
                } else {
                    insert_row(conn, "rss_articles", &r, &["id"], None)?;
                }
            }
            ConflictPolicy::KeepBoth => {
                insert_row(conn, "rss_articles", &r, &["id"], None)?;
            }
        }
        *report.restored.entry(cat_name.to_string()).or_insert(0) += 1;
    }
    Ok(())
}

/// Get backup information without restoring.
pub fn get_backup_info(backup_path: &Path) -> Result<BackupInfo> {
    let file = File::open(backup_path)?;
    let mut archive = ZipArchive::new(file)?;

    let mut manifest_file = archive
        .by_name("manifest.json")
        .map_err(|_| ShioriError::Other("Invalid backup: missing manifest.json".to_string()))?;

    let mut manifest_content = String::new();
    manifest_file.read_to_string(&mut manifest_content)?;

    let backup_info: BackupInfo = serde_json::from_str(&manifest_content)?;

    Ok(backup_info)
}

/// True when the archive is a full snapshot (contains `database/library.db`)
/// rather than a per-category subset archive. Mirrors the `is_full` detection
/// used by [`restore_backup`].
pub fn archive_is_full(backup_path: &Path) -> Result<bool> {
    let file = File::open(backup_path)?;
    let mut archive = ZipArchive::new(file)?;
    let is_full = archive.by_name("database/library.db").is_ok();
    Ok(is_full)
}

/// Command-layer guard: a subset `RestoreSelection` against a FULL snapshot
/// archive would re-insert child rows with backup-side `book_id`s and never
/// run the uuid/hash re-link (the JSON re-link path only exists for subset
/// archives). Reject it instead of silently corrupting referential integrity.
///
/// Enforced by the `restore_backup` tauri command before the restore runs.
pub fn validate_restore_selection(backup_path: &Path, selection: &RestoreSelection) -> Result<()> {
    if !selection.categories.is_empty() && archive_is_full(backup_path)? {
        return Err(ShioriError::Other(format!(
            "Cannot restore a subset from a full backup archive '{}': the archive contains a \
             full database snapshot. Restore everything from it, or restore from a selective \
             (subset) backup instead.",
            backup_path.display()
        )));
    }
    Ok(())
}
