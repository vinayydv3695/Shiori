//! JSON ABI shared between the host and WASM extensions.
//!
//! Wire protocol (JSON over linear memory):
//! - Request: `{ "method": "meta" | "search" | "browse" | "chapters" |
//!   "pages" | "health", "params": <json> }`.
//! - Response: `{ "ok": true, "data": <json> }` or
//!   `{ "ok": false, "error": { "kind": "...", "message": "..." } }`.
//!
//! Host functions that return pointers (see [`host`](super::host)) use the
//! *same* envelope plus the same length-prefix buffer convention, so an
//! extension may passthrough a host result verbatim when that is useful.
//!
//! Results are mapped into the *existing* source structs
//! ([`SourceMeta`], [`SearchResult`], [`Chapter`], [`Page`],
//! [`SourceHealth`]) whose serde attrs are all `camelCase` — the extension
//! must emit camelCase keys (`baseUrl`, `sourceId`, `contentId`, `chapterId`,
//! `coverUrl`, `uploadedAt`, `contentType`, …).

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::sources::{Chapter, Page, SearchResult, SourceHealth, SourceMeta};

use super::ExtensionError;

/// Extension call methods.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Method {
    Meta,
    Search,
    Browse,
    Chapters,
    Pages,
    Health,
}

impl Method {
    pub fn as_str(&self) -> &'static str {
        match self {
            Method::Meta => "meta",
            Method::Search => "search",
            Method::Browse => "browse",
            Method::Chapters => "chapters",
            Method::Pages => "pages",
            Method::Health => "health",
        }
    }
}

/// Request envelope written into extension memory before `invoke(ptr, len)`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub method: Method,
    pub params: Value,
}

impl Request {
    pub fn new(method: Method, params: Value) -> Self {
        Self { method, params }
    }
}

/// Structured error inside a non-ok response envelope.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestError {
    pub kind: String,
    pub message: String,
}

/// Response envelope returned by `invoke` (and by pointer-returning host
/// functions).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Response {
    pub ok: bool,
    #[serde(default)]
    pub data: Option<Value>,
    #[serde(default)]
    pub error: Option<RequestError>,
}

impl Response {
    /// Unwraps `data` on an `ok` response, otherwise surfaces the extension's
    /// structured error as [`ExtensionError::Invoke`].
    pub fn into_data(self) -> Result<Value, ExtensionError> {
        if self.ok {
            self.data.ok_or_else(|| {
                ExtensionError::Malformed("extension responded ok=true without a data field".into())
            })
        } else {
            let err = self.error.unwrap_or(RequestError {
                kind: "error".into(),
                message: "extension returned ok=false".into(),
            });
            Err(ExtensionError::Invoke(format!("{}: {}", err.kind, err.message)))
        }
    }
}

// ---------------------------------------------------------------------------
// Method-specific params.
// ---------------------------------------------------------------------------

/// `search` params: `{ "query": string, "page": u32 }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchParams {
    pub query: String,
    #[serde(default)]
    pub page: u32,
}

/// `chapters` params: `{ "contentId": string }` (camelCase, like the rest of
/// the app's JSON).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChaptersParams {
    pub content_id: String,
}

/// `pages` params: `{ "chapterId": string }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagesParams {
    pub chapter_id: String,
}

// ---------------------------------------------------------------------------
// Result mapping into the existing source structs.
// ---------------------------------------------------------------------------

/// Maps the `data` field of a `meta` response into [`SourceMeta`].
pub fn meta_from_value(v: &Value) -> Result<SourceMeta, ExtensionError> {
    serde_json::from_value(v.clone()).map_err(|e| ExtensionError::Malformed(format!("meta: {e}")))
}

/// Maps the `data` field of a `search`/`browse` response into
/// [`SearchResult`]s.
pub fn results_from_value(v: &Value) -> Result<Vec<SearchResult>, ExtensionError> {
    serde_json::from_value(v.clone())
        .map_err(|e| ExtensionError::Malformed(format!("search results: {e}")))
}

/// Maps the `data` field of a `chapters` response into [`Chapter`]s.
pub fn chapters_from_value(v: &Value) -> Result<Vec<Chapter>, ExtensionError> {
    serde_json::from_value(v.clone()).map_err(|e| ExtensionError::Malformed(format!("chapters: {e}")))
}

/// Maps the `data` field of a `pages` response into [`Page`]s.
pub fn pages_from_value(v: &Value) -> Result<Vec<Page>, ExtensionError> {
    serde_json::from_value(v.clone()).map_err(|e| ExtensionError::Malformed(format!("pages: {e}")))
}

/// Maps the `data` field of a `health` response into [`SourceHealth`].
pub fn health_from_value(v: &Value) -> Result<SourceHealth, ExtensionError> {
    serde_json::from_value(v.clone()).map_err(|e| ExtensionError::Malformed(format!("health: {e}")))
}

