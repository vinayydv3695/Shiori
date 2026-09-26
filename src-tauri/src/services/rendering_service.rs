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
    // Store active renderers per book. Each adapter lives behind its own
    // `Mutex` (not cloneable — EPUB/PDF/etc. hold big file-backed state),
    // so the per-format map lock is only ever held to clone the
    // `Arc<Mutex<Adapter>>` handle (`take_adapter`), and a heavy parse
    // holds just that book's lock — no longer every reader of the format.
    epub_renderers: Arc<Mutex<HashMap<i64, Arc<Mutex<EpubAdapter>>>>>,
    pdf_renderers: Arc<Mutex<HashMap<i64, Arc<Mutex<PdfAdapter>>>>>,
    docx_renderers: Arc<Mutex<HashMap<i64, Arc<Mutex<DocxAdapter>>>>>,
    mobi_renderers: Arc<Mutex<HashMap<i64, Arc<Mutex<MobiAdapter>>>>>,
    fb2_renderers: Arc<Mutex<HashMap<i64, Arc<Mutex<Fb2ReaderAdapter>>>>>,
    html_renderers: Arc<Mutex<HashMap<i64, Arc<Mutex<HtmlReaderAdapter>>>>>,
    txt_renderers: Arc<Mutex<HashMap<i64, Arc<Mutex<TxtReaderAdapter>>>>>,
    md_renderers: Arc<Mutex<HashMap<i64, Arc<Mutex<MarkdownReaderAdapter>>>>>,
}

/// Acquire a renderer mutex, recovering from poisoning.
///
/// `std::sync::Mutex` poisons itself if the guarded code panics; without
/// recovery every later `.lock().unwrap()` would panic in turn and brick the
/// format for the whole session. `into_inner()` hands back the guard, so one
/// bad parse can only degrade that adapter, never kill it.
fn lock_poison_ok<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Look up a book's adapter handle under a *short* map lock and drop the
/// map guard before returning, so the heavy parse that follows runs against
/// the book's own `Arc<Mutex<Adapter>>` and serializes only readers of that
/// same book — not every reader of the format.
fn take_adapter<A>(map: &Mutex<HashMap<i64, Arc<Mutex<A>>>>, book_id: i64) -> Option<Arc<Mutex<A>>> {
    lock_poison_ok(map).get(&book_id).cloned()
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

    /// Open a book and prepare it for rendering (sync entry point).
    ///
    /// Call this from blocking contexts (e.g. `spawn_blocking` closures,
    /// sync tests). The async adapter load is offloaded via `block_in_place`,
    /// which is a no-op on the blocking thread pool and hands the worker core
    /// off when invoked from a multi-threaded runtime worker. Async Tauri
    /// commands should use [`Self::open_book_async`] instead so the heavy IO
    /// stays on the blocking pool at the async boundary.
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
                    let mut renderers = lock_poison_ok(&self.epub_renderers);
                    renderers.insert(book_id, Arc::new(Mutex::new(adapter)));
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
                    let mut renderers = lock_poison_ok(&self.pdf_renderers);
                    renderers.insert(book_id, Arc::new(Mutex::new(adapter)));
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
                    let mut renderers = lock_poison_ok(&self.docx_renderers);
                    renderers.insert(book_id, Arc::new(Mutex::new(adapter)));
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
                    let mut renderers = lock_poison_ok(&self.mobi_renderers);
                    renderers.insert(book_id, Arc::new(Mutex::new(adapter)));
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
                    let mut renderers = lock_poison_ok(&self.fb2_renderers);
                    renderers.insert(book_id, Arc::new(Mutex::new(adapter)));
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
                    let mut renderers = lock_poison_ok(&self.html_renderers);
                    renderers.insert(book_id, Arc::new(Mutex::new(adapter)));
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
                    let mut renderers = lock_poison_ok(&self.txt_renderers);
                    renderers.insert(book_id, Arc::new(Mutex::new(adapter)));
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
                    let mut renderers = lock_poison_ok(&self.md_renderers);
                    renderers.insert(book_id, Arc::new(Mutex::new(adapter)));
                }
                Ok(metadata)
            }
            _ => Err(ShioriError::UnsupportedFormat {
                format: format.to_string(),
                path: path.to_string(),
            }),
        }
    }

    /// Async variant of [`Self::open_book`] for Tauri commands.
    ///
    /// The whole blocking open (adapter construction + load + metadata) is
    /// moved onto the Tokio blocking thread pool via `spawn_blocking` so it
    /// never occupies an async worker thread. Requires an `Arc<Self>` because
    /// the blocking task must outlive the call.
    pub async fn open_book_async(
        self: &Arc<Self>,
        book_id: i64,
        path: &str,
        format: &str,
    ) -> Result<BookMetadata> {
        let this = self.clone();
        let path = path.to_string();
        let format = format.to_string();
        tokio::task::spawn_blocking(move || this.open_book(book_id, &path, &format))
            .await
            .map_err(|e| ShioriError::Other(format!("Task panicked: {}", e)))?
    }

    /// Close a book and free resources
    pub fn close_book(&self, book_id: i64) {
        let mut epub_renderers = lock_poison_ok(&self.epub_renderers);
        epub_renderers.remove(&book_id);

        let mut pdf_renderers = lock_poison_ok(&self.pdf_renderers);
        pdf_renderers.remove(&book_id);

        let mut docx_renderers = lock_poison_ok(&self.docx_renderers);
        docx_renderers.remove(&book_id);

        let mut mobi_renderers = lock_poison_ok(&self.mobi_renderers);
        mobi_renderers.remove(&book_id);

        let mut fb2_renderers = lock_poison_ok(&self.fb2_renderers);
        fb2_renderers.remove(&book_id);

        let mut html_renderers = lock_poison_ok(&self.html_renderers);
        html_renderers.remove(&book_id);

        let mut txt_renderers = lock_poison_ok(&self.txt_renderers);
        txt_renderers.remove(&book_id);

        let mut md_renderers = lock_poison_ok(&self.md_renderers);
        md_renderers.remove(&book_id);

        // Clear cache for this book
        self.cache.clear_book(book_id);
    }

    /// Returns `true` if a renderer for the book is currently open in any of
    /// the per-format renderer maps.
    pub fn is_open(&self, book_id: i64) -> bool {
        if lock_poison_ok(&self.epub_renderers).contains_key(&book_id) {
            return true;
        }
        if lock_poison_ok(&self.pdf_renderers).contains_key(&book_id) {
            return true;
        }
        if lock_poison_ok(&self.docx_renderers).contains_key(&book_id) {
            return true;
        }
        if lock_poison_ok(&self.mobi_renderers).contains_key(&book_id) {
            return true;
        }
        if lock_poison_ok(&self.fb2_renderers).contains_key(&book_id) {
            return true;
        }
        if lock_poison_ok(&self.html_renderers).contains_key(&book_id) {
            return true;
        }
        if lock_poison_ok(&self.txt_renderers).contains_key(&book_id) {
            return true;
        }
        if lock_poison_ok(&self.md_renderers).contains_key(&book_id) {
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
        // Try EPUB first — clone the book's `Arc<Mutex<Adapter>>` under a
        // short map lock (dropped inside `take_adapter`), then parse under
        // only this book's mutex, recovered via `lock_poison_ok`.
        if let Some(adapter) = take_adapter(&self.epub_renderers, book_id) {
            return lock_poison_ok(&adapter).get_toc();
        }

        // Try PDF
        if let Some(adapter) = take_adapter(&self.pdf_renderers, book_id) {
            return lock_poison_ok(&adapter).get_toc();
        }

        // Try DOCX
        if let Some(adapter) = take_adapter(&self.docx_renderers, book_id) {
            return lock_poison_ok(&adapter).get_toc();
        }

        // Try MOBI
        if let Some(adapter) = take_adapter(&self.mobi_renderers, book_id) {
            return lock_poison_ok(&adapter).get_toc();
        }

        // Try FB2
        if let Some(adapter) = take_adapter(&self.fb2_renderers, book_id) {
            return lock_poison_ok(&adapter).get_toc();
        }

        // Try HTML
        if let Some(adapter) = take_adapter(&self.html_renderers, book_id) {
            return lock_poison_ok(&adapter).get_toc();
        }

        // Try TXT
        if let Some(adapter) = take_adapter(&self.txt_renderers, book_id) {
            return lock_poison_ok(&adapter).get_toc();
        }

        // Try Markdown
        if let Some(adapter) = take_adapter(&self.md_renderers, book_id) {
            return lock_poison_ok(&adapter).get_toc();
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

        // Try to fetch from renderer — EPUB first, then the other formats.
        // Each lookup clones the book's `Arc<Mutex<Adapter>>` handle under a
        // short map lock and drops it before parsing (`take_adapter`), so a
        // slow chapter parse never holds the per-format map lock; it only
        // serializes readers of the same book under that book's own mutex.
        let chapter = match take_adapter(&self.epub_renderers, book_id) {
            Some(adapter) => lock_poison_ok(&adapter).get_chapter(chapter_index),
            None => match take_adapter(&self.pdf_renderers, book_id) {
                Some(adapter) => lock_poison_ok(&adapter).get_chapter(chapter_index),
                None => match take_adapter(&self.docx_renderers, book_id) {
                    Some(adapter) => lock_poison_ok(&adapter).get_chapter(chapter_index),
                    None => match take_adapter(&self.mobi_renderers, book_id) {
                        Some(adapter) => lock_poison_ok(&adapter).get_chapter(chapter_index),
                        None => match take_adapter(&self.fb2_renderers, book_id) {
                            Some(adapter) => lock_poison_ok(&adapter).get_chapter(chapter_index),
                            None => match take_adapter(&self.html_renderers, book_id) {
                                Some(adapter) => lock_poison_ok(&adapter).get_chapter(chapter_index),
                                None => match take_adapter(&self.txt_renderers, book_id) {
                                    Some(adapter) => lock_poison_ok(&adapter).get_chapter(chapter_index),
                                    None => match take_adapter(&self.md_renderers, book_id) {
                                        Some(adapter) => {
                                            lock_poison_ok(&adapter).get_chapter(chapter_index)
                                        }
                                        None => {
                                            return Err(ShioriError::BookNotFound(format!(
                                                "Book {} not opened",
                                                book_id
                                            )))
                                        }
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }?;

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
        if let Some(adapter) = take_adapter(&self.epub_renderers, book_id) {
            return Ok(lock_poison_ok(&adapter).chapter_count());
        }

        if let Some(adapter) = take_adapter(&self.pdf_renderers, book_id) {
            return Ok(lock_poison_ok(&adapter).chapter_count());
        }

        if let Some(adapter) = take_adapter(&self.docx_renderers, book_id) {
            return Ok(lock_poison_ok(&adapter).chapter_count());
        }

        if let Some(adapter) = take_adapter(&self.mobi_renderers, book_id) {
            return Ok(lock_poison_ok(&adapter).chapter_count());
        }

        if let Some(adapter) = take_adapter(&self.fb2_renderers, book_id) {
            return Ok(lock_poison_ok(&adapter).chapter_count());
        }

        if let Some(adapter) = take_adapter(&self.html_renderers, book_id) {
            return Ok(lock_poison_ok(&adapter).chapter_count());
        }

        if let Some(adapter) = take_adapter(&self.txt_renderers, book_id) {
            return Ok(lock_poison_ok(&adapter).chapter_count());
        }

        if let Some(adapter) = take_adapter(&self.md_renderers, book_id) {
            return Ok(lock_poison_ok(&adapter).chapter_count());
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened",
            book_id
        )))
    }

    /// Search within a book
    pub fn search_book(&self, book_id: i64, query: &str) -> Result<Vec<SearchResult>> {
        if let Some(adapter) = take_adapter(&self.epub_renderers, book_id) {
            return lock_poison_ok(&adapter).search(query);
        }

        if let Some(adapter) = take_adapter(&self.pdf_renderers, book_id) {
            return lock_poison_ok(&adapter).search(query);
        }

        if let Some(adapter) = take_adapter(&self.docx_renderers, book_id) {
            return lock_poison_ok(&adapter).search(query);
        }

        if let Some(adapter) = take_adapter(&self.mobi_renderers, book_id) {
            return lock_poison_ok(&adapter).search(query);
        }

        if let Some(adapter) = take_adapter(&self.fb2_renderers, book_id) {
            return lock_poison_ok(&adapter).search(query);
        }

        if let Some(adapter) = take_adapter(&self.html_renderers, book_id) {
            return lock_poison_ok(&adapter).search(query);
        }

        if let Some(adapter) = take_adapter(&self.txt_renderers, book_id) {
            return lock_poison_ok(&adapter).search(query);
        }

        if let Some(adapter) = take_adapter(&self.md_renderers, book_id) {
            return lock_poison_ok(&adapter).search(query);
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened",
            book_id
        )))
    }

    /// Get a resource (image, CSS, font) from an EPUB
    pub fn get_epub_resource(&self, book_id: i64, resource_path: &str) -> Result<Vec<u8>> {
        if let Some(adapter) = take_adapter(&self.epub_renderers, book_id) {
            return lock_poison_ok(&adapter).get_resource(resource_path);
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened",
            book_id
        )))
    }

    /// Intrinsic `(path, width, height)` read from image headers to reserve layout space and prevent reflow.
    pub fn get_epub_image_sizes(
        &self,
        book_id: i64,
        paths: &[String],
    ) -> Vec<(String, u32, u32)> {
        let Some(adapter) = take_adapter(&self.epub_renderers, book_id) else {
            return Vec::new();
        };
        let adapter = lock_poison_ok(&adapter);
        let mut out = Vec::with_capacity(paths.len());
        for p in paths {
            let Ok(bytes) = adapter.get_resource(p) else {
                continue;
            };
            if let Ok(reader) =
                image::ImageReader::new(std::io::Cursor::new(&bytes)).with_guessed_format()
            {
                if let Ok((w, h)) = reader.into_dimensions() {
                    if w > 0 && h > 0 {
                        out.push((p.clone(), w, h));
                    }
                }
            }
        }
        out
    }

    /// Preload adjacent chapters for smoother navigation. Desktop-only — its
    /// sole caller is `#[cfg(not(target_os = "android"))]`, so gate the method
    /// the same way to avoid a dead-code warning on Android builds.
    #[cfg(not(target_os = "android"))]
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
                if let Some(adapter) = take_adapter(&self.epub_renderers, book_id) {
                    if let Ok(chapter) = lock_poison_ok(&adapter).get_chapter(next_index) {
                        self.cache
                            .put(cache_key, CachedContent::Html(chapter.content.clone()));
                    }
                } else if let Some(adapter) = take_adapter(&self.pdf_renderers, book_id) {
                    if let Ok(chapter) = lock_poison_ok(&adapter).get_chapter(next_index) {
                        self.cache
                            .put(cache_key, CachedContent::Html(chapter.content.clone()));
                    }
                } else if let Some(adapter) = take_adapter(&self.docx_renderers, book_id) {
                    if let Ok(chapter) = lock_poison_ok(&adapter).get_chapter(next_index) {
                        self.cache
                            .put(cache_key, CachedContent::Html(chapter.content.clone()));
                    }
                } else if let Some(adapter) = take_adapter(&self.mobi_renderers, book_id) {
                    if let Ok(chapter) = lock_poison_ok(&adapter).get_chapter(next_index) {
                        self.cache
                            .put(cache_key, CachedContent::Html(chapter.content.clone()));
                    }
                } else if let Some(adapter) = take_adapter(&self.fb2_renderers, book_id) {
                    if let Ok(chapter) = lock_poison_ok(&adapter).get_chapter(next_index) {
                        self.cache
                            .put(cache_key, CachedContent::Html(chapter.content.clone()));
                    }
                } else if let Some(adapter) = take_adapter(&self.html_renderers, book_id) {
                    if let Ok(chapter) = lock_poison_ok(&adapter).get_chapter(next_index) {
                        self.cache
                            .put(cache_key, CachedContent::Html(chapter.content.clone()));
                    }
                } else if let Some(adapter) = take_adapter(&self.txt_renderers, book_id) {
                    if let Ok(chapter) = lock_poison_ok(&adapter).get_chapter(next_index) {
                        self.cache
                            .put(cache_key, CachedContent::Html(chapter.content.clone()));
                    }
                } else if let Some(adapter) = take_adapter(&self.md_renderers, book_id) {
                    if let Ok(chapter) = lock_poison_ok(&adapter).get_chapter(next_index) {
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

    /// Render a specific page as a PNG image Buffer (for native PDF/image
    /// books). Sync entry point for blocking contexts; the async PDF page
    /// rasterization is offloaded via `block_in_place` where it runs.
    pub fn render_page(&self, book_id: i64, page_index: usize, scale: f32) -> Result<Vec<u8>> {
        if let Some(adapter) = take_adapter(&self.pdf_renderers, book_id) {
            return tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current()
                    .block_on(async { lock_poison_ok(&adapter).render_page(page_index, scale).await })
            });
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened or doesn't support page rendering",
            book_id
        )))
    }

    /// Async variant of [`Self::render_page`] for Tauri commands; runs the
    /// page rasterization on the Tokio blocking thread pool.
    pub async fn render_page_async(
        self: &Arc<Self>,
        book_id: i64,
        page_index: usize,
        scale: f32,
    ) -> Result<Vec<u8>> {
        let this = self.clone();
        tokio::task::spawn_blocking(move || this.render_page(book_id, page_index, scale))
            .await
            .map_err(|e| ShioriError::Other(format!("Task panicked: {}", e)))?
    }

    /// Get native page dimensions (width, height) at 1.0 scale
    pub fn get_page_dimensions(&self, book_id: i64, page_index: usize) -> Result<(f32, f32)> {
        if let Some(adapter) = take_adapter(&self.pdf_renderers, book_id) {
            return lock_poison_ok(&adapter).get_page_dimensions(page_index);
        }

        Err(ShioriError::BookNotFound(format!(
            "Book {} not opened or doesn't support dimension querying",
            book_id
        )))
    }
}
