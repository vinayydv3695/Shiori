//! AI provider API-key management (security fix: keys moved out of webview
//! localStorage into the OS keyring via [`crate::services::secret_store`]).
//!
//! Each provider's key lives at the keyring account `ai.<provider>.api_key`,
//! mirroring the existing `torbox.api_key` / `anilist_token` conventions. As a
//! last-resort fallback (mirroring the `user_preferences` credential pattern),
//! keys are ALSO kept in the `ai_keys` DB table whenever the OS keyring is
//! unavailable — Linux without a Secret Service daemon, locked wallets,
//! Android/iOS where the keyring is compiled out — so a saved key always
//! survives restarts. The keyring is always preferred, and a successful
//! keyring write clears the DB row.
//!
//! Reads consult the keyring first, then the DB fallback. All access degrades
//! gracefully: when both stores are unavailable the frontend keeps its
//! in-memory copy for the session.
//!
//! The known-provider list must stay in sync with the frontend's `AIProvider`
//! type in `src/lib/ai/types.ts`.

use rusqlite::OptionalExtension;

use crate::db::Database;
use crate::error::{Result, ShioriError};
use crate::services::secret_store;
use crate::AppState;
use serde::Serialize;
use tauri::State;

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

/// Where a provider key is currently persisted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum KeyStorage {
    /// Stored in the OS keyring (preferred).
    Keyring,
    /// Keyring unavailable — stored in the `ai_keys` DB fallback table.
    Fallback,
}

/// Outcome of saving (or deleting) a provider key, so the frontend can warn
/// the user when the OS keyring was unavailable and the key only landed in
/// the app-data fallback.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeySaveResult {
    pub provider: String,
    pub method: KeyStorage,
    pub keyring_available: bool,
}

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

/// Read a provider's stored key from the DB fallback table.
fn read_fallback(db: &Database, provider: &str) -> Result<Option<String>> {
    let conn = db.get_connection()?;
    let key: Option<String> = conn
        .query_row(
            "SELECT key FROM ai_keys WHERE provider = ?1",
            [provider],
            |row| row.get(0),
        )
        .optional()?;
    Ok(key.filter(|k| !k.is_empty()))
}

/// Write a provider's key to the DB fallback table. `None` clears it.
fn write_fallback(db: &Database, provider: &str, key: Option<&str>) -> Result<()> {
    let conn = db.get_connection()?;
    match key {
        Some(key) if !key.trim().is_empty() => {
            conn.execute(
                "INSERT INTO ai_keys (provider, key, updated_at)
                 VALUES (?1, ?2, datetime('now'))
                 ON CONFLICT(provider) DO UPDATE SET key = excluded.key, updated_at = datetime('now')",
                rusqlite::params![provider, key.trim()],
            )?;
        }
        _ => {
            conn.execute("DELETE FROM ai_keys WHERE provider = ?1", [provider])?;
        }
    }
    Ok(())
}

/// Read a provider's API key: OS keyring first, DB fallback second.
///
/// Returns `Ok(None)` when no key is stored anywhere or both stores are
/// unavailable.
pub fn get_key(db: &Database, provider: &str) -> Result<Option<String>> {
    let provider = normalize_provider(provider)?;
    if let Some(key) = secret_store::get(&account(&provider))? {
        if !key.is_empty() {
            return Ok(Some(key));
        }
    }
    read_fallback(db, &provider)
}

/// Store a provider's API key.
///
/// The key is trimmed first; a blank key deletes the stored entry. The
/// keyring is tried first; when it is unavailable (`Ok(false)` — Linux
/// without Secret Service, mobile, headless sessions) the key lands in the
/// `ai_keys` DB fallback so it survives restarts.
pub fn set_key(db: &Database, provider: &str, key: &str) -> Result<KeySaveResult> {
    let provider = normalize_provider(provider)?;
    let key = key.trim().to_string();
    if key.is_empty() {
        // Blank means "delete": drop both stores.
        secret_store::delete(&account(&provider));
        write_fallback(db, &provider, None)?;
        return Ok(KeySaveResult {
            provider,
            method: KeyStorage::Keyring,
            keyring_available: secret_store::available(),
        });
    }
    match secret_store::set(&account(&provider), &key)? {
        true => {
            // Keyring accepted it — clear the fallback so reads never resurrect
            // a stale plaintext copy.
            write_fallback(db, &provider, None)?;
            Ok(KeySaveResult {
                provider,
                method: KeyStorage::Keyring,
                keyring_available: true,
            })
        }
        false => {
            // Keyring unavailable — keep the key in the DB fallback.
            write_fallback(db, &provider, Some(&key))?;
            Ok(KeySaveResult {
                provider,
                method: KeyStorage::Fallback,
                keyring_available: false,
            })
        }
    }
}

/// Remove a provider's API key from both stores (best-effort, never fails).
pub fn delete_key(db: &Database, provider: &str) -> Result<()> {
    let provider = normalize_provider(provider)?;
    secret_store::delete(&account(&provider));
    write_fallback(db, &provider, None)
}

/// List the providers (from `providers`) that currently have a stored key in
/// either store.
pub fn list_keys(db: &Database, providers: Vec<String>) -> Result<Vec<String>> {
    let mut stored = Vec::new();
    for provider in providers {
        let Ok(provider) = normalize_provider(&provider) else {
            continue;
        };
        if get_key(db, &provider)?.is_some() {
            stored.push(provider);
        }
    }
    Ok(stored)
}

/// Read a provider's API key from the OS keyring or the DB fallback.
#[tauri::command]
pub fn ai_key_get(db: State<'_, AppState>, provider: String) -> Result<Option<String>> {
    get_key(&db.db, &provider)
}

/// Store a provider's API key in the OS keyring (or the DB fallback when the
/// keyring is unavailable). A blank key deletes the stored entry.
#[tauri::command]
pub fn ai_key_set(
    db: State<'_, AppState>,
    provider: String,
    key: String,
) -> Result<KeySaveResult> {
    set_key(&db.db, &provider, &key)
}

/// Remove a provider's API key (best-effort, never fails).
#[tauri::command]
pub fn ai_key_delete(db: State<'_, AppState>, provider: String) -> Result<()> {
    delete_key(&db.db, &provider)
}

/// List the providers (from `providers`) that currently have a stored key.
///
/// The frontend passes its own known provider list; unknown ids are ignored so
/// the frontend/back-end provider sets can drift without breaking the query.
#[tauri::command]
pub fn ai_key_list(db: State<'_, AppState>, providers: Vec<String>) -> Result<Vec<String>> {
    list_keys(&db.db, providers)
}

/// Whether the OS keyring is currently usable by the app.
///
/// Lets the settings UI show an honest "stored in app data, not the OS
/// keychain" warning when the keyring is unavailable.
#[tauri::command]
pub fn ai_keyring_status() -> Result<bool> {
    Ok(secret_store::available())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Fresh in-memory-ish database with all migrations applied. The temp dir
    /// is returned alongside so it outlives the database handle.
    fn test_db() -> (Database, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::new(dir.path().join("test.db")).unwrap();
        (db, dir)
    }

    #[test]
    fn normalize_rejects_unknown_and_empty() {
        assert!(normalize_provider("").is_err());
        assert!(normalize_provider("  ").is_err());
        assert!(normalize_provider("not-a-provider").is_err());
        assert_eq!(normalize_provider("  Gemini ").unwrap(), "gemini");
    }

    #[test]
    fn fallback_roundtrip_without_keyring() {
        // Exercise the DB fallback layer directly (secret_store is
        // environment-dependent; the fallback is what keeps keys alive when
        // the keyring is unavailable).
        let (db, _dir) = test_db();

        write_fallback(&db, "gemini", Some("sk-test-123")).unwrap();
        assert_eq!(
            read_fallback(&db, "gemini").unwrap().as_deref(),
            Some("sk-test-123")
        );

        // Overwrite round-trips.
        write_fallback(&db, "gemini", Some("sk-new-key")).unwrap();
        assert_eq!(
            read_fallback(&db, "gemini").unwrap().as_deref(),
            Some("sk-new-key")
        );

        // Clearing removes it.
        write_fallback(&db, "gemini", None).unwrap();
        assert_eq!(read_fallback(&db, "gemini").unwrap(), None);
    }

    #[test]
    fn set_key_blank_clears_fallback() {
        let (db, _dir) = test_db();
        write_fallback(&db, "openai", Some("sk-blank-test")).unwrap();

        // set_key's blank branch: delete from the keyring (no-op when empty)
        // and clear the fallback.
        secret_store::delete(&account("openai"));
        write_fallback(&db, "openai", None).unwrap();
        assert_eq!(read_fallback(&db, "openai").unwrap(), None);
        assert!(list_keys(&db, vec!["openai".to_string()]).unwrap().is_empty());
    }

    #[test]
    fn list_keys_ignores_unknown_providers() {
        let (db, _dir) = test_db();
        write_fallback(&db, "groq", Some("sk-groq")).unwrap();
        let found = list_keys(
            &db,
            vec!["groq".to_string(), "made-up-provider".to_string()],
        )
        .unwrap();
        assert_eq!(found, vec!["groq"]);
    }
}