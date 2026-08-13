//! Migration data-integrity fixes (S-18/S-19/S-29 + v46).
//!
//! Covers: (a) a v8-era DB full-migrates with all six v8 reader-enhancement
//! preference columns intact (page_flip_enabled default 1, adaptive_mode
//! default 'auto'), (b) a v21-era DB full-migrates with user_preferences
//! keeping a PRIMARY KEY on id and CHECK constraints (v22's CTAS used to drop
//! them; the final v29 schema carries `id INTEGER PRIMARY KEY CHECK (id = 1)`),
//! (c) a v3-era DB full-migrates with lowercase conversion_jobs statuses
//! normalized to the capitalized values the engine reads, (d) a fresh DB gets
//! the six columns exactly once and a forced v29 re-run stays idempotent,
//! (e) v46 re-runs (simulated stuck user_version) never duplicate columns.

use shiori::db::Database;

use std::fs;

fn create_temp_db(name: &str) -> (Database, std::path::PathBuf) {
    let temp_dir = std::env::temp_dir().join(format!(
        "shiori_migration_v46_{}_{}",
        name,
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let db_path = temp_dir.join("test.db");
    let db = Database::new(&db_path).unwrap();
    (db, temp_dir)
}

/// The six columns v8 added to user_preferences (exact v8 names/defaults).
const V8_COLS: [(&str, &str); 6] = [
    ("page_flip_enabled", "BOOLEAN DEFAULT 1"),
    ("page_flip_speed", "INTEGER DEFAULT 400"),
    ("paper_theme_enabled", "BOOLEAN DEFAULT 0"),
    ("paper_texture_intensity", "REAL DEFAULT 0.08"),
    ("doodle_enabled", "BOOLEAN DEFAULT 1"),
    ("adaptive_mode", "TEXT DEFAULT 'auto'"),
];

/// The user_preferences schema as it existed at v8 (v2 base + v7 + v8).
const V8_USER_PREFERENCES: &str = r#"
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    theme TEXT DEFAULT 'black' CHECK(theme IN ('black', 'white', 'rose-pine-moon', 'catppuccin-mocha', 'nord', 'dracula', 'tokyo-night', 'light', 'dark', 'system', 'sepia', 'high-contrast')),
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
    manga_mode TEXT DEFAULT 'single' CHECK(manga_mode IN ('long-strip', 'single', 'double')),
    manga_direction TEXT DEFAULT 'ltr' CHECK(manga_direction IN ('ltr', 'rtl')),
    manga_margin_size INTEGER DEFAULT 0 CHECK(manga_margin_size BETWEEN 0 AND 100),
    manga_fit_width BOOLEAN DEFAULT 1,
    manga_background_color TEXT DEFAULT '#000000',
    manga_progress_bar TEXT DEFAULT 'bottom' CHECK(manga_progress_bar IN ('top', 'bottom', 'hidden')),
    manga_image_smoothing BOOLEAN DEFAULT 1,
    manga_preload_count INTEGER DEFAULT 3 CHECK(manga_preload_count BETWEEN 1 AND 5),
    manga_gpu_acceleration BOOLEAN DEFAULT 1,
    auto_start BOOLEAN DEFAULT 0,
    default_import_path TEXT DEFAULT '',
    ui_density TEXT DEFAULT 'comfortable' CHECK(ui_density IN ('compact', 'comfortable')),
    accent_color TEXT DEFAULT '#4A9EFF',
    preferred_content_type TEXT DEFAULT 'both',
    ui_scale REAL DEFAULT 1.0,
    performance_mode TEXT DEFAULT 'standard',
    metadata_mode TEXT DEFAULT 'online',
    auto_scan_enabled BOOLEAN DEFAULT TRUE,
    default_manga_path TEXT DEFAULT NULL,
    page_flip_enabled BOOLEAN DEFAULT 1,
    page_flip_speed INTEGER DEFAULT 400,
    paper_theme_enabled BOOLEAN DEFAULT 0,
    paper_texture_intensity REAL DEFAULT 0.08,
    doodle_enabled BOOLEAN DEFAULT 1,
    adaptive_mode TEXT DEFAULT 'auto',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1
);
"#;

/// The user_preferences schema as it existed at v21 (v8 schema + v12 TTS +
/// v14 translation + v21 auto_group_manga — i.e. what v22 must rebuild).
const V21_USER_PREFERENCES: &str = r#"
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    theme TEXT DEFAULT 'black' CHECK(theme IN ('black', 'white', 'rose-pine-moon', 'catppuccin-mocha', 'nord', 'dracula', 'tokyo-night', 'light', 'dark', 'system', 'sepia', 'high-contrast')),
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
    manga_mode TEXT DEFAULT 'single' CHECK(manga_mode IN ('long-strip', 'single', 'double')),
    manga_direction TEXT DEFAULT 'ltr' CHECK(manga_direction IN ('ltr', 'rtl')),
    manga_margin_size INTEGER DEFAULT 0 CHECK(manga_margin_size BETWEEN 0 AND 100),
    manga_fit_width BOOLEAN DEFAULT 1,
    manga_background_color TEXT DEFAULT '#000000',
    manga_progress_bar TEXT DEFAULT 'bottom' CHECK(manga_progress_bar IN ('top', 'bottom', 'hidden')),
    manga_image_smoothing BOOLEAN DEFAULT 1,
    manga_preload_count INTEGER DEFAULT 3 CHECK(manga_preload_count BETWEEN 1 AND 5),
    manga_gpu_acceleration BOOLEAN DEFAULT 1,
    auto_start BOOLEAN DEFAULT 0,
    default_import_path TEXT DEFAULT '',
    ui_density TEXT DEFAULT 'comfortable' CHECK(ui_density IN ('compact', 'comfortable')),
    accent_color TEXT DEFAULT '#4A9EFF',
    preferred_content_type TEXT DEFAULT 'both',
    ui_scale REAL DEFAULT 1.0,
    performance_mode TEXT DEFAULT 'standard',
    metadata_mode TEXT DEFAULT 'online',
    auto_scan_enabled BOOLEAN DEFAULT TRUE,
    default_manga_path TEXT DEFAULT NULL,
    page_flip_enabled BOOLEAN DEFAULT 1,
    page_flip_speed INTEGER DEFAULT 400,
    paper_theme_enabled BOOLEAN DEFAULT 0,
    paper_texture_intensity REAL DEFAULT 0.08,
    doodle_enabled BOOLEAN DEFAULT 1,
    adaptive_mode TEXT DEFAULT 'auto',
    tts_voice TEXT NOT NULL DEFAULT 'default',
    tts_rate REAL NOT NULL DEFAULT 1.0,
    tts_auto_advance INTEGER NOT NULL DEFAULT 1,
    tts_highlight_color TEXT NOT NULL DEFAULT '#f3a6a68c',
    translation_target_language TEXT NOT NULL DEFAULT 'en',
    auto_group_manga BOOLEAN DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1
);
"#;

/// Rebuild user_preferences as it looked at an old schema version, then force
/// user_version back so the next open re-runs the pending migrations.
fn install_era_user_preferences(
    conn: &rusqlite::Connection,
    create_sql: &str,
    row_sql: &str,
    era_version: i32,
) {
    conn.execute_batch(&format!(
        "DROP TABLE IF EXISTS user_preferences;
         DROP TRIGGER IF EXISTS user_preferences_update;
         {};
         {};
         CREATE TRIGGER user_preferences_update
         AFTER UPDATE ON user_preferences
         BEGIN
             UPDATE user_preferences SET updated_at = CURRENT_TIMESTAMP WHERE id = 1;
         END;",
        create_sql, row_sql
    ))
    .unwrap();
    conn.pragma_update(None, "user_version", era_version)
        .unwrap();
}

fn pref_columns(conn: &rusqlite::Connection) -> Vec<String> {
    let mut stmt = conn.prepare("PRAGMA table_info(user_preferences)").unwrap();
    stmt.query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .collect::<std::result::Result<_, _>>()
        .unwrap()
}

fn column_default(conn: &rusqlite::Connection, col: &str) -> Option<String> {
    let mut stmt = conn.prepare("PRAGMA table_info(user_preferences)").unwrap();
    let mut rows = stmt.query([]).unwrap();
    while let Some(row) = rows.next().unwrap() {
        let name: String = row.get(1).unwrap();
        if name == col {
            return row.get(4).unwrap();
        }
    }
    None
}

/// (a) A v8-era DB full-migrates with all six v8 preference columns present,
/// page_flip_enabled defaulting to 1 and adaptive_mode to 'auto'.
#[test]
fn v8_era_db_keeps_reader_columns_on_full_migrate() {
    let (db, temp_dir) = create_temp_db("v8_era");
    {
        let conn = db.get_connection().unwrap();
        install_era_user_preferences(
            &conn,
            V8_USER_PREFERENCES,
            "INSERT INTO user_preferences (id) VALUES (1);",
            8,
        );
    }

    let reopened = Database::new(temp_dir.join("test.db")).unwrap();
    let conn = reopened.get_connection().unwrap();
    let cols = pref_columns(&conn);

    for (col, _def) in V8_COLS {
        assert!(
            cols.iter().filter(|c| *c == col).count() == 1,
            "{} must exist exactly once, got: {:?}",
            col,
            cols
        );
    }
    // Exact v8 defaults survive the v22 + v29 rebuilds.
    assert_eq!(column_default(&conn, "page_flip_enabled").as_deref(), Some("1"));
    assert_eq!(column_default(&conn, "adaptive_mode").as_deref(), Some("'auto'"));
    assert_eq!(column_default(&conn, "doodle_enabled").as_deref(), Some("1"));
    assert_eq!(column_default(&conn, "paper_texture_intensity").as_deref(), Some("0.08"));

    // The singleton row carries the defaults too (v8's ALTER filled them, and
    // the v22/v29 rebuilds copied them instead of dropping them).
    let (page_flip, adaptive): (i64, String) = conn
        .query_row(
            "SELECT page_flip_enabled, adaptive_mode FROM user_preferences WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(page_flip, 1);
    assert_eq!(adaptive, "auto");
}

/// (b) A v21-era DB full-migrates with user_preferences keeping a PRIMARY KEY
/// on id and CHECK constraints (v22's CTAS rebuild used to drop them), and
/// with the v8 reader columns + values preserved through the v22/v29 rebuilds.
#[test]
fn v21_era_db_keeps_pk_checks_and_data_on_full_migrate() {
    let (db, temp_dir) = create_temp_db("v21_era");
    {
        let conn = db.get_connection().unwrap();
        install_era_user_preferences(
            &conn,
            V21_USER_PREFERENCES,
            "INSERT INTO user_preferences (
                 id, theme, book_font_size, book_custom_css, page_flip_enabled,
                 page_flip_speed, paper_theme_enabled, paper_texture_intensity,
                 doodle_enabled, adaptive_mode, tts_voice
             ) VALUES (1, 'sepia', 24, 'body{}', 0, 500, 1, 0.2, 0, 'dark', 'en-US-X');",
            21,
        );
    }

    let reopened = Database::new(temp_dir.join("test.db")).unwrap();
    let conn = reopened.get_connection().unwrap();

    // The rebuilt table has a PRIMARY KEY and CHECK constraints (final v29
    // schema carries `id INTEGER PRIMARY KEY CHECK (id = 1)`; the fixed v22
    // rebuild additionally restores the font-size/theme ranges in between).
    let table_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_preferences'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(
        table_sql.contains("PRIMARY KEY"),
        "user_preferences lost its PRIMARY KEY: {}",
        table_sql
    );
    assert!(
        table_sql.contains("CHECK (id = 1)"),
        "user_preferences lost its CHECK constraints: {}",
        table_sql
    );
    for (col, _def) in V8_COLS {
        assert!(
            table_sql.contains(col),
            "{} missing from rebuilt user_preferences: {}",
            col,
            table_sql
        );
    }

    // All data survives the v22 rebuild and the v29 rebuild (previously the
    // v8 reader columns were silently dropped by v29).
    let (theme, font_size, custom_css, page_flip, adaptive, doodle, speed, paper_on,
         texture, tts): (String, i64, String, i64, String, i64, i64, i64, f64, String) = conn
        .query_row(
            "SELECT theme, book_font_size, book_custom_css, page_flip_enabled,
                    adaptive_mode, doodle_enabled, page_flip_speed, paper_theme_enabled,
                    paper_texture_intensity, tts_voice
             FROM user_preferences WHERE id = 1",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                ))
            },
        )
        .unwrap();
    assert_eq!(theme, "sepia");
    assert_eq!(font_size, 24);
    assert_eq!(custom_css, "body{}");
    assert_eq!(page_flip, 0);
    assert_eq!(adaptive, "dark");
    assert_eq!(doodle, 0);
    assert_eq!(speed, 500);
    assert_eq!(paper_on, 1);
    assert_eq!(texture, 0.2);
    assert_eq!(tts, "en-US-X");
}

/// (c) A v3-era DB full-migrates with conversion_jobs statuses normalized to
/// the capitalized values the engine reads ('Queued'/'Processing'/...), so
/// pending jobs resurface on restart instead of staying invisible.
#[test]
fn v3_era_conversion_jobs_statuses_are_capitalized() {
    let (db, temp_dir) = create_temp_db("v3_era");
    {
        let conn = db.get_connection().unwrap();
        conn.execute(
            "INSERT INTO books (uuid, title, file_path, file_format)
             VALUES ('v3-book-1', 'V3 Book', '/tmp/v3.epub', 'epub')",
            [],
        )
        .unwrap();
        let book_id = conn.last_insert_rowid();

        // v3-era schema: lowercase statuses behind a CHECK, uuid column, and
        // the four v3 indexes (v5 drops the indexes and migrates the data).
        conn.execute_batch(&format!(
            r#"
            DROP TABLE IF EXISTS conversion_jobs;

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
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                started_at TEXT,
                completed_at TEXT,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_conversion_jobs_uuid ON conversion_jobs(uuid);
            CREATE INDEX IF NOT EXISTS idx_conversion_jobs_status ON conversion_jobs(status);
            CREATE INDEX IF NOT EXISTS idx_conversion_jobs_book ON conversion_jobs(book_id);
            CREATE INDEX IF NOT EXISTS idx_conversion_jobs_queued
                ON conversion_jobs(status, created_at) WHERE status = 'queued';

            INSERT INTO conversion_jobs (uuid, book_id, source_format, target_format, source_path, status) VALUES
                ('job-q', {book_id}, 'epub', 'mobi', '/tmp/a.epub', 'queued'),
                ('job-p', {book_id}, 'epub', 'mobi', '/tmp/b.epub', 'processing'),
                ('job-c', {book_id}, 'epub', 'mobi', '/tmp/c.epub', 'completed'),
                ('job-f', {book_id}, 'epub', 'mobi', '/tmp/d.epub', 'failed'),
                ('job-x', {book_id}, 'epub', 'mobi', '/tmp/e.epub', 'cancelled'),
                ('job-cap', {book_id}, 'epub', 'mobi', '/tmp/f.epub', 'queued');
            "#,
        ))
        .unwrap();
        conn.pragma_update(None, "user_version", 3).unwrap();
    }

    let reopened = Database::new(temp_dir.join("test.db")).unwrap();
    let conn = reopened.get_connection().unwrap();

    let mut statuses: Vec<String> = conn
        .prepare("SELECT status FROM conversion_jobs")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<std::result::Result<_, _>>()
        .unwrap();
    statuses.sort();
    assert_eq!(
        statuses,
        vec![
            "Cancelled".to_string(),
            "Completed".to_string(),
            "Failed".to_string(),
            "Processing".to_string(),
            "Queued".to_string(),
            "Queued".to_string(),
        ],
        "v5 must normalize lowercase statuses to capitalized ones"
    );

    // The engine's pending-jobs query (conversion_engine::load_pending_jobs)
    // now finds the queued/processing jobs again.
    let pending: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM conversion_jobs WHERE status IN ('Queued', 'Processing')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(pending, 3, "queued/processing jobs must be visible after upgrade");
}

/// (d) A fresh DB gets the six v8 columns exactly once (v29 + v46 both run on
/// the fresh path), and a forced v29 re-run stays idempotent.
#[test]
fn fresh_db_has_reader_columns_exactly_once() {
    let (db, temp_dir) = create_temp_db("fresh");
    {
        let conn = db.get_connection().unwrap();
        let cols = pref_columns(&conn);
        for (col, _def) in V8_COLS {
            assert_eq!(
                cols.iter().filter(|c| *c == col).count(),
                1,
                "{} must exist exactly once on a fresh DB",
                col
            );
        }
        // v29 + v46 must not duplicate: force a re-run from below v29.
        conn.pragma_update(None, "user_version", 28).unwrap();
    }

    let reopened = Database::new(temp_dir.join("test.db")).unwrap();
    let conn = reopened.get_connection().unwrap();
    let cols = pref_columns(&conn);
    for (col, _def) in V8_COLS {
        assert_eq!(
            cols.iter().filter(|c| *c == col).count(),
            1,
            "{} duplicated after v29 re-run",
            col
        );
    }
    let (page_flip, adaptive): (i64, String) = conn
        .query_row(
            "SELECT page_flip_enabled, adaptive_mode FROM user_preferences WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(page_flip, 1);
    assert_eq!(adaptive, "auto");
}

/// (e) v46 re-runs (simulated stuck user_version 30, which makes v31+ re-run
/// on every startup) never error and never duplicate columns.
#[test]
fn v46_rerun_is_idempotent() {
    let (db, temp_dir) = create_temp_db("v46_rerun");

    // First re-run: v46 must be a no-op.
    {
        let conn = db.get_connection().unwrap();
        conn.pragma_update(None, "user_version", 30).unwrap();
    }
    let reopened = Database::new(temp_dir.join("test.db")).unwrap();
    {
        let conn = reopened.get_connection().unwrap();
        let cols = pref_columns(&conn);
        for (col, _def) in V8_COLS {
            assert_eq!(cols.iter().filter(|c| *c == col).count(), 1, "{}", col);
        }
    }

    // Second re-run (user_version stuck again): still no error, no dupes.
    {
        let conn = reopened.get_connection().unwrap();
        conn.pragma_update(None, "user_version", 30).unwrap();
    }
    let reopened2 = Database::new(temp_dir.join("test.db")).unwrap();
    let conn2 = reopened2.get_connection().unwrap();
    let cols = pref_columns(&conn2);
    for (col, _def) in V8_COLS {
        assert_eq!(
            cols.iter().filter(|c| *c == col).count(),
            1,
            "{} duplicated after second v46 re-run",
            col
        );
    }
}
