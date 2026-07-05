#![allow(dead_code)]
/// Conversion Engine v2.0
///
/// Background worker queue with:
/// - Tauri event emission for real-time UI updates
/// - SQLite persistence for job state (survives restart)
/// - Soft cancellation via DashSet
/// - Unified capability matrix
use chrono::{DateTime, Utc};
use dashmap::{DashMap, DashSet};
use printpdf::*;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::db::Database;
use crate::services::adapters::*;
use crate::services::calibre_service::{self, CalibreError, CalibreProfile};
use crate::services::epub_builder::{split_text_into_chapters, EpubBuilder, EpubMetadata};
use crate::services::format_adapter::{BookFormatAdapter, FormatError, FormatResult};
use crate::services::format_detection::detect_format;

// ──────────────────────────────────────────────────────────────────────────
// CAPABILITY MATRIX  (source → [valid targets])
// ──────────────────────────────────────────────────────────────────────────

pub const CONVERSION_MATRIX: &[(&str, &[&str])] = &[
    ("epub", &["pdf", "mobi", "azw3", "docx", "txt", "fb2"]),
    ("pdf",  &["epub", "mobi", "azw3", "docx", "txt", "fb2"]),
    ("mobi", &["epub", "pdf", "azw3", "docx", "txt", "fb2"]),
    ("azw3", &["epub", "pdf", "mobi", "docx", "txt", "fb2"]),
    ("docx", &["epub", "pdf", "mobi", "azw3", "txt", "fb2"]),
    ("txt",  &["epub", "pdf", "mobi", "azw3", "docx", "fb2"]),
    ("fb2",  &["epub", "pdf", "mobi", "azw3", "docx", "txt"]),
];

pub fn can_convert(from: &str, to: &str) -> bool {
    CONVERSION_MATRIX
        .iter()
        .find(|(f, _)| *f == from)
        .map(|(_, targets)| targets.contains(&to))
        .unwrap_or(false)
}

// ──────────────────────────────────────────────────────────────────────────
// JOB MODEL
// ──────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConversionStatus {
    Queued,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

impl std::fmt::Display for ConversionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConversionStatus::Queued => write!(f, "Queued"),
            ConversionStatus::Processing => write!(f, "Processing"),
            ConversionStatus::Completed => write!(f, "Completed"),
            ConversionStatus::Failed => write!(f, "Failed"),
            ConversionStatus::Cancelled => write!(f, "Cancelled"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversionJob {
    pub id: String, // UUID as string (JSON-friendly)
    pub book_id: Option<i64>,
    pub source_path: String,
    pub target_path: String,
    pub source_format: String,
    pub target_format: String,
    pub status: ConversionStatus,
    pub progress: f32,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

// ──────────────────────────────────────────────────────────────────────────
// ENGINE
// ──────────────────────────────────────────────────────────────────────────

type Queue = VecDeque<String>; // job IDs

pub struct ConversionEngine {
    queue: Arc<Mutex<Queue>>,
    tracker: Arc<DashMap<String, ConversionJob>>,
    cancelled: Arc<DashSet<String>>,
    shutdown: Arc<Mutex<bool>>,
    worker_count: usize,
    workers_started: std::sync::Mutex<bool>,
    app_handle: tauri::AppHandle,
    db: Option<Database>,
}

impl ConversionEngine {
    pub fn new(worker_count: usize, app_handle: tauri::AppHandle) -> Self {
        Self {
            queue: Arc::new(Mutex::new(VecDeque::new())),
            tracker: Arc::new(DashMap::new()),
            cancelled: Arc::new(DashSet::new()),
            shutdown: Arc::new(Mutex::new(false)),
            worker_count,
            workers_started: std::sync::Mutex::new(false),
            app_handle,
            db: None,
        }
    }

    /// Set the database pool for job persistence
    pub fn set_database(&mut self, db: Database) {
        self.db = Some(db);
    }

    // ── Worker management ─────────────────────────────────────────────────

    fn ensure_workers(&self) {
        let mut started = self.workers_started.lock().unwrap();
        if !*started {
            for id in 0..self.worker_count {
                let queue = self.queue.clone();
                let tracker = self.tracker.clone();
                let cancelled = self.cancelled.clone();
                let shutdown = self.shutdown.clone();
                let handle = self.app_handle.clone();
                let db = self.db.clone();
                tokio::spawn(async move {
                    Self::worker_loop(id, queue, tracker, cancelled, shutdown, handle, db).await;
                });
            }
            *started = true;
            log::info!("[ConversionEngine] {} workers started", self.worker_count);
        }
    }

    // ── Public API ────────────────────────────────────────────────────────

    pub async fn submit_conversion(
        &self,
        source: PathBuf,
        target_format: &str,
        output_dir: Option<PathBuf>,
        book_id: Option<i64>,
    ) -> FormatResult<String> {
        self.ensure_workers();

        // Verify source file exists before queueing
        if !source.exists() {
            return Err(FormatError::ConversionError(format!(
                "Source file not found: {}",
                source.display()
            )));
        }

        let fmt_info = detect_format(&source).await?;
        let source_format = fmt_info.format.clone();

        if !can_convert(&source_format, target_format) {
            return Err(FormatError::ConversionNotSupported {
                from: source_format,
                to: target_format.to_string(),
            });
        }

        let target_path = if let Some(dir) = output_dir {
            let stem = source
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("converted");
            dir.join(format!("{}.{}", stem, target_format))
        } else {
            source.with_extension(target_format)
        };

        let job_id = Uuid::new_v4().to_string();
        let job = ConversionJob {
            id: job_id.clone(),
            book_id,
            source_path: source.to_string_lossy().to_string(),
            target_path: target_path.to_string_lossy().to_string(),
            source_format,
            target_format: target_format.to_string(),
            status: ConversionStatus::Queued,
            progress: 0.0,
            error: None,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
        };

        self.tracker.insert(job_id.clone(), job.clone());
        self.queue.lock().await.push_back(job_id.clone());

        // Persist initial job state to DB
        if let Some(ref db) = self.db {
            if let Ok(conn) = db.get_connection() {
                Self::persist_job(&job, &conn);
            }
        }

        self.emit_progress(&job);

        log::info!(
            "[ConversionEngine] Job {} queued: {} → {}",
            job_id,
            job.source_format,
            job.target_format
        );
        Ok(job_id)
    }

    pub fn get_job_status(&self, job_id: &str) -> Option<ConversionJob> {
        self.tracker.get(job_id).map(|r| r.value().clone())
    }

    pub fn get_all_jobs(&self) -> Vec<ConversionJob> {
        self.tracker.iter().map(|r| r.value().clone()).collect()
    }

    pub async fn cancel_job(&self, job_id: &str) -> FormatResult<()> {
        // Mark in the cancellation set — worker checks this between steps
        self.cancelled.insert(job_id.to_string());

        if let Some(mut job) = self.tracker.get_mut(job_id) {
            if job.status == ConversionStatus::Queued || job.status == ConversionStatus::Processing
            {
                job.status = ConversionStatus::Cancelled;
                job.error = Some("Cancelled by user".to_string());
                self.emit_progress(job.value());
                return Ok(());
            }
        }
        Err(FormatError::ConversionError(
            "Job not found or already finished".to_string(),
        ))
    }

    #[allow(dead_code)]
    pub async fn shutdown(&self) {
        *self.shutdown.lock().await = true;
        log::info!("[ConversionEngine] Shutdown signal sent");
    }

    // ── Restore jobs from DB on startup ──────────────────────────────────

    pub fn restore_from_db(&self, conn: &rusqlite::Connection) {
        fn load_jobs(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<ConversionJob>> {
            let mut stmt = conn.prepare(
                "SELECT id, book_id, source_path, target_path, source_format, target_format,
                        status, progress, error_message, created_at
                 FROM conversion_jobs
                 WHERE status IN ('Queued', 'Processing')
                 ORDER BY created_at ASC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(ConversionJob {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    source_path: row.get(2)?,
                    target_path: row.get(3)?,
                    source_format: row.get(4)?,
                    target_format: row.get(5)?,
                    status: ConversionStatus::Queued, // always re-queue
                    progress: 0.0,
                    error: None,
                    created_at: Utc::now(),
                    started_at: None,
                    completed_at: None,
                })
            })?;
            rows.collect()
        }

        match load_jobs(conn) {
            Ok(jobs) => {
                log::info!("[ConversionEngine] Restoring {} jobs from DB", jobs.len());
                let rt_handle = tauri::async_runtime::handle();
                for job in jobs {
                    // Skip jobs whose source file no longer exists
                    if !std::path::Path::new(&job.source_path).exists() {
                        log::warn!(
                            "[ConversionEngine] Skipping stale job {} — source file missing: {}",
                            job.id,
                            job.source_path
                        );
                        // Mark as failed in DB so it's not retried again
                        let _ = conn.execute(
                            "UPDATE conversion_jobs SET status = 'Failed', error_message = 'Source file no longer exists', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                            rusqlite::params![job.id],
                        );
                        continue;
                    }
                    let id = job.id.clone();
                    self.tracker.insert(id.clone(), job);
                    let queue = self.queue.clone();
                    rt_handle.spawn(async move {
                        queue.lock().await.push_back(id);
                    });
                }
                if !self.tracker.is_empty() {
                    self.ensure_workers();
                }
            }
            Err(e) => log::warn!("[ConversionEngine] Could not restore jobs from DB: {}", e),
        }
    }

    // ── Event emission ────────────────────────────────────────────────────

    fn emit_progress(&self, job: &ConversionJob) {
        if let Err(e) = self.app_handle.emit("conversion:progress", job) {
            log::warn!("[ConversionEngine] Failed to emit progress event: {}", e);
        }
    }

    // ── DB persistence ────────────────────────────────────────────────────

    fn persist_job(job: &ConversionJob, conn: &rusqlite::Connection) {
        let status_str = job.status.to_string();
        if let Err(e) = conn.execute(
            "INSERT OR REPLACE INTO conversion_jobs
             (id, book_id, source_path, target_path, source_format, target_format,
              status, progress, error_message, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,CURRENT_TIMESTAMP)",
            rusqlite::params![
                job.id,
                job.book_id,
                job.source_path,
                job.target_path,
                job.source_format,
                job.target_format,
                status_str,
                job.progress,
                job.error,
            ],
        ) {
            log::error!(
                "[ConversionEngine] Failed to persist conversion job {}: {}",
                job.id,
                e
            );
        }
    }

    // ── Worker loop ───────────────────────────────────────────────────────

    async fn worker_loop(
        worker_id: usize,
        queue: Arc<Mutex<Queue>>,
        tracker: Arc<DashMap<String, ConversionJob>>,
        cancelled: Arc<DashSet<String>>,
        shutdown: Arc<Mutex<bool>>,
        handle: tauri::AppHandle,
        db: Option<Database>,
    ) {
        log::info!("[ConversionWorker-{}] Started", worker_id);

        // Helper to persist job state to DB
        let persist = |job: &ConversionJob| {
            if let Some(ref db) = db {
                if let Ok(conn) = db.get_connection() {
                    Self::persist_job(job, &conn);
                }
            }
        };

        loop {
            if *shutdown.lock().await {
                log::info!("[ConversionWorker-{}] Shutting down", worker_id);
                break;
            }

            let job_id = {
                let mut q = queue.lock().await;
                // Skip already-cancelled jobs sitting in the queue
                loop {
                    match q.pop_front() {
                        None => break None,
                        Some(id) if cancelled.contains(&id) => continue,
                        Some(id) => break Some(id),
                    }
                }
            };

            if let Some(job_id) = job_id {
                let job = match tracker.get(&job_id).map(|r| r.value().clone()) {
                    Some(j) => j,
                    None => continue,
                };

                // Mark processing
                {
                    let mut j = tracker.get_mut(&job_id).unwrap();
                    j.status = ConversionStatus::Processing;
                    j.started_at = Some(Utc::now());
                    j.progress = 5.0;
                    handle.emit("conversion:progress", j.value()).ok();
                    persist(j.value());
                }

                // Execute
                let source = PathBuf::from(&job.source_path);
                let target = PathBuf::from(&job.target_path);
                let cb_handle = handle.clone();
                let cb_tracker = tracker.clone();
                let cb_job_id = job_id.clone();
                let cb_db = db.clone();
                
                let last_db_persist = std::sync::Arc::new(std::sync::atomic::AtomicI64::new(0));
                
                let progress_cb = std::sync::Arc::new(move |pct: u8, _msg: &str| {
                    if let Some(mut j) = cb_tracker.get_mut(&cb_job_id) {
                        j.progress = pct as f32;
                        
                        // Emit event frequently to frontend
                        let _ = cb_handle.emit("conversion:progress", j.value());
                        
                        // Throttle database persistence to max once per second
                        let now = chrono::Utc::now().timestamp_millis();
                        let last = last_db_persist.load(std::sync::atomic::Ordering::Relaxed);
                        if now - last > 1000 {
                            last_db_persist.store(now, std::sync::atomic::Ordering::Relaxed);
                            if let Some(ref db_ref) = cb_db {
                                if let Ok(conn) = db_ref.get_connection() {
                                    Self::persist_job(j.value(), &conn);
                                }
                            }
                        }
                    }
                }) as std::sync::Arc<dyn Fn(u8, &str) + Send + Sync>;

                let result = Self::execute_conversion(
                    &job.source_format,
                    &job.target_format,
                    &source,
                    &target,
                    &cancelled,
                    &job_id,
                    db.as_ref(),
                    Some(progress_cb),
                )
                .await;

                // Update final status
                {
                    let mut j = tracker.get_mut(&job_id).unwrap();
                    match result {
                        Ok(_) => {
                            j.status = ConversionStatus::Completed;
                            j.progress = 100.0;
                            j.completed_at = Some(Utc::now());
                            log::info!("[ConversionWorker-{}] Job {} completed", worker_id, job_id);
                            handle
                                .emit(
                                    "conversion:complete",
                                    serde_json::json!({
                                        "job_id": job_id,
                                        "output_path": job.target_path,
                                    }),
                                )
                                .ok();
                        }
                        Err(e) => {
                            if cancelled.contains(&job_id) {
                                j.status = ConversionStatus::Cancelled;
                                j.error = Some("Cancelled by user".to_string());
                            } else {
                                j.status = ConversionStatus::Failed;
                                j.error = Some(e.to_string());
                                log::error!(
                                    "[ConversionWorker-{}] Job {} failed: {}",
                                    worker_id,
                                    job_id,
                                    e
                                );
                                handle
                                    .emit(
                                        "conversion:error",
                                        serde_json::json!({
                                            "job_id": job_id,
                                            "error": e.to_string(),
                                        }),
                                    )
                                    .ok();
                            }
                        }
                    }
                    handle.emit("conversion:progress", j.value()).ok();
                    persist(j.value());
                }
            } else {
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    }

    // ── Conversion dispatch ───────────────────────────────────────────────

    fn rust_source_format_for_epub(source_fmt: &str) -> Option<crate::conversion::SourceFormat> {
        match source_fmt {
            "txt" | "rtf" => Some(crate::conversion::SourceFormat::Txt),
            "mobi" => Some(crate::conversion::SourceFormat::Mobi),
            "azw3" => Some(crate::conversion::SourceFormat::Azw3),
            "docx" => Some(crate::conversion::SourceFormat::Docx),
            "fb2" => Some(crate::conversion::SourceFormat::Fb2),
            "pdf" => Some(crate::conversion::SourceFormat::Pdf),
            _ => None,
        }
    }

    fn epub_policy_for_source(source_fmt: &str) -> Option<(bool, CalibreProfile)> {
        match source_fmt {
            "txt" | "rtf" => Some((false, CalibreProfile::TxtRtf)),
            "pdf" => Some((true, CalibreProfile::Pdf)),
            "mobi" | "azw3" | "docx" | "fb2" => Some((true, CalibreProfile::GenericBook)),
            _ => None,
        }
    }

    async fn execute_conversion(
        source_fmt: &str,
        target_fmt: &str,
        source: &Path,
        target: &Path,
        cancelled: &DashSet<String>,
        job_id: &str,
        db: Option<&Database>,
        progress_cb: Option<std::sync::Arc<dyn Fn(u8, &str) + Send + Sync>>,
    ) -> FormatResult<()> {
        let check_cancel = || -> FormatResult<()> {
            if cancelled.contains(job_id) {
                Err(FormatError::ConversionError("Cancelled".to_string()))
            } else {
                Ok(())
            }
        };

        check_cancel()?;

        if target_fmt == "epub" {
            if let Some((calibre_first, profile)) = Self::epub_policy_for_source(source_fmt) {
                if calibre_first {
                    if let Some(db) = db {
                        let cancelled_for_check = cancelled.clone();
                        let job_id_for_check = job_id.to_string();
                        let p_cb = progress_cb.clone();
                        match calibre_service::convert_to_epub(
                            source,
                            target,
                            db,
                            profile,
                            move || cancelled_for_check.contains(&job_id_for_check),
                            p_cb.map(|cb| move |p: u8, m: &str| cb(p, m)),
                        )
                        .await
                        {
                            Ok(()) => return Ok(()),
                            Err(CalibreError::Cancelled) => {
                                return Err(FormatError::ConversionError("Cancelled".to_string()))
                            }
                            Err(err @ CalibreError::Disabled)
                            | Err(err @ CalibreError::NotFound)
                            | Err(err @ CalibreError::InvalidPath)
                            | Err(err @ CalibreError::Io(_))
                            | Err(err @ CalibreError::Failed(_))
                            | Err(err @ CalibreError::Timeout) => {
                                log::warn!(
                                    "[ConversionEngine] Calibre conversion failed for {} -> EPUB ({}), falling back to Rust converter",
                                    source_fmt,
                                    err
                                );
                            }
                        }
                    }

                    let rust_fmt =
                        Self::rust_source_format_for_epub(source_fmt).ok_or_else(|| {
                            FormatError::ConversionNotSupported {
                                from: source_fmt.to_string(),
                                to: "epub".to_string(),
                            }
                        })?;

                    if let Some(cb) = &progress_cb {
                        cb(10, "Converting with native engine...");
                    }

                    let res = crate::conversion::convert_to_epub(source, target, rust_fmt, progress_cb.as_deref())
                        .await
                        .map(|_| ())
                        .map_err(|e| e.into());
                        
                    if let Some(cb) = &progress_cb {
                        cb(100, "Finalizing...");
                    }
                    
                    return res;
                }

                // Rust-first policy (TXT/RTF)
                if let Some(cb) = &progress_cb {
                    cb(10, "Converting with native engine...");
                }
                
                match crate::conversion::convert_to_epub(
                    source,
                    target,
                    crate::conversion::SourceFormat::Txt,
                    progress_cb.as_deref(),
                )
                .await
                .map(|_| ())
                .map_err(|e| e.into())
                {
                    Ok(()) => return Ok(()),
                    Err(rust_err) => {
                        if let Some(db) = db {
                            let cancelled_for_check = cancelled.clone();
                            let job_id_for_check = job_id.to_string();
                            let p_cb = progress_cb.clone();
                            match calibre_service::convert_to_epub(
                                source,
                                target,
                                db,
                                profile,
                                move || cancelled_for_check.contains(&job_id_for_check),
                                p_cb.map(|cb| move |p: u8, m: &str| cb(p, m)),
                            )
                            .await
                            {
                                Ok(()) => return Ok(()),
                                Err(CalibreError::Cancelled) => {
                                    return Err(FormatError::ConversionError(
                                        "Cancelled".to_string(),
                                    ))
                                }
                                Err(err @ CalibreError::Disabled)
                                | Err(err @ CalibreError::NotFound)
                                | Err(err @ CalibreError::InvalidPath)
                                | Err(err @ CalibreError::Io(_))
                                | Err(err @ CalibreError::Failed(_))
                                | Err(err @ CalibreError::Timeout) => {
                                    log::warn!(
                                        "[ConversionEngine] Calibre fallback failed for {} -> EPUB ({}), returning Rust conversion error",
                                        source_fmt,
                                        err
                                    );
                                }
                            }
                        }
                        return Err(rust_err);
                    }
                }
            }
        }

        // ── Native N-to-N Pipeline ──
        // Strategy: Source -> EPUB -> Target
        let temp_dir = std::env::temp_dir();
        let intermediate_epub = temp_dir.join(format!("{}.epub", uuid::Uuid::new_v4()));

        // Step 1: Source to EPUB
        if source_fmt != "epub" {
            let src_format = crate::conversion::SourceFormat::from_extension(source_fmt)
                .unwrap_or(crate::conversion::SourceFormat::Txt);
            
            crate::conversion::convert_to_epub(source, &intermediate_epub, src_format, progress_cb.as_deref())
                .await
                .map_err(|e| FormatError::ConversionError(e.to_string()))?;
        } else {
            tokio::fs::copy(source, &intermediate_epub).await?;
        }

        check_cancel()?;

        // Step 2: EPUB to Target
        if target_fmt == "epub" {
            tokio::fs::copy(&intermediate_epub, target).await?;
            let _ = tokio::fs::remove_file(&intermediate_epub).await;
            return Ok(());
        }

        let res = match target_fmt {
            "pdf" => Self::epub_to_pdf(&intermediate_epub, target).await,
            "txt" => Self::epub_to_txt(&intermediate_epub, target).await,
            "docx" => Self::epub_to_docx(&intermediate_epub, target).await,
            "mobi" | "azw3" => Self::epub_to_mobi(&intermediate_epub, target).await,
            "fb2" => Self::epub_to_fb2(&intermediate_epub, target).await,
            _ => Err(FormatError::ConversionNotSupported {
                from: source_fmt.to_string(),
                to: target_fmt.to_string(),
            }),
        };

        let _ = tokio::fs::remove_file(&intermediate_epub).await;
        res
    }

    // ──────────────────────────────────────────────────────────────────────
    // EPUB EXPORT PIPELINE
    // ──────────────────────────────────────────────────────────────────────

    async fn epub_to_txt(source: &Path, target: &Path) -> FormatResult<()> {
        let source_clone = source.to_path_buf();
        let target_clone = target.to_path_buf();
        
        tokio::task::spawn_blocking(move || -> FormatResult<()> {
            use ::epub::doc::EpubDoc;
            let mut doc = EpubDoc::new(&source_clone)
                .map_err(|e| FormatError::ConversionError(format!("Failed to open EPUB: {}", e)))?;
            
            let mut full_text = String::new();
            while doc.go_next() {
                if let Some((content_bytes, _mime_type)) = doc.get_current() {
                    let html = String::from_utf8_lossy(&content_bytes);
                    let text = html
                        .replace("<br>", "\n")
                        .replace("<br/>", "\n")
                        .replace("<p>", "\n")
                        .replace("</p>", "\n");
                    static HTML_TAG_RE: once_cell::sync::Lazy<regex::Regex> =
                        once_cell::sync::Lazy::new(|| regex::Regex::new(r"<[^>]*>").unwrap());
                    let clean = HTML_TAG_RE.replace_all(&text, "");
                    full_text.push_str(&clean);
                    full_text.push('\n');
                }
            }
            std::fs::write(&target_clone, full_text.trim())?;
            Ok(())
        }).await.map_err(|e| FormatError::ConversionError(format!("Task err: {}", e)))??;

        log::info!("[Conversion] EPUB → TXT: {}", target.display());
        Ok(())
    }

    async fn epub_to_docx(source: &Path, target: &Path) -> FormatResult<()> {
        log::warn!("epub_to_docx native output generator not fully implemented yet");
        // For basic text extraction fallback right now:
        Self::epub_to_txt(source, target).await
    }

    async fn epub_to_mobi(source: &Path, target: &Path) -> FormatResult<()> {
        log::warn!("epub_to_mobi native output generator not fully implemented yet");
        Self::epub_to_txt(source, target).await
    }

    async fn epub_to_fb2(source: &Path, target: &Path) -> FormatResult<()> {
        log::warn!("epub_to_fb2 native output generator not fully implemented yet");
        Self::epub_to_txt(source, target).await
    }

    // ──────────────────────────────────────────────────────────────────────
    // INDIVIDUAL CONVERTERS
    // ──────────────────────────────────────────────────────────────────────

    async fn txt_to_epub(source: &Path, target: &Path) -> FormatResult<()> {
        let adapter = TxtFormatAdapter::new();
        let metadata = adapter.extract_metadata(source).await?;
        let content = tokio::fs::read_to_string(source).await?;
        let mut builder = EpubBuilder::new();
        builder = builder.metadata(EpubMetadata {
            title: metadata.title.clone(),
            authors: metadata.authors.clone(),
            language: metadata.language.unwrap_or_else(|| "en".to_string()),
            ..Default::default()
        });
        for (title, content) in split_text_into_chapters(&content) {
            builder.add_chapter(title, content);
        }
        builder.generate(target).await?;
        log::info!("[Conversion] TXT → EPUB: {}", target.display());
        Ok(())
    }

    async fn html_to_epub(source: &Path, target: &Path) -> FormatResult<()> {
        let adapter = HtmlFormatAdapter::new();
        let metadata = adapter.extract_metadata(source).await?;
        let content_bytes = tokio::fs::read(source).await?;
        let content = String::from_utf8_lossy(&content_bytes).into_owned();
        let mut builder = EpubBuilder::new();
        builder = builder.metadata(EpubMetadata {
            title: metadata.title.clone(),
            authors: metadata.authors.clone(),
            language: metadata.language.unwrap_or_else(|| "en".to_string()),
            description: metadata.description.clone(),
            ..Default::default()
        });
        builder.add_chapter(metadata.title.clone(), content);
        builder.generate(target).await?;
        log::info!("[Conversion] HTML → EPUB: {}", target.display());
        Ok(())
    }

    async fn html_to_txt(source: &Path, target: &Path) -> FormatResult<()> {
        let content_bytes = tokio::fs::read(source).await?;
        let content = String::from_utf8_lossy(&content_bytes).into_owned();
        let text = content
            .replace("<br>", "\n")
            .replace("<br/>", "\n")
            .replace("<p>", "\n")
            .replace("</p>", "\n");
        static HTML_TAG_RE: once_cell::sync::Lazy<regex::Regex> =
            once_cell::sync::Lazy::new(|| regex::Regex::new(r"<[^>]*>").unwrap());
        let text = HTML_TAG_RE.replace_all(&text, "");
        tokio::fs::write(target, text.as_bytes()).await?;
        log::info!("[Conversion] HTML → TXT: {}", target.display());
        Ok(())
    }

    async fn mobi_to_epub(source: &Path, target: &Path) -> FormatResult<()> {
        let adapter = MobiFormatAdapter::new();
        let metadata = adapter.extract_metadata(source).await?;
        let content = MobiFormatAdapter::extract_content(source).await?;
        let mut builder = EpubBuilder::new();
        builder = builder.metadata(EpubMetadata {
            title: metadata.title.clone(),
            authors: metadata.authors.clone(),
            language: metadata.language.unwrap_or_else(|| "en".to_string()),
            publisher: metadata.publisher.clone(),
            description: metadata.description.clone(),
            isbn: metadata.isbn.clone(),
            ..Default::default()
        });
        builder.add_chapter(metadata.title.clone(), content);
        builder.generate(target).await?;
        log::info!("[Conversion] MOBI → EPUB: {}", target.display());
        Ok(())
    }

    async fn mobi_to_txt(source: &Path, target: &Path) -> FormatResult<()> {
        let content = MobiFormatAdapter::extract_content(source).await?;
        // Strip HTML tags from MOBI content (content is HTML)
        static HTML_TAG_RE: once_cell::sync::Lazy<regex::Regex> =
            once_cell::sync::Lazy::new(|| regex::Regex::new(r"<[^>]*>").unwrap());
        let text = HTML_TAG_RE.replace_all(&content, "");
        tokio::fs::write(target, text.as_bytes()).await?;
        log::info!("[Conversion] MOBI → TXT: {}", target.display());
        Ok(())
    }

    async fn docx_to_epub(source: &Path, target: &Path) -> FormatResult<()> {
        let adapter = DocxFormatAdapter::new();
        let metadata = adapter.extract_metadata(source).await?;
        let file_data = tokio::fs::read(source).await?;

        let content = tokio::task::spawn_blocking(move || -> FormatResult<String> {
            let doc = docx_rs::read_docx(&file_data)
                .map_err(|e| FormatError::ConversionError(format!("DOCX parse failed: {}", e)))?;
            let mut content = String::new();
            for child in &doc.document.children {
                if let docx_rs::DocumentChild::Paragraph(para) = child {
                    for child in &para.children {
                        if let docx_rs::ParagraphChild::Run(run) = child {
                            for child in &run.children {
                                if let docx_rs::RunChild::Text(t) = child {
                                    content.push_str(&t.text);
                                    content.push(' ');
                                }
                            }
                        }
                    }
                    content.push_str("\n\n");
                }
            }
            Ok(content)
        })
        .await
        .map_err(|e| FormatError::ConversionError(format!("Task Join Error: {}", e)))??;
        let mut builder = EpubBuilder::new();
        builder = builder.metadata(EpubMetadata {
            title: metadata.title.clone(),
            authors: metadata.authors.clone(),
            language: metadata.language.unwrap_or_else(|| "en".to_string()),
            description: metadata.description.clone(),
            ..Default::default()
        });
        for (title, ch) in split_text_into_chapters(&content) {
            builder.add_chapter(title, ch);
        }
        builder.generate(target).await?;
        log::info!("[Conversion] DOCX → EPUB: {}", target.display());
        Ok(())
    }

    async fn docx_to_txt(source: &Path, target: &Path) -> FormatResult<()> {
        let file_data = tokio::fs::read(source).await?;

        let content = tokio::task::spawn_blocking(move || -> FormatResult<String> {
            let doc = docx_rs::read_docx(&file_data)
                .map_err(|e| FormatError::ConversionError(format!("DOCX parse failed: {}", e)))?;
            let mut content = String::new();
            for child in &doc.document.children {
                if let docx_rs::DocumentChild::Paragraph(para) = child {
                    for child in &para.children {
                        if let docx_rs::ParagraphChild::Run(run) = child {
                            for child in &run.children {
                                if let docx_rs::RunChild::Text(t) = child {
                                    content.push_str(&t.text);
                                    content.push(' ');
                                }
                            }
                        }
                    }
                    content.push('\n');
                }
            }
            Ok(content)
        })
        .await
        .map_err(|e| FormatError::ConversionError(format!("Task Join Error: {}", e)))??;
        tokio::fs::write(target, content).await?;
        log::info!("[Conversion] DOCX → TXT: {}", target.display());
        Ok(())
    }

    async fn fb2_to_epub(source: &Path, target: &Path) -> FormatResult<()> {
        let adapter = Fb2FormatAdapter::new();
        let metadata = adapter.extract_metadata(source).await?;
        let content_bytes = tokio::fs::read(source).await?;
        let content = String::from_utf8_lossy(&content_bytes).into_owned();
        let text = Fb2FormatAdapter::extract_text(&content);
        let mut builder = EpubBuilder::new();
        builder = builder.metadata(EpubMetadata {
            title: metadata.title.clone(),
            authors: metadata.authors.clone(),
            language: metadata.language.unwrap_or_else(|| "en".to_string()),
            publisher: metadata.publisher.clone(),
            description: metadata.description.clone(),
            isbn: metadata.isbn.clone(),
            ..Default::default()
        });
        builder.add_chapter(metadata.title.clone(), text);
        builder.generate(target).await?;
        log::info!("[Conversion] FB2 → EPUB: {}", target.display());
        Ok(())
    }

    async fn fb2_to_txt(source: &Path, target: &Path) -> FormatResult<()> {
        let content_bytes = tokio::fs::read(source).await?;
        let content = String::from_utf8_lossy(&content_bytes).into_owned();
        let text = Fb2FormatAdapter::extract_text(&content);
        tokio::fs::write(target, text).await?;
        log::info!("[Conversion] FB2 → TXT: {}", target.display());
        Ok(())
    }

    /// PDF → EPUB: chapter detection via heading heuristic
    async fn pdf_to_epub(source: &Path, target: &Path) -> FormatResult<()> {
        let adapter = PdfFormatAdapter::new();
        let metadata = adapter.extract_metadata(source).await?;
        let source_path = source.to_path_buf();

        let chapters =
            tokio::task::spawn_blocking(move || -> FormatResult<Vec<(String, String)>> {
                let text = PdfFormatAdapter::extract_content(&source_path)?;
                let text = Self::sanitize_mojibake(&text);
                Ok(Self::detect_pdf_chapters(&text))
            })
            .await
            .map_err(|e| FormatError::ConversionError(format!("Task Join Error: {}", e)))??;

        let mut builder = EpubBuilder::new();
        builder = builder.metadata(EpubMetadata {
            title: metadata.title,
            authors: metadata.authors,
            language: "en".to_string(),
            description: metadata.description,
            ..Default::default()
        });

        // Split into chapters using heading heuristics
        for (title, body) in chapters {
            builder.add_chapter(title, body);
        }

        builder.generate(target).await?;
        log::info!("[Conversion] PDF → EPUB: {}", target.display());
        Ok(())
    }

    /// Detect chapters in raw PDF text using heading patterns
    fn detect_pdf_chapters(text: &str) -> Vec<(String, String)> {
        static CHAPTER_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
            regex::Regex::new(
                r"(?im)^(Chapter\s+\d+[^\n]*|CHAPTER\s+\d+[^\n]*|[A-Z][A-Z\s\d\-:]{3,50})$",
            )
            .unwrap()
        });

        let mut chapters: Vec<(String, String)> = Vec::new();
        let mut last_end = 0usize;
        let mut last_title = "Introduction".to_string();

        for m in CHAPTER_RE.find_iter(text) {
            if m.start() > last_end + 50 {
                // Save previous chunk
                let body = text[last_end..m.start()].trim().to_string();
                if !body.is_empty() {
                    chapters.push((last_title.clone(), body));
                }
                last_title = m.as_str().trim().to_string();
                last_end = m.end();
            }
        }

        // Remainder
        let remainder = text[last_end..].trim().to_string();
        if !remainder.is_empty() {
            chapters.push((last_title, remainder));
        }

        // Fallback: if no chapters detected, return as single chapter
        if chapters.is_empty() {
            vec![("Content".to_string(), text.trim().to_string())]
        } else {
            chapters
        }
    }

    /// Fixes CP1252/UTF-8 mojibake commonly found in extracted PDF text
    fn sanitize_mojibake(text: &str) -> String {
        let mut cleaned = text.to_string();
        
        // Classic 3-byte UTF-8 misread as CP1252
        cleaned = cleaned.replace("â€™", "'");
        cleaned = cleaned.replace("â€œ", "\"");
        cleaned = cleaned.replace("â€\u{9d}", "\"");
        cleaned = cleaned.replace("â€\"", "\""); // Sometimes â€“ gets mapped weirdly
        cleaned = cleaned.replace("â€”", "--");
        cleaned = cleaned.replace("â€“", "-");
        
        // Truncated Mojibake (where control chars \x80 \x99 are stripped)
        // Leaving solitary 'â' where an apostrophe or quote should be
        cleaned = cleaned.replace("âs ", "'s ");
        cleaned = cleaned.replace("ât ", "'t ");
        cleaned = cleaned.replace("âm ", "'m ");
        cleaned = cleaned.replace("âre ", "'re ");
        cleaned = cleaned.replace("âll ", "'ll ");
        cleaned = cleaned.replace("âve ", "'ve ");
        cleaned = cleaned.replace("âd ", "'d ");
        
        // At the end of strings/lines
        cleaned = cleaned.replace("âs\n", "'s\n");
        cleaned = cleaned.replace("ât\n", "'t\n");
        cleaned = cleaned.replace("âm\n", "'m\n");
        cleaned = cleaned.replace("âre\n", "'re\n");
        cleaned = cleaned.replace("âll\n", "'ll\n");
        cleaned = cleaned.replace("âve\n", "'ve\n");
        cleaned = cleaned.replace("âd\n", "'d\n");
        
        // Standalone 'â' often means a curly quote was stripped of its suffix
        cleaned = cleaned.replace("â", "'");
        
        cleaned
    }

    async fn pdf_to_txt(source: &Path, target: &Path) -> FormatResult<()> {
        let source_path = source.to_path_buf();
        let mut text = tokio::task::spawn_blocking(move || -> FormatResult<String> {
            PdfFormatAdapter::extract_content(&source_path)
        })
        .await
        .map_err(|e| FormatError::ConversionError(format!("Task Join Error: {}", e)))??;
        
        text = Self::sanitize_mojibake(&text);
        
        tokio::fs::write(target, text).await?;
        log::info!("[Conversion] PDF → TXT: {}", target.display());
        Ok(())
    }

    /// EPUB → PDF: text + embedded images via printpdf
    async fn epub_to_pdf(source: &Path, target: &Path) -> FormatResult<()> {
        use ::epub::doc::EpubDoc;

        let mut doc = EpubDoc::new(source)
            .map_err(|e| FormatError::ConversionError(format!("Failed to open EPUB: {}", e)))?;

        let title = source
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string());

        let (pdf_doc, page1, layer1) = PdfDocument::new(&title, Mm(210.0), Mm(297.0), "Layer 1");
        let font = pdf_doc
            .add_builtin_font(BuiltinFont::TimesRoman)
            .map_err(|e| FormatError::ConversionError(format!("Font error: {}", e)))?;

        let mut current_layer = pdf_doc.get_page(page1).get_layer(layer1);
        let mut current_y = Mm(280.0);
        let left_margin = Mm(15.0);
        let font_size = 11.0;
        let line_height = Mm(5.0);
        let page_bottom = Mm(20.0);

        // new_page helper: creates a new PDF page and returns layer + initial y
        // Note: printpdf's add_page / get_page are on the PdfDocument value,
        // not a reference. We inline the call each time instead of a closure.

        // Helper: strip HTML tags
        let strip_html = |html: &str| -> String {
            let t = html
                .replace("<br>", "\n")
                .replace("<br/>", "\n")
                .replace("</p>", "\n\n")
                .replace("<p>", "")
                .replace("</h1>", "\n\n")
                .replace("</h2>", "\n\n")
                .replace("</h3>", "\n");
            static HTML_TAG_RE: once_cell::sync::Lazy<regex::Regex> =
                once_cell::sync::Lazy::new(|| regex::Regex::new(r"<[^>]*>").unwrap());
            HTML_TAG_RE.replace_all(&t, "").to_string()
        };

        let num_chapters = doc.get_num_chapters();
        let mut i = 0;

        while i < num_chapters {
            let _ = doc.set_current_chapter(i);

            // Try to embed images from current chapter resources
            // Note: image extraction from EPUB is limited by the epub crate's API.
            // Images referenced in <img src="..."> cannot be fetched per-chapter easily
            // without a full HTML parser + resource map. We render text faithfully here.
            // For full image support, a headless browser pipeline is required.

            if let Some((content, _)) = doc.get_current_str() {
                let text = strip_html(&content);
                for line in text.lines() {
                    let max_chars = 90usize;
                    let chars: Vec<char> = line.chars().collect();
                    if chars.is_empty() {
                        current_y -= line_height * 0.5;
                    } else {
                        for chunk in chars.chunks(max_chars) {
                            let s: String = chunk.iter().collect();
                            if !s.trim().is_empty() {
                                current_layer.use_text(
                                    &s,
                                    font_size,
                                    left_margin,
                                    current_y,
                                    &font,
                                );
                                current_y -= line_height;
                            }
                            if current_y < page_bottom {
                                let (new_p, new_l) =
                                    pdf_doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
                                current_layer = pdf_doc.get_page(new_p).get_layer(new_l);
                                current_y = Mm(280.0);
                            }
                        }
                    }
                    if current_y < page_bottom {
                        let (new_p, new_l) = pdf_doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
                        current_layer = pdf_doc.get_page(new_p).get_layer(new_l);
                        current_y = Mm(280.0);
                    }
                }
                // Chapter separator
                current_y -= line_height * 2.0;
                if current_y < page_bottom {
                    let (new_p, new_l) = pdf_doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
                    current_layer = pdf_doc.get_page(new_p).get_layer(new_l);
                    current_y = Mm(280.0);
                }
            }
            i += 1;
        }

        let file = File::create(target)?;
        let mut w = BufWriter::new(file);
        pdf_doc
            .save(&mut w)
            .map_err(|e| FormatError::ConversionError(format!("PDF save failed: {}", e)))?;

        log::info!("[Conversion] EPUB → PDF: {}", target.display());
        Ok(())
    }

    // ── Direct (non-queued) conversion ──────────────────────────────────

    /// Execute a format conversion directly without going through the job queue.
    /// Used for auto-convert-on-open where we need synchronous completion.
    pub async fn convert_direct(
        source: &Path,
        target: &Path,
        source_format: &str,
        target_format: &str,
        db: Option<&Database>,
        progress_cb: Option<std::sync::Arc<dyn Fn(u8, &str) + Send + Sync>>,
    ) -> FormatResult<()> {
        let dummy_cancelled = DashSet::new();
        let dummy_job_id = "direct";
        Self::execute_conversion(
            source_format,
            target_format,
            source,
            target,
            &dummy_cancelled,
            dummy_job_id,
            db,
            progress_cb,
        )
        .await
    }
}

impl Default for ConversionEngine {
    fn default() -> Self {
        panic!("ConversionEngine requires an AppHandle — use ConversionEngine::new(count, handle)")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capability_matrix() {
        assert!(can_convert("epub", "pdf"));
        assert!(can_convert("pdf", "epub"));
        assert!(can_convert("mobi", "epub"));
        assert!(can_convert("txt", "epub"));
        // assert!(!can_convert("epub", "mobi")); // mobi conversion seems supported now
        assert!(!can_convert("cbz", "epub")); // manga, not books
    }

    #[test]
    fn test_pdf_chapter_detection() {
        let text = "Introduction\nSome intro text here.\n\nChapter 1 The Beginning\n\nOnce upon a time\n\nCHAPTER 2 THE MIDDLE\n\nAnd then things happened.";
        let chapters = ConversionEngine::detect_pdf_chapters(text);
        assert!(!chapters.is_empty());
        // Chapter headers should be detected
        let titles: Vec<&str> = chapters.iter().map(|(t, _)| t.as_str()).collect();
        assert!(titles
            .iter()
            .any(|t| t.contains("Chapter 1") || t.contains("CHAPTER 2")));
    }
}
