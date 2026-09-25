/// Cloudflare challenge solver via Playwright.
///
/// # How it works
///
/// 1. Spawn a real Chromium browser using `playwright` (already installed).
/// 2. Navigate to the target URL (fully VISIBLE — no headless mode).
/// 3. Poll for either:
///    - Disappearance of the "Just a moment" / "Checking your browser" text, OR
///    - Presence of expected page content (customisable selector).
/// 4. Extract all cookies + the actual User-Agent string.
/// 5. Shut the browser down and return the captured data.
///
/// ## Security posture
///
/// This is a USER-INITIATED solve only (`cf_solve` Settings button). There is
/// no automation: no stealth flags, no auto-clicks, no headless harvesting.
/// The user completes any verification themselves in the visible window.
///
/// ## Why not Puppeteer / Playwright-Rust?
///
/// Playwright's official binding is Node.js-based.  We drive it from Rust by
/// spawning a lightweight Node.js helper script via `std::process::Command` /
/// `tokio::process::Command`.  This is exactly how Tauri shell commands work,
/// so it fits naturally into the Shiori architecture.  The alternative (FFI to
/// a Playwright Rust crate) is experimental and not production-ready.
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::AsyncReadExt;
use tokio::time::timeout;

use crate::cloudflare::session::{CfSession, StoredCookie};
use crate::error::{Result, ShioriError};

// ─── Configuration ────────────────────────────────────────────────────────────

/// Browser launch configuration.
#[derive(Debug, Clone)]
#[allow(dead_code)] // Public API — fields used by callers outside this crate
pub struct BrowserConfig {
    /// Directory that contains `node_modules/playwright`. Discovered at
    /// runtime: `SHIORI_PLAYWRIGHT_ROOT`, the repo checkout, upward walks
    /// from the executable and the cwd, then `~/.cache/shiori/playwright-solver`.
    pub playwright_root: PathBuf,
    /// Directory to write the ephemeral browser profile to.
    /// Defaults to `<tmp>/shiori_cf_profile_<host>`.
    pub user_data_dir: Option<PathBuf>,
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
            playwright_root: find_playwright_root(),
            user_data_dir: None,
            // Visible-only solve: no headless mode exists anymore.
            challenge_timeout: Duration::from_secs(90),
            nav_timeout: Duration::from_secs(30),
            debug,
        }
    }
}

/// Locate the directory containing a Playwright install (`node_modules/playwright`).
///
/// Search order (first hit wins):
///   1. `SHIORI_PLAYWRIGHT_ROOT` env var.
///   2. The compile-time dev path: `CARGO_MANIFEST_DIR`'s parent (the repo
///      root) — but only if it still exists AND contains `node_modules/playwright`.
///      (`CARGO_MANIFEST_DIR` is baked in at build time; `std::env::var` for it
///      always fails at runtime, which is why the old code fell back to `.`.)
///   3. An upward walk from the current executable (covers
///      `src-tauri/target/{debug,release}/...` binaries in dev checkouts).
///   4. The same upward walk from the current working directory.
///   5. `$HOME/.cache/shiori/playwright-solver` (documented manual install spot).
///   6. Current directory (status quo fallback).
fn find_playwright_root() -> PathBuf {
    // 1. Explicit override.
    if let Ok(dir) = std::env::var("SHIORI_PLAYWRIGHT_ROOT") {
        let dir = PathBuf::from(dir);
        if has_playwright(&dir) {
            return dir;
        }
    }

    // 2. Compile-time dev path (CARGO_MANIFEST_DIR exists only at build time).
    if let Some(manifest) = option_env!("CARGO_MANIFEST_DIR") {
        if let Some(parent) = PathBuf::from(manifest).parent() {
            let root = parent.to_path_buf();
            if has_playwright(&root) {
                return root;
            }
        }
    }

    // 3. Walk up from the running binary (dev: target/{debug,release}/...).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(root) = walk_up_for_playwright(&exe) {
            return root;
        }
    }

    // 4. Walk up from the current working directory.
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(root) = walk_up_for_playwright(&cwd) {
            return root;
        }
    }

    // 5. Documented user install location.
    if let Some(home) = std::env::var_os("HOME") {
        let dir = PathBuf::from(home).join(".cache/shiori/playwright-solver");
        if has_playwright(&dir) {
            return dir;
        }
    }

    // 6. Status quo fallback.
    PathBuf::from(".")
}

/// True if `dir` exists and contains a Playwright install under `node_modules/`.
fn has_playwright(dir: &Path) -> bool {
    dir.is_dir() && dir.join("node_modules").join("playwright").is_dir()
}

/// Walk upward from `start` (at most [`MAX_WALK_LEVELS`] levels) looking for a
/// directory that contains `node_modules/playwright`. Pure helper — unit-tested.
fn walk_up_for_playwright(start: &Path) -> Option<PathBuf> {
    const MAX_WALK_LEVELS: usize = 8;

    let mut dir = start.to_path_buf();
    for _ in 0..=MAX_WALK_LEVELS {
        if has_playwright(&dir) {
            return Some(dir);
        }
        match dir.parent() {
            Some(parent) if parent != dir => dir = parent.to_path_buf(),
            _ => break,
        }
    }
    None
}

/// Error surfaced when no Node.js binary can be found on desktop.
const NODE_MISSING_MSG: &str = "Cloudflare solve requires Node.js on desktop. \
    Install Node and run \"npm i -g playwright\" (or \"npm install playwright\" \
    in ~/.cache/shiori/playwright-solver), then retry. On Android this is handled natively.";

/// Resolve an absolute path to a Node.js binary.
///
/// Searches `PATH` for `node`/`nodejs`, then known install locations in
/// priority order: mise shims, mise installs, nvm versions, asdf shims,
/// `/usr/local/bin`, `/usr/bin`, `/opt/homebrew/bin`, volta. Returns `None`
/// if nothing usable is found. Never relies on bare `Command::new("node")`.
fn find_node() -> Option<PathBuf> {
    // 1. PATH lookup.
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            for name in ["node", "nodejs"] {
                let candidate = dir.join(name);
                if is_executable_file(&candidate) {
                    return Some(candidate);
                }
            }
        }
    }

    // 2. Known locations, in priority order (first hit wins).
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(h) = &home {
        candidates.push(h.join(".local/share/mise/shims/node"));
    }
    if let Some(h) = &home {
        if let Some(node) = find_in_versioned_root(&h.join(".local/share/mise/installs/node")) {
            candidates.push(node);
        }
    }
    if let Some(h) = &home {
        if let Some(node) = find_in_versioned_root(&h.join(".nvm/versions/node")) {
            candidates.push(node);
        }
    }
    if let Some(h) = &home {
        candidates.push(h.join(".asdf/shims/node"));
    }
    candidates.push(PathBuf::from("/usr/local/bin/node"));
    candidates.push(PathBuf::from("/usr/bin/node"));
    candidates.push(PathBuf::from("/opt/homebrew/bin/node"));
    if let Some(h) = &home {
        candidates.push(h.join(".volta/bin/node"));
    }

    first_executable(candidates)
}

/// Search `<root>/<version>/bin/node` for any installed Node version.
fn find_in_versioned_root(root: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let candidate = entry.path().join("bin").join("node");
        if is_executable_file(&candidate) {
            return Some(candidate);
        }
    }
    None
}

fn first_executable(iter: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    iter.into_iter().find(|c| is_executable_file(c))
}

/// True if `path` is a file with the executable bit set (Unix) / a file otherwise.
fn is_executable_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(path) {
            return meta.permissions().mode() & 0o111 != 0;
        }
    }
    true
}

/// Last `n` lines of `text` (for surfacing solver errors to the user).
fn tail(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(n);
    lines[start..].join("\n")
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
///  2. Spawns `node` with the script (visible browser, no automation).
///  3. Reads the JSON output from stdout.
///  4. Packages the result into a [`CfSession`].
pub async fn solve(url: &str, host: &str, cfg: &BrowserConfig, #[allow(unused_variables)] app_handle: Option<&tauri::AppHandle>) -> Result<CfSession> {
    log::info!("[CF Browser] Attempting visible solve for {url}");

    #[cfg(target_os = "android")]
    if let Some(app) = app_handle {
        use tauri_plugin_android_saf::AndroidSafExt;
        log::info!("[CF Browser] Trying Android WebView solver for {url}");
        match app.android_saf().solve_cloudflare(url.to_string()) {
            Ok(output) => {
                let cookies: Vec<StoredCookie> = output.cookies
                    .split(';')
                    .filter(|s| !s.trim().is_empty())
                    .map(|cookie_str| {
                        let parts: Vec<&str> = cookie_str.trim().splitn(2, '=').collect();
                        StoredCookie {
                            name: parts[0].to_string(),
                            value: parts.get(1).unwrap_or(&"").to_string(),
                            domain: host.to_string(),
                            path: "/".to_string(),
                            expires: 0,
                            http_only: false,
                            secure: true,
                            same_site: None,
                        }
                    })
                    .collect();
                
                let session = CfSession::new(host, cookies, output.user_agent);
                log::info!("[CF Browser] ✓ Solved on Android — captured cookies");
                return Ok(session);
            }
            Err(e) => {
                log::warn!("[CF Browser] Android WebView solver failed: {e}");
                return Err(ShioriError::Other(format!("Android CF solver failed for {url}: {e}")));
            }
        }
    }

    // Use the inline script via node --eval to avoid module resolution errors
    let script = include_str!("../../scripts/cf_solver.mjs");

    match run_browser_script(script, url, cfg, cfg.challenge_timeout.as_secs()).await {
        Ok(output) => {
            let session = build_session(host, output)?;
            log::info!(
                "[CF Browser] ✓ Visible solve — captured {} cookies",
                session.cookies.len()
            );
            Ok(session)
        }
        Err(e) => {
            log::warn!("[CF Browser] Visible solve failed: {e}");
            Err(ShioriError::Other(format!(
                "Cloudflare solver failed for {url}: {e}"
            )))
        }
    }
}

// ─── Browser script runner ────────────────────────────────────────────────────

async fn run_browser_script(
    script: &str,
    url: &str,
    cfg: &BrowserConfig,
    timeout_secs: u64,
) -> Result<SolverOutput> {
    // Resolve Node.js once — bare `Command::new("node")` fails on GUI
    // launches where the bare name is not on the (possibly minimal) PATH.
    let node = find_node().ok_or_else(|| ShioriError::Other(NODE_MISSING_MSG.to_string()))?;

    // Build the command with display environment forwarded.
    // Tauri apps may strip these from the child process environment on Linux.
    let mut cmd = tokio::process::Command::new(&node);
    cmd.arg("--input-type=module")
        .arg("--eval")
        .arg(script)
        .arg("dummy_pad") // pad process.argv[1] so indices match
        .arg(url)
        .arg("visible")
        .arg(timeout_secs.to_string())
        .current_dir(&cfg.playwright_root)
        .env("NODE_PATH", cfg.playwright_root.join("node_modules"))
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

    let total = Duration::from_secs(timeout_secs) + Duration::from_secs(15); // grace period

    let mut child = cmd
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| ShioriError::Other(format!("Failed to spawn {}: {e}", node.display())))?;

    // Drain both pipes while waiting (prevents pipe-buffer deadlocks). On
    // timeout the future is dropped and `kill_on_drop(true)` terminates the
    // browser; whatever stderr was captured is surfaced to the user.
    let mut stdout_bytes = Vec::new();
    let mut stderr_bytes = Vec::new();
    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();

    let read_stdout = async {
        if let Some(mut s) = stdout_pipe {
            let _ = s.read_to_end(&mut stdout_bytes).await;
        }
    };
    let read_stderr = async {
        if let Some(mut s) = stderr_pipe {
            let _ = s.read_to_end(&mut stderr_bytes).await;
        }
    };

    let (wait_result, _, _) = timeout(total, async {
        tokio::join!(child.wait(), read_stdout, read_stderr)
    })
    .await
    .map_err(|_| {
        let detail = solver_error_tail(&stderr_bytes, &stdout_bytes);
        let msg = format!("Browser solver timed out after {timeout_secs}s.\n{detail}");
        log::error!("[CF Browser] {msg}");
        ShioriError::Other(msg)
    })?;

    let status = wait_result
        .map_err(|e| ShioriError::Other(format!("Failed to wait for solver process: {e}")))?;

    if !status.success() {
        let detail = solver_error_tail(&stderr_bytes, &stdout_bytes);
        let msg = format!("Browser script exited with {status}:\n{detail}");
        log::error!("[CF Browser] {msg}");
        return Err(ShioriError::Other(msg));
    }

    let stdout = String::from_utf8_lossy(&stdout_bytes);
    // Find the last line that starts with `{` — that's our JSON payload.
    let json_line = stdout
        .lines()
        // `Lines` is double-ended: take the first `{`-opening line from the back
        // without scanning every line to the end.
        .rfind(|l| l.trim_start().starts_with('{'))
        .ok_or_else(|| {
            ShioriError::Other(format!(
                "Browser script produced no JSON output.\nstdout: {}",
                stdout.trim()
            ))
        })?;

    serde_json::from_str::<SolverOutput>(json_line).map_err(|e| {
        ShioriError::Other(format!(
            "Failed to parse solver JSON: {e}\nRaw: {json_line}"
        ))
    })
}

/// Last ~15 lines of the solver's stderr (stdout if stderr is empty).
fn solver_error_tail(stderr: &[u8], stdout: &[u8]) -> String {
    const LINES: usize = 15;
    let err = String::from_utf8_lossy(stderr);
    let detail = if !err.trim().is_empty() {
        tail(&err, LINES)
    } else {
        tail(&String::from_utf8_lossy(stdout), LINES)
    };
    detail.trim().to_string()
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
             Try again — if a CAPTCHA checkbox appeared, click it."
                .to_string(),
        ));
    }

    Ok(CfSession::new(host, output.cookies, output.user_agent))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Create a unique temp dir (std only — no tempfile crate dependency).
    fn tempdir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "shiori_cf_browser_test_{tag}_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Create a fake `node_modules/playwright` install under `base`.
    fn make_playwright_install(base: &Path) {
        let dir = base.join("node_modules").join("playwright");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("package.json"), "{}").unwrap();
    }

    #[test]
    fn has_playwright_detects_fake_install() {
        let root = tempdir("detect");
        make_playwright_install(&root);
        assert!(has_playwright(&root));

        let empty = tempdir("empty");
        assert!(!has_playwright(&empty));

        std::fs::remove_dir_all(&root).ok();
        std::fs::remove_dir_all(&empty).ok();
    }

    #[test]
    fn walk_up_finds_playwright_in_ancestor() {
        let root = tempdir("walk");
        make_playwright_install(&root);

        // Simulate a dev checkout: <repo>/src-tauri/target/debug/... binaries.
        let deep = root.join("src-tauri/target/debug");
        std::fs::create_dir_all(&deep).unwrap();

        // Walking up from a "binary" path finds the repo root.
        assert_eq!(
            walk_up_for_playwright(&deep.join("shiori")),
            Some(root.clone())
        );
        // Walking up from the build dir itself also finds it.
        assert_eq!(walk_up_for_playwright(&deep), Some(root.clone()));

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn walk_up_returns_none_when_playwright_missing() {
        let root = tempdir("none");
        std::fs::create_dir_all(root.join("a/b/c")).unwrap();

        assert_eq!(
            walk_up_for_playwright(&root.join("a/b/c/d")),
            None
        );

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn walk_up_terminates_at_filesystem_root() {
        // Must never loop forever, even for unrelated deep paths.
        let deep = std::env::temp_dir().join(format!(
            "shiori-no-such-dir-{}",
            std::process::id()
        ));
        assert_eq!(walk_up_for_playwright(&deep.join("x/y/z")), None);
    }

    #[test]
    fn tail_keeps_last_n_lines() {
        let text = "a\nb\nc\nd\ne";
        assert_eq!(tail(text, 3), "c\nd\ne");
        assert_eq!(tail(text, 99), text);
        assert_eq!(tail("", 5), "");
    }
}
