use crate::error::Result;
use crate::models::{MangaSeries, MangaVolume};
use crate::services::manga_service::{MangaMetadata, MangaService};
use crate::utils::validate;
use crate::AppState;
use lazy_static::lazy_static;
use regex::Regex;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

/// Global manga service state
pub struct MangaState {
    pub service: Arc<MangaService>,
}

impl MangaState {
    pub fn new() -> Self {
        Self {
            service: Arc::new(MangaService::new()),
        }
    }
}

// ==================== Manga Reader Commands ====================

#[tauri::command]
pub fn open_manga(book_id: i64, path: String, state: State<MangaState>) -> Result<MangaMetadata> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_safe_path(&path, "path")?;
    state.service.open(book_id, &path)
}

#[tauri::command]
pub async fn get_manga_page(
    book_id: i64,
    page_index: usize,
    max_dimension: u32,
    state: State<'_, MangaState>,
) -> Result<tauri::ipc::Response> {
    validate::require_positive_id(book_id, "book_id")?;
    let bytes = state
        .service
        .get_page(book_id, page_index, max_dimension)
        .await?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn preload_manga_pages(
    book_id: i64,
    page_indices: Vec<usize>,
    max_dimension: u32,
    state: State<'_, MangaState>,
) -> Result<()> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty_vec(&page_indices, "page_indices")?;
    state
        .service
        .preload_pages(book_id, &page_indices, max_dimension)
        .await
}

#[tauri::command]
pub async fn get_manga_page_dimensions(
    book_id: i64,
    page_indices: Vec<usize>,
    state: State<'_, MangaState>,
) -> Result<Vec<(u32, u32)>> {
    validate::require_positive_id(book_id, "book_id")?;
    validate::require_non_empty_vec(&page_indices, "page_indices")?;
    state.service.get_page_dimensions(book_id, &page_indices)
}

#[tauri::command]
pub fn close_manga(book_id: i64, state: State<MangaState>) -> Result<()> {
    validate::require_positive_id(book_id, "book_id")?;
    state.service.close(book_id);
    Ok(())
}

// ==================== Manga Page Disk Cache ====================

/// Subdirectory under `app_local_data_dir` that holds rendered page images.
const MANGA_PAGES_DIR_NAME: &str = "manga-pages";

/// Hard cap for the on-disk page cache. After a write busts it, the oldest
/// files (by mtime) are deleted until the cache is back under the reclaim
/// fraction below.
const MANGA_PAGE_CACHE_CAP_BYTES: u64 = 512 * 1024 * 1024; // 512 MB

/// Evict down to this fraction of the cap so the cache responds from below
/// instead of churning at the boundary.
const MANGA_PAGE_CACHE_RECLAIM_PERCENT: u64 = 80;

/// Maintenance (orphan sweep + cap enforcement) runs at most this often; the
/// walk is O(cache) and must not run on every page render.
const MANGA_PAGE_SWEEP_INTERVAL_SECS: u64 = 30;

/// Resolved `manga-pages` root, registered lazily by `get_manga_page_path`
/// (resolving it needs an `AppHandle`, which library_service does not have).
/// Lets `prune_manga_page_cache` — the delete hook wired from the library
/// delete path — run without an app handle; until a page has been rendered in
/// this process the root is unknown and pruning no-ops (harmless: the cap
/// sweep would reclaim the leftover dir later anyway).
static MANGA_PAGES_ROOT: OnceLock<PathBuf> = OnceLock::new();

/// True once per `MANGA_PAGE_SWEEP_INTERVAL_SECS` window (process-wide).
fn manga_pages_maintenance_due() -> bool {
    static LAST_SWEEP: OnceLock<Mutex<Instant>> = OnceLock::new();
    let last = LAST_SWEEP.get_or_init(|| Mutex::new(Instant::now()));
    let mut guard = last.lock().unwrap();
    let now = Instant::now();
    if now.duration_since(*guard) >= Duration::from_secs(MANGA_PAGE_SWEEP_INTERVAL_SECS) {
        *guard = now;
        true
    } else {
        false
    }
}

/// Best-effort removal of one book's cached pages from `<root>/<file_hash>`.
/// Ignores missing dirs and filesystem errors — never fatal.
fn remove_manga_page_hash_dir(root: &Path, file_hash: &str) {
    let dir = root.join(file_hash);
    if dir == root || file_hash.is_empty() {
        return;
    }
    if dir.is_dir() {
        match std::fs::remove_dir_all(&dir) {
            Ok(_) => log::info!(
                "[manga-pages] pruned cached pages for file hash {}",
                file_hash
            ),
            Err(e) => log::warn!(
                "[manga-pages] failed to prune cached pages for {} ({:?}): {}",
                file_hash,
                dir,
                e
            ),
        }
    }
}

/// Remove the on-disk page cache for one book, keyed by content hash.
///
/// Intended to be called right after a book row is permanently deleted.
/// TODO(D4): deletion is NOT handled in this file — `delete_manga_series` only
/// nulls the series association and keeps the books. The one-line delete hook
/// belongs in `src-tauri/src/services/library_service.rs` at
/// `tombstone_or_remove_file` (it already receives the `file_hash`), i.e. call
/// `crate::commands::manga::prune_manga_page_cache(&file_hash);` right after
/// the tombstone/removal there — it also covers `delete_book`, `delete_books`,
/// `permanent_delete_book` and `empty_trash`, which all funnel through
/// `tombstone_or_remove_file`. `prune` is used by the in-file cap sweep today
/// (see `maintain_manga_page_cache`), so the logic is live either way.
pub(crate) fn prune_manga_page_cache(file_hash: &str) {
    if let Some(root) = MANGA_PAGES_ROOT.get() {
        remove_manga_page_hash_dir(root, file_hash);
    }
}

/// Best-effort `manga-pages` maintenance, gated to at most once per
/// `MANGA_PAGE_SWEEP_INTERVAL_SECS`:
/// 1. Drops orphaned book dirs (content key with no matching `books` row) —
///    this is the delete cleanup: when a book is permanently deleted its hash
///    dir becomes dead and is removed here.
/// 2. Removes legacy flat-layout files (`manga-<book>-<page>-<dim>.img` /
///    `.tmp`) directly under the root — the old layout is neither produced
///    nor read anymore.
/// 3. If the live cache exceeds `MANGA_PAGE_CACHE_CAP_BYTES`, deletes the
///    oldest files (by mtime) until total size is under
///    `CAP * MANGA_PAGE_CACHE_RECLAIM_PERCENT / 100`.
/// Never fatal; failures are logged only.
fn maintain_manga_page_cache(root: &Path, is_key_live: impl Fn(&str) -> bool) {
    if !manga_pages_maintenance_due() {
        return;
    }

    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };

    // (mtime_secs, bytes, path) for files kept after the sweep.
    let mut live_files: Vec<(u64, u64, PathBuf)> = Vec::new();
    let mut total_bytes: u64 = 0;

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if path.is_dir() {
            if !is_key_live(&name) {
                // Deleted book (or legacy leftover): whole dir is dead.
                prune_manga_page_cache(&name);
                continue;
            }
            let Ok(inner) = std::fs::read_dir(&path) else {
                continue;
            };
            for file in inner.flatten() {
                let fp = file.path();
                let fname = file.file_name().to_string_lossy().into_owned();
                if fname.ends_with(".tmp") {
                    // Stale half-written file (atomic writes rename away).
                    let _ = std::fs::remove_file(&fp);
                    continue;
                }
                if let Ok(meta) = std::fs::metadata(&fp) {
                    let mtime = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    total_bytes += meta.len();
                    live_files.push((mtime, meta.len(), fp));
                }
            }
        } else if name.ends_with(".img") || name.ends_with(".tmp") {
            // Legacy flat-layout leftover under the root itself.
            let _ = std::fs::remove_file(&path);
        }
    }

    if total_bytes > MANGA_PAGE_CACHE_CAP_BYTES {
        let target =
            (MANGA_PAGE_CACHE_CAP_BYTES * MANGA_PAGE_CACHE_RECLAIM_PERCENT) / 100;
        live_files.sort_by_key(|(mtime, _, _)| *mtime);
        let mut now = total_bytes;
        for (_mtime, len, fp) in live_files {
            if now <= target {
                break;
            }
            if std::fs::remove_file(&fp).is_ok() {
                now = now.saturating_sub(len);
            }
        }
        log::info!(
            "[manga-pages] cache over cap: {:.1} MB > {} MB, evicted oldest until ~{:.1} MB",
            total_bytes as f64 / (1024.0 * 1024.0),
            MANGA_PAGE_CACHE_CAP_BYTES / (1024 * 1024),
            now as f64 / (1024.0 * 1024.0)
        );
    }
}

#[tauri::command]
pub async fn get_manga_page_path(
    book_id: i64,
    page_index: usize,
    max_dimension: u32,
    state: State<'_, MangaState>,
    app: AppHandle,
) -> Result<String> {
    validate::require_positive_id(book_id, "book_id")?;

    // Slice F4: resolve the content hash WITHOUT a DB query per page — it is
    // cached per file path on the service (populated on first render).
    let service = &state.service;
    let open_path = service.open_path(book_id);
    let file_hash: Option<String> = match &open_path {
        Some(path) => match service.cached_file_hash(path) {
            Some(h) => Some(h),
            None => {
                let app_state = app.state::<crate::AppState>();
                let hash: Option<String> = {
                    let conn = app_state.db.get_connection()?;
                    conn.query_row(
                        "SELECT file_hash FROM books WHERE id = ?1",
                        rusqlite::params![book_id],
                        |row| row.get::<_, Option<String>>(0),
                    )
                    .ok()
                    .flatten()
                    .filter(|h| !h.trim().is_empty())
                };
                if let Some(h) = &hash {
                    service.cache_file_hash(path.clone(), h.clone());
                }
                hash
            }
        },
        None => None,
    };

    // Store pages inside the app's local data directory so the asset
    // protocol scope ($APPLOCALDATA/**) covers them (system /tmp/ is blocked).
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| crate::error::ShioriError::Other(e.to_string()))?;
    let cache_root = base.join(MANGA_PAGES_DIR_NAME);
    let _ = MANGA_PAGES_ROOT.get_or_init(|| cache_root.clone());
    // Fall back to book_id only when the hash is missing.
    let book_key = file_hash.clone().unwrap_or_else(|| book_id.to_string());
    let dir = cache_root.join(&book_key);

    let filename = format!("{}_{}.img", page_index, max_dimension);
    let final_path = dir.join(&filename);

    // Warm-disk fast path (slice F4): an existing page file is complete
    // (writes are atomic tmp+rename), so return it without extracting the
    // archive at all. This is what makes re-reads and preload revisits cheap.
    if final_path.exists() {
        if let Ok(meta) = std::fs::metadata(&final_path) {
            if meta.len() > 0 {
                return Ok(final_path.to_string_lossy().into_owned());
            }
        }
    }

    let bytes = state
        .service
        .get_page(book_id, page_index, max_dimension)
        .await?;

    // Write atomically, off the async runtime (slice F4: sync fs I/O moved
    // into spawn_blocking).
    let final_path_str = final_path.to_string_lossy().into_owned();
    let tmp_path = dir.join(format!("{}.tmp", filename));
    tokio::task::spawn_blocking(move || -> Result<()> {
        std::fs::create_dir_all(&dir).map_err(crate::error::ShioriError::Io)?;
        std::fs::write(&tmp_path, &bytes).map_err(crate::error::ShioriError::Io)?;
        std::fs::rename(&tmp_path, &final_path).map_err(crate::error::ShioriError::Io)?;
        Ok(())
    })
    .await
    .map_err(|e| crate::error::ShioriError::Other(format!("page write task: {}", e)))??;

    // Best-effort maintenance: prune orphaned (deleted) book dirs and keep the
    // cache under the byte cap. Gated, non-fatal, and only hits the DB when the
    // window has elapsed.
    if manga_pages_maintenance_due() {
        let app_state = app.state::<crate::AppState>();
        let conn = app_state.db.get_connection()?;
        maintain_manga_page_cache(&cache_root, |key| {
            if let Ok(id) = key.parse::<i64>() {
                conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM books WHERE id = ?1)",
                    rusqlite::params![id],
                    |row| row.get::<_, bool>(0),
                )
                .unwrap_or(true)
            } else {
                conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM books WHERE file_hash = ?1)",
                    rusqlite::params![key],
                    |row| row.get::<_, bool>(0),
                )
                .unwrap_or(true) // conservative: keep dirs on DB error
            }
        });
    }

    Ok(final_path_str)
}

// ==================== Manga Series Management Commands ====================

lazy_static! {
    static ref MANGA_VOLUME_REGEX: Regex = Regex::new(
        r"^(?:\[[^\]]+\]\s*)?(.*?)\s*[-_#]?\s*(?:Vol\.?|Volume|v|Bk\.?|Book|Ch\.?|Chapter|Ep\.?|Episode|#)?\s*(\d+(?:\.\d+)?)\s*(?:\((?:Digital|Scan|Web)?\s*\)?\s*)?(?:\((?:\d{4})\))?.*$"
    ).expect("Invalid regex pattern for manga volume parsing");
}

#[tauri::command]
pub fn get_manga_series_list(
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<MangaSeries>> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    validate::require_positive_id(limit, "limit")?;
    if offset < 0 {
        return Err(crate::error::ShioriError::Validation(format!(
            "offset must be a non-negative integer, got {}",
            offset
        )));
    }

    let db = &state.db;
    let conn = db.get_connection()?;

    let mut stmt = conn.prepare(
        "SELECT id, title, sort_title, cover_path, status, added_date 
         FROM manga_series 
         ORDER BY added_date DESC 
         LIMIT ? OFFSET ?",
    )?;

    let series_iter = stmt.query_map([limit, offset], |row| {
        Ok(MangaSeries {
            id: row.get(0)?,
            title: row.get(1)?,
            sort_title: row.get(2)?,
            cover_path: row.get(3)?,
            status: row.get(4)?,
            added_date: row.get(5)?,
        })
    })?;

    let mut series_list = Vec::new();
    for series_result in series_iter {
        series_list.push(series_result?);
    }

    Ok(series_list)
}

#[tauri::command]
pub fn get_series_volumes(series_id: i64, state: State<AppState>) -> Result<Vec<MangaVolume>> {
    validate::require_positive_id(series_id, "series_id")?;

    let db = &state.db;
    let conn = db.get_connection()?;

    let exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM manga_series WHERE id = ?",
        [series_id],
        |row| row.get(0),
    )?;

    if !exists {
        return Err(crate::error::ShioriError::BookNotFound(format!(
            "Manga series with id {} not found",
            series_id
        )));
    }

    let mut stmt = conn.prepare(
        "SELECT id, manga_series_id, id as book_id, CAST(series_index AS INTEGER) as volume_number
         FROM books 
         WHERE manga_series_id = ? 
         ORDER BY series_index ASC NULLS LAST, added_date ASC",
    )?;

    let volumes_iter = stmt.query_map([series_id], |row| {
        Ok(MangaVolume {
            id: row.get(0)?,
            manga_series_id: row.get(1)?,
            book_id: row.get(2)?,
            volume_number: row.get(3)?,
        })
    })?;

    let mut volumes = Vec::new();
    for vol_result in volumes_iter {
        volumes.push(vol_result?);
    }

    Ok(volumes)
}

#[tauri::command]
pub async fn auto_group_manga_volumes(state: State<'_, AppState>) -> Result<usize> {
    let db = state.db.clone();

    tokio::task::spawn_blocking(move || {
        let conn = db.get_connection()?;

        let mut stmt = conn.prepare(
            "SELECT id, title FROM books 
             WHERE manga_series_id IS NULL 
             AND domain = 'manga_comics'
             AND in_trash = 0
             ORDER BY title ASC"
        )?;

        let books_to_process: Vec<(i64, String)> = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| crate::error::ShioriError::from(e))?;

        let mut grouped_count = 0;

        for (book_id, title) in books_to_process {
            if let Some(captures) = MANGA_VOLUME_REGEX.captures(&title) {
                if let (Some(series_name_match), Some(volume_match)) =
                    (captures.get(1), captures.get(2))
                {
                    let series_name = series_name_match.as_str().trim().to_string();
                    let volume_num = volume_match
                        .as_str()
                        .parse::<f32>()
                        .unwrap_or(0.0)
                        .round() as i32;

                    if !series_name.is_empty() && volume_num > 0 {
                        let series_id: Option<i64> = conn
                            .query_row(
                                "SELECT id FROM manga_series WHERE title = ?",
                                [&series_name],
                                |row| row.get(0),
                            )
                            .ok();

                        let series_id = if let Some(sid) = series_id {
                            sid
                        } else {
                            conn.execute(
                                "INSERT INTO manga_series (title, sort_title, status, added_date) 
                                 VALUES (?, ?, 'ongoing', CURRENT_TIMESTAMP)",
                                [&series_name, &series_name],
                            )?;
                            conn.last_insert_rowid()
                        };

                        conn.execute(
                            "UPDATE books SET manga_series_id = ?, series = ?, series_index = ? WHERE id = ?",
                            rusqlite::params![series_id, &series_name, volume_num, book_id],
                        )?;

                        grouped_count += 1;
                    }
                }
            }
        }

        Ok(grouped_count)
    }).await.map_err(|e| crate::error::ShioriError::Other(e.to_string()))?
}

#[tauri::command]
pub fn create_manga_series(title: String, state: State<AppState>) -> Result<i64> {
    let title = title.trim();
    if title.is_empty() {
        return Err(crate::error::ShioriError::Validation(
            "Series title cannot be empty".to_string(),
        ));
    }

    let db = &state.db;
    let conn = db.get_connection()?;

    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM manga_series WHERE title = ?",
            [title],
            |row| row.get(0),
        )
        .ok();

    if let Some(id) = existing {
        return Ok(id);
    }

    conn.execute(
        "INSERT INTO manga_series (title, sort_title, status, added_date) 
         VALUES (?, ?, 'ongoing', CURRENT_TIMESTAMP)",
        [title, title],
    )?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn assign_book_to_series(
    book_id: i64,
    series_title: String,
    chapter_number: Option<i32>,
    state: State<AppState>,
) -> Result<()> {
    validate::require_positive_id(book_id, "book_id")?;

    let series_title = series_title.trim();
    if series_title.is_empty() {
        return Err(crate::error::ShioriError::Validation(
            "Series title cannot be empty".to_string(),
        ));
    }

    let db = &state.db;
    let conn = db.get_connection()?;

    let series_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM manga_series WHERE title = ?",
            [series_title],
            |row| row.get(0),
        )
        .ok();

    let series_id = if let Some(sid) = series_id {
        sid
    } else {
        conn.execute(
            "INSERT INTO manga_series (title, sort_title, status, added_date) 
             VALUES (?, ?, 'ongoing', CURRENT_TIMESTAMP)",
            [series_title, series_title],
        )?;
        conn.last_insert_rowid()
    };

    conn.execute(
        "UPDATE books SET manga_series_id = ?, series = ?, series_index = ? WHERE id = ?",
        rusqlite::params![series_id, series_title, chapter_number, book_id],
    )?;

    Ok(())
}

#[tauri::command]
pub fn remove_book_from_series(book_id: i64, state: State<AppState>) -> Result<()> {
    validate::require_positive_id(book_id, "book_id")?;

    let db = &state.db;
    let conn = db.get_connection()?;

    conn.execute(
        "UPDATE books SET manga_series_id = NULL, series = NULL, series_index = NULL WHERE id = ?",
        [book_id],
    )?;

    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct MangaSeriesUpdate {
    pub title: Option<String>,
    pub sort_title: Option<String>,
    pub cover_path: Option<String>,
    pub status: Option<String>,
}

#[tauri::command]
pub fn update_manga_series(
    series_id: i64,
    updates: MangaSeriesUpdate,
    state: State<AppState>,
) -> Result<()> {
    validate::require_positive_id(series_id, "series_id")?;

    let db = &state.db;
    let conn = db.get_connection()?;

    let exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM manga_series WHERE id = ?",
        [series_id],
        |row| row.get(0),
    )?;

    if !exists {
        return Err(crate::error::ShioriError::BookNotFound(format!(
            "Manga series with id {} not found",
            series_id
        )));
    }

    if let Some(title) = updates.title {
        let cleaned = title.trim();
        if cleaned.is_empty() {
            return Err(crate::error::ShioriError::Validation(
                "Series title cannot be empty".to_string(),
            ));
        }

        conn.execute(
            "UPDATE manga_series SET title = ?1 WHERE id = ?2",
            rusqlite::params![cleaned, series_id],
        )?;
    }

    if let Some(sort_title) = updates.sort_title {
        let cleaned = sort_title.trim();
        if cleaned.is_empty() {
            conn.execute(
                "UPDATE manga_series SET sort_title = NULL WHERE id = ?1",
                [series_id],
            )?;
        } else {
            conn.execute(
                "UPDATE manga_series SET sort_title = ?1 WHERE id = ?2",
                rusqlite::params![cleaned, series_id],
            )?;
        }
    }

    if let Some(cover_path) = updates.cover_path {
        let cleaned = cover_path.trim();
        if cleaned.is_empty() {
            conn.execute(
                "UPDATE manga_series SET cover_path = NULL WHERE id = ?1",
                [series_id],
            )?;
        } else {
            conn.execute(
                "UPDATE manga_series SET cover_path = ?1 WHERE id = ?2",
                rusqlite::params![cleaned, series_id],
            )?;
        }
    }

    if let Some(status) = updates.status {
        let cleaned = status.trim().to_lowercase();
        if !cleaned.is_empty() {
            validate::require_one_of(
                &cleaned,
                &["ongoing", "completed", "hiatus", "cancelled"],
                "status",
            )?;
            conn.execute(
                "UPDATE manga_series SET status = ?1 WHERE id = ?2",
                rusqlite::params![cleaned, series_id],
            )?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn delete_manga_series(series_id: i64, state: State<AppState>) -> Result<()> {
    validate::require_positive_id(series_id, "series_id")?;

    let db = &state.db;
    let conn = db.get_connection()?;

    conn.execute(
        "UPDATE books SET manga_series_id = NULL, series = NULL, series_index = NULL WHERE manga_series_id = ?1",
        [series_id],
    )?;

    conn.execute("DELETE FROM manga_series WHERE id = ?1", [series_id])?;

    Ok(())
}

#[tauri::command]
pub fn merge_manga_series(
    source_ids: Vec<i64>,
    target_id: i64,
    state: State<AppState>,
) -> Result<()> {
    validate::require_non_empty_vec(&source_ids, "source_ids")?;
    validate::require_positive_id(target_id, "target_id")?;

    let db = &state.db;
    let conn = db.get_connection()?;

    let target_title: String = conn.query_row(
        "SELECT title FROM manga_series WHERE id = ?1",
        [target_id],
        |row| row.get(0),
    )?;

    for source_id in source_ids {
        validate::require_positive_id(source_id, "source_id")?;

        if source_id == target_id {
            continue;
        }

        conn.execute(
            "UPDATE books
             SET manga_series_id = ?1,
                 series = ?2
             WHERE manga_series_id = ?3",
            rusqlite::params![target_id, target_title, source_id],
        )?;

        conn.execute("DELETE FROM manga_series WHERE id = ?1", [source_id])?;
    }

    Ok(())
}
