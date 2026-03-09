use crate::db::Database;
use crate::error::{Result, ShioriError};
use crate::services::library_service;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use parking_lot::Mutex;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

const SUPPORTED_FORMATS: &[&str] = &["epub", "pdf", "mobi", "azw3", "docx", "fb2", "cbz", "cbr"];

const SYSTEM_DIRS: &[&str] = &[
    "/",
    "/bin",
    "/boot",
    "/dev",
    "/etc",
    "/lib",
    "/proc",
    "/root",
    "/sbin",
    "/sys",
    "/usr",
    "/var",
    "C:\\Windows",
    "C:\\Program Files",
    "C:\\Program Files (x86)",
];

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct WatchFolder {
    pub path: String,
    pub enabled: bool,
}

pub struct FolderWatchService {
    db: Database,
    covers_dir: PathBuf,
    watch_folders: Arc<Mutex<Vec<WatchFolder>>>,
    debouncer: Arc<Mutex<Option<Debouncer<RecommendedWatcher, FileIdMap>>>>,
    processed_files: Arc<Mutex<HashSet<PathBuf>>>,
    is_running: Arc<Mutex<bool>>,
}

impl FolderWatchService {
    pub fn new(db: Database, covers_dir: PathBuf) -> Self {
        Self {
            db,
            covers_dir,
            watch_folders: Arc::new(Mutex::new(Vec::new())),
            debouncer: Arc::new(Mutex::new(None)),
            processed_files: Arc::new(Mutex::new(HashSet::new())),
            is_running: Arc::new(Mutex::new(false)),
        }
    }

    pub fn start_watching(&self) -> Result<()> {
        let mut is_running = self.is_running.lock();
        if *is_running {
            return Ok(());
        }

        let watch_folders = self.watch_folders.lock().clone();
        let enabled_folders: Vec<String> = watch_folders
            .iter()
            .filter(|f| f.enabled)
            .map(|f| f.path.clone())
            .collect();

        if enabled_folders.is_empty() {
            return Err(ShioriError::Other(
                "No enabled watch folders configured".to_string(),
            ));
        }

        let db = self.db.clone();
        let covers_dir = self.covers_dir.clone();
        let processed_files = Arc::clone(&self.processed_files);

        let mut debouncer = new_debouncer(
            Duration::from_secs(3),
            None,
            move |result: DebounceEventResult| match result {
                Ok(events) => {
                    for event in events {
                        if let Err(e) =
                            Self::handle_file_event(&event, &db, &covers_dir, &processed_files)
                        {
                            log::error!("Error handling file event: {}", e);
                        }
                    }
                }
                Err(errors) => {
                    for error in errors {
                        log::error!("Watch error: {:?}", error);
                    }
                }
            },
        )
        .map_err(|e| ShioriError::Other(format!("Failed to create debouncer: {}", e)))?;

        for folder_path in enabled_folders {
            let path = Path::new(&folder_path);
            if !path.exists() {
                log::warn!("Watch folder does not exist: {}", folder_path);
                continue;
            }

            if Self::is_system_directory(&folder_path) {
                log::error!("Refusing to watch system directory: {}", folder_path);
                continue;
            }

            debouncer
                .watcher()
                .watch(path, RecursiveMode::Recursive)
                .map_err(|e| {
                    ShioriError::Other(format!("Failed to watch {}: {}", folder_path, e))
                })?;

            log::info!("Now watching: {}", folder_path);
        }

        *self.debouncer.lock() = Some(debouncer);
        *is_running = true;

        Ok(())
    }

    pub fn stop_watching(&self) -> Result<()> {
        let mut debouncer_guard = self.debouncer.lock();
        if debouncer_guard.is_none() {
            return Ok(());
        }

        *debouncer_guard = None;
        *self.is_running.lock() = false;
        self.processed_files.lock().clear();

        log::info!("Folder watching stopped");
        Ok(())
    }

    pub fn add_watch_folder(&self, path: String, enabled: bool) -> Result<()> {
        if Self::is_system_directory(&path) {
            return Err(ShioriError::Other(format!(
                "Cannot watch system directory: {}",
                path
            )));
        }

        let path_obj = Path::new(&path);
        if !path_obj.exists() {
            return Err(ShioriError::Other(format!("Path does not exist: {}", path)));
        }

        if !path_obj.is_dir() {
            return Err(ShioriError::Other(format!(
                "Path is not a directory: {}",
                path
            )));
        }

        let mut folders = self.watch_folders.lock();

        if folders.iter().any(|f| f.path == path) {
            return Err(ShioriError::Other(format!(
                "Folder already being watched: {}",
                path
            )));
        }

        folders.push(WatchFolder { path, enabled });

        Ok(())
    }

    pub fn remove_watch_folder(&self, path: &str) -> Result<()> {
        let mut folders = self.watch_folders.lock();
        let initial_len = folders.len();
        folders.retain(|f| f.path != path);

        if folders.len() == initial_len {
            return Err(ShioriError::Other(format!(
                "Watch folder not found: {}",
                path
            )));
        }

        Ok(())
    }

    pub fn get_watch_folders(&self) -> Vec<WatchFolder> {
        self.watch_folders.lock().clone()
    }

    pub fn get_watch_status(&self) -> WatchStatus {
        let is_running = *self.is_running.lock();
        let folders = self.watch_folders.lock();
        let enabled_count = folders.iter().filter(|f| f.enabled).count();

        WatchStatus {
            is_running,
            watched_folders_count: folders.len(),
            enabled_folders_count: enabled_count,
        }
    }

    fn handle_file_event(
        event: &Event,
        db: &Database,
        covers_dir: &Path,
        processed_files: &Arc<Mutex<HashSet<PathBuf>>>,
    ) -> Result<()> {
        if !matches!(
            event.kind,
            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Access(_)
        ) {
            return Ok(());
        }

        for path in &event.paths {
            if !path.is_file() {
                continue;
            }

            if !Self::is_supported_format(path) {
                continue;
            }

            {
                let mut processed = processed_files.lock();
                if processed.contains(path) {
                    continue;
                }
                processed.insert(path.clone());
            }

            let path_str = path.to_string_lossy().to_string();

            if Self::file_already_imported(db, &path_str)? {
                log::debug!("File already imported, skipping: {}", path_str);
                continue;
            }

            log::info!("Importing new file: {}", path_str);

            match library_service::import_single_book(db, &path_str, covers_dir) {
                Ok(is_duplicate) => {
                    if is_duplicate {
                        log::info!("File is duplicate (by hash): {}", path_str);
                    } else {
                        log::info!("Successfully imported: {}", path_str);
                    }
                }
                Err(e) => {
                    log::error!("Failed to import {}: {}", path_str, e);
                }
            }
        }

        Ok(())
    }

    fn is_supported_format(path: &Path) -> bool {
        path.extension()
            .and_then(|e| e.to_str())
            .map(|ext| SUPPORTED_FORMATS.contains(&ext.to_lowercase().as_str()))
            .unwrap_or(false)
    }

    fn is_system_directory(path: &str) -> bool {
        SYSTEM_DIRS
            .iter()
            .any(|sys_dir| path == *sys_dir || path.starts_with(&format!("{}/", sys_dir)))
    }

    fn file_already_imported(db: &Database, path: &str) -> Result<bool> {
        let conn = db.get_connection()?;
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM books WHERE file_path = ?1)",
                rusqlite::params![path],
                |row| row.get(0),
            )
            .unwrap_or(false);
        Ok(exists)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct WatchStatus {
    pub is_running: bool,
    pub watched_folders_count: usize,
    pub enabled_folders_count: usize,
}
