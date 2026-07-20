use anyhow::{anyhow, Result};
use axum::{
    extract::{Query, State, Json},
    http::{StatusCode, HeaderMap},
    routing::{get, post},
    Router,
};
use log::{info, warn};
use rand::{distributions::Alphanumeric, Rng};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tokio::task::JoinHandle;
use tower_http::trace::TraceLayer;

use crate::db::Database;
use crate::models::{Book, ReadingProgress, Annotation};

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
            // Generate a new token
            let new_token: String = rand::thread_rng()
                .sample_iter(&Alphanumeric)
                .take(32)
                .map(char::from)
                .collect();
                
            conn.execute(
                "INSERT INTO settings (key, value, type) VALUES ('sync_pairing_token', ?1, 'string')",
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

    pub async fn start_server(&mut self) -> Result<()> {
        if self.server_handle.is_some() {
            warn!("Sync server already running");
            return Ok(());
        }

        let state = AppState {
            db: self.db.clone(),
        };

        let app = Router::new()
            .route("/sync/pair", post(handle_pair))
            .route("/sync/delta", get(handle_get_delta))
            .route("/sync/push", post(handle_push_delta))
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

// --- Axum Handlers ---

/// Helper to verify token from headers
fn verify_token(state: &AppState, headers: &HeaderMap) -> Result<bool, (StatusCode, String)> {
    let auth_header = headers.get("Authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "));

    let token = match auth_header {
        Some(t) => t,
        None => return Err((StatusCode::UNAUTHORIZED, "Missing or invalid Authorization header".to_string())),
    };

    let conn = state.db.get_connection()
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
    let conn = state.db.get_connection()
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
        Some(expected) if expected == payload.token => {
            Ok(Json(PairResponse {
                status: "ok".to_string(),
                message: "Paired successfully".to_string(),
            }))
        },
        _ => Err((StatusCode::UNAUTHORIZED, "Invalid pairing token".to_string())),
    }
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
    
    // Extract items updated since `since`
    let books = vec![];
    let mut progress = vec![];
    let mut annotations = vec![];
    
    // Wait, getting delta needs some DB logic which we will implement next.
    let conn = state.db.get_connection().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    // Get modified progress
    let mut prog_stmt = conn.prepare("SELECT id, book_id, current_location, progress_percent, current_page, total_pages, last_read FROM reading_progress WHERE last_read > ?1").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    let prog_iter = prog_stmt.query_map(params![query.since], |row| {
        Ok(ReadingProgress {
            id: row.get(0)?,
            book_id: row.get(1)?,
            current_location: row.get(2)?,
            progress_percent: row.get(3)?,
            current_page: row.get(4)?,
            total_pages: row.get(5)?,
            cfi_location: None, // Legacy, unused often but in struct
            last_read: row.get(6)?,
        })
    }).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    for p in prog_iter {
        if let Ok(p) = p {
            progress.push(p);
        }
    }
    
    // Get modified annotations
    let mut ann_stmt = conn.prepare("SELECT id, book_id, type, location, cfi_range, selected_text, note_content, color, created_at, updated_at FROM annotations WHERE updated_at > ?1").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    let ann_iter = ann_stmt.query_map(params![query.since], |row| {
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
    }).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    for a in ann_iter {
        if let Ok(a) = a {
            annotations.push(a);
        }
    }
    
    // Getting books requires a massive query so for MVP we can skip pushing full metadata unless needed
    // But we should sync `reading_status`, `notes`, etc. To keep simple we'll sync the essential fields for now.
    
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
    
    let mut conn = state.db.get_connection().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    let tx = conn.transaction().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    // Process progress upserts
    for prog in payload.progress {
        // Last write wins based on last_read
        tx.execute(
            "INSERT INTO reading_progress (book_id, current_location, progress_percent, current_page, total_pages, last_read) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(book_id) DO UPDATE SET 
             current_location = CASE WHEN excluded.last_read > reading_progress.last_read THEN excluded.current_location ELSE reading_progress.current_location END,
             progress_percent = CASE WHEN excluded.last_read > reading_progress.last_read THEN excluded.progress_percent ELSE reading_progress.progress_percent END,
             current_page = CASE WHEN excluded.last_read > reading_progress.last_read THEN excluded.current_page ELSE reading_progress.current_page END,
             total_pages = CASE WHEN excluded.last_read > reading_progress.last_read THEN excluded.total_pages ELSE reading_progress.total_pages END,
             last_read = CASE WHEN excluded.last_read > reading_progress.last_read THEN excluded.last_read ELSE reading_progress.last_read END",
            params![
                prog.book_id,
                prog.current_location,
                prog.progress_percent,
                prog.current_page,
                prog.total_pages,
                prog.last_read
            ]
        ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }
    
    // For annotations, we can try to match by some identifier, but `id` is local to the device!
    // A reliable way is to insert if (book_id, type, location) doesn't exist, but we don't have a unique constraint on it!
    // Let's rely on checking if it exists manually or we just assume they append. 
    // Ideally, annotations need a UUID for robust sync. Since we don't have it, let's skip sync of annotations for the first MVP to avoid dupes, or we just sync progress first as requested, and handle annotations carefully.
    
    tx.commit().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    Ok(Json(PairResponse {
        status: "ok".to_string(),
        message: "Pushed successfully".to_string(),
    }))
}
