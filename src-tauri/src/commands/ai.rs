//! AI provider API-key management (security fix: keys moved out of webview
//! localStorage into the OS keyring via [`crate::services::secret_store`]).
//!
//! Each provider's key lives at the keyring account `ai.<provider>.api_key`,
//! mirroring the existing `torbox.api_key` / `anilist_token` conventions. All
//! access degrades gracefully: when the keyring is unavailable, reads return
//! `Ok(None)` and writes return `Ok(false)` — the frontend keeps its in-memory
//! fallback either way.
//!
//! The known-provider list must stay in sync with the frontend's `AIProvider`
//! type in `src/lib/ai/types.ts`.

use crate::error::{Result, ShioriError};
use crate::services::secret_store;

/// Providers the frontend can configure, lowercased. `ollama` never requires a
/// key but stays in the set so callers can address it uniformly.
const KNOWN_PROVIDERS: &[&str] = &[
    "ollama",
    "groq",
    "gemini",
    "openai",
    "deepseek",
    "anthropic",
    "opencode",
];

/// Normalize (trim + lowercase) and validate a provider id. Rejects unknown
/// and empty providers with a clear error.
fn normalize_provider(provider: &str) -> Result<String> {
    let normalized = provider.trim().to_lowercase();
    if normalized.is_empty() {
        return Err(ShioriError::Validation(
            "AI provider must not be empty".to_string(),
        ));
    }
    if !KNOWN_PROVIDERS.contains(&normalized.as_str()) {
        return Err(ShioriError::Validation(format!(
            "unknown AI provider '{provider}' (expected one of: {})",
            KNOWN_PROVIDERS.join(", ")
        )));
    }
    Ok(normalized)
}

/// Keyring account name for a provider's API key.
fn account(provider: &str) -> String {
    format!("ai.{provider}.api_key")
}

/// Read a provider's API key from the OS keyring.
///
/// Returns `Ok(None)` when no key is stored or the keyring is unavailable
/// (same graceful contract as the rest of the secret store).
#[tauri::command]
pub fn ai_key_get(provider: String) -> Result<Option<String>> {
    let provider = normalize_provider(&provider)?;
    secret_store::get(&account(&provider))
}

/// Store a provider's API key in the OS keyring.
///
/// The key is trimmed first; a blank key deletes the stored entry (so the
/// frontend's "clear field" path needs no separate write).
#[tauri::command]
pub fn ai_key_set(provider: String, key: String) -> Result<()> {
    let provider = normalize_provider(&provider)?;
    let key = key.trim().to_string();
    if key.is_empty() {
        secret_store::delete(&account(&provider));
        return Ok(());
    }
    secret_store::set(&account(&provider), &key)?;
    Ok(())
}

/// Remove a provider's API key from the OS keyring (best-effort, never fails).
#[tauri::command]
pub fn ai_key_delete(provider: String) -> Result<()> {
    let provider = normalize_provider(&provider)?;
    secret_store::delete(&account(&provider));
    Ok(())
}

/// List the providers (from `providers`) that currently have a stored key.
///
/// The frontend passes its own known provider list; unknown ids are ignored so
/// the frontend/back-end provider sets can drift without breaking the query.
#[tauri::command]
pub fn ai_key_list(providers: Vec<String>) -> Result<Vec<String>> {
    let mut stored = Vec::new();
    for provider in providers {
        let Ok(provider) = normalize_provider(&provider) else {
            continue;
        };
        if let Some(key) = secret_store::get(&account(&provider))? {
            if !key.is_empty() {
                stored.push(provider);
            }
        }
    }
    Ok(stored)
}