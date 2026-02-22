use crate::error::{ShioriError, ShioriResult};
use crate::services::cache::{BookCache, CacheItemType, CacheKey, CachedContent};
use crate::services::epub_adapter::EpubAdapter;
use crate::services::pdf_adapter::PdfAdapter;
use crate::services::docx_adapter::DocxAdapter;
use crate::services::mobi_adapter::MobiAdapter;
use crate::services::renderer::{BookMetadata, BookReaderAdapter, Chapter, SearchResult, TocEntry};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Manages book renderers and caching
pub struct RenderingService {
    cache: Arc<BookCache>,
    // Store active renderers per book
    epub_renderers: Arc<Mutex<HashMap<i64, EpubAdapter>>>,
    pdf_renderers: Arc<Mutex<HashMap<i64, PdfAdapter>>>,
    docx_renderers: Arc<Mutex<HashMap<i64, DocxAdapter>>>,
    mobi_renderers: Arc<Mutex<HashMap<i64, MobiAdapter>>>,
}

impl RenderingService {
    pub fn new(cache_size_mb: usize) -> Self {
        Self {
            cache: Arc::new(BookCache::new(cache_size_mb)),
            epub_renderers: Arc::new(Mutex::new(HashMap::new())),
            pdf_renderers: Arc::new(Mutex::new(HashMap::new())),
            docx_renderers: Arc::new(Mutex::new(HashMap::new())),
            mobi_renderers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Open a book and prepare it for rendering
    pub fn open_book(&self, book_id: i64, path: &str, format: &str) -> ShioriResult<BookMetadata> {
        println!("[RenderingService::open_book] Starting...");
        println!("  book_id: {}", book_id);
        println!("  path: {}", path);
        println!("  format: {}", format);

        match format.to_lowercase().as_str() {
            "epub" => {
                println!("[RenderingService] Creating EpubAdapter...");
                let mut adapter = EpubAdapter::new();

                println!("[RenderingService] Calling adapter.load()...");
                match futures::executor::block_on(adapter.load(path)) {
                    Ok(_) => println!("[RenderingService] ✅ adapter.load() succeeded"),
                    Err(e) => {
                        println!("[RenderingService] ❌ adapter.load() failed: {}", e);
                        return Err(e);
                    }
                }

                println!("[RenderingService] Getting metadata...");
                let metadata = adapter.get_metadata()?;

                println!("[RenderingService] Inserting into HashMap...");
                {
                    let mut renderers = self.epub_renderers.lock().unwrap();
                    renderers.insert(book_id, adapter);
                    println!(
                        "[RenderingService] ✅ HashMap insert complete, book {} is now accessible",
                        book_id
                    );
                }

                // Verify the book is actually in the HashMap
                {
                    let renderers = self.epub_renderers.lock().unwrap();
                    if renderers.contains_key(&book_id) {
                        println!(
                            "[RenderingService] ✅ VERIFIED: Book {} is in HashMap",
                            book_id
                        );
                    } else {
                        println!(
                            "[RenderingService] ❌ ERROR: Book {} NOT in HashMap after insert!",
                            book_id
                        );
                    }
                }

                Ok(metadata)
            }
            "pdf" => {
                println!("[RenderingService] Creating PdfAdapter...");
                let mut adapter = PdfAdapter::new();

                println!("[RenderingService] Calling adapter.load()...");
                match futures::executor::block_on(adapter.load(path)) {
                    Ok(_) => println!("[RenderingService] ✅ adapter.load() succeeded"),
                    Err(e) => {
                        println!("[RenderingService] ❌ adapter.load() failed: {}", e);
                        return Err(e);
                    }
                }

                println!("[RenderingService] Getting metadata...");
                let metadata = adapter.get_metadata()?;

                println!("[RenderingService] Inserting into HashMap...");
                {
                    let mut renderers = self.pdf_renderers.lock().unwrap();
                    renderers.insert(book_id, adapter);
                    println!(
                        "[RenderingService] ✅ HashMap insert complete, book {} is now accessible",
                        book_id
                    );
                }

                // Verify the book is actually in the HashMap
                {
                    let renderers = self.pdf_renderers.lock().unwrap();
                    if renderers.contains_key(&book_id) {
                        println!(
                            "[RenderingService] ✅ VERIFIED: Book {} is in HashMap",
                            book_id
                        );
                    } else {
                        println!(
                            "[RenderingService] ❌ ERROR: Book {} NOT in HashMap after insert!",
                            book_id
                        );
                    }
                }

                Ok(metadata)
            }
            "docx" => {
                println!("[RenderingService] Creating DocxAdapter...");
                let mut adapter = DocxAdapter::new();

                println!("[RenderingService] Calling adapter.load()...");
                match futures::executor::block_on(adapter.load(path)) {
                    Ok(_) => println!("[RenderingService] ✅ adapter.load() succeeded"),
                    Err(e) => {
                        println!("[RenderingService] ❌ adapter.load() failed: {}", e);
                        return Err(e);
                    }
                }

                println!("[RenderingService] Getting metadata...");
                let metadata = adapter.get_metadata()?;

                println!("[RenderingService] Inserting into HashMap...");
                {
                    let mut renderers = self.docx_renderers.lock().unwrap();
                    renderers.insert(book_id, adapter);
                    println!(
                        "[RenderingService] ✅ HashMap insert complete, book {} is now accessible",
                        book_id
                    );
                }

                Ok(metadata)
            }
            "mobi" | "azw3" | "azw" => {
                println!("[RenderingService] Creating MobiAdapter...");
                let mut adapter = MobiAdapter::new();

                println!("[RenderingService] Calling adapter.load()...");
                match futures::executor::block_on(adapter.load(path)) {
                    Ok(_) => println!("[RenderingService] ✅ adapter.load() succeeded"),
                    Err(e) => {
                        println!("[RenderingService] ❌ adapter.load() failed: {}", e);
                        return Err(e);
                    }
                }

                println!("[RenderingService] Getting metadata...");
                let metadata = adapter.get_metadata()?;

                println!("[RenderingService] Inserting into HashMap...");
                {
                    let mut renderers = self.mobi_renderers.lock().unwrap();
                    renderers.insert(book_id, adapter);
                    println!(
                        "[RenderingService] ✅ HashMap insert complete, book {} is now accessible",
                        book_id
                    );
                }

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

        let mut docx_renderers = self.docx_renderers.lock().unwrap();
        docx_renderers.remove(&book_id);

        let mut mobi_renderers = self.mobi_renderers.lock().unwrap();
        mobi_renderers.remove(&book_id);

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

        // Try DOCX
        if let Some(adapter) = self.docx_renderers.lock().unwrap().get(&book_id) {
            return adapter.get_toc();
        }

        // Try MOBI
        if let Some(adapter) = self.mobi_renderers.lock().unwrap().get(&book_id) {
            return adapter.get_toc();
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened",
            book_id
        )))
    }

    /// Get a chapter with caching
    pub fn get_chapter(&self, book_id: i64, chapter_index: usize) -> ShioriResult<Chapter> {
        println!(
            "[RenderingService::get_chapter] book_id: {}, chapter_index: {}",
            book_id, chapter_index
        );

        // Check cache first
        let cache_key = CacheKey {
            book_id,
            item_type: CacheItemType::Chapter,
            index: chapter_index,
        };

        if let Some(CachedContent::Html(content)) = self.cache.get(&cache_key) {
            println!("[RenderingService::get_chapter] ✅ Cache hit");
            // Return cached chapter (construct from cached data)
            return Ok(Chapter {
                index: chapter_index,
                title: format!("Chapter {}", chapter_index + 1), // Simplified
                content,
                location: format!("chapter:{}", chapter_index),
            });
        }

        println!("[RenderingService::get_chapter] Cache miss, fetching from renderer...");

        // Try to fetch from renderer - check EPUB first
        let chapter = {
            let epub_renderers = self.epub_renderers.lock().unwrap();
            if let Some(adapter) = epub_renderers.get(&book_id) {
                println!("[RenderingService::get_chapter] Found in EPUB renderers");
                let result = adapter.get_chapter(chapter_index);
                drop(epub_renderers); // Release lock before checking result
                result?
            } else {
                drop(epub_renderers); // Release EPUB lock before trying PDF

                // Try PDF renderer
                let pdf_renderers = self.pdf_renderers.lock().unwrap();
                if let Some(adapter) = pdf_renderers.get(&book_id) {
                    println!("[RenderingService::get_chapter] Found in PDF renderers");
                    let result = adapter.get_chapter(chapter_index);
                    drop(pdf_renderers); // Release lock before checking result
                    result?
                } else {
                    drop(pdf_renderers);

                    // Try DOCX renderer
                    let docx_renderers = self.docx_renderers.lock().unwrap();
                    if let Some(adapter) = docx_renderers.get(&book_id) {
                        println!("[RenderingService::get_chapter] Found in DOCX renderers");
                        let result = adapter.get_chapter(chapter_index);
                        drop(docx_renderers);
                        result?
                    } else {
                        drop(docx_renderers);
                        
                        // Try MOBI renderer
                        let mobi_renderers = self.mobi_renderers.lock().unwrap();
                        if let Some(adapter) = mobi_renderers.get(&book_id) {
                            println!("[RenderingService::get_chapter] Found in MOBI renderers");
                            let result = adapter.get_chapter(chapter_index);
                            drop(mobi_renderers);
                            result?
                        } else {
                            println!(
                                "[RenderingService::get_chapter] ❌ Book {} not in any renderer!",
                                book_id
                            );
                            return Err(ShioriError::BookNotFound(format!(
                                "Book {} not opened",
                                book_id
                            )));
                        }
                    }
                }
            }
        };

        println!(
            "[RenderingService::get_chapter] ✅ Got chapter: {}",
            chapter.title
        );

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

        if let Some(adapter) = self.docx_renderers.lock().unwrap().get(&book_id) {
            return Ok(adapter.chapter_count());
        }

        if let Some(adapter) = self.mobi_renderers.lock().unwrap().get(&book_id) {
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

        if let Some(adapter) = self.docx_renderers.lock().unwrap().get(&book_id) {
            return adapter.search(query);
        }

        if let Some(adapter) = self.mobi_renderers.lock().unwrap().get(&book_id) {
            return adapter.search(query);
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened",
            book_id
        )))
    }

    /// Get a resource (image, CSS, font) from an EPUB
    pub fn get_epub_resource(&self, book_id: i64, resource_path: &str) -> ShioriResult<Vec<u8>> {
        if let Some(adapter) = self.epub_renderers.lock().unwrap().get(&book_id) {
            return adapter.get_resource(resource_path);
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
                } else if let Some(adapter) = self.docx_renderers.lock().unwrap().get(&book_id) {
                    if let Ok(chapter) = adapter.get_chapter(next_index) {
                        self.cache
                            .put(cache_key, CachedContent::Html(chapter.content.clone()));
                    }
                } else if let Some(adapter) = self.mobi_renderers.lock().unwrap().get(&book_id) {
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

    /// Render a specific page as a PNG image Buffer (for native PDF/image books)
    pub fn render_page(&self, book_id: i64, page_index: usize, scale: f32) -> ShioriResult<Vec<u8>> {
        // Try PDF
        if let Some(adapter) = self.pdf_renderers.lock().unwrap().get(&book_id) {
            return futures::executor::block_on(adapter.render_page(page_index, scale));
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened or doesn't support page rendering",
            book_id
        )))
    }

    /// Get native page dimensions (width, height) at 1.0 scale
    pub fn get_page_dimensions(&self, book_id: i64, page_index: usize) -> ShioriResult<(f32, f32)> {
        if let Some(adapter) = self.pdf_renderers.lock().unwrap().get(&book_id) {
            return adapter.get_page_dimensions(page_index);
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened or doesn't support dimension querying",
            book_id
        )))
    }
}
