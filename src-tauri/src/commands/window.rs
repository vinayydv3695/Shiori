/// window.rs — Tauri commands for OS-level window management.
///
/// On Windows, a `decorations(false)` window (WS_POPUP style) does NOT
/// automatically cover the taskbar when `set_fullscreen(true)` is called,
/// because tao's `SetWindowPos` uses `SWP_NOZORDER` and the taskbar sits at
/// `HWND_TOPMOST`. We must promote the window to TOPMOST **before** entering
/// fullscreen, then drop back to normal z-order when exiting.
use tauri::{AppHandle, Manager, Runtime};

#[tauri::command]
pub async fn toggle_fullscreen<R: Runtime>(_app: AppHandle<R>) -> Result<bool, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let window = _app
            .get_webview_window("main")
            .ok_or_else(|| "Main window not found".to_string())?;

        let is_full = window
            .is_fullscreen()
            .map_err(|e| e.to_string())?;

        if !is_full {
            // Step 1: promote to TOPMOST so we are above the taskbar
            window
                .set_always_on_top(true)
                .map_err(|e| e.to_string())?;
            // Step 2: enter fullscreen (SetWindowPos now covers taskbar)
            window
                .set_fullscreen(true)
                .map_err(|e| e.to_string())?;
        } else {
            // Step 1: exit fullscreen first
            window
                .set_fullscreen(false)
                .map_err(|e| e.to_string())?;
            // Step 2: drop TOPMOST so dialogs / other apps can focus normally
            window
                .set_always_on_top(false)
                .map_err(|e| e.to_string())?;
        }

        Ok(!is_full)
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        // Fullscreen not supported via tauri webview window api on mobile in this way
        Ok(false)
    }
}

#[tauri::command]
pub fn get_fullscreen_state<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    window.is_fullscreen().map_err(|e| e.to_string())
}
