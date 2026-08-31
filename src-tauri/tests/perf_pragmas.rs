//! K3-021: per-connection perf pragmas must run only once per connection per
//! mode generation (not on every checkout), and must still track mode changes.

use shiori::db::Database;
use tempfile::tempdir;

fn cache_size(conn: &rusqlite::Connection) -> i64 {
    conn.query_row("PRAGMA cache_size", [], |row| row.get(0))
        .unwrap()
}

fn set_mode(db: &Database, mode: &str) {
    let conn = db.get_connection().unwrap();
    conn.execute(
        "UPDATE user_preferences SET performance_mode = ?1 WHERE id = 1",
        [mode],
    )
    .unwrap();
    drop(conn);
    db.apply_performance_pragmas().unwrap();
}

#[test]
fn perf_pragmas_follow_mode_generation() {
    let dir = tempdir().unwrap();
    let db = Database::new(&dir.path().join("perf.db")).unwrap();

    // Base pragmas (WAL) stay untouched.
    let conn1 = db.get_connection().unwrap();
    let journal_mode: String = conn1
        .query_row("PRAGMA journal_mode", [], |r| r.get(0))
        .unwrap();
    assert_eq!(journal_mode.to_lowercase(), "wal");

    // First checkout applies the default (standard) mode.
    assert_eq!(cache_size(&conn1), -32000);
    drop(conn1);

    // Checkouts without a mode change must NOT re-run pragmas: stomp
    // cache_size with a sentinel — the next checkout leaves it alone.
    let conn = db.get_connection().unwrap();
    conn.execute_batch("PRAGMA cache_size = -12345;").unwrap();
    drop(conn);
    let conn = db.get_connection().unwrap();
    assert_eq!(
        cache_size(&conn),
        -12345,
        "pragma must not re-run on unchanged generation"
    );
    drop(conn);

    // Mode switch: same pooled connection re-applies on next checkout.
    set_mode(&db, "large_library");
    let conn1 = db.get_connection().unwrap();
    assert_eq!(cache_size(&conn1), -128000);
    drop(conn1);

    // Another switch.
    set_mode(&db, "low_memory");
    let conn2 = db.get_connection().unwrap();
    assert_eq!(cache_size(&conn2), -2000);
    drop(conn2);

    // Idempotent steady state: repeated checkouts stay at -2000.
    for _ in 0..3 {
        let c = db.get_connection().unwrap();
        assert_eq!(cache_size(&c), -2000);
    }
}
