import { cn } from "@/lib/utils"
import { IconBooks, IconManga, IconSearch, IconFilter } from "@/components/icons/ShioriIcons"
import { useUIStore } from "@/store/uiStore"
import { usePreferencesStore } from "@/store/preferencesStore"
import { useLibraryStore, countActiveFilterCriteria } from "@/store/libraryStore"
import { useState, useRef, useEffect } from "react"
import { IconX } from "@/components/icons/ShioriIcons"
import { isAndroid } from "@/lib/tauri"

interface MobileStickyHeaderProps {
  searchQuery: string
  onSearchChange: (val: string) => void
  onOpenAdvancedFilter: () => void
}

export function MobileStickyHeader({ searchQuery, onSearchChange, onOpenAdvancedFilter }: MobileStickyHeaderProps) {
  const currentDomain = useUIStore((s) => s.currentDomain)
  const setCurrentDomain = useUIStore((s) => s.setCurrentDomain)
  const preferences = usePreferencesStore((s) => s.preferences)
  
  const activeFilters = useLibraryStore((s) => s.activeFilters)
  const activeFilterCount = countActiveFilterCriteria(activeFilters)

  const [internalValue, setInternalValue] = useState(searchQuery || '')
  const [searchFocused, setSearchFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync external changes
  useEffect(() => {
    if (searchQuery !== undefined && searchQuery !== internalValue) {
      setInternalValue(searchQuery)
    }
  }, [searchQuery])

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
    <div className={`sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/40 px-3 pb-3 ${isAndroid ? 'pt-[calc(env(safe-area-inset-top,0px)+2px)]' : 'pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]'} flex flex-col gap-3 md:hidden shadow-sm`}>
      <div className="flex items-center justify-between gap-3">
        {/* Domain Tabs */}
        {preferences?.preferredContentType === 'both' && (
          <div className="relative flex items-center p-1 bg-muted/50 border border-border/50 rounded-full h-12 flex-1 max-w-[200px] shadow-inner">
            <div 
              className="absolute top-1 bottom-1 rounded-full bg-background shadow-sm border border-border/50 transition-all duration-300 ease-out z-0"
              style={{ 
                left: currentDomain === 'books' ? '4px' : 'calc(50% + 2px)', 
                width: 'calc(50% - 6px)' 
              }} 
            />
            
            <button
              type="button"
              onClick={() => setCurrentDomain('books')}
              className={cn(
                'relative z-10 flex items-center justify-center gap-1.5 flex-1 text-xs font-bold rounded-full transition-colors duration-200',
                currentDomain === 'books' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <IconBooks size={14} />
              Books
            </button>
            
            <button
              type="button"
              onClick={() => setCurrentDomain('manga_comics')}
              className={cn(
                'relative z-10 flex items-center justify-center gap-1.5 flex-1 text-xs font-bold rounded-full transition-colors duration-200',
                currentDomain === 'manga_comics' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <IconManga size={14} />
              Manga
            </button>
          </div>
        )}

        {/* Filter Button */}
        <button
          type="button"
          onClick={onOpenAdvancedFilter}
          className={cn(
            'relative flex items-center justify-center min-h-[48px] px-4 rounded-full border shadow-sm transition-all duration-200',
            activeFilterCount > 0
              ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
              : 'bg-background text-foreground border-border hover:bg-accent'
          )}
        >
          <IconFilter size={14} className="mr-1.5" />
          <span className="text-xs font-semibold">Filter</span>
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-background text-foreground text-[10px] font-black shadow-sm ring-2 ring-background">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Search Input */}
      <div
        className={cn(
          'relative flex items-center h-10 w-full rounded-full transition-all duration-300 ease-out',
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
            'w-full h-full pl-10 pr-9 rounded-full',
            'bg-transparent text-sm text-foreground placeholder:text-muted-foreground',
            'focus:outline-none caret-primary'
          )}
        />
        {internalValue && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-3 flex items-center justify-center w-5 h-5 rounded-full bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30 hover:text-foreground transition-colors"
          >
            <IconX size={10} />
          </button>
        )}
      </div>
    </div>
  )
}
