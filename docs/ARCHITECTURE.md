# Shiori Architecture Documentation

## System Overview

Shiori is a desktop application built on the Tauri framework, combining a Rust backend with a React/TypeScript frontend. The architecture is designed for offline-first operation, high performance with large libraries (50,000+ books), and extensibility.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│                   (React + TypeScript)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  Components  │  │    Stores    │  │     Hooks       │   │
│  │  - Library   │  │  - Zustand   │  │  - TanStack Q   │   │
│  │  - Metadata  │  │  - UI State  │  │  - Custom       │   │
│  │  - Search    │  │              │  │                 │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘   │
│         │                  │                   │            │
│         └──────────────────┼───────────────────┘            │
│                            │                                │
│                   ┌────────▼────────┐                       │
│                   │  Tauri IPC API  │                       │
│                   │  (invoke/emit)  │                       │
└───────────────────┴────────┬────────┴───────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Tauri Core    │
                    │  (Rust Runtime) │
                    └────────┬────────┘
┌────────────────────────────▼────────────────────────────────┐
│                    APPLICATION LAYER                         │
│                       (Rust Backend)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   Commands   │  │   Services   │  │     Models      │   │
│  │  - Library   │  │  - Library   │  │  - Book         │   │
│  │  - Search    │  │  - Metadata  │  │  - Author       │   │
│  │  - Tags      │  │  - Search    │  │  - Tag          │   │
│  │  - Metadata  │  │  - Tags      │  │                 │   │
│  └──────┬───────┘  └──────┬───────┘  └─────────────────┘   │
│         │                  │                                │
│         └──────────────────┼────────────────────────────────┘
│                   ┌────────▼────────┐                       │
│                   │  Database Layer │                       │
│                   │   (rusqlite)    │                       │
│                   └────────┬────────┘                       │
└────────────────────────────┼────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  SQLite + FTS5  │
                    │   (library.db)  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   File System   │
                    │   ~/Shiori/     │
                    │   ├─ books/     │
                    │   ├─ covers/    │
                    │   └─ cache/     │
                    └─────────────────┘
```

## Component Layers

### 1. Presentation Layer (Frontend)

**Technology**: React 19 + TypeScript + Vite

**Responsibilities**:
- Rendering UI components
- Handling user interactions
- Managing client-side state
- Communicating with backend via IPC

**Key Directories**:
- `src/components/` — Reusable UI components (Radix UI-based)
- `src/store/` — Zustand state management
- `src/lib/` — Utility functions and API wrappers
- `src/hooks/` — Custom React hooks

**State Management**:
- **Zustand** for global state (library, UI preferences)
- **TanStack Query** for server state (async operations, caching)
- **React local state** for component-specific state

### 2. IPC Communication Layer

**Technology**: Tauri IPC (invoke/emit pattern)

**Communication Flow**:
```typescript
// Frontend → Backend
const books = await invoke("get_books")

// Backend → Frontend (events)
listen("import-progress", (event) => {
  console.log(event.payload)
})
```

**Commands Exposed**:
- `get_books()` → `Vec<Book>`
- `add_book(book)` → `i64`
- `search_books(query)` → `SearchResult`
- `import_books(paths)` → `ImportResult`
- (see `src-tauri/src/commands/` for full list)

### 3. Application Layer (Backend)

**Technology**: Rust

**Architecture Pattern**: Service-oriented

**Command Layer** (`src-tauri/src/commands/`):
- Thin handlers that validate input and call services
- Decorated with `#[tauri::command]` macro
- Return `Result<T, ShioriError>` for error handling

**Service Layer** (`src-tauri/src/services/`):
- Business logic implementation
- Database operations
- File I/O and metadata extraction
- External API calls (future)

**Services**:
- `library_service.rs` — Book CRUD, import pipeline
- `search_service.rs` — FTS5 queries, filtering
- `metadata_service.rs` — EPUB/PDF parsing
- `tag_service.rs` — Tag management

### 4. Data Layer

**Database**: SQLite with FTS5 extension

**Schema Design**:
- Normalized relations (authors, tags separated)
- Full-text search index (books_fts)
- Triggers for automatic FTS sync
- Foreign key constraints enforced

**Key Tables**:
```sql
books
├─ id (PK)
├─ uuid (unique)
├─ title, authors (via junction)
├─ file_path, file_hash
└─ metadata fields

authors
├─ id (PK)
└─ name, sort_name

tags
├─ id (PK)
└─ name, color

books_authors (many-to-many)
books_tags (many-to-many)
books_fts (FTS5 virtual table)
```

## Data Flow Examples

### Book Import Flow

```
User drops file
       │
       ▼
[Frontend: FileDropZone]
       │
       │ invoke("import_books", paths)
       ▼
[Backend: commands::library::import_books]
       │
       ▼
[Service: library_service::import_books]
       │
       ├─→ [metadata_service::extract_from_file] ──→ Parse EPUB/PDF
       │
       ├─→ [utils::file::calculate_file_hash] ──→ SHA256 hash
       │
       ├─→ Check DB for duplicates
       │
       ├─→ Insert into `books` table
       │
       ├─→ Insert authors (get_or_create)
       │
       ├─→ Trigger updates `books_fts`
       │
       ▼
Return ImportResult
       │
       ▼
[Frontend: Update UI state]
```

### Search Flow

```
User types query
       │
       ▼
[Frontend: SearchBar debounce]
       │
       │ invoke("search_books", query)
       ▼
[Backend: commands::search::search_books]
       │
       ▼
[Service: search_service::search]
       │
       ├─→ Build dynamic SQL query
       │
       ├─→ FTS5 MATCH for full-text
       │
       ├─→ JOINs for authors/tags filters
       │
       ├─→ Execute query
       │
       ▼
Return SearchResult
       │
       ▼
[Frontend: Update library view]
```

## Performance Optimizations

### Database
- **Indexes**: On title, ISBN, series, format, hash
- **WAL mode**: Concurrent reads during writes
- **FTS5**: Blazing fast full-text search (>100ms for 50k books)
- **Prepared statements**: Reused queries

### Backend
- **Async operations**: Tokio runtime for I/O
- **Parallel hashing**: SHA256 in worker threads
- **Lazy loading**: Only load visible books (future)

### Frontend
- **Virtual scrolling**: Render only visible items (planned)
- **Debounced search**: 300ms delay
- **Optimistic updates**: Instant UI feedback
- **Code splitting**: Lazy load routes (future)

## File System Layout

```
~/Shiori/                    # App data directory
├─ library.db                # SQLite database
├─ library.db-wal            # Write-Ahead Log
├─ library.db-shm            # Shared memory file
├─ books/                    # Imported book files
│  ├─ {uuid}.epub
│  ├─ {uuid}.pdf
│  └─ ...
├─ covers/                   # Extracted/downloaded covers
│  ├─ {book_id}.jpg
│  └─ ...
├─ cache/                    # Temporary files
│  └─ conversion/
└─ settings.json             # User preferences (future)
```

## Error Handling Strategy

### Backend (Rust)
```rust
pub enum ShioriError {
    Database(rusqlite::Error),
    Io(std::io::Error),
    BookNotFound(String),
    DuplicateBook(String),
    // ...
}

pub type Result<T> = std::result::Result<T, ShioriError>;
```

All errors:
1. Converted to `ShioriError` enum
2. Serialized for IPC transmission
3. Logged with context

### Frontend (TypeScript)
```typescript
try {
  await api.addBook(book)
} catch (error) {
  // Display toast notification
  // Log to console
  // Optionally retry
}
```

## Security Considerations

- **File path validation**: Prevent directory traversal
- **SQL injection**: Parameterized queries only
- **Memory safety**: Rust's ownership system
- **Sandboxing**: Tauri's permissions model
- **No remote code execution**: All plugins future-scoped with ACLs

## Testing Strategy

### Unit Tests (Rust)
```bash
cd src-tauri
cargo test
```

Tests for:
- Database queries
- Metadata extraction
- File hashing
- Service logic

### Integration Tests (Tauri)
- IPC command flows
- End-to-end import
- Search accuracy

### Frontend Tests (Vitest)
```bash
npm test
```

Tests for:
- Component rendering
- User interactions
- State management

## Build & Deployment

### Development
```bash
npm run dev
```
- Vite dev server (port 5173)
- Tauri hot-reload
- Debug logging enabled

### Production Build
```bash
npm run build
```

Outputs:
- `src-tauri/target/release/shiori` — Binary
- `src-tauri/target/release/bundle/` — Platform installers
  - Linux: `.deb`, `.AppImage`
  - macOS: `.dmg`, `.app`
  - Windows: `.exe`, `.msi`

## Future Enhancements

### Phase 1B
- Metadata download services (OpenLibrary API)
- Cover art extraction from EPUBs
- Bulk metadata editor

### Phase 2
- EPUB reader (epub.js integration)
- PDF viewer (pdf.js)
- Reading progress sync

### Phase 3
- Conversion engine (Pandoc wrapper)
- Queue system with progress tracking

### Phase 4
- USB device detection
- Device profiles (Kindle, Kobo)

### Phase 5
- Plugin system (dynamic loading)
- Plugin sandboxing
- Marketplace

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Startup time | <2s | TBD |
| Import 100 books | <30s | TBD |
| Search 50k library | <100ms | TBD |
| Memory (50k books) | <500MB | TBD |
| FTS index rebuild | <5s | TBD |

## Monitoring & Logging

### Backend
```rust
log::info!("Imported book: {}", title);
log::error!("Failed to parse EPUB: {}", error);
```

Outputs to:
- Stdout (development)
- File (production, future)
- Sentry (crashes, future)

### Frontend
- Console (development)
- Error boundary (production)
- Analytics (opt-in, future)

---

**Last Updated**: Phase 1A Implementation
