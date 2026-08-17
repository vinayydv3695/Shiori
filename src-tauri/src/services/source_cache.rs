//! Disk-backed caches for the online section (performance plan Slices 3 & 4).
//!
//! Two bounded caches, both living under `<app_data>/online_cache/`:
//! - [`SourceDiskCache`]: serde-JSON payloads for search/browse/chapters/pages
//!   (per-key TTL, 256 MB cap) — repeat lookups survive app restarts.
//! - [`ImageDiskCache`]: raw image bytes for the proxy (7-day TTL, 512 MB
//!   cap) — covers/pages are not re-downloaded on every visit.
//!
//! Memory guardrails (laptop-safe):
//! - No value is ever held in RAM beyond its own lifetime; the in-memory
//!   index is one small `HashMap<hash, (size, mtime)>` rebuilt at startup.
//! - Both caches are swept at startup: expired entries first, then LRU
//!   (oldest mtime) until under the byte cap.
//! - Writes are atomic (temp file + rename): a crash never leaves a torn
//!   entry. Errors are never cached.
//! - `clear()` wipes everything; stats are exposed for the settings UI.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::{Result, ShioriError};

/// Source-data cache cap (JSON payloads).
pub const SOURCE_CACHE_MAX_BYTES: u64 = 256 * 1024 * 1024;
/// Image cache cap (raw bytes).
pub const IMAGE_CACHE_MAX_BYTES: u64 = 512 * 1024 * 1024;
/// Longest anything is kept before the startup sweep drops it (images).
pub const IMAGE_CACHE_TTL: Duration = Duration::from_secs(7 * 24 * 60 * 60);
/// Longest a source-data entry may live (safety ceiling; per-key TTLs are
/// shorter).
pub const SOURCE_CACHE_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);
/// Cap on index entries (prevents a million tiny files from bloating RAM).
const MAX_INDEX_ENTRIES: usize = 20_000;

#[derive(Debug, Clone, Copy)]
struct Meta {
    size: u64,
    mtime_unix: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CacheStats {
    pub entries: usize,
    pub size_bytes: u64,
    pub max_bytes: u64,
}

fn mtime_unix(m: &std::fs::Metadata) -> u64 {
    m.modified()
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs()
}

fn sha256_hex(input: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(input.as_bytes());
    format!("{:x}", h.finalize())
}

/// Shared disk-cache core: index + atomic IO + sweep.
struct DiskCacheCore {
    dir: PathBuf,
    max_bytes: u64,
    index: Mutex<HashMap<String, Meta>>,
}

impl DiskCacheCore {
    fn new(dir: PathBuf, max_bytes: u64) -> Result<Self> {
        std::fs::create_dir_all(&dir).map_err(|e| {
            ShioriError::Other(format!("Failed to create cache dir {}: {}", dir.display(), e))
        })?;
        Ok(Self {
            dir,
            max_bytes,
            index: Mutex::new(HashMap::new()),
        })
    }

    fn file_path(&self, key: &str) -> PathBuf {
        self.dir.join(format!("{}.dat", sha256_hex(key)))
    }

    fn tmp_path(&self, key: &str) -> PathBuf {
        self.dir.join(format!("{}.tmp", sha256_hex(key)))
    }

    /// Rebuild the in-memory index from disk (startup sweep).
    fn rebuild_index(&self) {
        let mut index = self.index.lock().unwrap_or_else(|p| p.into_inner());
        index.clear();
        let Ok(rd) = std::fs::read_dir(&self.dir) else {
            return;
        };
        let mut entries: Vec<(String, Meta)> = Vec::new();
        for entry in rd.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !name.ends_with(".dat") {
                continue;
            }
            let Ok(meta) = path.metadata() else {
                continue;
            };
            entries.push((
                name.trim_end_matches(".dat").to_string(),
                Meta {
                    size: meta.len(),
                    mtime_unix: mtime_unix(&meta),
                },
            ));
        }
        entries.sort_by_key(|(_, m)| m.mtime_unix); // oldest first
        // Drop oldest until under cap and under MAX_INDEX_ENTRIES.
        let mut total: u64 = entries.iter().map(|(_, m)| m.size).sum();
        let mut keep: Vec<(String, Meta)> = Vec::with_capacity(entries.len());
        for (k, m) in entries {
            if keep.len() >= MAX_INDEX_ENTRIES || total > self.max_bytes {
                let _ = std::fs::remove_file(self.dir.join(format!("{}.dat", k)));
                total = total.saturating_sub(m.size);
                continue;
            }
            total = total.saturating_sub(m.size); // keep size accounting simple
            keep.push((k, m));
        }
        // Re-add kept entries with sizes (the loop above subtracted them).
        for (k, m) in keep {
            total += m.size;
            index.insert(k, m);
        }
        log::info!(
            "[disk-cache:{}] startup sweep: {} entries, {:.1} MB",
            self.dir.display(),
            index.len(),
            total as f64 / (1024.0 * 1024.0)
        );
    }

    /// Drop entries older than `max_age`, then oldest-first until under cap.
    fn sweep(&self, max_age: Duration) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::ZERO)
            .as_secs();
        let mut index = self.index.lock().unwrap_or_else(|p| p.into_inner());
        let mut total: u64 = index.values().map(|m| m.size).sum();
        let mut expired: Vec<String> = Vec::new();
        for (k, m) in index.iter() {
            if now.saturating_sub(m.mtime_unix) > max_age.as_secs() {
                expired.push(k.clone());
            }
        }
        for k in &expired {
            if let Some(m) = index.remove(k) {
                total = total.saturating_sub(m.size);
                let _ = std::fs::remove_file(self.dir.join(format!("{}.dat", k)));
            }
        }
        if total > self.max_bytes {
            let mut by_age: Vec<(String, u64)> = index
                .iter()
                .map(|(k, m)| (k.clone(), m.mtime_unix))
                .collect();
            by_age.sort_by_key(|(_, t)| *t); // oldest first
            for (k, _) in by_age {
                if total <= self.max_bytes {
                    break;
                }
                if let Some(m) = index.remove(&k) {
                    total = total.saturating_sub(m.size);
                    let _ = std::fs::remove_file(self.dir.join(format!("{}.dat", k)));
                }
            }
        }
        log::info!(
            "[disk-cache:{}] sweep done: {} entries, {:.1} MB (expired {})",
            self.dir.display(),
            index.len(),
            total as f64 / (1024.0 * 1024.0),
            expired.len()
        );
    }

    fn read(&self, key: &str) -> Option<Vec<u8>> {
        let path = self.file_path(key);
        let bytes = std::fs::read(&path).ok()?;
        // Touch mtime? No — TTL is from original write time; fine.
        Some(bytes)
    }

    fn write(&self, key: &str, bytes: &[u8]) {
        let tmp = self.tmp_path(key);
        let final_path = self.file_path(key);
        if let Err(e) = std::fs::write(&tmp, bytes) {
            log::warn!("[disk-cache] write tmp failed: {}", e);
            return;
        }
        if let Err(e) = std::fs::rename(&tmp, &final_path) {
            let _ = std::fs::remove_file(&tmp);
            log::warn!("[disk-cache] rename failed: {}", e);
            return;
        }
        let mut index = self.index.lock().unwrap_or_else(|p| p.into_inner());
        let Ok(meta) = final_path.metadata() else {
            return;
        };
        index.insert(
            key.to_string(),
            Meta {
                size: meta.len(),
                mtime_unix: mtime_unix(&meta),
            },
        );
        // Bounded index: drop oldest entries if the file count explodes.
        if index.len() > MAX_INDEX_ENTRIES {
            let mut by_age: Vec<(String, u64)> =
                index.iter().map(|(k, m)| (k.clone(), m.mtime_unix)).collect();
            by_age.sort_by_key(|(_, t)| *t);
            for (k, _) in by_age.iter().take(index.len() - MAX_INDEX_ENTRIES) {
                if index.remove(k).is_some() {
                    let _ = std::fs::remove_file(self.dir.join(format!("{}.dat", k)));
                }
            }
        }
    }

    fn stats(&self) -> CacheStats {
        let index = self.index.lock().unwrap_or_else(|p| p.into_inner());
        CacheStats {
            entries: index.len(),
            size_bytes: index.values().map(|m| m.size).sum(),
            max_bytes: self.max_bytes,
        }
    }

    fn clear(&self) {
        let mut index = self.index.lock().unwrap_or_else(|p| p.into_inner());
        for k in index.keys() {
            let _ = std::fs::remove_file(self.dir.join(format!("{}.dat", k)));
        }
        index.clear();
    }
}

/// Serde-JSON disk cache for source responses (search/browse/chapters/pages).
pub struct SourceDiskCache {
    core: DiskCacheCore,
}

impl SourceDiskCache {
    pub fn new(dir: PathBuf) -> Result<Self> {
        let core = DiskCacheCore::new(dir, SOURCE_CACHE_MAX_BYTES)?;
        core.rebuild_index();
        Ok(Self { core })
    }

    pub fn sweep(&self) {
        self.core.sweep(SOURCE_CACHE_MAX_AGE);
    }

    pub async fn get_or_fetch<T, F>(&self, key: &str, ttl: Duration, fetch: F) -> Result<T>
    where
        T: Serialize + DeserializeOwned + Clone,
        F: std::future::Future<Output = Result<T>>,
    {
        if let Some(bytes) = self.core.read(key) {
            let fresh = std::fs::metadata(self.core.file_path(key))
                .map(|m| {
                    SystemTime::now()
                        .duration_since(m.modified().unwrap_or(UNIX_EPOCH))
                        .map(|age| age < ttl)
                        .unwrap_or(false)
                })
                .unwrap_or(false);
            if fresh {
                if let Ok(v) = serde_json::from_slice::<T>(&bytes) {
                    return Ok(v);
                }
                // Unparseable: drop it and refetch.
                let _ = std::fs::remove_file(self.core.file_path(key));
            }
        }
        let value = fetch.await?;
        let json = serde_json::to_vec(&value).map_err(|e| {
            ShioriError::Other(format!("SourceDiskCache serialize: {}", e))
        })?;
        self.core.write(key, &json);
        Ok(value)
    }

    pub fn stats(&self) -> CacheStats {
        self.core.stats()
    }

    pub fn clear(&self) {
        self.core.clear();
    }
}

/// Raw-byte disk cache for proxied images (covers + reader pages).
/// Content types are stored as tiny `<hash>.ct` sidecar files so the proxy
/// can serve the right Content-Type after a restart.
pub struct ImageDiskCache {
    core: DiskCacheCore,
}

impl ImageDiskCache {
    pub fn new(dir: PathBuf) -> Result<Self> {
        let core = DiskCacheCore::new(dir, IMAGE_CACHE_MAX_BYTES)?;
        core.rebuild_index();
        Ok(Self { core })
    }

    pub fn sweep(&self) {
        self.core.sweep(IMAGE_CACHE_TTL);
    }

    fn ct_path(&self, source_id: &str, url: &str) -> PathBuf {
        let key = format!("{}|{}", source_id, url);
        self.core.dir.join(format!("{}.ct", sha256_hex(&key)))
    }

    pub fn get(&self, source_id: &str, url: &str) -> Option<Vec<u8>> {
        let key = format!("{}|{}", source_id, url);
        self.core.read(&key)
    }

    pub fn get_content_type(&self, source_id: &str, url: &str) -> Option<String> {
        std::fs::read_to_string(self.ct_path(source_id, url)).ok()
    }

    pub fn put(&self, source_id: &str, url: &str, bytes: &[u8], content_type: &str) {
        // Never cache gigantic payloads (matches the 25 MB proxy cap).
        if bytes.len() as u64 > 25 * 1024 * 1024 {
            return;
        }
        let key = format!("{}|{}", source_id, url);
        self.core.write(&key, bytes);
        let ct = self.ct_path(source_id, url);
        let _ = std::fs::write(&ct, content_type);
    }

    pub fn stats(&self) -> CacheStats {
        self.core.stats()
    }

    pub fn clear(&self) {
        self.core.clear();
        // Also drop sidecar files.
        if let Ok(rd) = std::fs::read_dir(&self.core.dir) {
            for entry in rd.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if name.ends_with(".ct") {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("shiori-disk-cache-test-{}-{}", tag, uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[tokio::test]
    async fn round_trip_and_hit_skips_fetch() {
        let dir = tmp_dir("rt");
        let cache = SourceDiskCache::new(dir.clone()).unwrap();
        let mut fetches = 0;
        let v: Vec<String> = cache
            .get_or_fetch("k", Duration::from_secs(60), async {
                fetches += 1;
                Ok::<_, ShioriError>(vec!["a".to_string()])
            })
            .await
            .unwrap();
        assert_eq!(v, vec!["a"]);
        let v2: Vec<String> = cache
            .get_or_fetch("k", Duration::from_secs(60), async {
                fetches += 1;
                Ok::<_, ShioriError>(vec!["b".to_string()])
            })
            .await
            .unwrap();
        assert_eq!(v2, vec!["a"]);
        assert_eq!(fetches, 1);
        // Survives "restart": new instance reads from disk.
        let cache2 = SourceDiskCache::new(dir).unwrap();
        let v3: Vec<String> = cache2
            .get_or_fetch("k", Duration::from_secs(60), async {
                fetches += 1;
                Ok::<_, ShioriError>(vec!["c".to_string()])
            })
            .await
            .unwrap();
        assert_eq!(v3, vec!["a"], "disk hit after restart");
        assert_eq!(fetches, 1);
    }

    #[tokio::test]
    async fn expired_entry_refetches() {
        let dir = tmp_dir("ttl");
        let cache = SourceDiskCache::new(dir).unwrap();
        let _: Vec<String> = cache
            .get_or_fetch("k", Duration::from_secs(0), async {
                Ok::<_, ShioriError>(vec!["x".to_string()])
            })
            .await
            .unwrap();
        std::thread::sleep(Duration::from_millis(20));
        let mut fetches = 0;
        let v: Vec<String> = cache
            .get_or_fetch("k", Duration::from_secs(0), async {
                fetches += 1;
                Ok::<_, ShioriError>(vec!["y".to_string()])
            })
            .await
            .unwrap();
        assert_eq!(v, vec!["y"]);
        assert_eq!(fetches, 1, "expired -> refetch");
    }

    #[tokio::test]
    async fn errors_never_cached() {
        let dir = tmp_dir("err");
        let cache = SourceDiskCache::new(dir).unwrap();
        let res: Result<Vec<String>> = cache
            .get_or_fetch("k", Duration::from_secs(60), async {
                Err::<_, ShioriError>(ShioriError::Other("boom".into()))
            })
            .await;
        assert!(res.is_err());
        assert_eq!(cache.stats().entries, 0);
    }

    #[test]
    fn image_cache_put_get_clear() {
        let dir = tmp_dir("img");
        let cache = ImageDiskCache::new(dir).unwrap();
        cache.put("mangafire", "https://cdn.example/x.jpg", b"jpeg-bytes", "image/jpeg");
        assert_eq!(
            cache.get("mangafire", "https://cdn.example/x.jpg"),
            Some(b"jpeg-bytes".to_vec())
        );
        assert_eq!(
            cache.get_content_type("mangafire", "https://cdn.example/x.jpg"),
            Some("image/jpeg".to_string())
        );
        assert_eq!(cache.get("mangafire", "https://cdn.example/y.jpg"), None);
        cache.clear();
        assert_eq!(cache.stats().entries, 0);
        assert_eq!(
            cache.get_content_type("mangafire", "https://cdn.example/x.jpg"),
            None,
            "sidecars cleared too"
        );
    }

    #[test]
    fn image_cache_rejects_oversized() {
        let dir = tmp_dir("big");
        let cache = ImageDiskCache::new(dir).unwrap();
        cache.put("m", "https://x/y", &vec![0u8; 26 * 1024 * 1024], "image/jpeg");
        assert_eq!(cache.stats().entries, 0, ">25MB never cached");
    }

    #[test]
    fn sweep_drops_expired_and_over_cap() {
        let dir = tmp_dir("sweep");
        let cache = SourceDiskCache::new(dir).unwrap();
        // Two entries with distinct mtimes: write, then age the first by
        // rewriting its file mtime into the past.
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let _: Vec<String> = cache
                .get_or_fetch("old", Duration::from_secs(60), async {
                    Ok::<_, ShioriError>(vec!["old".to_string()])
                })
                .await
                .unwrap();
            let _: Vec<String> = cache
                .get_or_fetch("new", Duration::from_secs(60), async {
                    Ok::<_, ShioriError>(vec!["new".to_string()])
                })
                .await
                .unwrap();
        });
        // Age the "old" file 3 days into the past.
        let old_path = cache.core.file_path("old");
        let past = filetime::FileTime::from_unix_time(
            (SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64) - 3 * 86400,
            0,
        );
        let _ = filetime::set_file_mtime(&old_path, past);
        // Rebuild index (as a restart would) and sweep with a 1-day max age.
        cache.core.rebuild_index();
        cache.core.sweep(Duration::from_secs(24 * 60 * 60));
        assert_eq!(cache.core.read("old"), None, "expired entry removed");
        assert!(cache.core.read("new").is_some(), "fresh entry kept");
    }

    #[test]
    fn key_is_hashed_not_plaintext() {
        let core = DiskCacheCore::new(tmp_dir("hash"), 1024).unwrap();
        assert!(!core.file_path("https://secret.example/x").to_string_lossy().contains("secret"));
        assert_ne!(core.file_path("a"), core.file_path("b"));
    }
}
