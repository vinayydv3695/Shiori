import { useEffect, useState, useCallback } from 'react'
import { Command } from 'cmdk'
import {
  Search,
  BookOpen,
  Plus,
  Settings,
  Grid3x3,
  List,
  Table2,
  Moon,
  Sun,
  FileEdit,
  Download,
  Trash2,
  Tag,
  Star,
  FolderPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLibraryStore } from '@/store/libraryStore'
import { useTheme } from '@/hooks/useTheme'
import type { Book } from '@/lib/tauri'

interface CommandPaletteProps {
  books: Book[]
  onOpenBook: (bookId: number) => void
  onAddBook: () => void
  onSettings: () => void
  onEditBook?: (bookId: number) => void
  onDeleteBook?: (bookId: number) => void
}

export const CommandPalette = ({
  books,
  onOpenBook,
  onAddBook,
  onSettings,
  onEditBook,
  onDeleteBook,
}: CommandPaletteProps) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { viewMode, setViewMode } = useLibraryStore()
  const { theme, toggleTheme } = useTheme()

  // Toggle command palette with Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // Filter books based on search
  const filteredBooks = search
    ? books.filter((book) => {
        const searchLower = search.toLowerCase()
        return (
          book.title.toLowerCase().includes(searchLower) ||
          book.authors?.some((a) => a.name.toLowerCase().includes(searchLower)) ||
          book.tags?.some((t) => t.name.toLowerCase().includes(searchLower))
        )
      })
    : books.slice(0, 5) // Show recent 5 books when no search

  const handleSelectBook = useCallback((bookId: number) => {
    onOpenBook(bookId)
    setOpen(false)
    setSearch('')
  }, [onOpenBook])

  const handleCommand = useCallback((command: () => void) => {
    command()
    setOpen(false)
    setSearch('')
  }, [])

  return (
    <>
      {/* Trigger button (optional - can also just use keyboard shortcut) */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg',
          'border border-border bg-background',
          'hover:bg-accent transition-colors',
          'text-sm text-muted-foreground'
        )}
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Command Palette Dialog */}
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Command Palette"
        className={cn(
          'fixed top-[20%] left-1/2 -translate-x-1/2 z-50',
          'w-full max-w-2xl rounded-lg border bg-popover shadow-lg',
          'overflow-hidden'
        )}
      >
        <div className="flex items-center border-b px-3">
          <Search className="w-4 h-4 mr-2 opacity-50" />
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Type a command or search books..."
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <Command.List className="max-h-[400px] overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          {/* Books Section */}
          {filteredBooks.length > 0 && (
            <Command.Group heading="Books" className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              {filteredBooks.map((book) => (
                <Command.Item
                  key={book.id}
                  value={`book-${book.id}-${book.title}`}
                  onSelect={() => handleSelectBook(book.id!)}
                  className={cn(
                    'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2.5',
                    'text-sm outline-none',
                    'aria-selected:bg-accent aria-selected:text-accent-foreground',
                    'hover:bg-accent/50 transition-colors'
                  )}
                >
                  <BookOpen className="w-4 h-4 mr-3 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{book.title}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {book.authors?.map(a => a.name).join(', ') || 'Unknown Author'}
                    </div>
                  </div>
                  {book.rating && book.rating > 0 && (
                    <div className="flex items-center gap-1 ml-2 text-xs text-muted-foreground">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      {book.rating}
                    </div>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Separator className="h-px bg-border my-2" />

          {/* Actions Section */}
          <Command.Group heading="Actions" className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            <Command.Item
              onSelect={() => handleCommand(onAddBook)}
              className={cn(
                'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2.5',
                'text-sm outline-none',
                'aria-selected:bg-accent aria-selected:text-accent-foreground',
                'hover:bg-accent/50 transition-colors'
              )}
            >
              <Plus className="w-4 h-4 mr-3" />
              <span>Add Book</span>
              <kbd className="ml-auto text-xs text-muted-foreground">⌘N</kbd>
            </Command.Item>

            <Command.Item
              onSelect={() => handleCommand(onSettings)}
              className={cn(
                'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2.5',
                'text-sm outline-none',
                'aria-selected:bg-accent aria-selected:text-accent-foreground',
                'hover:bg-accent/50 transition-colors'
              )}
            >
              <Settings className="w-4 h-4 mr-3" />
              <span>Settings</span>
              <kbd className="ml-auto text-xs text-muted-foreground">⌘,</kbd>
            </Command.Item>
          </Command.Group>

          <Command.Separator className="h-px bg-border my-2" />

          {/* View Mode Section */}
          <Command.Group heading="View Mode" className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            <Command.Item
              onSelect={() => handleCommand(() => setViewMode('grid'))}
              className={cn(
                'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2.5',
                'text-sm outline-none',
                'aria-selected:bg-accent aria-selected:text-accent-foreground',
                'hover:bg-accent/50 transition-colors'
              )}
            >
              <Grid3x3 className="w-4 h-4 mr-3" />
              <span>Grid View</span>
              {viewMode === 'grid' && (
                <span className="ml-auto text-xs text-primary">✓</span>
              )}
            </Command.Item>

            <Command.Item
              onSelect={() => handleCommand(() => setViewMode('list'))}
              className={cn(
                'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2.5',
                'text-sm outline-none',
                'aria-selected:bg-accent aria-selected:text-accent-foreground',
                'hover:bg-accent/50 transition-colors'
              )}
            >
              <List className="w-4 h-4 mr-3" />
              <span>List View</span>
              {viewMode === 'list' && (
                <span className="ml-auto text-xs text-primary">✓</span>
              )}
            </Command.Item>

            <Command.Item
              onSelect={() => handleCommand(() => setViewMode('table'))}
              className={cn(
                'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2.5',
                'text-sm outline-none',
                'aria-selected:bg-accent aria-selected:text-accent-foreground',
                'hover:bg-accent/50 transition-colors'
              )}
            >
              <Table2 className="w-4 h-4 mr-3" />
              <span>Table View</span>
              {viewMode === 'table' && (
                <span className="ml-auto text-xs text-primary">✓</span>
              )}
            </Command.Item>
          </Command.Group>

          <Command.Separator className="h-px bg-border my-2" />

          {/* Theme Section */}
          <Command.Group heading="Appearance" className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            <Command.Item
              onSelect={() => handleCommand(toggleTheme)}
              className={cn(
                'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2.5',
                'text-sm outline-none',
                'aria-selected:bg-accent aria-selected:text-accent-foreground',
                'hover:bg-accent/50 transition-colors'
              )}
            >
              {theme === 'dark' ? (
                <Moon className="w-4 h-4 mr-3" />
              ) : (
                <Sun className="w-4 h-4 mr-3" />
              )}
              <span>Toggle Theme</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {theme === 'dark' ? 'Dark' : 'Light'}
              </span>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command.Dialog>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  )
}
