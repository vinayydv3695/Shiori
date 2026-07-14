# CoverGenerator

> 65 nodes · cohesion 0.09

## Key Concepts

- **CoverGenerator** (24 connections) — `src-tauri/src/services/cover_service.rs`
- **CoverService** (19 connections) — `src-tauri/src/services/cover_service.rs`
- **cover_service.rs** (14 connections) — `src-tauri/src/services/cover_service.rs`
- **.create_geometric_cover()** (12 connections) — `src-tauri/src/services/cover_service.rs`
- **cover.rs** (11 connections) — `src-tauri/src/commands/cover.rs`
- **ColorScheme** (11 connections) — `src-tauri/src/services/cover_service.rs`
- **.draw_pattern()** (10 connections) — `src-tauri/src/services/cover_service.rs`
- **.wrap_text()** (10 connections) — `src-tauri/src/services/cover_service.rs`
- **Uuid** (10 connections)
- **get_book_cover_bytes()** (9 connections) — `src-tauri/src/commands/cover.rs`
- **.get_or_generate_cover()** (9 connections) — `src-tauri/src/services/cover_service.rs`
- **RgbaImage** (8 connections)
- **generate_cover()** (8 connections) — `src-tauri/src/commands/cover.rs`
- **get_book_cover()** (8 connections) — `src-tauri/src/commands/cover.rs`
- **get_cover_path_by_id()** (8 connections) — `src-tauri/src/commands/cover.rs`
- **State** (8 connections)
- **.generate_color_scheme()** (8 connections) — `src-tauri/src/services/cover_service.rs`
- **.new()** (8 connections) — `src-tauri/src/services/cover_service.rs`
- **Rgba** (7 connections)
- **get_cover_by_id()** (7 connections) — `src-tauri/src/commands/cover.rs`
- **get_cover_paths_batch()** (7 connections) — `src-tauri/src/commands/cover.rs`
- **Arc** (7 connections)
- **Result** (7 connections)
- **.draw_author()** (7 connections) — `src-tauri/src/services/cover_service.rs`
- **.draw_title()** (7 connections) — `src-tauri/src/services/cover_service.rs`
- *... and 40 more nodes in this community*

## Relationships

- [format_adapter.rs](format_adapter.rs.md) (4 shared connections)
- [OebBook](OebBook.md) (1 shared connections)
- [ConversionEngine](ConversionEngine.md) (1 shared connections)
- [EpubBuilder](EpubBuilder.md) (1 shared connections)
- [Database](Database.md) (1 shared connections)

## Source Files

- `src-tauri/src/commands/cover.rs`
- `src-tauri/src/services/cover_service.rs`

## Audit Trail

- EXTRACTED: 384 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*