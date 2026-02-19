/// Database Migration System
///
/// Handles versioned schema migrations for adding new features like multi-format support,
/// RSS feeds, book sharing, and conversion tracking.
use rusqlite::{Connection, Result};
use sha2::{Digest, Sha256};

pub struct MigrationManager<'a> {
    conn: &'a Connection,
}

impl<'a> MigrationManager<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    /// Run all pending migrations
    pub fn run_migrations(&self) -> Result<()> {
        // Create migrations table if it doesn't exist
        self.ensure_migrations_table()?;

        let current_version = self.get_schema_version()?;
        log::info!("[Migration] Current schema version: {}", current_version);

        // Apply migrations in order
        if current_version < 2 {
            self.migrate_to_v2()?;
        }
        if current_version < 3 {
            self.migrate_to_v3()?;
        }

        // Always ensure the FTS table has the correct schema.
        // Previous buggy code in initialize_schema would drop and recreate
        // the FTS table with only 3 columns on every startup, breaking the
        // 6-column schema created by v3 migration.
        self.ensure_fts_schema()?;

        log::info!("[Migration] All migrations applied successfully");
        Ok(())
    }

    /// Ensure FTS5 table has the correct 6-column schema.
    /// If it exists with wrong columns, drop and recreate it.
    fn ensure_fts_schema(&self) -> Result<()> {
        // Check if books_fts exists and has the right columns
        let has_publisher: bool = {
            let mut stmt = self.conn.prepare(
                "SELECT COUNT(*) FROM pragma_table_info('books_fts') WHERE name = 'publisher'"
            )?;
            let count: i32 = stmt.query_row([], |row| row.get(0))?;
            count > 0
        };

        let fts_exists = self.table_exists("books_fts")?;

        if !fts_exists || !has_publisher {
            log::info!("[Migration] Recreating FTS5 table with correct schema");

            // Drop old table and all triggers
            self.conn.execute_batch(r#"
                DROP TRIGGER IF EXISTS books_fts_insert;
                DROP TRIGGER IF EXISTS books_fts_update;
                DROP TRIGGER IF EXISTS books_fts_delete;
                DROP TRIGGER IF EXISTS books_ai;
                DROP TRIGGER IF EXISTS books_ad;
                DROP TRIGGER IF EXISTS books_au;
                DROP TABLE IF EXISTS books_fts;
            "#)?;

            // Create with correct schema
            self.conn.execute_batch(r#"
                CREATE VIRTUAL TABLE books_fts USING fts5(
                    title,
                    authors,
                    publisher,
                    description,
                    tags,
                    isbn,
                    tokenize='porter unicode61'
                );

                CREATE TRIGGER books_ai AFTER INSERT ON books BEGIN
                    INSERT INTO books_fts(rowid, title, authors, publisher, description, tags, isbn)
                    SELECT new.id, new.title, 
                           (SELECT GROUP_CONCAT(a.name, ' ') FROM authors a 
                            JOIN books_authors ba ON a.id = ba.author_id 
                            WHERE ba.book_id = new.id),
                           new.publisher,
                           new.notes,
                           (SELECT GROUP_CONCAT(t.name, ' ') FROM tags t 
                            JOIN books_tags bt ON t.id = bt.tag_id 
                            WHERE bt.book_id = new.id),
                           new.isbn;
                END;
                
                CREATE TRIGGER books_ad AFTER DELETE ON books BEGIN
                    DELETE FROM books_fts WHERE rowid = old.id;
                END;
                
                CREATE TRIGGER books_au AFTER UPDATE ON books BEGIN
                    DELETE FROM books_fts WHERE rowid = old.id;
                    INSERT INTO books_fts(rowid, title, authors, publisher, description, tags, isbn)
                    SELECT new.id, new.title, 
                           (SELECT GROUP_CONCAT(a.name, ' ') FROM authors a 
                            JOIN books_authors ba ON a.id = ba.author_id 
                            WHERE ba.book_id = new.id),
                           new.publisher,
                           new.notes,
                           (SELECT GROUP_CONCAT(t.name, ' ') FROM tags t 
                            JOIN books_tags bt ON t.id = bt.tag_id 
                            WHERE bt.book_id = new.id),
                           new.isbn;
                END;
            "#)?;

            // Re-index existing books
            self.conn.execute_batch(r#"
                INSERT INTO books_fts(rowid, title, authors, publisher, description, tags, isbn)
                SELECT b.id, b.title,
                       (SELECT GROUP_CONCAT(a.name, ' ') FROM authors a 
                        JOIN books_authors ba ON a.id = ba.author_id 
                        WHERE ba.book_id = b.id),
                       b.publisher,
                       b.notes,
                       (SELECT GROUP_CONCAT(t.name, ' ') FROM tags t 
                        JOIN books_tags bt ON t.id = bt.tag_id 
                        WHERE bt.book_id = b.id),
                       b.isbn
                FROM books b;
            "#)?;
        }

        Ok(())
    }

    /// Ensure migrations tracking table exists
    fn ensure_migrations_table(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                checksum TEXT
            )",
            [],
        )?;
        Ok(())
    }

    /// Get current schema version
    fn get_schema_version(&self) -> Result<i32> {
        // Try to get from PRAGMA first
        let version: i32 = self
            .conn
            .pragma_query_value(None, "user_version", |row| row.get(0))?;

        if version > 0 {
            return Ok(version);
        }

        // Fall back to checking migrations table
        let result: Result<i32> = self.conn.query_row(
            "SELECT COALESCE(MAX(version), 1) FROM schema_migrations",
            [],
            |row| row.get(0),
        );

        Ok(result.unwrap_or(1))
    }

    /// Set schema version
    fn set_schema_version(&self, version: i32) -> Result<()> {
        self.conn.pragma_update(None, "user_version", version)?;
        Ok(())
    }

    /// Record migration application
    fn record_migration(&self, version: i32, name: &str, checksum: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)",
            [&version.to_string(), name, checksum],
        )?;
        Ok(())
    }

    /// Calculate checksum for migration validation
    fn calculate_checksum(sql: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(sql.as_bytes());
        hex::encode(hasher.finalize())
    }

    /// Check if a column exists in a table
    fn column_exists(&self, table: &str, column: &str) -> Result<bool> {
        let mut stmt = self.conn.prepare(&format!("PRAGMA table_info({})", table))?;
        let exists = stmt.query_map([], |row| {
            let name: String = row.get(1)?;
            Ok(name)
        })?.any(|r| r.map(|n| n == column).unwrap_or(false));
        Ok(exists)
    }

    /// Check if a table exists
    fn table_exists(&self, table: &str) -> Result<bool> {
        let count: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
            [table],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Migration to v2: Multi-format support
    fn migrate_to_v2(&self) -> Result<()> {
        log::info!("[Migration] Applying v2: Multi-format support");

        // Add primary_format column if it doesn't exist (SQLite has no IF NOT EXISTS for ADD COLUMN)
        if !self.column_exists("books", "primary_format")? {
            self.conn.execute(
                "ALTER TABLE books ADD COLUMN primary_format TEXT DEFAULT 'epub'",
                [],
            )?;
        }

        // Update primary_format based on existing file_format
        self.conn.execute(
            "UPDATE books SET primary_format = file_format WHERE primary_format IS NULL OR primary_format = 'epub'",
            [],
        )?;

        // Create book_formats table for multi-format support
        let create_table_sql = r#"
            CREATE TABLE IF NOT EXISTS book_formats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                format TEXT NOT NULL CHECK(format IN (
                    'epub', 'pdf', 'mobi', 'azw3', 'fb2', 
                    'docx', 'txt', 'html', 'cbz', 'cbr'
                )),
                file_path TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                file_hash TEXT NOT NULL UNIQUE,
                page_count INTEGER,
                word_count INTEGER,
                is_primary INTEGER DEFAULT 0,
                added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
            );
            
            CREATE INDEX IF NOT EXISTS idx_book_formats_book_id ON book_formats(book_id);
            CREATE INDEX IF NOT EXISTS idx_book_formats_format ON book_formats(format);
            CREATE INDEX IF NOT EXISTS idx_book_formats_hash ON book_formats(file_hash);
            CREATE INDEX IF NOT EXISTS idx_book_formats_primary ON book_formats(book_id, is_primary);
        "#;

        self.conn.execute_batch(create_table_sql)?;

        // Migrate existing books to book_formats table (only if not already migrated)
        if !self.table_exists("book_formats")? {
            // Table was just created, this shouldn't happen, but guard anyway
        } else {
            let count: i32 = self.conn.query_row(
                "SELECT COUNT(*) FROM book_formats",
                [],
                |row| row.get(0),
            )?;
            if count == 0 {
                self.conn.execute_batch(r#"
                    INSERT INTO book_formats (book_id, format, file_path, file_size, file_hash, 
                                              page_count, word_count, is_primary, added_at)
                    SELECT 
                        id, 
                        file_format, 
                        file_path, 
                        COALESCE(file_size, 0),
                        COALESCE(file_hash, ''),
                        page_count,
                        word_count,
                        1,
                        added_date
                    FROM books;
                "#)?;
            }
        }

        self.set_schema_version(2)?;
        self.record_migration(
            2,
            "multi_format_support",
            "v2_multi_format_idempotent",
        )?;

        log::info!("[Migration] v2 applied successfully");
        Ok(())
    }

    /// Migration to v3: RSS, Sharing, and Conversion
    fn migrate_to_v3(&self) -> Result<()> {
        log::info!("[Migration] Applying v3: RSS, Sharing, Conversion");

        // Step 1: RSS tables

        self.conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS rss_feeds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                description TEXT,
                fetch_interval_hours INTEGER DEFAULT 12,
                last_fetched TEXT,
                last_success TEXT,
                failure_count INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS rss_articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                feed_id INTEGER NOT NULL,
                guid TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                author TEXT,
                link TEXT NOT NULL,
                content TEXT NOT NULL,
                published_at TEXT NOT NULL,
                fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                is_read INTEGER DEFAULT 0,
                epub_book_id INTEGER,
                FOREIGN KEY (feed_id) REFERENCES rss_feeds(id) ON DELETE CASCADE,
                FOREIGN KEY (epub_book_id) REFERENCES books(id) ON DELETE SET NULL
            );
            
            CREATE INDEX IF NOT EXISTS idx_rss_articles_feed ON rss_articles(feed_id);
            CREATE INDEX IF NOT EXISTS idx_rss_articles_published ON rss_articles(published_at DESC);
            CREATE INDEX IF NOT EXISTS idx_rss_articles_guid ON rss_articles(guid);
            CREATE INDEX IF NOT EXISTS idx_rss_feeds_active ON rss_feeds(is_active) WHERE is_active = 1;
        "#)?;

        // Step 2: Sharing tables

        self.conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS shares (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT NOT NULL UNIQUE,
                book_id INTEGER NOT NULL,
                format TEXT NOT NULL,
                password_hash TEXT,
                expires_at TEXT NOT NULL,
                max_accesses INTEGER,
                access_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                revoked_at TEXT,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
            );
            
            CREATE TABLE IF NOT EXISTS share_access_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                share_token TEXT NOT NULL,
                accessed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ip_address TEXT,
                user_agent TEXT,
                success INTEGER DEFAULT 1,
                failure_reason TEXT
            );
            
            CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
            CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares(expires_at);
            CREATE INDEX IF NOT EXISTS idx_shares_active ON shares(token, revoked_at) WHERE revoked_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_share_access_token ON share_access_log(share_token);
            CREATE INDEX IF NOT EXISTS idx_share_access_time ON share_access_log(accessed_at DESC);
        "#)?;

        // Step 3: Conversion tables

        self.conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS conversion_jobs (
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
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                started_at TEXT,
                completed_at TEXT,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
            );
            
            CREATE INDEX IF NOT EXISTS idx_conversion_jobs_uuid ON conversion_jobs(uuid);
            CREATE INDEX IF NOT EXISTS idx_conversion_jobs_status ON conversion_jobs(status);
            CREATE INDEX IF NOT EXISTS idx_conversion_jobs_book ON conversion_jobs(book_id);
            CREATE INDEX IF NOT EXISTS idx_conversion_jobs_queued ON conversion_jobs(status, created_at) 
                WHERE status = 'queued';
        "#)?;

        // Step 4: Cover cache table

        self.conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS cover_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                size TEXT NOT NULL CHECK(size IN ('thumb', 'medium', 'full')),
                file_path TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_accessed TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
            );
            
            CREATE INDEX IF NOT EXISTS idx_cover_cache_book ON cover_cache(book_id);
            CREATE INDEX IF NOT EXISTS idx_cover_cache_size ON cover_cache(book_id, size);
            CREATE INDEX IF NOT EXISTS idx_cover_cache_accessed ON cover_cache(last_accessed);
        "#)?;

        // Step 5: Drop old FTS table and triggers, recreate with richer standalone schema

        self.conn.execute_batch(r#"
            DROP TRIGGER IF EXISTS books_fts_insert;
            DROP TRIGGER IF EXISTS books_fts_update;
            DROP TRIGGER IF EXISTS books_fts_delete;
            DROP TRIGGER IF EXISTS books_ai;
            DROP TRIGGER IF EXISTS books_ad;
            DROP TRIGGER IF EXISTS books_au;
            DROP TABLE IF EXISTS books_fts;
        "#)?;


        self.conn.execute_batch(r#"
            CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
                title,
                authors,
                publisher,
                description,
                tags,
                isbn,
                tokenize='porter unicode61'
            );
        "#)?;

        // Step 6: FTS triggers

        self.conn.execute_batch(r#"
            CREATE TRIGGER IF NOT EXISTS books_ai AFTER INSERT ON books BEGIN
                INSERT INTO books_fts(rowid, title, authors, publisher, description, tags, isbn)
                SELECT new.id, new.title, 
                       (SELECT GROUP_CONCAT(a.name, ' ') FROM authors a 
                        JOIN books_authors ba ON a.id = ba.author_id 
                        WHERE ba.book_id = new.id),
                       new.publisher,
                       new.notes,
                       (SELECT GROUP_CONCAT(t.name, ' ') FROM tags t 
                        JOIN books_tags bt ON t.id = bt.tag_id 
                        WHERE bt.book_id = new.id),
                       new.isbn;
            END;
            
            CREATE TRIGGER IF NOT EXISTS books_ad AFTER DELETE ON books BEGIN
                DELETE FROM books_fts WHERE rowid = old.id;
            END;
            
            CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE ON books BEGIN
                DELETE FROM books_fts WHERE rowid = old.id;
                INSERT INTO books_fts(rowid, title, authors, publisher, description, tags, isbn)
                SELECT new.id, new.title, 
                       (SELECT GROUP_CONCAT(a.name, ' ') FROM authors a 
                        JOIN books_authors ba ON a.id = ba.author_id 
                        WHERE ba.book_id = new.id),
                       new.publisher,
                       new.notes,
                       (SELECT GROUP_CONCAT(t.name, ' ') FROM tags t 
                        JOIN books_tags bt ON t.id = bt.tag_id 
                        WHERE bt.book_id = new.id),
                       new.isbn;
            END;
        "#)?;


        self.set_schema_version(3)?;
        self.record_migration(
            3,
            "rss_sharing_conversion",
            "v3_rss_sharing_conversion",
        )?;

        log::info!("[Migration] v3 applied successfully");
        Ok(())
    }

    /// Rollback to a specific version (for development/testing)
    #[allow(dead_code)]
    pub fn rollback_to(&self, target_version: i32) -> Result<()> {
        let current_version = self.get_schema_version()?;

        if target_version >= current_version {
            log::warn!("[Migration] Already at or below target version");
            return Ok(());
        }

        log::warn!(
            "[Migration] Rolling back from v{} to v{}",
            current_version,
            target_version
        );

        // Note: Rollback logic would go here
        // For now, we only support forward migrations

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_migration_system() {
        let temp_db = NamedTempFile::new().unwrap();
        let conn = Connection::open(temp_db.path()).unwrap();

        let migrator = MigrationManager::new(&conn);

        // Ensure migrations table exists
        migrator.ensure_migrations_table().unwrap();

        // Check initial version
        let version = migrator.get_schema_version().unwrap();
        assert!(version >= 1);
    }

    #[test]
    fn test_checksum_calculation() {
        let sql = "CREATE TABLE test (id INTEGER);";
        let checksum1 = MigrationManager::calculate_checksum(sql);
        let checksum2 = MigrationManager::calculate_checksum(sql);

        assert_eq!(checksum1, checksum2);
        assert_eq!(checksum1.len(), 64); // SHA256 produces 64 hex chars
    }
}
