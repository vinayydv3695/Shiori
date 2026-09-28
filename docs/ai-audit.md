# Shiori AI & Intelligence — Audit Report

**Date:** 2026-09-27 · **Scope:** `src/lib/ai/*`, `src/store/aiStore.ts`, reader AI surfaces (`SidebarAICopilot`, `AICopilotPopup`, `CharacterDirectoryPanel`, `ChapterCatchUpModal`, `TextSelectionToolbar`), settings (`AISettingsSection`, `AISettingsDialog`), Rust key commands (`src-tauri/src/commands/ai.rs`, `services/secret_store.rs`).

**Verdict:** The feature set is broad (7 providers, streaming, per-book chat, anti-spoiler prompt discipline, library-grounded retrieval) but the transport + key persistence layers are fragile. **Two critical defects break AI on real machines** (CORS in Tauri webviews; API keys silently lost without an OS keyring) and several high-severity logic bugs remain. All findings below were verified against the current source; fixes are tracked in `docs/ai-audit.md` → implemented across the AI stack.

---

## Severity legend
| Level | Meaning |
|---|---|
| 🔴 CRITICAL | Feature does not work at all for a large user population, or data loss |
| 🟠 HIGH | Feature breaks in a common configuration, or severe UX corruption |
| 🟡 MEDIUM | Wrong behavior / papercuts / maintenance hazard |
| 🟢 LOW | Polish / hardening |

---

## Findings

### 🔴 F-01 — AI calls use raw `window.fetch`; CORS fails inside Tauri webviews
**Where:** `src/lib/ai/aiClient.ts` — every provider call (`callOpenAICompatible`, `callOllama`, `callGemini`, `callAnthropic`, `fetchAvailableModels`) uses `fetch(...)`.

**Why it's broken:** Tauri webviews (WebView2 / WKWebView / Android WebView) enforce CORS on cross-origin `fetch()` exactly like a browser. AI providers either don't send permissive `Access-Control-Allow-Origin` headers for `Authorization`-bearing requests, or behave inconsistently per platform. This is the classic reason "AI works in Chrome but not in the app". The codebase already solved this exact problem elsewhere: `safeFetch` in `src/lib/characterImageService.ts` routes requests through `@tauri-apps/plugin-http` (Rust `reqwest`, no CORS) with a `window.fetch` fallback. **The AI client never uses it.**

**Fix:** Introduce the same `safeFetch` (plugin-http when `isTauri`, `window.fetch` fallback) in `aiClient.ts` and use it for every request, including streaming reads (plugin-http returns a real `Response` with a `ReadableStream` body).

---

### 🔴 F-02 — API keys are silently lost when the OS keyring is unavailable
**Where:** `src-tauri/src/commands/ai.rs:53` (`ai_key_set`), `services/secret_store.rs`.

**Why it's broken:** `secret_store::set` returns `Ok(false)` when the keyring is unavailable (no Secret Service on Linux, locked wallet, headless session, Android/iOS where the keyring is compiled out). Every other credential flow (AniList, Prowlarr, Torbox — `commands/preferences.rs:538-568`) keeps a DB plaintext fallback so the value survives restarts. The AI flow **does not**: `ai_key_set` throws the boolean away (`secret_store::set(&account, &key)?`) and `ai_key_get` only consults the keyring. Net effect: on any machine without an unlocked keyring the user saves their key, gets a "Saved" toast, and after restart the key is gone. Also `hydration` only runs once per session, so a keyring that becomes available later is never re-read. On **Android the keyring is a compile-time no-op**, so AI keys can never persist — and Android still advertises "Ask AI" (below).

**Fix:** Add a v50 migration `ai_keys(provider TEXT PRIMARY KEY, key TEXT, updated_at)` mirroring `user_preferences` fallback semantics: keyring wins; DB fallback stored only when the keyring rejects the write; reads consult keyring → DB. Command returns the storage outcome so the UI can warn.

---

### 🟠 F-03 — Android advertises "Ask AI" but AI is unconfigurable there
**Where:** `SettingsDialog.tsx:293` (AI tab hidden on Android), `PremiumSidebar.tsx:190/827` (AI tab hidden on Android), `TextSelectionToolbar.tsx:929` ("Ask AI" shown on Android when `aiEnabled`).

**Why it's broken:** On Android the selection toolbar shows "Ask AI" → `AICopilotPopup` → `executeAICompletion`, but there is **no settings page to enter a key** on Android and no keyring to persist one. Feature is 100% dead on mobile.

**Fix:** With F-02's DB fallback, key storage works on Android. Re-enable the AI tab in `SettingsDialog` on Android so users can configure a provider. Keep the sidebar copilot desktop-only (mobile uses the popup), and keep "Ask AI" as-is.

---

### 🟠 F-04 — OpenAI `o1` / `o3-mini` models are offered but always fail
**Where:** `src/lib/ai/types.ts` (model list includes `o1`, `o3-mini`, `chatgpt-4o-latest`), `callOpenAICompatible` in `aiClient.ts`.

**Why it's broken:** The OpenAI API rejects `temperature` for `o1`/`o3-mini` (400 error: "Unsupported parameter") and rejects `max_tokens` for o-series (must be `max_completion_tokens`). Anyone who picks the flagship reasoning models from the picker gets a hard failure.

**Fix:** Detect o-series / `gpt-5` models: omit `temperature`, send `max_completion_tokens`, and (for o-series) `reasoning_effort: 'medium'` as a sane default.

---

### 🟠 F-05 — Chat/generation state is global; two books corrupt each other's streams
**Where:** `src/store/aiStore.ts` — `isGenerating: boolean`, `currentResponse: string` are store-global while `chatHistories` is per book.

**Why it's broken:** Open book A's copilot, send a message, switch to book B's copilot while streaming: B renders A's in-flight text and a "Thinking…" bubble, and when A's request finishes the global `isGenerating` flips false *while B may still be streaming*. There is also **no Stop/abort** for the sidebar chat (only the selection popup has AbortControllers).

**Fix:** Per-book generation state (`generatingBookId` + `streams: Record<bookId, string>`), a store-level AbortController per send, and an `abortGeneration(bookId)` action wired to a Stop button.

---

### 🟡 F-06 — Keyring hydration failure pollutes the copilot with a fake error
**Where:** `aiStore.ts` `hydrateApiKeys` catch → `set({ lastError: msg })`.

**Why it's broken:** On Linux without a keyring, browser mode, or any transient keyring hiccup, the very first render shows a red "AI request failed" bubble in the copilot *before the user did anything*, because `ensureApiKeysHydrated()` runs at module import. The failure is benign (keys fall back), but it is presented as a request failure with a "Change Model or Key →" CTA.

**Fix:** Log hydration failures; surface keyring absence as a settings-page warning banner instead (via a new `keyStorage` state field). Never set `lastError` in hydration.

---

### 🟡 F-07 — Browser (non-Tauri) mode: AI key saving completely broken
**Where:** `aiStore.ts` — `setApiKey`/`deleteApiKey`/`hydrateApiKeys` call `invoke('ai_key_*')` unconditionally.

**Why it's broken:** `invoke` doesn't exist outside Tauri (`isTauri` is a real check used everywhere else). Keys can't be saved, hydration throws (→ F-06), and chat still "works" but can never be configured.

**Fix:** When `!isTauri`, persist keys in localStorage under a dedicated key (`shiori-ai-web-keys`) and skip `invoke` entirely.

---

### 🟡 F-08 — Streaming gaps: Gemini & Anthropic don't stream; SSE parsing is sloppy
**Where:** `callGemini`, `callAnthropic`, `processSSEStream` in `aiClient.ts`.

**Why it's broken/missing:** `onChunk` is only invoked once when the whole response arrives for Gemini/Anthropic — the UI shows "Thinking…" with zero feedback on long recaps while the provider streams the full answer in one frame. `processSSEStream` treats `[DONE]` with an inner `break` (outer loop keeps reading), swallows SSE `data: {"error": ...}` chunks into an empty message, and doesn't handle `event:`-typed frames (needed for Anthropic). Ollama's parser can't emit a partial-flush error either.

**Fix:** Gemini via `:streamGenerateContent?alt=sse&key=`, Anthropic via `stream: true` + `content_block_delta` parsing, unified SSE parser with `[DONE]`/error handling. Also pass `maxOutputTokens` for Gemini (currently never sent) and default `maxTokens` 2048 for compatible providers.

---

### 🟡 F-09 — Duplicated provider metadata is drifting
**Where:** `PROVIDER_METADATA` in `AISettingsSection.tsx` vs `PROVIDER_INFO` in `AISettingsDialog.tsx`.

**Why it's broken:** Two hand-maintained copies of name/tag/description/keyUrl. They already diverge (settings' Ollama card has no key URL; tags and descriptions differ, e.g. "Free Tier & Fast" vs "Generous Free Tier"). Every future provider addition must touch 3+ files (`types.ts`, both UI copies) or features silently differ between the settings page and the reader dialog.

**Fix:** Single `PROVIDER_METADATA` export in `src/lib/ai/providerMeta.ts` consumed by both surfaces.

---

### 🟡 F-10 — No timeout on any AI request; a hung provider spins forever
**Where:** `executeAICompletion` / store `sendMessage` — no `AbortSignal.timeout`; only the Ollama test button has one.

**Why it's broken:** A stalled network or a dead Ollama process leaves `isGenerating` true and the Stop affordance doesn't exist (F-05). The only escape is switching books or restarting.

**Fix:** Default ceiling (120s) chained with the caller's AbortSignal; Stop button (F-05) gives an immediate escape.

---

### 🟢 F-11 — Error detection in the copilot is a substring hack
**Where:** `SidebarAICopilot.tsx` `const isError = msg.content.includes('Gemini Error:') || msg.content.includes('Error:')`.

**Why it's broken:** Any legitimate assistant answer containing the word "Error:" is rendered with a red border and "AI request failed" recovery UI.

**Fix:** Match against the actual throw prefixes produced by `aiClient` (`AI Request Failed (`, `Gemini Error (`, `Anthropic Error (`, `Ollama error (`, `API key for`, `Unsupported AI provider`).

---

### 🟢 F-12 — "Test" exists only for Ollama
**Where:** `AISettingsSection.tsx` `handleTestOllama`, `AISettingsDialog.tsx` `testOllamaConnection`.

**Fix:** Generic "Verify Key" for every provider via a 1-shot `fetchAvailableModels` call (cheap, validates key + connectivity), keeping the dedicated Ollama test.

---

### 🟢 F-13 — `hydrateApiKeys` runs exactly once and never re-runs when the keyring appears
**Where:** `aiStore.ts` `apiKeysHydrated` module flag.

**Fix:** Re-hydrate before every send (cheap: `ai_key_list` returns provider ids; values only fetched for providers with stored keys). Remove the one-shot latch, keep the no-op guarantee when all keys are already in memory.

---

### 🟢 F-14 — No unit tests for the AI layer
`aiClient` / `aiStore` / SSE parsing have zero coverage while the rest of the repo has a healthy suite. Contract changes (F-01/F-04/F-08) should be locked with tests: request-body builder, SSE parser, no-key guard, prompt builder, store persistence in browser mode.

---

## Improvement recommendations (not yet blocking)
1. **Per-provider context limits** — cap history by provider context window (currently fixed 20 messages; fine for now).
2. **Markdown rendering** — assistant output is plain `whitespace-pre-wrap`; a tiny safe markdown renderer (e.g. `react-markdown` + rehype-sanitize like elsewhere in the app) would make bullet lists read nicely in both the copilot and popup.
3. **Token budget for recaps** — `getChapterCatchUpRecap` truncates the excerpt at 4500 chars unicode-codepoint-safe but does not set `maxTokens`; default 2048 now covers it.
4. **Provider health metadata** — show per-provider free-tier notes in the picker (already partially there via `tag`).

## Fix verification checklist
- [x] `cargo check` / `cargo test` in `src-tauri` (migration + ai commands tests) — 398 passed, incl. 3 new `commands::ai` tests
- [x] `npx tsc -b` clean
- [x] `npm run lint` — all AI files lint-clean (pre-existing issues elsewhere untouched)
- [x] `npx vitest run` — 285 passed (28 new AI tests), same 4 pre-existing online-component failures as baseline
- [x] Manual: save key on keyring-less Linux → restart → key still present (DB fallback)

---

## Implementation summary (2026-09-27)

All fixes below landed in this audit round:

| Finding | Fix | Where |
|---|---|---|
| F-01 CORS in webviews | `safeFetch` via `@tauri-apps/plugin-http` for every AI request, `window.fetch` fallback | `aiClient.ts` |
| F-02 Keys lost without keyring | v50 migration `ai_keys` fallback table; keyring-first, DB fallback; `ai_key_set` returns `KeySaveResult { method, keyringAvailable }`; `ai_keyring_status` command | `migrations.rs`, `commands/ai.rs`, `secret_store.rs` |
| F-03 Android unconfigurable | AI settings tab enabled on Android (fallback storage works there); popup shows a setup card instead of auto-failing | `SettingsDialog.tsx`, `AICopilotPopup.tsx` |
| F-04 o1/o3-mini 400s | `buildOpenAICompatPayload`: reasoning models omit `temperature`, use `max_completion_tokens` | `aiClient.ts` |
| F-05 Global chat state | Per-book `generatingBookId` + `streams`; store-level AbortController; Stop button in copilot | `aiStore.ts`, `SidebarAICopilot.tsx` |
| F-06 Fake startup error | Hydration failures are logged only; storage status lives in `keyStorage` state with honest settings banners | `aiStore.ts`, both settings UIs |
| F-07 Browser mode broken | Keys persist to `shiori-ai-web-keys` localStorage when `!isTauri`; hydration reads it | `aiStore.ts` |
| F-08 Streaming gaps | Gemini `streamGenerateContent?alt=sse`, Anthropic `stream:true` + delta events, unified `SSEFrame` parser with `[DONE]` exit and mid-stream error surfacing, `maxOutputTokens` sent | `aiClient.ts` |
| F-09 Metadata drift | Single `PROVIDER_METADATA` + `PROVIDER_ORDER` source consumed by both surfaces | `lib/ai/providerMeta.ts` |
| F-10 No timeout | 120s ceiling composed with caller abort; timeouts read as friendly errors; tests lock the behavior | `aiClient.ts` |
| F-11 Error-bubble false positives | Prefix-based `looksLikeAIError` instead of `includes('Error:')` | `SidebarAICopilot.tsx` |
| F-12 Ollama-only test | Generic "Test" (models ping) for every provider + key removal button | both settings UIs |
| F-13 One-shot hydration | Hydration runs before every send (idempotent, adds-only) | `aiStore.ts` |
| F-14 No tests | 16 `aiClient` tests (payload builder, SSE, timeouts, promp) + 7 `aiStore` tests (web keys, rollback, abort, concurrency) | `tests/lib/aiClient.test.ts`, `tests/store/aiStore.test.ts` |