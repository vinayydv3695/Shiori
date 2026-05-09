# Shiori Business Logic and Functional Specification

This file defines product rules and behavior for Shiori.

---

## 1) Product Scope

Shiori is offline-first desktop software for:
- managing personal libraries (books, manga, comics)
- reading and annotation workflows
- optional online metadata/discovery integrations
- conversion and RSS ingestion pipelines

Cloud account is not required for core workflows.

---

## 2) Core Domain Entities

## 2.1 Library
- Book
- Author
- Tag
- Collection (regular/smart/favorites)
- Manga Series + Volume mappings

## 2.2 Reading
- Reading Progress (page/location/CFI)
- Annotation
- Annotation Category
- Reader Settings
- Reading Session
- Reading Goal

## 2.3 Automation and Integrations
- Conversion Job
- RSS Feed / RSS Article
- Share Link
- Metadata Cache
- Watch Folder
- Source Configs (Anna Archive, RuTracker, torrent network, Prowlarr)

---

## 3) Functional Rules

## 3.1 Import Rules
1. Every imported file is hashed.
2. Duplicate detection uses file hash.
3. Unsupported format is rejected.
4. Domain-specific validation:
   - **Books** accept ebook formats (epub/pdf/mobi/azw3/fb2/txt/docx/html)
   - **Manga/Comics** accept archive formats (cbz/cbr)
5. If import succeeds, book gets domain assignment and metadata extraction attempt.

## 3.2 Reading Status Rules
Allowed status values:
- `planning`
- `reading`
- `completed`
- `on_hold`
- `dropped`

Default is `planning`.
Status updates modify `modified_date`.

## 3.3 Favorites and Collections
- Favorites stored as `is_favorite` on book and represented as built-in collection type.
- Collections support manual and smart-rule behavior.
- Nested collections supported via parent-child relation.

## 3.4 Metadata Rules
- Metadata can come from file, manual edits, or online enrichment.
- Online enrichment is optional and async.
- Cache is used for provider results (query hash + expiry).
- Metadata lock field exists to protect user-managed fields from overwrites.

## 3.5 Annotation Rules
- Annotation types: highlight, note, bookmark.
- Categories optional; defaults exist.
- Annotation content indexed in FTS for global search.
- Export supported as markdown/json/text.

## 3.6 Reading Session Rules
- Session starts when user opens reading context.
- Heartbeats accumulate duration.
- Session ends explicitly and can include page boundaries.
- Daily stats and streaks derive from persisted sessions.

---

## 4) Conversion Specification

## 4.1 Conversion Job Lifecycle
States:
- Queued
- Processing
- Completed
- Failed
- Cancelled

Jobs are persisted and restored on app restart.

## 4.2 Conversion Capability Matrix
From backend engine:
- txt -> epub
- html -> epub/txt
- mobi -> epub/txt
- azw3 -> epub/txt
- docx -> epub/txt
- fb2 -> epub/txt
- pdf -> epub/txt
- epub -> pdf

## 4.3 Conversion Behavior
- Unsupported path rejected before queue execution.
- Progress events emitted to UI.
- Some EPUB targets try Calibre first and fallback to Rust converter.
- Cancel is soft-cancel and respected by worker loop.

---

## 5) RSS Specification

## 5.1 Feed Management
- Feeds can be created/updated/deleted/toggled active.
- Update scheduler checks due feeds periodically.
- Failures tracked with counters.

## 5.2 Daily EPUB
- Scheduler can generate daily EPUB bundle from RSS articles.
- Default schedule configured at 6 AM.
- Manual trigger available.

---

## 6) Share System Specification

## 6.1 Share Creation
Each share has:
- token
- target book
- expiry
- optional password
- optional max accesses

## 6.2 Share Validation
Download allowed only if:
- token exists
- share not revoked
- not expired
- access limit not exceeded
- password correct if required

## 6.3 Security
- Password hashes use Argon2
- Access attempts logged
- Revocation supported

---

## 7) Folder Watch Specification

- User can register watch folders with enabled state.
- Dangerous system directories rejected.
- Debounced file events avoid duplicate import storms.
- New supported files auto-import when detected.

---

## 8) Online Source Specification

Source registry supports provider plugins with metadata describing:
- id/name/version/base URL
- content type (book/manga)
- search/download capabilities
- auth requirement
- NSFW flag

Standard source interface includes:
- search
- chapters
- pages
- optional browse and diagnostics

---

## 9) Preferences and Onboarding Specification

- Singleton preferences record stores theme, reading defaults, manga defaults, TTS defaults, and integration settings.
- Per-book and per-manga overrides are sparse tables.
- Onboarding state tracks completion/version/skipped steps.
- Theme and preferences should be applied early to avoid UI flash.

---

## 10) Non-Functional Requirements

## 10.1 Reliability
- Migrations wrapped in savepoints
- Conversion job persistence
- explicit DB constraints/indexes

## 10.2 Performance
- SQLite WAL + pooled connections
- FTS indexes
- lazy frontend module loading
- background async workers

## 10.3 Security
- command-level validation
- CSP/network allowlist in Tauri config
- safe-path checks for file operations

---

## 11) Out of Scope / Intentional Constraints

- Mandatory cloud sync/account auth
- server-side multi-user management
- web-first deployment mode
- guaranteed availability of third-party providers

---

## 12) Acceptance Checklist

A Shiori build is functionally complete when:
- [ ] Library import, search, edit, delete work end-to-end
- [ ] Reader progress and annotations persist
- [ ] Conversion queue runs and survives restart
- [ ] Preferences + theme persist and apply on startup
- [ ] RSS update + daily EPUB generation work
- [ ] Sharing enforces expiry/password/access rules
- [ ] Core online integrations fail gracefully when unavailable
