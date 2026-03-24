import * as Dialog from '@radix-ui/react-dialog'
import { X, Keyboard } from 'lucide-react'
import { SHORTCUTS_CATALOG } from '@/lib/shortcutsCatalog'

interface ShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const isMac = (): boolean => {
  return typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

const formatKeysForPlatform = (keys: string, isMacOS: boolean): string => {
  if (!isMacOS) return keys
  return keys.replace(/Ctrl\/Cmd/g, '⌘')
}

export const ShortcutsDialog = ({ open, onOpenChange }: ShortcutsDialogProps) => {
  const isMacOS = isMac()

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
              {SHORTCUTS_CATALOG.map((category) => (
                <div key={category.title}>
                  <h3 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    {category.title}
                  </h3>
                  <div className="space-y-2">
                    {category.shortcuts.map((shortcut) => (
                      <div
                        key={`${category.title}-${shortcut.keys}-${shortcut.action}`}
                        className="flex items-center justify-between gap-4 rounded-md px-3 py-2 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{shortcut.action}</p>
                          <p className="text-xs text-muted-foreground">{shortcut.context}</p>
                        </div>
                        <kbd className="inline-flex items-center justify-center rounded px-2 py-1 font-mono text-xs font-medium border bg-muted text-muted-foreground whitespace-nowrap">
                          {formatKeysForPlatform(shortcut.keys, isMacOS)}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <div className="mt-8 border-t pt-4 text-xs text-muted-foreground">
              <p>
                Press <kbd className="inline-flex items-center justify-center rounded px-1.5 py-0.5 mx-1 bg-muted text-muted-foreground border text-[10px] font-mono">
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
