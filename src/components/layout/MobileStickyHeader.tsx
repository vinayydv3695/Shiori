import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { IconBooks, IconManga, IconSearch, IconFilter } from "@/components/icons/ShioriIcons"
import { useUIStore } from "@/store/uiStore"
import { usePreferencesStore } from "@/store/preferencesStore"
import { useTheme } from "@/hooks/useTheme"
import { useLibraryStore, countActiveFilterCriteria } from "@/store/libraryStore"
import { useState, useRef, useEffect } from "react"
import { IconX, IconSun, IconMoon } from "@/components/icons/ShioriIcons"

interface MobileStickyHeaderProps {
  searchQuery: string
  onSearchChange: (val: string) => void
  onOpenAdvancedFilter: () => void
  hideThemeToggle?: boolean
}

export function MobileStickyHeader({ searchQuery, onSearchChange, onOpenAdvancedFilter, hideThemeToggle }: MobileStickyHeaderProps) {
  const currentDomain = useUIStore((s) => s.currentDomain)
  const setCurrentDomain = useUIStore((s) => s.setCurrentDomain)
  const preferences = usePreferencesStore((s) => s.preferences)
  const { isDark, toggleTheme } = useTheme()
  
  const activeFilters = useLibraryStore((s) => s.activeFilters)
  const activeFilterCount = countActiveFilterCriteria(activeFilters)

  const [internalValue, setInternalValue] = useState(searchQuery || '')
  const [searchFocused, setSearchFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync external changes (derived state: adjust during render, per React docs)
  if (searchQuery !== undefined && searchQuery !== internalValue) {
    setInternalValue(searchQuery)
  }

  // Debounce the callback to parent
  useEffect(() => {
    const timer = setTimeout(() => {
      if (internalValue !== searchQuery) {
        onSearchChange(internalValue)
      }
    }, 280)
    return () => clearTimeout(timer)
  }, [internalValue, onSearchChange, searchQuery])

  const clear = () => {
    setInternalValue('')
    onSearchChange('')
    inputRef.current?.focus()
  }

  return (
    <div
      className="sticky top-0 z-40 px-3 bg-background border-b border-border/40 pb-3 flex flex-col gap-3 md:hidden"
      style={{
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 12px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 12px)',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)'
      }}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Domain Tabs */}
        {preferences?.preferredContentType === 'both' && (
          <div className="relative grid grid-cols-2 p-1 bg-secondary/80 dark:bg-muted/50 border border-border/60 rounded-ui-full h-11 flex-1 max-w-[280px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.1),inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_2px_5px_rgba(0,0,0,0.4)] backdrop-blur-md">
            <button
              type="button"
              onClick={() => setCurrentDomain('books')}
              className={cn(
                'relative z-10 flex items-center justify-center gap-1.5 h-full text-xs font-bold rounded-ui-full transition-colors duration-200 cursor-pointer select-none',
                currentDomain === 'books'
                  ? 'text-primary-foreground font-extrabold drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {currentDomain === 'books' && (
                <motion.div
                  layoutId="mobile-domain-indicator"
                  className="absolute inset-0 rounded-ui-full bg-gradient-to-b from-primary via-primary to-primary/90 shadow-[0_2px_8px_rgba(0,0,0,0.22),0_1px_3px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.25)] border-t border-white/20 ring-1 ring-primary/30 z-0"
                  transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <IconBooks size={14} />
                <span>Books</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentDomain('manga_comics')}
              className={cn(
                'relative z-10 flex items-center justify-center gap-1.5 h-full text-xs font-bold rounded-ui-full transition-colors duration-200 cursor-pointer select-none',
                currentDomain === 'manga_comics'
                  ? 'text-primary-foreground font-extrabold drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {currentDomain === 'manga_comics' && (
                <motion.div
                  layoutId="mobile-domain-indicator"
                  className="absolute inset-0 rounded-ui-full bg-gradient-to-b from-primary via-primary to-primary/90 shadow-[0_2px_8px_rgba(0,0,0,0.22),0_1px_3px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.25)] border-t border-white/20 ring-1 ring-primary/30 z-0"
                  transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
                <IconManga size={14} />
                <span>Manga</span>
              </span>
            </button>
          </div>
        )}

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {!hideThemeToggle && (
            <button
              type="button"
              aria-label="Toggle theme"
              onClick={toggleTheme}
              className="relative flex items-center justify-center h-12 w-12 rounded-ui-full border shadow-sm transition-all duration-200 touch-target bg-background text-foreground border-border hover:bg-accent flex-shrink-0"
            >
              {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
            </button>
          )}

          <button
            type="button"
            onClick={onOpenAdvancedFilter}
              className={cn(
                'relative flex items-center justify-center h-12 px-3.5 rounded-ui-full border shadow-sm transition-all duration-200 touch-target flex-shrink-0',
                activeFilterCount > 0
                  ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                  : 'bg-background text-foreground border-border hover:bg-accent'
              )}
            >
              <IconFilter size={14} className="mr-1.5" />
              <span className="text-xs font-semibold">Filter</span>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-ui-full bg-background text-foreground text-[10px] font-black shadow-sm ring-2 ring-background">
                  {activeFilterCount}
                </span>
              )}
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div
        className={cn(
          'relative flex items-center h-10 w-full rounded-ui-full transition-all duration-300 ease-out',
          searchFocused
            ? 'bg-background shadow-[inset_0_1px_3px_rgba(0,0,0,0.1),0_0_0_2px_rgba(var(--primary),0.2)] dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.4),0_0_0_2px_rgba(var(--primary),0.3)] ring-1 ring-primary/20'
            : 'bg-muted/50 ring-1 ring-border/50'
        )}
      >
        <IconSearch
          size={16}
          className={cn(
            "absolute left-3 transition-colors duration-200",
            searchFocused ? "text-primary" : "text-muted-foreground"
          )}
        />
        <input
          ref={inputRef}
          type="text"
          value={internalValue}
          onChange={(e) => setInternalValue(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder={`Search ${currentDomain === 'books' ? 'Books' : 'Manga'}…`}
          className={cn(
            'w-full h-full pl-10 pr-9 rounded-ui-full',
            'bg-transparent text-sm text-foreground placeholder:text-muted-foreground',
            'focus:outline-none caret-primary'
          )}
        />
        {internalValue && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-3 flex items-center justify-center w-5 h-5 rounded-ui-full bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30 hover:text-foreground transition-colors touch-target"
          >
            <IconX size={10} />
          </button>
        )}
      </div>
    </div>
  )
}
