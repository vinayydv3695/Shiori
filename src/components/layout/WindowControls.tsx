import { useState, useEffect, useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X, Copy, Maximize2, Minimize2 } from 'lucide-react'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: any;
  }
}

export function WindowControls() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  const toggleFullscreen = useCallback(async () => {
    if (!window.__TAURI_INTERNALS__) return;
    const appWindow = getCurrentWindow()
    try {
      const full = await appWindow.isFullscreen()
      if (!full) {
        // On Windows, setFullscreen() uses SWP_NOZORDER, keeping the window
        // below the HWND_TOPMOST taskbar. Promote to TOPMOST first so
        // fullscreen completely covers the taskbar.
        await appWindow.setAlwaysOnTop(true)
        await appWindow.setFullscreen(true)
        setIsFullscreen(true)
      } else {
        await appWindow.setFullscreen(false)
        await appWindow.setAlwaysOnTop(false)
        setIsFullscreen(false)
      }
    } catch (err) {
      console.warn('Failed to toggle fullscreen', err)
    }
  }, [])

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;

    const appWindow = getCurrentWindow()
    let unlistenResize: (() => void) | undefined

    const checkState = async () => {
      try {
        const full = await appWindow.isFullscreen()
        const max = await appWindow.isMaximized()
        setIsFullscreen(full)
        setIsMaximized(max)
      } catch (err) {
        console.warn('Failed to check window state', err)
      }
    }
    
    checkState()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault()
        toggleFullscreen()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    appWindow.onResized(checkState).then(unlisten => { unlistenResize = unlisten })

    return () => {
      unlistenResize?.()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [toggleFullscreen])

  if (!window.__TAURI_INTERNALS__) return null;

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
            title={isMaximized ? "Restore" : "Maximize"}
            type="button"
          >
            {isMaximized ? <Copy size={13} className="rotate-180" /> : <Square size={13} />}
          </button>
        </>
      )}
      <button 
        onClick={toggleFullscreen} 
        className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-md text-muted-foreground hover:text-foreground transition-colors non-drag"
        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
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
