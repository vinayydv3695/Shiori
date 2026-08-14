//! OS keyring-backed secret storage (desktop only).
//!
//! User credentials — the AniList token, Prowlarr API key, and Torbox API
//! key — are moved out of plaintext at rest (finding S-15) into the OS
//! keyring: macOS Keychain, Windows Credential Manager, or the Linux Secret
//! Service (GNOME Keyring / KWallet).
//!
//! Every access degrades gracefully: when the keyring is unavailable (no
//! Secret Service daemon on Linux, headless CI, ...) [`get`] returns
//! `Ok(None)` and [`set`] returns `Ok(false)`, and the callers fall back to
//! their legacy plaintext storage — the frontend never notices.

use crate::error::{Result, ShioriError};
use log::debug;

/// Service name matches the app identifier in tauri.conf.json
/// (`io.github.vinayydv3695.shiori`); each credential is a separate account.
const SERVICE: &str = "io.github.vinayydv3695.shiori";

/// Read a credential from the OS keyring.
///
/// Returns `Ok(None)` both when the entry does not exist and when the keyring
/// is unavailable (no daemon / unsupported platform) — callers fall back to
/// their legacy storage in that case. Failures are logged at debug level.
pub fn get(account: &str) -> Result<Option<String>> {
    #[cfg(target_os = "android")]
    {
        // ponytail: no keyring backend on Android; Android AniList token already lives
        // in EncryptedSharedPreferences via tauri-plugin-android-auth; prowlarr/torbox
        // keys remain at-rest plaintext on Android — extending the android-auth plugin
        // to generic secure storage is the ceiling.
        let _ = account;
        return Ok(None);
    }

    #[cfg(not(target_os = "android"))]
    {
        let entry = match keyring::Entry::new(SERVICE, account) {
            Ok(entry) => entry,
            Err(e) => {
                debug!("keyring unavailable for '{account}': {e}");
                return Ok(None);
            }
        };
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(e) => {
                debug!("keyring read failed for '{account}': {e}");
                Ok(None)
            }
        }
    }
}

/// Store a credential in the OS keyring.
///
/// Returns `Ok(true)` when the keyring accepted it, `Ok(false)` when the
/// keyring is unavailable (the caller must keep its legacy plaintext storage
/// as the fallback), and `Err` only for unexpected failures the caller should
/// propagate.
pub fn set(account: &str, value: &str) -> Result<bool> {
    #[cfg(target_os = "android")]
    {
        // ponytail: no keyring backend on Android; Android AniList token already lives
        // in EncryptedSharedPreferences via tauri-plugin-android-auth; prowlarr/torbox
        // keys remain at-rest plaintext on Android — extending the android-auth plugin
        // to generic secure storage is the ceiling.
        let _ = (account, value);
        return Ok(false);
    }

    #[cfg(not(target_os = "android"))]
    {
        let entry = match keyring::Entry::new(SERVICE, account) {
            Ok(entry) => entry,
            Err(e) => return unavailable(account, e),
        };
        match entry.set_password(value) {
            Ok(()) => Ok(true),
            Err(e) => unavailable(account, e),
        }
    }
}

/// Best-effort removal of a credential from the OS keyring.
///
/// Never fails: missing entries and unavailable keyrings are logged at debug
/// level and ignored.
pub fn delete(account: &str) {
    #[cfg(target_os = "android")]
    {
        let _ = account;
        return;
    }

    #[cfg(not(target_os = "android"))]
    {
        match keyring::Entry::new(SERVICE, account) {
            Ok(entry) => {
                if let Err(e) = entry.delete_credential() {
                    debug!("keyring delete failed for '{account}': {e}");
                }
            }
            Err(e) => debug!("keyring unavailable for '{account}': {e}"),
        }
    }
}

/// Classify a keyring failure as "unavailable" (caller keeps legacy storage)
/// versus a real failure worth propagating.
#[cfg(not(target_os = "android"))]
fn unavailable(account: &str, e: keyring::Error) -> Result<bool> {
    if matches!(
        e,
        keyring::Error::NoDefaultStore
            | keyring::Error::NoEntry
            | keyring::Error::PlatformFailure(_)
            | keyring::Error::NoStorageAccess(_)
            | keyring::Error::Invalid(..)
    ) {
        debug!("keyring unavailable for '{account}': {e}");
        return Ok(false);
    }
    Err(ShioriError::Other(format!(
        "keyring failure for '{account}': {e}"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_missing_or_unavailable_is_none() {
        // Both outcomes — entry missing (daemon present) and daemon missing —
        // must yield Ok(None); callers can't tell the difference.
        let result = get("__shiori_no_such_account__");
        assert!(result.is_ok(), "get must never hard-fail: {result:?}");
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn set_get_delete_round_trip_when_keyring_available() {
        // With a keyring daemon present this is a full round-trip. Without one
        // (headless CI) it exercises the fallback contract instead: set ->
        // Ok(false), get -> Ok(None). Either way the API contract holds.
        const ACCOUNT: &str = "shiori_secret_store_roundtrip";
        delete(ACCOUNT);
        match set(ACCOUNT, "s3cret-value") {
            Ok(true) => {
                assert_eq!(
                    get(ACCOUNT).unwrap().as_deref(),
                    Some("s3cret-value"),
                    "keyring round-trip read-back"
                );
                delete(ACCOUNT);
                assert!(get(ACCOUNT).unwrap().is_none(), "delete removes entry");
            }
            Ok(false) => {
                // Keyring unavailable: contract holds, nothing to clean up.
                assert!(get(ACCOUNT).unwrap().is_none());
            }
            Err(e) => panic!("set must not error on unavailable keyring: {e}"),
        }
    }
}
