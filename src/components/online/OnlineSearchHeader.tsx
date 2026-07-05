import { cn } from '@/lib/utils';
import { Compass, Filter, Globe, BookOpen, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
      "flex-shrink-0 relative overflow-hidden z-10 transition-colors duration-500",
      isMobile ? "pt-12 pb-2 px-3 bg-background" : "bg-background/60 backdrop-blur-3xl border-b border-border pt-16 pb-8 px-8"
    )}>
      {/* Subtle ambient glass glow */}
      {!isMobile && <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -z-10 pointer-events-none" />}
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col gap-3 md:gap-6">
          <div className="hidden md:flex items-center justify-between">
            <h1 className="text-5xl font-semibold tracking-tight text-foreground drop-shadow-sm">
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
              // Desktop Search Bar
              <div className="flex items-end border-b border-border focus-within:border-primary transition-colors duration-300 pb-2">
                <Compass className="w-6 h-6 text-muted-foreground mb-4 mr-4" />
                <input
                  value={searchValue}
                  onChange={(e) => onSearchValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmit();
                  }}
                  placeholder={kind === 'books' ? 'Search your library...' : 'Search manga by title...'}
                  className="w-full bg-transparent border-none outline-none text-2xl font-medium text-foreground placeholder:text-muted-foreground/50 focus:ring-0 py-4 px-0"
                  disabled={disabled}
                />
                <div className="flex items-center gap-3 mb-0.5 ml-4">
                  {(kind === 'books' || kind === 'manga') && (
                    <button 
                      onClick={() => kind === 'books' ? setAdvancedOpen(true) : onMobileFilterClick?.()}
                      className={`p-3 rounded-xl transition-all ${hasFilters || kind === 'manga' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'}`}
                      disabled={disabled}
                      title="Filters"
                    >
                      <Filter className="w-5 h-5" />
                    </button>
                  )}
                  <button 
                    onClick={onSubmit} 
                    disabled={loading || (!searchValue.trim() && !hasFilters) || disabled}
                    className="px-6 py-3 text-base rounded-xl bg-foreground text-background font-semibold hover:bg-foreground/90 disabled:opacity-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
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
                    ? "text-foreground bg-secondary/40 shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/10"
                )}
              >
                <Globe className="w-4 h-4" /> Books
              </button>
              <button
                onClick={() => setCurrentView('online-manga')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 text-[14px] font-semibold rounded-full transition-all relative overflow-hidden",
                  kind === 'manga'
                    ? "text-foreground bg-secondary/40 shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/10"
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
