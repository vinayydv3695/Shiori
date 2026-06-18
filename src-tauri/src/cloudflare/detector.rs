/// Cloudflare challenge detector.
///
/// Detects whether an HTTP response is a Cloudflare interstitial page that
/// requires real-browser JS execution to solve.  Returns a typed enum so
/// callers can decide whether to retry, refresh, or give up.
use reqwest::StatusCode;

// ─── Detection result ────────────────────────────────────────────────────────

/// Why we think the response is a Cloudflare block.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CfBlock {
    /// "Just a moment…" JS challenge (most common).
    JsChallenge,
    /// Interactive CAPTCHA page (Turnstile / old hCaptcha).
    Captcha,
    /// HTTP 403 Forbidden with CF markers.
    Forbidden,
    /// HTTP 503 / 429 with CF markers.
    RateLimit,
    /// Expired / missing `cf_clearance` (server rejects the cookie value).
    ExpiredSession,
}

/// Result of inspecting an HTTP response.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verdict {
    /// The response is real content — no CF block detected.
    Ok,
    /// CF is blocking this request.
    Blocked(CfBlock),
}

// ─── Public API ──────────────────────────────────────────────────────────────

/// Inspect a response and return a [`Verdict`].
///
/// Call this on every response before you try to parse HTML.  If the verdict
/// is [`Verdict::Blocked`], discard the response and refresh the CF session.
pub fn inspect(status: StatusCode, body: &str) -> Verdict {
    // Fast path — common CF status codes.
    let code = status.as_u16();
    if code == 429 || code == 503 {
        if contains_cf_markers(body) {
            return Verdict::Blocked(CfBlock::RateLimit);
        }
    }
    if code == 403 && contains_cf_markers(body) {
        // Distinguish expired clearance from a generic 403.
        if body.contains("cf_clearance") || body.contains("Your IP has been banned") {
            return Verdict::Blocked(CfBlock::Forbidden);
        }
        return Verdict::Blocked(CfBlock::Forbidden);
    }

    // Body-based detection (works even when status == 200, which CF sometimes returns).
    let lo = body.to_ascii_lowercase();

    if is_js_challenge(&lo) {
        return Verdict::Blocked(CfBlock::JsChallenge);
    }
    if is_captcha(&lo) {
        return Verdict::Blocked(CfBlock::Captcha);
    }
    if is_expired_session(&lo) {
        return Verdict::Blocked(CfBlock::ExpiredSession);
    }

    Verdict::Ok
}

/// Convenience wrapper — returns `true` iff CF is blocking.
#[inline]
pub fn is_blocked(status: StatusCode, body: &str) -> bool {
    inspect(status, body) != Verdict::Ok
}

// ─── Internal helpers ────────────────────────────────────────────────────────

fn contains_cf_markers(body: &str) -> bool {
    let lo = body.to_ascii_lowercase();
    lo.contains("cloudflare")
        || lo.contains("cf-ray")
        || lo.contains("__cf_bm")
        || lo.contains("cf_clearance")
        || lo.contains("challenge-platform")
        || lo.contains("_cf_chl")
}

fn is_js_challenge(lo: &str) -> bool {
    // The "Just a moment" page always has these identifiers.
    (lo.contains("just a moment") || lo.contains("checking your browser"))
        && (lo.contains("cloudflare") || lo.contains("challenge-platform"))
        || lo.contains("enable javascript and cookies to continue")
        || lo.contains("cf-browser-verification")
        || lo.contains("_cf_chl_opt")
        || lo.contains("challenge-form")
}

fn is_captcha(lo: &str) -> bool {
    (lo.contains("captcha") || lo.contains("turnstile") || lo.contains("hcaptcha"))
        && lo.contains("cloudflare")
        || lo.contains("attention required") && lo.contains("cloudflare")
}

fn is_expired_session(lo: &str) -> bool {
    lo.contains("error 1020") // Access denied
        || (lo.contains("cf_clearance") && lo.contains("invalid"))
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_js_challenge() {
        let body = r#"<html><head><title>Just a moment...</title></head>
            <body>Checking your browser before accessing the site.
            cloudflare challenge-platform _cf_chl_opt</body></html>"#;
        assert_eq!(
            inspect(StatusCode::OK, body),
            Verdict::Blocked(CfBlock::JsChallenge)
        );
    }

    #[test]
    fn passes_normal_page() {
        let body = "<html><body><h1>Welcome to ToonGod</h1></body></html>";
        assert_eq!(inspect(StatusCode::OK, body), Verdict::Ok);
    }

    #[test]
    fn detects_403_rate_limit() {
        let body = "cloudflare cf-ray blocked";
        assert_eq!(
            inspect(StatusCode::FORBIDDEN, body),
            Verdict::Blocked(CfBlock::Forbidden)
        );
    }
}
