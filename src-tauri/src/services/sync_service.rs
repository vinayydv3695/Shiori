use anyhow::{anyhow, Result};
use axum::{
    extract::{Json, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Router,
};
use log::{info, warn};
use rand::{distributions::Alphanumeric, Rng};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tokio::task::JoinHandle;
use tower_http::trace::TraceLayer;

use crate::db::Database;
use crate::models::{Annotation, Book, ReadingProgress};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerReadingProgress {
    pub current_location: String,
    pub progress_percent: f64,
    pub current_page: Option<i32>,
    pub total_pages: Option<i32>,
    pub cfi_location: Option<String>,
    pub last_read: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerBookmark {
    pub annotation_type: String, // 'bookmark', 'highlight', 'note'
    pub location: String,
    pub cfi_range: Option<String>,
    pub selected_text: Option<String>,
    pub note_content: Option<String>,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerBookSync {
    pub book_uuid: String,
    pub title: String,
    pub file_hash: Option<String>,
    pub isbn: Option<String>,
    pub reading_status: Option<String>,
    pub progress: Option<PeerReadingProgress>,
    pub bookmarks: Vec<PeerBookmark>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerReadingSession {
    pub id: String, // UUID
    pub book_uuid: String,
    pub book_title: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: i64,
    pub pages_start: Option<i32>,
    pub pages_end: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerSyncPayload {
    pub device_name: String,
    pub client_version: String,
    pub since: Option<String>,
    pub books: Vec<PeerBookSync>,
    pub sessions: Vec<PeerReadingSession>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerSyncResponse {
    pub success: bool,
    pub message: String,
    pub synced_books: usize,
    pub synced_sessions: usize,
    pub host_data: PeerSyncPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncDelta {
    pub books: Vec<Book>,
    pub progress: Vec<ReadingProgress>,
    pub annotations: Vec<Annotation>,
}

#[derive(Clone)]
struct AppState {
    db: Database,
}

pub struct SyncService {
    db: Database,
    server_handle: Option<JoinHandle<Result<()>>>,
    port: u16,
}

impl SyncService {
    pub fn new(db: Database, port: Option<u16>) -> Self {
        Self {
            db,
            server_handle: None,
            port: port.unwrap_or(8081),
        }
    }

    /// Gets or generates the pairing token for sync
    pub fn get_pairing_token(&self) -> Result<String> {
        let conn = self.db.get_connection().map_err(|e| anyhow!("{}", e))?;

        let token: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'sync_pairing_token'",
                [],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(t) = token {
            Ok(t)
        } else {
            let new_token: String = rand::thread_rng()
                .sample_iter(&Alphanumeric)
                .take(32)
                .map(char::from)
                .collect();

            conn.execute(
                "INSERT INTO settings (key, value, type) VALUES ('sync_pairing_token', ?1, 'string')
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![new_token],
            )?;

            Ok(new_token)
        }
    }

    /// Rotate token (invalidate previous pairings)
    pub fn rotate_pairing_token(&self) -> Result<String> {
        let conn = self.db.get_connection().map_err(|e| anyhow!("{}", e))?;
        let new_token: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(32)
            .map(char::from)
            .collect();

        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, type) VALUES ('sync_pairing_token', ?1, 'string')",
            params![new_token],
        )?;

        Ok(new_token)
    }

    pub fn ensure_pairing_token(&self) -> Result<String> {
        self.get_pairing_token()
    }

    pub async fn start_server(&mut self) -> Result<()> {
        if self.server_handle.is_some() {
            warn!("Sync server already running");
            return Ok(());
        }

        // Ensure pairing token is generated before listening
        let _ = self.ensure_pairing_token();

        let state = AppState {
            db: self.db.clone(),
        };

        let app = Router::new()
            .route("/sync/pair", post(handle_pair))
            .route("/sync/delta", get(handle_get_delta))
            .route("/sync/push", post(handle_push_delta))
            .route("/sync/p2p", post(handle_p2p_sync))
            .layer(TraceLayer::new_for_http())
            .with_state(state);

        let addr = SocketAddr::from(([0, 0, 0, 0], self.port));
        info!("Sync server starting on {}", addr);

        let handle = tokio::spawn(async move {
            let listener = tokio::net::TcpListener::bind(addr).await?;
            axum::serve(listener, app).await?;
            Ok::<(), anyhow::Error>(())
        });

        self.server_handle = Some(handle);
        info!("Sync server started successfully on port {}", self.port);

        Ok(())
    }

    pub async fn stop_server(&mut self) -> Result<()> {
        if let Some(handle) = self.server_handle.take() {
            handle.abort();
            info!("Sync server stopped");
        }
        Ok(())
    }

    pub fn is_running(&self) -> bool {
        self.server_handle.is_some()
    }
}

// --- Matching & Sync Logic ---

pub fn find_local_book_id(
    conn: &Connection,
    uuid: &str,
    title: &str,
    isbn: Option<&str>,
    file_hash: Option<&str>,
) -> Option<i64> {
    // 1. Match by uuid
    if !uuid.is_empty() {
        if let Ok(id) = conn.query_row(
            "SELECT id FROM books WHERE uuid = ?1 AND in_trash = 0 LIMIT 1",
            params![uuid],
            |r| r.get(0),
        ) {
            return Some(id);
        }
    }

    // 2. Match by file_hash
    if let Some(hash) = file_hash {
        if !hash.is_empty() {
            if let Ok(id) = conn.query_row(
                "SELECT id FROM books WHERE file_hash = ?1 AND in_trash = 0 LIMIT 1",
                params![hash],
                |r| r.get(0),
            ) {
                return Some(id);
            }
        }
    }

    // 3. Match by ISBN / ISBN13
    if let Some(code) = isbn {
        if !code.is_empty() {
            if let Ok(id) = conn.query_row(
                "SELECT id FROM books WHERE (isbn = ?1 OR isbn13 = ?1) AND in_trash = 0 LIMIT 1",
                params![code],
                |r| r.get(0),
            ) {
                return Some(id);
            }
        }
    }

    // 4. Match by Title (case-insensitive)
    let clean_title = title.trim();
    if !clean_title.is_empty() {
        if let Ok(id) = conn.query_row(
            "SELECT id FROM books WHERE LOWER(TRIM(title)) = LOWER(?1) AND in_trash = 0 LIMIT 1",
            params![clean_title],
            |r| r.get(0),
        ) {
            return Some(id);
        }
    }

    None
}

pub fn apply_incoming_sync_data(
    conn: &mut Connection,
    payload: &PeerSyncPayload,
) -> Result<(usize, usize)> {
    let tx = conn.transaction()?;
    let mut updated_books = 0;
    let mut updated_sessions = 0;

    for book_sync in &payload.books {
        if let Some(book_id) = find_local_book_id(
            &tx,
            &book_sync.book_uuid,
            &book_sync.title,
            book_sync.isbn.as_deref(),
            book_sync.file_hash.as_deref(),
        ) {
            let mut book_changed = false;

            if let Some(prog) = &book_sync.progress {
                let existing_last_read: Option<String> = tx
                    .query_row(
                        "SELECT last_read FROM reading_progress WHERE book_id = ?1",
                        params![book_id],
                        |r| r.get(0),
                    )
                    .optional()?;

                let should_update = match existing_last_read {
                    Some(ref local_lr) => prog.last_read >= *local_lr,
                    None => true,
                };

                if should_update {
                    tx.execute(
                        "INSERT INTO reading_progress (book_id, current_location, progress_percent, current_page, total_pages, cfi_location, last_read)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                         ON CONFLICT(book_id) DO UPDATE SET
                         current_location = excluded.current_location,
                         progress_percent = excluded.progress_percent,
                         current_page = excluded.current_page,
                         total_pages = excluded.total_pages,
                         cfi_location = excluded.cfi_location,
                         last_read = excluded.last_read",
                        params![
                            book_id,
                            prog.current_location,
                            prog.progress_percent,
                            prog.current_page,
                            prog.total_pages,
                            prog.cfi_location,
                            prog.last_read
                        ],
                    )?;

                    if let Some(ref status) = book_sync.reading_status {
                        tx.execute(
                            "UPDATE books SET reading_status = ?1, last_opened = ?2 WHERE id = ?3",
                            params![status, prog.last_read, book_id],
                        )?;
                    } else {
                        tx.execute(
                            "UPDATE books SET last_opened = ?1 WHERE id = ?2",
                            params![prog.last_read, book_id],
                        )?;
                    }

                    book_changed = true;
                }
            }

            // Sync bookmarks and annotations
            for bm in &book_sync.bookmarks {
                let existing: Option<(i64, String)> = tx
                    .query_row(
                        "SELECT id, updated_at FROM annotations
                         WHERE book_id = ?1 AND type = ?2 AND (location = ?3 OR (cfi_range IS NOT NULL AND cfi_range = ?4))
                         LIMIT 1",
                        params![book_id, bm.annotation_type, bm.location, bm.cfi_range],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .optional()?;

                match existing {
                    None => {
                        tx.execute(
                            "INSERT INTO annotations (book_id, type, location, cfi_range, selected_text, note_content, color, created_at, updated_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                            params![
                                book_id,
                                bm.annotation_type,
                                bm.location,
                                bm.cfi_range,
                                bm.selected_text,
                                bm.note_content,
                                bm.color.as_deref().unwrap_or("#FFEB3B"),
                                bm.created_at,
                                bm.updated_at
                            ],
                        )?;
                        book_changed = true;
                    }
                    Some((ann_id, local_updated)) => {
                        if bm.updated_at > local_updated {
                            tx.execute(
                                "UPDATE annotations SET location = ?1, cfi_range = ?2, selected_text = ?3, note_content = ?4, color = ?5, updated_at = ?6
                                 WHERE id = ?7",
                                params![
                                    bm.location,
                                    bm.cfi_range,
                                    bm.selected_text,
                                    bm.note_content,
                                    bm.color.as_deref().unwrap_or("#FFEB3B"),
                                    bm.updated_at,
                                    ann_id
                                ],
                            )?;
                            book_changed = true;
                        }
                    }
                }
            }

            if book_changed {
                updated_books += 1;
            }
        }
    }

    // Sessions sync (streak & reading time continuity)
    for session in &payload.sessions {
        if let Some(book_id) = find_local_book_id(
            &tx,
            &session.book_uuid,
            &session.book_title,
            None,
            None,
        ) {
            let res = tx.execute(
                "INSERT INTO reading_sessions (id, book_id, started_at, ended_at, duration_seconds, pages_start, pages_end)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET
                 ended_at = excluded.ended_at,
                 duration_seconds = excluded.duration_seconds,
                 pages_start = excluded.pages_start,
                 pages_end = excluded.pages_end",
                params![
                    session.id,
                    book_id,
                    session.started_at,
                    session.ended_at,
                    session.duration_seconds,
                    session.pages_start,
                    session.pages_end
                ],
            )?;
            if res > 0 {
                updated_sessions += 1;
            }
        }
    }

    tx.commit()?;
    Ok((updated_books, updated_sessions))
}

pub fn extract_local_sync_data(
    conn: &Connection,
    since: Option<&str>,
) -> Result<PeerSyncPayload> {
    let hostname = hostname::get()
        .unwrap_or_else(|_| "Shiori_Device".into())
        .to_string_lossy()
        .to_string();

    let mut books = Vec::new();

    let (sql, filter_param): (&str, Option<String>) = match since {
        Some(s) if !s.is_empty() => (
            "SELECT b.id, b.uuid, b.title, b.isbn, b.file_hash, b.reading_status,
                    p.current_location, p.progress_percent, p.current_page, p.total_pages, p.cfi_location, p.last_read
             FROM books b
             JOIN reading_progress p ON b.id = p.book_id
             WHERE b.in_trash = 0 AND (p.last_read >= ?1 OR b.modified_date >= ?1)",
            Some(s.to_string()),
        ),
        _ => (
            "SELECT b.id, b.uuid, b.title, b.isbn, b.file_hash, b.reading_status,
                    p.current_location, p.progress_percent, p.current_page, p.total_pages, p.cfi_location, p.last_read
             FROM books b
             JOIN reading_progress p ON b.id = p.book_id
             WHERE b.in_trash = 0",
            None,
        ),
    };

    let mut stmt = conn.prepare(sql)?;
    let book_mapper = |row: &rusqlite::Row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            PeerReadingProgress {
                current_location: row.get(6)?,
                progress_percent: row.get(7)?,
                current_page: row.get(8)?,
                total_pages: row.get(9)?,
                cfi_location: row.get(10)?,
                last_read: row.get(11)?,
            },
        ))
    };

    let book_rows: Vec<_> = match filter_param {
        Some(ref p) => stmt.query_map(params![p], book_mapper)?.collect(),
        None => stmt.query_map([], book_mapper)?.collect(),
    };

    for row_res in book_rows {
        if let Ok((book_id, book_uuid, title, isbn, file_hash, reading_status, prog)) = row_res {
            let mut ann_stmt = conn.prepare(
                "SELECT type, location, cfi_range, selected_text, note_content, color, created_at, updated_at
                 FROM annotations WHERE book_id = ?1",
            )?;

            let ann_rows = ann_stmt.query_map(params![book_id], |r| {
                Ok(PeerBookmark {
                    annotation_type: r.get(0)?,
                    location: r.get(1)?,
                    cfi_range: r.get(2)?,
                    selected_text: r.get(3)?,
                    note_content: r.get(4)?,
                    color: r.get(5)?,
                    created_at: r.get(6)?,
                    updated_at: r.get(7)?,
                })
            })?;

            let mut bookmarks = Vec::new();
            for a in ann_rows.flatten() {
                bookmarks.push(a);
            }

            books.push(PeerBookSync {
                book_uuid,
                title,
                file_hash,
                isbn,
                reading_status,
                progress: Some(prog),
                bookmarks,
            });
        }
    }

    // Reading sessions (last 200 or since)
    let (sess_sql, sess_param) = match since {
        Some(s) if !s.is_empty() => (
            "SELECT s.id, b.uuid, b.title, s.started_at, s.ended_at, s.duration_seconds, s.pages_start, s.pages_end
             FROM reading_sessions s
             JOIN books b ON s.book_id = b.id
             WHERE s.started_at >= ?1
             ORDER BY s.started_at DESC LIMIT 200",
            Some(s.to_string()),
        ),
        _ => (
            "SELECT s.id, b.uuid, b.title, s.started_at, s.ended_at, s.duration_seconds, s.pages_start, s.pages_end
             FROM reading_sessions s
             JOIN books b ON s.book_id = b.id
             ORDER BY s.started_at DESC LIMIT 200",
            None,
        ),
    };

    let mut sess_stmt = conn.prepare(sess_sql)?;
    let session_mapper = |row: &rusqlite::Row| {
        Ok(PeerReadingSession {
            id: row.get(0)?,
            book_uuid: row.get(1)?,
            book_title: row.get(2)?,
            started_at: row.get(3)?,
            ended_at: row.get(4)?,
            duration_seconds: row.get(5)?,
            pages_start: row.get(6)?,
            pages_end: row.get(7)?,
        })
    };

    let sess_rows: Vec<_> = match sess_param {
        Some(ref p) => sess_stmt.query_map(params![p], session_mapper)?.collect(),
        None => sess_stmt.query_map([], session_mapper)?.collect(),
    };

    let mut sessions = Vec::new();
    for s in sess_rows.into_iter().flatten() {
        sessions.push(s);
    }

    Ok(PeerSyncPayload {
        device_name: hostname,
        client_version: env!("CARGO_PKG_VERSION").to_string(),
        since: since.map(|s| s.to_string()),
        books,
        sessions,
    })
}

// --- Axum Handlers ---

fn verify_token(state: &AppState, headers: &HeaderMap) -> Result<bool, (StatusCode, String)> {
    let auth_header = headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "));

    let token = match auth_header {
        Some(t) => t,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                "Missing or invalid Authorization header".to_string(),
            ))
        }
    };

    let conn = state
        .db
        .get_connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let expected_token: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'sync_pairing_token'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    match expected_token {
        Some(expected) if expected == token => Ok(true),
        _ => Err((StatusCode::UNAUTHORIZED, "Invalid pairing token".to_string())),
    }
}

#[derive(Deserialize)]
struct PairRequest {
    token: String,
}

#[derive(Serialize)]
struct PairResponse {
    status: String,
    message: String,
}

async fn handle_pair(
    State(state): State<AppState>,
    Json(payload): Json<PairRequest>,
) -> Result<Json<PairResponse>, (StatusCode, String)> {
    let conn = state
        .db
        .get_connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let expected_token: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'sync_pairing_token'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    match expected_token {
        Some(expected) if expected == payload.token => Ok(Json(PairResponse {
            status: "ok".to_string(),
            message: "Paired successfully".to_string(),
        })),
        _ => Err((StatusCode::UNAUTHORIZED, "Invalid pairing token".to_string())),
    }
}

async fn handle_p2p_sync(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<PeerSyncPayload>,
) -> Result<Json<PeerSyncResponse>, (StatusCode, String)> {
    verify_token(&state, &headers)?;

    let mut conn = state
        .db
        .get_connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // 1. Apply incoming changes
    let (synced_books, synced_sessions) = apply_incoming_sync_data(&mut conn, &payload)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to apply sync data: {}", e)))?;

    // 2. Extract host changes to return for bi-directional continuity
    let host_data = extract_local_sync_data(&conn, payload.since.as_deref())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to extract local sync data: {}", e)))?;

    Ok(Json(PeerSyncResponse {
        success: true,
        message: format!("Applied {} books, {} sessions", synced_books, synced_sessions),
        synced_books,
        synced_sessions,
        host_data,
    }))
}

#[derive(Deserialize)]
struct SyncQuery {
    since: String,
}

async fn handle_get_delta(
    headers: HeaderMap,
    State(state): State<AppState>,
    Query(query): Query<SyncQuery>,
) -> Result<Json<SyncDelta>, (StatusCode, String)> {
    verify_token(&state, &headers)?;

    let books = vec![];
    let mut progress = vec![];
    let mut annotations = vec![];

    let conn = state
        .db
        .get_connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut prog_stmt = conn
        .prepare(
            "SELECT id, book_id, current_location, progress_percent, current_page, total_pages, cfi_location, last_read 
             FROM reading_progress WHERE last_read > ?1",
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let prog_iter = prog_stmt
        .query_map(params![query.since], |row| {
            Ok(ReadingProgress {
                id: row.get(0)?,
                book_id: row.get(1)?,
                current_location: row.get(2)?,
                progress_percent: row.get(3)?,
                current_page: row.get(4)?,
                total_pages: row.get(5)?,
                cfi_location: row.get(6)?,
                last_read: row.get(7)?,
            })
        })
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    for p in prog_iter.flatten() {
        progress.push(p);
    }

    let mut ann_stmt = conn
        .prepare(
            "SELECT id, book_id, type, location, cfi_range, selected_text, note_content, color, created_at, updated_at 
             FROM annotations WHERE updated_at > ?1",
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let ann_iter = ann_stmt
        .query_map(params![query.since], |row| {
            Ok(Annotation {
                id: row.get(0)?,
                book_id: row.get(1)?,
                annotation_type: row.get(2)?,
                location: row.get(3)?,
                cfi_range: row.get(4)?,
                selected_text: row.get(5)?,
                note_content: row.get(6)?,
                color: row.get(7)?,
                category_id: None,
                chapter_title: None,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    for a in ann_iter.flatten() {
        annotations.push(a);
    }

    let delta = SyncDelta {
        books,
        progress,
        annotations,
    };

    Ok(Json(delta))
}

async fn handle_push_delta(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<SyncDelta>,
) -> Result<Json<PairResponse>, (StatusCode, String)> {
    verify_token(&state, &headers)?;

    let mut conn = state
        .db
        .get_connection()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let tx = conn
        .transaction()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    for prog in payload.progress {
        tx.execute(
            "INSERT INTO reading_progress (book_id, current_location, progress_percent, current_page, total_pages, cfi_location, last_read) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(book_id) DO UPDATE SET 
             current_location = CASE WHEN excluded.last_read > reading_progress.last_read THEN excluded.current_location ELSE reading_progress.current_location END,
             progress_percent = CASE WHEN excluded.last_read > reading_progress.last_read THEN excluded.progress_percent ELSE reading_progress.progress_percent END,
             current_page = CASE WHEN excluded.last_read > reading_progress.last_read THEN excluded.current_page ELSE reading_progress.current_page END,
             total_pages = CASE WHEN excluded.last_read > reading_progress.last_read THEN excluded.total_pages ELSE reading_progress.total_pages END,
             cfi_location = CASE WHEN excluded.last_read > reading_progress.last_read THEN excluded.cfi_location ELSE reading_progress.cfi_location END,
             last_read = CASE WHEN excluded.last_read > reading_progress.last_read THEN excluded.last_read ELSE reading_progress.last_read END",
            params![
                prog.book_id,
                prog.current_location,
                prog.progress_percent,
                prog.current_page,
                prog.total_pages,
                prog.cfi_location,
                prog.last_read
            ]
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    tx.commit()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(PairResponse {
        status: "ok".to_string(),
        message: "Pushed successfully".to_string(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                sort_title TEXT,
                isbn TEXT,
                isbn13 TEXT,
                file_hash TEXT,
                reading_status TEXT NOT NULL DEFAULT 'planning',
                last_opened TEXT,
                in_trash INTEGER NOT NULL DEFAULT 0,
                modified_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE reading_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL UNIQUE,
                current_location TEXT NOT NULL,
                progress_percent REAL DEFAULT 0,
                current_page INTEGER,
                total_pages INTEGER,
                cfi_location TEXT,
                last_read TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                location TEXT NOT NULL,
                cfi_range TEXT,
                selected_text TEXT,
                note_content TEXT,
                color TEXT DEFAULT '#FFEB3B',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE reading_sessions (
                id TEXT PRIMARY KEY,
                book_id INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                pages_start INTEGER,
                pages_end INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                type TEXT NOT NULL
            );
            "#,
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_sync_extract_and_apply() {
        let mut host_conn = setup_test_db();
        let mut client_conn = setup_test_db();

        // Host has Book A
        host_conn.execute(
            "INSERT INTO books (id, uuid, title, reading_status) VALUES (1, 'uuid-book-1', 'Steins Gate', 'reading')",
            [],
        ).unwrap();
        host_conn.execute(
            "INSERT INTO reading_progress (book_id, current_location, progress_percent, current_page, total_pages, cfi_location, last_read)
             VALUES (1, 'chap_1', 10.0, 15, 150, 'epubcfi(/6/2)', '2026-11-01T10:00:00Z')",
            [],
        ).unwrap();

        // Client has same Book A with DIFFERENT local id (e.g. 5) but same UUID, and a newer reading progress!
        client_conn.execute(
            "INSERT INTO books (id, uuid, title, reading_status) VALUES (5, 'uuid-book-1', 'Steins Gate', 'reading')",
            [],
        ).unwrap();
        client_conn.execute(
            "INSERT INTO reading_progress (book_id, current_location, progress_percent, current_page, total_pages, cfi_location, last_read)
             VALUES (5, 'chap_3', 35.0, 52, 150, 'epubcfi(/6/6)', '2026-11-02T15:30:00Z')",
            [],
        ).unwrap();
        client_conn.execute(
            "INSERT INTO reading_sessions (id, book_id, started_at, ended_at, duration_seconds)
             VALUES ('sess-uuid-1', 5, '2026-11-02T15:00:00Z', '2026-11-02T15:30:00Z', 1800)",
            [],
        ).unwrap();

        // Extract client delta
        let client_payload = extract_local_sync_data(&client_conn, None).unwrap();
        assert_eq!(client_payload.books.len(), 1);
        assert_eq!(client_payload.sessions.len(), 1);

        // Apply client delta to host
        let (updated_books, updated_sessions) = apply_incoming_sync_data(&mut host_conn, &client_payload).unwrap();
        assert_eq!(updated_books, 1);
        assert_eq!(updated_sessions, 1);

        // Verify host now has client's newer location and progress
        let (loc, pct, last_read): (String, f64, String) = host_conn.query_row(
            "SELECT current_location, progress_percent, last_read FROM reading_progress WHERE book_id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).unwrap();

        assert_eq!(loc, "chap_3");
        assert_eq!(pct, 35.0);
        assert_eq!(last_read, "2026-11-02T15:30:00Z");

        // Verify session was added to host mapped to host's local book_id (1)
        let sess_book_id: i64 = host_conn.query_row(
            "SELECT book_id FROM reading_sessions WHERE id = 'sess-uuid-1'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(sess_book_id, 1);
    }
}
