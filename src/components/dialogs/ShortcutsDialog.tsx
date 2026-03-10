import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Keyboard } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ShortcutItem {
  keys: string[]
  description: string
}

interface ShortcutCategory {
  title: string
  shortcuts: ShortcutItem[]
}

const isMac = (): boolean => {
  return typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

const getShortcutLabel = (keys: string[]): string => {
  const isMacOS = isMac()
  return keys
    .map(key => {
      if (key === 'Cmd') return isMacOS ? '⌘' : 'Ctrl'
      if (key === 'Ctrl') return isMacOS ? '⌘' : 'Ctrl'
      if (key === 'Shift') return '⇧'
      if (key === 'Alt') return isMacOS ? '⌥' : 'Alt'
      if (key === '/') return '/'
      if (key === '?') return '?'
      return key.toUpperCase()
    })
    .join('')
}

const SHORTCUTS: ShortcutCategory[] = [
  {
    title: 'General',
    shortcuts: [
      {
        keys: ['Cmd', 'O'],
        description: 'Open/Import books'
      },
      {
        keys: ['Cmd', 'F'],
        description: 'Search library'
      },
      {
        keys: ['Cmd', 'T'],
        description: 'Toggle theme'
      },
      {
        keys: ['Cmd', ','],
        description: 'Open settings'
      },
      {
        keys: ['Cmd', 'K'],
        description: 'Open command palette'
      },
      {
        keys: ['Cmd', 'I'],
        description: 'View book details'
      },
      {
        keys: ['Cmd', 'Shift', 'M'],
        description: 'Fetch metadata for selection'
      },
      {
        keys: ['Cmd', 'Shift', 'F'],
        description: 'Open advanced filter'
      },
    ]
  },
  {
    title: 'Reader',
    shortcuts: [
      {
        keys: ['Left', 'Arrow'],
        description: 'Previous page'
      },
      {
        keys: ['Right', 'Arrow'],
        description: 'Next page'
      },
      {
        keys: ['Up', 'Arrow'],
        description: 'Scroll up'
      },
      {
        keys: ['Down', 'Arrow'],
        description: 'Scroll down'
      },
      {
        keys: ['Escape'],
        description: 'Close reader/dialogs'
      },
      {
        keys: ['F11'],
        description: 'Toggle fullscreen'
      },
    ]
  },
  {
    title: 'Help',
    shortcuts: [
      {
        keys: ['?'],
        description: 'Show keyboard shortcuts'
      },
      {
        keys: ['Ctrl', '/'],
        description: 'Show keyboard shortcuts (Windows/Linux)'
      },
    ]
  }
]

export const ShortcutsDialog = ({ open, onOpenChange }: ShortcutsDialogProps) => {
  const [isMacOS, setIsMacOS] = useState(false)

  useEffect(() => {
    setIsMacOS(isMac())
  }, [])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          {/* Header */}
          <div className="flex items-center justify-between border-b p-6">
            <div className="flex items-center gap-3">
              <Keyboard className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
            </div>
            <Dialog.Close className="inline-flex items-center justify-center rounded-md p-2 hover:bg-accent">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="max-h-[70vh] overflow-y-auto p-6">
            <div className="space-y-8">
              {SHORTCUTS.map((category, idx) => (
                <div key={idx}>
                  <h3 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    {category.title}
                  </h3>
                  <div className="space-y-2">
                    {category.shortcuts.map((shortcut, shortcutIdx) => (
                      <div
                        key={shortcutIdx}
                        className="flex items-center justify-between gap-4 rounded-md px-3 py-2 hover:bg-accent/50 transition-colors"
                      >
                        <span className="flex-1 text-sm text-foreground">
                          {shortcut.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, keyIdx) => {
                            const isModifier = ['Cmd', 'Ctrl', 'Shift', 'Alt'].includes(key)
                            const display = key === 'Cmd' 
                              ? (isMacOS ? '⌘' : 'Ctrl')
                              : key === 'Ctrl'
                              ? (isMacOS ? '⌘' : 'Ctrl')
                              : key === 'Shift'
                              ? '⇧'
                              : key === 'Alt'
                              ? (isMacOS ? '⌥' : 'Alt')
                              : key

                            return (
                              <div key={keyIdx} className="flex items-center gap-1">
                                <kbd
                                  className={cn(
                                    'inline-flex items-center justify-center rounded px-2 py-1 font-mono text-xs font-medium',
                                    'border bg-muted text-muted-foreground',
                                    'min-w-[32px] text-center',
                                    isModifier && 'bg-primary/10'
                                  )}
                                >
                                  {display}
                                </kbd>
                                {keyIdx < shortcut.keys.length - 1 && (
                                  <span className="text-xs text-muted-foreground px-1">+</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <div className="mt-8 border-t pt-4 text-xs text-muted-foreground">
              <p>
                💡 Press <kbd className="inline-flex items-center justify-center rounded px-1.5 py-0.5 mx-1 bg-muted text-muted-foreground border text-[10px] font-mono">
                  ?
                </kbd> 
                anytime to show this dialog
              </p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
