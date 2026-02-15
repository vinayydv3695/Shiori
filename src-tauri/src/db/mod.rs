use crate::error::Result;
use crate::models::{Author, Book, Tag};
use rusqlite::{params, Connection};
use std::path::Path;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;

        // Enable foreign keys
        conn.execute("PRAGMA foreign_keys = ON", [])?;

        // Enable WAL mode for better concurrency
        conn.execute("PRAGMA journal_mode = WAL", [])?;

        let db = Database { conn };
        db.initialize_schema()?;

        Ok(db)
    }

    fn initialize_schema(&self) -> Result<()> {
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

        // FTS5 virtual table for full-text search
        self.conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
                title,
                authors,
                tags,
                content=''
            )",
            [],
        )?;

        // Trigger to keep FTS in sync on insert
        self.conn.execute(
            "CREATE TRIGGER IF NOT EXISTS books_fts_insert AFTER INSERT ON books BEGIN
                INSERT INTO books_fts(rowid, title, authors, tags)
                SELECT 
                    NEW.id,
                    NEW.title,
                    COALESCE((SELECT GROUP_CONCAT(name, ' ') FROM authors 
                     JOIN books_authors ON authors.id = books_authors.author_id 
                     WHERE books_authors.book_id = NEW.id), ''),
                    COALESCE((SELECT GROUP_CONCAT(name, ' ') FROM tags 
                     JOIN books_tags ON tags.id = books_tags.tag_id 
                     WHERE books_tags.book_id = NEW.id), '');
            END",
            [],
        )?;

        // Trigger to keep FTS in sync on update
        self.conn.execute(
            "CREATE TRIGGER IF NOT EXISTS books_fts_update AFTER UPDATE ON books BEGIN
                UPDATE books_fts SET
                    title = NEW.title,
                    authors = COALESCE((SELECT GROUP_CONCAT(name, ' ') FROM authors 
                               JOIN books_authors ON authors.id = books_authors.author_id 
                               WHERE books_authors.book_id = NEW.id), ''),
                    tags = COALESCE((SELECT GROUP_CONCAT(name, ' ') FROM tags 
                           JOIN books_tags ON tags.id = books_tags.tag_id 
                           WHERE books_tags.book_id = NEW.id), '')
                WHERE rowid = NEW.id;
            END",
            [],
        )?;

        // Trigger to keep FTS in sync on delete
        self.conn.execute(
            "CREATE TRIGGER IF NOT EXISTS books_fts_delete AFTER DELETE ON books BEGIN
                DELETE FROM books_fts WHERE rowid = OLD.id;
            END",
            [],
        )?;

        // Settings table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                type TEXT NOT NULL
            )",
            [],
        )?;

        Ok(())
    }

    pub fn get_connection(&self) -> &Connection {
        &self.conn
    }
}
