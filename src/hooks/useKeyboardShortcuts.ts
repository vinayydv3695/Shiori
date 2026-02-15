import { useEffect } from 'react'

type ShortcutHandler = () => void

interface Shortcuts {
  [key: string]: ShortcutHandler
}

/**
 * Check if running on macOS
 */
function isMac(): boolean {
  return typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

/**
 * Hook to register keyboard shortcuts
 * @param shortcuts - Object mapping shortcut keys to handlers
 * 
 * @example
 * useKeyboardShortcuts({
 *   'cmd+k': () => openCommandPalette(),
 *   'cmd+n': () => createNewBook(),
 *   'delete': () => deleteSelected(),
 * })
 */
export function useKeyboardShortcuts(shortcuts: Shortcuts) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const mac = isMac()

      for (const [key, handler] of Object.entries(shortcuts)) {
        const parts = key.toLowerCase().split('+')
        const modifiers = parts.slice(0, -1)
        const mainKey = parts[parts.length - 1]

        // Check modifiers
        const cmdMatch = modifiers.includes('cmd') && (mac ? event.metaKey : event.ctrlKey)
        const ctrlMatch = modifiers.includes('ctrl') && event.ctrlKey
        const shiftMatch = modifiers.includes('shift') ? event.shiftKey : !event.shiftKey
        const altMatch = modifiers.includes('alt') ? event.altKey : !event.altKey

        // Check main key
        const keyMatch = event.key.toLowerCase() === mainKey

        // Check if all conditions match
        const allModifiersMatch = 
          (!modifiers.includes('cmd') || cmdMatch) &&
          (!modifiers.includes('ctrl') || ctrlMatch) &&
          (modifiers.includes('shift') ? shiftMatch : !event.shiftKey) &&
          (modifiers.includes('alt') ? altMatch : !event.altKey)

        if (keyMatch && allModifiersMatch) {
          // Prevent default browser behavior
          event.preventDefault()
          handler()
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}
