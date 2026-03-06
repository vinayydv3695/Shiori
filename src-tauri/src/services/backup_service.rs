use crate::db::Database;
use crate::error::{Result, ShioriError};
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufWriter, Read, Write};
use std::path::Path;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

const BACKUP_VERSION: &str = "1.0";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub version: String,
    pub created_at: String,
    pub app_version: String,
    pub book_count: usize,
    pub annotation_count: usize,
    pub collection_count: usize,
    pub includes_books: bool,
    pub total_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreInfo {
    pub books_restored: usize,
    pub annotations_restored: usize,
    pub collections_restored: usize,
    pub covers_restored: usize,
    pub settings_restored: bool,
    pub frontend_settings: Option<String>,
}

/// Create a complete backup of library database, covers, and optionally book files
pub fn create_backup(
    db: &Database,
    app_data_dir: &Path,
    backup_path: &Path,
    include_books: bool,
    frontend_settings: Option<&str>,
) -> Result<BackupInfo> {
    let conn = db.get_connection()?;

    // Create a temporary directory for building the backup
    let temp_dir = std::env::temp_dir().join(format!("shiori_backup_{}", Utc::now().timestamp()));
    fs::create_dir_all(&temp_dir)?;

    // Step 1: VACUUM database into a clean copy
    let temp_db_path = temp_dir.join("library.db");
    conn.execute_batch(&format!(
        "VACUUM INTO '{}'",
        temp_db_path.display().to_string().replace("'", "''")
    ))?;

    // Step 2: Count items for manifest
    let book_count: usize = conn.query_row("SELECT COUNT(*) FROM books", [], |row| row.get(0))?;
    let annotation_count: usize =
        conn.query_row("SELECT COUNT(*) FROM annotations", [], |row| row.get(0))?;
    let collection_count: usize =
        conn.query_row("SELECT COUNT(*) FROM collections", [], |row| row.get(0))?;

    // Step 3: Create ZIP archive
    let zip_file = File::create(backup_path)?;
    let buf_writer = BufWriter::new(zip_file);
    let mut zip = ZipWriter::new(buf_writer);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut total_size: u64 = 0;

    // Add database
    zip.start_file("database/library.db", options)?;
    let mut db_file = File::open(&temp_db_path)?;
    let db_size = std::io::copy(&mut db_file, &mut zip)?;
    total_size += db_size;

    // Add covers directory
    let covers_dir = app_data_dir.join("covers");
    if covers_dir.exists() {
        for entry in WalkDir::new(&covers_dir).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                if let Ok(relative) = path.strip_prefix(&covers_dir) {
                    let zip_path = format!("covers/{}", relative.display());
                    zip.start_file(&zip_path, options)?;
                    let mut file = File::open(path)?;
                    let size = std::io::copy(&mut file, &mut zip)?;
                    total_size += size;
                }
            }
        }
    }

    // Add book files if requested
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
                    zip.start_file(&zip_path, options)?;
                    let mut file = File::open(book_path)?;
                    let size = std::io::copy(&mut file, &mut zip)?;
                    total_size += size;
                }
            }
        }
    }

    // Add frontend settings if provided
    if let Some(settings_json) = frontend_settings {
        zip.start_file("settings/frontend_settings.json", options)?;
        zip.write_all(settings_json.as_bytes())?;
        total_size += settings_json.len() as u64;
    }

    // Create and add manifest
    let backup_info = BackupInfo {
        version: BACKUP_VERSION.to_string(),
        created_at: Utc::now().to_rfc3339(),
        app_version: APP_VERSION.to_string(),
        book_count,
        annotation_count,
        collection_count,
        includes_books: include_books,
        total_size_bytes: total_size,
    };

    let manifest_json = serde_json::to_string_pretty(&backup_info)?;
    zip.start_file("manifest.json", options)?;
    zip.write_all(manifest_json.as_bytes())?;

    zip.finish()?;

    // Cleanup temp directory
    fs::remove_dir_all(&temp_dir)?;

    Ok(backup_info)
}

/// Restore library from a backup archive
pub fn restore_backup(
    db: &Database,
    app_data_dir: &Path,
    backup_path: &Path,
) -> Result<RestoreInfo> {
    let file = File::open(backup_path)?;
    let mut archive = ZipArchive::new(file)?;

    // Read manifest
    let mut manifest_file = archive
        .by_name("manifest.json")
        .map_err(|_| ShioriError::Other("Invalid backup: missing manifest.json".to_string()))?;
    let mut manifest_content = String::new();
    manifest_file.read_to_string(&mut manifest_content)?;
    let _backup_info: BackupInfo = serde_json::from_str(&manifest_content)?;
    drop(manifest_file);

    // Extract database to temp location
    let temp_db_path =
        std::env::temp_dir().join(format!("shiori_restore_{}.db", Utc::now().timestamp()));
    {
        let mut db_file = archive.by_name("database/library.db").map_err(|_| {
            ShioriError::Other("Invalid backup: missing database/library.db".to_string())
        })?;
        let mut temp_file = File::create(&temp_db_path)?;
        std::io::copy(&mut db_file, &mut temp_file)?;
    }

    // Restore database using ATTACH DATABASE pattern
    let conn = db.get_connection()?;

    let attach_sql = format!(
        "ATTACH DATABASE '{}' AS backup_db",
        temp_db_path.display().to_string().replace("'", "''")
    );
    conn.execute_batch(&attach_sql)?;

    // List of all tables to restore (from migrations.rs)
    let tables = vec![
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
        "collections",
        "collection_books",
    ];

    // Restore each table
    for table in &tables {
        // Check if table exists in backup
        let table_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM backup_db.sqlite_master WHERE type='table' AND name=?",
                params![table],
                |row| {
                    let count: i32 = row.get(0)?;
                    Ok(count > 0)
                },
            )
            .unwrap_or(false);

        if table_exists {
            // Delete existing data and insert from backup
            conn.execute(&format!("DELETE FROM main.{}", table), [])?;
            conn.execute(
                &format!(
                    "INSERT INTO main.{} SELECT * FROM backup_db.{}",
                    table, table
                ),
                [],
            )?;
        }
    }

    // Count restored items
    let books_restored: usize =
        conn.query_row("SELECT COUNT(*) FROM books", [], |row| row.get(0))?;
    let annotations_restored: usize =
        conn.query_row("SELECT COUNT(*) FROM annotations", [], |row| row.get(0))?;
    let collections_restored: usize =
        conn.query_row("SELECT COUNT(*) FROM collections", [], |row| row.get(0))?;

    conn.execute_batch("DETACH DATABASE backup_db")?;

    // Clean up temp database
    fs::remove_file(&temp_db_path)?;

    // Extract covers
    let covers_dir = app_data_dir.join("covers");
    fs::create_dir_all(&covers_dir)?;

    let mut covers_restored = 0;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let file_path = file.name().to_string();

        if file_path.starts_with("covers/") && !file_path.ends_with('/') {
            let relative_path = file_path.strip_prefix("covers/").unwrap();
            let target_path = covers_dir.join(relative_path);

            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)?;
            }

            let mut target_file = File::create(&target_path)?;
            std::io::copy(&mut file, &mut target_file)?;
            covers_restored += 1;
        }
    }

    // Extract books if present
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let file_path = file.name().to_string();

        if file_path.starts_with("books/") && !file_path.ends_with('/') {
            let filename = file_path.strip_prefix("books/").unwrap();

            // Save to storage/books directory
            let storage_books_dir = app_data_dir.join("storage").join("books");
            fs::create_dir_all(&storage_books_dir)?;

            let target_path = storage_books_dir.join(filename);
            let mut target_file = File::create(&target_path)?;
            std::io::copy(&mut file, &mut target_file)?;
        }
    }

    // Extract frontend settings if present
    let mut frontend_settings = None;
    let settings_result = archive.by_name("settings/frontend_settings.json");
    if let Ok(mut settings_file) = settings_result {
        let mut settings_content = String::new();
        settings_file.read_to_string(&mut settings_content)?;
        frontend_settings = Some(settings_content);
    }

    Ok(RestoreInfo {
        books_restored,
        annotations_restored,
        collections_restored,
        covers_restored,
        settings_restored: frontend_settings.is_some(),
        frontend_settings,
    })
}

/// Get backup information without restoring
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
