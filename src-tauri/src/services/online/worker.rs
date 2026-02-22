use crate::db::Database;
use crate::error::Result as AppResult;
use crate::services::online::provider::{ItemType, MetadataProvider, MetadataQuery, FetchedMetadata};
use reqwest::Client;
use sha2::{Sha256, Digest};
use std::sync::Arc;
use tokio::sync::{mpsc, Semaphore};

#[derive(Debug, Clone)]
pub struct MetadataJob {
    pub item_id: i64,
    pub item_type: ItemType,
    pub query: MetadataQuery,
    pub force_refresh: bool,
}

pub struct MetadataWorker {
    pub db: Database,
    pub providers: Vec<Arc<dyn MetadataProvider>>,
    pub sender: mpsc::Sender<MetadataJob>,
    pub app_handle: Option<tauri::AppHandle>,
}

impl MetadataWorker {
    pub fn new(db: Database) -> (Self, mpsc::Receiver<MetadataJob>) {
        let (tx, rx) = mpsc::channel(100);

        let worker = Self {
            db: db.clone(),
            providers: Vec::new(),
            sender: tx,
            app_handle: None,
        };
        
        (worker, rx)
    }

    pub fn set_app_handle(&mut self, handle: tauri::AppHandle) {
        self.app_handle = Some(handle);
    }
    
    pub fn add_provider(&mut self, provider: Arc<dyn MetadataProvider>) {
        self.providers.push(provider);
    }

    pub fn start(&self, mut rx: mpsc::Receiver<MetadataJob>) {
        let db = self.db.clone();
        let providers = self.providers.clone();
        let handle_opt = self.app_handle.clone();
        
        tauri::async_runtime::spawn(async move {
            let semaphore = Arc::new(Semaphore::new(2)); // Max 2 concurrent HTTP requests

            while let Some(job) = rx.recv().await {
                log::info!("[MetadataWorker] Processing job for item_id: {}", job.item_id);
                // 1. Determine if manga or book
                let is_manga = matches!(job.item_type, ItemType::Manga);
                
                // 2. Select appropriate provider
                let provider = providers.iter().find(|p| p.supports_media(is_manga));
                
                let provider_name = provider.map(|p| p.name()).unwrap_or("unknown");

                // Emit loading state
                if let Some(handle) = &handle_opt {
                    use tauri::Emitter;
                    let _ = handle.emit("metadata-update", serde_json::json!({
                        "bookId": job.item_id,
                        "status": "loading",
                        "provider": provider_name
                    }));
                }

                if let Some(p) = provider {
                    let query_hash = Self::compute_query_hash(&job.query);

                    let mut cached_metadata = None;
                    
                    // Check local cache first (unless forced)
                    if !job.force_refresh {
                        if let Ok(conn) = db.get_connection() {
                            let mut stmt = conn.prepare(
                                "SELECT response_json FROM metadata_cache 
                                 WHERE provider = ?1 AND query_hash = ?2 AND expires_at > CURRENT_TIMESTAMP"
                            );
                            if let Ok(mut stmt) = stmt {
                                if let Ok(json_str) = stmt.query_row(rusqlite::params![p.name(), query_hash], |row| row.get::<_, String>(0)) {
                                    if let Ok(metadata) = serde_json::from_str::<FetchedMetadata>(&json_str) {
                                        cached_metadata = Some(metadata);
                                    }
                                }
                            }
                        }
                    }

                    if let Some(metadata) = cached_metadata {
                        log::info!("[MetadataWorker] Cache HIT for query {} via {}", query_hash, p.name());
                        Self::apply_metadata(&db, job.item_id, metadata, is_manga).await;
                        
                        if let Some(handle) = &handle_opt {
                            use tauri::Emitter;
                            let _ = handle.emit("metadata-update", serde_json::json!({
                                "bookId": job.item_id,
                                "status": "success",
                                "provider": p.name()
                            }));
                        }
                        continue;
                    }

                    let sem_clone = semaphore.clone();
                    let permit = sem_clone.acquire().await;
                    
                    if let Ok(_permit) = permit {
                        let mut attempts = 0;
                        while attempts < 3 {
                            match p.fetch_metadata(&job.query).await {
                                Ok(Some(metadata)) => {
                                    log::info!("[MetadataWorker] Successfully fetched metadata via {}", p.name());
                                    
                                    // Cache the result
                                    if let Ok(conn) = db.get_connection() {
                                        if let Ok(json_str) = serde_json::to_string(&metadata) {
                                            let _ = conn.execute(
                                                "INSERT OR REPLACE INTO metadata_cache (provider, query_hash, response_json, expires_at)
                                                 VALUES (?1, ?2, ?3, datetime('now', '+7 days'))",
                                                rusqlite::params![p.name(), query_hash, json_str]
                                            );
                                        }
                                    }

                                    // 5. Update DB (resolve conflicts with offline-first hierarchy)
                                    Self::apply_metadata(&db, job.item_id, metadata, is_manga).await;
                                    
                                    // 6. Emit Tauri event
                                    if let Some(handle) = &handle_opt {
                                        use tauri::Emitter;
                                        let _ = handle.emit("metadata-update", serde_json::json!({
                                            "bookId": job.item_id,
                                            "status": "success",
                                            "provider": p.name()
                                        }));
                                    }
                                    
                                    break;
                                }
                                Ok(None) => {
                                    log::info!("[MetadataWorker] No metadata found via {}", p.name());
                                    if let Some(handle) = &handle_opt {
                                        use tauri::Emitter;
                                        let _ = handle.emit("metadata-update", serde_json::json!({
                                            "bookId": job.item_id,
                                            "status": "not_found",
                                            "provider": p.name()
                                        }));
                                    }
                                    break;
                                }
                                Err(crate::services::online::provider::MetadataError::RateLimited { retry_after }) => {
                                    log::warn!("[MetadataWorker] Rate limited, waiting {}s", retry_after);
                                    tokio::time::sleep(std::time::Duration::from_secs(retry_after)).await;
                                    attempts += 1;
                                }
                                Err(e) => {
                                    log::error!("[MetadataWorker] Error fetching metadata: {:?}", e);
                                    if let Some(handle) = &handle_opt {
                                        use tauri::Emitter;
                                        let _ = handle.emit("metadata-update", serde_json::json!({
                                            "bookId": job.item_id,
                                            "status": "error",
                                            "error": e.to_string(),
                                            "provider": p.name()
                                        }));
                                    }
                                    break;
                                }
                            }
                        }
                    }
                } else {
                    log::warn!("[MetadataWorker] No provider supports item type {:?}", job.item_type);
                }
            }
        });
    }

    async fn apply_metadata(db: &Database, item_id: i64, meta: FetchedMetadata, _is_manga: bool) {
        let conn_res = db.get_connection();
        if let Ok(conn) = conn_res {
            // Retrieve current book state
            let current_book = match crate::services::library_service::get_book_by_id(db, item_id) {
                Ok(b) => b,
                Err(e) => {
                    log::error!("[MetadataWorker] Failed to get book {}: {}", item_id, e);
                    return;
                }
            };

            // Resolution Rule: Only overwrite description if it doesn't exist,
            // or if it exists but we consider the online one superior AND the user hasn't explicitly edited it.
            // For now, simpler rule: override if current is empty or if online is much longer.
            let new_notes = if let Some(meta_desc) = &meta.description {
                if let Some(existing) = &current_book.notes {
                    if meta_desc.len() > existing.len() {
                        Some(meta_desc.clone()) // Online is better
                    } else {
                        Some(existing.clone()) // Keep local
                    }
                } else {
                    Some(meta_desc.clone()) // Nothing local, use online
                }
            } else {
                current_book.notes.clone()
            };

            let _result = conn.execute(
                "UPDATE books
                 SET online_metadata_fetched = 1,
                     metadata_source = ?1,
                     metadata_last_sync = CURRENT_TIMESTAMP,
                     notes = ?2
                 WHERE id = ?3",
                rusqlite::params![
                    meta.provider_id.unwrap_or_else(|| "unknown".to_string()), 
                    new_notes,
                    item_id
                ]
            );

            // Update authors
            if !meta.authors.is_empty() {
                if current_book.authors.is_empty() {
                    for author_name in meta.authors {
                        if let Ok(author_id) = Self::get_or_create_author(&conn, &author_name) {
                            let _ = conn.execute(
                                "INSERT INTO books_authors (book_id, author_id) VALUES (?1, ?2)",
                                rusqlite::params![item_id, author_id],
                            );
                        }
                    }
                }
            }

            // Update tags/genres
            if !meta.genres.is_empty() {
                if current_book.tags.is_empty() {
                    for genre in meta.genres {
                        if let Ok(tag_id) = Self::get_or_create_tag(&conn, &genre) {
                            let _ = conn.execute(
                                "INSERT INTO books_tags (book_id, tag_id) VALUES (?1, ?2)",
                                rusqlite::params![item_id, tag_id],
                            );
                        }
                    }
                }
            }

            log::info!("[MetadataWorker] Updated book {} with enriched metadata", item_id);
        }
    }

    fn get_or_create_author(conn: &rusqlite::Connection, name: &str) -> crate::error::Result<i64> {
        match conn.query_row(
            "SELECT id FROM authors WHERE name = ?1",
            rusqlite::params![name],
            |row| row.get::<_, i64>(0),
        ) {
            Ok(id) => Ok(id),
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                conn.execute("INSERT INTO authors (name) VALUES (?1)", rusqlite::params![name])?;
                Ok(conn.last_insert_rowid())
            }
            Err(e) => Err(e.into()),
        }
    }

    fn get_or_create_tag(conn: &rusqlite::Connection, name: &str) -> crate::error::Result<i64> {
        match conn.query_row(
            "SELECT id FROM tags WHERE name = ?1",
            rusqlite::params![name],
            |row| row.get::<_, i64>(0),
        ) {
            Ok(id) => Ok(id),
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                conn.execute("INSERT INTO tags (name) VALUES (?1)", rusqlite::params![name])?;
                Ok(conn.last_insert_rowid())
            }
            Err(e) => Err(e.into()),
        }
    }

    fn compute_query_hash(query: &MetadataQuery) -> String {
        let mut hasher = Sha256::new();
        let q_str = match query {
            MetadataQuery::Isbn(isbn) => format!("isbn:{}", isbn),
            MetadataQuery::Title(title) => format!("title:{}", title),
            MetadataQuery::TitleAuthor { title, author } => format!("title:{},author:{:?}", title, author),
        };
        hasher.update(q_str.as_bytes());
        hex::encode(hasher.finalize())
    }
}
