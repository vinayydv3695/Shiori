use crate::error::Result;
use crate::services::folder_watch::{FolderWatchService, WatchFolder, WatchStatus};
use parking_lot::Mutex;
use std::sync::Arc;

pub struct FolderWatchState {
    pub service: Arc<Mutex<FolderWatchService>>,
}

impl FolderWatchState {
    pub fn new(service: FolderWatchService) -> Self {
        Self {
            service: Arc::new(Mutex::new(service)),
        }
    }
}

#[tauri::command]
pub fn start_folder_watch(state: tauri::State<FolderWatchState>) -> Result<()> {
    let service = state.service.lock();
    service.start_watching()
}

#[tauri::command]
pub fn stop_folder_watch(state: tauri::State<FolderWatchState>) -> Result<()> {
    let service = state.service.lock();
    service.stop_watching()
}

#[tauri::command]
pub fn add_watch_folder(
    path: String,
    enabled: bool,
    state: tauri::State<FolderWatchState>,
) -> Result<()> {
    let service = state.service.lock();
    service.add_watch_folder(path, enabled)
}

#[tauri::command]
pub fn remove_watch_folder(path: String, state: tauri::State<FolderWatchState>) -> Result<()> {
    let service = state.service.lock();
    service.remove_watch_folder(&path)
}

#[tauri::command]
pub fn get_watch_folders(state: tauri::State<FolderWatchState>) -> Result<Vec<WatchFolder>> {
    let service = state.service.lock();
    Ok(service.get_watch_folders())
}

#[tauri::command]
pub fn get_watch_status(state: tauri::State<FolderWatchState>) -> Result<WatchStatus> {
    let service = state.service.lock();
    Ok(service.get_watch_status())
}
