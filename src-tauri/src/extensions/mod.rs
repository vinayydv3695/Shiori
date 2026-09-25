//! WASM extension system.
//!
//! Phase 1 scope: a headless `wasmi`-based host runtime plus a JSON ABI that
//! proves the extension protocol end-to-end through the existing
//! [`Source`](crate::sources::Source) trait. Nothing here is registered into
//! `AppState` / `SourceRegistry` yet (Phase 2 wires the manager + registry).
//!
//! Layout:
//! - [`abi`]        — serde DTOs for the JSON envelope (request/response).
//! - [`runtime`]    — `wasmi` engine + `ExtensionInstance` (fuel, limits,
//!                    wall-clock guard, memory access).
//! - [`host`]       — host functions exposed to extensions (`shiori.*` imports):
//!                    log, clock, per-instance KV, and a Phase-3-stubbed http
//!                    fetch that is allowlist-gated and disabled today.
//! - [`wasm_source`] — [`Source`] adapter over a live instance.

pub mod abi;
pub mod host;
pub mod runtime;
pub mod wasm_source;

#[cfg(test)]
pub(crate) mod test_wasm;

use thiserror::Error;

/// Errors raised by the extension host side.
///
/// These are deliberately coarser than [`wasmi::Error`]: the extension runs
/// untrusted code, so we classify failures into a small set of stable kinds
/// that map onto [`SourceError`](crate::sources::SourceError::Unknown) at the
/// `Source` boundary (variant detail is lost by design — see PLAN.md §3).
#[derive(Debug, Error)]
pub enum ExtensionError {
    /// The module could not be parsed, linked, or instantiated.
    #[error("failed to load wasm extension: {0}")]
    Load(String),
    /// The extension trapped or otherwise failed while running.
    #[error("failed to invoke wasm extension: {0}")]
    Invoke(String),
    /// The extension ran for too long (fuel exhausted / wall-clock guard).
    #[error("extension call timed out")]
    Timeout,
    /// The extension tried to grow linear memory beyond its cap.
    #[error("extension exceeded its memory limit")]
    MemoryLimit,
    /// The extension returned a response we could not interpret.
    #[error("malformed extension payload: {0}")]
    Malformed(String),
    /// A host http call failed (Phase 1: always "http disabled").
    #[error("host http call failed: {0}")]
    Http(String),
    /// A host kv call failed (size cap exceeded, invalid args, …).
    #[error("host kv call failed: {0}")]
    Kv(String),
}

impl From<ExtensionError> for crate::error::ShioriError {
    fn from(e: ExtensionError) -> Self {
        crate::error::ShioriError::Source(crate::sources::SourceError::Unknown(e.to_string()))
    }
}

/// Result alias for extension-internal operations (fails with
/// [`ExtensionError`]) before mapping to [`ShioriError`] at the
/// `Source` boundary.
pub type ExtResult<T> = std::result::Result<T, ExtensionError>;