/// Cloudflare session storage.
///
/// Persists the browser cookies (`cf_clearance`, `__cf_bm`, etc.) and the
/// exact User-Agent string that was used when solving the challenge.  These
/// two values **must** match on every subsequent request — Cloudflare ties
/// the token to the UA fingerprint it was issued for.
///
/// Storage location: `<app_data_dir>/cloudflare_sessions/<host>.json`
///
/// In-memory LRU cache avoids redundant disk reads.
use chrono::{DateTime, Duration, Utc};
use lru::LruCache;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, num::NonZeroUsize, path::PathBuf, sync::Arc};

use crate::error::{Result, ShioriError};

// ─── Data types ──────────────────────────────────────────────────────────────

/// A single cookie as stored/loaded from disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredCookie {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    /// Unix timestamp (seconds).  0 = session cookie (treated as expired after
    /// `SESSION_TTL_SECS`).
    pub expires: i64,
    pub http_only: bool,
    pub secure: bool,
    pub same_site: Option<String>,
}

impl StoredCookie {
    /// Build the `Cookie: name=value` representation.
    pub fn to_header_pair(&self) -> String {
        format!("{}={}", self.name, self.value)
    }

    /// True if the cookie has definitively expired (hard expiry or TTL-based).
    pub fn is_expired(&self) -> bool {
        if self.expires == 0 {
            return false; // Session cookie — let the session TTL handle it.
        }
        let now = Utc::now().timestamp();
        self.expires < now
    }
}

/// One complete Cloudflare session for a single host.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CfSession {
    /// Hostname this session was captured for (e.g. `www.toongod.org`).
    pub host: String,
    /// All cookies captured from the browser after CF was solved.
    pub cookies: Vec<StoredCookie>,
    /// The exact User-Agent used when solving the challenge.  **Must** match
    /// every subsequent request.
    pub user_agent: String,
    /// When this session was captured.
    pub captured_at: DateTime<Utc>,
    /// Shiori-side validity window.  We force a refresh before CF does so
    /// that users never see a block during normal usage.
    ///
    /// Default: 20 hours.  CF typically issues 24-hour clearance tokens.
    pub valid_for_secs: i64,
}

impl CfSession {
    /// Maximum age before we proactively refresh (20 hours).
    const DEFAULT_TTL_SECS: i64 = 20 * 60 * 60;

    #[allow(dead_code)]
    pub fn new(
        host: impl Into<String>,
        cookies: Vec<StoredCookie>,
        user_agent: impl Into<String>,
    ) -> Self {
        Self {
            host: host.into(),
            cookies,
            user_agent: user_agent.into(),
            captured_at: Utc::now(),
            valid_for_secs: Self::DEFAULT_TTL_SECS,
        }
    }

    /// True if the session should be refreshed.
    pub fn is_expired(&self) -> bool {
        let age = Utc::now() - self.captured_at;
        age > Duration::seconds(self.valid_for_secs)
    }

    /// Build the full `Cookie: …` header value for HTTP requests.
    pub fn cookie_header(&self) -> String {
        self.cookies
            .iter()
            .filter(|c| !c.is_expired())
            .map(|c| c.to_header_pair())
            .collect::<Vec<_>>()
            .join("; ")
    }

    /// Extract the `cf_clearance` token if present.
    #[allow(dead_code)]
    pub fn cf_clearance(&self) -> Option<&str> {
        self.cookies
            .iter()
            .find(|c| c.name == "cf_clearance")
            .map(|c| c.value.as_str())
    }

    /// True if the `cf_clearance` cookie is present and not hard-expired.
    pub fn has_valid_clearance(&self) -> bool {
        self.cookies
            .iter()
            .any(|c| c.name == "cf_clearance" && !c.is_expired())
    }

    /// Build a `HashMap` of cookie name → value for easy lookup.
    #[allow(dead_code)]
    pub fn cookie_map(&self) -> HashMap<String, String> {
        self.cookies
            .iter()
            .filter(|c| !c.is_expired())
            .map(|c| (c.name.clone(), c.value.clone()))
            .collect()
    }
}

// ─── Session store ───────────────────────────────────────────────────────────

/// Thread-safe, persisted session store with LRU in-memory cache.
pub struct SessionStore {
    sessions_dir: PathBuf,
    cache: Mutex<LruCache<String, CfSession>>,
}

impl SessionStore {
    /// Create a new store backed by `sessions_dir`.
    /// The directory is created if it does not exist.
    pub fn new(sessions_dir: impl Into<PathBuf>) -> Result<Arc<Self>> {
        let dir = sessions_dir.into();
        std::fs::create_dir_all(&dir)
            .map_err(|e| ShioriError::Other(format!("Failed to create CF sessions dir: {}", e)))?;

        Ok(Arc::new(Self {
            sessions_dir: dir,
            cache: Mutex::new(LruCache::new(NonZeroUsize::new(32).unwrap())),
        }))
    }

    // ── Read ────────────────────────────────────────────────────────────────

    /// Retrieve a session for `host`.  Returns `None` if no session exists or
    /// if the session has expired (callers should re-solve in that case).
    pub fn get(&self, host: &str) -> Option<CfSession> {
        // 1. Try LRU cache.
        {
            let mut cache = self.cache.lock();
            if let Some(sess) = cache.get(host) {
                if !sess.is_expired() {
                    return Some(sess.clone());
                }
                // Expired — remove from cache; fall through to disk.
                cache.pop(host);
            }
        }

        // 2. Try disk.
        let path = self.session_path(host);
        if !path.exists() {
            return None;
        }
        match self.load_from_disk(host) {
            Ok(Some(sess)) if !sess.is_expired() => {
                self.cache.lock().put(host.to_string(), sess.clone());
                Some(sess)
            }
            _ => None,
        }
    }

    /// True if a valid (non-expired) session exists for `host`.
    #[allow(dead_code)]
    pub fn has_valid(&self, host: &str) -> bool {
        self.get(host).is_some()
    }

    // ── Write ───────────────────────────────────────────────────────────────

    /// Persist a newly captured session to disk and update the in-memory cache.
    pub fn save(&self, session: CfSession) -> Result<()> {
        let host = session.host.clone();
        let path = self.session_path(&host);

        let json = serde_json::to_string_pretty(&session)
            .map_err(|e| ShioriError::Other(format!("Failed to serialize CF session: {}", e)))?;
        std::fs::write(&path, json).map_err(|e| {
            ShioriError::Other(format!("Failed to write CF session to {path:?}: {e}"))
        })?;

        self.cache.lock().put(host, session);
        Ok(())
    }

    /// Delete the stored session for `host` (forces re-solve on next request).
    pub fn invalidate(&self, host: &str) {
        self.cache.lock().pop(host);
        let path = self.session_path(host);
        let _ = std::fs::remove_file(path);
    }

    /// Delete all stored sessions.
    pub fn clear_all(&self) -> Result<()> {
        self.cache.lock().clear();
        let entries = std::fs::read_dir(&self.sessions_dir)
            .map_err(|e| ShioriError::Other(format!("Failed to list CF sessions: {}", e)))?;
        for entry in entries.flatten() {
            if entry.path().extension().map_or(false, |e| e == "json") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
        Ok(())
    }

    /// List all persisted hosts.
    pub fn list_hosts(&self) -> Vec<String> {
        let Ok(entries) = std::fs::read_dir(&self.sessions_dir) else {
            return vec![];
        };
        entries
            .flatten()
            .filter_map(|e| {
                let p = e.path();
                if p.extension()? == "json" {
                    p.file_stem()?.to_str().map(|s| s.replace('_', "."))
                } else {
                    None
                }
            })
            .collect()
    }

    // ── Internal ────────────────────────────────────────────────────────────

    fn session_path(&self, host: &str) -> PathBuf {
        // Sanitize the hostname into a valid filename.
        let filename = host.replace('.', "_").replace(':', "_port_");
        self.sessions_dir.join(format!("{}.json", filename))
    }

    /// Returns a clone of the `Arc<Self>` — used by `CfClient::new()` which
    /// needs an `Arc<SessionStore>` to borrow from managed state.
    /// This method exists so `commands.rs` can call `cf_state.store.inner_arc()`
    /// without exposing a raw Arc field.
    pub fn inner_arc(self: &Arc<Self>) -> Arc<Self> {
        Arc::clone(self)
    }

    fn load_from_disk(&self, host: &str) -> Result<Option<CfSession>> {
        let path = self.session_path(host);
        if !path.exists() {
            return Ok(None);
        }
        let data = std::fs::read_to_string(&path)
            .map_err(|e| ShioriError::Other(format!("Failed to read CF session: {}", e)))?;
        let sess: CfSession = serde_json::from_str(&data)
            .map_err(|e| ShioriError::Other(format!("Failed to parse CF session JSON: {}", e)))?;
        Ok(Some(sess))
    }
}
