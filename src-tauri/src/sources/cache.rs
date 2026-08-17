//! Shared bounded in-memory cache helpers for source adapters.
//!
//! Both ToonGod and MangaFire use the same get-or-fetch + oldest-entry
//! eviction pattern; this module keeps a single copy instead of two
//! divergent ones. Pure helpers, generic over `T: Clone` — unit-testable
//! with no I/O.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::{Result, ShioriError};

/// Max entries per cache (search/chapters/pages). Beyond this, the entry
/// with the oldest `cached_at` is evicted on insert — keeps memory bounded.
pub const CACHE_MAX_ENTRIES: usize = 50;

/// Cap for the shared command-layer response cache (all sources combined).
pub const RESPONSE_CACHE_MAX_ENTRIES: usize = 500;

/// Evict the single entry with the oldest `cached_at` when `cache` holds more
/// than `cap` entries. Returns how many entries were evicted (0 or 1).
/// Tiny maps, so a linear scan is plenty fast — and it keeps the policy
/// trivially unit-testable.
pub fn evict_oldest_if_over_cap_limit<T>(
    cache: &mut HashMap<String, (Instant, T)>,
    cap: usize,
) -> usize {
    if cache.len() <= cap {
        return 0;
    }
    if let Some(oldest_key) = cache
        .iter()
        .min_by_key(|(_, (cached_at, _))| *cached_at)
        .map(|(k, _)| k.clone())
    {
        cache.remove(&oldest_key);
        return 1;
    }
    0
}

/// Evict the single entry with the oldest `cached_at` when `cache` holds more
/// than [`CACHE_MAX_ENTRIES`]. Returns how many entries were evicted (0 or 1).
pub fn evict_oldest_if_over_cap<T>(cache: &mut HashMap<String, (Instant, T)>) -> usize {
    evict_oldest_if_over_cap_limit(cache, CACHE_MAX_ENTRIES)
}

/// Shared command-layer response cache (online performance plan — "fast
/// results for all sources"). One bounded map keyed by
/// `source_id|kind|key`, storing the JSON of the last Ok response. Generic
/// over `T` via a serde round-trip; errors are never cached. This gives
/// every source — not just the ones with per-source caches — instant repeat
/// searches/browses/chapter lists within a session.
pub struct SourceResponseCache {
    cache: Mutex<HashMap<String, (Instant, String)>>,
}

impl Default for SourceResponseCache {
    fn default() -> Self {
        Self::new()
    }
}

impl SourceResponseCache {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// Return the cached value while fresh (within `ttl`); otherwise run
    /// `fetch`, store the JSON-serialized result keyed by `key`, and return
    /// it. Errors from `fetch` are propagated untouched and never cached.
    pub async fn get_or_fetch<T, F>(&self, key: &str, ttl: Duration, fetch: F) -> Result<T>
    where
        T: Serialize + DeserializeOwned + Clone,
        F: std::future::Future<Output = Result<T>>,
    {
        {
            let guard = self.cache.lock().unwrap_or_else(|p| p.into_inner());
            if let Some((cached_at, json)) = guard.get(key) {
                if cached_at.elapsed() < ttl {
                    if let Ok(v) = serde_json::from_str::<T>(json) {
                        return Ok(v);
                    }
                    log::debug!(
                        "[source-cache] stale/unparseable entry for {} dropped",
                        key
                    );
                }
            }
        }
        let value = fetch.await?;
        let json = serde_json::to_string(&value).map_err(|e| {
            ShioriError::Other(format!("SourceResponseCache serialize: {}", e))
        })?;
        let mut guard = self.cache.lock().unwrap_or_else(|p| p.into_inner());
        guard.insert(key.to_string(), (Instant::now(), json));
        evict_oldest_if_over_cap_limit(&mut guard, RESPONSE_CACHE_MAX_ENTRIES);
        Ok(value)
    }

    /// Number of cached entries (for stats/debugging).
    pub fn len(&self) -> usize {
        self.cache
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn clear(&self) {
        self.cache.lock().unwrap_or_else(|p| p.into_inner()).clear();
    }
}

#[cfg(test)]
mod response_cache_tests {
    use super::*;

    #[tokio::test]
    async fn fresh_hit_skips_fetch() {
        let cache = SourceResponseCache::new();
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
        assert_eq!(v2, vec!["a"], "cached value served");
        assert_eq!(fetches, 1);
    }

    #[tokio::test]
    async fn expired_entry_refetches() {
        let cache = SourceResponseCache::new();
        cache.cache.lock().unwrap().insert(
            "k".into(),
            (Instant::now() - Duration::from_secs(120), r#"["stale"]"#.into()),
        );
        let mut fetches = 0;
        let v: Vec<String> = cache
            .get_or_fetch("k", Duration::from_secs(60), async {
                fetches += 1;
                Ok::<_, ShioriError>(vec!["fresh".to_string()])
            })
            .await
            .unwrap();
        assert_eq!(v, vec!["fresh"]);
        assert_eq!(fetches, 1);
    }

    #[tokio::test]
    async fn errors_are_never_cached() {
        let cache = SourceResponseCache::new();
        let mut fetches = 0;
        for _ in 0..2 {
            let res: Result<Vec<String>> = cache
                .get_or_fetch("k", Duration::from_secs(60), async {
                    fetches += 1;
                    Err::<_, ShioriError>(ShioriError::Other("boom".into()))
                })
                .await;
            assert!(res.is_err());
        }
        assert_eq!(fetches, 2, "errors must not be cached");
    }

    #[tokio::test]
    async fn over_cap_evicts_oldest() {
        let cache = SourceResponseCache::new();
        for i in 0..RESPONSE_CACHE_MAX_ENTRIES + 2 {
            let key = format!("k{i}");
            let _: Vec<String> = cache
                .get_or_fetch(&key, Duration::from_secs(60), async move {
                    Ok::<_, ShioriError>(vec![format!("v{i}")])
                })
                .await
                .unwrap();
        }
        assert!(cache.len() <= RESPONSE_CACHE_MAX_ENTRIES);
    }

    #[test]
    fn evict_with_cap_leaves_below_cap_untouched() {
        let mut m: HashMap<String, (Instant, u32)> = HashMap::new();
        for i in 0..=RESPONSE_CACHE_MAX_ENTRIES {
            m.insert(format!("k{i}"), (Instant::now(), i as u32));
        }
        assert_eq!(evict_oldest_if_over_cap_limit(&mut m, RESPONSE_CACHE_MAX_ENTRIES), 1);
        assert_eq!(m.len(), RESPONSE_CACHE_MAX_ENTRIES);
    }
}

/// Returns a cached value while it is fresh (within `ttl`); otherwise runs
/// `fetch`, stores the result keyed by `key`, and returns it. Errors from
/// `fetch` are propagated untouched and never cached.
pub async fn cache_get_or_fetch<T, F>(
    cache: &Mutex<HashMap<String, (Instant, T)>>,
    key: &str,
    ttl: Duration,
    fetch: F,
) -> Result<T>
where
    T: Clone,
    F: std::future::Future<Output = Result<T>>,
{
    {
        let guard = cache.lock().unwrap_or_else(|p| p.into_inner());
        if let Some((cached_at, value)) = guard.get(key) {
            if cached_at.elapsed() < ttl {
                return Ok(value.clone());
            }
        }
    }
    let value = fetch.await?;
    let mut guard = cache.lock().unwrap_or_else(|p| p.into_inner());
    guard.insert(key.to_string(), (Instant::now(), value.clone()));
    let evicted = evict_oldest_if_over_cap(&mut guard);
    if evicted > 0 {
        log::debug!("[sources] cache over cap, evicted {evicted} oldest entr(ies)");
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn fresh_entry_skips_fetch() {
        let cache: Mutex<HashMap<String, (Instant, String)>> = Mutex::new(HashMap::new());
        let mut fetches = 0;
        let value = cache_get_or_fetch(
            &cache,
            "k",
            Duration::from_secs(60),
            async {
                fetches += 1;
                Ok::<_, crate::error::ShioriError>("v".to_string())
            },
        )
        .await
        .unwrap();
        assert_eq!(value, "v");
        let value = cache_get_or_fetch(
            &cache,
            "k",
            Duration::from_secs(60),
            async {
                fetches += 1;
                Ok::<_, crate::error::ShioriError>("v2".to_string())
            },
        )
        .await
        .unwrap();
        assert_eq!(value, "v", "cached value served");
        assert_eq!(fetches, 1);
    }

    #[test]
    fn eviction_removes_oldest_only_when_over_cap() {
        let mut cache: HashMap<String, (Instant, String)> = HashMap::new();
        cache.insert("a".into(), (Instant::now() - Duration::from_secs(10), "a".into()));
        cache.insert("b".into(), (Instant::now() - Duration::from_secs(5), "b".into()));
        assert_eq!(evict_oldest_if_over_cap(&mut cache), 0);
        assert_eq!(cache.len(), 2);

        // Fill past the cap (50) with entries NEWER than "a" (10s old), so
        // "a" is the eviction target.
        for i in 2..CACHE_MAX_ENTRIES + 2 {
            cache.insert(
                format!("k{i}"),
                (Instant::now() - Duration::from_millis(i as u64 * 7), format!("v{i}")),
            );
        }
        assert_eq!(cache.len(), CACHE_MAX_ENTRIES + 2);
        assert_eq!(evict_oldest_if_over_cap(&mut cache), 1);
        assert_eq!(cache.len(), CACHE_MAX_ENTRIES + 1);
        assert!(!cache.contains_key("a"), "oldest entry evicted");
    }
}
