# Shiori

Offline-first desktop app for managing and reading personal **books, manga, comics, and RSS content**.

Built with **Tauri + Rust + React + TypeScript + SQLite**.

---

## Documentation Map

- [`README.md`](README.md) — product overview, setup, and quick start
- [`architecture.md`](architecture.md) — technical architecture, data flow, and system internals
- [`desgin.md`](desgin.md) — UI/UX design system and interaction patterns
- [`shiori.md`](shiori.md) — business logic and functional specifications

---

## What Shiori Does

- Import local files (EPUB, PDF, MOBI, AZW3, DOCX, FB2, TXT, HTML, CBZ, CBR)
- Organize with metadata, tags, collections, favorites, and manga series
- Read with dedicated reader experiences for books and manga/comics
- Annotate, track reading progress, and measure reading statistics
- Run format conversions with queued background jobs
- Use RSS feeds and generate daily EPUB bundles
- Optionally enrich data from online metadata/search sources

---

## Core Stack

### Desktop + Backend
- Tauri 2
- Rust (Tokio async runtime)
- SQLite (WAL mode, migrations, FTS5)

### Frontend
- React 19 + TypeScript
- Vite
- Zustand (state)
- Tailwind CSS + Radix UI

---

## Quick Start

### Prerequisites
- Node.js 18+
- Rust stable
- Tauri system dependencies (WebKitGTK on Linux)

### Run in development

```bash
npm install
npm run dev
```

### Production build

```bash
npm run build
```

---

## Project Structure (high-level)

```text
src/                  # React frontend (UI, stores, hooks, components)
src-tauri/src/        # Rust backend (commands, services, db, sources)
src-tauri/src/db/     # SQLite init + migrations
src-tauri/src/commands/ # Tauri IPC command handlers
src-tauri/src/services/ # Domain services (library, conversion, rss, share...)
```

---

## Important Notes

- Data is local-first: database and generated assets live in app data directory.
- Online features are optional and provider-dependent.
- Share links support optional password hashing (Argon2), expiry, and access limits.

---

## Development Checks

```bash
npm run lint
npm run build
```

---

## License

MIT — see [`LICENSE`](LICENSE).
