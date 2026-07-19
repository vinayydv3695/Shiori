import { cn } from '@/lib/utils';
import { Compass, Filter, Globe, BookOpen, Search } from 'lucide-react';
import { useState } from 'react';
import { OnlineSourceSelector } from './OnlineSourceSelector';
import { AdvancedOnlineSearchDialog } from './AdvancedOnlineSearchDialog';

import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useUIStore } from '@/store/uiStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { SourceKind } from '@/store/sourceStore';

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
    <div className={cn(
      "flex-shrink-0 relative overflow-hidden z-20 transition-colors duration-500",
      isMobile ? "sticky top-0 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2 px-3 bg-background/95 backdrop-blur-xl border-b border-border/40" : "bg-background/60 backdrop-blur-3xl pt-8 pb-6 px-8"
    )}>
      {/* Subtle ambient glass glow */}
      {!isMobile && <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -z-10 pointer-events-none" />}
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col gap-3 md:gap-6">
          <div className="hidden md:flex items-center justify-between">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground drop-shadow-sm">
              {title}
            </h1>
            <OnlineSourceSelector kind={kind} variant="secondary" className="h-10 px-4 bg-secondary/80 hover:bg-secondary text-secondary-foreground border border-border rounded-md shadow-sm backdrop-blur-md" />
          </div>

          <div className="relative group">
            {isMobile ? (
              // Mobile Premium Search Bar (Precision Noir)
              <div className="flex items-center bg-background/60 backdrop-blur-xl border border-border/50 rounded-full p-1.5 focus-within:border-primary/50 focus-within:bg-background transition-all duration-300 shadow-sm">
                
                {/* Left side actions */}
                <div className="flex items-center gap-1 pl-1 shrink-0">
                  <Search className="w-4 h-4 text-muted-foreground ml-2 mr-1 hidden sm:block" />
                  
                  {/* Filter Option */}
                  {(kind === 'books' || kind === 'manga') && (
                    <button 
                      onClick={() => kind === 'books' ? setAdvancedOpen(true) : onMobileFilterClick?.()}
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0",
                        (kind === 'books' && hasFilters) || kind === 'manga'
                          ? "bg-primary text-primary-foreground shadow-md" 
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/80 bg-background/50"
                      )}
                      disabled={disabled}
                      title="Filters"
                    >
                      <Filter className="w-4 h-4" />
                    </button>
                  )}

                  {/* Sources Option */}
                  <OnlineSourceSelector 
                    kind={kind} 
                    variant="ghost" 
                    className="w-9 h-9 p-0 rounded-full flex items-center justify-center transition-all hover:bg-secondary/80 text-muted-foreground shrink-0 max-md:[&>span]:hidden" 
                  />
                </div>
                
                {/* Input */}
                <input
                  value={searchValue}
                  onChange={(e) => onSearchValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmit();
                  }}
                  placeholder={kind === 'books' ? 'Search books...' : 'Search manga...'}
                  className="flex-1 bg-transparent border-none outline-none text-[15px] font-medium text-foreground placeholder:text-muted-foreground/60 focus:ring-0 py-2 px-3 min-w-0"
                  disabled={disabled}
                />
                
                {/* Right side actions */}
                <div className="flex items-center pr-1 shrink-0">
                  {searchValue.trim() && (
                    <button 
                      onClick={onSubmit} 
                      disabled={loading || disabled}
                      className="px-4 py-1.5 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 disabled:opacity-50 transition-all shadow-md active:scale-95"
                    >
                      Go
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center bg-secondary/40 hover:bg-secondary/60 focus-within:bg-secondary/80 border border-white/5 focus-within:border-primary/50 rounded-2xl p-2 transition-all duration-300 shadow-xl backdrop-blur-2xl">
                <Compass className="w-6 h-6 text-muted-foreground ml-4 shrink-0 transition-colors duration-300 group-focus-within:text-primary" />
                <input
                  value={searchValue}
                  onChange={(e) => onSearchValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmit();
                  }}
                  placeholder={kind === 'books' ? 'Search your library...' : 'Search manga by title...'}
                  className="w-full bg-transparent border-none outline-none text-xl md:text-2xl font-medium text-foreground placeholder:text-muted-foreground/40 focus:ring-0 py-3 px-4 h-14 transition-all"
                  disabled={disabled}
                />
                <div className="flex items-center gap-2 pr-1 shrink-0">
                  {(kind === 'books' || kind === 'manga') && (
                    <button 
                      onClick={() => kind === 'books' ? setAdvancedOpen(true) : onMobileFilterClick?.()}
                      className={cn(
                        "p-3.5 rounded-xl transition-all flex items-center justify-center",
                        (kind === 'books' && hasFilters) || kind === 'manga'
                          ? "bg-primary/20 text-primary hover:bg-primary/30 border border-primary/20 shadow-inner" 
                          : "text-muted-foreground hover:text-foreground hover:bg-white/10 bg-transparent"
                      )}
                      disabled={disabled}
                      title="Filters"
                    >
                      <Filter className="w-5 h-5" />
                    </button>
                  )}
                  <button 
                    onClick={onSubmit} 
                    disabled={loading || (!searchValue.trim() && !hasFilters) || disabled}
                    className="px-8 py-3.5 text-base rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 disabled:bg-muted disabled:from-muted disabled:to-muted disabled:text-muted-foreground transition-all shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] hover:-translate-y-0.5 active:translate-y-0"
                  >
                    Search
                  </button>
                </div>
              </div>
            )}
          </div>

          {isMobile && preferences?.preferredContentType === 'both' && (
            <div className="flex px-2 gap-2 mt-2">
              <button
                onClick={() => setCurrentView('online-books')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 text-[14px] font-semibold rounded-full transition-all relative overflow-hidden",
                  kind === 'books'
                    ? "text-primary-foreground bg-primary shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Globe className="w-4 h-4" /> Books
              </button>
              <button
                onClick={() => setCurrentView('online-manga')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 text-[14px] font-semibold rounded-full transition-all relative overflow-hidden",
                  kind === 'manga'
                    ? "text-primary-foreground bg-primary shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <BookOpen className="w-4 h-4" /> Manga
              </button>
            </div>
          )}
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
