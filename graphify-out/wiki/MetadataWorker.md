# MetadataWorker

> 21 nodes · cohesion 0.17

## Key Concepts

- **MetadataWorker** (17 connections) — `src-tauri/src/services/online/worker.rs`
- **MetadataJob** (7 connections) — `src-tauri/src/services/online/worker.rs`
- **.new()** (7 connections) — `src-tauri/src/services/online/worker.rs`
- **.apply_metadata()** (6 connections) — `src-tauri/src/services/online/worker.rs`
- **.start()** (6 connections) — `src-tauri/src/services/online/worker.rs`
- **worker.rs** (5 connections) — `src-tauri/src/services/online/worker.rs`
- **.compute_query_hash()** (5 connections) — `src-tauri/src/services/online/worker.rs`
- **.get_or_create_author()** (4 connections) — `src-tauri/src/services/online/worker.rs`
- **.get_or_create_tag()** (4 connections) — `src-tauri/src/services/online/worker.rs`
- **.add_provider()** (3 connections) — `src-tauri/src/services/online/worker.rs`
- **Arc** (3 connections)
- **Receiver** (2 connections)
- **.set_app_handle()** (2 connections) — `src-tauri/src/services/online/worker.rs`
- **AppHandle** (2 connections)
- **Connection** (2 connections)
- **Result** (2 connections)
- **Option** (1 connections)
- **Self** (1 connections)
- **Sender** (1 connections)
- **String** (1 connections)
- **Vec** (1 connections)

## Relationships

- [Database](Database.md) (4 shared connections)
- [OpenLibraryProvider](OpenLibraryProvider.md) (4 shared connections)
- [FetchedMetadata](FetchedMetadata.md) (3 shared connections)
- [DiscordService](DiscordService.md) (1 shared connections)

## Source Files

- `src-tauri/src/services/online/worker.rs`

## Audit Trail

- EXTRACTED: 82 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*