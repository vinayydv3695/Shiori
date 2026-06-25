import { useEffect, useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X, Copy, Maximize2, Minimize2 } from 'lucide-react'
import { useState } from 'react'
import { useFullscreen } from '@/hooks/useFullscreen'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)
  const { isFullscreen, toggleFullscreen } = useFullscreen()

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return

    const appWindow = getCurrentWindow()
    let unlisten: (() => void) | undefined

    const checkMax = async () => {
      try {
        const max = await appWindow.isMaximized()
        setIsMaximized(max)
      } catch { /* ignore */ }
    }

    checkMax()
    appWindow.onResized(checkMax)
      .then(u => { unlisten = u })
      .catch(() => { /* ignore */ })

    return () => { unlisten?.() }
  }, [])

  // F11 global shortcut
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'F11') {
      e.preventDefault()
      toggleFullscreen()
    }
  }, [toggleFullscreen])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!window.__TAURI_INTERNALS__) return null

  const handleMinimize = () => getCurrentWindow().minimize()
  const handleToggleMaximize = () => getCurrentWindow().toggleMaximize()
  const handleClose = () => getCurrentWindow().close()

  return (
    <div className="flex items-center space-x-1 pl-2 h-full shrink-0" data-tauri-drag-region>
      {!isFullscreen && (
        <>
          <button
            onClick={handleMinimize}
            className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-md text-muted-foreground hover:text-foreground transition-colors non-drag"
            title="Minimize"
            type="button"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleToggleMaximize}
            className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-md text-muted-foreground hover:text-foreground transition-colors non-drag"
            title={isMaximized ? 'Restore' : 'Maximize'}
            type="button"
          >
            {isMaximized ? <Copy size={13} className="rotate-180" /> : <Square size={13} />}
          </button>
        </>
      )}
      <button
        onClick={toggleFullscreen}
        className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-md text-muted-foreground hover:text-foreground transition-colors non-drag"
        title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Fullscreen (F11)'}
        type="button"
      >
        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
      <button
        onClick={handleClose}
        className="p-1.5 hover:bg-destructive hover:text-destructive-foreground rounded-md text-muted-foreground transition-colors non-drag"
        title="Close"
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  )
}
