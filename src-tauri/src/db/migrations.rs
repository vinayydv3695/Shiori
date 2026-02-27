/// Database Migration System
///
/// Handles versioned schema migrations for adding new features like multi-format support,
/// RSS feeds, book sharing, and conversion tracking.
///
/// Each migration runs inside a SAVEPOINT so that if it fails, the database
/// is rolled back to its pre-migration state rather than left half-applied.
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

        // Each migration is wrapped in run_in_savepoint so partial failures
        // roll back cleanly instead of leaving the DB in a broken state.
        if current_version < 2 {
            self.run_in_savepoint("v2", |mgr| mgr.migrate_to_v2())?;
        }
        if current_version < 3 {
            self.run_in_savepoint("v3", |mgr| mgr.migrate_to_v3())?;
        }
        if current_version < 4 {
            self.run_in_savepoint("v4", |mgr| mgr.migrate_to_v4())?;
        }
        if current_version < 5 {
            self.run_in_savepoint("v5", |mgr| mgr.migrate_to_v5())?;
        }
        if current_version < 6 {
            self.run_in_savepoint("v6", |mgr| mgr.migrate_to_v6())?;
        }
        if current_version < 7 {
            self.run_in_savepoint("v7", |mgr| mgr.migrate_to_v7())?;
        }
        if current_version < 8 {
            self.run_in_savepoint("v8", |mgr| mgr.migrate_to_v8())?;
        }
        if current_version < 9 {
            self.run_in_savepoint("v9", |mgr| mgr.migrate_to_v9())?;
        }

        // Always ensure the FTS table has the correct schema.
        // Previous buggy code in initialize_schema would drop and recreate
        // the FTS table with only 3 columns on every startup, breaking the
        // 6-column schema created by v3 migration.
        self.ensure_fts_schema()?;

        log::info!("[Migration] All migrations applied successfully");
        Ok(())
    }

    /// Run a closure inside a SAVEPOINT. If the closure fails, the savepoint
    /// is rolled back so the database is not left in a half-migrated state.
    fn run_in_savepoint<F>(&self, name: &str, f: F) -> Result<()>
    where
        F: FnOnce(&MigrationManager) -> Result<()>,
    {
        let sp_name = format!("migration_{}", name);
        self.conn.execute_batch(&format!("SAVEPOINT {}", sp_name))?;

        match f(self) {
            Ok(()) => {
                self.conn
                    .execute_batch(&format!("RELEASE SAVEPOINT {}", sp_name))?;
                Ok(())
            }
            Err(e) => {
                log::error!("[Migration] {} failed: {}, rolling back", name, e);
                self.conn
                    .execute_batch(&format!("ROLLBACK TO SAVEPOINT {}", sp_name))?;
                // Release after rollback to clean up the savepoint
                self.conn
                    .execute_batch(&format!("RELEASE SAVEPOINT {}", sp_name))?;
                Err(e)
            }
        }
    }

    /// Ensure FTS5 table has the correct 6-column schema.
    /// If it exists with wrong columns, drop and recreate it.
    fn ensure_fts_schema(&self) -> Result<()> {
        // Check if books_fts exists and has the right columns
        let has_publisher: bool = {
            let mut stmt = self.conn.prepare(
                "SELECT COUNT(*) FROM pragma_table_info('books_fts') WHERE name = 'publisher'",
            )?;
            let count: i32 = stmt.query_row([], |row| row.get(0))?;
            count > 0
        };

        let fts_exists = self.table_exists("books_fts")?;

        if !fts_exists || !has_publisher {
            log::info!("[Migration] Recreating FTS5 table with correct schema");

            // Drop old table and all triggers
            self.conn.execute_batch(
                r#"
                DROP TRIGGER IF EXISTS books_fts_insert;
                DROP TRIGGER IF EXISTS books_fts_update;
                DROP TRIGGER IF EXISTS books_fts_delete;
                DROP TRIGGER IF EXISTS books_ai;
                DROP TRIGGER IF EXISTS books_ad;
                DROP TRIGGER IF EXISTS books_au;
                DROP TABLE IF EXISTS books_fts;
            "#,
            )?;

            // Create with correct schema
            self.conn.execute_batch(
                r#"
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
            "#,
            )?;

            // Re-index existing books
            self.conn.execute_batch(
                r#"
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
            "#,
            )?;
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
        let mut stmt = self
            .conn
            .prepare(&format!("PRAGMA table_info({})", table))?;
        let exists = stmt
            .query_map([], |row| {
                let name: String = row.get(1)?;
                Ok(name)
            })?
            .any(|r| r.map(|n| n == column).unwrap_or(false));
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
            let count: i32 =
                self.conn
                    .query_row("SELECT COUNT(*) FROM book_formats", [], |row| row.get(0))?;
            if count == 0 {
                self.conn.execute_batch(
                    r#"
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
                "#,
                )?;
            }
        }

        self.set_schema_version(2)?;
        self.record_migration(2, "multi_format_support", "v2_multi_format_idempotent")?;

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
                title TEXT,
                description TEXT,
                last_checked TEXT,
                next_check TEXT,
                check_interval_hours INTEGER DEFAULT 12,
                failure_count INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS rss_articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                feed_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                author TEXT,
                url TEXT,
                content TEXT NOT NULL DEFAULT '',
                summary TEXT,
                published TEXT,
                guid TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                epub_book_id INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (feed_id) REFERENCES rss_feeds(id) ON DELETE CASCADE,
                FOREIGN KEY (epub_book_id) REFERENCES books(id) ON DELETE SET NULL
            );
            
            CREATE INDEX IF NOT EXISTS idx_rss_articles_feed ON rss_articles(feed_id);
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

        self.conn.execute_batch(
            r#"
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
        "#,
        )?;

        // Step 5: Drop old FTS table and triggers, recreate with richer standalone schema

        self.conn.execute_batch(
            r#"
            DROP TRIGGER IF EXISTS books_fts_insert;
            DROP TRIGGER IF EXISTS books_fts_update;
            DROP TRIGGER IF EXISTS books_fts_delete;
            DROP TRIGGER IF EXISTS books_ai;
            DROP TRIGGER IF EXISTS books_ad;
            DROP TRIGGER IF EXISTS books_au;
            DROP TABLE IF EXISTS books_fts;
        "#,
        )?;

        self.conn.execute_batch(
            r#"
            CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
                title,
                authors,
                publisher,
                description,
                tags,
                isbn,
                tokenize='porter unicode61'
            );
        "#,
        )?;

        // Step 6: FTS triggers

        self.conn.execute_batch(
            r#"
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
        "#,
        )?;

        self.set_schema_version(3)?;
        self.record_migration(3, "rss_sharing_conversion", "v3_rss_sharing_conversion")?;

        log::info!("[Migration] v3 applied successfully");
        Ok(())
    }

    /// Migration to v4: User Preferences & Onboarding System
    fn migrate_to_v4(&self) -> Result<()> {
        log::info!("[Migration] Applying v4: User Preferences & Onboarding");

        // Step 1: Onboarding state (singleton table)
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS onboarding_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                completed BOOLEAN DEFAULT 0,
                completed_at TEXT,
                version INTEGER DEFAULT 1,
                skipped_steps TEXT DEFAULT '[]'
            );
            
            INSERT OR IGNORE INTO onboarding_state (id) VALUES (1);
        "#,
        )?;

        // Step 2: User preferences (singleton table)
        self.conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS user_preferences (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                
                -- Theme
                theme TEXT DEFAULT 'black' CHECK(theme IN ('black', 'white')),
                
                -- Book reading defaults
                book_font_family TEXT DEFAULT 'Merriweather',
                book_font_size INTEGER DEFAULT 18 CHECK(book_font_size BETWEEN 12 AND 32),
                book_line_height REAL DEFAULT 1.6 CHECK(book_line_height BETWEEN 1.2 AND 2.0),
                book_page_width INTEGER DEFAULT 720 CHECK(book_page_width BETWEEN 600 AND 900),
                book_scroll_mode TEXT DEFAULT 'paged' CHECK(book_scroll_mode IN ('paged', 'continuous')),
                book_justification TEXT DEFAULT 'justify' CHECK(book_justification IN ('left', 'justify')),
                book_paragraph_spacing INTEGER DEFAULT 16,
                book_animation_speed INTEGER DEFAULT 300 CHECK(book_animation_speed BETWEEN 100 AND 500),
                book_hyphenation BOOLEAN DEFAULT 1,
                book_custom_css TEXT DEFAULT '',
                
                -- Manga reading defaults
                manga_mode TEXT DEFAULT 'single' CHECK(manga_mode IN ('long-strip', 'single', 'double')),
                manga_direction TEXT DEFAULT 'ltr' CHECK(manga_direction IN ('ltr', 'rtl')),
                manga_margin_size INTEGER DEFAULT 0 CHECK(manga_margin_size BETWEEN 0 AND 100),
                manga_fit_width BOOLEAN DEFAULT 1,
                manga_background_color TEXT DEFAULT '#000000',
                manga_progress_bar TEXT DEFAULT 'bottom' CHECK(manga_progress_bar IN ('top', 'bottom', 'hidden')),
                manga_image_smoothing BOOLEAN DEFAULT 1,
                manga_preload_count INTEGER DEFAULT 3 CHECK(manga_preload_count BETWEEN 1 AND 5),
                manga_gpu_acceleration BOOLEAN DEFAULT 1,
                
                -- General settings
                auto_start BOOLEAN DEFAULT 0,
                default_import_path TEXT DEFAULT '',
                ui_density TEXT DEFAULT 'comfortable' CHECK(ui_density IN ('compact', 'comfortable')),
                accent_color TEXT DEFAULT '#4A9EFF',
                
                -- Metadata
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                version INTEGER DEFAULT 1
            );
            
            INSERT OR IGNORE INTO user_preferences (id) VALUES (1);
            
            -- Trigger: Update timestamp on change
            CREATE TRIGGER IF NOT EXISTS user_preferences_update
            AFTER UPDATE ON user_preferences
            BEGIN
                UPDATE user_preferences SET updated_at = CURRENT_TIMESTAMP WHERE id = 1;
            END;
        "#)?;

        // Step 3: Book preference overrides (per-book)
        self.conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS book_preference_overrides (
                book_id INTEGER PRIMARY KEY,
                
                -- Only store overridden fields (sparse table)
                font_family TEXT,
                font_size INTEGER,
                line_height REAL,
                page_width INTEGER,
                scroll_mode TEXT,
                justification TEXT,
                paragraph_spacing INTEGER,
                animation_speed INTEGER,
                hyphenation BOOLEAN,
                custom_css TEXT,
                
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
            );
            
            CREATE INDEX IF NOT EXISTS idx_book_overrides_book ON book_preference_overrides(book_id);
            
            -- Trigger: Update timestamp
            CREATE TRIGGER IF NOT EXISTS book_preference_overrides_update
            AFTER UPDATE ON book_preference_overrides
            BEGIN
                UPDATE book_preference_overrides 
                SET updated_at = CURRENT_TIMESTAMP 
                WHERE book_id = NEW.book_id;
            END;
        "#)?;

        // Step 4: Manga preference overrides (per-book)
        self.conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS manga_preference_overrides (
                book_id INTEGER PRIMARY KEY,
                
                -- Only store overridden fields
                mode TEXT,
                direction TEXT,
                margin_size INTEGER,
                fit_width BOOLEAN,
                background_color TEXT,
                progress_bar TEXT,
                image_smoothing BOOLEAN,
                preload_count INTEGER,
                gpu_acceleration BOOLEAN,
                
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
            );
            
            CREATE INDEX IF NOT EXISTS idx_manga_overrides_book ON manga_preference_overrides(book_id);
            
            -- Trigger: Update timestamp
            CREATE TRIGGER IF NOT EXISTS manga_preference_overrides_update
            AFTER UPDATE ON manga_preference_overrides
            BEGIN
                UPDATE manga_preference_overrides 
                SET updated_at = CURRENT_TIMESTAMP 
                WHERE book_id = NEW.book_id;
            END;
        "#)?;

        // Step 5: Library settings
        self.conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS library_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                
                auto_scan_folders TEXT DEFAULT '[]',
                duplicate_detection_mode TEXT DEFAULT 'hash' CHECK(duplicate_detection_mode IN ('hash', 'isbn', 'title', 'off')),
                default_sort_field TEXT DEFAULT 'added_date',
                default_sort_order TEXT DEFAULT 'desc' CHECK(default_sort_order IN ('asc', 'desc')),
                
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            
            INSERT OR IGNORE INTO library_settings (id) VALUES (1);
        "#)?;

        // Step 6: RSS settings
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS rss_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                
                auto_download BOOLEAN DEFAULT 0,
                download_schedule TEXT DEFAULT '0 * * * *',
                article_cleanup_days INTEGER DEFAULT 30,
                max_articles_per_feed INTEGER DEFAULT 100,
                
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            
            INSERT OR IGNORE INTO rss_settings (id) VALUES (1);
        "#,
        )?;

        // Step 7: Conversion settings
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS conversion_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                
                default_output_format TEXT DEFAULT 'epub',
                worker_thread_count INTEGER DEFAULT 2 CHECK(worker_thread_count BETWEEN 1 AND 8),
                profile_presets TEXT DEFAULT '{}',
                
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            
            INSERT OR IGNORE INTO conversion_settings (id) VALUES (1);
        "#,
        )?;

        self.set_schema_version(4)?;
        self.record_migration(
            4,
            "user_preferences_onboarding",
            "v4_preferences_onboarding",
        )?;

        log::info!("[Migration] v4 applied successfully");
        Ok(())
    }

    /// Migration v5: Conversion job persistence + profiles
    ///
    /// v3 created `conversion_jobs` with `id INTEGER PRIMARY KEY AUTOINCREMENT`
    /// plus a separate `uuid TEXT UNIQUE` column. v5 needs `id TEXT PRIMARY KEY`
    /// (the UUID *is* the PK). If the old v3 schema exists, we migrate data
    /// into the new schema. `CREATE TABLE IF NOT EXISTS` would silently keep
    /// the old incompatible schema, so we must detect and handle the conflict.
    fn migrate_to_v5(&self) -> Result<()> {
        log::info!("[Migration] Applying v5: conversion_jobs + conversion_profiles");

        // Detect if conversion_jobs already exists with the old v3 schema
        // (v3 has a `uuid` column; v5 does not — it uses `id TEXT` as PK)
        let has_old_schema = self.table_exists("conversion_jobs")?
            && self.column_exists("conversion_jobs", "uuid")?;

        if has_old_schema {
            log::info!("[Migration] Detected old v3 conversion_jobs schema, migrating...");

            // Drop old indexes that reference the old table
            self.conn.execute_batch(
                r#"
                DROP INDEX IF EXISTS idx_conversion_jobs_uuid;
                DROP INDEX IF EXISTS idx_conversion_jobs_status;
                DROP INDEX IF EXISTS idx_conversion_jobs_book;
                DROP INDEX IF EXISTS idx_conversion_jobs_queued;
                "#,
            )?;

            // Rename old table, create new one, migrate data, drop old
            self.conn.execute_batch(
                r#"
                ALTER TABLE conversion_jobs RENAME TO _conversion_jobs_v3;

                CREATE TABLE conversion_jobs (
                    id             TEXT PRIMARY KEY,
                    book_id        INTEGER,
                    source_path    TEXT NOT NULL,
                    target_path    TEXT NOT NULL,
                    source_format  TEXT NOT NULL,
                    target_format  TEXT NOT NULL,
                    status         TEXT NOT NULL DEFAULT 'Queued',
                    progress       REAL NOT NULL DEFAULT 0.0,
                    error_message  TEXT,
                    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL
                );

                INSERT OR IGNORE INTO conversion_jobs
                    (id, book_id, source_path, target_path, source_format, target_format,
                     status, progress, error_message, created_at, updated_at)
                SELECT
                    uuid, book_id, source_path,
                    COALESCE(target_path, ''),
                    source_format, target_format,
                    status, progress, error_message,
                    created_at, created_at
                FROM _conversion_jobs_v3;

                DROP TABLE _conversion_jobs_v3;
                "#,
            )?;
        } else if !self.table_exists("conversion_jobs")? {
            // Fresh install — create new schema directly
            self.conn.execute_batch(
                r#"
                CREATE TABLE conversion_jobs (
                    id             TEXT PRIMARY KEY,
                    book_id        INTEGER,
                    source_path    TEXT NOT NULL,
                    target_path    TEXT NOT NULL,
                    source_format  TEXT NOT NULL,
                    target_format  TEXT NOT NULL,
                    status         TEXT NOT NULL DEFAULT 'Queued',
                    progress       REAL NOT NULL DEFAULT 0.0,
                    error_message  TEXT,
                    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL
                );
                "#,
            )?;
        }
        // else: table exists with correct v5 schema already (idempotent re-run)

        // Create indexes (idempotent)
        self.conn.execute_batch(
            r#"
            CREATE INDEX IF NOT EXISTS idx_conv_jobs_status
                ON conversion_jobs(status);

            CREATE INDEX IF NOT EXISTS idx_conv_jobs_book
                ON conversion_jobs(book_id);
            "#,
        )?;

        // conversion_profiles: named presets for repeated conversions
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS conversion_profiles (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                name          TEXT NOT NULL UNIQUE,
                source_format TEXT NOT NULL,
                target_format TEXT NOT NULL,
                options_json  TEXT NOT NULL DEFAULT '{}',
                created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            "#,
        )?;

        self.set_schema_version(5)?;
        self.record_migration(5, "conversion_jobs_profiles", "v5_conversion_persistence")?;

        log::info!("[Migration] v5 applied successfully");
        Ok(())
    }

    /// Migration v6: Online metadata enrichment
    fn migrate_to_v6(&self) -> Result<()> {
        log::info!("[Migration] Applying v6: online_metadata fields and metadata_cache");

        // Add metadata tracking fields to books
        if !self.column_exists("books", "anilist_id")? {
            self.conn.execute(
                "ALTER TABLE books ADD COLUMN anilist_id TEXT DEFAULT NULL",
                [],
            )?;
        }
        if !self.column_exists("books", "online_metadata_fetched")? {
            self.conn.execute(
                "ALTER TABLE books ADD COLUMN online_metadata_fetched INTEGER DEFAULT 0",
                [],
            )?;
        }
        if !self.column_exists("books", "metadata_source")? {
            self.conn.execute(
                "ALTER TABLE books ADD COLUMN metadata_source TEXT DEFAULT NULL",
                [],
            )?;
        }
        if !self.column_exists("books", "metadata_last_sync")? {
            self.conn.execute(
                "ALTER TABLE books ADD COLUMN metadata_last_sync TEXT DEFAULT NULL",
                [],
            )?;
        }

        // Create metadata cache table
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS metadata_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,
                query_hash TEXT NOT NULL,
                response_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at TEXT NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_metadata_cache_lookup ON metadata_cache(provider, query_hash);
            CREATE INDEX IF NOT EXISTS idx_metadata_cache_expiry ON metadata_cache(expires_at);
            "#,
        )?;

        self.set_schema_version(6)?;
        self.record_migration(6, "online_metadata", "v6_online_metadata")?;

        log::info!("[Migration] v6 applied successfully");
        Ok(())
    }

    /// Migration v7: Onboarding and Advanced User Preferences
    fn migrate_to_v7(&self) -> Result<()> {
        log::info!("[Migration] Applying v7: Advanced Onboarding Preferences");

        // Add new onboarding columns to user_preferences
        let columns_to_add = vec![
            ("preferred_content_type", "TEXT DEFAULT 'both'"),
            ("ui_scale", "REAL DEFAULT 1.0"),
            ("performance_mode", "TEXT DEFAULT 'standard'"),
            ("metadata_mode", "TEXT DEFAULT 'online'"),
            ("auto_scan_enabled", "BOOLEAN DEFAULT TRUE"),
            ("default_manga_path", "TEXT DEFAULT NULL"),
        ];

        for (col_name, col_def) in columns_to_add {
            if !self.column_exists("user_preferences", col_name)? {
                let sql = format!(
                    "ALTER TABLE user_preferences ADD COLUMN {} {}",
                    col_name, col_def
                );
                match self.conn.execute(&sql, []) {
                    Ok(_) => log::debug!("Added column {} to user_preferences", col_name),
                    Err(e) => {
                        log::warn!("Failed to add column {}: {}", col_name, e);
                    }
                }
            }
        }

        self.set_schema_version(7)?;
        self.record_migration(7, "onboarding_preferences", "v7_onboarding")?;

        log::info!("[Migration] v7 applied successfully");
        Ok(())
    }

    /// Migration v8: Doodle overlay & enhanced reader preferences
    fn migrate_to_v8(&self) -> Result<()> {
        log::info!("[Migration] Applying v8: Doodles & Reader Enhancement Preferences");

        // Step 1: Doodle strokes storage
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS doodles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                page_number TEXT NOT NULL,
                strokes_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_doodles_book_page
                ON doodles(book_id, page_number);

            CREATE INDEX IF NOT EXISTS idx_doodles_book
                ON doodles(book_id);

            CREATE TRIGGER IF NOT EXISTS doodles_update
            AFTER UPDATE ON doodles
            BEGIN
                UPDATE doodles SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id;
            END;
            "#,
        )?;

        // Step 2: Add reader enhancement columns to user_preferences
        let columns_to_add = vec![
            ("page_flip_enabled", "BOOLEAN DEFAULT 1"),
            ("page_flip_speed", "INTEGER DEFAULT 400"),
            ("paper_theme_enabled", "BOOLEAN DEFAULT 0"),
            ("paper_texture_intensity", "REAL DEFAULT 0.08"),
            ("doodle_enabled", "BOOLEAN DEFAULT 1"),
            ("adaptive_mode", "TEXT DEFAULT 'auto'"),
        ];

        for (col_name, col_def) in columns_to_add {
            if !self.column_exists("user_preferences", col_name)? {
                let sql = format!(
                    "ALTER TABLE user_preferences ADD COLUMN {} {}",
                    col_name, col_def
                );
                match self.conn.execute(&sql, []) {
                    Ok(_) => log::debug!("Added column {} to user_preferences", col_name),
                    Err(e) => {
                        log::warn!("Failed to add column {}: {}", col_name, e);
                    }
                }
            }
        }

        self.set_schema_version(8)?;
        self.record_migration(8, "doodles_reader_enhancements", "v8_doodles_reader_prefs")?;

        log::info!("[Migration] v8 applied successfully");
        Ok(())
    }

    /// Migration v9: Fix RSS schema mismatch
    ///
    /// v3 created rss_feeds with columns (fetch_interval_hours, last_fetched, last_success)
    /// and rss_articles with (link, published_at, fetched_at) but RssService queries for
    /// (check_interval_hours, last_checked, next_check) and inserts (url, published, summary, created_at).
    /// This migration reconciles the schema by recreating both tables with the correct column names.
    fn migrate_to_v9(&self) -> Result<()> {
        log::info!("[Migration] Applying v9: Fix RSS schema mismatch");

        // --- Fix rss_feeds ---
        // Rename columns: fetch_interval_hours -> check_interval_hours,
        //                  last_fetched -> last_checked,
        //                  last_success -> next_check
        if self.table_exists("rss_feeds")? {
            let needs_fix = self.column_exists("rss_feeds", "fetch_interval_hours")?
                && !self.column_exists("rss_feeds", "check_interval_hours")?;

            if needs_fix {
                self.conn.execute_batch(r#"
                    ALTER TABLE rss_feeds RENAME TO _rss_feeds_v3;

                    CREATE TABLE rss_feeds (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        url TEXT NOT NULL UNIQUE,
                        title TEXT,
                        description TEXT,
                        last_checked TEXT,
                        next_check TEXT,
                        check_interval_hours INTEGER DEFAULT 12,
                        failure_count INTEGER DEFAULT 0,
                        is_active INTEGER DEFAULT 1,
                        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );

                    INSERT INTO rss_feeds (id, url, title, description, last_checked, next_check,
                                           check_interval_hours, failure_count, is_active, created_at)
                    SELECT id, url, title, description, last_fetched, last_success,
                           fetch_interval_hours, failure_count, is_active, created_at
                    FROM _rss_feeds_v3;

                    DROP TABLE _rss_feeds_v3;

                    CREATE INDEX IF NOT EXISTS idx_rss_feeds_active ON rss_feeds(is_active) WHERE is_active = 1;
                "#)?;
                log::info!("[Migration] v9: rss_feeds columns renamed");
            }
        }

        // --- Fix rss_articles ---
        // The v3 schema has: guid UNIQUE, link, published_at, fetched_at
        // RssService expects: guid (not unique by itself), url, published, summary, created_at
        if self.table_exists("rss_articles")? {
            let needs_fix = self.column_exists("rss_articles", "link")?
                && !self.column_exists("rss_articles", "url")?;

            if needs_fix {
                self.conn.execute_batch(r#"
                    ALTER TABLE rss_articles RENAME TO _rss_articles_v3;

                    CREATE TABLE rss_articles (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        feed_id INTEGER NOT NULL,
                        title TEXT NOT NULL,
                        author TEXT,
                        url TEXT,
                        content TEXT NOT NULL DEFAULT '',
                        summary TEXT,
                        published TEXT,
                        guid TEXT NOT NULL,
                        is_read INTEGER DEFAULT 0,
                        epub_book_id INTEGER,
                        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (feed_id) REFERENCES rss_feeds(id) ON DELETE CASCADE,
                        FOREIGN KEY (epub_book_id) REFERENCES books(id) ON DELETE SET NULL
                    );

                    INSERT INTO rss_articles (id, feed_id, title, author, url, content,
                                              summary, published, guid, is_read, epub_book_id, created_at)
                    SELECT id, feed_id, title, author, link, content,
                           NULL, published_at, guid, is_read, epub_book_id, fetched_at
                    FROM _rss_articles_v3;

                    DROP TABLE _rss_articles_v3;

                    CREATE INDEX IF NOT EXISTS idx_rss_articles_feed ON rss_articles(feed_id);
                    CREATE INDEX IF NOT EXISTS idx_rss_articles_guid ON rss_articles(guid);
                "#)?;
                log::info!("[Migration] v9: rss_articles columns renamed");
            }
        }

        self.set_schema_version(9)?;
        self.record_migration(9, "fix_rss_schema_mismatch", "v9_rss_schema_fix")?;

        log::info!("[Migration] v9 applied successfully");
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
