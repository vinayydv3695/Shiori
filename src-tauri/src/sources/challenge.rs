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
        // detect_challenge covers every status mapping below (429, 404, 403,
        // 5xx), so the plain status is classified here and nowhere else.
        if let Some(source_err) = detect_challenge(status, "") {
            return source_err;
        }
    }
    SourceError::Unknown(e.to_string())
}

/// Map a CfClient error message to a structured error.
///
/// Handles exactly the documented error texts from `cloudflare/client.rs`:
///   - `"Cloudflare is blocking access to {url}. …"` → [`SourceError::CloudflareChallenge`]
///   - `"HTTP {status} from {url} after 3 retries"` → status classification
///     via [`detect_challenge`]
///   - messages containing `"timed out"` / `"timeout"` → [`SourceError::Timeout`]
///
/// Anything else (e.g. transport errors without a status) maps to `None` so
/// callers can fall back to their own handling.
pub fn status_from_cf_error(e: &str) -> Option<SourceError> {
    let lower = e.to_ascii_lowercase();
    if lower.contains("cloudflare is blocking access") {
        return Some(SourceError::CloudflareChallenge);
    }
    if lower.contains("timed out") || lower.contains("timeout") {
        return Some(SourceError::Timeout);
    }

    // "HTTP 429 from https://… after 3 retries"
    let tokens: Vec<&str> = e.split_whitespace().collect();
    for (i, t) in tokens.iter().enumerate() {
        if *t == "HTTP" {
            if let Some(next) = tokens.get(i + 1) {
                if let Ok(code) = next.parse::<u16>() {
                    if (100..600).contains(&code) {
                        if let Ok(status) = StatusCode::from_u16(code) {
                            return detect_challenge(status, "");
                        }
                    }
                }
            }
        }
    }
    None
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

    #[test]
    fn cf_error_texts_map_to_structured_kinds() {
        assert_eq!(
            status_from_cf_error(
                "Cloudflare is blocking access to https://x. Shiori cannot bypass it automatically."
            ),
            Some(SourceError::CloudflareChallenge)
        );
        assert_eq!(
            status_from_cf_error("HTTP 429 from https://x after 3 retries"),
            Some(SourceError::RateLimited)
        );
        assert_eq!(
            status_from_cf_error("HTTP 404 from https://x after 3 retries"),
            Some(SourceError::NotFound)
        );
        assert_eq!(
            status_from_cf_error("Request failed after 3 retries: timed out"),
            Some(SourceError::Timeout)
        );
        assert_eq!(
            status_from_cf_error("operation timeout"),
            Some(SourceError::Timeout)
        );
        assert_eq!(status_from_cf_error("HTTP 9999 weird"), None);
        assert_eq!(status_from_cf_error("boom"), None);
        // A 200 after retries has no classification.
        assert_eq!(
            status_from_cf_error("HTTP 200 from https://x after 3 retries"),
            None
        );
    }
}
