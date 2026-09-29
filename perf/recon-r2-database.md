# R2 — Database & Queries Recon (READ-ONLY pass)

Scope: every SQL query and Tauri data command, indexes, pagination, transactions, PRAGMAs, FTS5.

## Already solid (verified, do not regress)
- Keyset (cursor) pagination on the default `added_date` sort with deterministic `b.id` tiebreaker; `MAX_LIMIT = 1000` clamp — `src-tauri/src/services/search_service.rs:8,236-346`.
- Two-phase search: paged `SELECT DISTINCT b.id`, then `library_service::get_books_by_ids` hydration; authors/tags batch-attached in chunks — `search_service.rs:362-373`, `library_service.rs:75-140` (comment: "eliminates N+1 queries").
- 71 named indexes across hot columns (`grep CREATE INDEX` in `db/migrations.rs`, incl. `idx_books_series`, `idx_books_manga_series`, `idx_books_status_date`, `idx_books_domain_added`, `idx_books_hash`).
- PRAGMAs: WAL, `synchronous=NORMAL`, `busy_timeout=5000`, foreign_keys ON; desktop `mmap_size=3GB, cache_size=-65536`; Android `mmap=64MB, cache=-8000`; perf modes (Large Library `-128000` cache) — `db/mod.rs:23-66`.
- Author sort uses a grouped LEFT JOIN instead of a correlated subquery (`search_service.rs:304-312`) with an EXPLAIN-PLAN regression test (`:500-503`).
- Migrations v2…v42 are SAVEPOINT-wrapped and additive (`db/migrations.rs`, skill doc).

## Critical

### C1. Batch import path has no transaction wrapper
- **Files:** `src-tauri/src/commands/library.rs:1592-1700` (`import_online_manga_chapters`), `src-tauri/src/services/library_service.rs:1946-2010` (`import_manga`), `library_service.rs:1197+` (`import_single_book`).
- **Evidence:** `import_manga` loops paths calling `import_single_book`, which grabs `db.get_connection()` per file and runs its statements in autocommit (trash check, EXISTS, hash, INSERT, domain UPDATE). After import, the command runs one `UPDATE books SET manga_series_id…` **per chapter** in a plain `for` loop (lines 1640-1680) — 1000 autocommit UPDATEs for a 1000-chapter batch, each also firing FTS sync triggers (see H1). WAL + NORMAL keeps this from being catastrophic, but it is orders of magnitude slower than one transaction and keeps the SQLite write lock hot for the whole batch, starving concurrent reads (library UI).
- **Also:** cover generation runs per imported file inside the loop (image decode + resize per CBZ) — fine one-off, brutal ×1000 without parallelism or batching.

## High

### H1. FTS sync triggers re-index heavy columns on every book update
- **File:** `src-tauri/src/db/migrations.rs:281-320` — `books_fts(title, authors, publisher, description, tags, isbn)`, `tokenize='porter unicode61'`, with `books_fts_update` trigger on the books table.
- **Evidence:** any `UPDATE books` (reading_status, last_opened, manga_series_id, notes) re-runs the delete+insert of the FTS row, porter-stemming `description` (often multi-KB) and `tags` every time. Combined with C2 (per-book status updates) and C1 (per-chapter linkage UPDATEs) this is the hidden multiplier. Consider: narrower FTS columns, `content=` external-content mode, or deferring/batching FTS maintenance for bulk updates.

### H2. Per-page DB round-trip in the reader hot path
- **File:** `src-tauri/src/commands/manga.rs:267-279` — `get_manga_page_path` runs `SELECT file_hash FROM books WHERE id = ?1` on **every page render** (also inside the 3-way preload workers). A page turn = ZIP I/O + SQLite checkout + disk write. Cache the hash in `MangaState` at `open_manga` time.

## Medium

### M1. `get_library_stats` scans `books` with no `in_trash` filter
- **File:** `src-tauri/src/services/library_service.rs:2402-2426` — `SELECT … FROM books` (whole table, counts trashed rows → wrong numbers, and a full scan on every HomePage mount via `HomePage.tsx:250`).

### M2. Series-scoped reads the frontend needs don't exist as lean DTOs
- **Evidence:** `SeriesView` needs id/title/series_index/cover/status per volume but consumes full `Book` rows through the client-side grouping window (`useGroupedLibrary.ts`); there is no `get_series_books(series_id, limit, cursor)` keyset command. `get_series_volumes` (`commands/manga.rs:392-433`) returns only id pairs — the opposite extreme (too lean for the dialog, unused by SeriesView).

### M3. `get_manga_series_list` OFFSET pagination, validated `limit` misused as id
- **File:** `src-tauri/src/commands/manga.rs:347-390` — OFFSET scan; called with limit=1000 from `SeriesView.tsx` (R1-H1) to fetch everything just to resolve one id.

## Low
- `getBooksByReadingStatus` / `getBooksByDomain` / `getRecommendedBooks` are all LIMIT-bounded (verified call sites in `HomePage.tsx:255-281`) — fine.
- `reading_progress` batch fetch exists (`reader_service.rs:60` uses `IN ({})` chunks) — good; HomePage uses it.
- Deleted-books tombstone lookups hit `idx_deleted_books_path/hash` — fine.

## Migration-safety note for Phase 2
Any new index must arrive as `migrate_to_vN+1` appended in order, SAVEPOINT-wrapped, idempotent (the repo forbids editing applied migrations — see `.agents/skills/shiori-rust-backend`).
