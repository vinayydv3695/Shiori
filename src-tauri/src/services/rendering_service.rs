use crate::error::{Result, ShioriError};
use crate::services::cache::{BookCache, CacheItemType, CacheKey, CachedContent};
use crate::services::docx_adapter::DocxAdapter;
use crate::services::epub_adapter::EpubAdapter;
use crate::services::fb2_reader_adapter::Fb2ReaderAdapter;
use crate::services::html_reader_adapter::HtmlReaderAdapter;
use crate::services::markdown_reader_adapter::MarkdownReaderAdapter;
use crate::services::mobi_adapter::MobiAdapter;
use crate::services::pdf_adapter::PdfAdapter;
use crate::services::renderer::{BookMetadata, BookReaderAdapter, Chapter, SearchResult, TocEntry};
use crate::services::txt_reader_adapter::TxtReaderAdapter;
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
    fb2_renderers: Arc<Mutex<HashMap<i64, Fb2ReaderAdapter>>>,
    html_renderers: Arc<Mutex<HashMap<i64, HtmlReaderAdapter>>>,
    txt_renderers: Arc<Mutex<HashMap<i64, TxtReaderAdapter>>>,
    md_renderers: Arc<Mutex<HashMap<i64, MarkdownReaderAdapter>>>,
}

impl RenderingService {
    pub fn new(cache_size_mb: usize) -> Self {
        Self {
            cache: Arc::new(BookCache::new(cache_size_mb)),
            epub_renderers: Arc::new(Mutex::new(HashMap::new())),
            pdf_renderers: Arc::new(Mutex::new(HashMap::new())),
            docx_renderers: Arc::new(Mutex::new(HashMap::new())),
            mobi_renderers: Arc::new(Mutex::new(HashMap::new())),
            fb2_renderers: Arc::new(Mutex::new(HashMap::new())),
            html_renderers: Arc::new(Mutex::new(HashMap::new())),
            txt_renderers: Arc::new(Mutex::new(HashMap::new())),
            md_renderers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Open a book and prepare it for rendering
    pub fn open_book(&self, book_id: i64, path: &str, format: &str) -> Result<BookMetadata> {
        log::debug!(
            "[RenderingService::open_book] book_id={} path={} format={}",
            book_id,
            path,
            format
        );

        match format.to_lowercase().as_str() {
            "epub" => {
                let mut adapter = EpubAdapter::new();
                // Use tokio::task::block_in_place to handle async in sync context without blocking runtime
                let path_clone = path.to_string();
                let load_result = tokio::task::block_in_place(|| {
                    tokio::runtime::Handle::current()
                        .block_on(async { adapter.load(&path_clone).await })
                });
                load_result?;
                let metadata = adapter.get_metadata()?;
                {
                    let mut renderers = self.epub_renderers.lock().unwrap();
                    renderers.insert(book_id, adapter);
                }
                Ok(metadata)
            }
            "pdf" => {
                let mut adapter = PdfAdapter::new();
                let path_clone = path.to_string();
                let load_result = tokio::task::block_in_place(|| {
                    tokio::runtime::Handle::current()
                        .block_on(async { adapter.load(&path_clone).await })
                });
                load_result?;
                let metadata = adapter.get_metadata()?;
                {
                    let mut renderers = self.pdf_renderers.lock().unwrap();
                    renderers.insert(book_id, adapter);
                }
                Ok(metadata)
            }
            "docx" => {
                let mut adapter = DocxAdapter::new();
                let path_clone = path.to_string();
                let load_result = tokio::task::block_in_place(|| {
                    tokio::runtime::Handle::current()
                        .block_on(async { adapter.load(&path_clone).await })
                });
                load_result?;
                let metadata = adapter.get_metadata()?;
                {
                    let mut renderers = self.docx_renderers.lock().unwrap();
                    renderers.insert(book_id, adapter);
                }
                Ok(metadata)
            }
            "mobi" | "azw3" | "azw" => {
                let mut adapter = MobiAdapter::new();
                let path_clone = path.to_string();
                let load_result = tokio::task::block_in_place(|| {
                    tokio::runtime::Handle::current()
                        .block_on(async { adapter.load(&path_clone).await })
                });
                load_result?;
                let metadata = adapter.get_metadata()?;
                {
                    let mut renderers = self.mobi_renderers.lock().unwrap();
                    renderers.insert(book_id, adapter);
                }
                Ok(metadata)
            }
            "fb2" => {
                let mut adapter = Fb2ReaderAdapter::new();
                let path_clone = path.to_string();
                let load_result = tokio::task::block_in_place(|| {
                    tokio::runtime::Handle::current()
                        .block_on(async { adapter.load(&path_clone).await })
                });
                load_result?;
                let metadata = adapter.get_metadata()?;
                {
                    let mut renderers = self.fb2_renderers.lock().unwrap();
                    renderers.insert(book_id, adapter);
                }
                Ok(metadata)
            }
            "html" | "htm" => {
                let mut adapter = HtmlReaderAdapter::new();
                let path_clone = path.to_string();
                let load_result = tokio::task::block_in_place(|| {
                    tokio::runtime::Handle::current()
                        .block_on(async { adapter.load(&path_clone).await })
                });
                load_result?;
                let metadata = adapter.get_metadata()?;
                {
                    let mut renderers = self.html_renderers.lock().unwrap();
                    renderers.insert(book_id, adapter);
                }
                Ok(metadata)
            }
            "txt" => {
                let mut adapter = TxtReaderAdapter::new();
                let path_clone = path.to_string();
                let load_result = tokio::task::block_in_place(|| {
                    tokio::runtime::Handle::current()
                        .block_on(async { adapter.load(&path_clone).await })
                });
                load_result?;
                let metadata = adapter.get_metadata()?;
                {
                    let mut renderers = self.txt_renderers.lock().unwrap();
                    renderers.insert(book_id, adapter);
                }
                Ok(metadata)
            }
            "md" | "markdown" => {
                let mut adapter = MarkdownReaderAdapter::new();
                let path_clone = path.to_string();
                let load_result = tokio::task::block_in_place(|| {
                    tokio::runtime::Handle::current()
                        .block_on(async { adapter.load(&path_clone).await })
                });
                load_result?;
                let metadata = adapter.get_metadata()?;
                {
                    let mut renderers = self.md_renderers.lock().unwrap();
                    renderers.insert(book_id, adapter);
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

        let mut fb2_renderers = self.fb2_renderers.lock().unwrap();
        fb2_renderers.remove(&book_id);

        let mut html_renderers = self.html_renderers.lock().unwrap();
        html_renderers.remove(&book_id);

        let mut txt_renderers = self.txt_renderers.lock().unwrap();
        txt_renderers.remove(&book_id);

        let mut md_renderers = self.md_renderers.lock().unwrap();
        md_renderers.remove(&book_id);

        // Clear cache for this book
        self.cache.clear_book(book_id);
    }

    /// Returns `true` if a renderer for the book is currently open in any of
    /// the per-format renderer maps.
    pub fn is_open(&self, book_id: i64) -> bool {
        if self.epub_renderers.lock().unwrap().contains_key(&book_id) {
            return true;
        }
        if self.pdf_renderers.lock().unwrap().contains_key(&book_id) {
            return true;
        }
        if self.docx_renderers.lock().unwrap().contains_key(&book_id) {
            return true;
        }
        if self.mobi_renderers.lock().unwrap().contains_key(&book_id) {
            return true;
        }
        if self.fb2_renderers.lock().unwrap().contains_key(&book_id) {
            return true;
        }
        if self.html_renderers.lock().unwrap().contains_key(&book_id) {
            return true;
        }
        if self.txt_renderers.lock().unwrap().contains_key(&book_id) {
            return true;
        }
        if self.md_renderers.lock().unwrap().contains_key(&book_id) {
            return true;
        }
        false
    }

    /// Lazy-open a book from the database if it isn't already open.
    ///
    /// This closes the race between the frontend firing `get_book_toc` /
    /// `get_book_chapter` immediately and `open_book_renderer` finishing its
    /// blocking adapter load. When no renderer is registered yet, the book's
    /// `file_path` / `file_format` are read from the `books` table and
    /// [`Self::open_book`] is called. Open failures are logged and swallowed:
    /// callers fall through to the actual query, which then produces the
    /// proper error (e.g. `BookNotFound`).
    pub fn open_if_needed(&self, db: &crate::db::Database, book_id: i64) -> Result<()> {
        if self.is_open(book_id) {
            return Ok(());
        }

        let conn = db.get_connection().map_err(|_| {
            ShioriError::BookNotFound(format!("Book {} not opened", book_id))
        })?;
        let row: rusqlite::Result<(String, String)> = conn.query_row(
            "SELECT file_path, file_format FROM books WHERE id = ?1",
            rusqlite::params![book_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );
        let (path, format) = match row {
            Ok(row) => row,
            Err(_) => {
                return Err(ShioriError::BookNotFound(format!(
                    "Book {} not opened",
                    book_id
                )))
            }
        };

        match self.open_book(book_id, &path, &format) {
            Ok(_) => Ok(()),
            Err(e) => {
                log::debug!(
                    "[RenderingService::open_if_needed] lazy open failed for book {}: {}",
                    book_id,
                    e
                );
                Ok(())
            }
        }
    }

    /// Get table of contents for a book
    pub fn get_toc(&self, book_id: i64) -> Result<Vec<TocEntry>> {
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

        // Try FB2
        if let Some(adapter) = self.fb2_renderers.lock().unwrap().get(&book_id) {
            return adapter.get_toc();
        }

        // Try HTML
        if let Some(adapter) = self.html_renderers.lock().unwrap().get(&book_id) {
            return adapter.get_toc();
        }

        // Try TXT
        if let Some(adapter) = self.txt_renderers.lock().unwrap().get(&book_id) {
            return adapter.get_toc();
        }

        // Try Markdown
        if let Some(adapter) = self.md_renderers.lock().unwrap().get(&book_id) {
            return adapter.get_toc();
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened",
            book_id
        )))
    }

    /// Get a chapter with caching
    pub fn get_chapter(&self, book_id: i64, chapter_index: usize) -> Result<Chapter> {
        log::debug!(
            "[RenderingService::get_chapter] book_id={} chapter_index={}",
            book_id,
            chapter_index
        );

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

        // Try to fetch from renderer - check EPUB first
        let chapter = {
            let epub_renderers = self.epub_renderers.lock().unwrap();
            if let Some(adapter) = epub_renderers.get(&book_id) {
                let result = adapter.get_chapter(chapter_index);
                drop(epub_renderers); // Release lock before checking result
                result?
            } else {
                drop(epub_renderers); // Release EPUB lock before trying PDF

                // Try PDF renderer
                let pdf_renderers = self.pdf_renderers.lock().unwrap();
                if let Some(adapter) = pdf_renderers.get(&book_id) {
                    let result = adapter.get_chapter(chapter_index);
                    drop(pdf_renderers); // Release lock before checking result
                    result?
                } else {
                    drop(pdf_renderers);

                    // Try DOCX renderer
                    let docx_renderers = self.docx_renderers.lock().unwrap();
                    if let Some(adapter) = docx_renderers.get(&book_id) {
                        let result = adapter.get_chapter(chapter_index);
                        drop(docx_renderers);
                        result?
                    } else {
                        drop(docx_renderers);

                        // Try MOBI renderer
                        let mobi_renderers = self.mobi_renderers.lock().unwrap();
                        if let Some(adapter) = mobi_renderers.get(&book_id) {
                            let result = adapter.get_chapter(chapter_index);
                            drop(mobi_renderers);
                            result?
                        } else {
                            drop(mobi_renderers);

                            let fb2_renderers = self.fb2_renderers.lock().unwrap();
                            if let Some(adapter) = fb2_renderers.get(&book_id) {
                                let result = adapter.get_chapter(chapter_index);
                                drop(fb2_renderers);
                                result?
                            } else {
                                drop(fb2_renderers);

                                let html_renderers = self.html_renderers.lock().unwrap();
                                if let Some(adapter) = html_renderers.get(&book_id) {
                                    let result = adapter.get_chapter(chapter_index);
                                    drop(html_renderers);
                                    result?
                                } else {
                                    drop(html_renderers);

                                    let txt_renderers = self.txt_renderers.lock().unwrap();
                                    if let Some(adapter) = txt_renderers.get(&book_id) {
                                        let result = adapter.get_chapter(chapter_index);
                                        drop(txt_renderers);
                                        result?
                                    } else {
                                        drop(txt_renderers);

                                        let md_renderers = self.md_renderers.lock().unwrap();
                                        if let Some(adapter) = md_renderers.get(&book_id) {
                                            let result = adapter.get_chapter(chapter_index);
                                            drop(md_renderers);
                                            result?
                                        } else {
                                            return Err(ShioriError::BookNotFound(format!(
                                                "Book {} not opened",
                                                book_id
                                            )));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };

        // Cache the result
        self.cache
            .put(cache_key, CachedContent::Html(chapter.content.clone()));

        // Adjacent full-HTML preloads are desktop-only. Android keeps one
        // chapter request at a time to avoid duplicating large EPUB strings.
        #[cfg(not(target_os = "android"))]
        self.preload_adjacent_chapters(book_id, chapter_index);

        Ok(chapter)
    }

    /// Get chapter count
    pub fn get_chapter_count(&self, book_id: i64) -> Result<usize> {
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

        if let Some(adapter) = self.fb2_renderers.lock().unwrap().get(&book_id) {
            return Ok(adapter.chapter_count());
        }

        if let Some(adapter) = self.html_renderers.lock().unwrap().get(&book_id) {
            return Ok(adapter.chapter_count());
        }

        if let Some(adapter) = self.txt_renderers.lock().unwrap().get(&book_id) {
            return Ok(adapter.chapter_count());
        }

        if let Some(adapter) = self.md_renderers.lock().unwrap().get(&book_id) {
            return Ok(adapter.chapter_count());
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened",
            book_id
        )))
    }

    /// Search within a book
    pub fn search_book(&self, book_id: i64, query: &str) -> Result<Vec<SearchResult>> {
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

        if let Some(adapter) = self.fb2_renderers.lock().unwrap().get(&book_id) {
            return adapter.search(query);
        }

        if let Some(adapter) = self.html_renderers.lock().unwrap().get(&book_id) {
            return adapter.search(query);
        }

        if let Some(adapter) = self.txt_renderers.lock().unwrap().get(&book_id) {
            return adapter.search(query);
        }

        if let Some(adapter) = self.md_renderers.lock().unwrap().get(&book_id) {
            return adapter.search(query);
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened",
            book_id
        )))
    }

    /// Get a resource (image, CSS, font) from an EPUB
    pub fn get_epub_resource(&self, book_id: i64, resource_path: &str) -> Result<Vec<u8>> {
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
                } else if let Some(adapter) = self.fb2_renderers.lock().unwrap().get(&book_id) {
                    if let Ok(chapter) = adapter.get_chapter(next_index) {
                        self.cache
                            .put(cache_key, CachedContent::Html(chapter.content.clone()));
                    }
                } else if let Some(adapter) = self.html_renderers.lock().unwrap().get(&book_id) {
                    if let Ok(chapter) = adapter.get_chapter(next_index) {
                        self.cache
                            .put(cache_key, CachedContent::Html(chapter.content.clone()));
                    }
                } else if let Some(adapter) = self.txt_renderers.lock().unwrap().get(&book_id) {
                    if let Ok(chapter) = adapter.get_chapter(next_index) {
                        self.cache
                            .put(cache_key, CachedContent::Html(chapter.content.clone()));
                    }
                } else if let Some(adapter) = self.md_renderers.lock().unwrap().get(&book_id) {
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
    pub fn render_page(&self, book_id: i64, page_index: usize, scale: f32) -> Result<Vec<u8>> {
        if let Some(adapter) = self.pdf_renderers.lock().unwrap().get(&book_id) {
            return tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current()
                    .block_on(async { adapter.render_page(page_index, scale).await })
            });
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened or doesn't support page rendering",
            book_id
        )))
    }

    /// Get native page dimensions (width, height) at 1.0 scale
    pub fn get_page_dimensions(&self, book_id: i64, page_index: usize) -> Result<(f32, f32)> {
        if let Some(adapter) = self.pdf_renderers.lock().unwrap().get(&book_id) {
            return adapter.get_page_dimensions(page_index);
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened or doesn't support dimension querying",
            book_id
        )))
    }
}
