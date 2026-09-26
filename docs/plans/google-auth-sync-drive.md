# PLAN — Google OAuth + Cross-Device Sync + Google Drive Import

Status: Phase 0 (plan) · Scope: auth, sync, Drive import only. No payment/entitlement.
Recon evidence: 3 read-only scouts (auth/deep-links, data model/sync, import pipeline).

## 1. Architecture decisions (and deviations flagged)

1. **Supabase lives in the frontend (`@supabase/supabase-js`)** — auth (PKCE), PostgREST, and Realtime all run in the webview. Rust owns only: secure session storage, the browser capture, and file downloads. Reason: re-implementing GoTrue refresh + PostgREST + a Realtime WebSocket client in Rust is weeks of work; the webview already has WebSocket and CSP already allows `wss:`.
2. **Desktop auth = hidden webview popup with an intercepted redirect** (reuse the proven AniList pattern: `WebviewWindowBuilder::External(auth_url)` + `on_navigation` intercept, `commands/anilist.rs:97-141`), callback URL `https://shiori.local/auth-callback`.
   **Deviation from the task:** no `tauri-plugin-deep-link`/loopback on desktop — the webview-intercept needs no OS scheme registration (Linux `xdg-mime` + bundled desktop file otherwise), and it is the pattern already shipped for AniList. Flagged.
3. **Android auth = extend `tauri-plugin-android-auth`** with a second intent-filter (`shiori://auth-callback`) and a generic encrypted KV (EncryptedSharedPreferences, already used for the AniList token). The PKCE verifier and the Supabase session are stored there because `secret_store.rs` is a **no-op on Android** (returns `Ok(false)`; confirmed by audit).
4. **Session storage**: desktop → `secret_store` (`supabase.session`); Android → plugin encrypted KV. supabase-js runs with `persistSession:false`; we inject the stored session at startup and re-persist on every `onAuthStateChange`/refresh.
5. **Drive Picker runs in a dedicated hidden `WebviewWindow`** (pattern: `sources/browser_rpc.rs:330-336`), not a popup — Google's `window.open` popups are unreliable in WebKitGTK. Needs a new capability/window entry (current capabilities restrict windows to `main`).
6. **Import reuses the pipeline**: downloaded Drive file → temp → `ingest_opened_file(..., cleanup_source: true)` (`services/ingest_service.rs:282`; copies into managed root, handles SAF push on Android) or `library_service::import_books` (`:1085`) for the Gutenberg-style path.

## 2. Conflicts with the task's assumptions (found in recon — must be resolved)

1. **`annotations` have no UUID and are hard-deleted** (`migrations.rs`: table has integer PK; `delete_annotation` `reader_service.rs:348-356`). Additive soft-delete needs a **local migration**, not only a Supabase schema: add `uuid TEXT UNIQUE` (backfilled), `deleted_at`, and change delete → soft delete.
2. **No `reading_history` table** — history is a query over `reading_progress.last_read` (`library_service.rs:2321`). We sync `reading_sessions` (table exists, UUID PKs) + progress; a separate history table is not needed.
3. **Mixed timestamp formats break LWW**: books use SQLite `CURRENT_TIMESTAMP` ("YYYY-MM-DD HH:MM:SS"), progress/annotations use RFC3339 ("...T...Z"). Lexicographic comparison across formats is wrong → normalize on write (local migration + write-path change) to RFC3339 everywhere synced.
4. **`secret_store` is a no-op on Android** → decision 3 above (plugin KV).
5. **No sync key on 4 of 6 candidate tables** → migration adds UUIDs (`annotations`, `shelves`; progress keyed by `books.uuid`).
6. **`extensions` system stays untouched** (it is DEV-hidden) — new settings UI goes under the existing `cloud-sync` tab or a new `account` tab.
7. Local-only columns (`file_path`, `file_hash`, `cover_path`, `managed_relpath`, `duration`, `last_opened`) are never synced.

## 3. Phases

| Phase | Deliverable | Manual prerequisite |
|---|---|---|
| 1 | Google sign-in desktop + Android, secure session, refresh; offline/local untouched | Supabase project + Google OAuth client |
| 1.5 | Local migration v50: UUIDs, soft-delete, RFC3339 normalization, `sync_outbox` table + Rust write-path hooks | — |
| 2 | Supabase schema + RLS SQL (`supabase/migrations/`) | User applies SQL in Supabase |
| 3 | Sync engine: debounced push, launch/reconnect pull, Realtime, conflict rules | — |
| 4 | Drive import: Picker webview, incremental `drive.file`, download → ingest | Drive API + Picker key |
| 5 | Tests (merge/LWW/offline/expired refresh/unsupported file) + per-platform checklists | Device testing |

### Phase 1 contract
- Env (frontend): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public values).
- Redirect URLs: desktop `https://shiori.local/auth-callback` (allowlisted in Supabase), Android `shiori://auth-callback`.
- Rust commands: `supabase_session_set/get/delete` (secret_store on desktop; plugin KV on Android via a new `secure_kv_*` in the auth plugin).
- Frontend: `src/lib/supabase/client.ts`, `src/lib/supabase/session.ts`, `src/store/authStore.ts`, and an "Account" settings section. Sign-in is optional; all existing local features work signed-out.
- Android plugin: intent-filter host `auth-callback`, `startOAuthLogin(url, state)`, `get_pending_oauth_data`, encrypted `secure_kv_get/set/delete`.

### Phase 2 contract (Supabase SQL)
Tables `reading_progress`, `annotations`, `reading_sessions`, `library_items`, each with `user_id uuid default auth.uid()`, `device_id text`, `updated_at timestamptz`, `deleted_at timestamptz null`; keys: progress `(user_id, book_uuid)` LWW; annotations `(user_id, uuid)`; RLS `auth.uid() = user_id` on all four; Realtime enabled for all four.

### Phase 3 contract
- Rust `sync_outbox(id, entity, entity_uuid, op, payload, created_at, tries)` written at the choke points: `save_reading_progress` (reader_service.rs:94), annotation create/update/delete (:251/:304/:348), session start/end (:745/:782), `update_book`/trash/restore/purge (library_service.rs:462/561/663/687).
- Commands: `sync_outbox_drain(limit)`, `sync_outbox_ack(ids)`, `sync_state_get/set(last_pull)`.
- Frontend engine: debounced drain → upsert to Supabase; pull `updated_at > last_pull` on launch/reconnect; Realtime channel applies remote rows locally via existing commands (add `apply_remote_*` commands that bypass the outbox).
- Merge: progress LWW by `updated_at`; annotations union + `deleted_at` tombstone wins on newer timestamp; sessions append-only by UUID; library items LWW on metadata fields.

### Phase 4 contract
- `src/lib/drive.ts`: Picker webview (`drive-picker` window + capability), incremental consent `drive.file`, picker result → `downloadDriveFile(fileId)` (streamed to temp with size cap) → `ingest_opened_file`.
- Tokens: Google refresh token in secret_store (desktop) / plugin KV (Android), separate from the Supabase session.
- Signed-out users see the button disabled with a sign-in hint; unsupported types are rejected with the same message as local import.

## 4. Verification per phase
- Gates: `cargo check` (+ `cargo test --lib` on Rust slices), `npx tsc -b`, `npx vitest run` (new unit tests: PKCE state/verifier handling, outbox drain/merge, LWW, Drive file-type rejection).
- Platform separation: desktop auth verified in dev; Android verified on device/emulator (the two flows share no redirect code).
- Failure drills: expired refresh token, two-device offline conflict, signed-out local-only, Drive unsupported type.

## 5. Open questions (need user)
1. Supabase project + Google Cloud credentials (see checklist in chat).
2. Should sync also mirror **shelves** (needs UUID migration) in v1, or defer to v1.1? (plan assumes yes, it is cheap once UUIDs exist)
3. Realtime vs poll-only during v1 if the free tier connection limit is a concern.
4. Android device for testing (emulator with Google Play services is acceptable).
