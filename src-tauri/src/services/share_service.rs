use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use anyhow::{anyhow, Context, Result};
use axum::{
    Router,
    extract::{Path, Query, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use chrono::{DateTime, Utc, Duration};
use qrcode::QrCode;
use qrcode::render::svg;
use rand::Rng;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{SaltString, rand_core::OsRng};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;
use tower_http::services::ServeFile;
use tower_http::trace::TraceLayer;
use log::{info, error, warn};

// Helper functions for DateTime conversion
fn parse_datetime(s: Option<String>) -> Option<DateTime<Utc>> {
    s.and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc)))
}

fn parse_datetime_required(s: String) -> rusqlite::Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(&s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| rusqlite::Error::InvalidQuery)
}

/// Share metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Share {
    pub id: i64,
    pub book_id: i64,
    pub token: String,
    pub format: String,
    pub password_hash: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub max_accesses: Option<i32>,
    pub access_count: i32,
    pub revoked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Share access log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareAccessLog {
    pub id: i64,
    pub share_id: i64,
    pub ip_address: String,
    pub user_agent: Option<String>,
    pub accessed_at: DateTime<Utc>,
}

/// Options for creating a share
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareOptions {
    pub password: Option<String>,
    pub expires_in_hours: Option<i64>,
    pub max_accesses: Option<i32>,
}

impl Default for ShareOptions {
    fn default() -> Self {
        Self {
            password: None,
            expires_in_hours: Some(24), // 24 hours default
            max_accesses: None,
        }
    }
}

/// Book share URL response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareResponse {
    pub token: String,
    pub url: String,
    pub qr_code_svg: String,
    pub expires_at: DateTime<Utc>,
}

/// Application state for Axum
#[derive(Clone)]
struct AppState {
    db_path: PathBuf,
    storage_path: PathBuf,
}

/// Get a database connection
fn get_db_connection(db_path: &PathBuf) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON")?;
    Ok(conn)
}

/// Book sharing service
pub struct ShareService {
    db_path: PathBuf,
    storage_path: PathBuf,
    server_handle: Option<JoinHandle<Result<()>>>,
    port: u16,
}

impl ShareService {
    /// Create a new share service
    pub fn new(db_path: PathBuf, storage_path: PathBuf, port: Option<u16>) -> Self {
        Self {
            db_path,
            storage_path,
            server_handle: None,
            port: port.unwrap_or(8080),
        }
    }

    /// Create a share for a book
    pub fn create_share(&self, book_id: i64, options: ShareOptions) -> Result<Share> {
        // Verify book exists and get format
        let conn = get_db_connection(&self.db_path)?;
        let format: String = conn.query_row(
            "SELECT file_format FROM books WHERE id = ?1",
            params![book_id],
            |row| row.get(0)
        ).map_err(|_| anyhow::anyhow!("Book not found"))?;

        // Generate random token (8 characters, URL-safe)
        let token: String = rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
            .take(8)
            .map(char::from)
            .collect();

        // Hash password if provided
        let password_hash = if let Some(password) = options.password {
            let salt = SaltString::generate(&mut OsRng);
            let argon2 = Argon2::default();
            let hash = argon2.hash_password(password.as_bytes(), &salt)
                .map_err(|e| anyhow!("Failed to hash password: {}", e))?
                .to_string();
            Some(hash)
        } else {
            None
        };

        // Calculate expiration
        let expires_at = Utc::now() + Duration::hours(options.expires_in_hours.unwrap_or(24));

        // Insert into database
        conn.execute(
            "INSERT INTO shares (book_id, token, format, password_hash, expires_at, max_accesses, revoked_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
            params![
                book_id, 
                token, 
                format,
                password_hash, 
                expires_at.to_rfc3339(), 
                options.max_accesses
            ]
        )?;

        let share_id = conn.last_insert_rowid();

        Ok(Share {
            id: share_id,
            book_id,
            token: token.clone(),
            format,
            password_hash,
            expires_at,
            max_accesses: options.max_accesses,
            access_count: 0,
            revoked_at: None,
            created_at: Utc::now(),
        })
    }

    /// Get share by token
    pub fn get_share(&self, token: &str) -> Result<Option<Share>> {
        let conn = get_db_connection(&self.db_path)?;
        let mut stmt = conn.prepare(
            "SELECT id, book_id, token, format, password_hash, expires_at, max_accesses, access_count, revoked_at, created_at
             FROM shares WHERE token = ?1"
        )?;

        let share = stmt.query_row(params![token], |row| {
            Ok(Share {
                id: row.get(0)?,
                book_id: row.get(1)?,
                token: row.get(2)?,
                format: row.get(3)?,
                password_hash: row.get(4)?,
                expires_at: parse_datetime(row.get(5)?).ok_or_else(|| rusqlite::Error::InvalidQuery)?,
                max_accesses: row.get(6)?,
                access_count: row.get(7)?,
                revoked_at: parse_datetime(row.get(8)?),
                created_at: parse_datetime_required(row.get(9)?)?,
            })
        }).optional()?;

        Ok(share)
    }

    /// Verify share password
    pub fn verify_password(&self, token: &str, password: &str) -> Result<bool> {
        let share = self.get_share(token)?
            .ok_or_else(|| anyhow::anyhow!("Share not found"))?;

        if let Some(hash) = share.password_hash {
            let parsed_hash = PasswordHash::new(&hash)
                .map_err(|e| anyhow!("Invalid password hash: {}", e))?;
            let argon2 = Argon2::default();
            Ok(argon2.verify_password(password.as_bytes(), &parsed_hash).is_ok())
        } else {
            Ok(true) // No password required
        }
    }

    /// Check if share is valid (not expired, not over download limit, active)
    pub fn is_share_valid(&self, token: &str) -> Result<bool> {
        let share = match self.get_share(token)? {
            Some(s) => s,
            None => return Ok(false),
        };

        // Check revoked
        if share.revoked_at.is_some() {
            return Ok(false);
        }

        // Check expiration
        if share.expires_at < Utc::now() {
            return Ok(false);
        }

        // Check access limit
        if let Some(max) = share.max_accesses {
            if share.access_count >= max {
                return Ok(false);
            }
        }

        Ok(true)
    }

    /// Increment download count
    pub fn increment_download_count(&self, token: &str) -> Result<()> {
        let conn = get_db_connection(&self.db_path)?;
        conn.execute(
            "UPDATE shares SET access_count = access_count + 1 WHERE token = ?1",
            params![token]
        )?;
        Ok(())
    }

    /// Log share access
    pub fn log_access(&self, share_id: i64, ip_address: &str, user_agent: Option<&str>) -> Result<()> {
        let conn = get_db_connection(&self.db_path)?;
        conn.execute(
            "INSERT INTO share_access_log (share_token, ip_address, user_agent) 
             VALUES ((SELECT token FROM shares WHERE id = ?1), ?2, ?3)",
            params![share_id, ip_address, user_agent]
        )?;
        Ok(())
    }

    /// Revoke a share
    pub fn revoke_share(&self, token: &str) -> Result<()> {
        let conn = get_db_connection(&self.db_path)?;
        let now = Utc::now();
        conn.execute(
            "UPDATE shares SET revoked_at = ?1 WHERE token = ?2",
            params![now.to_rfc3339(), token]
        )?;
        Ok(())
    }

    /// List all shares for a book
    pub fn list_shares(&self, book_id: Option<i64>) -> Result<Vec<Share>> {
        let conn = get_db_connection(&self.db_path)?;
        
        let (query, params_vec): (String, Vec<Box<dyn rusqlite::ToSql>>) = if let Some(bid) = book_id {
            (
                "SELECT id, book_id, token, format, password_hash, expires_at, max_accesses, access_count, revoked_at, created_at
                 FROM shares WHERE book_id = ?1 ORDER BY created_at DESC".to_string(),
                vec![Box::new(bid)]
            )
        } else {
            (
                "SELECT id, book_id, token, format, password_hash, expires_at, max_accesses, access_count, revoked_at, created_at
                 FROM shares ORDER BY created_at DESC".to_string(),
                vec![]
            )
        };

        let mut stmt = conn.prepare(&query)?;
        let shares = stmt.query_map(
            params_vec.iter().map(|p| p.as_ref()).collect::<Vec<_>>().as_slice(),
            |row| {
                Ok(Share {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    token: row.get(2)?,
                    format: row.get(3)?,
                    password_hash: row.get(4)?,
                    expires_at: parse_datetime(row.get(5)?).ok_or_else(|| rusqlite::Error::InvalidQuery)?,
                    max_accesses: row.get(6)?,
                    access_count: row.get(7)?,
                    revoked_at: parse_datetime(row.get(8)?),
                    created_at: parse_datetime_required(row.get(9)?)?,
                })
            }
        )?.collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(shares)
    }

    /// Clean up expired shares
    pub fn cleanup_expired_shares(&self) -> Result<usize> {
        let conn = get_db_connection(&self.db_path)?;
        let now = Utc::now();
        
        let count = conn.execute(
            "UPDATE shares SET revoked_at = ?1 WHERE expires_at < ?1 AND revoked_at IS NULL",
            params![now.to_rfc3339()]
        )?;

        Ok(count)
    }

    /// Generate share URL and QR code
    pub fn generate_share_url(&self, token: &str) -> Result<ShareResponse> {
        let share = self.get_share(token)?
            .ok_or_else(|| anyhow::anyhow!("Share not found"))?;

        // Get local IP (simplified - just use localhost for now)
        let url = format!("http://localhost:{}/share/{}", self.port, token);

        // Generate QR code
        let qr = QrCode::new(&url)?;
        let qr_svg = qr.render::<svg::Color>()
            .min_dimensions(200, 200)
            .build();

        Ok(ShareResponse {
            token: token.to_string(),
            url,
            qr_code_svg: qr_svg,
            expires_at: share.expires_at,
        })
    }

    /// Start the HTTP server
    pub async fn start_server(&mut self) -> Result<()> {
        if self.server_handle.is_some() {
            log::warn!("Share server already running");
            return Ok(());
        }

        let state = AppState {
            db_path: self.db_path.clone(),
            storage_path: self.storage_path.clone(),
        };

        let app = Router::new()
            .route("/share/:token", get(handle_share_download))
            .route("/health", get(|| async { "OK" }))
            .layer(TraceLayer::new_for_http())
            .with_state(state);

        let addr = SocketAddr::from(([0, 0, 0, 0], self.port));
        info!("Share server starting on {}", addr);

        let handle = tokio::spawn(async move {
            let listener = tokio::net::TcpListener::bind(addr).await?;
            axum::serve(listener, app).await?;
            Ok::<(), anyhow::Error>(())
        });

        self.server_handle = Some(handle);
        info!("Share server started successfully on port {}", self.port);

        Ok(())
    }

    /// Stop the HTTP server
    pub async fn stop_server(&mut self) -> Result<()> {
        if let Some(handle) = self.server_handle.take() {
            handle.abort();
            info!("Share server stopped");
        }
        Ok(())
    }

    /// Check if server is running
    pub fn is_running(&self) -> bool {
        self.server_handle.is_some()
    }
}

/// Query parameters for share download
#[derive(Deserialize)]
struct ShareQuery {
    password: Option<String>,
}

/// Handle share download request
async fn handle_share_download(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Query(query): Query<ShareQuery>,
) -> Result<Response, (StatusCode, String)> {
    // Get share
    let conn = get_db_connection(&state.db_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    let share = conn.query_row(
            "SELECT id, book_id, token, format, password_hash, expires_at, max_accesses, access_count, revoked_at, created_at
             FROM shares WHERE token = ?1",
            params![token],
            |row| {
                Ok(Share {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    token: row.get(2)?,
                    format: row.get(3)?,
                    password_hash: row.get(4)?,
                    expires_at: parse_datetime(row.get(5)?).ok_or_else(|| rusqlite::Error::InvalidQuery)?,
                    max_accesses: row.get(6)?,
                    access_count: row.get(7)?,
                    revoked_at: parse_datetime(row.get(8)?),
                    created_at: parse_datetime_required(row.get(9)?)?,
                })
            }
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Share not found".to_string()))?;

    // Check revoked
    if share.revoked_at.is_some() {
         return Err((StatusCode::GONE, "Share has been revoked".to_string()));
    }

    // Check expiration
    if share.expires_at < Utc::now() {
        return Err((StatusCode::GONE, "Share has expired".to_string()));
    }

    // Check download limit
    if let Some(max) = share.max_accesses {
        if share.access_count >= max {
            return Err((StatusCode::GONE, "Download limit reached".to_string()));
        }
    }

    // Verify password if required
    if let Some(hash) = &share.password_hash {
        let password = query.password
            .ok_or((StatusCode::UNAUTHORIZED, "Password required".to_string()))?;
        
        let parsed_hash = PasswordHash::new(hash)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        let argon2 = Argon2::default();
        
        if argon2.verify_password(password.as_bytes(), &parsed_hash).is_err() {
            return Err((StatusCode::UNAUTHORIZED, "Invalid password".to_string()));
        }
    }

    // Get book file path
    let conn2 = get_db_connection(&state.db_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    let book_path: String = conn2.query_row(
            "SELECT file_path FROM books WHERE id = ?1",
            params![share.book_id],
            |row| row.get(0)
        )
        .map_err(|_| (StatusCode::NOT_FOUND, "Book file not found".to_string()))?;

    let full_path = state.storage_path.join(&book_path);
    
    if !full_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Book file not found on disk".to_string()));
    }

    // Increment download count
    let conn3 = get_db_connection(&state.db_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    conn3.execute(
            "UPDATE shares SET access_count = access_count + 1 WHERE id = ?1",
            params![share.id]
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Log access
    let _ = get_db_connection(&state.db_path)
        .and_then(|conn| {
            conn.execute(
                "INSERT INTO share_access_log (share_token, ip_address) VALUES (?1, ?2)",
                params![share.token, "unknown"]
            )
            .map_err(|e| anyhow::anyhow!("Failed to log access: {}", e))
        });

    // Serve file
    Ok(ServeFile::new(full_path).try_call(axum::http::Request::new(axum::body::Body::empty()))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_share_service_creation() {
        let temp_dir = std::env::temp_dir().join("shiori-test-share");
        std::fs::create_dir_all(&temp_dir).unwrap();
        
        let db_path = temp_dir.join("test.db");
        let service = ShareService::new(db_path, temp_dir, Some(8888));
        
        assert_eq!(service.port, 8888);
        assert!(!service.is_running());
    }

    #[test]
    fn test_share_options_default() {
        let options = ShareOptions::default();
        assert_eq!(options.expires_in_hours, Some(24));
        assert!(options.password.is_none());
        assert!(options.max_accesses.is_none());
    }
}
