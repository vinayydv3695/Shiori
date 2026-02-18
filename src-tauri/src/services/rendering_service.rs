use crate::error::{ShioriError, ShioriResult};
use crate::services::cache::{BookCache, CacheItemType, CacheKey, CachedContent};
use crate::services::epub_adapter::EpubAdapter;
use crate::services::pdf_adapter::PdfAdapter;
use crate::services::renderer::{BookMetadata, BookRenderer, Chapter, SearchResult, TocEntry};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Manages book renderers and caching
pub struct RenderingService {
    cache: Arc<BookCache>,
    // Store active renderers per book
    epub_renderers: Arc<Mutex<HashMap<i64, EpubAdapter>>>,
    pdf_renderers: Arc<Mutex<HashMap<i64, PdfAdapter>>>,
}

impl RenderingService {
    pub fn new(cache_size_mb: usize) -> Self {
        Self {
            cache: Arc::new(BookCache::new(cache_size_mb)),
            epub_renderers: Arc::new(Mutex::new(HashMap::new())),
            pdf_renderers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Open a book and prepare it for rendering
    pub fn open_book(&self, book_id: i64, path: &str, format: &str) -> ShioriResult<BookMetadata> {
        match format.to_lowercase().as_str() {
            "epub" => {
                let mut adapter = EpubAdapter::new();
                adapter.open(path)?;
                let metadata = adapter.get_metadata()?;

                let mut renderers = self.epub_renderers.lock().unwrap();
                renderers.insert(book_id, adapter);

                Ok(metadata)
            }
            "pdf" => {
                let mut adapter = PdfAdapter::new();
                adapter.open(path)?;
                let metadata = adapter.get_metadata()?;

                let mut renderers = self.pdf_renderers.lock().unwrap();
                renderers.insert(book_id, adapter);

                Ok(metadata)
            }
            _ => Err(ShioriError::UnsupportedFormat {
                format: format.to_string(),
                path: path.to_string(),
            }),
        }
    }

    /// Close a book and free resources
    pub fn close_book(&self, book_id: i64) {
        let mut epub_renderers = self.epub_renderers.lock().unwrap();
        epub_renderers.remove(&book_id);

        let mut pdf_renderers = self.pdf_renderers.lock().unwrap();
        pdf_renderers.remove(&book_id);

        // Clear cache for this book
        self.cache.clear_book(book_id);
    }

    /// Get table of contents for a book
    pub fn get_toc(&self, book_id: i64) -> ShioriResult<Vec<TocEntry>> {
        // Try EPUB first
        if let Some(adapter) = self.epub_renderers.lock().unwrap().get(&book_id) {
            return adapter.get_toc();
        }

        // Try PDF
        if let Some(adapter) = self.pdf_renderers.lock().unwrap().get(&book_id) {
            return adapter.get_toc();
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened",
            book_id
        )))
    }

    /// Get a chapter with caching
    pub fn get_chapter(&self, book_id: i64, chapter_index: usize) -> ShioriResult<Chapter> {
        // Check cache first
        let cache_key = CacheKey {
            book_id,
            item_type: CacheItemType::Chapter,
            index: chapter_index,
        };

        if let Some(CachedContent::Html(content)) = self.cache.get(&cache_key) {
            // Return cached chapter (construct from cached data)
            return Ok(Chapter {
                index: chapter_index,
                title: format!("Chapter {}", chapter_index + 1), // Simplified
                content,
                location: format!("chapter:{}", chapter_index),
            });
        }

        // Not in cache, fetch from renderer
        let chapter = if let Some(adapter) = self.epub_renderers.lock().unwrap().get(&book_id) {
            adapter.get_chapter(chapter_index)?
        } else if let Some(adapter) = self.pdf_renderers.lock().unwrap().get(&book_id) {
            adapter.get_chapter(chapter_index)?
        } else {
            return Err(ShioriError::BookNotFound(format!(
                "Book {} not opened",
                book_id
            )));
        };

        // Cache the result
        self.cache
            .put(cache_key, CachedContent::Html(chapter.content.clone()));

        // Preload next chapters in background
        self.preload_adjacent_chapters(book_id, chapter_index);

        Ok(chapter)
    }

    /// Get chapter count
    pub fn get_chapter_count(&self, book_id: i64) -> ShioriResult<usize> {
        if let Some(adapter) = self.epub_renderers.lock().unwrap().get(&book_id) {
            return Ok(adapter.chapter_count());
        }

        if let Some(adapter) = self.pdf_renderers.lock().unwrap().get(&book_id) {
            return Ok(adapter.chapter_count());
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened",
            book_id
        )))
    }

    /// Search within a book
    pub fn search_book(&self, book_id: i64, query: &str) -> ShioriResult<Vec<SearchResult>> {
        if let Some(adapter) = self.epub_renderers.lock().unwrap().get(&book_id) {
            return adapter.search(query);
        }

        if let Some(adapter) = self.pdf_renderers.lock().unwrap().get(&book_id) {
            return adapter.search(query);
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened",
            book_id
        )))
    }

    /// Preload adjacent chapters for smoother navigation
    fn preload_adjacent_chapters(&self, book_id: i64, current_index: usize) {
        // Preload next 2 chapters
        for i in 1..=2 {
            let next_index = current_index + i;
            let cache_key = CacheKey {
                book_id,
                item_type: CacheItemType::Chapter,
                index: next_index,
            };

            // Only preload if not already cached
            if self.cache.get(&cache_key).is_none() {
                // Try to fetch and cache
                if let Some(adapter) = self.epub_renderers.lock().unwrap().get(&book_id) {
                    if let Ok(chapter) = adapter.get_chapter(next_index) {
                        self.cache
                            .put(cache_key, CachedContent::Html(chapter.content.clone()));
                    }
                } else if let Some(adapter) = self.pdf_renderers.lock().unwrap().get(&book_id) {
                    if let Ok(chapter) = adapter.get_chapter(next_index) {
                        self.cache
                            .put(cache_key, CachedContent::Html(chapter.content.clone()));
                    }
                }
            }
        }
    }

    /// Get cache statistics
    pub fn get_cache_stats(&self) -> crate::services::cache::CacheStats {
        self.cache.stats()
    }

    /// Clear all caches
    pub fn clear_all_caches(&self) {
        self.cache.clear();
    }
}
