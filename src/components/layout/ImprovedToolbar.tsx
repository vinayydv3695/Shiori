/**
 * PremiumTopbar — Shiori Redesign v3.3
 *
 * 3-Zone Architecture (Apple Books / Notion / Linear style):
 * [Left: Sidebar Toggle + Book Shelves Dropdown + Domain Switcher] ───── [Center: Command Search Bar + Ctrl+K] ───── [Right: Primary CTA + Quick Tools + System Utilities]
 *
 * Replaced Shiori logo with a clean "Shelves" quick-access menu with shelf list & creation.
 */

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  IconBooks,
  IconManga,
  IconImportBook,
  IconImportManga,
  IconSearch,
  IconSettings,
  IconSun,
  IconMoon,
  IconX,
} from '@/components/icons/ShioriIcons'
import { Layers, Filter, HelpCircle, BarChart2, Rss, FolderPlus, FolderOpen, ChevronDown, Settings } from 'lucide-react'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useShelfStore } from '@/store/shelfStore'
import type { CurrentView } from '@/store/uiStore'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { FeatureHint } from '@/components/ui/FeatureHint'
import { WindowControls } from './WindowControls'

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
  onCreateShelf?: () => void
  currentView?: CurrentView
  onNavigateToView?: (view: CurrentView) => void
  activeFilterCount?: number
  sidebarOpen?: boolean
  searchValue?: string
  searchPlaceholder?: string
}

// ─── Command Search Input ─────────────────────────────
interface SearchBarProps {
  onSearch?: (query: string) => void
  currentDomain: DomainView
  value?: string
  placeholder?: string
}

const SearchBar = ({ onSearch, currentDomain, value: controlledValue, placeholder }: SearchBarProps) => {
  const [internalValue, setInternalValue] = useState(controlledValue || '')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (controlledValue !== undefined && controlledValue !== internalValue) {
      setInternalValue(controlledValue)
    }
  }, [controlledValue])

  const setValue = (next: string) => {
    setInternalValue(next)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (onSearch && internalValue !== controlledValue) {
        onSearch(internalValue)
      }
    }, 280)
    return () => clearTimeout(timer)
  }, [internalValue, onSearch, controlledValue])

  const clear = () => {
    setInternalValue('')
    onSearch?.('')
    inputRef.current?.focus()
  }

  return (
    <div
      className={cn(
        'relative flex items-center h-11 transition-all duration-300 ease-out rounded-2xl select-none',
        focused
          ? 'bg-background w-full shadow-[0_0_0_2px_rgba(var(--primary),0.3)] ring-1 ring-primary/40'
          : 'bg-secondary/60 hover:bg-secondary/90 w-full border border-border/50 shadow-inner'
      )}
    >
      <IconSearch
        size={16}
        className={cn(
          'absolute left-3.5 transition-colors duration-200 shrink-0',
          focused ? 'text-primary' : 'text-muted-foreground'
        )}
      />
      <input
        ref={inputRef}
        type="text"
        value={internalValue}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder ?? `Search ${currentDomain === 'books' ? 'Books' : 'Manga'}...`}
        className="w-full h-full pl-10 pr-16 rounded-xl bg-transparent text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none caret-primary"
      />
      {internalValue ? (
        <button
          type="button"
          onClick={clear}
          className="absolute right-3 flex items-center justify-center w-5 h-5 rounded-full bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30 hover:text-foreground transition-colors"
          tabIndex={-1}
          aria-label="Clear search"
        >
          <IconX size={12} />
        </button>
      ) : (
        <kbd className="absolute right-3 hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border/60 bg-muted/50 text-[10px] font-semibold text-muted-foreground pointer-events-none">
          Ctrl K
        </kbd>
      )}
    </div>
  )
}

// ─── Main Topbar ───────────────────────────
export function PremiumTopbar({
  currentDomain,
  onDomainChange,
  onImportFiles,
  onImportFolder,
  onSearch,
  onOpenSettings,
  onOpenAdvancedFilter,
  onToggleSidebar,
  onAutoGroupManga,
  onOpenShortcuts,
  onCreateShelf,
  currentView,
  onNavigateToView,
  activeFilterCount = 0,
  searchValue,
  searchPlaceholder,
}: PremiumTopbarProps) {
  const preferences = usePreferencesStore((s) => s.preferences)
  const updateTheme = usePreferencesStore((s) => s.updateTheme)
  const shelves = useShelfStore((s) => s.shelves)

  const isDark = preferences?.theme === 'dark'

  const toggleTheme = async () => {
    if (preferences) {
      await updateTheme(isDark ? 'sepia' : 'dark')
    }
  }

  return (
    <TooltipProvider delayDuration={120}>
      <header
        data-tauri-drag-region
        className={cn(
          'flex items-center justify-between h-[58px] px-4 gap-4',
          'mx-2 mt-2 mb-1 rounded-2xl border border-border/40',
          'bg-card/80 backdrop-blur-2xl shadow-xs',
          'shrink-0 z-30 select-none max-md:hidden transition-all duration-200'
        )}
      >
        {/* ── ZONE 1: Left Actions & Domain Segmented Control ── */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Domain Segmented Control */}
          {preferences?.preferredContentType === 'both' && (
            <div className="relative flex items-center p-1 bg-secondary/80 border border-border/50 rounded-2xl h-11 shadow-inner">
              <div
                className="absolute top-1 bottom-1 rounded-xl bg-primary shadow-md shadow-primary/25 transition-all duration-300 ease-out z-0"
                style={{
                  left: currentDomain === 'books' ? '4px' : 'calc(50% + 2px)',
                  width: 'calc(50% - 6px)',
                }}
              />

              <button
                type="button"
                onClick={() => onDomainChange('books')}
                className={cn(
                  'relative z-10 flex items-center justify-center gap-2.5 px-6 h-full text-xs sm:text-sm font-bold rounded-xl transition-colors duration-200',
                  currentDomain === 'books' ? 'text-primary-foreground font-extrabold' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <IconBooks size={18} />
                <span>Books</span>
              </button>

              <button
                type="button"
                onClick={() => onDomainChange('manga_comics')}
                className={cn(
                  'relative z-10 flex items-center justify-center gap-2.5 px-6 h-full text-xs sm:text-sm font-bold rounded-xl transition-colors duration-200',
                  currentDomain === 'manga_comics' ? 'text-primary-foreground font-extrabold' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <IconManga size={18} />
                <span>Manga</span>
              </button>
            </div>
          )}
        </div>

        {/* ── ZONE 2: Center Search Bar ── */}
        <div className="flex-1 max-w-2xl px-3">
          <SearchBar
            onSearch={onSearch}
            currentDomain={currentDomain}
            value={searchValue}
            placeholder={searchPlaceholder}
          />
        </div>

        {/* ── ZONE 3: Right Actions & Tools ── */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Primary Import CTA */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2.5 h-11 px-5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm font-extrabold shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <IconImportBook size={18} />
                <span>Import</span>
                <ChevronDown size={15} className="opacity-80" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={10} className="w-72 rounded-2xl border p-2.5 z-[100] shiori-import-dropdown">
              <DropdownMenuItem onClick={onImportFiles} className="gap-3.5 p-3 cursor-pointer rounded-xl flex items-center group transition-colors shiori-import-dropdown-item">
                <div className="p-2.5 bg-primary/10 group-hover:bg-primary/20 rounded-xl shrink-0 transition-colors">
                  <IconImportBook size={20} className="text-primary" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs sm:text-sm font-bold transition-colors shiori-import-dropdown-text">Import Files</span>
                  <span className="text-[11px] font-medium leading-snug shiori-import-dropdown-subtext">Select individual books or manga</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="my-1.5 bg-border/40" />

              <DropdownMenuItem onClick={onImportFolder} className="gap-3.5 p-3 cursor-pointer rounded-xl flex items-center group transition-colors shiori-import-dropdown-item">
                <div className="p-2.5 bg-primary/10 group-hover:bg-primary/20 rounded-xl shrink-0 transition-colors">
                  <IconImportManga size={20} className="text-primary" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs sm:text-sm font-bold transition-colors shiori-import-dropdown-text">Import Folder</span>
                  <span className="text-[11px] font-medium leading-snug shiori-import-dropdown-subtext">Scan directory recursively</span>
                </div>
              </DropdownMenuItem>

              {currentDomain === 'manga_comics' && (
                <>
                  <DropdownMenuSeparator className="my-1.5 bg-border/40" />
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground/80 font-extrabold uppercase tracking-wider px-2 py-1">Organization</DropdownMenuLabel>
                  <FeatureHint
                    featureId="auto-group-manga"
                    title="Auto-group Manga Volumes"
                    description="Automatically detect and group manga volumes by series name from filenames."
                    position="left"
                  >
                    <DropdownMenuItem onClick={onAutoGroupManga} className="gap-3.5 p-3 cursor-pointer rounded-xl flex items-center group hover:bg-accent/80 focus:bg-accent/80 transition-colors">
                      <div className="p-2.5 bg-purple-500/10 group-hover:bg-purple-500/20 rounded-xl shrink-0 transition-colors">
                        <Layers size={20} className="text-purple-500" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs sm:text-sm font-bold text-foreground group-hover:text-purple-400 transition-colors">Group Volumes</span>
                        <span className="text-[11px] text-muted-foreground/80 font-medium leading-snug">Auto-detect series</span>
                      </div>
                    </DropdownMenuItem>
                  </FeatureHint>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Quick Tool Icons Cluster */}
          <div className="flex items-center gap-1 bg-secondary/50 border border-border/40 rounded-xl p-1">
            {/* RSS Reader */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onNavigateToView?.('rss-articles')}
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                    currentView === 'rss-articles' || currentView === 'rss-feeds'
                      ? 'text-primary bg-primary/10 font-bold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  <Rss size={17} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">RSS Feeds</TooltipContent>
            </Tooltip>

            {/* Reading Statistics */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onNavigateToView?.('statistics')}
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                    currentView === 'statistics'
                      ? 'text-primary bg-primary/10 font-bold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  <BarChart2 size={17} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">Reading Statistics</TooltipContent>
            </Tooltip>

            {/* Advanced Filters */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onOpenAdvancedFilter}
                  className={cn(
                    'relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                    activeFilterCount > 0
                      ? 'text-primary bg-primary/10 font-bold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  <Filter size={17} />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold shadow-sm">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">Advanced Filters</TooltipContent>
            </Tooltip>
          </div>

          <div className="w-px h-5 bg-border/40 mx-0.5" />

          {/* System Utility Cluster */}
          <div className="flex items-center gap-1 bg-secondary/50 border border-border/40 rounded-xl p-1">
            {/* Theme Switcher */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  {isDark ? <IconSun size={17} /> : <IconMoon size={17} />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">
                {isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              </TooltipContent>
            </Tooltip>

            {/* Keyboard Shortcuts */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onOpenShortcuts}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <HelpCircle size={17} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">Keyboard Shortcuts</TooltipContent>
            </Tooltip>

            {/* Settings */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Settings size={17} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">Settings</TooltipContent>
            </Tooltip>
          </div>

          {/* Window Controls */}
          <WindowControls />
        </div>
      </header>
    </TooltipProvider>
  )
}
