/**
 * PremiumTopbar — Shiori v3.0
 *
 * Layout zones (left → right):
 * [Logo] [Books|Manga tabs] [|] [Import Books] [Import Manga] [|] [RSS] [Convert] [EditMeta] [Delete]
 *                   [────────── Search (center) ──────────]
 *                                                  [Theme] [Settings]
 */

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  ShioriWordmark,
  IconBooks,
  IconManga,
  IconImportBook,
  IconImportManga,
  IconRSS,
  IconConvert,
  IconEditMeta,
  IconDelete,
  IconSearch,
  IconSettings,
  IconSun,
  IconMoon,
  IconX,
  IconSidebarToggle,
} from '@/components/icons/ShioriIcons'
import { usePreferencesStore } from '@/store/preferencesStore'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'

export type DomainView = 'books' | 'manga'

interface PremiumTopbarProps {
  currentDomain: DomainView
  onDomainChange: (domain: DomainView) => void
  onImportBooks: () => void
  onImportManga: () => void
  onScanBooksFolder: () => void
  onScanMangaFolder: () => void
  onOpenRSS?: () => void
  onConvert?: () => void
  onEditMetadata?: () => void
  onDelete?: () => void
  onSearch?: (query: string) => void
  onOpenSettings: () => void
  onToggleSidebar?: () => void
  selectedCount?: number
  sidebarOpen?: boolean
}

// ─── Separator ────────────────────────────────
const Sep = () => (
  <div className="w-px h-5 bg-border self-center shrink-0 mx-0.5" aria-hidden />
)

// ─── Topbar Button ────────────────────────────
interface TBtnProps {
  onClick?: () => void
  icon: React.ReactNode
  label: string
  disabled?: boolean
  variant?: 'default' | 'ghost' | 'destructive'
  active?: boolean
  title?: string
  showLabel?: boolean
}

const TBtn = ({
  onClick,
  icon,
  label,
  disabled = false,
  variant = 'ghost',
  active = false,
  title,
  showLabel = true,
}: TBtnProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title ?? label}
    aria-label={label}
    className={cn(
      'group relative flex items-center gap-1.5 h-8 rounded-md px-2.5',
      'text-xs font-medium select-none',
      'transition-all duration-[120ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      // Disabled
      disabled && 'opacity-38 cursor-not-allowed pointer-events-none',
      // Variants
      variant === 'ghost' && !active && [
        'text-muted-foreground hover:text-foreground',
        'hover:bg-accent',
      ],
      variant === 'ghost' && active && [
        'text-foreground bg-accent',
      ],
      variant === 'default' && [
        'bg-primary text-primary-foreground',
        'hover:bg-primary/85',
        'shadow-sm',
      ],
      variant === 'destructive' && [
        'text-destructive hover:text-destructive-foreground',
        'hover:bg-destructive',
      ],
    )}
  >
    <span className="shrink-0">{icon}</span>
    {showLabel && <span className="truncate">{label}</span>}
  </button>
)

// ─── Search Input ─────────────────────────────
interface SearchBarProps {
  onSearch?: (query: string) => void
  currentDomain: DomainView
}

const SearchBar = ({ onSearch, currentDomain }: SearchBarProps) => {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => onSearch?.(value), 280)
    return () => clearTimeout(timer)
  }, [value, onSearch])

  const clear = () => {
    setValue('')
    onSearch?.('')
    inputRef.current?.focus()
  }

  return (
    <div
      className={cn(
        'relative flex items-center h-8',
        'rounded-md border',
        'transition-all duration-200',
        focused
          ? 'border-ring ring-1 ring-ring bg-background w-72'
          : 'border-border bg-muted/60 w-60',
      )}
    >
      <IconSearch
        size={14}
        className="absolute left-2.5 text-muted-foreground pointer-events-none shrink-0"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={`Search ${currentDomain}…`}
        className={cn(
          'w-full h-full pl-8 pr-7',
          'bg-transparent text-xs text-foreground placeholder:text-muted-foreground',
          'focus:outline-none',
          'caret-foreground',
        )}
      />
      {value && (
        <button
          onClick={clear}
          className="absolute right-2 flex items-center text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
          aria-label="Clear search"
        >
          <IconX size={12} />
        </button>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────
export function PremiumTopbar({
  currentDomain,
  onDomainChange,
  onImportBooks,
  onImportManga,
  onScanBooksFolder,
  onScanMangaFolder,
  onOpenRSS,
  onConvert,
  onEditMetadata,
  onDelete,
  onSearch,
  onOpenSettings,
  onToggleSidebar,
  selectedCount = 0,
  sidebarOpen = true,
}: PremiumTopbarProps) {
  const preferences = usePreferencesStore((s) => s.preferences)
  const updateTheme = usePreferencesStore((s) => s.updateTheme)

  const isDark = preferences?.theme === 'black'
  const hasSelection = selectedCount > 0

  const toggleTheme = async () => {
    if (preferences) {
      await updateTheme(isDark ? 'white' : 'black')
    }
  }

  return (
    <header
      className={cn(
        'flex items-center h-[var(--topbar-height,52px)] px-3 gap-1',
        'border-b border-border bg-background',
        'shrink-0 z-[var(--z-topbar,200)]',
        'select-none',
      )}
    >
      {/* ── Sidebar toggle ── */}
      <TBtn
        onClick={onToggleSidebar}
        icon={<IconSidebarToggle size={16} />}
        label="Toggle sidebar"
        showLabel={false}
        active={sidebarOpen}
        title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      />

      {/* ── Logo ── */}
      <div className="flex items-center pl-1 pr-3 shrink-0">
        <ShioriWordmark size={18} />
      </div>

      <Sep />

      {/* ── Domain Tabs ── */}
      <div
        className={cn(
          'flex items-center h-7 rounded-md p-0.5 gap-0.5',
          'bg-muted border border-border',
        )}
      >
        <button
          onClick={() => onDomainChange('books')}
          className={cn(
            'flex items-center gap-1.5 h-full px-3 rounded',
            'text-xs font-medium transition-all duration-[120ms]',
            currentDomain === 'books'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={currentDomain === 'books'}
        >
          <IconBooks size={14} />
          Books
        </button>
        <button
          onClick={() => onDomainChange('manga')}
          className={cn(
            'flex items-center gap-1.5 h-full px-3 rounded',
            'text-xs font-medium transition-all duration-[120ms]',
            currentDomain === 'manga'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={currentDomain === 'manga'}
        >
          <IconManga size={14} />
          Manga
        </button>
      </div>

      <Sep />

      {/* ── Import zone ── */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'group relative flex items-center gap-1.5 h-8 rounded-md px-2.5',
              'text-xs font-medium select-none',
              'transition-all duration-[120ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
              'bg-primary text-primary-foreground hover:bg-primary/85 shadow-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <IconImportBook size={15} />
            <span>Import ▼</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Books</DropdownMenuLabel>
          <DropdownMenuItem onClick={onImportBooks} className="gap-2 cursor-pointer">
            <IconImportBook size={14} />
            <span>Import Books</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onScanBooksFolder} className="gap-2 cursor-pointer">
            <IconImportBook size={14} />
            <span>Scan Books Folder</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="text-xs text-muted-foreground">Manga</DropdownMenuLabel>
          <DropdownMenuItem onClick={onImportManga} className="gap-2 cursor-pointer">
            <IconImportManga size={14} />
            <span>Import Manga</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onScanMangaFolder} className="gap-2 cursor-pointer">
            <IconImportManga size={14} />
            <span>Scan Manga Folder</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sep />

      {/* ── Content actions ── */}
      <TBtn
        onClick={onOpenRSS}
        icon={<IconRSS size={15} />}
        label="RSS"
        showLabel={false}
        title="RSS Feeds"
      />
      <TBtn
        onClick={onConvert}
        icon={<IconConvert size={15} />}
        label="Convert"
        showLabel={false}
        disabled={!hasSelection}
        title={hasSelection ? 'Convert selected book' : 'Select a book to convert'}
      />
      <TBtn
        onClick={onEditMetadata}
        icon={<IconEditMeta size={15} />}
        label="Edit Metadata"
        showLabel={false}
        disabled={!hasSelection}
        title={hasSelection ? 'Edit metadata' : 'Select a book to edit metadata'}
      />

      <Sep />

      {/* ── Delete ── */}
      {hasSelection ? (
        <button
          onClick={onDelete}
          title={`Delete ${selectedCount} selected`}
          className={cn(
            'flex items-center gap-1.5 h-8 rounded-md px-2.5',
            'text-xs font-medium',
            'text-destructive hover:text-destructive-foreground hover:bg-destructive',
            'transition-all duration-[120ms]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive',
          )}
        >
          <IconDelete size={15} />
          <span>Delete {selectedCount}</span>
        </button>
      ) : (
        <TBtn
          icon={<IconDelete size={15} />}
          label="Delete"
          showLabel={false}
          disabled
          title="Select items to delete"
        />
      )}

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Search (center-right) ── */}
      <SearchBar onSearch={onSearch} currentDomain={currentDomain} />

      {/* ── Utility ── */}
      <div className="flex items-center gap-0.5 pl-2">
        <Sep />
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label="Toggle theme"
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-md',
            'text-muted-foreground hover:text-foreground hover:bg-accent',
            'transition-all duration-[120ms]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
        <button
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-md',
            'text-muted-foreground hover:text-foreground hover:bg-accent',
            'transition-all duration-[120ms]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <IconSettings size={16} />
        </button>
      </div>
    </header>
  )
}
