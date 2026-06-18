use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use regex::Regex;
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

static PERCENT_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)(\d{1,3})(?:\.\d+)?%").expect("valid percent regex"));

#[derive(Debug, Clone)]
pub struct CalibreSettings {
    pub enabled: bool,
    pub path: Option<String>,
    pub timeout_sec: u64,
}

#[derive(Debug, Clone, Copy)]
pub enum CalibreProfile {
    TxtRtf,
    GenericBook,
    Pdf,
}

#[derive(Debug, Error)]
pub enum CalibreError {
    #[error("Calibre conversion is disabled")]
    Disabled,

    #[error("Calibre executable not found")]
    NotFound,

    #[error("Invalid Calibre executable path")]
    InvalidPath,

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Calibre conversion timed out")]
    Timeout,

    #[error("Calibre conversion failed: {0}")]
    Failed(String),

    #[error("Calibre conversion cancelled")]
    Cancelled,
}

pub async fn fetch_settings(db: &crate::db::Database) -> Result<CalibreSettings, CalibreError> {
    let conn = db
        .get_connection()
        .map_err(|e| CalibreError::Failed(format!("Failed to get DB connection: {}", e)))?;

    let defaults = CalibreSettings {
        enabled: true,
        path: None,
        timeout_sec: 300,
    };

    let result: rusqlite::Result<(Option<i64>, Option<String>, Option<i64>)> = conn.query_row(
        "SELECT calibre_enabled, calibre_path, calibre_timeout_sec FROM conversion_settings WHERE id = 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    );

    let settings = match result {
        Ok((enabled_raw, path_raw, timeout_raw)) => {
            let enabled = enabled_raw.unwrap_or(1) != 0;
            let path = path_raw.and_then(|p| {
                let trimmed = p.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            });
            let timeout_sec = timeout_raw
                .and_then(|v| if v > 0 { Some(v as u64) } else { None })
                .unwrap_or(defaults.timeout_sec);

            CalibreSettings {
                enabled,
                path,
                timeout_sec,
            }
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => defaults,
        Err(_) => defaults,
    };

    Ok(settings)
}

pub async fn is_available(db: &crate::db::Database) -> bool {
    let settings = match fetch_settings(db).await {
        Ok(s) => s,
        Err(_) => return false,
    };

    if !settings.enabled {
        return false;
    }

    let executable = match resolve_executable(&settings) {
        Ok(path) => path,
        Err(_) => return false,
    };

    match Command::new(executable)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
    {
        Ok(status) => status.success(),
        Err(_) => false,
    }
}

pub async fn convert_to_epub(
    source: &Path,
    target: &Path,
    db: &crate::db::Database,
    profile: CalibreProfile,
    cancel_check: impl Fn() -> bool + Send + Sync,
    progress_cb: Option<impl Fn(u8, &str) + Send + Sync>,
) -> Result<(), CalibreError> {
    let settings = fetch_settings(db).await?;
    if !settings.enabled {
        return Err(CalibreError::Disabled);
    }

    let executable = resolve_executable(&settings)?;

    if !source.exists() {
        return Err(CalibreError::NotFound);
    }

    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            return Err(CalibreError::InvalidPath);
        }
    }

    let mut cmd = Command::new(&executable);
    cmd.arg(source)
        .arg(target)
        .arg("--output-profile")
        .arg("generic_eink_hd")
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    match profile {
        CalibreProfile::TxtRtf => {}
        CalibreProfile::GenericBook => {
            cmd.arg("--enable-heuristics");
        }
        CalibreProfile::Pdf => {
            cmd.arg("--pdf-engine").arg("calibre");
        }
    }

    let mut child = cmd.spawn().map_err(map_spawn_error)?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| CalibreError::Failed("Failed to capture Calibre stderr".to_string()))?;

    emit_progress(progress_cb.as_ref(), 15, "Starting Calibre conversion");

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let mut stderr_reader = BufReader::new(stderr).lines();
    let read_task = tokio::spawn(async move {
        while let Ok(Some(line)) = stderr_reader.next_line().await {
            if tx.send(line).is_err() {
                break;
            }
        }
    });

    let mut last_progress = 15u8;
    let mut stderr_tail: VecDeque<String> = VecDeque::with_capacity(30);
    let timeout = Duration::from_secs(settings.timeout_sec.max(1));
    let started_at = Instant::now();

    loop {
        tokio::select! {
            maybe_line = rx.recv() => {
                if let Some(line) = maybe_line {
                    push_tail(&mut stderr_tail, line.clone());
                    if let Some((p, msg)) = parse_progress_from_line(&line) {
                        if p > last_progress {
                            last_progress = p;
                            emit_progress(progress_cb.as_ref(), p, msg);
                        }
                    }
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(250)) => {}
        }

        if cancel_check() {
            let _ = child.kill().await;
            let _ = child.wait().await;
            read_task.abort();
            return Err(CalibreError::Cancelled);
        }

        if started_at.elapsed() > timeout {
            let _ = child.kill().await;
            let _ = child.wait().await;
            read_task.abort();
            return Err(CalibreError::Timeout);
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                let _ = tokio::time::timeout(Duration::from_millis(250), read_task).await;

                if status.success() {
                    if last_progress < 90 {
                        emit_progress(progress_cb.as_ref(), 90, "Finalizing output");
                    }
                    emit_progress(progress_cb.as_ref(), 100, "Conversion complete");
                    return Ok(());
                }

                let snippet = stderr_snippet(&stderr_tail)
                    .unwrap_or_else(|| format!("Calibre exited with status: {}", status));
                return Err(CalibreError::Failed(snippet));
            }
            Ok(None) => {}
            Err(e) => {
                read_task.abort();
                return Err(CalibreError::Io(e));
            }
        }
    }
}

fn resolve_executable(settings: &CalibreSettings) -> Result<PathBuf, CalibreError> {
    if let Some(path) = &settings.path {
        let configured = PathBuf::from(path);
        if !configured.exists() || configured.is_dir() {
            return Err(CalibreError::InvalidPath);
        }
        return Ok(configured);
    }

    Ok(PathBuf::from("ebook-convert"))
}

fn map_spawn_error(err: std::io::Error) -> CalibreError {
    if err.kind() == std::io::ErrorKind::NotFound {
        CalibreError::NotFound
    } else {
        CalibreError::Io(err)
    }
}

fn emit_progress(progress_cb: Option<&impl Fn(u8, &str)>, pct: u8, msg: &str) {
    if let Some(cb) = progress_cb {
        cb(pct, msg);
    }
}

fn push_tail(tail: &mut VecDeque<String>, line: String) {
    if tail.len() >= 25 {
        tail.pop_front();
    }
    tail.push_back(line);
}

fn stderr_snippet(tail: &VecDeque<String>) -> Option<String> {
    if tail.is_empty() {
        return None;
    }
    let joined = tail
        .iter()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" | ");
    if joined.is_empty() {
        None
    } else {
        Some(joined)
    }
}

fn parse_progress_from_line(line: &str) -> Option<(u8, &str)> {
    if let Some(caps) = PERCENT_RE.captures(line) {
        let raw = caps.get(1)?.as_str().parse::<u8>().ok()?.min(100);
        let scaled = 15u8 + ((raw as u16 * 75) / 100) as u8;
        return Some((scaled.min(90), "Converting with Calibre"));
    }

    let lower = line.to_lowercase();
    if lower.contains("input") || lower.contains("read") {
        return Some((20, "Reading input"));
    }
    if lower.contains("parse") || lower.contains("structure") {
        return Some((35, "Parsing document"));
    }
    if lower.contains("heuristic") || lower.contains("transform") {
        return Some((55, "Applying conversion heuristics"));
    }
    if lower.contains("write") || lower.contains("output") {
        return Some((75, "Writing output"));
    }
    if lower.contains("finished") || lower.contains("done") {
        return Some((90, "Conversion complete"));
    }

    None
}
