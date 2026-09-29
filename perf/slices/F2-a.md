# Slice F2-a — DB batch ops + series DTO (worker: backend)

**Goal:** kill O(n) autocommit patterns behind the 1000-chapter flows; give the frontend lean series data. Baseline: Q4 loop 18.8ms/200 vs 1.3ms batched (14.5×); Q5 2.8ms vs 0.8ms (3.3×).

## Contract (shared with F1 frontend)
- `update_reading_status_batch(ids: Vec<i64>, status: String) -> Result<usize>` — ONE transaction; emits one `library-updated` `{kind:'book-updated', ids}` event. Validation: status ∈ planning|reading|completed|on_hold|dropped.
- `get_series_books_by_name(series: String) -> Vec<SeriesBookItem>` — lean DTO: `{id, title, series_index, cover_path, reading_status, page_count, last_opened, file_format, file_path, added_date, sort_title}`. WHERE series = ? AND in_trash=0 ORDER BY series_index ASC NULLS LAST, added_date ASC. No authors/tags hydration.
- `get_manga_series_by_title(title: String) -> Option<MangaSeries>` — replaces getMangaSeriesList(1000,0)+find hacks.
- `get_books_by_ids_cmd(ids: Vec<i64>) -> Vec<Book>` — exposes existing batch hydration (replaces N× getBook).
- `get_library_stats`: add `WHERE in_trash = 0` (correctness fix; baseline 0.40ms).

## Changes
- `db/migrations.rs`: append `migrate_to_v52` — `CREATE INDEX IF NOT EXISTS idx_books_manga_series_idx ON books(manga_series_id, series_index)` (kills Q3 temp B-tree). Append `if current_version < 52` line. Never edit applied migrations.
- `commands/library.rs`: the 4 commands above + wrap `import_online_manga_chapters` linkage UPDATE loop in one transaction.
- `commands/mod.rs`: register.
- `models.rs`: `SeriesBookItem` (serde camelCase to match frontend).
- `src/lib/tauri.ts`: wrappers `updateReadingStatusBatch`, `getSeriesBooksByName`, `getMangaSeriesByTitle`, `getBooksByIds`.

## Gates
`cargo check` (or test build) + `cargo test` (db/search tests) + existing vitest. Rollback: migration is additive; commands are new (existing ones untouched except stats WHERE clause + import loop tx).

## Report: files changed + gates, <150 words.
