/**
 * useFullscreen — shared hook for toggling OS-level fullscreen.
 *
 * Uses the Rust `toggle_fullscreen` IPC command rather than the JS
 * Tauri window API directly. The Rust side correctly calls
 * `set_always_on_top(true)` BEFORE `set_fullscreen(true)` so that on
 * Windows the window is promoted above the HWND_TOPMOST taskbar.
 *
 * Falls back gracefully when running outside of Tauri (browser dev mode).
 */
import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Sync initial state and listen for external changes (e.g. Escape key exits)
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return

    const appWindow = getCurrentWindow()
    let unlisten: (() => void) | undefined

    const sync = async () => {
      try {
        const full = await appWindow.isFullscreen()
        setIsFullscreen(full)
      } catch { /* ignore */ }
    }

    sync()

    appWindow.onResized(sync)
      .then(u => { unlisten = u })
      .catch(() => { /* ignore */ })

    return () => { unlisten?.() }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!window.__TAURI_INTERNALS__) return
    try {
      // Call the Rust command which handles set_always_on_top BEFORE set_fullscreen
      const nowFull = await invoke<boolean>('toggle_fullscreen')
      setIsFullscreen(nowFull)
    } catch (err) {
      console.error('toggle_fullscreen failed:', err)
    }
  }, [])

  return { isFullscreen, toggleFullscreen }
}
