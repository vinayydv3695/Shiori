/// Cloudflare anti-bot bypass system for Shiori.
///
/// Architecture:
///   session  – Persistent cookie/UA storage (JSON on disk, LRU in memory).
///   browser  – Playwright-based challenge solver (headless→visible fallback).
///   client   – reqwest wrapper that injects CF cookies + auto-refreshes.
///   detector – Heuristics to detect whether a response is a CF challenge page.
///   commands – Tauri command handlers exposed to the frontend.
pub mod browser;
pub mod client;
pub mod commands;
pub mod detector;
pub mod session;
