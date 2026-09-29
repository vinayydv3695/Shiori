# R7 — Background Features & Idle Efficiency Recon (READ-ONLY pass)

Scope: sync, TTS, AI, RSS/TorBox/online sources — timers, polling, work while idle/backgrounded, startup cost.

## High

### H1. RSS scheduler starts at boot and ticks forever, even with zero feeds
- **Files:** `src-tauri/src/lib.rs:957-984` (spawned in `setup()`), `src-tauri/src/services/rss_scheduler.rs:35-118`
- **Evidence:** `RssScheduler::new(...).start()` runs unconditionally; registers a "every 30 minutes" `update_job` and a daily-EPUB cron job. With zero configured feeds the 30-min job still wakes, queries `rss_feeds WHERE active` (`idx_rss_feeds_active` exists — cheap), and schedules nothing — but the `JobScheduler` itself stays resident. There is **no coupling to window visibility**: feeds update on schedule while the app is hidden/backgrounded, doing network + DB + HTML sanitize (`ammonia`) work the user may never look at.
- **Fix:** start scheduler only when ≥1 active feed exists; pause/resume on window visibility (there is no global `visibilitychange → backend` bridge today — see "no global pause", below).

### H2. Desktop Cloudflare clients + hidden RPC webviews warm at startup, idle-resident forever
- **File:** `src-tauri/src/lib.rs:~750-860` (detail in R6-H2). Two `CfClient`s + two persistent hidden `BrowserRpc` webviews (MangaFire, ManhwaRead) are created during setup and stay resident. On a machine where the user never opens Online Manga, this is pure idle RAM/CPU. Lazy-init on first use; optionally park after N minutes idle.

## Medium

### M1. No global "app hidden → stop background work" bridge
- **Evidence:** `visibilitychange` listeners exist only inside readers (`MangaReader.tsx:543`, `PremiumEpubReader.tsx:1524`, `useReadingSession.ts:83-94` — reading-session accounting). Nothing pauses: RSS jobs, Discord RPC refresh, source health checks, torbox polling, AniList sync. Tauri window events (`on_window_event` with `Focused(false)`/`Occluded`) or a frontend visibility broadcast could gate them.

### M2. Startup-timed frontend tasks
- `useAutoUpdate.ts:51,117` — updater check 3 s after mount (desktop).
- `useDiscordRPCUpdater.ts` + `useDiscordPresence.ts:62` — Discord init at mount with retry `setTimeout`; on machines without Discord this is a reconnect timer loop for the whole session (verify backoff — currently looks like a fixed retry).
- `App.tsx:150-185` — `syncRegistrySources`, conversion listeners, download listeners, `library-updated` listener all attach at mount (listeners are cheap; fine). Android auto-sync correctly deferred 2 s (`App.tsx:~190`, K3-027) — good pattern to copy.

### M3. TTS is lazy in the frontend but verify model/asset loading
- **Evidence:** `tauri-plugin-tts` is registered only `cfg(not(linux))` (`lib.rs:442-443`); `piper-rs`+`ort` are desktop-only deps (`Cargo.toml` target gates). `useTTS.ts` (36 KB source) mentions Android TTS init overhead handling (line 686). No evidence of model loading at startup — **verify during F7** that piper voice models download/load strictly on first TTS use and that `edgeTTS.ts:146` timeouts are request-scoped (looks correct).

### M4. Torbox/AI idle behavior
- `useTorboxStore.ts:237` — a `setTimeout` sleep helper (polling loops live in torbox views; confirm they don't tick while their view is unmounted — `TorboxControlCenter.tsx` is a lazy route, so unmount stops them; acceptable).
- `aiStore.ts` — keys load from localStorage/keychain on store init; no network at startup. AI providers only activate from reader dialogs. Looks clean; verify `commands/ai.rs` holds no warm HTTP client pool at boot (there are uncommitted local changes in `commands/ai.rs` — do not clobber, coordinate with owner).

## Low
- `worker.rs` metadata queue: `mpsc` consumer started once (`services/online/worker.rs:46-70`) — event-driven, no polling. Good.
- `folder_watch.rs`: `notify-debouncer-full` with debounce; only active when watch folders configured (`:75-84` early-returns with none). Good — but see R3-M1 (downloads dir overlap risk).
- Sync server binds only on demand (`sync_service.rs:94-120`, `server_handle: None` initially). Good.

## Fix directions for F7
1. Feed-count-gated RSS scheduler + visibility-paused ticking.
2. Lazy CF/RPC webviews (shared with F5/R6-H2); idle-timeout park.
3. Discord: exponential backoff + stop after N failures; start only after first paint.
4. One `app-visibility` event from Rust (`on_window_event`) → frontend store, consumed by RSS/torbox/health polls.
