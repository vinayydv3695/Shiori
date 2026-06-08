/**
 * PremiumTopbar — Shiori v3.0
 *
 * Layout zones (left → right):
 * [Logo] [Books|Manga tabs] [|] [Import ▼] [|] [RSS] [Convert] [EditMeta] [Delete]
 *                   [────────── Search (center) ──────────]
 *                                                  [Theme] [Settings]
 *
 * Import dropdown has 2 unified options:
 *   - "Import Books/Manga/Comics" (file picker)
 *   - "Import Folder" (folder picker)
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
  IconInfo,
  IconDelete,
  IconSearch,
  IconSettings,
  IconSun,
  IconMoon,
  IconX,
  IconSidebarToggle,
} from '@/components/icons/ShioriIcons'
import { Layers, Copy, Filter, HelpCircle } from 'lucide-react'
import { usePreferencesStore } from '@/store/preferencesStore'
import type { CurrentView } from '@/store/uiStore'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { FeatureHint } from '@/components/ui/FeatureHint'
import { SortDropdown } from '../library/SortDropdown'

import { Globe } from 'lucide-react'

export type DomainView = 'books' | 'manga_comics'

interface PremiumTopbarProps {
  currentDomain: DomainView
  onDomainChange: (domain: DomainView) => void
  onImportFiles: () => void
  onImportFolder: () => void
  onSearch?: (query: string) => void
  onOpenSettings: () => void
  onOpenAdvancedFilter?: () => void
  onToggleSidebar?: () => void
  onGoHome?: () => void
  onAutoGroupManga?: () => void
  onOpenShortcuts?: () => void
  currentView?: CurrentView
  onNavigateToView?: (view: CurrentView) => void
  activeFilterCount?: number
  sidebarOpen?: boolean
  searchValue?: string
  searchPlaceholder?: string
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
  type?: 'button' | 'submit' | 'reset'
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
  type = 'button',
}: TBtnProps) => (
  <button
    type={type}
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
  value?: string
  placeholder?: string
}

const SearchBar = ({ onSearch, currentDomain, value: controlledValue, placeholder }: SearchBarProps) => {
  const [internalValue, setInternalValue] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const value = controlledValue ?? internalValue
  const setValue = (next: string) => {
    if (controlledValue !== undefined) {
      onSearch?.(next)
      return
    }
    setInternalValue(next)
  }

  useEffect(() => {
    if (controlledValue !== undefined) return
    const timer = setTimeout(() => onSearch?.(value), 280)
    return () => clearTimeout(timer)
  }, [value, onSearch, controlledValue])

  const clear = () => {
    setValue('')
    if (controlledValue === undefined) {
      onSearch?.('')
    }
    inputRef.current?.focus()
  }

  return (
    <div
      className={cn(
        'relative flex items-center h-9',
        'rounded-full',
        'transition-all duration-300 ease-out',
        focused
          ? 'bg-background w-80 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1),0_0_0_2px_rgba(var(--primary),0.2)] dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.4),0_0_0_2px_rgba(var(--primary),0.3)] ring-1 ring-primary/20'
          : 'bg-muted/50 hover:bg-muted/80 w-64 ring-1 ring-border/50',
      )}
    >
      <IconSearch
        size={14}
        className={cn(
          "absolute left-3 transition-colors duration-200",
          focused ? "text-primary" : "text-muted-foreground"
        )}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder ?? `Search ${currentDomain === 'books' ? 'Books' : 'Manga'}…`}
        className={cn(
          'w-full h-full pl-9 pr-8 rounded-full',
          'bg-transparent text-sm text-foreground placeholder:text-muted-foreground',
          'focus:outline-none',
          'caret-primary',
          'transition-opacity duration-300',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2.5 flex items-center justify-center w-5 h-5 rounded-full bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30 hover:text-foreground transition-colors"
          tabIndex={-1}
          aria-label="Clear search"
        >
          <IconX size={10} />
        </button>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────
export function PremiumTopbar({
  currentDomain,
  onDomainChange,
  onImportFiles,
  onImportFolder,
  onSearch,
  onOpenSettings,
  onOpenAdvancedFilter,
  onToggleSidebar,
  onGoHome,
  onAutoGroupManga,
  onOpenShortcuts,
  currentView,
  onNavigateToView,
  activeFilterCount = 0,
  sidebarOpen = true,
  searchValue,
  searchPlaceholder,
}: PremiumTopbarProps) {
  const preferences = usePreferencesStore((s) => s.preferences)
  const updateTheme = usePreferencesStore((s) => s.updateTheme)

  const isDark = preferences?.theme === 'dark'

  const toggleTheme = async () => {
    if (preferences) {
      await updateTheme(isDark ? 'light' : 'dark')
    }
  }

  const handleOnlineToggle = () => {
    if (onNavigateToView) {
      if (currentView?.startsWith('online')) {
        onNavigateToView('library')
      } else {
        onNavigateToView(currentDomain === 'books' ? 'online-books' : 'online-manga')
      }
    }
  }

  return (
    <header
      className={cn(
        'flex items-center h-[var(--topbar-height,60px)] px-4 gap-3',
        'border-b border-border/40 bg-background/70 backdrop-blur-xl',
        'shrink-0 z-[var(--z-topbar,200)]',
        'select-none',
      )}
    >
      <div className="flex items-center gap-2 w-1/3">
        {/* ── Sidebar toggle ── */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Toggle sidebar"
        >
          <IconSidebarToggle size={18} />
        </button>

        {/* ── Logo (clickable → home) ── */}
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center justify-center h-9 px-2 rounded-lg hover:bg-muted transition-colors cursor-pointer overflow-hidden shrink-0"
          title="Go to Home"
          aria-label="Go to Home"
        >
          <ShioriWordmark size={20} />
        </button>

        <div className="w-px h-6 bg-border/50 mx-1" />

        {/* ── Import zone (Moved to Left) ── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex items-center gap-1.5 h-9 rounded-full px-4 shrink-0',
                'text-sm font-bold',
                'transition-all duration-200',
                'bg-background/80 hover:bg-background text-foreground border border-border/50 shadow-sm backdrop-blur-md'
              )}
            >
              <IconImportBook size={16} />
              <span>Import</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 rounded-xl border-border/50 shadow-xl bg-background/95 backdrop-blur-xl">
            <DropdownMenuItem onClick={onImportFiles} className="gap-2 p-3 cursor-pointer rounded-lg">
              <IconImportBook size={15} className="text-primary" />
              <div className="flex flex-col">
                <span className="font-semibold">Import Files</span>
                <span className="text-[10px] text-muted-foreground">Select individual books or manga</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImportFolder} className="gap-2 p-3 cursor-pointer rounded-lg">
              <IconImportManga size={15} className="text-orange-500" />
              <div className="flex flex-col">
                <span className="font-semibold">Import Folder</span>
                <span className="text-[10px] text-muted-foreground">Scan directory recursively</span>
              </div>
            </DropdownMenuItem>

            {currentDomain === 'manga_comics' && (
              <>
                <DropdownMenuSeparator className="bg-border/50" />
                <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold px-3 py-2">Organization</DropdownMenuLabel>
                <FeatureHint
                  featureId="auto-group-manga"
                  title="Auto-group Manga Volumes"
                  description="Automatically detect and group manga volumes by series name from filenames. Perfect for organizing your manga collection!"
                  position="left"
                >
                  <DropdownMenuItem onClick={onAutoGroupManga} className="gap-2 p-3 cursor-pointer rounded-lg">
                    <Layers size={15} className="text-purple-500" />
                    <div className="flex flex-col">
                      <span className="font-semibold">Group Volumes</span>
                      <span className="text-[10px] text-muted-foreground">Auto-detect series</span>
                    </div>
                  </DropdownMenuItem>
                </FeatureHint>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── Domain Tabs (Segmented Control) ── */}
        <div className="relative flex items-center p-1 bg-muted/50 border border-border/50 rounded-full h-9 ml-2 shadow-inner">
          {/* Animated Background Pill */}
          <div 
            className="absolute top-1 bottom-1 rounded-full bg-background shadow-sm border border-border/50 transition-all duration-300 ease-out z-0"
            style={{ 
              left: currentDomain === 'books' ? '4px' : 'calc(50% + 2px)', 
              width: 'calc(50% - 6px)' 
            }} 
          />
          
          <button
            type="button"
            onClick={() => onDomainChange('books')}
            className={cn(
              'relative z-10 flex items-center justify-center gap-1.5 flex-1 px-4 text-xs font-bold rounded-full transition-colors duration-200',
              currentDomain === 'books' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            style={{ width: '90px' }}
          >
            <IconBooks size={14} />
            Books
          </button>
          
          <button
            type="button"
            onClick={() => onDomainChange('manga_comics')}
            className={cn(
              'relative z-10 flex items-center justify-center gap-1.5 flex-1 px-4 text-xs font-bold rounded-full transition-colors duration-200',
              currentDomain === 'manga_comics' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            style={{ width: '130px' }}
          >
            <IconManga size={14} />
            Manga
          </button>
        </div>
      </div>

      {/* ── Search (center) ── */}
      <div className="flex-1 flex justify-center items-center">
        <SearchBar
          onSearch={onSearch}
          currentDomain={currentDomain}
          value={searchValue}
          placeholder={searchPlaceholder}
        />
      </div>

      <div className="flex items-center justify-end gap-2 w-1/3">
        {/* ── Advanced Filter ── */}
        <button
          type="button"
          onClick={onOpenAdvancedFilter}
          title="Advanced Filters (Ctrl+Shift+F)"
          className={cn(
            'relative flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200',
            activeFilterCount > 0
              ? 'text-primary bg-primary/10 hover:bg-primary/20'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
        >
          <Filter size={16} />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-black shadow-sm ring-2 ring-background">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* ── Online Toggle ── */}
        <button
          type="button"
          onClick={handleOnlineToggle}
          title={currentView?.startsWith('online') ? 'Back to Library' : 'Online Mode (Torbox/Nyaa)'}
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200',
            currentView?.startsWith('online')
              ? 'text-white bg-gradient-to-r from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
        >
          <Globe size={16} className={currentView?.startsWith('online') ? 'animate-pulse' : ''} />
        </button>



        {/* ── Utility Pill ── */}
        <div className="flex items-center gap-0.5 bg-muted/50 border border-border/50 rounded-full p-0.5 shadow-inner">
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-background shadow-sm transition-all duration-200"
          >
            {isDark ? <IconSun size={15} /> : <IconMoon size={15} />}
          </button>
          <button
            type="button"
            onClick={onOpenShortcuts}
            title="Keyboard shortcuts"
            className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-background shadow-sm transition-all duration-200"
          >
            <HelpCircle size={15} />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            title="Settings"
            className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-background shadow-sm transition-all duration-200"
          >
            <IconSettings size={15} />
          </button>
        </div>
      </div>
    </header>
  )
}
