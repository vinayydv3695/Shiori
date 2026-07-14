# Database

> 52 nodes · cohesion 0.12

## Key Concepts

- **Database** (80 connections) — `src-tauri/src/db/mod.rs`
- **library_service.rs** (55 connections) — `src-tauri/src/services/library_service.rs`
- **Result** (38 connections)
- **Vec** (13 connections)
- **Book** (11 connections)
- **add_book()** (10 connections) — `src-tauri/src/services/library_service.rs`
- **get_book_by_id()** (9 connections) — `src-tauri/src/services/library_service.rs`
- **attach_authors_and_tags()** (8 connections) — `src-tauri/src/services/library_service.rs`
- **setup_test_db()** (8 connections) — `src-tauri/src/services/library_service.rs`
- **get_or_create_author_tx()** (7 connections) — `src-tauri/src/services/library_service.rs`
- **test_delete_and_restore_book()** (7 connections) — `src-tauri/src/services/library_service.rs`
- **create_test_book()** (6 connections) — `src-tauri/src/services/library_service.rs`
- **get_all_books()** (6 connections) — `src-tauri/src/services/library_service.rs`
- **get_authors_for_book()** (6 connections) — `src-tauri/src/services/library_service.rs`
- **get_books_by_domain()** (6 connections) — `src-tauri/src/services/library_service.rs`
- **get_books_by_ids()** (6 connections) — `src-tauri/src/services/library_service.rs`
- **get_books_by_reading_status()** (6 connections) — `src-tauri/src/services/library_service.rs`
- **get_tags_for_book()** (6 connections) — `src-tauri/src/services/library_service.rs`
- **get_thumbnail_path()** (6 connections) — `src-tauri/src/services/library_service.rs`
- **test_update_book()** (6 connections) — `src-tauri/src/services/library_service.rs`
- **update_book()** (6 connections) — `src-tauri/src/services/library_service.rs`
- **get_book_summaries()** (5 connections) — `src-tauri/src/services/library_service.rs`
- **get_book_summaries_by_domain()** (5 connections) — `src-tauri/src/services/library_service.rs`
- **get_recommended_books()** (5 connections) — `src-tauri/src/services/library_service.rs`
- **test_add_and_get_book()** (5 connections) — `src-tauri/src/services/library_service.rs`
- *... and 27 more nodes in this community*

## Relationships

- [file.rs](file.rs.md) (34 shared connections)
- [.get_connection](get_connection.md) (9 shared connections)
- [FolderWatchService](FolderWatchService.md) (6 shared connections)
- [tag_service.rs](tag_service.rs.md) (5 shared connections)
- [backup_service.rs](backup_service.rs.md) (4 shared connections)
- [ConversionEngine](ConversionEngine.md) (4 shared connections)
- [MetadataWorker](MetadataWorker.md) (4 shared connections)
- [ShareService](ShareService.md) (4 shared connections)
- [calibre_service.rs](calibre_service.rs.md) (3 shared connections)
- [RssService](RssService.md) (3 shared connections)
- [search_service.rs](search_service.rs.md) (3 shared connections)
- [.execute_conversion](execute_conversion.md) (2 shared connections)

## Source Files

- `src-tauri/src/db/mod.rs`
- `src-tauri/src/services/library_service.rs`

## Audit Trail

- EXTRACTED: 408 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*