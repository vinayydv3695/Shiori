#!/usr/bin/env python3
"""Shiori SQL benchmark — Agent B (Phase 1/3).

Times the exact hot queries the app runs (replicated from
src-tauri/src/services/search_service.rs, commands/manga.rs,
commands/library.rs, services/library_service.rs) against perf/seed/bench.db.

Usage: python3 perf/bench/sql_bench.py [--label baseline] [--db perf/seed/bench.db]
Writes perf/bench/results/<label>.md and prints the same table.
Write benchmarks run inside a SAVEPOINT and roll back (db unchanged).
"""
import argparse, os, sqlite3, statistics, time

HERE = os.path.dirname(os.path.abspath(__file__))

Q = {
    # Q1: default library page, phase 1 (paged ids, keyset cursor mid-table)
    "Q1_default_page_keyset": (
        "SELECT DISTINCT b.id FROM books b WHERE b.in_trash = 0 "
        "AND (b.added_date < ? OR (b.added_date = ? AND b.id < ?)) "
        "ORDER BY b.added_date DESC, b.id DESC LIMIT 50",
        lambda: ("2025-06-15T07:00:00", "2025-06-15T07:00:00", 2000)),
    # Q1b: same page via OFFSET (what non-added_date sorts do)
    "Q1b_default_page_offset": (
        "SELECT DISTINCT b.id FROM books b WHERE b.in_trash = 0 "
        "ORDER BY b.added_date DESC, b.id DESC LIMIT 50 OFFSET 1500",
        None),
    # Q2: FTS search-as-you-type (prefix), paged
    "Q2_fts_prefix_page": (
        "SELECT DISTINCT b.id FROM books b JOIN books_fts fts ON b.id = fts.rowid "
        "WHERE b.in_trash = 0 AND books_fts MATCH ? "
        "ORDER BY b.added_date DESC, b.id DESC LIMIT 50",
        lambda: ('"bench novel"*',)),
    # Q2b: FTS total count (the COUNT(DISTINCT) that accompanies it)
    "Q2b_fts_count": (
        "SELECT COUNT(DISTINCT b.id) FROM books b JOIN books_fts fts ON b.id = fts.rowid "
        "WHERE b.in_trash = 0 AND books_fts MATCH ?",
        lambda: ('"bench novel"*',)),
    # Q3: series page data — all volumes of the 1100-chapter series (what SeriesView consumes)
    "Q3_series_books_all": (
        "SELECT * FROM books WHERE manga_series_id = 1 AND in_trash = 0 "
        "ORDER BY series_index ASC, added_date ASC",
        None),
    # Q4: single reading-status flip (books_fts_update trigger fires) — autocommit
    "Q4_status_update_one": (
        "UPDATE books SET reading_status = 'completed', modified_date = CURRENT_TIMESTAMP WHERE id = ?",
        "LOOP_UPDATE"),
    # Q5: series-linkage update from import_online_manga_chapters (FTS trigger fires)
    "Q5_linkage_update_one": (
        "UPDATE books SET manga_series_id = 1, series = 'Bench Piece', series_index = ?, anilist_id = '30013' WHERE id = ?",
        "LOOP_LINKAGE"),
    # Q6: get_library_stats (current: full scan, no in_trash filter)
    "Q6_library_stats": (
        "SELECT COALESCE(SUM(CASE WHEN domain = 'books' THEN 1 ELSE 0 END), 0), "
        "COALESCE(SUM(CASE WHEN domain IN ('manga','comics','manga_comics') THEN 1 ELSE 0 END), 0), "
        "COALESCE(SUM(file_size), 0) FROM books",
        None),
    # Q7: pagination total, default filter
    "Q7_count_default": ("SELECT COUNT(DISTINCT b.id) FROM books b WHERE b.in_trash = 0", None),
    # Q8: author-sort page (grouped LEFT JOIN path)
    "Q8_author_sort_page": (
        "SELECT DISTINCT b.id FROM books b "
        "LEFT JOIN (SELECT ba.book_id AS am_book_id, MIN(a.name) AS author_name "
        "FROM books_authors ba JOIN authors a ON a.id = ba.author_id GROUP BY ba.book_id) am "
        "ON am.am_book_id = b.id WHERE b.in_trash = 0 "
        "ORDER BY am.author_name DESC NULLS LAST, b.id DESC LIMIT 50",
        None),
    # Q9: batch hydration of authors for a 50-id page (attach_authors_and_tags)
    "Q9_attach_authors_50": (
        "SELECT ba.book_id, a.name FROM books_authors ba JOIN authors a ON a.id = ba.author_id "
        f"WHERE ba.book_id IN ({','.join(str(i) for i in range(2001, 2051))}) ORDER BY ba.book_id, ba.author_order",
        None),
    # Q10: manga domain page (domain filter used by the manga library view)
    "Q10_manga_domain_page": (
        "SELECT DISTINCT b.id FROM books b WHERE b.in_trash = 0 "
        "AND (b.domain IN ('manga','comics','manga_comics','online-manga') "
        "OR b.file_format IN ('cbz','cbr','zip','rar','7z','online-manga')) "
        "ORDER BY b.added_date DESC, b.id DESC LIMIT 50",
        None),
    # Q11: get_series_volumes (reader next/prev hop)
    "Q11_series_volumes": (
        "SELECT id, manga_series_id, id as book_id, CAST(series_index AS INTEGER) "
        "FROM books WHERE manga_series_id = 1 ORDER BY series_index ASC NULLS LAST, added_date ASC",
        None),
    # Q12: get_manga_series_list(1000,0) — the SeriesView metadata hack
    "Q12_series_list_1000": (
        "SELECT id, title, sort_title, cover_path, status, added_date FROM manga_series "
        "ORDER BY added_date DESC LIMIT 1000 OFFSET 0",
        None),
}

def time_query(conn, sql, params, repeat):
    times = []
    for _ in range(repeat):
        t0 = time.perf_counter()
        cur = conn.execute(sql, params or ())
        cur.fetchall()
        times.append((time.perf_counter() - t0) * 1000)
    return times

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="baseline")
    ap.add_argument("--db", default=os.path.join(HERE, "..", "seed", "bench.db"))
    args = ap.parse_args()

    conn = sqlite3.connect(f"file:{args.db}?mode=rw", uri=True)
    # Autocommit mode = faithful simulation of rusqlite's per-statement
    # autocommit. SAVEPOINT+RELEASE of the outermost savepoint commits,
    # so the LOOP_* benches perform real per-statement transactions.
    # NOTE: the update benches rewrite identical values (idempotent no-ops
    # data-wise) but SQLite still writes rows + fires triggers = valid cost.
    conn.isolation_level = None
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-65536")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute("PRAGMA mmap_size=3000000000")

    rows = []
    plans = {}
    for name, (sql, params) in Q.items():
        # EXPLAIN QUERY PLAN (evidence, rule 1)
        if isinstance(params, str):  # LOOP_* write benches: skip plan
            plan = []
        else:
            p = params() if callable(params) else ()
            plan = [r[3] for r in conn.execute("EXPLAIN QUERY PLAN " + sql, p).fetchall()]
        plans[name] = plan

        if params == "LOOP_UPDATE":
            # Q4: 200 single autocommit updates (each = own transaction) — the
            # "mark all read" / per-book status pattern. SAVEPOINT outer so we
            # can roll back; inner statements still autocommit individually.
            t0 = time.perf_counter()
            for i in range(1, 201):
                conn.execute("SAVEPOINT sp")
                conn.execute(sql, (i,))
                conn.execute("RELEASE sp")
            loop_ms = (time.perf_counter() - t0) * 1000
            rows.append((name, 200, loop_ms, loop_ms / 200, "200 autocommit updates (idempotent values)"))
            continue
        if params == "LOOP_LINKAGE":
            t0 = time.perf_counter()
            for i in range(1, 201):
                conn.execute("SAVEPOINT sp")
                conn.execute(sql, (float(i), i))
                conn.execute("RELEASE sp")
            loop_ms = (time.perf_counter() - t0) * 1000
            rows.append((name, 200, loop_ms, loop_ms / 200, "200 autocommit linkage updates (idempotent values)"))
            continue

        repeat = 30
        times = time_query(conn, sql, params() if callable(params) else None, repeat)
        med = statistics.median(times)
        p95 = sorted(times)[int(len(times) * 0.95) - 1]
        rows.append((name, repeat, med, p95, "median/p95 ms"))

    # The money shot: linkage updates batched in ONE transaction vs autocommit
    t0 = time.perf_counter()
    conn.execute("SAVEPOINT batch")
    conn.executemany("UPDATE books SET manga_series_id = 1, series = 'Bench Piece', series_index = ?, anilist_id = '30013' WHERE id = ?",
                     [(float(i), i) for i in range(1, 201)])
    conn.execute("RELEASE batch")
    batch_ms = (time.perf_counter() - t0) * 1000
    rows.append(("Q5b_linkage_update_x200_1tx", 200, batch_ms, batch_ms / 200, "ONE transaction (idempotent values)"))

    # And: status update WITHOUT touching FTS-indexed columns is impossible
    # (trigger is on books row update) — measure raw trigger overhead:
    t0 = time.perf_counter()
    conn.execute("SAVEPOINT batch2")
    conn.executemany("UPDATE books SET reading_status = 'completed' WHERE id = ?", [(i,) for i in range(1, 201)])
    conn.execute("RELEASE batch2")
    batch2_ms = (time.perf_counter() - t0) * 1000
    rows.append(("Q4b_status_update_x200_1tx", 200, batch2_ms, batch2_ms / 200, "ONE transaction (idempotent values)"))
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

    lines = [f"# SQL bench — label: {args.label}", "",
             f"db: {args.db} (3150 books, 1100-chapter series, FTS populated)", "",
             "| query | n | median ms | p95/per-op ms | note |", "|---|---|---|---|---|"]
    for name, n, med, p95, note in rows:
        lines.append(f"| {name} | {n} | {med:.3f} | {p95:.3f} | {note} |")
    lines += ["", "## Query plans (EXPLAIN QUERY PLAN)", ""]
    for name, plan in plans.items():
        if plan:
            lines.append(f"**{name}**")
            lines.append("```")
            lines.extend(plan)
            lines.append("```")
            lines.append("")

    out = os.path.join(HERE, "results", f"{args.label}.md")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        f.write("\n".join(lines))
    print("\n".join(lines[:7 + len(rows)]))
    print(f"\nwrote {out}")

if __name__ == "__main__":
    main()
