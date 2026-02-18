use lru::LruCache;
use serde::{Deserialize, Serialize};
use std::num::NonZeroUsize;
use std::sync::{Arc, Mutex};

/// Cache entry for rendered content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CachedContent {
    /// HTML content (for EPUB chapters)
    Html(String),
    /// Binary image data (for PDF pages)
    Image(Vec<u8>),
    /// Plain text content
    Text(String),
}

/// Cache key for identifying cached items
#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub struct CacheKey {
    pub book_id: i64,
    pub item_type: CacheItemType,
    pub index: usize,
}

#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub enum CacheItemType {
    Chapter,
    Page,
    Resource,
}

/// In-memory LRU cache for book content
pub struct BookCache {
    cache: Arc<Mutex<LruCache<CacheKey, CachedContent>>>,
    max_size_bytes: usize,
    current_size_bytes: Arc<Mutex<usize>>,
}

impl BookCache {
    /// Create a new cache with specified maximum size in MB
    pub fn new(max_size_mb: usize) -> Self {
        let max_size_bytes = max_size_mb * 1024 * 1024;
        let capacity = NonZeroUsize::new(1000).unwrap(); // Max 1000 items

        Self {
            cache: Arc::new(Mutex::new(LruCache::new(capacity))),
            max_size_bytes,
            current_size_bytes: Arc::new(Mutex::new(0)),
        }
    }

    /// Get an item from the cache
    pub fn get(&self, key: &CacheKey) -> Option<CachedContent> {
        let mut cache = self.cache.lock().unwrap();
        cache.get(key).cloned()
    }

    /// Put an item into the cache
    pub fn put(&self, key: CacheKey, content: CachedContent) {
        let content_size = self.estimate_content_size(&content);

        // Check if adding this would exceed memory budget
        let mut current_size = self.current_size_bytes.lock().unwrap();
        while *current_size + content_size > self.max_size_bytes {
            // Evict oldest item
            let mut cache = self.cache.lock().unwrap();
            if let Some((_, evicted)) = cache.pop_lru() {
                *current_size -= self.estimate_content_size(&evicted);
            } else {
                break; // Cache is empty
            }
        }

        // Add new item
        let mut cache = self.cache.lock().unwrap();
        if let Some(old_content) = cache.put(key, content.clone()) {
            // Replace existing item
            *current_size -= self.estimate_content_size(&old_content);
        }
        *current_size += content_size;
    }

    /// Clear all cached items
    pub fn clear(&self) {
        let mut cache = self.cache.lock().unwrap();
        cache.clear();
        let mut size = self.current_size_bytes.lock().unwrap();
        *size = 0;
    }

    /// Clear cache for a specific book
    pub fn clear_book(&self, book_id: i64) {
        let mut cache = self.cache.lock().unwrap();
        let mut size = self.current_size_bytes.lock().unwrap();

        // Collect keys to remove
        let keys_to_remove: Vec<CacheKey> = cache
            .iter()
            .filter_map(|(k, _)| {
                if k.book_id == book_id {
                    Some(k.clone())
                } else {
                    None
                }
            })
            .collect();

        // Remove items and update size
        for key in keys_to_remove {
            if let Some(content) = cache.pop(&key) {
                *size -= self.estimate_content_size(&content);
            }
        }
    }

    /// Get current cache statistics
    pub fn stats(&self) -> CacheStats {
        let cache = self.cache.lock().unwrap();
        let size = self.current_size_bytes.lock().unwrap();

        CacheStats {
            item_count: cache.len(),
            size_bytes: *size,
            max_size_bytes: self.max_size_bytes,
            utilization_percent: (*size as f64 / self.max_size_bytes as f64 * 100.0) as u32,
        }
    }

    /// Estimate content size in bytes
    fn estimate_content_size(&self, content: &CachedContent) -> usize {
        match content {
            CachedContent::Html(s) | CachedContent::Text(s) => s.len(),
            CachedContent::Image(data) => data.len(),
        }
    }

    /// Preload content for upcoming pages/chapters
    pub fn preload_hint(&self, keys: Vec<CacheKey>) {
        // This is a hint for future preloading implementation
        // For now, it's a no-op, but could trigger background loading
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub item_count: usize,
    pub size_bytes: usize,
    pub max_size_bytes: usize,
    pub utilization_percent: u32,
}

/// Global cache instance manager
pub struct CacheManager {
    book_cache: BookCache,
}

impl CacheManager {
    pub fn new(max_size_mb: usize) -> Self {
        Self {
            book_cache: BookCache::new(max_size_mb),
        }
    }

    pub fn book_cache(&self) -> &BookCache {
        &self.book_cache
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_put_get() {
        let cache = BookCache::new(10); // 10 MB
        let key = CacheKey {
            book_id: 1,
            item_type: CacheItemType::Chapter,
            index: 0,
        };
        let content = CachedContent::Text("Hello World".to_string());

        cache.put(key.clone(), content.clone());
        let retrieved = cache.get(&key);

        assert!(retrieved.is_some());
    }

    #[test]
    fn test_cache_eviction() {
        let cache = BookCache::new(1); // 1 MB

        // Add items until cache is full
        for i in 0..100 {
            let key = CacheKey {
                book_id: 1,
                item_type: CacheItemType::Chapter,
                index: i,
            };
            let large_content = CachedContent::Text("x".repeat(50000)); // ~50KB
            cache.put(key, large_content);
        }

        let stats = cache.stats();
        assert!(stats.size_bytes <= stats.max_size_bytes);
    }

    #[test]
    fn test_clear_book() {
        let cache = BookCache::new(10);

        // Add items for two different books
        for book_id in 1..=2 {
            for i in 0..5 {
                let key = CacheKey {
                    book_id,
                    item_type: CacheItemType::Chapter,
                    index: i,
                };
                cache.put(key, CachedContent::Text("test".to_string()));
            }
        }

        // Clear book 1
        cache.clear_book(1);

        // Book 1 items should be gone, book 2 should remain
        let key1 = CacheKey {
            book_id: 1,
            item_type: CacheItemType::Chapter,
            index: 0,
        };
        let key2 = CacheKey {
            book_id: 2,
            item_type: CacheItemType::Chapter,
            index: 0,
        };

        assert!(cache.get(&key1).is_none());
        assert!(cache.get(&key2).is_some());
    }
}
