# Shiori Security Audit Report

**Date:** 2026-08-11
**Scope:** Full codebase — Rust backend (src-tauri/src), SQLite schema/migrations/queries, React frontend (src), Tauri capabilities/CSP, updater, Android packaging.
**Method:** 6 parallel read-only audit agents (DeepSeek V4 Flash), each bounded to one slice, evidence-based findings only (file:line + verbatim quote). All CRITICAL/HIGH findings re-verified by the orchestrator against the actual source.
**Baseline:** commit `1ab6f12` (v2.3.14), working tree clean.

## Executive summary

| Severity | Count |
|---|---|
| CRITICAL | 2 |
| HIGH | 12 |
| MEDIUM | 14 |
| LOW | 9 |
| INFO | 4 |
| **Total** | **41** |

**The one-sentence story:** a single remote XSS (AniList descriptions, shipped unsanitized) chains with `'unsafe-inline'` CSP + `$HOME/**` asset scope + unvalidated IPC write commands into full host compromise; independently, backup restore and several download/conversion paths are arbitrary-file-write primitives, and multiple fetchers are SSRF-capable.

**Primary attack chain (CRITICAL):**
AniList description HTML (`dangerouslySetInnerHTML`, no sanitizer) → inline script runs (`script-src 'unsafe-inline'`) → `window.__TAURI__` IPC → `write_text_to_file` (arbitrary file write incl. `~/.ssh/authorized_keys`) / `proxy_manga_image` (SSRF read of `169.254.169.254`, LAN services) / asset protocol (`$HOME/**` read). Remote-only, no user interaction beyond opening a manga detail dialog.

---

## CRITICAL

### S-01 · XSS: unsanitized remote HTML via `dangerouslySetInnerHTML` (AniList descriptions)
- **Locations:** `src/components/online/AniListMangaDetailsDialog.tsx:212`, `src/components/online/AniListMangaDetailsView.tsx:582`
- **Evidence:** `dangerouslySetInnerHTML={{ __html: manga.description }}` — description is user-generated HTML from `graphql.anilist.co` (untrusted).
- **Why it matters:** `<img src=x onerror=...>` executes with full app origin. No DOMPurify import in either file. Twin component `OnlineMangaDetailView.tsx:377` sanitizes the same field — a sanitizer-exists-but-isn't-used inconsistency. With `script-src 'unsafe-inline'` (see S-07) this is script execution → complete chain below.
- **Fix:** `DOMPurify.sanitize(...)` (reuse `sanitizeBookContent`) before injection.

### S-02 · Arbitrary file write via unvalidated IPC command
- **Location:** `src-tauri/src/commands/export.rs:39-48` (`write_text_to_file`), `export.rs:17-30` (`export_library` writes to frontend-supplied `file_path`)
- **Evidence:** `std::fs::write(&path, contents)` with `create_dir_all(parent)` — zero validation of path.
- **Why it matters:** with S-01's XSS, overwrites `~/.bashrc`, `~/.ssh/authorized_keys`, any user-writable file; creates parent dirs anywhere.
- **Fix:** confine writes to picker-returned paths / app-owned export dir; reject absolute paths and `..`.

---

## HIGH

### S-03 · SSRF cluster: unvalidated URL fetchers returning bytes to the frontend
- **Locations:** `src-tauri/src/commands/sources.rs:248` (`proxy_manga_image` — no guard), `src-tauri/src/cloudflare/commands.rs:176-183` (`cf_proxy_image` — no guard), `src-tauri/src/commands/metadata.rs:144-165` (`preview_cover_url` — only `require_non_empty`), `src-tauri/src/commands/discord.rs:73-93` (unguarded HEAD)
- **Evidence:** `HTTP_CLIENT.get(&image_url)...` returns `Vec<u8>` to the frontend; `preview_cover_url` is auto-invoked with remote-controlled `coverUrl` from AniList/MangaDex metadata (`MetadataSearchDialog.tsx:524`).
- **Why it matters:** SSRF read of `http://169.254.169.254/` (cloud metadata), LAN services, internal hosts — response bytes returned to caller. Note the inconsistency: `download_manga_chapter_as_cbz` (sources.rs:515) applies the guard, these don't.
- **Fix:** route all through a hardened `is_safe_url` (see S-04) + reject non-image content types + response size caps (only `preview_cover_url` has one, 5MB).

### S-04 · `is_safe_url` SSRF guard is bypassable
- **Location:** `src-tauri/src/lib.rs:718-764` (guard), `lib.rs:215` (redirected fetch)
- **Evidence:** blocked literals are `["localhost","127.0.0.1","[::1]","0.0.0.0"]` + `10./192.168./172.16-31.` prefixes; `if !host.contains('.') { return false; }`.
- **Bypasses (verified):** `https://169.254.169.254/` (link-local NOT blocked), `https://127.0.0.2/`, `https://[::ffff:127.0.0.1]/` (IPv4-mapped, contains dots), `https://127.1/`; DNS rebinding (hostname never re-resolved); reqwest follows up to 10 redirects with no re-validation of the final URL.
- **Fix:** parse IP literals incl. IPv4-mapped IPv6, block 127.0.0.0/8 + 169.254.0.0/16 + 100.64.0.0/10, resolve-then-connect, re-validate every redirect hop.

### S-05 · Asset protocol serves `$HOME` + `fs:read-all`/`fs:write-all` capabilities
- **Locations:** `src-tauri/tauri.conf.json:82-89` (`"assetProtocol": {"scope": ["$APPLOCALDATA/**","$APPDATA/**","$HOME/**","/tmp/**","$TEMP/**"]}`), `src-tauri/capabilities/default.json:27,36`
- **Why it matters:** any injected script reads every file under `$HOME` (incl. `.ssh/*`) via `http://asset.localhost/` + `convertFileSrc`, and writes via fs capabilities.
- **Fix:** scope to `$APPLOCALDATA/**` only; narrow fs permissions to app data/library dirs.

### S-06 · Backup restore: zip-slip + attacker-controlled DB paths = arbitrary file write on one click
- **Locations:** `src-tauri/src/services/backup_service.rs:1021-1030` (covers), `:1043-1047` (books), `:1286` (sessions), `:1203-1219` (restored-DB `file_path`/`managed_relpath` trusted)
- **Evidence:** `covers_dir.join(relative_path)` after `strip_prefix("covers/")` — no `enclosed_name()` check; restored library JSON's `file_path` used as `PathBuf::from(...)` → `File::create` before extraction is validated.
- **Why it matters:** crafted backup (a single file the user opens) writes anywhere: `covers/../../.bashrc`, absolute paths, `managed_relpath` with `../`. Classic zip-slip, same class as the torbox fix that IS applied elsewhere.
- **Fix:** `enclosed_name()` + canonicalize + `starts_with` root check; validate restored `file_path` against library root.

### S-07 · CSP `'unsafe-inline'` + scraper domains in connect-src
- **Location:** `src-tauri/tauri.conf.json:81`
- **Evidence:** `script-src 'self' 'unsafe-inline'`; `connect-src ... https://freeonlinek.top https://weebrook.com https://mangafire.to`
- **Why it matters:** nullifies the primary defense against S-01 (inline handlers run); ad-laden scraper domains are whitelisted for `fetch` — a ready exfiltration channel.
- **Fix:** drop `'unsafe-inline'` (nonces/hashes), fetch scraper domains only via Rust, add CSP meta tag to `index.html` (dev builds currently have zero CSP; vite binds `0.0.0.0`, see S-21).

### S-08 · Decompression bombs: FB2 gzip, MOBI HUFF allocation bomb, unbounded entry reads
- **Locations:** `src-tauri/src/conversion/fb2.rs:19,494,511`; `src-tauri/src/services/mobi_huff.rs:169-171,242-250`; `src-tauri/src/services/metadata_service.rs:501`; `src-tauri/src/conversion/formats/cbz.rs:240`
- **Evidence:** `decoder.read_to_end(&mut result)`; `Vec::with_capacity(1 << bits)` with file-controlled `bits`/`num_phrases`; unbounded recursion at mobi_huff.rs:242-243; `read_to_end` on single zip entries (10MB zeros → 10GB RAM).
- **Why it matters:** a few KB malicious file → multi-GB allocation or stack overflow → app OOM-crash during import/conversion (DoS, Android too).
- **Fix:** cap decompressed size everywhere (`take(MAX)`), bound phrase count/depth, validate `entry.size()` before reading.

### S-09 · Torrent-controlled filename → path traversal write
- **Location:** `src-tauri/src/commands/torbox.rs:179-206`
- **Evidence:** `let dest_path = downloads_dir.join(&filename);` where filename comes from the torrent's `source_name` (attacker-controlled) or frontend `filename_hint`.
- **Why it matters:** torrent file named `../../.bashrc` writes downloaded bytes anywhere.
- **Fix:** sanitize (reject `/`, `\`, `..`) before joining.

### S-10 · CF session cookies exfiltrated via arbitrary proxy URL
- **Location:** `src-tauri/src/cloudflare/commands.rs:193`, `client.rs:262`
- **Evidence:** `.header(header::COOKIE, session.cookie_header())` injected into `get_image(&image_url)` for ANY URL (no host check).
- **Why it matters:** XSS or malicious cover URL → stored `cf_clearance`/session cookies sent to attacker host; also SSRF.
- **Fix:** reject URLs whose host isn't the source host (or subdomain of `source_base_url`).

### S-11 · Unvalidated URL → arbitrary binary download + install (Android APK)
- **Location:** `src-tauri/src/commands/window.rs:57-92` (`download_apk`)
- **Evidence:** `reqwest::get(&url)` → `File::create(&apk_path)`; frontend trusts `api.github.com` release JSON and installs whatever `browser_download_url` points to (`UpdateDialog.tsx:127`, `useAutoUpdate.ts:57-62`) with no checksum/signature verification.
- **Why it matters:** compromised release, MITM, or XSS → arbitrary APK installed on Android.
- **Fix:** validate URL host (`github.com/.../releases/download/...`) + verify pinned SHA-256 before `install()`.

### S-12 · Calibre conversion: `output_format` path traversal write
- **Location:** `src-tauri/src/commands/conversion.rs:151`
- **Evidence:** `let output = input.with_file_name(format!("{}.{}", stem, output_format));` — format unvalidated beyond non-empty; `x/../../evil` escapes the input dir; with `replace_original` the original is deleted.
- **Fix:** restrict to `[A-Za-z0-9]+`.

### S-13 · ToonGod webview SSRF + scraper fetches bypass `is_safe_url`
- **Locations:** `src-tauri/src/sources/toongod.rs:219,328-330` (hidden webview navigates any URL, DOM exfiltrated); `src-tauri/src/sources/weebrook.rs:485-497`, `toongod.rs:593-600` (chapter URLs parsed from remote HTML fetched without guard); also `toongod.rs:219` `url.parse().unwrap()` panics on malformed input.
- **Why it matters:** URLs derived from scraped (attacker-influenceable) HTML are fetched/navigated with no scheme/host validation — blind-to-full SSRF; the guard exists only at image fetch paths.
- **Fix:** apply `is_safe_url` to every URL fetched from remote-derived strings; handle parse errors instead of unwrap.

### S-14 · AniList OAuth client secrets committed in source
- **Location:** `src-tauri/src/commands/anilist.rs:6-11`; also `.env:3,6` (gitignored, not in bundle — but the consts above ARE in the binary)
- **Evidence:** `const DESKTOP_ANILIST_CLIENT_SECRET: &str = "vXYsl7taXO0YSgpjLRp0xTWLWoHbbEsWMsbf3lLD";` + `ANDROID_ANILIST_CLIENT_SECRET = "eb4zstd1FYg89DbVdJ4kp0inyq76Zp46oPH5UM4d"`
- **Why it matters:** extractable from the shipped binary; anyone impersonates the app in AniList OAuth, abuses quota/token grants.
- **Fix:** rotate both; migrate to PKCE (public client) so no secret ships.

---

## MEDIUM

### S-15 · Secrets at rest in plaintext
- **Locations:** `src-tauri/src/db/migrations.rs:2030` (v37 `anilist_token`), `preferences.rs:510` (`prowlarr_api_key` v24), `src-tauri/src/services/torbox.rs:365-370` (JSON store), `sync_service.rs:69` (`sync_pairing_token`), `cloudflare/session.rs:195-201` (cookie files)
- **Why it matters:** OAuth/API secrets readable by any process with app-data access, included in backups (backup_service.rs:713-715 redacts them only on export — the DB itself holds them). Android: shipped to adb/Drive backups (see S-17).
- **Fix:** OS keyring / Android Keystore.

### S-16 · Android release build allows cleartext HTTP
- **Location:** `src-tauri/gen/android/app/build.gradle.kts:37-40`
- **Evidence:** release `manifestPlaceholders["usesCleartextTraffic"] = "true"`.
- **Fix:** false in release; per-domain networkSecurityConfig if needed.

### S-17 · `android:allowBackup` not disabled — DB with tokens backed up
- **Location:** `src-tauri/gen/android/app/src/main/AndroidManifest.xml:36-70`
- **Fix:** `android:allowBackup="false"` or `fullBackupContent` excluding credential files.

### S-18 · Migration v29 silently destroys six v8 preference columns (data loss)
- **Location:** `src-tauri/src/db/migrations.rs` (v8 `columns_to_add` vs v29 rebuild)
- **Evidence:** v8 adds `page_flip_enabled`, `paper_theme_*`, `doodle_enabled`, `adaptive_mode`; v29's `CREATE TABLE ... user_preferences_v29` column list omits all of them.
- **Fix:** include v8 columns in v29 schema + INSERT/SELECT lists.

### S-19 · Migration v22 rebuilds user_preferences via CTAS — loses PK and all CHECK constraints
- **Location:** `src-tauri/src/db/migrations.rs` (`migrate_to_v22`)
- **Evidence:** `CREATE TABLE user_preferences_new AS SELECT * FROM user_preferences; DROP ...; RENAME ...` — no PK, no `CHECK (id = 1)`, no font-size range checks; duplicate singleton rows + invalid values become possible.
- **Fix:** explicit schema rebuild as v29 does.

### S-20 · Sync pairing token: arbitrary-host POST + plaintext localStorage
- **Locations:** `src-tauri/src/commands/sync.rs:42-53` (frontend-controlled `ip` → token POSTed anywhere), `src/components/companion/CompanionDiscovery.tsx:53-55` + `src/App.tsx:174-176` (`localStorage.setItem('sync_host_token', token)`; token grants full library sync access)
- **Why it matters:** XSS exfiltrates the token; a crafted backup (S-24) plants `sync_host_token` for a rogue host.
- **Fix:** restrict to RFC1918/link-local; bind token to server nonce; persist via `set_secure_token` like the Android AniList path.

### S-21 · Dev server binds all interfaces, no CSP in dev
- **Location:** `vite.config.ts:41-42` (`host: host || true`), `index.html` (no CSP meta)
- **Why it matters:** hostile LAN device can load the app (dev IPC, zero CSP).
- **Fix:** bind 127.0.0.1 unless `TAURI_DEV_HOST` set; mirror CSP in index.html.

### S-22 · RSS article links navigate the app WebView (no external-link interception)
- **Location:** `src/components/rss/RSSArticleReader.tsx:117`
- **Evidence:** sanitized HTML allows `a[href]`, no click handler — every other renderer (`PremiumEpubReader.tsx:1223`, `GenericHtmlReader.tsx:530`, `ContinuousEpubView.tsx:387`, `PdfReader.tsx:971`) intercepts via `handleExternalLinkClick`.
- **Why it matters:** feed content (attacker-controllable) → full app-origin navigation to phishing page; total WebView hijack on Android.
- **Fix:** attach the same click interception.

### S-23 · `embed_local_image` reads arbitrary local files into converted EPUB
- **Location:** `src-tauri/src/conversion/formats/common.rs:168-176`
- **Evidence:** `<img src="/home/user/.ssh/id_rsa">` or `../../etc/shadow` in source HTML → `std::fs::read(&resolved)` embeds any readable file into the output book.
- **Fix:** resolve + canonicalize, require result under source dir.

### S-24 · Backup restore writes arbitrary localStorage keys
- **Location:** `src/components/settings/SettingsDialog.tsx:1532-1536`
- **Evidence:** `JSON.parse(settingsJson)` → `localStorage.setItem(key, value)` for every key, no allowlist → can plant `sync_host_token` (S-20).
- **Fix:** key whitelist.

### S-25 · `update_book` skips path validation (inconsistency with `add_book`)
- **Location:** `src-tauri/src/commands/library.rs:255-262` vs `247-249` — `add_book` calls `require_safe_path`, `update_book` validates only `title`; poisoned `file_path` is then trusted by `get_book_file_path`/`get_thumbnail`/`delete_*`.
- **Fix:** validate `file_path` in `update_book` too.

### S-26 · Migration command: destructive move/delete to arbitrary target
- **Location:** `src-tauri/src/commands/migration.rs:27-37` — frontend-supplied `target` dir; `fs::copy` + `fs::remove_file` per book; can move/delete library files into arbitrary dirs (overwriting same-named files).
- **Fix:** restrict to app-owned dirs; validate before deleting.

### S-27 · No size limits on conversion inputs (whole-file buffering)
- **Locations:** `src-tauri/src/conversion/fb2.rs:19`, `formats/mobi.rs:33`, `pdf.rs:199-208`; plus inconsistent detection: `format_detector.rs:27` caps 500MB for the reader path, `format_detection.rs` (used by `conversion_engine.rs:29`) has no cap — same formats pass different validation per entry point.
- **Fix:** shared detection+limits module.

### S-28 · Global store handle exports AniList token to `window`
- **Location:** `src/store/preferencesStore.ts:467` — `(window as any).__PREFERENCES_STORE__ = usePreferencesStore;` — store holds `preferences.anilistToken`; any injected script reads the live Bearer token.
- **Fix:** drop or gate behind `import.meta.env.DEV`.

### S-29 · Migration v5 leaves pre-v5 conversion jobs stranded (status casing)
- **Location:** `src-tauri/src/db/migrations.rs` (v3 `'queued'` vs v5 `'Queued'`), `conversion_engine.rs:309` — `WHERE status IN ('Queued','Processing')` never matches copied lowercase values; jobs never resume after upgrade.
- **Fix:** normalize `initcap(status)` in the v5 migration.

### S-30 · Torbox/AniList token handling — see S-15 (kept separate for Android scope)
*(merged into S-15; no additional surface)*

### S-31 · Conversion temp dirs in `/tmp` with default (world-readable) permissions
- **Location:** `src-tauri/src/conversion/mod.rs:104-108` — `std::env::temp_dir().join("shiori_converted_<uuid>")`, umask-default 0644/0755, may hold sensitive annotations/embeds.
- **Fix:** `tempfile::TempDir` (0700).

### S-32 · CBR extraction trusts external `unrar` entry paths
- **Location:** `src-tauri/src/conversion/formats/cbr.rs:71-73` — `unrar x -y -inul` into private tempdir; no in-app verification of extracted paths (host-version-dependent hardening).
- **Fix:** verify each extracted path stays under the tempdir.

---

## LOW

- **S-33 · LIKE wildcard injection in smart-shelf rules** — `src-tauri/src/services/shelf_service.rs:332-358,405`: `%`/`_` unescaped; a rule value of `%` matches every book (values are bound, so no SQLi, but wrong results). Fix: `ESCAPE '\'`.
- **S-34 · Frontend-supplied SQL LIMIT interpolated raw** — `rss_service.rs:443-452`, `search_service.rs:255-266`: negative limit = "no limit" in SQLite → unbounded result sets. Fix: clamp + bind.
- **S-35 · Trashed books still appear in shelves/shelf counts** — `shelf_service.rs:208-217,445-456` lack `in_trash = 0` that every other listing applies; same entity, different WHERE per query path.
- **S-36 · Shelf queries return stale defaults for new book fields** — `shelf_service.rs:250-270` hardcodes `metadata_locked: None, is_managed: false, origin: None`; books look "unlocked/unmanaged" via shelves. Fix: shared BOOK_COLUMNS list.
- **S-37 · Poised-mutex `unwrap()` on user-reachable path** — `library.rs:103` (`state.opened_urls.lock().unwrap()`); prior panic while holding the lock → app crash.
- **S-38 · `start_background_scan` accepts arbitrary paths** — `library.rs:37-68` lacks `require_safe_path` that `scan_folder_unified` (466) applies — ad-hoc validation.
- **S-39 · Absolute paths/technical details serialized to frontend** — `error.rs:118-135`, `reader.rs:447`; path leakage into UI/logs (low as same-origin).
- **S-40 · Search-term HTML injection in reader** — `PremiumEpubReader.tsx:172`: matched substring inserted via `innerHTML` unescaped (`<mark class="search-highlight">$1</mark>`); a book containing literal HTML + matching search parses it as markup. Self-XSS.
- **S-41 · Raw backend errors surfaced in UI** — `AniListDesktopProvider.ts:14`, `rssStore.ts:56,60,83,101`: `String(error)` bypasses the existing `parseError()` helper; may leak paths/IPC details.
- **S-42 · Image proxy has no response size cap** — `lib.rs:226` (`response.bytes()`) vs 5MB cap in `preview_cover_url`; memory exhaustion via huge source response.
- **S-43 · `url.parse().unwrap()` panics on malformed chapter URL** — `toongod.rs:219` (crash instead of error).

## INFO

- **S-44 · AniList token paste heuristic saves only >50-char values** — `IntegrationsStep.tsx:226`: truncated/partial tokens silently dropped, field cleared, no format validation. Fix: validate JWT shape, save on blur.
- **S-45 · `processEpubHtml` inlines raw EPUB CSS into `<style>`** — `PremiumEpubReader.tsx:84-85`: currently sanitized afterwards, but `style-src 'unsafe-inline'` makes any future bypass a CSS-exfiltration channel (`background-image: url(...)`). Fix: strip `url()`/`@import`.
- **S-46 · Dead columns in `books`** — `duration REAL DEFAULT 0` never written/read; `primary_format` written by v2 only. Schema cruft misleading future migrations.
- **S-47 · `discord_resolve_image` unguarded HEAD** — `discord.rs:73-93`: arbitrary-URL probe, returns resolved internal URLs.

---

## Cross-cutting root causes

1. **Validation is applied ad hoc.** `is_safe_url`, `require_safe_path`, size caps, and sanitizers exist — but each is applied to some paths and skipped at sibling ones (proxy vs CBZ download, add_book vs update_book, reader vs conversion detection, AniList dialogs vs OnlineMangaDetailView, RSS reader vs all other renderers). Fixing the guard gaps (S-03/S-04, S-13, S-25, S-27, S-01/S-22) removes most of the list.
2. **One XSS defeats the perimeter.** The webview holds IPC (arbitrary file write, SSRF read, asset read of `$HOME`). CSP `'unsafe-inline'` + remote HTML rendering makes the "local frontend is trusted" assumption false. This is the highest-leverage fix area (S-01, S-05, S-07, S-28).
3. **File-format parsing trusts size and structure.** No decompression caps, no entry-name validation on restore, file-controlled allocation sizes (S-06, S-08, S-09, S-23, S-27).
4. **Secrets shipped and stored plainly** (S-14, S-15, S-16, S-17).
5. **Migrations with silent data loss** (S-18, S-19, S-29).

## Checked & clean (coverage note)

- **SQL injection:** all filters/search/inserts use bound params; FTS5 MATCH terms quoted + `"` doubled; ORDER BY whitelisted; backup table/column names hardcoded + `quote_col`-escaped. (slice B)
- **XXE:** all XML parsing uses quick-xml without DTD/entity resolution. (slice C)
- **Symlinks:** `remove_managed_book_file` canonicalizes; folder scans use `follow_links(false)`. (slice C)
- **Updater:** https-only GitHub endpoint, minisign `pubkey` set, no insecure-transport flag, updater capability desktop-only. (slice D)
- **TLS:** reqwest rustls + webpki roots, zero `danger_accept_invalid_certs`; all scraper endpoints https; reqwest rejects non-http(s) schemes incl. `file://` redirects. (slice D)
- **Android components:** only MainActivity exported (launcher + `shiori://auth` deep link); FileProvider non-exported; no exported services/providers. (slice D)
- **Frontend:** all `target="_blank"` links carry `rel="noopener noreferrer"`; `openExternal` scoped by capability allowlists (https/http/magnet/mailto/ms-settings/intent); zero iframes/webviews in frontend; readers/RSS sanitize via DOMPurify/`sanitizeBookContent`; no eval/`new Function`/`document.write`; dynamic imports are bundled modules only; zustand persisted state contains no tokens; torbox key never touches localStorage. (slices E, F)
- **Backup create path:** `.part` + rename with PartFileGuard; credentials redacted from exports unless requested. (slice C)
- **CBZ parsing:** streamed via `by_name`, no extraction-to-disk zip slip. (slice C)
- **Share tokens:** OsRng-generated; `password_hash` stored hashed. (slice B)

## Suggested review order

1. S-01 + S-07 + S-05 (the XSS chain) — highest leverage, small diffs (sanitizer reuse, CSP, scope)
2. S-06 (backup zip-slip) — one-click arbitrary write
3. S-03/S-04/S-13 (SSRF family) — one shared hardened guard
4. S-08/S-27 (bombs/size caps)
5. S-14/S-15 (secrets)
6. Migrations S-18/S-19/S-29 (data integrity)
7. Android S-11/S-16/S-17/S-20
8. Long tail (LOW/INFO)
