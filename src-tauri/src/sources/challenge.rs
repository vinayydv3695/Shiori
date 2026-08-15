//! HTTP challenge/error classification shared by source adapters.
//!
//! Pure functions: given a status + body (or a `reqwest::Error`), return the
//! matching [`SourceError`]. No I/O, no network — trivially unit-testable.

use reqwest::StatusCode;

use crate::sources::source_error::SourceError;

/// Marker strings quoted from `cloudflare/detector.rs` (`contains_cf_markers`
/// + `is_js_challenge`/`is_captcha`). A status of 403/503/429 combined with
/// any of these means Cloudflare is interposing a challenge.
const CF_MARKERS: &[&str] = &[
    "cloudflare",
    "cf-ray",
    "__cf_bm",
    "cf_clearance",
    "challenge-platform",
    "_cf_chl",
    "just a moment",
    "attention required",
    "cf-mitigated",
];

/// Map an HTTP status + body to a structured error.
///
/// Order matters: challenge markers win on 403/503 (Cloudflare interstitials
/// use those codes), then plain status mapping.
pub fn detect_challenge(status: StatusCode, body: &str) -> Option<SourceError> {
    let lower = body.to_ascii_lowercase();
    let has_marker = CF_MARKERS.iter().any(|m| lower.contains(m));

    match status.as_u16() {
        429 => return Some(SourceError::RateLimited),
        403 | 503 if has_marker => return Some(SourceError::CloudflareChallenge),
        403 => return Some(SourceError::AccessDenied),
        404 => return Some(SourceError::NotFound),
        500..=599 => return Some(SourceError::Network),
        _ => {}
    }

    // 200-with-challenge fallback: CF sometimes serves the interstitial as 200.
    if has_marker
        && (lower.contains("just a moment")
            || lower.contains("challenge-platform")
            || lower.contains("cf-browser-verification"))
    {
        return Some(SourceError::CloudflareChallenge);
    }

    None
}

/// Map a `reqwest::Error` to a structured error.
pub fn map_reqwest_error(e: &reqwest::Error) -> SourceError {
    if e.is_timeout() {
        return SourceError::Timeout;
    }
    if e.is_connect() {
        return SourceError::Network;
    }
    if let Some(status) = e.status() {
        if let Some(source_err) = detect_challenge(status, "") {
            return source_err;
        }
        match status.as_u16() {
            404 => return SourceError::NotFound,
            429 => return SourceError::RateLimited,
            403 => return SourceError::AccessDenied,
            500..=599 => return SourceError::Network,
            _ => {}
        }
    }
    SourceError::Unknown(e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limit_is_429() {
        assert_eq!(
            detect_challenge(StatusCode::TOO_MANY_REQUESTS, ""),
            Some(SourceError::RateLimited)
        );
    }

    #[test]
    fn cloudflare_challenge_403_with_markers() {
        let body = "<html><title>Just a moment...</title>cloudflare challenge-platform</html>";
        assert_eq!(
            detect_challenge(StatusCode::FORBIDDEN, body),
            Some(SourceError::CloudflareChallenge)
        );
        // Each quoted marker alone on a 403 also classifies as CF.
        for marker in ["just a moment", "challenge-platform", "attention required", "cf-mitigated"] {
            assert_eq!(
                detect_challenge(StatusCode::FORBIDDEN, marker),
                Some(SourceError::CloudflareChallenge),
                "marker: {marker}"
            );
        }
    }

    #[test]
    fn cloudflare_challenge_503_with_markers() {
        let body = "cf-ray: 1a2b3c — Attention Required! | Cloudflare";
        assert_eq!(
            detect_challenge(StatusCode::SERVICE_UNAVAILABLE, body),
            Some(SourceError::CloudflareChallenge)
        );
    }

    #[test]
    fn plain_403_is_access_denied() {
        assert_eq!(
            detect_challenge(StatusCode::FORBIDDEN, "<html>forbidden</html>"),
            Some(SourceError::AccessDenied)
        );
    }

    #[test]
    fn not_found_is_404() {
        assert_eq!(
            detect_challenge(StatusCode::NOT_FOUND, "no such page"),
            Some(SourceError::NotFound)
        );
    }

    #[test]
    fn server_error_is_network() {
        assert_eq!(
            detect_challenge(StatusCode::INTERNAL_SERVER_ERROR, "boom"),
            Some(SourceError::Network)
        );
    }

    #[test]
    fn clean_response_is_none() {
        assert_eq!(detect_challenge(StatusCode::OK, "<html>content</html>"), None);
        // 200 pages that merely mention the word "cloudflare" (e.g. a review
        // article) are not challenges.
        assert_eq!(
            detect_challenge(StatusCode::OK, "this site uses cloudflare cdn"),
            None
        );
    }

    #[test]
    fn challenge_as_200_ok_is_detected() {
        let body = "<title>Just a moment...</title><script src=\"/cdn-cgi/challenge-platform/\"></script>";
        assert_eq!(
            detect_challenge(StatusCode::OK, body),
            Some(SourceError::CloudflareChallenge)
        );
    }

    #[tokio::test]
    async fn reqwest_timeout_maps_to_timeout() {
        let e = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(1))
            .build()
            .unwrap()
            .get("http://10.255.255.1:81/")
            .send()
            .await
            .unwrap_err();
        assert_eq!(map_reqwest_error(&e), SourceError::Timeout);
    }
}
