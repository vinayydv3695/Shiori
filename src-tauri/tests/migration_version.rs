//! PRAGMA user_version sync (Slice S-A, item 7).
//!
//! v2..v30 called set_schema_version inside their bodies but v31+ never did,
//! leaving user_version stuck at 30 and re-running v31..v44 on every startup.
//! run_migrations now syncs user_version to the highest recorded migration at
//! the end of the run. These tests verify:
//!   (a) a fresh DB opens with user_version == highest migration (44 today),
//!   (b) an existing DB stuck at user_version 30 gets fixed on the next open,
//!   (c) a DB already at the right version stays there (no downgrade).

use shiori::db::Database;
use std::fs;

fn create_temp_db(name: &str) -> (Database, std::path::PathBuf) {
    let temp_dir = std::env::temp_dir().join(format!(
        "shiori_migration_version_{}_{}",
        name,
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let db_path = temp_dir.join("test.db");
    let db = Database::new(&db_path).unwrap();
    (db, temp_dir)
}

fn user_version(db: &Database) -> i32 {
    let conn = db.get_connection().unwrap();
    conn.pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap()
}

fn max_recorded(db: &Database) -> i32 {
    let conn = db.get_connection().unwrap();
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )
    .unwrap()
}

/// (a) Fresh DB: user_version must equal the highest applied migration after
/// open — NOT stuck at 30. Derived from schema_migrations, never hardcoded.
#[test]
fn fresh_db_syncs_user_version() {
    let (db, _temp_dir) = create_temp_db("fresh");
    let expected = max_recorded(&db);
    assert!(expected >= 44, "migrations should have reached v44+, got {expected}");
    assert_eq!(
        user_version(&db),
        expected,
        "fresh DB must open with user_version == highest migration"
    );
}

/// (b) Existing DB with user_version forced back to 30 (the historical stuck
/// state): the next open re-runs the pending migrations and fixes the version,
/// so v31..v44 stop re-running on every startup.
#[test]
fn stuck_db_gets_version_fixed_on_reopen() {
    let (db, temp_dir) = create_temp_db("stuck");
    let expected = max_recorded(&db);
    assert!(expected >= 44);

    // Simulate the historical bug: user_version stuck at 30 while the schema
    // is already fully migrated.
    {
        let conn = db.get_connection().unwrap();
        conn.pragma_update(None, "user_version", 30).unwrap();
    }
    assert_eq!(user_version(&db), 30);

    // Reopen the same file: migrations re-run (idempotent), then user_version
    // is synced to the highest recorded version.
    let reopened = Database::new(temp_dir.join("test.db")).unwrap();
    assert_eq!(
        user_version(&reopened),
        expected,
        "reopen must fix user_version from 30 to {expected}"
    );

    // And a second reopen is a no-op: version stays put (no downgrade, no
    // churn). If user_version were still 30 this would log re-runs of v31+.
    let reopened2 = Database::new(temp_dir.join("test.db")).unwrap();
    assert_eq!(user_version(&reopened2), expected);
}

/// (c) A DB whose user_version is already correct is left untouched (the sync
/// only ever bumps, never downgrades).
#[test]
fn already_synced_db_is_not_downgraded() {
    let (db, temp_dir) = create_temp_db("synced");
    let expected = max_recorded(&db);
    assert_eq!(user_version(&db), expected);

    let again = Database::new(temp_dir.join("test.db")).unwrap();
    assert_eq!(user_version(&again), expected);
}
