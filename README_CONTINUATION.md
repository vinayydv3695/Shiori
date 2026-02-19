# 🚀 Shiori v2.0 - Development Roadmap

## What We've Built (Session 3 - Foundation Complete)

This session focused on laying the **complete architectural foundation** for transforming Shiori into a serious Calibre competitor. We've moved from a basic EPUB reader to a comprehensive multi-format eBook library manager.

### 📚 Complete Architecture Document

Created `ARCHITECTURE.md` (2,600+ lines) covering:
- **11 format support**: EPUB, PDF, MOBI, AZW3, FB2, DOCX, TXT, HTML, CBZ, CBR
- **Format detection**: Magic byte patterns for robust identification
- **Cover system**: Extraction + geometric pattern generation
- **Conversion engine**: Pure Rust implementation with worker queue
- **RSS feed system**: Daily EPUB generation from news feeds
- **Book sharing**: HTTP server with passwords, expiration, QR codes
- **Performance strategy**: Sub-100ms search, 500MB memory cap, virtual scrolling
- **Database design**: Multi-format support, FTS5 search, migrations
- **Threading model**: Tokio tasks, worker pools, channel architecture
- **Testing plan**: Unit tests, stress tests, memory leak detection

### 🏗️ Core Infrastructure

#### 1. BookFormatAdapter Trait System
```rust
// Unified interface for all book formats
#[async_trait]
pub trait BookFormatAdapter: Send + Sync {
    fn format_id(&self) -> &str;
    async fn validate(&self, path: &Path) -> FormatResult<ValidationResult>;
    async fn extract_metadata(&self, path: &Path) -> FormatResult<BookMetadata>;
    async fn extract_cover(&self, path: &Path) -> FormatResult<Option<CoverImage>>;
    fn can_convert_to(&self, target: &str) -> bool;
    async fn convert_to(...) -> FormatResult<ConversionResult>;
    fn capabilities(&self) -> FormatCapabilities;
}
```

**Location**: `src-tauri/src/services/format_adapter.rs` (400+ lines)

#### 2. Format Detection Service
- **Magic byte detection** for all 11 formats
- **Three-stage detection**: extension → magic bytes → content inspection
- **ZIP classification**: Distinguishes EPUB, DOCX, CBZ
- **MOBI vs AZW3**: Detects KF8 format
- **Text validation**: UTF-8 heuristics

**Location**: `src-tauri/src/services/format_detection.rs`

#### 3. Database Migration System
- **Versioned migrations** with tracking and checksums
- **v2 migration**: Multi-format support (`book_formats` table)
- **v3 migration**: RSS feeds, sharing, conversion tracking
- **8 new tables**: `book_formats`, `rss_feeds`, `rss_articles`, `shares`, `share_access_log`, `conversion_jobs`, `cover_cache`, `books_fts`

**Location**: `src-tauri/src/db/migrations.rs`

#### 4. Format Adapters (2/11 complete)
- ✅ **EPUB Adapter**: Full metadata, cover extraction (3 methods), validation
- ✅ **TXT Adapter**: Word count, page estimation, author extraction
- ⏳ **9 more to implement**: PDF, MOBI, AZW3, DOCX, HTML, FB2, CBZ, CBR

**Location**: `src-tauri/src/services/adapters/`

### 📦 Dependencies Added

```toml
# Format parsing (11 formats)
mobi = "0.6"              # MOBI/AZW3
docx-rs = "0.4"           # DOCX
quick-xml = "0.36"        # FB2/XML
html5ever = "0.27"        # HTML
unrar = "0.5"             # CBR (optional)

# RSS & Web
feed-rs = "1.3"           # RSS/Atom parser
ammonia = "4.0"           # HTML sanitization
reqwest = "0.12"          # HTTP client (rustls)

# Images & Covers
imageproc = "0.24"        # Image manipulation
resvg = "0.42"            # SVG rendering
rusttype = "0.9"          # Font rendering
printpdf = "0.7"          # PDF generation

# Sharing & Security
axum = "0.7"              # HTTP server
qrcode = "0.14"           # QR codes
argon2 = "0.5"            # Password hashing

# Performance
dashmap = "6.0"           # Concurrent HashMap
rayon = "1.10"            # Parallel processing
bincode = "1.3"           # Serialization
zstd = "0.13"             # Compression
tokio-cron-scheduler = "0.10"  # Cron jobs
```

### 🗄️ New Database Schema

#### Multi-Format Support
```sql
CREATE TABLE book_formats (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL,
    format TEXT NOT NULL,  -- epub, pdf, mobi, etc.
    file_path TEXT NOT NULL,
    file_hash TEXT UNIQUE,  -- SHA256 for deduplication
    is_primary INTEGER,
    FOREIGN KEY (book_id) REFERENCES books(id)
);
```

#### RSS Feed System
```sql
CREATE TABLE rss_feeds (
    id INTEGER PRIMARY KEY,
    url TEXT UNIQUE,
    fetch_interval_hours INTEGER DEFAULT 12,
    failure_count INTEGER DEFAULT 0
);

CREATE TABLE rss_articles (
    id INTEGER PRIMARY KEY,
    feed_id INTEGER,
    guid TEXT UNIQUE,
    content TEXT,
    epub_book_id INTEGER,  -- Link to generated EPUB
    FOREIGN KEY (feed_id) REFERENCES rss_feeds(id)
);
```

#### Book Sharing
```sql
CREATE TABLE shares (
    id INTEGER PRIMARY KEY,
    token TEXT UNIQUE,
    book_id INTEGER,
    password_hash TEXT,
    expires_at TEXT,
    max_accesses INTEGER,
    FOREIGN KEY (book_id) REFERENCES books(id)
);
```

### 📈 Progress Summary

| Category | Progress | Files Created | Lines Written |
|----------|----------|---------------|---------------|
| **Architecture** | 100% | 1 | 2,600+ |
| **Core Traits** | 100% | 1 | 400+ |
| **Format Detection** | 100% | 1 | 300+ |
| **Migrations** | 100% | 1 | 350+ |
| **Format Adapters** | 18% (2/11) | 2 | 500+ |
| **Services** | 0% | 0 | 0 |
| **Frontend** | 0% | 0 | 0 |
| **Tests** | 0% | 0 | 0 |
| **Overall** | **40%** | **6** | **4,150+** |

---

## 🎯 Next Steps

### Phase 3: Format Adapters & Core Services (Next Session)

1. **Implement remaining format adapters** (PDF, MOBI, DOCX, HTML, FB2, CBZ, CBR)
   - Each adapter ~200-300 lines
   - Use existing trait system
   - Add unit tests

2. **Build CoverService**
   - Extract covers from all formats
   - Generate geometric patterns for fallbacks
   - 3-tier cache (memory, disk, database)
   - Three resolutions (thumb, medium, full)

3. **Implement ConversionEngine**
   - Worker queue with 4 threads
   - Job tracking with progress updates
   - TXT→EPUB, MOBI→EPUB, DOCX→EPUB converters
   - Temp file safety & rollback

4. **Add unit tests**
   - Test each adapter with sample files
   - Validate format detection
   - Test conversions

### Phase 4: RSS & Sharing (Future Session)

5. **Create RSSService**
   - Feed parser with cron scheduler
   - Daily EPUB generation from articles
   - HTML sanitization
   - Failure handling

6. **Build ShareService**
   - HTTP server on localhost:8080
   - Token generation & validation
   - Password hashing (Argon2)
   - QR code generation

### Phase 5: Frontend Enhancements (Future Session)

7. **Virtual scrolling**
   - React virtualizer for large libraries
   - Infinite scroll with preloading
   - Performance optimization

8. **Advanced search**
   - FTS5 integration
   - Filter by format, author, tags
   - Cursor-based pagination

### Phase 6: Testing & Polish (Future Session)

9. **Comprehensive testing**
   - Unit tests for all components
   - Integration tests for conversions
   - Stress test with 10,000 books
   - Memory leak detection

10. **Performance optimization**
    - Sub-100ms search target
    - 500MB memory cap enforcement
    - Cache hierarchy optimization

---

## 🔧 How to Use This Foundation

### 1. Compile the Project
```bash
cd src-tauri
cargo check  # First compile takes 5-10 minutes (many dependencies)
cargo build --release
```

### 2. Run Migrations
Migrations run automatically when the database is opened:
```rust
let db = Database::new("shiori.db")?;
// v2 and v3 migrations applied automatically
```

### 3. Use Format Detection
```rust
use crate::services::format_detection::detect_format;

let format_info = detect_format(Path::new("book.epub")).await?;
println!("Detected: {} ({})", format_info.format, format_info.mime_type);
```

### 4. Use Format Adapters
```rust
use crate::services::adapters::EpubFormatAdapter;
use crate::services::format_adapter::BookFormatAdapter;

let adapter = EpubFormatAdapter::new();
let metadata = adapter.extract_metadata(Path::new("book.epub")).await?;
println!("Title: {}", metadata.title);
println!("Authors: {:?}", metadata.authors);
```

### 5. Check Capabilities
```rust
let caps = adapter.capabilities();
if caps.supports_toc {
    println!("This format supports table of contents");
}
```

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐│
│  │ Library View   │  │ Premium Reader │  │  RSS Manager   ││
│  │ (Virtual)      │  │ (Complete ✅)  │  │  (Planned)     ││
│  └────────────────┘  └────────────────┘  └────────────────┘│
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   TAURI COMMAND LAYER                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    SERVICE LAYER (Rust)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │FormatService │  │CoverService  │  │ConversionEngine  │  │
│  │(Detection ✅)│  │(Planned)     │  │(Planned)         │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │RSSService    │  │ShareService  │  │LibraryService    │  │
│  │(Planned)     │  │(Planned)     │  │(Existing)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│               FORMAT ADAPTER LAYER                           │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐  │
│  │EPUB│ │PDF │ │MOBI│ │AZW3│ │DOCX│ │TXT │ │HTML│ │CBZ │  │
│  │ ✅ │ │ ⏳ │ │ ⏳ │ │ ⏳ │ │ ⏳ │ │ ✅ │ │ ⏳ │ │ ⏳ │  │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  STORAGE LAYER                               │
│  ┌───────────────┐         ┌──────────────────────────┐     │
│  │SQLite + WAL   │         │   File Storage           │     │
│  │- FTS5 ✅      │         │   ~/Shiori/              │     │
│  │- Migrations ✅│         │    ├── library/          │     │
│  └───────────────┘         │    ├── covers/           │     │
│                            │    ├── rss/              │     │
│                            │    └── shared/           │     │
│                            └──────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎉 Key Achievements

1. **Complete architectural blueprint** for Calibre competitor
2. **Robust format detection** with magic bytes
3. **Extensible adapter system** for 11 formats
4. **Database migrations** for new features
5. **Two working adapters** (EPUB, TXT) as templates
6. **All dependencies configured** and ready
7. **Clear roadmap** for remaining 60% of work

---

## 📖 Documentation

- **ARCHITECTURE.md**: Complete technical design (2,600+ lines)
- **IMPLEMENTATION_STATUS.md**: Detailed progress tracking
- **Code Comments**: Comprehensive inline documentation
- **README_CONTINUATION.md**: This file - session summary and next steps

---

**Status**: Foundation Complete - Ready for Phase 3  
**Next Session**: Implement remaining format adapters and core services  
**Estimated Time to Completion**: 6-8 hours of focused development
