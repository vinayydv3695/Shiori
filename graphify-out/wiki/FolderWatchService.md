# FolderWatchService

> 28 nodes · cohesion 0.14

## Key Concepts

- **FolderWatchService** (25 connections) — `src-tauri/src/services/folder_watch.rs`
- **.handle_file_event()** (12 connections) — `src-tauri/src/services/folder_watch.rs`
- **folder_watch.rs** (10 connections) — `src-tauri/src/services/folder_watch.rs`
- **HashSet** (9 connections)
- **.new()** (6 connections) — `src-tauri/src/services/folder_watch.rs`
- **Result** (6 connections)
- **.add_watch_folder()** (5 connections) — `src-tauri/src/services/folder_watch.rs`
- **.start_watching()** (5 connections) — `src-tauri/src/services/folder_watch.rs`
- **.file_already_imported()** (4 connections) — `src-tauri/src/services/folder_watch.rs`
- **WatchFolder** (4 connections) — `src-tauri/src/services/folder_watch.rs`
- **.get_watch_folders()** (3 connections) — `src-tauri/src/services/folder_watch.rs`
- **.is_supported_format()** (3 connections) — `src-tauri/src/services/folder_watch.rs`
- **.is_system_directory()** (3 connections) — `src-tauri/src/services/folder_watch.rs`
- **Arc** (3 connections)
- **Mutex** (3 connections)
- **Path** (3 connections)
- **PathBuf** (3 connections)
- **WatchStatus** (3 connections) — `src-tauri/src/services/folder_watch.rs`
- **.get_watch_status()** (2 connections) — `src-tauri/src/services/folder_watch.rs`
- **.remove_watch_folder()** (2 connections) — `src-tauri/src/services/folder_watch.rs`
- **.stop_watching()** (2 connections) — `src-tauri/src/services/folder_watch.rs`
- **String** (2 connections)
- **Vec** (2 connections)
- **Debouncer** (1 connections)
- **FileIdMap** (1 connections)
- *... and 3 more nodes in this community*

## Relationships

- [Plugin](Plugin.md) (6 shared connections)
- [Database](Database.md) (6 shared connections)
- [FolderWatchState](FolderWatchState.md) (3 shared connections)
- [Duration](Duration.md) (1 shared connections)
- [Fb2FormatAdapter](Fb2FormatAdapter.md) (1 shared connections)

## Source Files

- `src-tauri/src/services/folder_watch.rs`

## Audit Trail

- EXTRACTED: 119 (95%)
- INFERRED: 6 (5%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*