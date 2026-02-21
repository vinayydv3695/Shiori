/// Manga Service — manages open manga archives (CBZ/CBR)
///
/// Thread-safe service for extracting and caching manga page images.
/// Uses natural sort for page ordering and optional image downscaling.

use crate::error::{ShioriError, ShioriResult};
use image::GenericImageView;
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::sync::Mutex;
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

struct OpenManga {
    file_data: Vec<u8>,
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
    max_cache_entries: usize,
    max_cache_bytes: usize,
}

impl MangaService {
    pub fn new() -> Self {
        Self {
            open_books: Mutex::new(HashMap::new()),
            page_cache: Mutex::new(HashMap::new()),
            max_cache_entries: 100,
            max_cache_bytes: 200 * 1024 * 1024, // 200MB
        }
    }

    /// Open a manga archive and prepare it for reading
    pub fn open(&self, book_id: i64, path: &str) -> ShioriResult<MangaMetadata> {
        println!("\n=== OPEN_MANGA ===");
        println!("book_id: {}, path: {}", book_id, path);

        // Read entire file
        let file_data = std::fs::read(path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                ShioriError::FileNotFound {
                    path: path.to_string(),
                }
            } else {
                ShioriError::Io(e)
            }
        })?;

        // Parse ZIP
        let cursor = Cursor::new(&file_data);
        let mut archive = ZipArchive::new(cursor).map_err(|e| {
            ShioriError::InvalidFormat(format!("Invalid CBZ/ZIP file: {}", e))
        })?;

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

        image_files.sort_by(|a, b| {
            natural_sort_key(a).cmp(&natural_sort_key(b))
        });

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
        let (has_comic_info, series, volume, writer) =
            Self::try_parse_comic_info(&mut archive);

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
            file_data,
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
    ) -> ShioriResult<Vec<u8>> {
        // Check cache first
        let cache_key = (book_id, page_index, max_dimension);
        {
            let mut cache = self.page_cache.lock().unwrap();
            if let Some(entry) = cache.get_mut(&cache_key) {
                entry.last_access = std::time::Instant::now();
                return Ok(entry.data.clone());
            }
        }

        // Extract from archive
        // We drop the MutexGuard immediately after cloning what we need for the async boundary
        let (file_data, page_name) = {
            let books = self.open_books.lock().unwrap();
            let manga = books.get(&book_id).ok_or_else(|| {
                ShioriError::BookNotFound(format!("Manga {} not open", book_id))
            })?;

            if page_index >= manga.sorted_pages.len() {
                return Err(ShioriError::Other(format!(
                    "Page index {} out of range (total: {})",
                    page_index,
                    manga.sorted_pages.len()
                )));
            }

            (manga.file_data.clone(), manga.sorted_pages[page_index].clone())
        };

        // Extract image bytes from ZIP (can be CPU intensive for large zips, use spawn_blocking)
        let image_bytes = tokio::task::spawn_blocking(move || -> ShioriResult<Vec<u8>> {
            let cursor = Cursor::new(&file_data);
            let mut archive = ZipArchive::new(cursor).map_err(|e| {
                ShioriError::Other(format!("Failed to reopen archive: {}", e))
            })?;

            let mut file = archive.by_name(&page_name).map_err(|e| {
                ShioriError::Other(format!("Page '{}' not found in archive: {}", page_name, e))
            })?;

            let mut bytes = Vec::new();
            std::io::Read::read_to_end(&mut file, &mut bytes).map_err(|e| {
                ShioriError::Other(format!("Failed to read page: {}", e))
            })?;
            
            Ok(bytes)
        }).await.map_err(|e| ShioriError::Other(format!("Task Join Error: {}", e)))??;

        // Optionally downscale (Also in the blocking task to avoid dropping frames)
        let result_bytes = tokio::task::spawn_blocking(move || -> ShioriResult<Vec<u8>> {
             if max_dimension > 0 {
                 let reader = image::ImageReader::new(Cursor::new(&image_bytes))
                     .with_guessed_format()
                     .map_err(|e| ShioriError::Other(e.to_string()))?;
                     
                 let img = reader.decode()
                     .map_err(|e| ShioriError::Other(e.to_string()))?;
                     
                 let width = img.width();
                 let height = img.height();
                 
                 if width <= max_dimension && height <= max_dimension {
                     return Ok(image_bytes);
                 }
                 
                 let resized = img.resize(
                     max_dimension,
                     max_dimension,
                     image::imageops::FilterType::Lanczos3
                 );
                 
                 let mut out_bytes = Vec::new();
                 resized.write_to(&mut Cursor::new(&mut out_bytes), image::ImageFormat::Jpeg)
                     .map_err(|e| ShioriError::Other(e.to_string()))?;
                     
                 Ok(out_bytes)
             } else {
                 Ok(image_bytes)
             }
        }).await.map_err(|e| ShioriError::Other(format!("Task Join Error: {}", e)))??;

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
    ) -> ShioriResult<()> {
        for &idx in page_indices {
            let cache_key = (book_id, idx, max_dimension);
            // Skip if already cached
            {
                let cache = self.page_cache.lock().unwrap();
                if cache.contains_key(&cache_key) {
                    continue;
                }
            }
            // Load the page (which also caches it)
            let _ = self.get_page(book_id, idx, max_dimension).await;
        }
        Ok(())
    }

    /// Get page dimensions for given indices
    pub fn get_page_dimensions(
        &self,
        book_id: i64,
        page_indices: &[usize],
    ) -> ShioriResult<Vec<(u32, u32)>> {
        let books = self.open_books.lock().unwrap();
        let manga = books.get(&book_id).ok_or_else(|| {
            ShioriError::BookNotFound(format!("Manga {} not open", book_id))
        })?;

        let mut dims = Vec::with_capacity(page_indices.len());
        for &idx in page_indices {
            if idx < manga.page_dimensions.len() {
                dims.push(manga.page_dimensions[idx]);
            } else {
                dims.push((800, 1200)); // Fallback
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

    // ─── Private helpers ───────────────────────────────────

    /// Read image dimensions from archive entry (header-only decode)
    fn get_image_dimensions_from_archive(
        archive: &mut ZipArchive<Cursor<&Vec<u8>>>,
        filename: &str,
    ) -> Option<(u32, u32)> {
        let mut file = archive.by_name(filename).ok()?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf).ok()?;

        let img = image::load_from_memory(&buf).ok()?;
        Some(img.dimensions())
    }

    /// Downscale image if larger than max_dimension
    fn maybe_downscale(&self, image_bytes: &[u8], max_dimension: u32) -> Option<Vec<u8>> {
        let img = image::load_from_memory(image_bytes).ok()?;
        let (w, h) = img.dimensions();

        // Only downscale if image exceeds max_dimension
        if w <= max_dimension && h <= max_dimension {
            return None; // Return None to use original bytes
        }

        // Calculate new dimensions preserving aspect ratio
        let scale = if w > h {
            max_dimension as f64 / w as f64
        } else {
            max_dimension as f64 / h as f64
        };
        let new_w = (w as f64 * scale) as u32;
        let new_h = (h as f64 * scale) as u32;

        let resized = img.resize(new_w, new_h, image::imageops::FilterType::Lanczos3);

        // Encode back to JPEG for efficient transfer
        let mut output = Cursor::new(Vec::new());
        resized
            .write_to(&mut output, image::ImageFormat::Jpeg)
            .ok()?;

        Some(output.into_inner())
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
        archive: &mut ZipArchive<Cursor<&Vec<u8>>>,
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

