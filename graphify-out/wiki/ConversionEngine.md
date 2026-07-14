# ConversionEngine

> 34 nodes · cohesion 0.12

## Key Concepts

- **ConversionEngine** (51 connections) — `src-tauri/src/services/conversion_engine.rs`
- **conversion_engine.rs** (18 connections) — `src-tauri/src/services/conversion_engine.rs`
- **.worker_loop()** (15 connections) — `src-tauri/src/services/conversion_engine.rs`
- **ConversionJob** (12 connections) — `src-tauri/src/services/conversion_engine.rs`
- **.submit_conversion()** (9 connections) — `src-tauri/src/services/conversion_engine.rs`
- **Option** (9 connections)
- **String** (7 connections)
- **.detect_pdf_chapters()** (6 connections) — `src-tauri/src/services/conversion_engine.rs`
- **.persist_job()** (5 connections) — `src-tauri/src/services/conversion_engine.rs`
- **Arc** (5 connections)
- **.emit_progress()** (4 connections) — `src-tauri/src/services/conversion_engine.rs`
- **.ensure_workers()** (4 connections) — `src-tauri/src/services/conversion_engine.rs`
- **.epub_policy_for_source()** (4 connections) — `src-tauri/src/services/conversion_engine.rs`
- **.restore_from_db()** (4 connections) — `src-tauri/src/services/conversion_engine.rs`
- **.rust_source_format_for_epub()** (4 connections) — `src-tauri/src/services/conversion_engine.rs`
- **DashMap** (3 connections)
- **DashSet** (3 connections)
- **.cancel_job()** (3 connections) — `src-tauri/src/services/conversion_engine.rs`
- **.get_all_jobs()** (3 connections) — `src-tauri/src/services/conversion_engine.rs`
- **.get_job_status()** (3 connections) — `src-tauri/src/services/conversion_engine.rs`
- **AppHandle** (3 connections)
- **Mutex** (3 connections)
- **Queue** (2 connections)
- **can_convert()** (2 connections) — `src-tauri/src/services/conversion_engine.rs`
- **.set_database()** (2 connections) — `src-tauri/src/services/conversion_engine.rs`
- *... and 9 more nodes in this community*

## Relationships

- [.execute_conversion](execute_conversion.md) (39 shared connections)
- [conversion.rs](conversion.rs.md) (5 shared connections)
- [Database](Database.md) (4 shared connections)
- [calibre_service.rs](calibre_service.rs.md) (3 shared connections)
- [ConversionStatus](ConversionStatus.md) (2 shared connections)
- [Duration](Duration.md) (1 shared connections)
- [format_adapter.rs](format_adapter.rs.md) (1 shared connections)
- [file.rs](file.rs.md) (1 shared connections)
- [CoverGenerator](CoverGenerator.md) (1 shared connections)
- [convert_to_epub](convert_to_epub.md) (1 shared connections)

## Source Files

- `src-tauri/src/services/conversion_engine.rs`

## Audit Trail

- EXTRACTED: 196 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*