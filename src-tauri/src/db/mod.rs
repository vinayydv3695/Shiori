use crate::error::Result;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::path::Path;

pub mod migrations;

#[derive(Clone)]
pub struct Database {
    pool: Pool<SqliteConnectionManager>,
}

impl Database {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let manager = SqliteConnectionManager::file(path.as_ref()).with_init(|c| {
            // Enable foreign keys
            c.execute_batch("PRAGMA foreign_keys = ON")?;
            // Enable WAL mode for better concurrency
            c.execute_batch("PRAGMA journal_mode = WAL")?;
            c.execute_batch("PRAGMA synchronous = NORMAL")?;
            c.execute_batch("PRAGMA temp_store = MEMORY")?;
            c.execute_batch("PRAGMA mmap_size = 3000000000")?;
            // Avoid SQLITE_BUSY under concurrent access
            c.execute_batch("PRAGMA busy_timeout = 5000")?;
            Ok(())
        });

        // Create connection pool (max 8 concurrent connections)
        let pool = Pool::builder().max_size(8).build(manager).map_err(|e| {
            crate::error::ShioriError::Other(format!("Database pooling error: {}", e))
        })?;

        let db = Database { pool };
        db.initialize_schema()?;

        // Run migrations for new features
        db.run_migrations()?;

        db.apply_performance_pragmas()?;

        Ok(db)
    }

    fn run_migrations(&self) -> Result<()> {
        let conn = self.get_connection()?;
        let migrator = migrations::MigrationManager::new(&conn);
        migrator.run_migrations()?;
        Ok(())
    }

    fn apply_performance_pragmas(&self) -> Result<()> {
        let conn = self.get_connection()?;
        let perf_mode: String = conn
            .query_row(
                "SELECT performance_mode FROM user_preferences WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "standard".to_string());

        match perf_mode.as_str() {
            "large_library" => {
                log::info!("Applying Large Library performance pragmas");
                conn.execute_batch("PRAGMA cache_size = -64000;")?;
            }
            "low_memory" => {
                log::info!("Applying Low Memory performance pragmas");
                conn.execute_batch("PRAGMA cache_size = -2000; PRAGMA temp_store = FILE;")?;
            }
            _ => {
                // standard
                conn.execute_batch("PRAGMA cache_size = -16000;")?;
            }
        }
        Ok(())
    }

    pub fn initialize_schema(&self) -> Result<()> {
        let conn = self.get_connection()?;
        // Books table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                sort_title TEXT,
                isbn TEXT,
                isbn13 TEXT,
                publisher TEXT,
                pubdate TEXT,
                series TEXT,
                series_index REAL,
                rating INTEGER CHECK(rating >= 0 AND rating <= 5),
                file_path TEXT NOT NULL UNIQUE,
                file_format TEXT NOT NULL,
                file_size INTEGER,
                file_hash TEXT,
                cover_path TEXT,
                page_count INTEGER,
                word_count INTEGER,
                language TEXT DEFAULT 'eng',
                added_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                modified_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_opened TEXT,
                notes TEXT
            )",
            [],
        )?;

        // Indexes for books
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_title ON books(title COLLATE NOCASE)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_series ON books(series)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_format ON books(file_format)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_hash ON books(file_hash)",
            [],
        )?;
        // Composite indexes for common sort/filter queries
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_added_date ON books(added_date DESC)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_format_date ON books(file_format, added_date DESC)",
            [],
        )?;

        // Authors table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS authors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                sort_name TEXT,
                link TEXT
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_authors_name ON authors(name COLLATE NOCASE)",
            [],
        )?;

        // Book-Author junction
        conn.execute(
            "CREATE TABLE IF NOT EXISTS books_authors (
                book_id INTEGER NOT NULL,
                author_id INTEGER NOT NULL,
                author_order INTEGER DEFAULT 0,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE,
                PRIMARY KEY (book_id, author_id)
            )",
            [],
        )?;

        // Tags table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT
            )",
            [],
        )?;

        // Book-Tag junction
        conn.execute(
            "CREATE TABLE IF NOT EXISTS books_tags (
                book_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (book_id, tag_id)
            )",
            [],
        )?;

        // Drop any old content-sync FTS triggers that might cause "malformed" errors
        // during v2 migration. The FTS table and new triggers are created by v3 migration.
        let _ = conn.execute("DROP TRIGGER IF EXISTS books_fts_insert", []);
        let _ = conn.execute("DROP TRIGGER IF EXISTS books_fts_update", []);
        let _ = conn.execute("DROP TRIGGER IF EXISTS books_fts_delete", []);

        // Reading progress table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS reading_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                current_location TEXT NOT NULL,
                progress_percent REAL DEFAULT 0,
                current_page INTEGER,
                total_pages INTEGER,
                last_read TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
                UNIQUE(book_id)
            )",
            [],
        )?;

        // Annotations table (highlights, notes, bookmarks)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('highlight', 'note', 'bookmark')),
                location TEXT NOT NULL,
                cfi_range TEXT,
                selected_text TEXT,
                note_content TEXT,
                color TEXT DEFAULT '#FFEB3B',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_annotations_book ON annotations(book_id)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type)",
            [],
        )?;

        // Reader settings table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS reader_settings (
                user_id TEXT PRIMARY KEY DEFAULT 'default',
                font_family TEXT DEFAULT 'system',
                font_size INTEGER DEFAULT 18,
                line_height REAL DEFAULT 1.6,
                theme TEXT DEFAULT 'light',
                page_mode TEXT DEFAULT 'paginated',
                margin_size INTEGER DEFAULT 2,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Add missing columns if they don't exist (for existing databases)
        let _ = conn.execute(
            "ALTER TABLE reader_settings ADD COLUMN margin_size INTEGER DEFAULT 2",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE reader_settings ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            [],
        );

        // Settings table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                type TEXT NOT NULL
            )",
            [],
        )?;

        // Collections table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS collections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                parent_id INTEGER,
                is_smart INTEGER DEFAULT 0 CHECK(is_smart IN (0, 1)),
                smart_rules TEXT,
                icon TEXT,
                color TEXT,
                sort_order INTEGER DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_id) REFERENCES collections(id) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_id)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_collections_smart ON collections(is_smart)",
            [],
        )?;

        // Collection-Book junction (only for manual collections)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS collections_books (
                collection_id INTEGER NOT NULL,
                book_id INTEGER NOT NULL,
                added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                sort_order INTEGER DEFAULT 0,
                FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
                PRIMARY KEY (collection_id, book_id)
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_collections_books_collection ON collections_books(collection_id)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_collections_books_book ON collections_books(book_id)",
            [],
        )?;

        Ok(())
    }

    pub fn get_connection(&self) -> Result<r2d2::PooledConnection<SqliteConnectionManager>> {
        self.pool
            .get()
            .map_err(|e| crate::error::ShioriError::Other(e.to_string()))
    }
}
