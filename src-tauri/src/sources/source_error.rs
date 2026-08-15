//! Structured source errors.
//!
//! All source adapters surface failures as [`SourceError`] instead of opaque
//! strings so the frontend can branch on the kind (e.g. show a Cloudflare
//! hint) and the backend can log a stable `kind()` tag.

use serde::{Deserialize, Serialize};

use crate::error::ShioriError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SourceError {
    Network,
    Timeout,
    NotFound,
    RateLimited,
    AccessDenied,
    CloudflareChallenge,
    Parser,
    InvalidResponse,
    SourceDisabled,
    Unknown(String),
}

impl SourceError {
    /// Friendly, user-facing message. The Cloudflare variant MUST contain the
    /// word "Cloudflare" — the frontend matches on it to show the Verify hint.
    pub fn user_message(&self) -> String {
        match self {
            Self::Network => "Network error while contacting the source. Check your connection and try again.".to_string(),
            Self::Timeout => "The source took too long to respond. Try again later.".to_string(),
            Self::NotFound => "The requested content was not found on this source.".to_string(),
            Self::RateLimited => "The source is rate-limiting requests. Slow down and try again in a few minutes.".to_string(),
            Self::AccessDenied => "The source denied access to this content.".to_string(),
            Self::CloudflareChallenge => {
                "Cloudflare is blocking this source. It requires browser verification and cannot be accessed automatically — use Verify in Settings after solving in your browser.".to_string()
            }
            Self::Parser => "Failed to parse the source's response. The site layout may have changed.".to_string(),
            Self::InvalidResponse => "The source returned an unexpected response.".to_string(),
            Self::SourceDisabled => {
                "This source is disabled. Enable it in Settings → Online Sources to use it.".to_string()
            }
            Self::Unknown(msg) => format!("Source error: {}", msg),
        }
    }

    /// Stable short tag for logs (never includes cookies/tokens/headers).
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Network => "network",
            Self::Timeout => "timeout",
            Self::NotFound => "not_found",
            Self::RateLimited => "rate_limited",
            Self::AccessDenied => "access_denied",
            Self::CloudflareChallenge => "cloudflare_challenge",
            Self::Parser => "parser",
            Self::InvalidResponse => "invalid_response",
            Self::SourceDisabled => "source_disabled",
            Self::Unknown(_) => "unknown",
        }
    }
}

impl From<SourceError> for ShioriError {
    fn from(e: SourceError) -> Self {
        ShioriError::Other(e.user_message())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cloudflare_message_contains_keyword() {
        let msg = SourceError::CloudflareChallenge.user_message();
        assert!(
            msg.contains("Cloudflare"),
            "frontend matches on the word Cloudflare"
        );
    }

    #[test]
    fn kinds_are_stable() {
        assert_eq!(SourceError::Network.kind(), "network");
        assert_eq!(SourceError::Timeout.kind(), "timeout");
        assert_eq!(SourceError::NotFound.kind(), "not_found");
        assert_eq!(SourceError::RateLimited.kind(), "rate_limited");
        assert_eq!(SourceError::CloudflareChallenge.kind(), "cloudflare_challenge");
        assert_eq!(SourceError::SourceDisabled.kind(), "source_disabled");
    }

    #[test]
    fn converts_to_shiori_error_with_friendly_message() {
        let e: ShioriError = SourceError::CloudflareChallenge.into();
        assert!(e.to_string().contains("Cloudflare"));
    }

    #[test]
    fn serde_roundtrip_uses_camel_case() {
        let json = serde_json::to_string(&SourceError::CloudflareChallenge).unwrap();
        assert_eq!(json, "\"cloudflareChallenge\"");
        let back: SourceError = serde_json::from_str(&json).unwrap();
        assert_eq!(back, SourceError::CloudflareChallenge);
    }
}
