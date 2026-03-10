import { useEffect } from 'react'

type ShortcutHandler = () => void

interface Shortcuts {
  [key: string]: ShortcutHandler
}

function isMac(): boolean {
  return typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

function isInputElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase()
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    (tagName === 'div' && element.getAttribute('contenteditable') === 'true')
  )
}

export function useKeyboardShortcuts(shortcuts: Shortcuts) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const mac = isMac()
      const target = event.target as Element

      if (isInputElement(target)) {
        return
      }

      for (const [key, handler] of Object.entries(shortcuts)) {
        const parts = key.toLowerCase().split('+')
        const modifiers = parts.slice(0, -1)
        const mainKey = parts[parts.length - 1]

        const cmdMatch = modifiers.includes('cmd') && (mac ? event.metaKey : event.ctrlKey)
        const ctrlMatch = modifiers.includes('ctrl') && event.ctrlKey
        const shiftMatch = modifiers.includes('shift') && event.shiftKey
        const altMatch = modifiers.includes('alt') && event.altKey

        const keyMatch = event.key.toLowerCase() === mainKey

        const allModifiersMatch = 
          (!modifiers.includes('cmd') || cmdMatch) &&
          (!modifiers.includes('ctrl') || ctrlMatch) &&
          (!modifiers.includes('shift') || shiftMatch) &&
          (!modifiers.includes('alt') || altMatch)

        if (keyMatch && allModifiersMatch) {
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
