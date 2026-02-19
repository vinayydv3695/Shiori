use crate::error::Result;
use rusqlite::Connection;
use std::path::Path;

pub mod migrations;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;

        // Enable foreign keys
        conn.execute_batch("PRAGMA foreign_keys = ON")?;

        // Enable WAL mode for better concurrency
        conn.execute_batch("PRAGMA journal_mode = WAL")?;

        let db = Database { conn };
        db.initialize_schema()?;

        // Run migrations for new features
        db.run_migrations()?;

        Ok(db)
    }

    fn run_migrations(&self) -> Result<()> {
        let migrator = migrations::MigrationManager::new(&self.conn);
        migrator.run_migrations()?;
        Ok(())
    }

    pub fn initialize_schema(&self) -> Result<()> {
        // Books table
        self.conn.execute(
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
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_title ON books(title COLLATE NOCASE)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_series ON books(series)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_format ON books(file_format)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_books_hash ON books(file_hash)",
            [],
        )?;

        // Authors table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS authors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                sort_name TEXT,
                link TEXT
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_authors_name ON authors(name COLLATE NOCASE)",
            [],
        )?;

        // Book-Author junction
        self.conn.execute(
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
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT
            )",
            [],
        )?;

        // Book-Tag junction
        self.conn.execute(
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
        let _ = self.conn.execute("DROP TRIGGER IF EXISTS books_fts_insert", []);
        let _ = self.conn.execute("DROP TRIGGER IF EXISTS books_fts_update", []);
        let _ = self.conn.execute("DROP TRIGGER IF EXISTS books_fts_delete", []);

        // Reading progress table
        self.conn.execute(
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
        self.conn.execute(
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

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_annotations_book ON annotations(book_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type)",
            [],
        )?;

        // Reader settings table
        self.conn.execute(
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
        let _ = self.conn.execute(
            "ALTER TABLE reader_settings ADD COLUMN margin_size INTEGER DEFAULT 2",
            [],
        );
        let _ = self.conn.execute(
            "ALTER TABLE reader_settings ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            [],
        );

        // Settings table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                type TEXT NOT NULL
            )",
            [],
        )?;

        // Collections table
        self.conn.execute(
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

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_collections_smart ON collections(is_smart)",
            [],
        )?;

        // Collection-Book junction (only for manual collections)
        self.conn.execute(
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

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_collections_books_collection ON collections_books(collection_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_collections_books_book ON collections_books(book_id)",
            [],
        )?;

        Ok(())
    }

    pub fn get_connection(&self) -> &Connection {
        &self.conn
    }

    pub fn get_connection_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }
}
