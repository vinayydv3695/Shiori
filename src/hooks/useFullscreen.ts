/**
 * useFullscreen — shared hook for toggling OS-level fullscreen.
 *
 * Desktop (Tauri): Uses the Rust `toggle_fullscreen` IPC command which calls
 * `set_always_on_top(true)` BEFORE `set_fullscreen(true)` so that on Windows
 * the window is promoted above the HWND_TOPMOST taskbar.
 *
 * Mobile / Browser: Falls back to the standard browser Fullscreen API
 * (`document.documentElement.requestFullscreen`) with vendor-prefix support
 * for older iOS WebKit.
 */
import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
  interface Document {
    webkitFullscreenElement?: Element | null
    webkitExitFullscreen?: () => Promise<void>
  }
  interface HTMLElement {
    webkitRequestFullscreen?: () => Promise<void>
  }
}

/** True when the browser Fullscreen API is available (not Tauri). */
function browserFullscreenAvailable() {
  return !window.__TAURI_INTERNALS__ && (
    document.documentElement.requestFullscreen !== undefined ||
    document.documentElement.webkitRequestFullscreen !== undefined
  )
}

function isBrowserFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement)
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── Tauri: sync state from OS window ──────────────────────────────────
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

  // ── Browser: sync state from Fullscreen API events ─────────────────────
  useEffect(() => {
    if (!browserFullscreenAvailable()) return

    const onFSChange = () => setIsFullscreen(isBrowserFullscreen())
    document.addEventListener('fullscreenchange', onFSChange)
    document.addEventListener('webkitfullscreenchange', onFSChange)

    // Sync initial state
    setIsFullscreen(isBrowserFullscreen())

    return () => {
      document.removeEventListener('fullscreenchange', onFSChange)
      document.removeEventListener('webkitfullscreenchange', onFSChange)
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    // ── Tauri path ──────────────────────────────────────────────────────
    if (window.__TAURI_INTERNALS__) {
      try {
        const nowFull = await invoke<boolean>('toggle_fullscreen')
        setIsFullscreen(nowFull)
      } catch (err) {
        console.error('toggle_fullscreen failed:', err)
      }
      return
    }

    // ── Browser / Mobile path ───────────────────────────────────────────
    if (!browserFullscreenAvailable()) return

    try {
      if (isBrowserFullscreen()) {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen()
        }
        setIsFullscreen(false)
      } else {
        const el = document.documentElement
        if (el.requestFullscreen) {
          await el.requestFullscreen()
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen()
        }
        setIsFullscreen(true)
      }
    } catch (err) {
      console.error('browser fullscreen failed:', err)
    }
  }, [])

  return { isFullscreen, toggleFullscreen }
}

