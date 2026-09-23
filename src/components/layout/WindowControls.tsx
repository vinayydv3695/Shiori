import { useEffect, useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X, Copy, Maximize2, Minimize2 } from 'lucide-react'
import { useState } from 'react'
import { useFullscreen } from '@/hooks/useFullscreen'
import { AppTooltip } from '@/components/ui/tooltip'

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
    <div className="flex items-center space-x-1 pl-2 h-full shrink-0 select-none z-50">
      {!isFullscreen && (
        <>
          <AppTooltip content="Minimize" side="bottom">
            <button
              onClick={handleMinimize}
              aria-label="Minimize"
              className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground transition-colors non-drag"
              type="button"
            >
              <Minus size={14} />
            </button>
          </AppTooltip>
          <AppTooltip content={isMaximized ? 'Restore' : 'Maximize'} side="bottom">
            <button
              onClick={handleToggleMaximize}
              aria-label={isMaximized ? 'Restore' : 'Maximize'}
              className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground transition-colors non-drag"
              type="button"
            >
              {isMaximized ? <Copy size={13} className="rotate-180" /> : <Square size={13} />}
            </button>
          </AppTooltip>
        </>
      )}
      <AppTooltip content={isFullscreen ? 'Exit Fullscreen (F11)' : 'Fullscreen (F11)'} side="bottom">
        <button
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Exit Fullscreen (F11)' : 'Fullscreen (F11)'}
          className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground transition-colors non-drag"
          type="button"
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </AppTooltip>
      <AppTooltip content="Close" side="bottom">
        <button
          onClick={handleClose}
          aria-label="Close"
          className="p-1.5 hover:bg-destructive hover:text-destructive-foreground rounded-md text-muted-foreground transition-colors non-drag"
          type="button"
        >
          <X size={14} />
        </button>
      </AppTooltip>
    </div>
  )
}
