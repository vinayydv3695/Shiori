# Database

> God node · 80 connections · `src-tauri/src/db/mod.rs`

**Community:** [Database](Database.md)

## Connections by Relation

### contains
- [mod.rs](mod.rs.md) `EXTRACTED`

### imports_from
- library_service.rs `EXTRACTED`
- conversion_engine.rs `EXTRACTED`
- share_service.rs `EXTRACTED`
- [export_service.rs](export_service.rs.md) `EXTRACTED`
- rss_service.rs `EXTRACTED`
- folder_watch.rs `EXTRACTED`
- [search_service.rs](search_service.rs.md) `EXTRACTED`
- [backup_service.rs](backup_service.rs.md) `EXTRACTED`
- [tag_service.rs](tag_service.rs.md) `EXTRACTED`
- worker.rs `EXTRACTED`

### method
- .get_connection() `EXTRACTED`
- .new() `EXTRACTED`
- .apply_performance_pragmas() `EXTRACTED`
- .initialize_schema() `EXTRACTED`
- .run_migrations() `EXTRACTED`

### references
- [ConversionEngine](ConversionEngine.md) `EXTRACTED`
- [RssService](RssService.md) `EXTRACTED`
- [ShareService](ShareService.md) `EXTRACTED`
- [FolderWatchService](FolderWatchService.md) `EXTRACTED`
- .execute_conversion() `EXTRACTED`
- [MetadataWorker](MetadataWorker.md) `EXTRACTED`
- .worker_loop() `EXTRACTED`
- convert_to_epub() `EXTRACTED`
- export_library() `EXTRACTED`
- .handle_file_event() `EXTRACTED`
- .convert_direct() `EXTRACTED`
- import_manga() `EXTRACTED`
- .new() `EXTRACTED`
- .new() `EXTRACTED`
- add_book() `EXTRACTED`
- import_comics() `EXTRACTED`
- import_single_book() `EXTRACTED`
- convert_to_epub_new() `EXTRACTED`
- AppState `EXTRACTED`
- get_book_by_id() `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*