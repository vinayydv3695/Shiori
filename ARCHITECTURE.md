# Shiori - Production Architecture Design
## Modern Offline-First eBook Library Manager (Calibre Competitor)

**Version:** 2.0  
**Date:** February 2026  
**Target:** 50,000+ books, sub-100ms search, memory-efficient

---

## 🎯 EXECUTIVE SUMMARY

This document defines the production-ready architecture for Shiori, designed to compete directly with Calibre while maintaining a modern, offline-first approach. The system supports 11 formats, intelligent format conversion, RSS news ingestion, and secure book sharing—all while handling 50k+ books with sub-100ms query performance.

**Key Design Decisions:**
- **Pure Rust conversion engine** (no Calibre CLI dependency)
- **One EPUB per feed per day** for RSS news
- **Geometric pattern cover generation** with GPU-accelerated rendering
- **Multi-format support** via `book_formats` junction table
- **Secure sharing** with optional passwords, 24h expiration, access logging
- **Virtual scrolling** for large library views
- **500MB memory cap** with LRU eviction

---

## 📐 HIGH-LEVEL ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TAURI FRONTEND                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Library View │  │ Reader View  │  │  RSS Manager │              │
│  │ (Virtual     │  │ (Premium UI) │  │  (Scheduler) │              │
│  │  Scroll)     │  │              │  │              │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
└─────────┼──────────────────┼──────────────────┼───────────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      TAURI COMMAND LAYER                             │
│  library_commands │ reader_commands │ rss_commands │ share_commands │
└─────────┬───────────────────┬──────────────────┬────────────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       SERVICE LAYER (Rust)                           │
│ ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│ │ LibraryService  │  │ FormatService    │  │ ConversionService  │  │
│ │ - CRUD ops      │  │ - Detection      │  │ - Queue management │  │
│ │ - Search (FTS5) │  │ - Validation     │  │ - Worker threads   │  │
│ │ - Collections   │  │ - Metadata       │  │ - Job tracking     │  │
│ └─────────────────┘  └──────────────────┘  └────────────────────┘  │
│                                                                       │
│ ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│ │ CoverService    │  │ RSSService       │  │ ShareService       │  │
│ │ - Extraction    │  │ - Feed parser    │  │ - HTTP server      │  │
│ │ - Generation    │  │ - Scheduler      │  │ - Access control   │  │
│ │ - Caching       │  │ - EPUB builder   │  │ - Expiration       │  │
│ └─────────────────┘  └──────────────────┘  └────────────────────┘  │
└─────────┬───────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FORMAT ADAPTER LAYER                              │
│                                                                       │
│     ┌──────────────────────────────────────────────────────┐        │
│     │           BookFormatAdapter Trait                     │        │
│     │  - extract_metadata()                                 │        │
│     │  - extract_cover()                                    │        │
│     │  - validate()                                         │        │
│     │  - convert_to(target_format)                          │        │
│     └────┬─────────────────────────────────────────────────┘        │
│          │                                                            │
│    ┌─────┴─────────────────────────────────────────────────┐        │
│    │                                                         │        │
│  ┌─▼──┐ ┌─▼──┐ ┌─▼──┐ ┌─▼──┐ ┌─▼──┐ ┌─▼──┐ ┌─▼──┐ ┌─▼──┐ │        │
│  │EPUB│ │PDF │ │MOBI│ │AZW3│ │FB2 │ │DOCX│ │TXT │ │CBZ │ │        │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ │        │
│    │     │      │      │      │      │      │      │       │        │
│    └─────┴──────┴──────┴──────┴──────┴──────┴──────┴───────┘        │
│                                                                       │
└─────────┬─────────────────────────────────────────────────────────── ┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      STORAGE LAYER                                   │
│                                                                       │
│  ┌───────────────────┐         ┌────────────────────────────────┐   │
│  │   SQLite + WAL    │         │      File Storage              │   │
│  │   - FTS5 index    │         │  ~/Shiori/                     │   │
│  │   - Optimized     │         │    ├── library/                │   │
│  │   - Sub-100ms     │         │    │   ├── <author>/           │   │
│  │                   │         │    │   │   └── <title>/        │   │
│  └───────────────────┘         │    │   │       ├── book.epub   │   │
│                                │    │   │       ├── book.pdf    │   │
│  ┌───────────────────┐         │    │   │       └── ...         │   │
│  │  LRU Cache        │         │    ├── covers/                 │   │
│  │  (500MB cap)      │         │    │   ├── thumb_<uuid>.jpg    │   │
│  │  - Covers         │         │    │   ├── medium_<uuid>.jpg   │   │
│  │  - Metadata       │         │    │   └── full_<uuid>.jpg     │   │
│  │  - TOC            │         │    ├── rss/                    │   │
│  └───────────────────┘         │    │   └── <feed_id>/          │   │
│                                │    │       └── 2026-02-18.epub  │   │
│  ┌───────────────────┐         │    ├── temp/                   │   │
│  │ Worker Queue      │         │    │   └── conversion/         │   │
│  │ - Conversion jobs │         │    └── shared/                 │   │
│  │ - RSS fetch jobs  │         │        └── <share_token>/      │   │
│  └───────────────────┘         └────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────── ┘
```

---

## 📚 1. FORMAT SUPPORT ARCHITECTURE

### 1.1 Unified BookFormatAdapter Trait

```rust
#[async_trait]
pub trait BookFormatAdapter: Send + Sync {
    /// Get format identifier (e.g., "epub", "pdf")
    fn format_id(&self) -> &str;
    
    /// Validate file integrity
    async fn validate(&self, path: &Path) -> Result<ValidationResult>;
    
    /// Extract complete metadata
    async fn extract_metadata(&self, path: &Path) -> Result<BookMetadata>;
    
    /// Extract cover image (returns None if not found)
    async fn extract_cover(&self, path: &Path) -> Result<Option<CoverImage>>;
    
    /// Check if format supports conversion to target format
    fn can_convert_to(&self, target: &str) -> bool;
    
    /// Convert to target format
    async fn convert_to(&self, source: &Path, target: &Path, target_format: &str) 
        -> Result<ConversionResult>;
    
    /// Get reading capabilities
    fn capabilities(&self) -> FormatCapabilities;
}

pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub file_size: u64,
    pub page_count: Option<u32>,
    pub word_count: Option<u32>,
}

pub struct FormatCapabilities {
    pub supports_toc: bool,
    pub supports_images: bool,
    pub supports_text_reflow: bool,
    pub supports_annotations: bool,
    pub supports_metadata: bool,
    pub is_readable: bool,
}
```

### 1.2 Format-Specific Implementation Strategy

| Format | Magic Bytes | Library | Metadata | Cover | Convert From | Convert To |
|--------|-------------|---------|----------|-------|--------------|------------|
| **EPUB** | `PK\x03\x04` + mimetype | `epub` crate | OPF parsing | Cover.xhtml, META-INF | All text formats | PDF, HTML |
| **PDF** | `%PDF` | `lopdf`, `pdf-extract` | PDF Info dict | First page render | EPUB, HTML, DOCX | Images only |
| **MOBI** | `BOOKMOBI` @ offset 60 | `mobi` crate | EXTH headers | Image @ offset | AZW3 | EPUB |
| **AZW3** | `BOOKMOBI` (KF8) | `mobi` crate | EXTH headers | KF8 resources | MOBI | EPUB |
| **FB2** | `<?xml` + `<FictionBook>` | `xml-rs` | `<description>` | `<binary>` base64 | - | EPUB |
| **DOCX** | `PK\x03\x04` + `[Content_Types].xml` | `docx-rs` | `core.xml` | `media/*.jpg` | - | EPUB, HTML |
| **TXT** | UTF-8 text | `std::fs` | Filename only | None | - | EPUB |
| **HTML** | `<!DOCTYPE html>` | `html5ever` | `<title>`, `<meta>` | `<img>` first | - | EPUB |
| **CBZ** | ZIP + images | `zip` | `ComicInfo.xml` | First image | - | PDF |
| **CBR** | RAR + images | `unrar` crate | `ComicInfo.xml` | First image | - | PDF, CBZ |

### 1.3 Format Detection Pipeline

```rust
pub async fn detect_format(path: &Path) -> Result<FormatInfo> {
    // Stage 1: Extension check (fast path)
    if let Some(ext) = get_extension(path) {
        if let Some(format) = FORMAT_MAP.get(ext) {
            // Stage 2: Magic byte verification
            if verify_magic_bytes(path, format).await? {
                return Ok(FormatInfo::new(format));
            }
        }
    }
    
    // Stage 3: Deep content inspection
    let magic = read_magic_bytes(path, 512).await?;
    
    // PDF check
    if magic.starts_with(b"%PDF") {
        return Ok(FormatInfo::pdf());
    }
    
    // ZIP-based (EPUB, DOCX, CBZ)
    if magic.starts_with(b"PK\x03\x04") {
        return classify_zip_format(path).await;
    }
    
    // MOBI/AZW3 check
    if magic.len() >= 68 && &magic[60..68] == b"BOOKMOBI" {
        return classify_mobi_format(path).await;
    }
    
    // XML-based (FB2, HTML)
    if magic.starts_with(b"<?xml") {
        return classify_xml_format(path).await;
    }
    
    // Text file check
    if is_valid_utf8(&magic) {
        return Ok(FormatInfo::txt());
    }
    
    Err(Error::UnknownFormat)
}

async fn classify_zip_format(path: &Path) -> Result<FormatInfo> {
    let file = File::open(path).await?;
    let mut archive = ZipArchive::new(file)?;
    
    // EPUB: contains "mimetype" file with "application/epub+zip"
    if let Ok(mimetype) = archive.by_name("mimetype") {
        let content = read_to_string(mimetype).await?;
        if content.contains("epub") {
            return Ok(FormatInfo::epub());
        }
    }
    
    // DOCX: contains "[Content_Types].xml" and "word/" directory
    if archive.by_name("[Content_Types].xml").is_ok() 
        && archive.by_name("word/document.xml").is_ok() {
        return Ok(FormatInfo::docx());
    }
    
    // CBZ: contains image files (jpg, png)
    let has_images = (0..archive.len()).any(|i| {
        let file = archive.by_index(i).ok()?;
        let name = file.name().to_lowercase();
        Some(name.ends_with(".jpg") || name.ends_with(".png"))
    });
    
    if has_images {
        return Ok(FormatInfo::cbz());
    }
    
    Err(Error::UnknownFormat)
}
```

### 1.4 Graceful Degradation for Unsupported Formats

```rust
pub enum FormatSupport {
    FullySupported {
        adapter: Box<dyn BookFormatAdapter>,
    },
    ReadOnly {
        adapter: Box<dyn BookFormatAdapter>,
        reason: String, // "Conversion not implemented"
    },
    MetadataOnly {
        format: String,
        reason: String, // "Reading not supported"
    },
    Unsupported {
        format: String,
        suggestion: String, // "Convert to EPUB first"
    },
}

impl LibraryService {
    pub async fn import_book(&self, path: &Path) -> Result<ImportResult> {
        let format = detect_format(path).await?;
        
        match self.format_registry.get_support(&format) {
            FormatSupport::FullySupported { adapter } => {
                // Extract full metadata, cover, add to library
                self.import_with_adapter(path, adapter).await
            }
            FormatSupport::ReadOnly { adapter, reason } => {
                // Import but disable conversion
                self.import_readonly(path, adapter, reason).await
            }
            FormatSupport::MetadataOnly { format, reason } => {
                // Add to library but mark as non-readable
                self.import_metadata_only(path, format, reason).await
            }
            FormatSupport::Unsupported { format, suggestion } => {
                Err(Error::UnsupportedFormat { format, suggestion })
            }
        }
    }
}
```

---

## 🖼 2. COVER MANAGEMENT SYSTEM

### 2.1 Cover Extraction Pipeline

```rust
pub struct CoverService {
    cache: Arc<LruCache<Uuid, CoverSet>>,
    storage: CoverStorage,
    generator: CoverGenerator,
}

pub struct CoverSet {
    pub uuid: Uuid,
    pub thumbnail: PathBuf,   // 200x300px
    pub medium: PathBuf,       // 400x600px
    pub full: PathBuf,         // Original resolution
}

impl CoverService {
    pub async fn extract_or_generate(&self, book_id: Uuid, path: &Path, format: &str) 
        -> Result<CoverSet> {
        
        // Stage 1: Check cache
        if let Some(cover) = self.cache.get(&book_id) {
            return Ok(cover.clone());
        }
        
        // Stage 2: Try format-specific extraction
        let adapter = self.format_registry.get(format)?;
        if let Some(cover_data) = adapter.extract_cover(path).await? {
            return self.process_and_store(book_id, cover_data).await;
        }
        
        // Stage 3: Format-specific fallbacks
        let cover_data = match format {
            "pdf" => self.render_pdf_first_page(path).await?,
            "epub" => self.extract_epub_cover(path).await?,
            "mobi" | "azw3" => self.extract_mobi_cover(path).await?,
            "cbz" | "cbr" => self.extract_comic_cover(path).await?,
            _ => None,
        };
        
        if let Some(data) = cover_data {
            return self.process_and_store(book_id, data).await;
        }
        
        // Stage 4: Generate fallback cover
        let metadata = adapter.extract_metadata(path).await?;
        let generated = self.generator.create_geometric_cover(&metadata).await?;
        self.process_and_store(book_id, generated).await
    }
    
    async fn process_and_store(&self, book_id: Uuid, image: CoverImage) 
        -> Result<CoverSet> {
        
        // Generate three resolutions
        let thumb = self.resize_image(&image, 200, 300).await?;
        let medium = self.resize_image(&image, 400, 600).await?;
        let full = image;
        
        // Store to disk
        let cover_dir = self.storage.get_cover_dir(book_id);
        tokio::fs::create_dir_all(&cover_dir).await?;
        
        let thumb_path = cover_dir.join("thumb.jpg");
        let medium_path = cover_dir.join("medium.jpg");
        let full_path = cover_dir.join("full.jpg");
        
        self.save_jpeg(&thumb, &thumb_path, 85).await?;
        self.save_jpeg(&medium, &medium_path, 90).await?;
        self.save_jpeg(&full, &full_path, 95).await?;
        
        let cover_set = CoverSet {
            uuid: book_id,
            thumbnail: thumb_path,
            medium: medium_path,
            full: full_path,
        };
        
        // Add to cache
        self.cache.put(book_id, cover_set.clone());
        
        Ok(cover_set)
    }
}
```

### 2.2 Geometric Pattern Cover Generator

```rust
pub struct CoverGenerator {
    font: Font,
    patterns: Vec<PatternTemplate>,
}

pub enum PatternTemplate {
    CircularWaves,
    GeometricGrid,
    DiagonalStripes,
    Polygons,
    Gradient,
}

impl CoverGenerator {
    pub async fn create_geometric_cover(&self, metadata: &BookMetadata) 
        -> Result<CoverImage> {
        
        // Generate color scheme from title hash
        let colors = self.generate_color_scheme(&metadata.title);
        
        // Select pattern based on genre/author hash
        let pattern = self.select_pattern(&metadata);
        
        // Create canvas (400x600)
        let mut img = RgbaImage::new(400, 600);
        
        // Draw pattern
        match pattern {
            PatternTemplate::CircularWaves => {
                self.draw_circular_waves(&mut img, &colors);
            }
            PatternTemplate::GeometricGrid => {
                self.draw_geometric_grid(&mut img, &colors);
            }
            PatternTemplate::DiagonalStripes => {
                self.draw_diagonal_stripes(&mut img, &colors);
            }
            // ... other patterns
        }
        
        // Draw text overlay with shadow
        let title_font_size = self.calculate_font_size(&metadata.title, 380);
        self.draw_text_with_shadow(
            &mut img, 
            &metadata.title, 
            20, 
            300, 
            title_font_size,
            &colors.text_color
        );
        
        if !metadata.authors.is_empty() {
            self.draw_text_with_shadow(
                &mut img,
                &metadata.authors.join(", "),
                20,
                350,
                28,
                &colors.secondary_color
            );
        }
        
        Ok(CoverImage::from_rgba(img))
    }
    
    fn generate_color_scheme(&self, seed: &str) -> ColorScheme {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let mut hasher = DefaultHasher::new();
        seed.hash(&mut hasher);
        let hash = hasher.finish();
        
        // Generate complementary colors
        let hue = (hash % 360) as f32;
        let primary = Rgba::from_hsla(hue, 0.7, 0.5, 1.0);
        let secondary = Rgba::from_hsla((hue + 180.0) % 360.0, 0.6, 0.6, 1.0);
        let text = if is_dark(&primary) {
            Rgba::from([255, 255, 255, 255])
        } else {
            Rgba::from([0, 0, 0, 255])
        };
        
        ColorScheme { primary, secondary, text_color: text }
    }
}
```

### 2.3 Storage Layout & Caching

```
~/Shiori/covers/
├── <book_uuid>/
│   ├── thumb.jpg      (200x300, 85% quality, ~15KB)
│   ├── medium.jpg     (400x600, 90% quality, ~60KB)
│   └── full.jpg       (original, 95% quality, ~200KB)
```

**Caching Strategy:**
- **L1 Cache (Memory):** LRU cache with 500MB cap, stores decoded `DynamicImage` objects
- **L2 Cache (Disk):** All covers stored on disk, lazy-loaded on demand
- **Eviction Policy:** LRU, oldest accessed first when memory cap reached
- **Preloading:** Library view preloads next 100 thumbnails in background
- **GPU Optimization:** Use `resvg` for SVG covers, hardware-accelerated JPEG decode

---

## 🔄 3. CONVERSION ENGINE DESIGN

### 3.1 Conversion Pipeline Architecture

```rust
pub struct ConversionEngine {
    queue: Arc<Mutex<ConversionQueue>>,
    workers: Vec<JoinHandle<()>>,
    job_tracker: Arc<DashMap<Uuid, ConversionJob>>,
}

pub struct ConversionJob {
    pub id: Uuid,
    pub source_path: PathBuf,
    pub target_path: PathBuf,
    pub source_format: String,
    pub target_format: String,
    pub status: ConversionStatus,
    pub progress: f32,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
}

pub enum ConversionStatus {
    Queued,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

impl ConversionEngine {
    pub fn new(worker_count: usize) -> Self {
        let queue = Arc::new(Mutex::new(ConversionQueue::new()));
        let job_tracker = Arc::new(DashMap::new());
        
        let mut workers = vec![];
        for worker_id in 0..worker_count {
            let queue_clone = queue.clone();
            let tracker_clone = job_tracker.clone();
            
            let handle = tokio::spawn(async move {
                Self::worker_loop(worker_id, queue_clone, tracker_clone).await;
            });
            
            workers.push(handle);
        }
        
        Self { queue, workers, job_tracker }
    }
    
    pub async fn submit_conversion(
        &self, 
        source: PathBuf, 
        target_format: &str
    ) -> Result<Uuid> {
        let job_id = Uuid::new_v4();
        let source_format = detect_format(&source).await?;
        
        let job = ConversionJob {
            id: job_id,
            source_path: source.clone(),
            target_path: self.generate_target_path(&source, target_format),
            source_format: source_format.to_string(),
            target_format: target_format.to_string(),
            status: ConversionStatus::Queued,
            progress: 0.0,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            error: None,
        };
        
        self.job_tracker.insert(job_id, job.clone());
        self.queue.lock().await.push(job);
        
        Ok(job_id)
    }
    
    async fn worker_loop(
        worker_id: usize,
        queue: Arc<Mutex<ConversionQueue>>,
        tracker: Arc<DashMap<Uuid, ConversionJob>>,
    ) {
        log::info!("[ConversionWorker-{}] Started", worker_id);
        
        loop {
            // Get next job from queue
            let job = {
                let mut q = queue.lock().await;
                q.pop()
            };
            
            if let Some(mut job) = job {
                log::info!("[ConversionWorker-{}] Processing job {}", worker_id, job.id);
                
                job.status = ConversionStatus::Processing;
                job.started_at = Some(Utc::now());
                tracker.insert(job.id, job.clone());
                
                // Execute conversion
                let result = Self::execute_conversion(&job).await;
                
                match result {
                    Ok(_) => {
                        job.status = ConversionStatus::Completed;
                        job.progress = 100.0;
                        job.completed_at = Some(Utc::now());
                        log::info!("[ConversionWorker-{}] Job {} completed", worker_id, job.id);
                    }
                    Err(e) => {
                        job.status = ConversionStatus::Failed;
                        job.error = Some(e.to_string());
                        log::error!("[ConversionWorker-{}] Job {} failed: {}", worker_id, job.id, e);
                    }
                }
                
                tracker.insert(job.id, job);
            } else {
                // Queue empty, sleep briefly
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    }
    
    async fn execute_conversion(job: &ConversionJob) -> Result<()> {
        // Dispatch to appropriate converter
        match (job.source_format.as_str(), job.target_format.as_str()) {
            ("epub", "pdf") => epub_to_pdf(&job.source_path, &job.target_path).await,
            ("epub", "mobi") => epub_to_mobi(&job.source_path, &job.target_path).await,
            ("pdf", "epub") => pdf_to_epub(&job.source_path, &job.target_path).await,
            ("mobi", "epub") => mobi_to_epub(&job.source_path, &job.target_path).await,
            ("azw3", "epub") => azw3_to_epub(&job.source_path, &job.target_path).await,
            ("txt", "epub") => txt_to_epub(&job.source_path, &job.target_path).await,
            ("docx", "epub") => docx_to_epub(&job.source_path, &job.target_path).await,
            ("html", "epub") => html_to_epub(&job.source_path, &job.target_path).await,
            ("fb2", "epub") => fb2_to_epub(&job.source_path, &job.target_path).await,
            _ => Err(Error::UnsupportedConversion {
                from: job.source_format.clone(),
                to: job.target_format.clone(),
            }),
        }
    }
}
```

### 3.2 Format Conversion Matrix (Pure Rust)

| From ↓ / To → | EPUB | PDF | MOBI | HTML | TXT |
|---------------|------|-----|------|------|-----|
| **EPUB**      | ✅   | ✅  | ✅   | ✅   | ✅  |
| **PDF**       | ⚠️   | ✅  | ❌   | ⚠️   | ⚠️  |
| **MOBI**      | ✅   | ⚠️  | ✅   | ✅   | ✅  |
| **AZW3**      | ✅   | ⚠️  | ✅   | ✅   | ✅  |
| **FB2**       | ✅   | ⚠️  | ⚠️   | ✅   | ✅  |
| **DOCX**      | ✅   | ⚠️  | ⚠️   | ✅   | ✅  |
| **HTML**      | ✅   | ⚠️  | ⚠️   | ✅   | ✅  |
| **TXT**       | ✅   | ⚠️  | ⚠️   | ✅   | ✅  |
| **CBZ**       | ❌   | ✅  | ❌   | ❌   | ❌  |
| **CBR**       | ❌   | ✅  | ❌   | ❌   | ❌  |

**Legend:**
- ✅ Full support (lossless or minimal loss)
- ⚠️ Partial support (may lose formatting/images)
- ❌ Not supported

### 3.3 Conversion Implementation (Pure Rust)

**Key Libraries:**
- EPUB generation: Custom builder using `zip-rs`
- MOBI generation: `mobi-rs` crate
- PDF generation: `printpdf` crate
- HTML parsing: `html5ever`
- DOCX parsing: `docx-rs`
- XML parsing: `quick-xml`

```rust
// Example: TXT to EPUB conversion
async fn txt_to_epub(source: &Path, target: &Path) -> Result<()> {
    let content = tokio::fs::read_to_string(source).await?;
    
    // Guess title from filename
    let title = source.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();
    
    // Split into chapters (by blank lines or chapter markers)
    let chapters = split_into_chapters(&content);
    
    // Create EPUB structure
    let mut epub = EpubBuilder::new()?;
    epub.metadata("title", &title)?;
    epub.metadata("language", "en")?;
    epub.metadata("generator", "Shiori v2.0")?;
    
    // Add stylesheet
    epub.stylesheet(include_bytes!("../assets/epub_default.css"))?;
    
    // Add chapters
    for (i, chapter) in chapters.iter().enumerate() {
        let chapter_html = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE html>
            <html xmlns="http://www.w3.org/1999/xhtml">
            <head>
                <title>Chapter {}</title>
                <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
            </head>
            <body>
                <h1>Chapter {}</h1>
                {}
            </body>
            </html>"#,
            i + 1, 
            i + 1, 
            markdown_to_html(&chapter.content)
        );
        
        epub.add_content(
            format!("chapter{}.xhtml", i + 1),
            chapter_html.as_bytes(),
            "application/xhtml+xml"
        )?;
    }
    
    // Generate EPUB
    let epub_data = epub.generate()?;
    tokio::fs::write(target, epub_data).await?;
    
    Ok(())
}

// Example: MOBI to EPUB conversion
async fn mobi_to_epub(source: &Path, target: &Path) -> Result<()> {
    use mobi::Mobi;
    
    let mobi = Mobi::from_path(source)?;
    let content = mobi.content_as_string()?;
    let metadata = mobi.metadata();
    
    let mut epub = EpubBuilder::new()?;
    epub.metadata("title", metadata.title())?;
    epub.metadata("author", &metadata.authors().join(", "))?;
    
    if let Some(cover) = mobi.cover_image()? {
        epub.add_cover_image("cover.jpg", cover, "image/jpeg")?;
    }
    
    // Parse HTML content and split into chapters
    let chapters = parse_html_chapters(&content)?;
    
    for (i, chapter) in chapters.iter().enumerate() {
        epub.add_content(
            format!("chapter{}.xhtml", i + 1),
            chapter.as_bytes(),
            "application/xhtml+xml"
        )?;
    }
    
    let epub_data = epub.generate()?;
    tokio::fs::write(target, epub_data).await?;
    
    Ok(())
}
```

### 3.4 Temp File Safety & Rollback

```rust
pub struct ConversionTransaction {
    temp_dir: TempDir,
    source: PathBuf,
    target: PathBuf,
    intermediate_files: Vec<PathBuf>,
}

impl ConversionTransaction {
    pub fn new(source: PathBuf, target: PathBuf) -> Result<Self> {
        let temp_dir = TempDir::new()?;
        Ok(Self {
            temp_dir,
            source,
            target,
            intermediate_files: vec![],
        })
    }
    
    pub fn temp_path(&self, name: &str) -> PathBuf {
        self.temp_dir.path().join(name)
    }
    
    pub async fn commit(self) -> Result<()> {
        // Verify target file is valid
        if !self.target.exists() {
            return Err(Error::ConversionFailed("Target file not created".into()));
        }
        
        // Move from temp to final location atomically
        tokio::fs::rename(&self.target, &self.target).await?;
        
        // temp_dir automatically cleaned up on drop
        Ok(())
    }
    
    pub async fn rollback(self) -> Result<()> {
        // Remove target if created
        if self.target.exists() {
            let _ = tokio::fs::remove_file(&self.target).await;
        }
        
        // temp_dir automatically cleaned up on drop
        Ok(())
    }
}
```

---

## 📰 4. RSS FEED SYSTEM

### 4.1 RSS Service Architecture

```rust
pub struct RssService {
    db: Arc<Database>,
    scheduler: Arc<Scheduler>,
    feed_fetcher: FeedFetcher,
    epub_builder: EpubBuilder,
}

pub struct RssFeed {
    pub id: i64,
    pub url: String,
    pub title: String,
    pub description: Option<String>,
    pub fetch_interval_hours: i32,
    pub last_fetched: Option<DateTime<Utc>>,
    pub last_success: Option<DateTime<Utc>>,
    pub failure_count: i32,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

pub struct RssArticle {
    pub id: i64,
    pub feed_id: i64,
    pub guid: String,
    pub title: String,
    pub author: Option<String>,
    pub link: String,
    pub content: String,
    pub published_at: DateTime<Utc>,
    pub fetched_at: DateTime<Utc>,
    pub is_read: bool,
}

impl RssService {
    pub async fn add_feed(&self, url: &str, interval_hours: i32) -> Result<i64> {
        // Fetch and validate feed
        let feed = self.feed_fetcher.fetch(url).await?;
        
        // Insert into database
        let feed_id = self.db.execute(
            "INSERT INTO rss_feeds (url, title, description, fetch_interval_hours, created_at)
             VALUES (?, ?, ?, ?, ?)",
            params![
                url,
                feed.title,
                feed.description,
                interval_hours,
                Utc::now().to_rfc3339()
            ]
        )?;
        
        // Schedule periodic fetch
        self.scheduler.schedule_recurring(
            Duration::from_secs((interval_hours * 3600) as u64),
            move || {
                self.fetch_and_process_feed(feed_id).await;
            }
        );
        
        // Initial fetch
        self.fetch_and_process_feed(feed_id).await?;
        
        Ok(feed_id)
    }
    
    async fn fetch_and_process_feed(&self, feed_id: i64) -> Result<()> {
        let feed = self.get_feed(feed_id).await?;
        
        log::info!("[RSS] Fetching feed: {}", feed.title);
        
        match self.feed_fetcher.fetch(&feed.url).await {
            Ok(parsed_feed) => {
                // Update last_fetched timestamp
                self.update_fetch_timestamp(feed_id).await?;
                
                // Process each article
                let mut new_articles = vec![];
                for entry in parsed_feed.entries {
                    // Check if already exists
                    if !self.article_exists(&entry.id).await? {
                        let article = RssArticle {
                            id: 0,
                            feed_id,
                            guid: entry.id.clone(),
                            title: entry.title.unwrap_or_default(),
                            author: entry.authors.first().map(|a| a.name.clone()),
                            link: entry.links.first().map(|l| l.href.clone()).unwrap_or_default(),
                            content: self.extract_content(&entry),
                            published_at: entry.published.unwrap_or_else(Utc::now),
                            fetched_at: Utc::now(),
                            is_read: false,
                        };
                        
                        self.save_article(&article).await?;
                        new_articles.push(article);
                    }
                }
                
                // Group articles by date and create EPUB
                if !new_articles.is_empty() {
                    self.create_daily_news_epub(feed_id, &feed.title, new_articles).await?;
                }
                
                // Reset failure count on success
                self.reset_failure_count(feed_id).await?;
                
                Ok(())
            }
            Err(e) => {
                log::error!("[RSS] Failed to fetch feed {}: {}", feed_id, e);
                
                // Increment failure count
                let failure_count = self.increment_failure_count(feed_id).await?;
                
                // Disable feed after 10 consecutive failures
                if failure_count >= 10 {
                    self.disable_feed(feed_id).await?;
                    log::warn!("[RSS] Disabled feed {} after 10 failures", feed_id);
                }
                
                Err(e)
            }
        }
    }
    
    async fn create_daily_news_epub(
        &self,
        feed_id: i64,
        feed_title: &str,
        articles: Vec<RssArticle>,
    ) -> Result<Uuid> {
        let date = Utc::now().format("%Y-%m-%d").to_string();
        let title = format!("{} - {}", feed_title, date);
        
        let mut epub = EpubBuilder::new()?;
        epub.metadata("title", &title)?;
        epub.metadata("publisher", "Shiori RSS")?;
        epub.metadata("language", "en")?;
        epub.metadata("date", &date)?;
        
        // Add stylesheet
        epub.stylesheet(include_bytes!("../assets/news_style.css"))?;
        
        // Create cover
        let cover = self.generate_news_cover(&title).await?;
        epub.add_cover_image("cover.jpg", &cover, "image/jpeg")?;
        
        // Add each article as a chapter
        for (i, article) in articles.iter().enumerate() {
            let chapter_html = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
                <!DOCTYPE html>
                <html xmlns="http://www.w3.org/1999/xhtml">
                <head>
                    <title>{}</title>
                    <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
                </head>
                <body>
                    <h1>{}</h1>
                    <p class="byline">By {} &bull; {}</p>
                    <hr/>
                    <div class="content">
                        {}
                    </div>
                    <p class="source"><a href="{}">View original</a></p>
                </body>
                </html>"#,
                article.title,
                article.title,
                article.author.as_deref().unwrap_or("Unknown"),
                article.published_at.format("%B %d, %Y %H:%M"),
                article.content,
                article.link
            );
            
            epub.add_content(
                format!("article{}.xhtml", i + 1),
                chapter_html.as_bytes(),
                "application/xhtml+xml"
            )?;
        }
        
        // Generate EPUB
        let epub_data = epub.generate()?;
        
        // Save to RSS directory
        let rss_dir = self.get_rss_dir(feed_id);
        tokio::fs::create_dir_all(&rss_dir).await?;
        
        let epub_path = rss_dir.join(format!("{}.epub", date));
        tokio::fs::write(&epub_path, epub_data).await?;
        
        // Add to library
        let book_uuid = Uuid::new_v4();
        self.library_service.import_book_with_metadata(
            book_uuid,
            &epub_path,
            BookMetadata {
                title: title.clone(),
                authors: vec![feed_title.to_string()],
                publisher: Some("Shiori RSS".to_string()),
                pubdate: Some(date.clone()),
                tags: vec!["News".to_string(), feed_title.to_string()],
                ..Default::default()
            }
        ).await?;
        
        Ok(book_uuid)
    }
    
    fn extract_content(&self, entry: &rss::Item) -> String {
        // Try content:encoded first (full content)
        if let Some(content) = entry.content.as_ref() {
            return self.sanitize_html(content);
        }
        
        // Fall back to description (usually truncated)
        if let Some(desc) = entry.description.as_ref() {
            return self.sanitize_html(desc);
        }
        
        // Last resort: just title
        entry.title.clone().unwrap_or_default()
    }
    
    fn sanitize_html(&self, html: &str) -> String {
        use ammonia::Builder;
        
        // Allow safe HTML tags, strip scripts/styles
        Builder::default()
            .tags(hashset!["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", 
                           "ul", "ol", "li", "a", "strong", "em", "blockquote",
                           "img", "figure", "figcaption"])
            .url_relative(ammonia::UrlRelative::RewriteWithBase(
                url::Url::parse("https://example.com").unwrap()
            ))
            .clean(html)
            .to_string()
    }
}
```

### 4.2 RSS Database Schema

```sql
CREATE TABLE rss_feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    fetch_interval_hours INTEGER DEFAULT 12,
    last_fetched TEXT,
    last_success TEXT,
    failure_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE rss_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id INTEGER NOT NULL,
    guid TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    author TEXT,
    link TEXT NOT NULL,
    content TEXT NOT NULL,
    published_at TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    FOREIGN KEY (feed_id) REFERENCES rss_feeds(id) ON DELETE CASCADE
);

CREATE INDEX idx_rss_articles_feed ON rss_articles(feed_id);
CREATE INDEX idx_rss_articles_published ON rss_articles(published_at DESC);
```

### 4.3 Scheduler Implementation

```rust
pub struct Scheduler {
    tasks: Arc<Mutex<Vec<ScheduledTask>>>,
    shutdown_tx: broadcast::Sender<()>,
}

pub struct ScheduledTask {
    pub id: Uuid,
    pub interval: Duration,
    pub last_run: Option<Instant>,
    pub callback: Box<dyn Fn() -> BoxFuture<'static, ()> + Send + Sync>,
}

impl Scheduler {
    pub fn new() -> Self {
        let (shutdown_tx, _) = broadcast::channel(1);
        
        Self {
            tasks: Arc::new(Mutex::new(vec![])),
            shutdown_tx,
        }
    }
    
    pub fn start(&self) {
        let tasks = self.tasks.clone();
        let mut shutdown_rx = self.shutdown_tx.subscribe();
        
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        let mut tasks = tasks.lock().await;
                        let now = Instant::now();
                        
                        for task in tasks.iter_mut() {
                            let should_run = task.last_run
                                .map(|last| now.duration_since(last) >= task.interval)
                                .unwrap_or(true);
                            
                            if should_run {
                                let callback = (task.callback)();
                                tokio::spawn(callback);
                                task.last_run = Some(now);
                            }
                        }
                    }
                    _ = shutdown_rx.recv() => {
                        log::info!("[Scheduler] Shutting down");
                        break;
                    }
                }
            }
        });
    }
    
    pub async fn schedule_recurring<F>(&self, interval: Duration, callback: F) -> Uuid
    where
        F: Fn() -> BoxFuture<'static, ()> + Send + Sync + 'static,
    {
        let task_id = Uuid::new_v4();
        let task = ScheduledTask {
            id: task_id,
            interval,
            last_run: None,
            callback: Box::new(callback),
        };
        
        self.tasks.lock().await.push(task);
        task_id
    }
}
```

---

## 🔗 5. BOOK SHARING SYSTEM

### 5.1 Share Service Architecture

```rust
pub struct ShareService {
    db: Arc<Database>,
    http_server: Option<Arc<ShareServer>>,
    active_shares: Arc<DashMap<String, ActiveShare>>,
}

pub struct ActiveShare {
    pub token: String,
    pub book_id: i64,
    pub format: String,
    pub password_hash: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub access_count: AtomicU32,
    pub max_accesses: Option<u32>,
}

pub struct ShareRequest {
    pub book_id: i64,
    pub format: Option<String>, // None = original format
    pub password: Option<String>,
    pub expires_in_hours: Option<u32>, // None = 24h default
    pub max_accesses: Option<u32>,
}

impl ShareService {
    pub async fn create_share(&self, req: ShareRequest) -> Result<ShareInfo> {
        // Generate secure token
        let token = self.generate_token();
        
        // Get book info
        let book = self.db.get_book(req.book_id).await?;
        
        // Determine format
        let format = req.format.unwrap_or_else(|| book.file_format.clone());
        
        // Hash password if provided
        let password_hash = req.password.map(|p| self.hash_password(&p));
        
        // Calculate expiration
        let expires_in = req.expires_in_hours.unwrap_or(24);
        let expires_at = Utc::now() + chrono::Duration::hours(expires_in as i64);
        
        // Create share record
        self.db.execute(
            "INSERT INTO shares (token, book_id, format, password_hash, expires_at, max_accesses, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                &token,
                req.book_id,
                &format,
                password_hash.as_ref(),
                expires_at.to_rfc3339(),
                req.max_accesses,
                Utc::now().to_rfc3339()
            ]
        )?;
        
        // Add to active shares
        let share = ActiveShare {
            token: token.clone(),
            book_id: req.book_id,
            format: format.clone(),
            password_hash,
            expires_at,
            created_at: Utc::now(),
            access_count: AtomicU32::new(0),
            max_accesses: req.max_accesses,
        };
        
        self.active_shares.insert(token.clone(), share);
        
        // Generate share URL
        let share_url = format!("http://localhost:8080/share/{}", token);
        
        Ok(ShareInfo {
            token,
            url: share_url,
            qr_code: self.generate_qr_code(&share_url)?,
            expires_at,
        })
    }
    
    pub async fn access_share(&self, token: &str, password: Option<&str>) -> Result<ShareAccess> {
        // Get share info
        let share = self.active_shares.get(token)
            .ok_or(Error::ShareNotFound)?;
        
        // Check expiration
        if Utc::now() > share.expires_at {
            self.revoke_share(token).await?;
            return Err(Error::ShareExpired);
        }
        
        // Check max accesses
        if let Some(max) = share.max_accesses {
            if share.access_count.load(Ordering::Relaxed) >= max {
                self.revoke_share(token).await?;
                return Err(Error::ShareMaxAccessesReached);
            }
        }
        
        // Verify password
        if let Some(hash) = &share.password_hash {
            let provided_password = password.ok_or(Error::SharePasswordRequired)?;
            if !self.verify_password(provided_password, hash) {
                return Err(Error::ShareInvalidPassword);
            }
        }
        
        // Increment access count
        share.access_count.fetch_add(1, Ordering::Relaxed);
        
        // Log access
        self.log_share_access(token).await?;
        
        // Get book file path
        let book = self.db.get_book(share.book_id).await?;
        let file_path = if share.format == book.file_format {
            book.file_path
        } else {
            // Need to convert first
            self.get_or_convert_format(share.book_id, &share.format).await?
        };
        
        Ok(ShareAccess {
            file_path,
            filename: format!("{}.{}", book.title, share.format),
            mime_type: self.get_mime_type(&share.format),
        })
    }
    
    fn generate_token(&self) -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let token: String = (0..32)
            .map(|_| rng.sample(rand::distributions::Alphanumeric) as char)
            .collect();
        token
    }
    
    fn generate_qr_code(&self, url: &str) -> Result<Vec<u8>> {
        use qrcode::{QrCode, render::svg};
        
        let code = QrCode::new(url)?;
        let svg = code.render::<svg::Color>()
            .min_dimensions(200, 200)
            .build();
        
        Ok(svg.as_bytes().to_vec())
    }
}
```

### 5.2 Share Database Schema

```sql
CREATE TABLE shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    book_id INTEGER NOT NULL,
    format TEXT NOT NULL,
    password_hash TEXT,
    expires_at TEXT NOT NULL,
    max_accesses INTEGER,
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE share_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_token TEXT NOT NULL,
    accessed_at TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    success INTEGER DEFAULT 1
);

CREATE INDEX idx_shares_token ON shares(token);
CREATE INDEX idx_shares_expires ON shares(expires_at);
CREATE INDEX idx_share_access_token ON share_access_log(share_token);
```

### 5.3 HTTP Share Server (Offline-First)

```rust
use axum::{
    routing::get,
    Router,
    extract::{Path, Query},
    response::{Html, IntoResponse},
};

pub struct ShareServer {
    service: Arc<ShareService>,
}

impl ShareServer {
    pub async fn start(port: u16, service: Arc<ShareService>) -> Result<()> {
        let app = Router::new()
            .route("/share/:token", get(Self::serve_share_page))
            .route("/share/:token/download", get(Self::download_book))
            .with_state(service);
        
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        log::info!("[ShareServer] Starting on {}", addr);
        
        axum::Server::bind(&addr)
            .serve(app.into_make_service())
            .await?;
        
        Ok(())
    }
    
    async fn serve_share_page(
        Path(token): Path<String>,
        State(service): State<Arc<ShareService>>,
    ) -> impl IntoResponse {
        let share = match service.active_shares.get(&token) {
            Some(s) => s,
            None => return Html("<h1>Share not found</h1>").into_response(),
        };
        
        let book = service.db.get_book(share.book_id).await.unwrap();
        
        let html = format!(
            r#"<!DOCTYPE html>
            <html>
            <head>
                <title>Shared Book: {}</title>
                <style>
                    body {{ font-family: sans-serif; max-width: 600px; margin: 50px auto; }}
                    .book-info {{ text-align: center; }}
                    .download-btn {{ 
                        display: inline-block; 
                        padding: 15px 30px; 
                        background: #3B82F6; 
                        color: white; 
                        text-decoration: none; 
                        border-radius: 8px; 
                        margin-top: 20px;
                    }}
                </style>
            </head>
            <body>
                <div class="book-info">
                    <h1>{}</h1>
                    <p><strong>Author:</strong> {}</p>
                    <p><strong>Format:</strong> {}</p>
                    <p><strong>Expires:</strong> {}</p>
                    <a href="/share/{}/download" class="download-btn">Download Book</a>
                </div>
            </body>
            </html>"#,
            book.title,
            book.title,
            book.authors.iter().map(|a| a.name.as_str()).collect::<Vec<_>>().join(", "),
            share.format,
            share.expires_at.format("%Y-%m-%d %H:%M UTC"),
            token
        );
        
        Html(html).into_response()
    }
    
    async fn download_book(
        Path(token): Path<String>,
        Query(params): Query<HashMap<String, String>>,
        State(service): State<Arc<ShareService>>,
    ) -> impl IntoResponse {
        let password = params.get("password").map(|s| s.as_str());
        
        match service.access_share(&token, password).await {
            Ok(access) => {
                let file = tokio::fs::read(&access.file_path).await.unwrap();
                
                (
                    StatusCode::OK,
                    [
                        (header::CONTENT_TYPE, access.mime_type),
                        (
                            header::CONTENT_DISPOSITION,
                            format!("attachment; filename=\"{}\"", access.filename)
                        ),
                    ],
                    file
                ).into_response()
            }
            Err(e) => {
                (StatusCode::FORBIDDEN, format!("Access denied: {}", e)).into_response()
            }
        }
    }
}
```

---

## 📚 6. LIBRARY SYSTEM ARCHITECTURE

### 6.1 Multi-Format Support per Book

**Design Decision:** A single book entity can have multiple format variants (EPUB, PDF, MOBI, etc.). The `book_formats` junction table links each format to the parent book.

```rust
pub struct Book {
    pub id: i64,
    pub uuid: Uuid,
    pub title: String,
    pub sort_title: Option<String>,
    pub authors: Vec<Author>,
    pub publisher: Option<String>,
    pub pubdate: Option<String>,
    pub isbn: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub rating: Option<i32>,
    pub added_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    
    // Multi-format support
    pub formats: Vec<BookFormat>,
    pub primary_format: String,
}

pub struct BookFormat {
    pub id: i64,
    pub book_id: i64,
    pub format: String,          // "epub", "pdf", "mobi", etc.
    pub file_path: PathBuf,
    pub file_size: u64,
    pub file_hash: String,       // SHA256 for deduplication
    pub page_count: Option<u32>,
    pub word_count: Option<u32>,
    pub added_at: DateTime<Utc>,
    pub is_primary: bool,
}

impl LibraryService {
    pub async fn add_format_to_book(&self, book_id: i64, format_path: &Path) -> Result<i64> {
        // Detect format
        let format_info = detect_format(format_path).await?;
        
        // Calculate file hash for deduplication
        let file_hash = self.calculate_sha256(format_path).await?;
        
        // Check if this exact file already exists
        if self.format_exists_by_hash(&file_hash).await? {
            return Err(Error::DuplicateFormat);
        }
        
        // Copy to library storage
        let book = self.get_book(book_id).await?;
        let target_path = self.get_format_path(&book, &format_info.format);
        tokio::fs::copy(format_path, &target_path).await?;
        
        // Extract metadata and validate consistency
        let adapter = self.format_registry.get(&format_info.format)?;
        let metadata = adapter.extract_metadata(&target_path).await?;
        
        // Warn if metadata differs significantly
        if !self.metadata_matches(&book, &metadata) {
            log::warn!(
                "[Library] Metadata mismatch when adding {} format to book {}",
                format_info.format,
                book_id
            );
        }
        
        // Get file size and optional counts
        let file_size = tokio::fs::metadata(&target_path).await?.len();
        let validation = adapter.validate(&target_path).await?;
        
        // Insert format record
        let format_id = self.db.execute(
            "INSERT INTO book_formats (book_id, format, file_path, file_size, file_hash, 
                                       page_count, word_count, added_at, is_primary)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                book_id,
                format_info.format,
                target_path.to_str(),
                file_size,
                file_hash,
                validation.page_count,
                validation.word_count,
                Utc::now().to_rfc3339(),
                false
            ]
        )?;
        
        Ok(format_id)
    }
    
    pub async fn set_primary_format(&self, book_id: i64, format: &str) -> Result<()> {
        // Unset all primary flags for this book
        self.db.execute(
            "UPDATE book_formats SET is_primary = 0 WHERE book_id = ?",
            params![book_id]
        )?;
        
        // Set new primary format
        self.db.execute(
            "UPDATE book_formats SET is_primary = 1 WHERE book_id = ? AND format = ?",
            params![book_id, format]
        )?;
        
        // Update book's primary_format field
        self.db.execute(
            "UPDATE books SET primary_format = ?, modified_at = ? WHERE id = ?",
            params![format, Utc::now().to_rfc3339(), book_id]
        )?;
        
        Ok(())
    }
}
```

### 6.2 Advanced Search & FTS5 Optimization

**Performance Target:** Sub-100ms search for 50,000 books

```sql
-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE books_fts USING fts5(
    title,
    authors,
    publisher,
    description,
    tags,
    isbn,
    content='books',
    content_rowid='id',
    tokenize='porter unicode61'
);

-- Triggers to keep FTS5 in sync
CREATE TRIGGER books_ai AFTER INSERT ON books BEGIN
    INSERT INTO books_fts(rowid, title, authors, publisher, description, tags, isbn)
    VALUES (new.id, new.title, new.authors, new.publisher, new.description, new.tags, new.isbn);
END;

CREATE TRIGGER books_ad AFTER DELETE ON books BEGIN
    DELETE FROM books_fts WHERE rowid = old.id;
END;

CREATE TRIGGER books_au AFTER UPDATE ON books BEGIN
    UPDATE books_fts 
    SET title = new.title,
        authors = new.authors,
        publisher = new.publisher,
        description = new.description,
        tags = new.tags,
        isbn = new.isbn
    WHERE rowid = new.id;
END;

-- Performance indexes
CREATE INDEX idx_books_title ON books(title COLLATE NOCASE);
CREATE INDEX idx_books_added_at ON books(added_at DESC);
CREATE INDEX idx_books_rating ON books(rating DESC);
CREATE INDEX idx_books_primary_format ON books(primary_format);
CREATE INDEX idx_book_formats_book_id ON book_formats(book_id);
CREATE INDEX idx_book_formats_format ON book_formats(format);
CREATE INDEX idx_book_formats_hash ON book_formats(file_hash);
```

**Search Implementation:**

```rust
pub struct SearchQuery {
    pub text: Option<String>,
    pub authors: Vec<String>,
    pub tags: Vec<String>,
    pub formats: Vec<String>,
    pub publishers: Vec<String>,
    pub rating_min: Option<i32>,
    pub added_after: Option<DateTime<Utc>>,
    pub added_before: Option<DateTime<Utc>>,
    pub sort_by: SortField,
    pub sort_order: SortOrder,
    pub limit: usize,
    pub offset: usize,
}

pub enum SortField {
    Title,
    Author,
    AddedDate,
    ModifiedDate,
    Rating,
    Relevance,
}

pub enum SortOrder {
    Ascending,
    Descending,
}

impl LibraryService {
    pub async fn search(&self, query: SearchQuery) -> Result<SearchResults> {
        let start = Instant::now();
        
        // Build SQL query
        let mut sql = String::from("SELECT DISTINCT b.* FROM books b");
        let mut joins = vec![];
        let mut conditions = vec![];
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![];
        
        // Full-text search if text query provided
        if let Some(text) = &query.text {
            joins.push("INNER JOIN books_fts fts ON b.id = fts.rowid");
            conditions.push("books_fts MATCH ?");
            params.push(Box::new(text.clone()));
        }
        
        // Format filter
        if !query.formats.is_empty() {
            joins.push("INNER JOIN book_formats bf ON b.id = bf.book_id");
            let placeholders = query.formats.iter()
                .map(|_| "?")
                .collect::<Vec<_>>()
                .join(", ");
            conditions.push(format!("bf.format IN ({})", placeholders));
            for fmt in &query.formats {
                params.push(Box::new(fmt.clone()));
            }
        }
        
        // Author filter (JSON array search in SQLite)
        if !query.authors.is_empty() {
            for author in &query.authors {
                conditions.push("json_extract(b.authors, '$') LIKE ?");
                params.push(Box::new(format!("%{}%", author)));
            }
        }
        
        // Tag filter
        if !query.tags.is_empty() {
            for tag in &query.tags {
                conditions.push("json_extract(b.tags, '$') LIKE ?");
                params.push(Box::new(format!("%{}%", tag)));
            }
        }
        
        // Rating filter
        if let Some(min_rating) = query.rating_min {
            conditions.push("b.rating >= ?");
            params.push(Box::new(min_rating));
        }
        
        // Date range filters
        if let Some(after) = query.added_after {
            conditions.push("b.added_at >= ?");
            params.push(Box::new(after.to_rfc3339()));
        }
        if let Some(before) = query.added_before {
            conditions.push("b.added_at <= ?");
            params.push(Box::new(before.to_rfc3339()));
        }
        
        // Combine query parts
        if !joins.is_empty() {
            sql.push_str(" ");
            sql.push_str(&joins.join(" "));
        }
        
        if !conditions.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&conditions.join(" AND "));
        }
        
        // Sorting
        let order_by = match query.sort_by {
            SortField::Title => "b.title",
            SortField::Author => "b.authors",
            SortField::AddedDate => "b.added_at",
            SortField::ModifiedDate => "b.modified_at",
            SortField::Rating => "b.rating",
            SortField::Relevance => "rank", // FTS5 relevance
        };
        
        let order_dir = match query.sort_order {
            SortOrder::Ascending => "ASC",
            SortOrder::Descending => "DESC",
        };
        
        sql.push_str(&format!(" ORDER BY {} {} LIMIT ? OFFSET ?", order_by, order_dir));
        params.push(Box::new(query.limit));
        params.push(Box::new(query.offset));
        
        // Execute query
        let books = self.db.query(&sql, params).await?;
        
        let duration = start.elapsed();
        log::info!("[Search] Query took {:?} for {} results", duration, books.len());
        
        // Ensure sub-100ms performance
        if duration.as_millis() > 100 {
            log::warn!("[Search] Query exceeded 100ms target: {:?}", duration);
        }
        
        Ok(SearchResults {
            books,
            total_count: self.count_search_results(&query).await?,
            query_time_ms: duration.as_millis() as u32,
        })
    }
}
```

### 6.3 Virtual Scrolling for Large Libraries

**Frontend Implementation (React):**

```typescript
// src/components/library/VirtualLibraryGrid.tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePremiumLibraryStore } from '@/store/premiumLibraryStore';

export const VirtualLibraryGrid = () => {
  const { books, loadMore, hasMore, isLoading } = usePremiumLibraryStore();
  const parentRef = useRef<HTMLDivElement>(null);
  
  // Calculate grid dimensions
  const ITEM_WIDTH = 200;
  const ITEM_HEIGHT = 320;
  const GAP = 16;
  const ITEMS_PER_ROW = Math.floor((window.innerWidth - 64) / (ITEM_WIDTH + GAP));
  
  // Create row-based virtualizer
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(books.length / ITEMS_PER_ROW),
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT + GAP,
    overscan: 3, // Preload 3 rows above/below viewport
  });
  
  // Infinite scroll detection
  useEffect(() => {
    const lastRow = rowVirtualizer.getVirtualItems().at(-1);
    
    if (!lastRow) return;
    
    // Load more when within 5 rows of the end
    if (
      lastRow.index >= Math.ceil(books.length / ITEMS_PER_ROW) - 5 &&
      hasMore &&
      !isLoading
    ) {
      loadMore();
    }
  }, [rowVirtualizer.getVirtualItems(), books.length, hasMore, isLoading, loadMore]);
  
  return (
    <div ref={parentRef} className="library-scroll-container">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * ITEMS_PER_ROW;
          const rowBooks = books.slice(startIdx, startIdx + ITEMS_PER_ROW);
          
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="library-grid-row">
                {rowBooks.map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

**Backend Pagination (Cursor-based):**

```rust
pub struct PaginationParams {
    pub cursor: Option<String>, // Encoded: "timestamp:id"
    pub limit: usize,           // Default: 100
}

impl LibraryService {
    pub async fn get_books_paginated(&self, params: PaginationParams) -> Result<PaginatedBooks> {
        let limit = params.limit.min(500); // Cap at 500
        
        let (sql, sql_params) = if let Some(cursor) = params.cursor {
            // Decode cursor: "2026-02-18T12:00:00Z:12345"
            let parts: Vec<&str> = cursor.split(':').collect();
            let timestamp = parts[0];
            let last_id: i64 = parts[1].parse()?;
            
            (
                "SELECT * FROM books 
                 WHERE (added_at, id) < (?, ?) 
                 ORDER BY added_at DESC, id DESC 
                 LIMIT ?",
                params![timestamp, last_id, limit]
            )
        } else {
            (
                "SELECT * FROM books 
                 ORDER BY added_at DESC, id DESC 
                 LIMIT ?",
                params![limit]
            )
        };
        
        let books = self.db.query(sql, sql_params).await?;
        
        // Generate next cursor from last item
        let next_cursor = books.last().map(|book| {
            format!("{}:{}", book.added_at.to_rfc3339(), book.id)
        });
        
        Ok(PaginatedBooks {
            books,
            next_cursor,
            has_more: books.len() == limit,
        })
    }
}
```

### 6.4 Duplicate Detection

**Algorithm:** Use file hash (SHA256) + fuzzy title matching

```rust
impl LibraryService {
    pub async fn find_duplicates(&self, book_path: &Path) -> Result<Vec<DuplicateMatch>> {
        let mut duplicates = vec![];
        
        // Stage 1: File hash check (exact duplicates)
        let file_hash = self.calculate_sha256(book_path).await?;
        let hash_matches = self.db.query(
            "SELECT DISTINCT b.* FROM books b
             INNER JOIN book_formats bf ON b.id = bf.book_id
             WHERE bf.file_hash = ?",
            params![file_hash]
        ).await?;
        
        for book in hash_matches {
            duplicates.push(DuplicateMatch {
                book,
                match_type: MatchType::ExactFileHash,
                confidence: 1.0,
            });
        }
        
        // Stage 2: Metadata similarity (fuzzy matching)
        let adapter = self.detect_and_get_adapter(book_path).await?;
        let metadata = adapter.extract_metadata(book_path).await?;
        
        // Normalize title for comparison
        let normalized_title = normalize_title(&metadata.title);
        
        // Search by ISBN (exact match)
        if let Some(isbn) = &metadata.isbn {
            let isbn_matches = self.db.query(
                "SELECT * FROM books WHERE isbn = ?",
                params![isbn]
            ).await?;
            
            for book in isbn_matches {
                if !duplicates.iter().any(|d| d.book.id == book.id) {
                    duplicates.push(DuplicateMatch {
                        book,
                        match_type: MatchType::ISBN,
                        confidence: 0.98,
                    });
                }
            }
        }
        
        // Search by title similarity (Levenshtein distance)
        let all_books = self.db.query(
            "SELECT * FROM books WHERE title LIKE ?",
            params![format!("%{}%", &metadata.title[..metadata.title.len().min(10)])]
        ).await?;
        
        for book in all_books {
            let similarity = calculate_similarity(&normalized_title, &normalize_title(&book.title));
            
            // Also compare authors
            let author_match = metadata.authors.iter()
                .any(|a| book.authors.iter().any(|ba| ba.name.contains(a)));
            
            if similarity > 0.85 && author_match {
                if !duplicates.iter().any(|d| d.book.id == book.id) {
                    duplicates.push(DuplicateMatch {
                        book,
                        match_type: MatchType::TitleAuthor,
                        confidence: similarity,
                    });
                }
            }
        }
        
        // Sort by confidence
        duplicates.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());
        
        Ok(duplicates)
    }
}

fn normalize_title(title: &str) -> String {
    title
        .to_lowercase()
        .replace("the ", "")
        .replace("a ", "")
        .replace("an ", "")
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect()
}

fn calculate_similarity(a: &str, b: &str) -> f32 {
    let distance = levenshtein(a, b);
    let max_len = a.len().max(b.len());
    1.0 - (distance as f32 / max_len as f32)
}
```

---

## ⚡ 7. PERFORMANCE STRATEGY

### 7.1 Cache Hierarchy

**Three-tier caching system:**

```rust
pub struct CacheManager {
    // L1: Hot data in memory (covers, metadata, TOCs)
    l1_cache: Arc<Mutex<LruCache<CacheKey, CacheValue>>>,
    l1_size_bytes: AtomicU64,
    l1_max_bytes: u64, // 400MB
    
    // L2: Warm data on disk (compressed metadata)
    l2_cache_dir: PathBuf,
    
    // L3: Database (cold data)
    db: Arc<Database>,
}

pub enum CacheKey {
    Cover(Uuid, CoverSize),
    Metadata(i64),
    Toc(i64, String), // book_id + format
    ChapterContent(i64, String), // book_id + chapter_id
}

pub enum CacheValue {
    Cover(Arc<DynamicImage>),
    Metadata(Arc<BookMetadata>),
    Toc(Arc<Vec<TocEntry>>),
    Chapter(Arc<String>),
}

impl CacheManager {
    pub fn new(cache_dir: PathBuf) -> Self {
        Self {
            l1_cache: Arc::new(Mutex::new(LruCache::new(10000))),
            l1_size_bytes: AtomicU64::new(0),
            l1_max_bytes: 400 * 1024 * 1024, // 400MB
            l2_cache_dir: cache_dir,
            db: Arc::new(Database::open("shiori.db")?),
        }
    }
    
    pub async fn get<T: Clone>(&self, key: &CacheKey) -> Option<T> {
        // Try L1 cache first
        if let Some(value) = self.l1_cache.lock().await.get(key) {
            return self.extract_value(value);
        }
        
        // Try L2 cache (disk)
        if let Some(value) = self.load_from_l2(key).await.ok().flatten() {
            self.promote_to_l1(key.clone(), value.clone()).await;
            return self.extract_value(&value);
        }
        
        // Cache miss
        None
    }
    
    pub async fn put(&self, key: CacheKey, value: CacheValue) {
        let value_size = self.estimate_size(&value);
        
        // Evict if necessary
        while self.l1_size_bytes.load(Ordering::Relaxed) + value_size > self.l1_max_bytes {
            if let Some((evicted_key, evicted_value)) = self.l1_cache.lock().await.pop_lru() {
                let evicted_size = self.estimate_size(&evicted_value);
                self.l1_size_bytes.fetch_sub(evicted_size, Ordering::Relaxed);
                
                // Write evicted item to L2 cache
                self.save_to_l2(&evicted_key, &evicted_value).await.ok();
            } else {
                break;
            }
        }
        
        // Add to L1 cache
        self.l1_cache.lock().await.put(key.clone(), value);
        self.l1_size_bytes.fetch_add(value_size, Ordering::Relaxed);
    }
    
    fn estimate_size(&self, value: &CacheValue) -> u64 {
        match value {
            CacheValue::Cover(img) => {
                let (w, h) = (img.width(), img.height());
                (w * h * 4) as u64 // RGBA
            }
            CacheValue::Metadata(meta) => {
                std::mem::size_of::<BookMetadata>() as u64
            }
            CacheValue::Toc(toc) => {
                toc.len() as u64 * 200 // Rough estimate
            }
            CacheValue::Chapter(content) => {
                content.len() as u64
            }
        }
    }
    
    async fn save_to_l2(&self, key: &CacheKey, value: &CacheValue) -> Result<()> {
        let path = self.l2_cache_path(key);
        tokio::fs::create_dir_all(path.parent().unwrap()).await?;
        
        // Serialize and compress
        let serialized = bincode::serialize(value)?;
        let compressed = zstd::encode_all(&serialized[..], 3)?;
        
        tokio::fs::write(&path, compressed).await?;
        Ok(())
    }
    
    async fn load_from_l2(&self, key: &CacheKey) -> Result<Option<CacheValue>> {
        let path = self.l2_cache_path(key);
        
        if !path.exists() {
            return Ok(None);
        }
        
        let compressed = tokio::fs::read(&path).await?;
        let decompressed = zstd::decode_all(&compressed[..])?;
        let value = bincode::deserialize(&decompressed)?;
        
        Ok(Some(value))
    }
}
```

### 7.2 Memory Management (500MB Cap)

**Global memory tracking:**

```rust
pub struct MemoryManager {
    total_allocated: AtomicU64,
    max_allowed: u64, // 500MB
    allocations: Arc<DashMap<String, AllocationInfo>>,
}

pub struct AllocationInfo {
    pub size_bytes: u64,
    pub component: String,
    pub allocated_at: Instant,
}

impl MemoryManager {
    pub fn new(max_mb: u64) -> Self {
        Self {
            total_allocated: AtomicU64::new(0),
            max_allowed: max_mb * 1024 * 1024,
            allocations: Arc::new(DashMap::new()),
        }
    }
    
    pub fn allocate(&self, component: &str, size_bytes: u64) -> Result<AllocationToken> {
        let current = self.total_allocated.load(Ordering::Relaxed);
        
        if current + size_bytes > self.max_allowed {
            // Try to free memory by triggering cache eviction
            self.request_memory_cleanup(size_bytes);
            
            // Check again
            let current = self.total_allocated.load(Ordering::Relaxed);
            if current + size_bytes > self.max_allowed {
                return Err(Error::OutOfMemory {
                    requested: size_bytes,
                    available: self.max_allowed.saturating_sub(current),
                });
            }
        }
        
        let token = AllocationToken::new();
        self.allocations.insert(
            token.id.clone(),
            AllocationInfo {
                size_bytes,
                component: component.to_string(),
                allocated_at: Instant::now(),
            }
        );
        
        self.total_allocated.fetch_add(size_bytes, Ordering::Relaxed);
        
        Ok(token)
    }
    
    pub fn deallocate(&self, token: AllocationToken) {
        if let Some((_, info)) = self.allocations.remove(&token.id) {
            self.total_allocated.fetch_sub(info.size_bytes, Ordering::Relaxed);
        }
    }
    
    pub fn get_usage_report(&self) -> MemoryReport {
        let total = self.total_allocated.load(Ordering::Relaxed);
        let mut by_component: HashMap<String, u64> = HashMap::new();
        
        for entry in self.allocations.iter() {
            *by_component.entry(entry.component.clone()).or_insert(0) += entry.size_bytes;
        }
        
        MemoryReport {
            total_bytes: total,
            max_bytes: self.max_allowed,
            usage_percent: (total as f32 / self.max_allowed as f32) * 100.0,
            by_component,
        }
    }
}
```

### 7.3 Database Query Optimization

**Prepared statement caching:**

```rust
pub struct PreparedStatementCache {
    cache: Arc<Mutex<LruCache<String, CachedStatement>>>,
}

impl Database {
    pub async fn query_cached(&self, sql: &str, params: Vec<Value>) -> Result<Vec<Row>> {
        // Check if statement is cached
        let stmt = if let Some(cached) = self.stmt_cache.get(sql).await {
            cached
        } else {
            // Prepare and cache
            let stmt = self.conn.prepare(sql)?;
            self.stmt_cache.put(sql.to_string(), stmt.clone()).await;
            stmt
        };
        
        // Execute with params
        stmt.query_map(params, |row| {
            // Map row to struct
        })
    }
}
```

**Index monitoring:**

```rust
impl Database {
    pub async fn analyze_query(&self, sql: &str) -> QueryAnalysis {
        let explain = self.raw_query(&format!("EXPLAIN QUERY PLAN {}", sql), vec![]).await?;
        
        let uses_index = explain.iter().any(|row| {
            row.get::<_, String>("detail")
                .map(|d| d.contains("USING INDEX"))
                .unwrap_or(false)
        });
        
        QueryAnalysis {
            uses_index,
            estimated_rows: self.estimate_rows(&explain),
            recommendations: if !uses_index {
                vec!["Consider adding an index".to_string()]
            } else {
                vec![]
            },
        }
    }
}
```

### 7.4 Background Workers & Thread Pool

**Tokio task organization:**

```rust
pub struct TaskManager {
    // Conversion workers (CPU-bound)
    conversion_pool: Arc<ThreadPool>,
    
    // I/O workers (async)
    io_runtime: Arc<Runtime>,
    
    // Scheduler (cron jobs)
    scheduler: Arc<Scheduler>,
}

impl TaskManager {
    pub fn new() -> Self {
        // CPU-bound conversion workers
        let conversion_pool = Arc::new(
            ThreadPoolBuilder::new()
                .num_threads(4)
                .thread_name(|i| format!("conversion-worker-{}", i))
                .build()
                .unwrap()
        );
        
        // Async I/O runtime
        let io_runtime = Arc::new(
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .thread_name("io-worker")
                .enable_all()
                .build()
                .unwrap()
        );
        
        Self {
            conversion_pool,
            io_runtime,
            scheduler: Arc::new(Scheduler::new()),
        }
    }
    
    pub fn spawn_conversion<F>(&self, task: F)
    where
        F: FnOnce() -> Result<()> + Send + 'static,
    {
        self.conversion_pool.spawn(move || {
            if let Err(e) = task() {
                log::error!("[Conversion] Task failed: {}", e);
            }
        });
    }
    
    pub fn spawn_io<F>(&self, task: F)
    where
        F: Future<Output = Result<()>> + Send + 'static,
    {
        self.io_runtime.spawn(async move {
            if let Err(e) = task.await {
                log::error!("[IO] Task failed: {}", e);
            }
        });
    }
}
```

---

## 🗄 8. DATABASE SCHEMA ADDITIONS

### 8.1 Complete Schema (New Tables)

```sql
-- Multi-format support
CREATE TABLE book_formats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    format TEXT NOT NULL CHECK(format IN ('epub', 'pdf', 'mobi', 'azw3', 'fb2', 
                                          'docx', 'txt', 'html', 'cbz', 'cbr')),
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_hash TEXT NOT NULL UNIQUE, -- SHA256 for deduplication
    page_count INTEGER,
    word_count INTEGER,
    is_primary INTEGER DEFAULT 0,
    added_at TEXT NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX idx_book_formats_book_id ON book_formats(book_id);
CREATE INDEX idx_book_formats_format ON book_formats(format);
CREATE INDEX idx_book_formats_hash ON book_formats(file_hash);
CREATE INDEX idx_book_formats_primary ON book_formats(book_id, is_primary);

-- RSS feed system
CREATE TABLE rss_feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    fetch_interval_hours INTEGER DEFAULT 12,
    last_fetched TEXT,
    last_success TEXT,
    failure_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE rss_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id INTEGER NOT NULL,
    guid TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    author TEXT,
    link TEXT NOT NULL,
    content TEXT NOT NULL,
    published_at TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    epub_book_id INTEGER, -- Link to generated EPUB
    FOREIGN KEY (feed_id) REFERENCES rss_feeds(id) ON DELETE CASCADE,
    FOREIGN KEY (epub_book_id) REFERENCES books(id) ON DELETE SET NULL
);

CREATE INDEX idx_rss_articles_feed ON rss_articles(feed_id);
CREATE INDEX idx_rss_articles_published ON rss_articles(published_at DESC);
CREATE INDEX idx_rss_articles_guid ON rss_articles(guid);

-- Book sharing system
CREATE TABLE shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    book_id INTEGER NOT NULL,
    format TEXT NOT NULL,
    password_hash TEXT, -- Argon2 hash
    expires_at TEXT NOT NULL,
    max_accesses INTEGER,
    access_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE share_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_token TEXT NOT NULL,
    accessed_at TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    success INTEGER DEFAULT 1,
    failure_reason TEXT
);

CREATE INDEX idx_shares_token ON shares(token);
CREATE INDEX idx_shares_expires ON shares(expires_at);
CREATE INDEX idx_shares_active ON shares(token, revoked_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_share_access_token ON share_access_log(share_token);
CREATE INDEX idx_share_access_time ON share_access_log(accessed_at DESC);

-- Conversion job tracking
CREATE TABLE conversion_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    book_id INTEGER NOT NULL,
    source_format TEXT NOT NULL,
    target_format TEXT NOT NULL,
    source_path TEXT NOT NULL,
    target_path TEXT,
    status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    progress REAL DEFAULT 0.0,
    error_message TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX idx_conversion_jobs_uuid ON conversion_jobs(uuid);
CREATE INDEX idx_conversion_jobs_status ON conversion_jobs(status);
CREATE INDEX idx_conversion_jobs_book ON conversion_jobs(book_id);

-- Cover cache metadata
CREATE TABLE cover_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    size TEXT NOT NULL CHECK(size IN ('thumb', 'medium', 'full')),
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    last_accessed TEXT NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX idx_cover_cache_book ON cover_cache(book_id);
CREATE INDEX idx_cover_cache_size ON cover_cache(book_id, size);
CREATE INDEX idx_cover_cache_accessed ON cover_cache(last_accessed);
```

### 8.2 Migration Strategy

```rust
pub struct MigrationManager {
    db: Arc<Database>,
}

impl MigrationManager {
    pub async fn run_migrations(&self) -> Result<()> {
        let current_version = self.get_schema_version().await?;
        
        log::info!("[Migration] Current schema version: {}", current_version);
        
        // Apply migrations in order
        if current_version < 2 {
            self.migrate_to_v2().await?;
        }
        if current_version < 3 {
            self.migrate_to_v3().await?;
        }
        
        log::info!("[Migration] All migrations applied successfully");
        Ok(())
    }
    
    async fn migrate_to_v2(&self) -> Result<()> {
        log::info!("[Migration] Migrating to v2: Multi-format support");
        
        self.db.execute_batch(r#"
            -- Add primary_format column to books table
            ALTER TABLE books ADD COLUMN primary_format TEXT DEFAULT 'epub';
            
            -- Create book_formats table
            CREATE TABLE book_formats ( ... );
            
            -- Migrate existing books to book_formats
            INSERT INTO book_formats (book_id, format, file_path, file_size, file_hash, is_primary, added_at)
            SELECT 
                id, 
                file_format, 
                file_path, 
                file_size,
                NULL, -- Hash needs to be calculated
                1,
                added_at
            FROM books;
            
            -- Update schema version
            PRAGMA user_version = 2;
        "#).await?;
        
        // Calculate file hashes for existing books
        let books = self.db.query("SELECT id, file_path FROM books", vec![]).await?;
        for book in books {
            let hash = self.calculate_file_hash(&book.file_path).await?;
            self.db.execute(
                "UPDATE book_formats SET file_hash = ? WHERE book_id = ?",
                params![hash, book.id]
            ).await?;
        }
        
        Ok(())
    }
    
    async fn migrate_to_v3(&self) -> Result<()> {
        log::info!("[Migration] Migrating to v3: RSS and sharing");
        
        self.db.execute_batch(r#"
            CREATE TABLE rss_feeds ( ... );
            CREATE TABLE rss_articles ( ... );
            CREATE TABLE shares ( ... );
            CREATE TABLE share_access_log ( ... );
            CREATE TABLE conversion_jobs ( ... );
            CREATE TABLE cover_cache ( ... );
            
            PRAGMA user_version = 3;
        "#).await?;
        
        Ok(())
    }
    
    async fn get_schema_version(&self) -> Result<i32> {
        let result = self.db.raw_query("PRAGMA user_version", vec![]).await?;
        Ok(result[0].get("user_version").unwrap_or(1))
    }
}
```

---

## 🔧 9. THREADING & WORKER MODEL

### 9.1 Tokio Task Organization

```
┌─────────────────────────────────────────────────────────────────┐
│                    MAIN TOKIO RUNTIME                            │
│                   (Tauri event loop)                             │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ UI Commands  │  │ IPC Handler  │  │ Event Bus    │          │
│  │ (async)      │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  LibraryService, ReaderService, FormatService, etc.      │   │
│  │  (async methods, lightweight)                            │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────┬─────────────────────┬───────────────────────────┘
                │                     │
                ▼                     ▼
┌───────────────────────────┐  ┌──────────────────────────────────┐
│   BACKGROUND WORKERS       │  │   CONVERSION THREAD POOL         │
│   (Tokio tasks)            │  │   (rayon)                        │
│                            │  │                                  │
│  ┌──────────────────────┐ │  │  ┌─────────────────────────────┐│
│  │ RSS Scheduler        │ │  │  │ Worker 1: MOBI→EPUB         ││
│  │ - Tick every hour    │ │  │  │ Worker 2: TXT→EPUB          ││
│  │ - Fetch feeds        │ │  │  │ Worker 3: DOCX→EPUB         ││
│  └──────────────────────┘ │  │  │ Worker 4: PDF→Text          ││
│                            │  │  └─────────────────────────────┘│
│  ┌──────────────────────┐ │  │                                  │
│  │ Cache Evictor        │ │  │  (CPU-bound conversions)         │
│  │ - Check every 5 min  │ │  │                                  │
│  └──────────────────────┘ │  └──────────────────────────────────┘
│                            │
│  ┌──────────────────────┐ │
│  │ Share Cleanup        │ │
│  │ - Expire old shares  │ │
│  └──────────────────────┘ │
└────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────────────────┐
│                  HTTP SHARE SERVER                              │
│              (Separate tokio runtime)                           │
│                                                                  │
│  axum::Server on localhost:8080                                 │
│  - Handle share page requests                                   │
│  - Stream book downloads                                        │
│  - Validate passwords/expiration                                │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Channel Architecture

```rust
pub struct AppChannels {
    // Conversion job queue
    pub conversion_tx: mpsc::UnboundedSender<ConversionRequest>,
    pub conversion_rx: mpsc::UnboundedReceiver<ConversionRequest>,
    
    // Progress updates (broadcast to UI)
    pub progress_tx: broadcast::Sender<ProgressUpdate>,
    
    // Library change notifications
    pub library_changed_tx: broadcast::Sender<LibraryEvent>,
    
    // Shutdown signal
    pub shutdown_tx: broadcast::Sender<()>,
}

pub enum ProgressUpdate {
    ConversionStarted { job_id: Uuid },
    ConversionProgress { job_id: Uuid, progress: f32 },
    ConversionCompleted { job_id: Uuid, result: Result<PathBuf> },
    
    ImportStarted { file_path: PathBuf },
    ImportProgress { file_path: PathBuf, progress: f32 },
    ImportCompleted { file_path: PathBuf, book_id: i64 },
}

pub enum LibraryEvent {
    BookAdded(i64),
    BookUpdated(i64),
    BookDeleted(i64),
    FormatAdded { book_id: i64, format: String },
}

impl AppChannels {
    pub fn new() -> Self {
        let (conversion_tx, conversion_rx) = mpsc::unbounded_channel();
        let (progress_tx, _) = broadcast::channel(100);
        let (library_changed_tx, _) = broadcast::channel(100);
        let (shutdown_tx, _) = broadcast::channel(1);
        
        Self {
            conversion_tx,
            conversion_rx,
            progress_tx,
            library_changed_tx,
            shutdown_tx,
        }
    }
    
    pub fn spawn_workers(&self) {
        // Conversion worker pool
        for worker_id in 0..4 {
            let mut rx = self.conversion_rx.clone();
            let progress_tx = self.progress_tx.clone();
            let mut shutdown_rx = self.shutdown_tx.subscribe();
            
            tokio::spawn(async move {
                loop {
                    tokio::select! {
                        Some(req) = rx.recv() => {
                            process_conversion_request(req, &progress_tx).await;
                        }
                        _ = shutdown_rx.recv() => {
                            log::info!("[Worker-{}] Shutting down", worker_id);
                            break;
                        }
                    }
                }
            });
        }
    }
}
```

### 9.3 Resource Cleanup on Shutdown

```rust
impl App {
    pub async fn shutdown(&self) -> Result<()> {
        log::info!("[App] Initiating graceful shutdown");
        
        // 1. Stop accepting new work
        self.channels.shutdown_tx.send(()).ok();
        
        // 2. Wait for in-flight conversions to complete (with timeout)
        let timeout = Duration::from_secs(30);
        let start = Instant::now();
        
        while self.active_conversions() > 0 {
            if start.elapsed() > timeout {
                log::warn!("[App] Shutdown timeout reached, cancelling conversions");
                self.cancel_all_conversions().await;
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        
        // 3. Flush caches to disk
        self.cache_manager.flush_all().await?;
        
        // 4. Close database connections
        self.db.close().await?;
        
        // 5. Stop HTTP share server
        if let Some(server) = &self.share_server {
            server.shutdown().await?;
        }
        
        log::info!("[App] Shutdown complete");
        Ok(())
    }
}
```

---

## 🧪 10. TESTING PLAN

### 10.1 Unit Tests (Format Adapters)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_epub_adapter_metadata_extraction() {
        let adapter = EpubAdapter::new();
        let test_file = Path::new("test_assets/sample.epub");
        
        let metadata = adapter.extract_metadata(test_file).await.unwrap();
        
        assert_eq!(metadata.title, "Sample Book");
        assert!(metadata.authors.contains(&"Test Author".to_string()));
        assert!(metadata.isbn.is_some());
    }
    
    #[tokio::test]
    async fn test_epub_adapter_cover_extraction() {
        let adapter = EpubAdapter::new();
        let test_file = Path::new("test_assets/sample_with_cover.epub");
        
        let cover = adapter.extract_cover(test_file).await.unwrap();
        
        assert!(cover.is_some());
        let cover_img = cover.unwrap();
        assert!(cover_img.width() > 0);
        assert!(cover_img.height() > 0);
    }
    
    #[tokio::test]
    async fn test_format_detection() {
        let test_cases = vec![
            ("test_assets/sample.epub", "epub"),
            ("test_assets/sample.pdf", "pdf"),
            ("test_assets/sample.mobi", "mobi"),
            ("test_assets/sample.txt", "txt"),
        ];
        
        for (path, expected_format) in test_cases {
            let detected = detect_format(Path::new(path)).await.unwrap();
            assert_eq!(detected.format, expected_format);
        }
    }
}
```

### 10.2 Integration Tests (Conversion Pipeline)

```rust
#[tokio::test]
async fn test_txt_to_epub_conversion() {
    let engine = ConversionEngine::new(2);
    let source = Path::new("test_assets/sample.txt");
    let target = Path::new("test_output/sample_converted.epub");
    
    let job_id = engine.submit_conversion(source.to_path_buf(), "epub").await.unwrap();
    
    // Wait for completion
    let mut checks = 0;
    loop {
        let job = engine.get_job_status(job_id).await.unwrap();
        
        match job.status {
            ConversionStatus::Completed => break,
            ConversionStatus::Failed => panic!("Conversion failed: {:?}", job.error),
            _ => {
                checks += 1;
                if checks > 60 {
                    panic!("Conversion timeout");
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    }
    
    // Verify output file
    assert!(target.exists());
    
    // Validate EPUB structure
    let adapter = EpubAdapter::new();
    let validation = adapter.validate(target).await.unwrap();
    assert!(validation.is_valid);
}
```

### 10.3 Stress Tests (10,000 Books)

```rust
#[tokio::test]
#[ignore] // Run with: cargo test --ignored stress_test_import
async fn stress_test_import_10k_books() {
    let library = LibraryService::new("test_library.db").await.unwrap();
    
    let start = Instant::now();
    
    // Generate 10,000 dummy EPUB files
    for i in 0..10_000 {
        let test_epub = generate_dummy_epub(i).await;
        library.import_book(&test_epub).await.unwrap();
        
        if i % 1000 == 0 {
            log::info!("Imported {} books", i);
        }
    }
    
    let import_duration = start.elapsed();
    log::info!("Import completed in {:?}", import_duration);
    
    // Test search performance
    let search_start = Instant::now();
    let results = library.search(SearchQuery {
        text: Some("test".to_string()),
        limit: 100,
        ..Default::default()
    }).await.unwrap();
    
    let search_duration = search_start.elapsed();
    log::info!("Search completed in {:?}", search_duration);
    
    // Assert sub-100ms search
    assert!(search_duration.as_millis() < 100, 
            "Search took {}ms, expected < 100ms", 
            search_duration.as_millis());
    
    assert!(results.books.len() > 0);
}
```

### 10.4 Corruption Tests

```rust
#[tokio::test]
async fn test_corrupted_epub_handling() {
    let adapter = EpubAdapter::new();
    let corrupted_file = Path::new("test_assets/corrupted.epub");
    
    // Create corrupted EPUB by truncating a valid one
    let valid = tokio::fs::read("test_assets/valid.epub").await.unwrap();
    tokio::fs::write(corrupted_file, &valid[..valid.len() / 2]).await.unwrap();
    
    // Should detect corruption gracefully
    let validation = adapter.validate(corrupted_file).await.unwrap();
    assert!(!validation.is_valid);
    assert!(validation.errors.len() > 0);
    
    // Metadata extraction should return error, not panic
    let result = adapter.extract_metadata(corrupted_file).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_malicious_zip_bomb() {
    let adapter = EpubAdapter::new();
    let zip_bomb = Path::new("test_assets/zip_bomb.epub");
    
    // Validation should detect excessive compression ratio
    let validation = adapter.validate(zip_bomb).await.unwrap();
    assert!(!validation.is_valid);
    assert!(validation.errors.iter().any(|e| e.contains("compression ratio")));
}
```

### 10.5 Memory Leak Detection

```bash
#!/bin/bash
# Run with Valgrind to detect memory leaks

# Build release binary
cargo build --release

# Run with Valgrind
valgrind --leak-check=full \
         --show-leak-kinds=all \
         --track-origins=yes \
         --log-file=valgrind.log \
         ./target/release/shiori --test-mode

# Parse results
echo "=== Memory Leak Report ==="
grep "definitely lost" valgrind.log
grep "indirectly lost" valgrind.log
grep "still reachable" valgrind.log
```

### 10.6 Performance Benchmarks

```rust
#[bench]
fn bench_format_detection(b: &mut Bencher) {
    let test_file = Path::new("test_assets/sample.epub");
    
    b.iter(|| {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(detect_format(test_file)).unwrap();
    });
}

#[bench]
fn bench_metadata_extraction(b: &mut Bencher) {
    let adapter = EpubAdapter::new();
    let test_file = Path::new("test_assets/sample.epub");
    
    b.iter(|| {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(adapter.extract_metadata(test_file)).unwrap();
    });
}

#[bench]
fn bench_search_50k_books(b: &mut Bencher) {
    let library = setup_50k_book_library();
    
    b.iter(|| {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(library.search(SearchQuery {
            text: Some("science fiction".to_string()),
            limit: 100,
            ..Default::default()
        })).unwrap();
    });
}
```

---

## 📋 IMPLEMENTATION CHECKLIST

### Phase 1: Foundation ✅
- [x] Premium reader interface
- [x] Critical bug fixes
- [x] Architecture document

### Phase 2: Multi-Format Support (Next)
- [ ] Implement `BookFormatAdapter` trait
- [ ] Create format detection with magic bytes
- [ ] Build EPUB adapter
- [ ] Build PDF adapter
- [ ] Build MOBI/AZW3 adapter
- [ ] Build TXT/HTML/FB2/DOCX adapters
- [ ] Build CBZ/CBR adapters
- [ ] Add `book_formats` database table
- [ ] Implement multi-format per book in LibraryService

### Phase 3: Core Features
- [ ] Cover extraction for all formats
- [ ] Geometric pattern cover generator
- [ ] Cover cache with LRU eviction
- [ ] Virtual scrolling in frontend
- [ ] FTS5 search optimization
- [ ] Cursor-based pagination
- [ ] Duplicate detection algorithm

### Phase 4: Conversion Engine
- [ ] Conversion worker queue
- [ ] TXT → EPUB converter
- [ ] MOBI → EPUB converter
- [ ] DOCX → EPUB converter
- [ ] HTML → EPUB converter
- [ ] FB2 → EPUB converter
- [ ] PDF → Text extractor
- [ ] Job tracking with progress updates
- [ ] Temp file safety & rollback

### Phase 5: RSS System
- [ ] RSS feed parser with `feed-rs`
- [ ] Scheduler with cron jobs
- [ ] Article storage & deduplication
- [ ] Daily EPUB generation
- [ ] HTML sanitization with `ammonia`
- [ ] RSS database tables

### Phase 6: Sharing System
- [ ] Share service with token generation
- [ ] Password hashing with Argon2
- [ ] Expiration & access limit enforcement
- [ ] QR code generation
- [ ] HTTP server with Axum
- [ ] Access logging
- [ ] Share database tables

### Phase 7: Performance & Polish
- [ ] 3-tier cache hierarchy
- [ ] Memory manager (500MB cap)
- [ ] Prepared statement caching
- [ ] Background worker threads
- [ ] Graceful shutdown
- [ ] Database migrations

### Phase 8: Testing
- [ ] Unit tests for all adapters
- [ ] Integration tests for conversions
- [ ] Stress test: 10k book import
- [ ] Corruption tests
- [ ] Memory leak detection
- [ ] Performance benchmarks

---

## 🎯 SUCCESS METRICS

| Metric | Target | Current |
|--------|--------|---------|
| **Supported Formats** | 11 | 2 (EPUB, PDF) |
| **Search Latency** | < 100ms @ 50k books | TBD |
| **Memory Usage** | < 500MB | TBD |
| **Conversion Speed** | MOBI→EPUB in < 5s | TBD |
| **Import Speed** | 100 books/min | TBD |
| **RSS Reliability** | < 1% failure rate | TBD |
| **Share Uptime** | 99.9% | TBD |

---

**Document Version:** 2.0  
**Last Updated:** February 18, 2026  
**Status:** Complete - Ready for Implementation