#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{oneshot, Mutex};

use crate::cloudflare::browser::BrowserConfig;
use crate::error::{Result, ShioriError};

#[derive(Serialize)]
struct Request {
    id: usize,
    method: String,
    params: Value,
}

#[derive(Deserialize)]
struct Response {
    id: Option<usize>,
    result: Option<Value>,
    ready: Option<bool>,
}

pub struct BrowserDaemon {
    next_id: AtomicUsize,
    sender: tokio::sync::mpsc::Sender<(Request, oneshot::Sender<Result<Value>>)>,
    /// The spawned node process. Taken and killed on Drop (best-effort); the
    /// writer task also reaps it when stdin closes.
    child: Arc<tokio::sync::Mutex<Option<tokio::process::Child>>>,
}

impl Drop for BrowserDaemon {
    fn drop(&mut self) {
        // Best-effort kill on shutdown: the daemon is a node process with a
        // Playwright browser behind it — leaving it running would orphan
        // Chromium on every app exit.
        if let Ok(mut guard) = self.child.try_lock() {
            if let Some(mut child) = guard.take() {
                if let Err(e) = child.start_kill() {
                    log::warn!("[BrowserDaemon] Failed to kill daemon process: {}", e);
                } else {
                    log::info!("[BrowserDaemon] Daemon process killed on drop");
                    // Reap so the process doesn't linger as a zombie.
                    tauri::async_runtime::spawn(async move {
                        let _ = child.wait().await;
                    });
                }
            }
        }
    }
}

impl BrowserDaemon {
    pub async fn start(cfg: &BrowserConfig) -> Result<Arc<Self>> {
        let script = include_str!("../../scripts/cf_daemon.mjs");

        let mut cmd = Command::new("node");
        cmd.arg("--input-type=module")
            .arg("--eval")
            .arg(script)
            .current_dir(&cfg.playwright_root)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit());

        // Forward display variables just in case
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

        let mut child = cmd
            .spawn()
            .map_err(|e| ShioriError::Other(format!("Failed to spawn daemon: {e}")))?;

        let mut stdin = match child.stdin.take() {
            Some(s) => s,
            None => {
                return Err(ShioriError::Other(
                    "Failed to take daemon stdin (piped stdin was not created)".into(),
                ))
            }
        };
        let stdout = match child.stdout.take() {
            Some(s) => s,
            None => {
                return Err(ShioriError::Other(
                    "Failed to take daemon stdout (piped stdout was not created)".into(),
                ))
            }
        };

        // Shared handle so the writer task (stdin close) and Drop can both
        // reap/kill the child.
        let child_holder = Arc::new(tokio::sync::Mutex::new(Some(child)));

        let mut reader = BufReader::new(stdout).lines();

        // Wait for ready state from daemon script
        if let Some(line) = reader
            .next_line()
            .await
            .map_err(|_| ShioriError::Other("EOF before ready".into()))?
        {
            if let Ok(resp) = serde_json::from_str::<Response>(&line) {
                if resp.ready != Some(true) {
                    return Err(ShioriError::Other(format!(
                        "Unexpected output before ready: {}",
                        line
                    )));
                }
            } else {
                return Err(ShioriError::Other(format!("Failed to parse ready: {}", line)));
            }
        }

        let (tx, mut rx) = tokio::sync::mpsc::channel::<(Request, oneshot::Sender<Result<Value>>)>(32);
        let pending_requests = Arc::new(Mutex::new(HashMap::<usize, oneshot::Sender<Result<Value>>>::new()));

        let pending_clone = pending_requests.clone();
        tokio::spawn(async move {
            while let Ok(Some(line)) = reader.next_line().await {
                if let Ok(resp) = serde_json::from_str::<Response>(&line) {
                    if let Some(id) = resp.id {
                        let mut pending = pending_clone.lock().await;
                        if let Some(cb) = pending.remove(&id) {
                            let _ = cb.send(Ok(resp.result.unwrap_or(Value::Null)));
                        }
                    }
                }
            }
        });

        let pending_clone2 = pending_requests.clone();
        let child_for_reaper = child_holder.clone();
        tokio::spawn(async move {
            while let Some((req, cb)) = rx.recv().await {
                let id = req.id;
                pending_clone2.lock().await.insert(id, cb);

                let line = serde_json::to_string(&req).unwrap() + "\n";
                if let Err(e) = stdin.write_all(line.as_bytes()).await {
                    let mut pending = pending_clone2.lock().await;
                    if let Some(cb) = pending.remove(&id) {
                        let _ = cb.send(Err(ShioriError::Other(format!(
                            "Failed to write to daemon: {}",
                            e
                        ))));
                    }
                    break;
                }
            }
            drop(stdin);
            // stdin closed (daemon died or we're shutting down): reap the
            // child process so it doesn't linger as a zombie.
            let holder = child_for_reaper;
            tokio::spawn(async move {
                if let Some(mut child) = holder.lock().await.take() {
                    let _ = child.wait().await;
                }
            });
        });

        Ok(Arc::new(Self {
            next_id: AtomicUsize::new(1),
            sender: tx,
            child: child_holder,
        }))
    }

    pub async fn fetch(&self, url: &str, params: Option<Value>) -> Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);

        let req = Request {
            id,
            method: "fetch".to_string(),
            params: serde_json::json!({
                "url": url,
                "params": params.unwrap_or(Value::Null)
            }),
        };

        let (tx, rx) = oneshot::channel();
        self.sender
            .send((req, tx))
            .await
            .map_err(|_| ShioriError::Other("Daemon is dead".into()))?;

        let resp = rx
            .await
            .map_err(|_| ShioriError::Other("Daemon closed channel".into()))??;

        if let Some(err) = resp.get("error") {
            return Err(ShioriError::Other(format!(
                "Daemon fetch error: {}",
                err.as_str().unwrap_or("unknown")
            )));
        }

        Ok(resp.get("data").cloned().unwrap_or(Value::Null))
    }
}
