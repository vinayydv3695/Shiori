//! Shared bounded in-memory cache helpers for source adapters.
//!
//! Both ToonGod and MangaFire use the same get-or-fetch + oldest-entry
//! eviction pattern; this module keeps a single copy instead of two
//! divergent ones. Pure helpers, generic over `T: Clone` — unit-testable
//! with no I/O.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::error::Result;

/// Max entries per cache (search/chapters/pages). Beyond this, the entry
/// with the oldest `cached_at` is evicted on insert — keeps memory bounded.
pub const CACHE_MAX_ENTRIES: usize = 50;

/// Evict the single entry with the oldest `cached_at` when `cache` holds more
/// than [`CACHE_MAX_ENTRIES`]. Returns how many entries were evicted (0 or 1).
/// Tiny maps, so a linear scan is plenty fast — and it keeps the policy
/// trivially unit-testable.
pub fn evict_oldest_if_over_cap<T>(cache: &mut HashMap<String, (Instant, T)>) -> usize {
    if cache.len() <= CACHE_MAX_ENTRIES {
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
