/// Cloudflare session management for Shiori.
///
/// Architecture:
///   session  – Persistent cookie/UA storage (JSON on disk, LRU in memory).
///   browser  – Playwright-based VISIBLE challenge solver (user-driven only).
///   client   – reqwest wrapper that injects stored user-solved cookies.
///   detector – Heuristics to detect whether a response is a CF challenge page.
///   commands – Tauri command handlers exposed to the frontend.
///
/// No automated anti-bot machinery: no headless stealth, no auto-click, no
/// token extraction. Challenges are DETECTED and surfaced as errors; the only
/// solve path is the user-initiated visible `cf_solve` command.
pub mod browser;
pub mod client;
pub mod commands;
pub mod detector;
pub mod session;
