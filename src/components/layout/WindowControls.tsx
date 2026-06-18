import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X, Copy } from 'lucide-react'

export function WindowControls() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // Only run in Tauri environment
    if (!window.__TAURI_INTERNALS__) return;

    const appWindow = getCurrentWindow()
    let unlistenResize: (() => void) | undefined

    // Check initial state
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

    // Listen for resize to update maximized state
    appWindow.onResized(() => {
      checkState()
    }).then(unlisten => {
      unlistenResize = unlisten
    }).catch(err => console.warn('Failed to listen to resize', err))

    return () => {
      unlistenResize?.()
    }
  }, [])

  // In browser fallback (dev mode without Tauri), we still render something or nothing
  if (!window.__TAURI_INTERNALS__) return null;

  if (isFullscreen) return null

  const handleMinimize = () => getCurrentWindow().minimize()
  const handleToggleMaximize = () => getCurrentWindow().toggleMaximize()
  const handleClose = () => getCurrentWindow().close()

  return (
    <div className="flex items-center space-x-1 pl-2 h-full shrink-0" data-tauri-drag-region>
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
