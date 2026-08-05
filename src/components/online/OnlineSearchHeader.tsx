import { cn } from '@/lib/utils';
import { Compass, Filter, Globe, BookOpen, Search } from 'lucide-react';
import { useState } from 'react';
import { OnlineSourceSelector } from './OnlineSourceSelector';
import { DownloadsButton } from './DownloadQueuePanel';
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
      isMobile ? "sticky top-0 pt-2 pb-2 px-3 bg-background/80 backdrop-blur-xl border-b border-border/40" : "bg-background/40 backdrop-blur-3xl pt-4 pb-3 px-6 md:px-8 border-b border-border/30"
    )}>
      {/* Subtle ambient glass glow */}
      {!isMobile && <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -z-10 pointer-events-none" />}
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="hidden md:flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground drop-shadow-sm">
                {title}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <OnlineSourceSelector kind={kind} variant="secondary" className="h-9 px-4 bg-secondary/70 hover:bg-secondary text-foreground border border-border/60 rounded-xl shadow-sm backdrop-blur-xl text-xs font-bold" />
              <DownloadsButton />
            </div>
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
              <div className="flex items-center bg-card/60 hover:bg-card/90 focus-within:bg-card border border-border/50 focus-within:border-primary/50 rounded-2xl p-1.5 transition-all duration-300 shadow-lg backdrop-blur-2xl">
                <Compass className="w-5 h-5 text-muted-foreground ml-3 shrink-0 transition-colors duration-300 group-focus-within:text-primary" />
                <input
                  value={searchValue}
                  onChange={(e) => onSearchValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmit();
                  }}
                  placeholder={kind === 'books' ? 'Search online books by title or author...' : 'Search manga by title...'}
                  className="w-full bg-transparent border-none outline-none text-base md:text-lg font-bold text-foreground placeholder:text-muted-foreground/50 focus:ring-0 py-2 px-3 h-11 transition-all"
                  disabled={disabled}
                />
                <div className="flex items-center gap-2 pr-1 shrink-0">
                  {(kind === 'books' || kind === 'manga') && (
                    <button 
                      onClick={() => kind === 'books' ? setAdvancedOpen(true) : onMobileFilterClick?.()}
                      className={cn(
                        "p-2.5 rounded-xl transition-all flex items-center justify-center",
                        (kind === 'books' && hasFilters) || kind === 'manga'
                          ? "bg-primary/20 text-primary hover:bg-primary/30 border border-primary/20 shadow-inner" 
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 bg-transparent"
                      )}
                      disabled={disabled}
                      title="Filters"
                    >
                      <Filter className="w-4 h-4" />
                    </button>
                  )}
                  <button 
                    onClick={onSubmit} 
                    disabled={loading || (!searchValue.trim() && !hasFilters) || disabled}
                    className="px-6 py-2.5 text-sm rounded-xl bg-primary text-primary-foreground font-extrabold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md shadow-primary/25 hover:scale-[1.02] active:scale-95"
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
