/// Manga Service — manages open manga archives (CBZ/CBR)
///
/// Thread-safe service for extracting and caching manga page images.
/// Uses natural sort for page ordering and optional image downscaling.
use crate::error::{Result, ShioriError};
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::sync::{Arc, Mutex};
use zip::ZipArchive;

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

#[derive(serde::Serialize, Clone)]
pub struct MangaMetadata {
    pub title: String,
    pub page_count: usize,
    pub has_comic_info: bool,
    pub series: Option<String>,
    pub volume: Option<u32>,
    pub writer: Option<String>,
    pub page_dimensions: Vec<(u32, u32)>,
}

#[allow(dead_code)]
struct OpenManga {
    file_path: String,
    /// Persistent archive handle (slice F4): opened once in `open()` and reused
    /// for every page read. The old path re-opened the file and re-parsed the
    /// ZIP central directory for each page (and each preload). Reads briefly
    /// lock this; the lock is never held across an await.
    archive: Arc<Mutex<ZipArchive<std::fs::File>>>,
    sorted_pages: Vec<String>,
    page_dimensions: Vec<(u32, u32)>,
    title: String,
    has_comic_info: bool,
    series: Option<String>,
    volume: Option<u32>,
    writer: Option<String>,
}

/// LRU-ish page cache entry
struct CachedPage {
    data: Vec<u8>,
    last_access: std::time::Instant,
}

// ═══════════════════════════════════════════════════════════
// NATURAL SORT
// ═══════════════════════════════════════════════════════════

/// Generate a sort key that handles embedded numbers naturally.
/// "page2.jpg" < "page10.jpg" (unlike lexicographic sort)
fn natural_sort_key(s: &str) -> Vec<NaturalChunk> {
    let mut chunks = Vec::new();
    let mut chars = s.chars().peekable();

    while chars.peek().is_some() {
        if chars.peek().map_or(false, |c| c.is_ascii_digit()) {
            // Collect digit run
            let mut num_str = String::new();
            while chars.peek().map_or(false, |c| c.is_ascii_digit()) {
                num_str.push(chars.next().unwrap());
            }
            let num: u64 = num_str.parse().unwrap_or(0);
            chunks.push(NaturalChunk::Number(num));
        } else {
            // Collect non-digit run (case-insensitive)
            let mut text = String::new();
            while chars.peek().map_or(false, |c| !c.is_ascii_digit()) {
                text.push(chars.next().unwrap().to_ascii_lowercase());
            }
            chunks.push(NaturalChunk::Text(text));
        }
    }
    chunks
}

#[derive(PartialEq, Eq, PartialOrd, Ord)]
enum NaturalChunk {
    Text(String),
    Number(u64),
}

/// Check if filename is an image (matches CbzFormatAdapter::is_image_file)
fn is_image_file(filename: &str) -> bool {
    let lower = filename.to_lowercase();
    lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".png")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".bmp")
}

// ═══════════════════════════════════════════════════════════
// MANGA SERVICE
// ═══════════════════════════════════════════════════════════

pub struct MangaService {
    open_books: Mutex<HashMap<i64, OpenManga>>,
    page_cache: Mutex<HashMap<(i64, usize, u32), CachedPage>>,
    /// file_path -> content hash (slice F4): the reader path needs the hash to
    /// key its on-disk page cache; caching it here removes one SQLite checkout
    /// + query per rendered page. Keyed by path (not rowid) because rowids are
    /// recycled after deletion.
    file_hash_cache: Mutex<HashMap<String, String>>,
    max_cache_entries: usize,
    max_cache_bytes: usize,
}

impl MangaService {
    pub fn new() -> Self {
        Self {
            open_books: Mutex::new(HashMap::new()),
            page_cache: Mutex::new(HashMap::new()),
            file_hash_cache: Mutex::new(HashMap::new()),
            max_cache_entries: 100,
            max_cache_bytes: 200 * 1024 * 1024, // 200MB
        }
    }

    /// Open a manga archive and prepare it for reading
    pub fn open(&self, book_id: i64, path: &str) -> Result<MangaMetadata> {
        println!("\n=== OPEN_MANGA ===");
        println!("book_id: {}, path: {}", book_id, path);

        // Read ZIP dynamically instead of putting entire file in RAM
        let file = std::fs::File::open(path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                ShioriError::FileNotFound {
                    path: path.to_string(),
                }
            } else {
                ShioriError::Io(e)
            }
        })?;

        let mut archive = ZipArchive::new(file)
            .map_err(|e| ShioriError::InvalidFormat(format!("Invalid CBZ/ZIP file: {}", e)))?;

        // Collect and naturally sort image filenames
        let mut image_files: Vec<String> = Vec::new();
        for i in 0..archive.len() {
            if let Ok(file) = archive.by_index(i) {
                let name = file.name().to_string();
                if is_image_file(&name) {
                    image_files.push(name);
                }
            }
        }

        image_files.sort_by(|a, b| natural_sort_key(a).cmp(&natural_sort_key(b)));

        if image_files.is_empty() {
            return Err(ShioriError::InvalidFormat(
                "No image files found in manga archive".to_string(),
            ));
        }

        let page_count = image_files.len();
        println!("Found {} pages", page_count);

        // Skip upfront dimension extraction for all pages — too expensive
        // for large manga (would load all images into memory).
        // Dimensions are loaded lazily via get_page_dimensions when needed.
        let page_dimensions = vec![(800u32, 1200u32); page_count];

        // Extract title from filename
        let title = std::path::Path::new(path)
            .file_stem()
            .map(|s| s.to_string_lossy().replace('_', " "))
            .unwrap_or_else(|| "Unknown Manga".to_string());

        // Try to parse ComicInfo.xml
        let (has_comic_info, series, volume, writer) = Self::try_parse_comic_info(&mut archive);

        let metadata = MangaMetadata {
            title: title.clone(),
            page_count,
            has_comic_info,
            series: series.clone(),
            volume,
            writer: writer.clone(),
            page_dimensions: page_dimensions.clone(),
        };

        // Store open manga
        let open_manga = OpenManga {
            file_path: path.to_string(),
            archive: Arc::new(Mutex::new(archive)),
            sorted_pages: image_files,
            page_dimensions,
            title,
            has_comic_info,
            series,
            volume,
            writer,
        };

        self.open_books.lock().unwrap().insert(book_id, open_manga);

        println!("✅ Manga opened: {} pages", page_count);
        println!("==================\n");

        Ok(metadata)
    }

    /// Get a single page image, optionally downscaled (Async for spawn_blocking)
    pub async fn get_page(
        &self,
        book_id: i64,
        page_index: usize,
        max_dimension: u32,
    ) -> Result<Vec<u8>> {
        // Check cache first
        let cache_key = (book_id, page_index, max_dimension);
        {
            let mut cache = self.page_cache.lock().unwrap();
            if let Some(entry) = cache.get_mut(&cache_key) {
                entry.last_access = std::time::Instant::now();
                return Ok(entry.data.clone());
            }
        }

        // Resolve the persistent archive handle + page name under a short
        // lock, then release it before doing any I/O (slice F4).
        let (archive, page_name) = {
            let books = self.open_books.lock().unwrap();
            let manga = books
                .get(&book_id)
                .ok_or_else(|| ShioriError::BookNotFound(format!("Manga {} not open", book_id)))?;

            if page_index >= manga.sorted_pages.len() {
                return Err(ShioriError::Other(format!(
                    "Page index {} out of range (total: {})",
                    page_index,
                    manga.sorted_pages.len()
                )));
            }

            (
                Arc::clone(&manga.archive),
                manga.sorted_pages[page_index].clone(),
            )
        };

        // One blocking task for extract + optional resize (slice F4): the old
        // path re-opened and re-parsed the ZIP per page and used two separate
        // spawn_blocking hops. The archive lock is held only for the read.
        let result_bytes = tokio::task::spawn_blocking(move || -> Result<Vec<u8>> {
            let image_bytes = {
                let mut archive = archive
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let mut zip_file = archive.by_name(&page_name).map_err(|e| {
                    ShioriError::Other(format!("Page '{}' not found in archive: {}", page_name, e))
                })?;

                let mut bytes = Vec::with_capacity(zip_file.size() as usize);
                std::io::Read::read_to_end(&mut zip_file, &mut bytes)
                    .map_err(|e| ShioriError::Other(format!("Failed to read page: {}", e)))?;
                bytes
            };

            if max_dimension == 0 {
                return Ok(image_bytes);
            }

            let reader = image::ImageReader::new(Cursor::new(&image_bytes))
                .with_guessed_format()
                .map_err(|e| ShioriError::Other(e.to_string()))?;

            let img = reader
                .decode()
                .map_err(|e| ShioriError::Other(e.to_string()))?;

            let width = img.width();
            let height = img.height();

            if width <= max_dimension && height <= max_dimension {
                return Ok(image_bytes);
            }

            let resized = img.resize(
                max_dimension,
                max_dimension,
                image::imageops::FilterType::Triangle,
            );

            let mut out_bytes = Vec::new();
            resized
                .write_to(&mut Cursor::new(&mut out_bytes), image::ImageFormat::Jpeg)
                .map_err(|e| ShioriError::Other(e.to_string()))?;

            Ok(out_bytes)
        })
        .await
        .map_err(|e| ShioriError::Other(format!("Task Join Error: {}", e)))??;

        // Cache the result
        self.cache_page(cache_key, &result_bytes);

        Ok(result_bytes)
    }

    /// Preload pages into cache (fire-and-forget async)
    pub async fn preload_pages(
        &self,
        book_id: i64,
        page_indices: &[usize],
        max_dimension: u32,
    ) -> Result<()> {
        // Slice F4: bounded parallel preload (4 in flight). The old loop
        // awaited page-by-page, so preloading 5 pages took 5 sequential
        // extract+decode rounds.
        let mut pending: Vec<usize> = Vec::new();
        for &idx in page_indices {
            let cache_key = (book_id, idx, max_dimension);
            let cached = self
                .page_cache
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .contains_key(&cache_key);
            if !cached {
                pending.push(idx);
            }
        }

        use futures::stream::StreamExt as _;
        let mut stream = futures::stream::iter(
            pending
                .into_iter()
                .map(|idx| Self::load_page(self, book_id, idx, max_dimension)),
        )
        .buffer_unordered(4);
        // Best-effort: individual failures are ignored.
        while stream.next().await.is_some() {}
        Ok(())
    }

    /// Explicit async helper for `preload_pages`: a free-standing async fn
    /// keeps the future's lifetimes general enough for `buffer_unordered`,
    /// which a `|idx| self.get_page(..)` closure does not.
    async fn load_page(
        service: &MangaService,
        book_id: i64,
        page_index: usize,
        max_dimension: u32,
    ) -> Result<Vec<u8>> {
        service.get_page(book_id, page_index, max_dimension).await
    }

    /// Get page dimensions for given indices.
    /// Lazily computes real dimensions from the archive, caching them for future calls.
    pub fn get_page_dimensions(
        &self,
        book_id: i64,
        page_indices: &[usize],
    ) -> Result<Vec<(u32, u32)>> {
        let placeholder = (800u32, 1200u32);

        // Slice F4: do NOT decode image headers while holding the open_books
        // lock. Collect what needs resolving under the lock, release it, then
        // decode under the (short-lived) archive lock and store results after.
        let (archive, to_resolve) = {
            let books = self.open_books.lock().unwrap();
            let manga = books
                .get(&book_id)
                .ok_or_else(|| ShioriError::BookNotFound(format!("Manga {} not open", book_id)))?;
            let to_resolve: Vec<(usize, String)> = page_indices
                .iter()
                .copied()
                .filter(|&idx| {
                    idx < manga.page_dimensions.len() && manga.page_dimensions[idx] == placeholder
                })
                .filter_map(|idx| manga.sorted_pages.get(idx).map(|name| (idx, name.clone())))
                .collect();
            (Arc::clone(&manga.archive), to_resolve)
        };

        if !to_resolve.is_empty() {
            let mut resolved: Vec<(usize, (u32, u32))> = Vec::new();
            {
                let mut guard = archive.lock().unwrap_or_else(|e| e.into_inner());
                for (idx, name) in &to_resolve {
                    if let Some(dims) = Self::read_image_dimensions(&mut guard, name) {
                        resolved.push((*idx, dims));
                    }
                }
            }
            if !resolved.is_empty() {
                let mut books = self.open_books.lock().unwrap();
                if let Some(manga) = books.get_mut(&book_id) {
                    for (idx, dims) in resolved {
                        if idx < manga.page_dimensions.len() {
                            manga.page_dimensions[idx] = dims;
                        }
                    }
                }
            }
        }

        let books = self.open_books.lock().unwrap();
        let manga = books
            .get(&book_id)
            .ok_or_else(|| ShioriError::BookNotFound(format!("Manga {} not open", book_id)))?;
        let mut dims = Vec::with_capacity(page_indices.len());
        for &idx in page_indices {
            if idx < manga.page_dimensions.len() {
                dims.push(manga.page_dimensions[idx]);
            } else {
                dims.push(placeholder);
            }
        }
        Ok(dims)
    }

    /// Close a manga and free all associated resources
    pub fn close(&self, book_id: i64) {
        println!("[MangaService] Closing manga {}", book_id);

        // Remove open book
        self.open_books.lock().unwrap().remove(&book_id);

        // Evict all cache entries for this book
        let mut cache = self.page_cache.lock().unwrap();
        cache.retain(|key, _| key.0 != book_id);

        println!("[MangaService] Manga {} closed", book_id);
    }

    /// Filesystem path of an open manga (None when the book isn't open).
    /// Lets `get_manga_page_path` key its disk cache by content hash without
    /// a per-page DB query (slice F4).
    pub fn open_path(&self, book_id: i64) -> Option<String> {
        let books = self.open_books.lock().unwrap_or_else(|e| e.into_inner());
        books.get(&book_id).map(|m| m.file_path.clone())
    }

    /// Cached content hash for a book path (slice F4).
    pub fn cached_file_hash(&self, path: &str) -> Option<String> {
        self.file_hash_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(path)
            .cloned()
    }

    /// Cache a content hash for a book path. Bounded: cleared (not evicted
    /// one-by-one) once it exceeds 512 entries — the cache only needs to cover
    /// currently-open books and a little history.
    pub fn cache_file_hash(&self, path: String, hash: String) {
        let mut cache = self.file_hash_cache.lock().unwrap_or_else(|e| e.into_inner());
        if cache.len() > 512 {
            cache.clear();
        }
        cache.insert(path, hash);
    }

    // ─── Private helpers ───────────────────────────────────

    /// Read image dimensions from archive entry using header-only decode.
    /// Reads only the FIRST 64 KB of the decompressed entry — enough for the
    /// header of every common comic format (JPEG SOF can sit behind large
    /// EXIF blocks) — so resolving page dims never decompresses a full page
    /// into RAM.
    fn read_image_dimensions(
        archive: &mut ZipArchive<std::fs::File>,
        filename: &str,
    ) -> Option<(u32, u32)> {
        let file = archive.by_name(filename).ok()?;
        let mut buf = [0u8; 65536];
        let n = file.take(65536).read(&mut buf).ok()?;
        let buf = buf[..n].to_vec();

        if buf.is_empty() {
            return None;
        }

        // Header-only decode (fast — doesn't load full pixel data). The
        // full-decode fallback is gone: a 64 KB buffer cannot hold a full
        // page anyway, and header dims exist for every format we support.
        let reader = image::ImageReader::new(Cursor::new(&buf))
            .with_guessed_format()
            .ok()?;
        reader.into_dimensions().ok()
    }

    /// Cache a page, evicting LRU entries if over limits
    fn cache_page(&self, key: (i64, usize, u32), data: &[u8]) {
        let mut cache = self.page_cache.lock().unwrap();

        // Evict if over entry limit
        while cache.len() >= self.max_cache_entries {
            self.evict_oldest(&mut cache);
        }

        // Evict if over byte limit
        let total_bytes: usize = cache.values().map(|e| e.data.len()).sum();
        if total_bytes + data.len() > self.max_cache_bytes {
            // Evict until we have room
            let mut current_bytes = total_bytes;
            while current_bytes + data.len() > self.max_cache_bytes && !cache.is_empty() {
                if let Some(evicted_size) = self.evict_oldest(&mut cache) {
                    current_bytes -= evicted_size;
                } else {
                    break;
                }
            }
        }

        cache.insert(
            key,
            CachedPage {
                data: data.to_vec(),
                last_access: std::time::Instant::now(),
            },
        );
    }

    /// Evict the oldest cache entry, returns size of evicted entry
    fn evict_oldest(&self, cache: &mut HashMap<(i64, usize, u32), CachedPage>) -> Option<usize> {
        let oldest_key = cache
            .iter()
            .min_by_key(|(_, v)| v.last_access)
            .map(|(k, _)| *k)?;

        cache.remove(&oldest_key).map(|e| e.data.len())
    }

    /// Try to parse ComicInfo.xml from the archive
    fn try_parse_comic_info(
        archive: &mut ZipArchive<std::fs::File>,
    ) -> (bool, Option<String>, Option<u32>, Option<String>) {
        let mut xml_content = String::new();
        match archive.by_name("ComicInfo.xml") {
            Ok(mut file) => {
                if file.read_to_string(&mut xml_content).is_ok() {
                    // Basic XML parsing without adding a dependency
                    let series = Self::extract_xml_value(&xml_content, "Series");
                    let volume = Self::extract_xml_value(&xml_content, "Number")
                        .and_then(|s| s.parse::<u32>().ok());
                    let writer = Self::extract_xml_value(&xml_content, "Writer");
                    (true, series, volume, writer)
                } else {
                    (false, None, None, None)
                }
            }
            Err(_) => (false, None, None, None),
        }
    }

    /// Simple XML value extraction (no dependency needed for basic tags)
    fn extract_xml_value(xml: &str, tag: &str) -> Option<String> {
        let open_tag = format!("<{}>", tag);
        let close_tag = format!("</{}>", tag);
        if let Some(start) = xml.find(&open_tag) {
            let value_start = start + open_tag.len();
            if let Some(end) = xml[value_start..].find(&close_tag) {
                let value = xml[value_start..value_start + end].trim().to_string();
                if !value.is_empty() {
                    return Some(value);
                }
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// A tiny real PNG (2×3) via the image crate.
    fn tiny_png() -> Vec<u8> {
        let img = image::RgbaImage::from_pixel(2, 3, image::Rgba([0u8, 0, 255, 255]));
        let mut bytes = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        bytes
    }

    #[test]
    fn reads_dimensions_from_real_cbz_entry() {
        let dir = tempfile::Builder::new()
            .prefix("shiori_manga_test_")
            .tempdir()
            .unwrap();
        let cbz_path = dir.path().join("book.cbz");
        let file = std::fs::File::create(&cbz_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let opts: zip::write::FileOptions<()> = zip::write::FileOptions::default();
        let png = tiny_png();
        zip.start_file("page_001.png", opts).unwrap();
        zip.write_all(&png).unwrap();
        // A big dummy entry after the page — the bounded read must not touch it.
        zip.start_file("page_002.jpg", opts).unwrap();
        zip.write_all(&vec![0u8; 4096]).unwrap();
        zip.finish().unwrap();

        let file = std::fs::File::open(&cbz_path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let dims = MangaService::read_image_dimensions(&mut archive, "page_001.png");
        assert_eq!(dims, Some((2, 3)), "header-only dims from a real CBZ entry");
    }
}
