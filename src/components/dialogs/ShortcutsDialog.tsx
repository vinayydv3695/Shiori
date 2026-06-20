import * as Dialog from '@radix-ui/react-dialog'
import { X, Keyboard, Search, Settings, BookOpen, Image as ImageIcon, Grid } from 'lucide-react'
import { SHORTCUTS_CATALOG } from '@/lib/shortcutsCatalog'
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'

interface ShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const isMac = (): boolean => {
  return typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

const formatKeysForPlatform = (keys: string, isMacOS: boolean): string[] => {
  const formatted = !isMacOS ? keys : keys.replace(/Ctrl\/Cmd/g, '⌘').replace(/Shift/g, '⇧').replace(/Alt/g, '⌥')
  return formatted.split('+').map(k => k.trim())
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'General': <Settings size={16} />,
  'Book Reader': <BookOpen size={16} />,
  'Manga Reader': <ImageIcon size={16} />,
}

export const ShortcutsDialog = ({ open, onOpenChange }: ShortcutsDialogProps) => {
  const isMacOS = isMac()
  const [activeTab, setActiveTab] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')

  const tabs = ['All', ...SHORTCUTS_CATALOG.map(c => c.title)]

  const filteredCatalog = useMemo(() => {
    return SHORTCUTS_CATALOG
      .filter(category => activeTab === 'All' || category.title === activeTab)
      .map(category => {
        const query = searchQuery.toLowerCase()
        const shortcuts = category.shortcuts.filter(
          s => s.action.toLowerCase().includes(query) || s.keys.toLowerCase().includes(query) || s.context.toLowerCase().includes(query)
        )
        return { ...category, shortcuts }
      })
      .filter(category => category.shortcuts.length > 0)
  }, [activeTab, searchQuery])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content aria-describedby={undefined} className="dialog-content fixed left-[50%] top-[50%] z-50 w-full max-w-3xl translate-x-[-50%] translate-y-[-50%] flex flex-col rounded-xl border border-border/50 bg-background/95 backdrop-blur-2xl shadow-2xl overflow-hidden h-[70vh] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          
          {/* Header */}
          <div className="flex flex-col border-b border-border/50 shrink-0 bg-muted/20">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Keyboard className="h-5 w-5 text-primary" />
                </div>
                <Dialog.Title className="text-lg font-bold text-foreground">Keyboard Shortcuts</Dialog.Title>
              </div>
              <Dialog.Close className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="px-4 pb-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search shortcuts..." 
                  className="w-full h-10 pl-9 pr-4 rounded-lg bg-background/50 border border-border focus:ring-2 focus:ring-primary/50 focus:border-primary focus:outline-none transition-all placeholder:text-muted-foreground text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-56 border-r border-border/50 bg-muted/10 p-4 space-y-1 overflow-y-auto shrink-0">
              {tabs.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-colors",
                    activeTab === tab 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  {tab === 'All' ? <Grid size={16} /> : CATEGORY_ICONS[tab] || <Settings size={16} />}
                  {tab}
                </button>
              ))}
              
              <div className="pt-8 pb-4">
                <div className="p-4 bg-muted/30 rounded-xl border border-border/50 flex flex-col items-center justify-center text-center">
                  <kbd className="inline-flex items-center justify-center rounded-md px-2 py-1 mb-2 bg-background border border-border/60 shadow-sm text-xs font-mono font-bold text-foreground">?</kbd>
                  <p className="text-[10px] text-muted-foreground">Press anywhere to open</p>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-background/50 relative">
              {filteredCatalog.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground opacity-50">
                  <Search size={48} className="mb-4" />
                  <p>No shortcuts found matching "{searchQuery}"</p>
                </div>
              ) : (
                <div className="space-y-8 pb-8 animate-in fade-in duration-300">
                  {filteredCatalog.map((category) => (
                    <div key={category.title}>
                      <h3 className="mb-4 flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {CATEGORY_ICONS[category.title]}
                        {category.title}
                      </h3>
                      <div className="space-y-1.5">
                        {category.shortcuts.map((shortcut) => {
                          const keys = formatKeysForPlatform(shortcut.keys, isMacOS)
                          return (
                            <div
                              key={`${category.title}-${shortcut.keys}-${shortcut.action}`}
                              className="group flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-accent/40 border border-transparent hover:border-border/50 transition-all"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{shortcut.action}</p>
                                <p className="text-xs text-muted-foreground">{shortcut.context}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {keys.map((k, i) => (
                                  <kbd 
                                    key={i} 
                                    className={cn(
                                      "inline-flex items-center justify-center rounded px-2.5 py-1 font-mono text-[11px] font-bold tracking-tight shadow-sm transition-colors",
                                      "bg-gradient-to-b from-muted to-muted/50 border border-border text-foreground"
                                    )}
                                  >
                                    {k}
                                  </kbd>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
