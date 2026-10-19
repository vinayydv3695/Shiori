import { cn } from '@/lib/utils';
import { Compass, Filter, Globe, BookOpen, Search, X } from 'lucide-react';
import { useState } from 'react';
import { isAndroid } from '@/lib/tauri';
import { OnlineSourceSelector } from './OnlineSourceSelector';
import { DownloadsButton } from './DownloadQueuePanel';
import { AdvancedOnlineSearchDialog } from './AdvancedOnlineSearchDialog';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useUIStore } from '@/store/uiStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { SourceKind } from '@/store/sourceStore';
import { AppTooltip } from '@/components/ui/tooltip';

interface OnlineSearchHeaderProps {
  kind: SourceKind;
  title: string;
  subtitle: string;
  searchValue: string;
  loading: boolean;
  disabled: boolean;
  disabledMessage?: string;
  onSearchValueChange: (value: string) => void;
  onSubmit: () => void;
  onMobileFilterClick?: () => void;
}

export function OnlineSearchHeader({
  kind,
  title,
  subtitle,
  searchValue,
  loading,
  disabled,
  disabledMessage,
  onSearchValueChange,
  onSubmit,
  onMobileFilterClick,
}: OnlineSearchHeaderProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const filters = useOnlineSearchStore(state => state.filters[kind === 'books' ? 'online-books' : 'online-manga']);
  const hasFilters = Object.keys(filters || {}).length > 0;
  const preferences = usePreferencesStore(state => state.preferences);
  const updateGeneralSettings = usePreferencesStore(state => state.updateGeneralSettings);
  const isMobile = useIsMobile();
  const setCurrentView = useUIStore(state => state.setCurrentView);

  return (
    <div 
      className={cn(
        "flex-shrink-0 relative overflow-hidden z-20 transition-colors duration-500",
        isMobile ? "sticky top-0 pb-2 px-3 bg-background/95 backdrop-blur-xl border-b border-border/40 shadow-2xs" : "bg-background/40 backdrop-blur-3xl pt-4 pb-3 px-6 md:px-8 border-b border-border/30"
      )}
      style={isMobile ? {
        paddingTop: isAndroid ? '8px' : 'max(env(safe-area-inset-top, 0px), 6px)',
        paddingLeft: isAndroid ? '12px' : 'calc(env(safe-area-inset-left, 0px) + 12px)',
        paddingRight: isAndroid ? '12px' : 'calc(env(safe-area-inset-right, 0px) + 12px)',
      } : undefined}
    >
      {/* Subtle ambient glass glow */}
      {!isMobile && <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -z-10 pointer-events-none" />}
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col md:gap-4">
          <div className="hidden md:flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground drop-shadow-sm">
                {title}
              </h1>
              <span className="px-3 py-0.5 text-[11px] font-bold bg-primary/10 text-primary border border-primary/20 rounded-full shadow-xs">
                {kind === 'books' ? 'Multi-Source Catalog' : 'Manga Catalog'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {kind === 'manga' && (
                <OnlineSourceSelector kind={kind} variant="secondary" className="h-9 px-4 bg-card/75 hover:bg-card text-foreground border border-border/50 hover:border-primary/40 rounded-full shadow-xs backdrop-blur-xl text-xs font-bold transition-all" />
              )}
              <DownloadsButton />
            </div>
          </div>

          {/* Android / Mobile Category Switcher (Books vs Manga) */}
          {isMobile && preferences?.preferredContentType === 'both' && (
            <div className="flex p-1 bg-secondary/60 dark:bg-secondary/40 rounded-2xl border border-border/40 mb-2 gap-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setCurrentView('online-books')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-bold rounded-xl transition-all duration-200 active:scale-95",
                  kind === 'books'
                    ? "bg-card text-foreground shadow-xs border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Books</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('online-manga')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-bold rounded-xl transition-all duration-200 active:scale-95",
                  kind === 'manga'
                    ? "bg-card text-foreground shadow-xs border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Manga</span>
              </button>
            </div>
          )}

          <div className="relative group">
            {isMobile ? (
              // Mobile / Android Search Header: Elegant 2-row layout
              <div className="flex flex-col gap-2">
                {/* 1. Main Search Bar Row */}
                <div className="flex items-center bg-card/95 backdrop-blur-xl border border-border/70 rounded-2xl px-2.5 py-1 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all duration-300 shadow-xs">
                  {/* Search Icon */}
                  <div className="pl-1 pr-2 text-muted-foreground/70 shrink-0">
                    <Search className="w-4 h-4 stroke-[2.2]" />
                  </div>

                  {/* Input Field */}
                  <input
                    value={searchValue}
                    onChange={(e) => onSearchValueChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSubmit();
                    }}
                    placeholder={kind === 'books' ? 'Search books by title, author...' : 'Search manga by title, author...'}
                    className="flex-1 bg-transparent border-none outline-none text-xs sm:text-sm font-semibold text-foreground placeholder:text-muted-foreground/50 focus:ring-0 py-2 px-1 min-w-0"
                    disabled={disabled}
                  />

                  {/* Clear Button */}
                  {searchValue && (
                    <button
                      type="button"
                      onClick={() => onSearchValueChange('')}
                      className="p-1 rounded-full text-muted-foreground hover:text-foreground active:scale-90 transition-transform mr-1.5"
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Search CTA */}
                  <button
                    onClick={onSubmit}
                    disabled={loading || disabled || (!searchValue.trim() && !hasFilters)}
                    className="px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-40 transition-all shadow-xs active:scale-95 shrink-0"
                  >
                    Search
                  </button>
                </div>

                {/* 2. Accessory Action Strip (Source Selector, Filter, Downloads) */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scrollbar-none [&::-webkit-scrollbar]:hidden px-0.5">
                  {/* Source Selector Pill */}
                  <OnlineSourceSelector
                    kind={kind}
                    variant="secondary"
                    className="h-8 px-2.5 rounded-xl text-xs font-bold bg-card/90 hover:bg-card border border-border/70 shrink-0 shadow-2xs"
                  />

                  {/* Filter Pill */}
                  {(kind === 'books' || kind === 'manga') && (
                    <button
                      type="button"
                      onClick={() => kind === 'books' ? setAdvancedOpen(true) : onMobileFilterClick?.()}
                      aria-label="Filters"
                      className={cn(
                        "h-8 px-3 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all shrink-0 active:scale-95 border",
                        (kind === 'books' && hasFilters) || (kind === 'manga' && hasFilters)
                          ? "bg-primary text-primary-foreground border-primary/50 shadow-2xs"
                          : "bg-card/90 hover:bg-card text-foreground/80 border-border/70 shadow-2xs"
                      )}
                      disabled={disabled}
                    >
                      <Filter className="w-3.5 h-3.5 stroke-[2.2]" />
                      <span>Filters</span>
                      {hasFilters && (
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      )}
                    </button>
                  )}

                  {/* Downloads Queue on Right */}
                  <div className="ml-auto shrink-0">
                    <DownloadsButton iconOnly className="w-8 h-8 rounded-xl shadow-2xs" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center bg-card/75 hover:bg-card focus-within:bg-card border border-border/50 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15 rounded-2xl p-1.5 transition-all duration-300 shadow-md backdrop-blur-2xl">
                <Search className="w-5 h-5 text-muted-foreground ml-3.5 shrink-0 transition-colors duration-300 group-focus-within:text-primary stroke-[2.2]" />
                <input
                  value={searchValue}
                  onChange={(e) => onSearchValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmit();
                  }}
                  placeholder={kind === 'books' ? 'Search online books by title or author...' : 'Search manga by title or author...'}
                  className="w-full bg-transparent border-none outline-none text-sm md:text-base font-semibold text-foreground placeholder:text-muted-foreground/50 focus:ring-0 py-2 px-3 h-11 transition-all"
                  disabled={disabled}
                />
                <div className="flex items-center gap-2 pr-1 shrink-0">
                  {(kind === 'books' || kind === 'manga') && (
                    <AppTooltip content="Filters" side="bottom">
                      <button 
                        onClick={() => kind === 'books' ? setAdvancedOpen(true) : onMobileFilterClick?.()}
                        aria-label="Filters"
                        className={cn(
                          "p-2.5 rounded-xl transition-all flex items-center justify-center",
                          (kind === 'books' && hasFilters) || kind === 'manga'
                            ? "bg-primary/20 text-primary hover:bg-primary/30 border border-primary/25 shadow-inner" 
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 bg-transparent"
                        )}
                        disabled={disabled}
                      >
                        <Filter className="w-4 h-4 stroke-[2.2]" />
                      </button>
                    </AppTooltip>
                  )}
                  <button 
                    onClick={onSubmit} 
                    disabled={loading || (!searchValue.trim() && !hasFilters) || disabled}
                    className="px-6 py-2.5 text-xs sm:text-sm rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md shadow-primary/25 hover:scale-[1.02] active:scale-95"
                  >
                    Search
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {kind === 'books' && (
          <AdvancedOnlineSearchDialog 
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            onSearch={onSubmit}
          />
        )}

        {disabled && disabledMessage && (
          <div className="mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm font-medium text-destructive shadow-inner">
            {disabledMessage}
          </div>
        )}
      </div>
    </div>
  );
}
