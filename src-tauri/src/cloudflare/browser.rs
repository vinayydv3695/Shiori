/// Cloudflare challenge solver via Playwright.
///
/// # How it works
///
/// 1. Spawn a real Chromium browser using `playwright` (already installed).
/// 2. Navigate to the target URL.
/// 3. Poll for either:
///    - Disappearance of the "Just a moment" / "Checking your browser" text, OR
///    - Presence of expected page content (customisable selector).
/// 4. Extract all cookies + the actual User-Agent string.
/// 5. Shut the browser down and return the captured data.
///
/// ## Headless → Visible fallback
///
/// Cloudflare's JS challenge can sometimes detect headless Chromium via subtle
/// DOM/timing differences.  We first try `--headless=new` (Chrome's modern
/// headless mode, harder to detect than the old `--headless`).  If we still
/// get a block after the timeout, we retry in *fully visible* mode so the user
/// can optionally solve a CAPTCHA if required.
///
/// ## Why not Puppeteer / Playwright-Rust?
///
/// Playwright's official binding is Node.js-based.  We drive it from Rust by
/// spawning a lightweight Node.js helper script via `std::process::Command` /
/// `tokio::process::Command`.  This is exactly how Tauri shell commands work,
/// so it fits naturally into the Shiori architecture.  The alternative (FFI to
/// a Playwright Rust crate) is experimental and not production-ready.

use std::{path::PathBuf, time::Duration};

use serde::{Deserialize, Serialize};
use tokio::time::timeout;

use crate::cloudflare::session::{CfSession, StoredCookie};
use crate::error::{Result, ShioriError};

// ─── Configuration ────────────────────────────────────────────────────────────

/// Browser launch configuration.
#[derive(Debug, Clone)]
#[allow(dead_code)] // Public API — fields used by callers outside this crate
pub struct BrowserConfig {
    /// Directory that contains the `node_modules/.bin/` with Playwright.
    /// Defaults to the Shiori project root discovered at compile time.
    pub playwright_root: PathBuf,
    /// Directory to write the ephemeral browser profile to.
    /// Defaults to `<tmp>/shiori_cf_profile_<host>`.
    pub user_data_dir: Option<PathBuf>,
    /// Whether to try headless mode first (then fall back to visible).
    #[allow(dead_code)]
    pub try_headless_first: bool,
    /// How long (total) to wait for the CF challenge to resolve.
    #[allow(dead_code)]
    pub challenge_timeout: Duration,
    /// Maximum time per navigation attempt.
    #[allow(dead_code)]
    pub nav_timeout: Duration,
    /// Print verbose browser output to stdout (for `SHIORI_CF_DEBUG=1`).
    #[allow(dead_code)]
    pub debug: bool,
}

impl Default for BrowserConfig {
    fn default() -> Self {
        let debug = std::env::var("SHIORI_CF_DEBUG")
            .map(|v| matches!(v.trim(), "1" | "true"))
            .unwrap_or(false);

        Self {
            playwright_root: default_playwright_root(),
            user_data_dir: None,
            // Headless Chromium is reliably fingerprinted by Cloudflare.
            // Use visible mode (system Chrome) as the primary strategy.
            try_headless_first: false,
            challenge_timeout: Duration::from_secs(90),
            nav_timeout: Duration::from_secs(30),
            debug,
        }
    }
}

fn default_playwright_root() -> PathBuf {
    // Try the Shiori project root first (works in dev).
    // Fall back to the current working directory.
    if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
        PathBuf::from(manifest).parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(".")
    }
}

// ─── Solver result ────────────────────────────────────────────────────────────

/// Data returned after successfully solving the CF challenge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolverOutput {
    pub cookies: Vec<StoredCookie>,
    pub user_agent: String,
    pub final_url: String,
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/// Solve the Cloudflare challenge for `url` and return the captured session.
///
/// This function:
///  1. Writes a temporary Node.js helper script to disk.
///  2. Spawns `node` with the script.
///  3. Reads the JSON output from stdout.
///  4. Packages the result into a [`CfSession`].
pub async fn solve(url: &str, host: &str, cfg: &BrowserConfig) -> Result<CfSession> {
    // Write the helper script to a temp file.
    let script_path = write_helper_script().await?;

    log::info!("[CF Browser] Attempting to solve CF for {url}");

    // Try headless first, then visible fallback.
    let modes: &[bool] = if cfg.try_headless_first {
        &[true, false]
    } else {
        &[false]
    };

    let mut last_error = String::new();

    for &headless in modes {
        let mode_label = if headless { "headless" } else { "visible" };
        log::info!("[CF Browser] Trying {mode_label} mode for {url}");

        match run_browser_script(&script_path, url, headless, cfg).await {
            Ok(output) => {
                let session = build_session(host, output)?;
                log::info!(
                    "[CF Browser] ✓ Solved in {mode_label} mode — captured {} cookies",
                    session.cookies.len()
                );
                // Clean up temp script.
                let _ = tokio::fs::remove_file(&script_path).await;
                return Ok(session);
            }
            Err(e) => {
                log::warn!("[CF Browser] {mode_label} mode failed: {e}");
                last_error = e.to_string();
                // Wait a moment before switching modes.
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }

    let _ = tokio::fs::remove_file(&script_path).await;
    Err(ShioriError::Other(format!(
        "Cloudflare solver failed for {url}: {last_error}"
    )))
}

// ─── Browser script runner ────────────────────────────────────────────────────

async fn run_browser_script(
    script_path: &PathBuf,
    url: &str,
    headless: bool,
    cfg: &BrowserConfig,
) -> Result<SolverOutput> {
    let timeout_secs = cfg.challenge_timeout.as_secs();

    // Build the command with display environment forwarded.
    // Tauri apps may strip these from the child process environment on Linux.
    let mut cmd = tokio::process::Command::new("node");
    cmd.arg(script_path)
        .arg(url)
        .arg(if headless { "headless" } else { "visible" })
        .arg(timeout_secs.to_string())
        .current_dir(&cfg.playwright_root)
        .stdout(std::process::Stdio::piped())
        .stderr(if cfg.debug {
            std::process::Stdio::inherit()
        } else {
            std::process::Stdio::piped()
        });

    // Forward display-related environment variables so the visible browser
    // can render a window even when launched from a Tauri background thread.
    for var in &[
        "DISPLAY",
        "WAYLAND_DISPLAY",
        "XDG_RUNTIME_DIR",
        "XDG_SESSION_TYPE",
        "DBUS_SESSION_BUS_ADDRESS",
        "XDG_CURRENT_DESKTOP",
        "HOME",
        "PATH",
    ] {
        if let Ok(val) = std::env::var(var) {
            cmd.env(var, val);
        }
    }

    // Always force DISPLAY to :1 as a fallback if not set (common in desktops).
    if std::env::var("DISPLAY").is_err() {
        cmd.env("DISPLAY", ":1");
    }

    let output = timeout(
        cfg.challenge_timeout + Duration::from_secs(15), // grace period
        cmd.output(),
    )
    .await
    .map_err(|_| ShioriError::Other("Browser solver timed out".to_string()))?
    .map_err(|e| ShioriError::Other(format!("Failed to spawn node: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ShioriError::Other(format!(
            "Browser script exited with {}: {}",
            output.status,
            stderr.trim().lines().last().unwrap_or("(no stderr)")
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // Find the last line that starts with `{` — that's our JSON payload.
    let json_line = stdout
        .lines()
        .filter(|l| l.trim_start().starts_with('{'))
        .last()
        .ok_or_else(|| {
            ShioriError::Other(format!(
                "Browser script produced no JSON output.\nstdout: {}",
                stdout.trim()
            ))
        })?;

    serde_json::from_str::<SolverOutput>(json_line)
        .map_err(|e| ShioriError::Other(format!("Failed to parse solver JSON: {e}\nRaw: {json_line}")))
}

// ─── Build CfSession from raw output ─────────────────────────────────────────

fn build_session(host: &str, output: SolverOutput) -> Result<CfSession> {
    if output.user_agent.is_empty() {
        return Err(ShioriError::Other(
            "Browser script returned an empty User-Agent".to_string(),
        ));
    }
    // Note: we don't hard-require cf_clearance here because the solver script
    // already validates it and exits 0 only on success.  If cookies is empty
    // AND user_agent is set, the script succeeded (rare CF config that omits cookie).
    if output.cookies.is_empty() {
        return Err(ShioriError::Other(
            "Browser script returned no cookies. CF Turnstile was not solved. \
             Try again — if a CAPTCHA checkbox appeared, click it.".to_string(),
        ));
    }

    Ok(CfSession::new(host, output.cookies, output.user_agent))
}


// ─── Playwright helper script ─────────────────────────────────────────────────

/// Write the Node.js Playwright helper to a temporary file and return its path.
async fn write_helper_script() -> Result<PathBuf> {
    let tmp_dir = std::env::temp_dir();
    let script_path = tmp_dir.join("shiori_cf_solver.mjs");

    let script = include_str!("../../scripts/cf_solver.mjs");
    tokio::fs::write(&script_path, script)
        .await
        .map_err(|e| ShioriError::Other(format!("Failed to write CF solver script: {e}")))?;

    Ok(script_path)
}
