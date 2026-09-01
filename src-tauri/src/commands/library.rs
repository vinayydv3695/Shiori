use crate::services::{ingest_service, library_service};
use crate::utils::validate;
use crate::{
    error::Result,
    models::{Book, ImportResult, IngestResult},
    AppState,
};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{Emitter, Manager, State};
use walkdir::WalkDir;

#[derive(Clone, Serialize)]
struct ScanProgressPayload {
    scanned: usize,
    total: usize,
    current_file: String,
}

#[derive(Clone, Serialize)]
struct ScanCompletePayload {
    total_indexed: usize,
    /// Files that could not be indexed (corrupt, tombstoned, …) — the scan
    /// continues past them and reports the count instead of aborting.
    failed: usize,
}

/// Uniform payload for the `library-updated` mutation event. `kind` is one
/// of `book-updated` | `books-imported` | `bulk-delete`; `ids` carries the
/// affected book row ids (empty when not cheaply available).
#[derive(Clone, Serialize)]
struct LibraryUpdatedPayload {
    kind: &'static str,
    ids: Vec<i64>,
}

/// Failure payload for the `download_failed` event — emitted right before the
/// LibGen/Gutenberg download commands return `Err`, so the frontend queue can
/// mark the item failed instead of leaving it "Downloading…" forever.
#[derive(Clone, Serialize)]
struct DownloadPayload {
    title: String,
    error: String,
}

/// Extensions a background scan accepts for a given content type. Public so
/// the scan tests can exercise the exact command-level filter.
pub fn allowed_extensions(content_type: &str) -> &'static [&'static str] {
    match content_type.trim().to_lowercase().as_str() {
        "manga" => &["cbz", "cbr", "zip"],
        "book" | "books" => &[
            "epub", "pdf", "mobi", "azw3", "txt", "docx", "fb2", "html", "htm", "md",
        ],
        "both" => &[
            "cbz", "cbr", "zip", "epub", "pdf", "mobi", "azw3", "txt", "docx", "fb2", "html",
            "htm", "md",
        ],
        _ => &[
            "cbz", "cbr", "zip", "epub", "pdf", "mobi", "azw3", "txt", "docx", "fb2", "html",
            "htm", "md",
        ],
    }
}

#[tauri::command]
pub fn start_background_scan(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    library_path: String,
    content_type: String,
) -> Result<()> {
    validate::require_safe_path(&library_path, "library_path")?;
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        use std::path::Path;

        let root = Path::new(&library_path);
        if !root.exists() || !root.is_dir() {
            let _ = app.emit(
                "scan_complete",
                ScanCompletePayload {
                    total_indexed: 0,
                    failed: 0,
                },
            );
            return;
        }

        let allowed = allowed_extensions(&content_type);
        let matching_files: Vec<String> = WalkDir::new(root)
            .into_iter()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().is_file())
            .filter_map(|entry| {
                let ext = entry.path().extension()?.to_str()?.to_lowercase();
                if allowed.contains(&ext.as_str()) {
                    Some(entry.path().to_string_lossy().to_string())
                } else {
                    None
                }
            })
            .collect();

        let total = matching_files.len();
        // Ingest through the same idempotent pipeline the import commands use
        // (path/hash dedup before hashing — a rescan is cheap and never
        // duplicates). Serial on purpose: import_single_book's dedup is
        // check-then-insert, so concurrent ingests of identical files could
        // race into duplicate rows.
        let outcomes = library_service::ingest_directory_scan(&db, &covers_dir, &matching_files);

        let mut total_indexed = 0usize;
        let mut failed = 0usize;
        let mut inserted_ids: Vec<i64> = Vec::new();
        for (idx, (file, outcome)) in matching_files.iter().zip(&outcomes).enumerate() {
            match outcome {
                library_service::ScanFileOutcome::Inserted { book_id } => {
                    total_indexed += 1;
                    inserted_ids.push(*book_id);
                }
                library_service::ScanFileOutcome::AlreadyIndexed => total_indexed += 1,
                library_service::ScanFileOutcome::Failed { .. } => failed += 1,
            }
            let _ = app.emit(
                "scan_progress",
                ScanProgressPayload {
                    scanned: idx + 1,
                    total,
                    current_file: file.clone(),
                },
            );
        }

        let _ = app.emit(
            "scan_complete",
            ScanCompletePayload {
                total_indexed,
                failed,
            },
        );
        // A scan that ingested books is a library mutation — same event the
        // import commands fire, so the frontend refreshes once.
        let _ = app.emit(
            "library-updated",
            LibraryUpdatedPayload {
                kind: "books-imported",
                ids: inserted_ids,
            },
        );
    });

    Ok(())
}

/// Drain the `RunEvent::Opened` URL buffer (Slice 2).
///
/// On a cold start the webview isn't listening when the OS delivers the
/// "open with" intent, so `lib.rs` buffers the URLs in `AppState` and emits
/// the `opened` event for warm starts. The frontend polls this once on mount
/// to cover the cold-start race.
#[tauri::command]
pub fn take_opened_urls(state: State<AppState>) -> Result<Vec<String>> {
    let mut opened = state
        .opened_urls
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    Ok(std::mem::take(&mut *opened))
}

/// Ingest one "Open with Shiori" file into the managed library (Slice 2).
///
/// Platform resolution: on Android the `content://` URI is copied into an
/// app-private staging path via the local android-saf plugin's
/// `copy_document`; on desktop the url is treated as a filesystem path. The
/// rest of the pipeline (`ingest_service::ingest_opened_file`) is
/// platform-agnostic and free of `AppHandle`.
#[tauri::command]
pub async fn ingest_opened_file(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<IngestResult> {
    validate::require_non_empty(&url, "url")?;
    log::info!("[command::ingest_opened_file] opening: {}", url);

    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    let app_data_dir = state
        .covers_dir
        .parent()
        .unwrap_or(&state.covers_dir)
        .to_path_buf();

    // Resolve the incoming url to a local readable file. On Android this
    // streams the content:// URI into app-private storage (can be slow for
    // large books) — hence spawn_blocking.
    let app_for_resolve = app.clone();
    let url_for_resolve = url.clone();
    let (source_path, source_name, cleanup_source) =
        tokio::task::spawn_blocking(move || resolve_opened_url(&app_for_resolve, &url_for_resolve))
            .await
            .map_err(|e| crate::error::ShioriError::Other(e.to_string()))??;

    // Mode B (SAF): if the managed root is a user-chosen SAF tree and the
    // Android bridge is installed, push the managed copy into the tree after
    // a successful ingest (best-effort — see ingest_service::SafPush).
    // Computed here so the owned uri outlives the spawn_blocking closure.
    let saf_push_owned: Option<(String, &'static dyn crate::services::saf::SafTree)> = {
        use crate::services::library_root::ManagedRoot;
        match crate::services::library_root::resolve_managed_root(&db, &app_data_dir) {
            Ok(ManagedRoot::Saf { uri, .. }) => {
                crate::services::saf::saf_tree().map(|tree| (uri, tree))
            }
            _ => None,
        }
    };

    let result = tokio::task::spawn_blocking(move || {
        let saf_push = saf_push_owned.as_ref().map(|(uri, tree)| {
            ingest_service::SafPush {
                tree_uri: uri.as_str(),
                tree: *tree,
            }
        });
        ingest_service::ingest_opened_file(
            &db,
            &covers_dir,
            &app_data_dir,
            &url,
            &source_path,
            &source_name,
            cleanup_source,
            saf_push,
        )
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(e.to_string()))??;

    let _ = app.emit(
        "library-updated",
        LibraryUpdatedPayload {
            kind: "books-imported",
            ids: result.book_id.map(|id| vec![id]).unwrap_or_default(),
        },
    );
    Ok(result)
}

/// Android: stream the `content://` URI into an app-private staging file via
/// the local android-saf plugin, and derive a candidate name for extension
/// detection. The staging file is cleaned up by the ingest pipeline.
#[cfg(target_os = "android")]
fn resolve_opened_url(app: &tauri::AppHandle, url: &str) -> Result<(PathBuf, String, bool)> {
    use tauri_plugin_android_saf::AndroidSafExt;

    let name = ingest_service::candidate_name_from_url(url);
    let resp = app
        .android_saf()
        .copy_document(url.to_string(), name.clone())
        .map_err(|e| {
            crate::error::ShioriError::Other(format!(
                "Failed to copy opened document {}: {}",
                url, e
            ))
        })?;
    log::info!(
        "[command::ingest_opened_file] android-saf staged {} → {}",
        url,
        resp.path
    );
    Ok((PathBuf::from(resp.path), name, true))
}

/// Desktop: the url is a plain filesystem path. (RunEvent::Opened never
/// fires on Linux desktop — this arm exists so the pipeline is testable and
/// harmless on other desktop platforms.)
#[cfg(not(target_os = "android"))]
fn resolve_opened_url(_app: &tauri::AppHandle, url: &str) -> Result<(PathBuf, String, bool)> {
    let path = PathBuf::from(url);
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok((path, name, false))
}

#[tauri::command]
pub async fn get_books(state: State<'_, AppState>, limit: u32, offset: u32) -> Result<Vec<Book>> {
    let db = &state.db;
    library_service::get_all_books(db, limit, offset)
}

#[tauri::command]
pub async fn get_books_by_paths(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<Book>> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || library_service::get_books_by_paths(&db, paths))
        .await
        .map_err(|e| crate::error::ShioriError::Other(format!("Task panicked: {}", e)))?
}

#[tauri::command]
pub async fn get_total_books(state: State<'_, AppState>) -> Result<i64> {
    let db = &state.db;
    library_service::get_total_books(db)
}

#[tauri::command]
pub fn get_book(state: State<AppState>, id: i64) -> Result<Book> {
    validate::require_positive_id(id, "book id")?;
    let db = &state.db;
    library_service::get_book_by_id(db, id)
}

#[tauri::command]
pub async fn add_book(state: State<'_, AppState>, book: Book) -> Result<i64> {
    validate::require_non_empty(&book.title, "title")?;
    validate::require_max_length(&book.title, 1000, "title")?;
    validate::require_non_empty(&book.file_path, "file_path")?;
    validate::require_safe_path(&book.file_path, "file_path")?;
    validate::require_non_empty(&book.file_format, "file_format")?;
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || library_service::add_book(&db, book))
        .await
        .map_err(|e| crate::error::ShioriError::Other(format!("Task panicked: {}", e)))?
}

#[tauri::command]
pub async fn update_book(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    book: Book,
) -> Result<()> {
    if let Some(id) = book.id {
        validate::require_positive_id(id, "book id")?;
    }
    validate::require_non_empty(&book.title, "title")?;
    validate::require_max_length(&book.title, 1000, "title")?;
    validate::require_non_empty(&book.file_path, "file_path")?;
    validate::require_safe_path(&book.file_path, "file_path")?;
    let db = state.db.clone();
    let book_id = book.id;
    tokio::task::spawn_blocking(move || library_service::update_book(&db, book))
        .await
        .map_err(|e| crate::error::ShioriError::Other(format!("Task panicked: {}", e)))??;
    if let Some(id) = book_id {
        let _ = app.emit(
            "library-updated",
            LibraryUpdatedPayload {
                kind: "book-updated",
                ids: vec![id],
            },
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_books(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    ids: Vec<i64>,
) -> Result<()> {
    validate::require_non_empty_vec(&ids, "book ids")?;
    for &id in &ids {
        validate::require_positive_id(id, "book id")?;
    }
    if ids.len() <= 10 {
        log::info!(
            "[command::delete_books] Received request to delete {} books: {:?}",
            ids.len(),
            ids
        );
    } else {
        log::info!(
            "[command::delete_books] Received request to delete {} books (sample: {:?}...)",
            ids.len(),
            &ids[..10]
        );
    }
    let db = state.db.clone();
    let ids_clone = ids.clone();
    let ids_for_event = ids.clone();
    let app_data_dir = state
        .covers_dir
        .parent()
        .unwrap_or(&state.covers_dir)
        .to_path_buf();
    let result =
        tokio::task::spawn_blocking(move || library_service::delete_books(&db, ids, &app_data_dir))
            .await
            .map_err(|e| crate::error::ShioriError::Other(format!("Task panicked: {}", e)))?;
    match &result {
        Ok(_) => log::info!(
            "[command::delete_books] Successfully deleted {} books",
            ids_clone.len()
        ),
        Err(e) => log::error!("[command::delete_books] Failed to delete books: {:?}", e),
    }
    if result.is_ok() {
        let _ = app.emit(
            "library-updated",
            LibraryUpdatedPayload {
                kind: "bulk-delete",
                ids: ids_for_event,
            },
        );
    }
    result
}

#[tauri::command]
pub async fn delete_book(state: State<'_, AppState>, id: i64) -> Result<()> {
    validate::require_positive_id(id, "book id")?;
    log::info!(
        "[command::delete_book] Received request to delete book id: {}",
        id
    );
    let db = state.db.clone();
    let app_data_dir = state
        .covers_dir
        .parent()
        .unwrap_or(&state.covers_dir)
        .to_path_buf();
    let result =
        tokio::task::spawn_blocking(move || library_service::delete_book(&db, id, &app_data_dir))
            .await
            .map_err(|e| crate::error::ShioriError::Other(format!("Task panicked: {}", e)))?;
    match &result {
        Ok(_) => log::info!(
            "[command::delete_book] Successfully deleted book id: {}",
            id
        ),
        Err(e) => log::error!(
            "[command::delete_book] Failed to delete book id {}: {:?}",
            id,
            e
        ),
    }
    result
}

#[tauri::command]
pub async fn restore_book(state: State<'_, AppState>, id: i64) -> Result<()> {
    validate::require_positive_id(id, "book id")?;
    log::info!(
        "[command::restore_book] Received request to restore book id: {}",
        id
    );
    let db = state.db.clone();
    let result =
        tokio::task::spawn_blocking(move || library_service::restore_book(&db, id))
            .await
            .map_err(|e| crate::error::ShioriError::Other(format!("Task panicked: {}", e)))?;
    match &result {
        Ok(_) => log::info!(
            "[command::restore_book] Successfully restored book id: {}",
            id
        ),
        Err(e) => log::error!(
            "[command::restore_book] Failed to restore book id {}: {:?}",
            id,
            e
        ),
    }
    result
}

#[tauri::command]
pub async fn permanent_delete_book(state: State<'_, AppState>, id: i64) -> Result<()> {
    validate::require_positive_id(id, "book id")?;
    log::info!(
        "[command::permanent_delete_book] Received request to permanently delete book id: {}",
        id
    );
    let db = state.db.clone();
    let app_data_dir = state
        .covers_dir
        .parent()
        .unwrap_or(&state.covers_dir)
        .to_path_buf();
    let result = tokio::task::spawn_blocking(move || {
        library_service::permanent_delete_book(&db, id, &app_data_dir)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(format!("Task panicked: {}", e)))?;
    match &result {
        Ok(_) => log::info!(
            "[command::permanent_delete_book] Successfully deleted book id: {}",
            id
        ),
        Err(e) => log::error!(
            "[command::permanent_delete_book] Failed to delete book id {}: {:?}",
            id,
            e
        ),
    }
    result
}

#[tauri::command]
pub fn clear_tombstone(
    state: State<AppState>,
    file_path: String,
    file_hash: Option<String>,
) -> Result<()> {
    validate::require_non_empty(&file_path, "file_path")?;
    log::info!(
        "[command::clear_tombstone] Forgetting deletion for path: {}",
        file_path
    );
    let db = &state.db;
    library_service::clear_tombstone(db, &file_path, file_hash.as_deref())
}

#[tauri::command]
pub async fn empty_trash(state: State<'_, AppState>) -> Result<()> {
    log::info!("[command::empty_trash] Received request to empty trash");
    let db = state.db.clone();
    // convert_book writes to {app_data_dir}/converted; covers_dir is
    // {app_data_dir}/covers, so the converted root is its sibling.
    let converted_root = state
        .covers_dir
        .parent()
        .unwrap_or(&state.covers_dir)
        .join("converted");
    let result = tokio::task::spawn_blocking(move || {
        library_service::empty_trash(&db, &converted_root)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(format!("Task panicked: {}", e)))?;
    match &result {
        Ok(_) => log::info!("[command::empty_trash] Successfully emptied trash"),
        Err(e) => log::error!("[command::empty_trash] Failed to empty trash: {:?}", e),
    }
    result
}

#[tauri::command]
pub async fn clean_up_database(state: State<'_, AppState>) -> Result<(usize, usize)> {
    log::info!("[command::clean_up_database] Received request to clean up database");
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    // Full covers-dir walk + per-orphan removes — offload so a big library
    // doesn't freeze the UI.
    let app_data_dir = state
        .covers_dir
        .parent()
        .unwrap_or(&state.covers_dir)
        .to_path_buf();

    let result = tauri::async_runtime::spawn_blocking(move || {
        // Clean up recycle bin automatically
        if let Err(e) = library_service::clean_recycle_bin(&db, &app_data_dir) {
            log::error!(
                "[command::clean_up_database] Failed to clean recycle bin: {:?}",
                e
            );
        }

        library_service::cleanup_database(&db, &covers_dir)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;

    match &result {
        Ok((books, covers)) => log::info!(
            "[command::clean_up_database] Successfully cleaned up {} missing books and {} unused covers",
            books,
            covers
        ),
        Err(e) => log::error!(
            "[command::clean_up_database] Failed to clean up database: {:?}",
            e
        ),
    }
    result
}

#[tauri::command]
pub async fn import_books(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    metadata_state: State<'_, crate::MetadataState>,
    paths: Vec<String>,
) -> Result<ImportResult> {
    validate::require_non_empty_vec(&paths, "file paths")?;
    // Per-path safety validation happens inside library_service::import_books so that one
    // unsafe/invalid path is recorded as a failed entry instead of aborting the whole batch
    // (see library_service::import_books).
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    let result =
        tokio::task::spawn_blocking(move || library_service::import_books(&db, paths, &covers_dir))
            .await
            .map_err(|e| crate::error::ShioriError::Other(e.to_string()))??;

    enqueue_auto_metadata(&state.db, &metadata_state.sender, &result.success).await;

    // One indexed SELECT per success path (same shape as the per-path query
    // enqueue_auto_metadata already runs) — cheap enough to give the frontend
    // real ids for the imported rows.
    let _ = app_handle.emit(
        "library-updated",
        LibraryUpdatedPayload {
            kind: "books-imported",
            ids: imported_book_ids(&state.db, &result.success),
        },
    );
    Ok(result)
}

#[tauri::command]
pub async fn scan_folder_unified(
    state: State<'_, AppState>,
    metadata_state: State<'_, crate::MetadataState>,
    folder_path: String,
) -> Result<ImportResult> {
    validate::require_safe_path(&folder_path, "folder path")?;
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    let folder_path_clone = folder_path.clone();

    let result = tokio::task::spawn_blocking(move || {
        library_service::scan_and_import_folder(&db, &folder_path_clone, &covers_dir)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(e.to_string()))??;

    let db = &state.db;
    let conn = db.get_connection()?;
    let auto_group: bool = conn
        .query_row(
            "SELECT auto_group_manga FROM user_preferences WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(true);

    if auto_group {
        let _ = crate::commands::manga::auto_group_manga_volumes(state.clone()).await;
    }

    enqueue_auto_metadata(&db, &metadata_state.sender, &result.success).await;

    Ok(result)
}

use crate::services::manga_metadata_service::parse_manga_title;
use crate::services::online::provider::{ItemType, MetadataQuery};
use crate::services::online::worker::MetadataJob;

/// Cheap id lookup for a freshly imported batch: one indexed SELECT per
/// success path. Any lookup failure degrades to an empty id (the event still
/// fires — ids are an optimization for the frontend, not a contract).
fn imported_book_ids(db: &crate::db::Database, success_paths: &[String]) -> Vec<i64> {
    let mut ids = Vec::with_capacity(success_paths.len());
    let Ok(conn) = db.get_connection() else {
        return ids;
    };
    let Ok(mut stmt) = conn.prepare("SELECT id FROM books WHERE file_path = ?1 AND in_trash = 0")
    else {
        return ids;
    };
    for path in success_paths {
        if let Ok(id) = stmt.query_row(rusqlite::params![path], |row| row.get(0)) {
            ids.push(id);
        }
    }
    ids
}

async fn enqueue_auto_metadata(
    db: &crate::db::Database,
    sender: &tokio::sync::mpsc::Sender<MetadataJob>,
    success_paths: &[String],
) {
    if success_paths.is_empty() {
        return;
    }

    let conn_res = db.get_connection();
    if conn_res.is_err() {
        return;
    }
    let conn = conn_res.unwrap();

    let mut jobs = Vec::new();

    for path in success_paths {
        if let Ok(mut stmt) = conn.prepare("SELECT id, title, isbn, file_format, (SELECT name FROM book_authors ba JOIN authors a ON ba.author_id = a.id WHERE ba.book_id = books.id LIMIT 1) as author FROM books WHERE file_path = ?1") {
            if let Ok(mut rows) = stmt.query(rusqlite::params![path]) {
                if let Ok(Some(row)) = rows.next() {
                    let book_id: i64 = row.get(0).unwrap_or(0);
                    let title: String = row.get(1).unwrap_or_default();
                    let isbn: Option<String> = row.get(2).unwrap_or(None);
                    let file_format: String = row.get(3).unwrap_or_default();
                    let author: Option<String> = row.get(4).unwrap_or(None);

                    if book_id > 0 {
                        let is_manga = matches!(file_format.to_lowercase().as_str(), "cbz" | "cbr");
                        let query = if is_manga {
                            MetadataQuery::Title(parse_manga_title(&title))
                        } else if let Some(isbn_val) = isbn {
                            MetadataQuery::Isbn(isbn_val)
                        } else {
                            MetadataQuery::TitleAuthor { title, author }
                        };

                        let item_type = if is_manga { ItemType::Manga } else { ItemType::Book };
                        jobs.push(MetadataJob {
                            item_id: book_id,
                            item_type,
                            query,
                            force_refresh: false,
                        });
                    }
                }
            }
        }
    }

    // Explicitly drop the connection before awaiting to ensure Send bounds are met
    drop(conn);

    for job in jobs {
        let _ = sender.send(job).await;
    }
}

#[tauri::command]
pub async fn import_manga(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<ImportResult> {
    validate::require_non_empty_vec(&paths, "file paths")?;
    // Per-path safety validation happens inside library_service::import_manga so that one
    // unsafe/invalid path (or one failed download) is recorded as a failed entry instead of
    // aborting the whole batch (see library_service::import_manga).
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();

    let result =
        tokio::task::spawn_blocking(move || library_service::import_manga(&db, paths, &covers_dir))
            .await
            .map_err(|e| crate::error::ShioriError::Other(e.to_string()))??;

    let db = &state.db;
    let conn = db.get_connection()?;
    let auto_group: bool = conn
        .query_row(
            "SELECT auto_group_manga FROM user_preferences WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(true);

    let imported_ids = imported_book_ids(&state.db, &result.success);

    if auto_group {
        let _ = crate::commands::manga::auto_group_manga_volumes(state).await;
    }

    let _ = app_handle.emit(
        "library-updated",
        LibraryUpdatedPayload {
            kind: "books-imported",
            ids: imported_ids,
        },
    );
    Ok(result)
}

#[tauri::command]
pub async fn scan_folder_for_manga(
    state: State<'_, AppState>,
    folder_path: String,
) -> Result<ImportResult> {
    validate::require_safe_path(&folder_path, "folder path")?;
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    let folder_path_clone = folder_path.clone();

    let result = tokio::task::spawn_blocking(move || {
        library_service::scan_folder_for_manga(&db, &folder_path_clone, &covers_dir)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(e.to_string()))??;

    let db = &state.db;
    let conn = db.get_connection()?;
    let auto_group: bool = conn
        .query_row(
            "SELECT auto_group_manga FROM user_preferences WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(true);

    if auto_group {
        let _ = crate::commands::manga::auto_group_manga_volumes(state).await;
    }

    Ok(result)
}

#[tauri::command]
pub async fn import_comics(state: State<'_, AppState>, paths: Vec<String>) -> Result<ImportResult> {
    validate::require_non_empty_vec(&paths, "file paths")?;
    // Per-path safety validation happens inside library_service::import_comics so that one
    // unsafe/invalid path is recorded as a failed entry instead of aborting the whole batch
    // (see library_service::import_comics).
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    tokio::task::spawn_blocking(move || library_service::import_comics(&db, paths, &covers_dir))
        .await
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn scan_folder_for_comics(
    state: State<'_, AppState>,
    folder_path: String,
) -> Result<ImportResult> {
    validate::require_safe_path(&folder_path, "folder path")?;
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    tokio::task::spawn_blocking(move || {
        library_service::scan_folder_for_comics(&db, &folder_path, &covers_dir)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_book_summaries(
    state: State<'_, AppState>,
    limit: u32,
    offset: u32,
) -> Result<Vec<crate::models::BookSummary>> {
    let db = &state.db;
    crate::services::library_service::get_book_summaries(db, limit, offset)
}

#[tauri::command]
pub async fn get_book_summaries_by_domain(
    state: State<'_, AppState>,
    domain: String,
    limit: u32,
    offset: u32,
) -> Result<Vec<crate::models::BookSummary>> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        crate::services::library_service::get_book_summaries_by_domain(&db, &domain, limit, offset)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(format!("Task panicked: {}", e)))?
}

#[tauri::command]
pub async fn get_books_by_domain(
    state: State<'_, AppState>,
    domain: String,
    limit: u32,
    offset: u32,
) -> Result<Vec<Book>> {
    validate::require_one_of(&domain, &["books", "manga", "comics", "all"], "domain")?;
    let db = &state.db;
    library_service::get_books_by_domain(db, &domain, limit, offset)
}

#[tauri::command]
pub fn get_total_books_by_domain(state: State<'_, AppState>, domain: String) -> Result<i64> {
    validate::require_one_of(&domain, &["books", "manga", "comics", "all"], "domain")?;
    let db = &state.db;
    library_service::get_total_books_by_domain(db, &domain)
}

#[tauri::command]
pub fn reset_database(state: State<'_, AppState>) -> Result<()> {
    let db = &state.db;
    library_service::reset_database(db)
}

#[tauri::command]
pub fn update_reading_status(
    app_state: State<'_, AppState>,
    book_id: i64,
    status: String,
) -> Result<()> {
    validate::require_positive_id(book_id, "book id")?;
    validate::require_one_of(
        &status,
        &["planning", "reading", "completed", "on_hold", "dropped"],
        "reading status",
    )?;
    library_service::update_reading_status(&app_state.db, book_id, &status)
}

#[tauri::command]
pub async fn get_books_by_reading_status(
    app_state: State<'_, AppState>,
    status: String,
    limit: u32,
    offset: u32,
) -> Result<Vec<Book>> {
    validate::require_one_of(
        &status,
        &["planning", "reading", "completed", "on_hold", "dropped"],
        "reading status",
    )?;
    let db = app_state.db.clone();
    tokio::task::spawn_blocking(move || {
        library_service::get_books_by_reading_status(&db, &status, limit, offset)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(format!("Task panicked: {}", e)))?
}

#[tauri::command]
pub fn get_reading_history(
    app_state: State<'_, AppState>,
    limit: u32,
    offset: u32,
) -> Result<Vec<Book>> {
    library_service::get_reading_history(&app_state.db, limit, offset)
}

#[tauri::command]
pub async fn find_duplicate_books(
    criteria: String,
    threshold: Option<f32>,
    state: State<'_, AppState>,
) -> Result<Vec<Vec<Book>>> {
    let db = &state.db;
    let books = crate::services::library_service::get_all_books(db, u32::MAX, 0)?;

    let duplicates = tokio::task::spawn_blocking(move || {
        let threshold = threshold.unwrap_or(0.8);
        // Bucket-based grouping (see find_duplicate_groups): replaces the
        // old O(n²) all-pairs jaro-winkler loop. Report shape unchanged:
        // Vec<Vec<Book>> — the frontend's DuplicateFinderDialog consumes
        // Book fields (title/authors/file_format/file_size/file_path/
        // file_hash/publisher/added_date) and group[0] as the "keep" pick.
        crate::services::library_service::find_duplicate_groups(&books, &criteria, threshold)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;

    Ok(duplicates)
}

#[tauri::command]
pub async fn download_gutenberg_epub(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
    url: String,
    title_hint: String,
) -> Result<String> {
    use futures::StreamExt;
    use std::io::Write;
    use std::time::Duration;
    use tauri::Manager;

    // No total request timeout (reqwest's `timeout()` aborts slow large
    // downloads MID-STREAM). Use a connect timeout plus a per-chunk idle
    // watchdog: 60s without a single chunk means a stalled connection.
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| {
            let msg = e.to_string();
            let _ = app_handle.emit(
                "download_failed",
                DownloadPayload {
                    title: title_hint.clone(),
                    error: msg.clone(),
                },
            );
            crate::error::ShioriError::Other(msg)
        })?;
    let total_bytes = resp.content_length();

    let safe_title = title_hint
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == ' ' || *c == '-')
        .collect::<String>();
    let file_name = format!("{}.epub", safe_title.trim());

    let prefs = crate::commands::preferences::get_user_preferences(state.clone()).await?;
    let downloads_dir = if !prefs.default_import_path.is_empty()
        && !prefs.default_import_path.starts_with("content://")
    {
        std::path::PathBuf::from(&prefs.default_import_path).join("Online Books")
    } else {
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| crate::error::ShioriError::Other(format!("Failed to get app dir: {}", e)))?
            .join("downloads")
    };
    let _download_guard =
        crate::ActiveDownloads::increment(app_handle.state::<crate::ActiveDownloads>());
    std::fs::create_dir_all(&downloads_dir)
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;

    let file_path = downloads_dir.join(file_name);

    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;

    let mut downloaded_bytes = 0u64;
    let mut stream = resp.bytes_stream();
    let target_id = url.clone();

    let mut last_emit = std::time::Instant::now();

    // Local helper: surface the failure to the frontend queue, then build the
    // ShioriError. Without it the item would stay "Downloading…" forever.
    let fail = |msg: String| -> crate::error::ShioriError {
        let _ = app_handle.emit(
            "download_failed",
            DownloadPayload {
                title: title_hint.clone(),
                error: msg.clone(),
            },
        );
        crate::error::ShioriError::Other(msg)
    };

    loop {
        // Per-chunk idle watchdog: no chunk within 60s = stalled connection.
        let chunk_result =
            match tokio::time::timeout(Duration::from_secs(60), stream.next()).await {
                Ok(Some(chunk)) => chunk,
                Ok(None) => break,
                Err(_) => {
                    return Err(fail(
                        "Download stalled: no data received for 60s (connection timed out)."
                            .to_string(),
                    ))
                }
            };
        let chunk = match chunk_result {
            Ok(chunk) => chunk,
            Err(e) => return Err(fail(format!("Download failed: {}", e))),
        };
        if let Err(e) = file.write_all(&chunk) {
            return Err(fail(format!("Failed to write download to disk: {}", e)));
        }
        downloaded_bytes += chunk.len() as u64;

        if last_emit.elapsed().as_millis() > 100 {
            let payload = serde_json::json!({
                "target_id": target_id,
                "status": "downloading",
                "downloaded_bytes": downloaded_bytes,
                "total_bytes": total_bytes
            });
            let _ = app_handle.emit("online-book-download-progress", payload);
            last_emit = std::time::Instant::now();
        }
    }

    let completed_payload = serde_json::json!({
        "target_id": target_id,
        "status": "completed",
        "downloaded_bytes": downloaded_bytes,
        "total_bytes": total_bytes
    });
    let _ = app_handle.emit("online-book-download-progress", completed_payload);

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn download_libgen_epub(
    app_handle: tauri::AppHandle,
    url: String, // This is a serialized JSON array of mirrors
    title_hint: String,
    format_ext: Option<String>,
) -> Result<String> {
    use futures::StreamExt;
    use std::io::Write;
    use std::time::Duration;

    let all_mirrors: Vec<String> = serde_json::from_str(&url).unwrap_or_else(|_| vec![url.clone()]);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;

    // Helper to try and extract md5 (mirrors libgen.rs extract_md5_from_url)
    let extract_md5 = |url: &str| -> Option<String> {
        if let Ok(re) = regex::Regex::new(r#"(?i)md5=([a-f0-9]{32})"#) {
            if let Some(caps) = re.captures(url) {
                return Some(caps.get(1).unwrap().as_str().to_string());
            }
        }
        if let Ok(re) = regex::Regex::new(r#"(?i)/main/(?:[0-9]+/)?([a-f0-9]{32})"#) {
            if let Some(caps) = re.captures(url) {
                return Some(caps.get(1).unwrap().as_str().to_ascii_lowercase());
            }
        }
        None
    };

    let safe_title = title_hint
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == ' ' || *c == '-')
        .collect::<String>();
    let ext = format_ext
        .unwrap_or_else(|| "epub".to_string())
        .replace(".", "")
        .to_lowercase();
    let file_name = format!("{}.{}", safe_title.trim(), ext);

    let state = app_handle.state::<AppState>();
    let prefs = crate::commands::preferences::get_user_preferences(state.clone()).await?;
    let downloads_dir = if !prefs.default_import_path.is_empty()
        && !prefs.default_import_path.starts_with("content://")
    {
        std::path::PathBuf::from(&prefs.default_import_path).join("Online Books")
    } else {
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| crate::error::ShioriError::Other(format!("Failed to get app dir: {}", e)))?
            .join("downloads")
    };
    std::fs::create_dir_all(&downloads_dir)
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;

    let file_path = downloads_dir.join(file_name);
    let target_id = all_mirrors.first().cloned().unwrap_or(url);

    let _download_guard =
        crate::ActiveDownloads::increment(app_handle.state::<crate::ActiveDownloads>());

    // Every successfully-fetched (non-HTML) candidate — the get.php attempt
    // plus each mirror. Unlike the old single-`resp_opt` flow, a mid-stream
    // failure on one candidate falls back to the next instead of failing the
    // whole command. Each is streamed fresh (no byte-range resume).
    let mut resp_list: Vec<reqwest::Response> = Vec::new();
    let mut bad_download_reason: Option<String> = None;

    // Attempt 1: Try get.php from libgen.li (bypasses Cloudflare entirely)
    if let Some(md5) = extract_md5(&all_mirrors.first().cloned().unwrap_or_default()) {
        let ads_url = format!("https://libgen.li/ads.php?md5={}", md5);
        if let Ok(ads_resp) = client.get(&ads_url).send().await {
            if let Ok(text) = ads_resp.text().await {
                if let Ok(re) =
                    regex::Regex::new(r#"(?i)href=["']([^"']*get\.php\?md5=[^"']+)["']"#)
                {
                    if let Some(caps) = re.captures(&text) {
                        let href = caps.get(1).unwrap().as_str();
                        let direct_url = if href.starts_with("http") {
                            href.to_string()
                        } else if href.starts_with("/") {
                            format!("https://libgen.li{}", href)
                        } else {
                            format!("https://libgen.li/{}", href)
                        };

                        if let Ok(file_resp) = client.get(&direct_url).send().await {
                            if file_resp.status().is_success() {
                                let content_type = file_resp
                                    .headers()
                                    .get(reqwest::header::CONTENT_TYPE)
                                    .and_then(|v| v.to_str().ok())
                                    .unwrap_or("");
                                if !content_type.contains("text/html") {
                                    // Queue the get.php candidate; it is streamed
                                    // (with the per-chunk watchdog + mirror
                                    // fallback) in the per-candidate loop below.
                                    resp_list.push(file_resp);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Attempt 2: mirror-scraping fallback. Always run — it queues mirror
    // candidates even when get.php already queued one; each is streamed and
    // verified in order below, and mid-stream failures fall back to the next.
    for mirror_url in &all_mirrors {
            if mirror_url.trim().is_empty() {
                continue;
            }
            let mut download_url = mirror_url.clone();

            // 1. If it's a gateway, try to scrape it via proxy or directly
            if mirror_url.contains("library.lol")
                || mirror_url.contains("libgen.li")
                || mirror_url.contains("libgen.is")
            {
                let proxy1 = format!(
                    "https://api.allorigins.win/raw?url={}",
                    urlencoding::encode(mirror_url)
                );
                let proxy2 = format!(
                    "https://api.codetabs.com/v1/proxy?quest={}",
                    urlencoding::encode(mirror_url)
                );
                let proxy3 = format!("https://corsproxy.io/?{}", urlencoding::encode(mirror_url));

                // Try direct first, then proxies
                for fetch_url in &[mirror_url.clone(), proxy1, proxy2, proxy3] {
                    if let Ok(resp) = client.get(fetch_url).send().await {
                        if resp.status().is_success() {
                            if let Ok(text) = resp.text().await {
                                // 1. Try to get the very first link inside the <div id="download"> (usually the direct GET link)
                                if let Some(caps) = DOWNLOAD_DIV_RE.captures(&text) {
                                    download_url = caps.get(1).unwrap().as_str().to_string();
                                    break;
                                }

                                // 2. Try exact GET
                                if let Some(caps) = GET_EXACT_RE.captures(&text) {
                                    download_url = caps.get(1).unwrap().as_str().to_string();
                                    break;
                                }

                                // 3. Try IPFS / Cloudflare / Pinata links
                                if let Some(caps) = IPFS_LINK_RE.captures(&text) {
                                    download_url = caps.get(1).unwrap().as_str().to_string();
                                    break;
                                }

                                // 4. Try loose GET
                                if let Some(caps) = GET_LOOSE_RE.captures(&text) {
                                    download_url = caps.get(1).unwrap().as_str().to_string();
                                    break;
                                }
                            }
                        }
                    }
                }

                if download_url == *mirror_url {
                    continue; // failed to scrape anything
                }
            }

            // 2. Try to fetch the actual file from download_url. Keep every
            // successful (non-HTML) candidate — a later mid-stream failure falls
            // back to the next mirror instead of failing the whole download.
            if let Ok(file_resp) = client.get(&download_url).send().await {
                if file_resp.status().is_success() {
                    let content_type = file_resp
                        .headers()
                        .get(reqwest::header::CONTENT_TYPE)
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("");
                    if content_type.contains("text/html") {
                        continue; // STILL an HTML page
                    }
                    resp_list.push(file_resp);
                }
            }
        }

    // Local helper: surface the final failure to the frontend queue, then build
    // the ShioriError so items never hang on "Downloading…" forever.
    let fail = |msg: String| -> crate::error::ShioriError {
        let _ = app_handle.emit(
            "download_failed",
            DownloadPayload {
                title: title_hint.clone(),
                error: msg.clone(),
            },
        );
        crate::error::ShioriError::Other(msg)
    };

    // Stream each candidate in turn with a 60s per-chunk idle watchdog. A
    // mid-stream failure (timeout / io / abort) removes the partial file and
    // tries the next mirror; only after ALL candidates fail do we emit
    // `download_failed` and return Err.
    for resp in resp_list {
        let total_bytes = resp.content_length();
        let mut file = match std::fs::File::create(&file_path) {
            Ok(f) => f,
            Err(e) => {
                bad_download_reason = Some(format!("could not create file: {}", e));
                continue;
            }
        };

        let mut downloaded_bytes = 0u64;
        let mut stream = resp.bytes_stream();
        let mut last_emit = std::time::Instant::now();
        let mut stream_failed: Option<String> = None;

        loop {
            // 60s idle watchdog: no chunk within a minute = stalled connection.
            let chunk_result =
                match tokio::time::timeout(Duration::from_secs(60), stream.next()).await {
                    Ok(Some(chunk)) => chunk,
                    Ok(None) => break,
                    Err(_) => {
                        stream_failed =
                            Some("no data received for 60s (connection stalled)".to_string());
                        break;
                    }
                };
            match chunk_result {
                Ok(chunk) => {
                    if let Err(e) = file.write_all(&chunk) {
                        stream_failed = Some(format!("failed to write to disk: {}", e));
                        break;
                    }
                    downloaded_bytes += chunk.len() as u64;

                    if last_emit.elapsed().as_millis() > 100 {
                        let payload = serde_json::json!({
                            "target_id": target_id,
                            "status": "downloading",
                            "downloaded_bytes": downloaded_bytes,
                            "total_bytes": total_bytes
                        });
                        let _ = app_handle.emit("online-book-download-progress", payload);
                        last_emit = std::time::Instant::now();
                    }
                }
                Err(e) => {
                    stream_failed = Some(e.to_string());
                    break;
                }
            }
        }

        if let Some(reason) = stream_failed {
            bad_download_reason = Some(reason);
            let _ = std::fs::remove_file(&file_path);
            continue;
        }

        // Final format verification: a mirror may serve an HTML error page or a
        // different format than the entry advertised — treat as failure,
        // try the next mirror.
        if let Err(reason) = verify_downloaded_file(&file_path, &ext) {
            bad_download_reason = Some(reason);
            let _ = std::fs::remove_file(&file_path);
            continue;
        }

        emit_download_completed(&app_handle, &target_id, &file_path);
        return Ok(file_path.to_string_lossy().to_string());
    }

    let _ = std::fs::remove_file(&file_path);
    let mut msg = "All Libgen mirrors failed or were blocked by Cloudflare/ISP. Try downloading from another source like Gutenberg.".to_string();
    if let Some(reason) = bad_download_reason {
        msg.push_str(&format!(" ({})", reason));
    }
    return Err(fail(msg));
}

/// Detect book format from magic bytes (cheap prefix scan — no full parse).
/// Returns a lowercase format name: `pdf`, `epub`, `mobi`, `fb2`, `html`,
/// `txt` — or `None` when the content is unrecognized/binary.
fn detect_book_format(data: &[u8]) -> Option<&'static str> {
    if data.starts_with(b"%PDF") {
        return Some("pdf");
    }
    if data.starts_with(b"PK\x03\x04") {
        // ZIP-based container: EPUB (also DOCX/CBZ — all fine for libgen books)
        return Some("epub");
    }
    if data.len() >= 68 {
        let palm_magic = &data[60..68];
        // PalmDB record 0 magic: MOBI/AZW use BOOKMOBI; PalmDOC uses TEXtREAd
        if palm_magic == b"BOOKMOBI" || palm_magic == b"TEXtREAd" {
            return Some("mobi");
        }
    }
    // Raw \xe3\x8b\xb6 marker seen at offset 60 on some MOBI variants
    if data.len() >= 63 && data[60] == 0xe3 && data[61] == 0x8b && data[62] == 0xb6 {
        return Some("mobi");
    }
    // XML-ish content: FB2 / XHTML. Skip a UTF-8 BOM if present.
    let head = if data.starts_with(b"\xEF\xBB\xBF") {
        &data[3..]
    } else {
        data
    };
    let head = &head[..head.len().min(512)];
    let lower = String::from_utf8_lossy(head).to_ascii_lowercase();
    if lower.contains("<fictionbook") {
        return Some("fb2");
    }
    if lower.starts_with("<!doctype html") || lower.starts_with("<html") {
        return Some("html");
    }
    if std::str::from_utf8(head).is_ok() {
        return Some("txt");
    }
    None
}

/// Whether a detected format satisfies the advertised (requested) extension.
/// Unknown advertised formats (djvu, rar, ...) are never blocked — we can't
/// cheaply verify them and don't want to reject valid downloads.
fn format_satisfies(expected: &str, actual: Option<&str>) -> bool {
    match expected {
        "pdf" => actual == Some("pdf"),
        "epub" => actual == Some("epub"),
        "mobi" | "azw" | "azw3" => matches!(actual, Some("mobi")),
        "fb2" => actual == Some("fb2"),
        "txt" | "text" => actual == Some("txt"),
        "html" | "htm" | "xhtml" => actual == Some("html"),
        _ => true,
    }
}

/// Verify a downloaded file's magic bytes match the requested format.
fn verify_downloaded_file(
    file_path: &std::path::Path,
    expected_ext: &str,
) -> std::result::Result<(), String> {
    use std::io::Read;

    let mut buf = [0u8; 512];
    let mut f = std::fs::File::open(file_path)
        .map_err(|e| format!("Failed to open downloaded file for verification: {}", e))?;
    let n = f
        .read(&mut buf)
        .map_err(|e| format!("Failed to read downloaded file for verification: {}", e))?;

    let actual = detect_book_format(&buf[..n]);
    if format_satisfies(expected_ext, actual) {
        Ok(())
    } else {
        Err(format!(
            "Downloaded file looks like '{}' but the LibGen entry advertised '{}'. The mirror served an error page or a different format — try again or pick another entry.",
            actual.unwrap_or("unknown"),
            expected_ext
        ))
    }
}

/// Emit the completed progress event for a finished download.
fn emit_download_completed(
    app_handle: &tauri::AppHandle,
    target_id: &str,
    file_path: &std::path::Path,
) {
    let payload = serde_json::json!({
        "target_id": target_id,
        "status": "completed",
        "file_path": file_path.to_string_lossy(),
    });
    let _ = app_handle.emit("online-book-download-progress", payload);
}

#[tauri::command]
pub async fn get_library_stats(state: State<'_, AppState>) -> Result<crate::models::LibraryStats> {
    let db = &state.db;
    crate::services::library_service::get_library_stats(db)
}

#[tauri::command]
pub async fn get_thumbnail(
    state: State<'_, AppState>,
    book_id: i64,
) -> Result<Option<String>> {
    // SELECT + fs::exists + thumbnail generation (CPU-bound image work) —
    // offload so cover grids never stall the runtime.
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::services::library_service::get_thumbnail_path(&db, book_id, &covers_dir)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?
}

#[tauri::command]
pub fn get_recommended_books(
    state: State<'_, AppState>,
    limit: u32,
) -> Result<Vec<crate::models::BookSummary>> {
    let db = &state.db;
    crate::services::library_service::get_recommended_books(db, limit)
}

#[tauri::command]
pub fn get_next_book_in_series(
    state: State<'_, AppState>,
    book_id: i64,
) -> Result<Option<crate::models::Book>> {
    let db = &state.db;
    let conn = db.get_connection()?;

    // First get the current book's series info
    let mut stmt = conn.prepare("SELECT series, series_index FROM books WHERE id = ? AND series IS NOT NULL AND series != ''")?;
    let mut rows = stmt.query([book_id])?;

    if let Some(row) = rows.next()? {
        let series: String = row.get(0)?;
        // series_index may be NULL for books that belong to a series but have no
        // assigned position; treat that as 0.0 rather than erroring the whole call.
        let current_index: f64 = row.get::<_, Option<f64>>(1)?.unwrap_or(0.0);

        // Find the next book in the series (lowest index greater than current).
        // Skip rows with a NULL series_index — they can never qualify as "next"
        // and would otherwise fail to compare. Tie-break on title/id for stable
        // ordering when two books share the same index.
        let mut next_stmt = conn.prepare(
            "SELECT id FROM books
             WHERE series = ? AND series_index IS NOT NULL AND series_index > ?
             ORDER BY series_index ASC, title ASC, id ASC
             LIMIT 1",
        )?;

        let mut next_rows = next_stmt.query(rusqlite::params![series, current_index])?;

        if let Some(r) = next_rows.next()? {
            let next_id: i64 = r.get(0)?;
            return crate::services::library_service::get_book_by_id(db, next_id).map(Some);
        }
    }

    Ok(None)
}

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MangaChapterPath {
    pub path: String,
    pub chapter: Option<String>,
}

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MangaSeriesMetadata {
    pub title: String,
    pub anilist_id: Option<String>,
    pub cover_url: Option<String>,
    pub description: Option<String>,
}

#[tauri::command]
pub async fn import_online_manga_chapters(
    paths_with_chapters: Vec<MangaChapterPath>,
    series_metadata: MangaSeriesMetadata,
    state: State<'_, AppState>,
) -> Result<crate::models::ImportResult> {
    let db = state.db.clone();
    let covers_dir = state.covers_dir.clone();

    tokio::task::spawn_blocking(move || {
        let paths: Vec<String> = paths_with_chapters.iter().map(|p| p.path.clone()).collect();
        let batch_result = crate::services::library_service::import_manga(&db, paths, &covers_dir)?;

        let conn = db.get_connection()?;

        let series_id: Option<i64> = conn.query_row(
            "SELECT id FROM manga_series WHERE title = ?",
            [&series_metadata.title],
            |row| row.get(0),
        ).ok();

        let series_id = if let Some(sid) = series_id {
            if let Some(cover_url) = &series_metadata.cover_url {
                let _ = conn.execute(
                    "UPDATE manga_series SET cover_path = ? WHERE id = ? AND (cover_path IS NULL OR cover_path = '')",
                    rusqlite::params![cover_url, sid],
                );
            }
            sid
        } else {
            conn.execute(
                "INSERT INTO manga_series (title, sort_title, status, cover_path, added_date)
                 VALUES (?, ?, 'ongoing', ?, CURRENT_TIMESTAMP)",
                rusqlite::params![
                    series_metadata.title,
                    series_metadata.title,
                    series_metadata.cover_url
                ],
            )?;
            conn.last_insert_rowid()
        };

        for path_obj in paths_with_chapters {
            if batch_result.success.contains(&path_obj.path) || batch_result.duplicates.contains(&path_obj.path) {
                let book_id: Option<i64> = conn.query_row(
                    "SELECT id FROM books WHERE file_path = ?",
                    [&path_obj.path],
                    |row| row.get(0)
                ).ok();

                if let Some(bid) = book_id {
                    let chapter_f64 = path_obj.chapter.as_ref().and_then(|ch| ch.parse::<f64>().ok());
                    let chapter_i32 = chapter_f64.map(|v| v as i32);

                    let _ = conn.execute(
                        "UPDATE books SET manga_series_id = ?, series = ?, series_index = ?, anilist_id = ? WHERE id = ?",
                        rusqlite::params![
                            series_id,
                            series_metadata.title,
                            chapter_i32,
                            series_metadata.anilist_id,
                            bid
                        ],
                    );

                    if let Some(desc) = &series_metadata.description {
                        let _ = conn.execute(
                            "UPDATE books SET notes = ? WHERE id = ? AND (notes IS NULL OR notes = '')",
                            rusqlite::params![desc, bid],
                        );
                    }
                }
            }
        }

        Ok(batch_result)
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?
}

#[cfg(test)]
mod download_format_tests {
    use super::*;

    fn detect(data: &[u8]) -> Option<&'static str> {
        detect_book_format(data)
    }

    #[test]
    fn detect_pdf() {
        assert_eq!(detect(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"), Some("pdf"));
    }

    #[test]
    fn detect_epub() {
        assert_eq!(
            detect(b"PK\x03\x04mimetypeapplication/epub+zip"),
            Some("epub")
        );
    }

    #[test]
    fn detect_mobi_variants() {
        // BOOKMOBI at offset 60
        let mut mobi = vec![0u8; 68];
        mobi[60..68].copy_from_slice(b"BOOKMOBI");
        assert_eq!(detect(&mobi), Some("mobi"));

        // TEXtREAd at offset 60 (PalmDOC)
        let mut palm = vec![0u8; 68];
        palm[60..68].copy_from_slice(b"TEXtREAd");
        assert_eq!(detect(&palm), Some("mobi"));

        // \xe3\x8b\xb6 marker at offset 60
        let mut raw = vec![0u8; 63];
        raw[60] = 0xe3;
        raw[61] = 0x8b;
        raw[62] = 0xb6;
        assert_eq!(detect(&raw), Some("mobi"));
    }

    #[test]
    fn detect_fb2_with_bom_and_xml_decl() {
        let fb2 = b"\xEF\xBB\xBF<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<FictionBook xmlns=\"http://www.gribuser.ru/xml/fictionbook/2.0\">";
        assert_eq!(detect(fb2), Some("fb2"));
    }

    #[test]
    fn detect_html_and_txt() {
        assert_eq!(
            detect(b"<!DOCTYPE html><html><body>error</body></html>"),
            Some("html")
        );
        assert_eq!(detect(b"<html><body>error</body></html>"), Some("html"));
        assert_eq!(detect(b"Once upon a time...\nThe end."), Some("txt"));
    }

    #[test]
    fn detect_unknown_binary() {
        assert_eq!(detect(&[0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]), None);
    }

    #[test]
    fn format_satisfies_matching_and_mismatching() {
        assert!(format_satisfies("pdf", Some("pdf")));
        assert!(format_satisfies("epub", Some("epub")));
        assert!(format_satisfies("mobi", Some("mobi")));
        assert!(format_satisfies("azw3", Some("mobi")));
        assert!(format_satisfies("azw", Some("mobi")));
        assert!(format_satisfies("txt", Some("txt")));
        assert!(format_satisfies("html", Some("html")));
        assert!(format_satisfies("fb2", Some("fb2")));

        // Mismatches — the error path
        assert!(!format_satisfies("pdf", Some("epub")));
        assert!(!format_satisfies("epub", Some("html")));
        assert!(!format_satisfies("pdf", Some("txt")));
        assert!(!format_satisfies("pdf", None));

        // Unknown advertised formats are never blocked
        assert!(format_satisfies("djvu", Some("html")));
        assert!(format_satisfies("djvu", None));
        assert!(format_satisfies("rar", Some("txt")));
    }
}


// Gateway download-scraping regexes: compiled once, reused per fetch attempt
// (libgen gateway proxies previously rebuilt all four per mirror URL).
use std::sync::LazyLock;
static DOWNLOAD_DIV_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"(?is)id=["']download["'][^>]*>.*?href=["']([^"']+)["']"#)
        .expect("static libgen gateway regexes are valid")
});
static GET_EXACT_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"(?i)href=["']([^"']+)["'][^>]*>\s*GET\s*<"#)
        .expect("static libgen gateway regexes are valid")
});
static IPFS_LINK_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"(?i)href=["'](https?://[^"']*(?:ipfs|cloudflare|pinata)[^"']*)["']"#)
        .expect("static libgen gateway regexes are valid")
});
static GET_LOOSE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"(?i)<a[^>]+href=["']([^"']+)["'][^>]*>.*?GET.*?</a>"#)
        .expect("static libgen gateway regexes are valid")
});
