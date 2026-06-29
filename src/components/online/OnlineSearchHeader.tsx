import { Search, Filter } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { OnlineSourceSelector } from './OnlineSourceSelector';
import { AdvancedOnlineSearchDialog } from './AdvancedOnlineSearchDialog';

import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { usePreferencesStore } from '@/store/preferencesStore';
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
}: OnlineSearchHeaderProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const filters = useOnlineSearchStore(state => state.filters[kind === 'books' ? 'online-books' : 'online-manga']);
  const hasFilters = Object.keys(filters || {}).length > 0;
  const preferences = usePreferencesStore(state => state.preferences);
  const updateGeneralSettings = usePreferencesStore(state => state.updateGeneralSettings);

  return (
    <div className="flex-shrink-0 bg-background/60 backdrop-blur-3xl border-b border-border pt-16 pb-8 px-8 relative overflow-hidden z-10 transition-colors duration-500">
      {/* Subtle ambient glass glow */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground drop-shadow-sm">
              {title}
            </h1>
            <OnlineSourceSelector kind={kind} variant="secondary" className="h-10 px-4 bg-secondary/80 hover:bg-secondary text-secondary-foreground border border-border rounded-md shadow-sm backdrop-blur-md" />
          </div>

          <div className="relative group">
            <div className="flex items-end border-b border-border focus-within:border-primary transition-colors duration-300 pb-2">
              <Search className="w-6 h-6 text-muted-foreground mb-4 mr-4" />
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
              <div className="flex items-center gap-3 mb-2 ml-4">
                {kind === 'books' && (
                  <button 
                    onClick={() => setAdvancedOpen(true)}
                    className={`p-3 rounded-xl transition-all ${hasFilters ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'}`}
                    disabled={disabled}
                    title="Advanced Search"
                  >
                    <Filter className="w-5 h-5" />
                  </button>
                )}
                <button 
                  onClick={onSubmit} 
                  disabled={loading || (!searchValue.trim() && !hasFilters) || disabled}
                  className="px-6 py-3 rounded-xl bg-foreground text-background font-semibold hover:bg-foreground/90 disabled:opacity-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
                >
                  Search
                </button>
              </div>
            </div>
            <div className="flex justify-end pt-3 pr-2 text-sm text-muted-foreground">
              <label className="flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors select-none">
                <input
                  type="checkbox"
                  checked={preferences?.includeNsfw ?? false}
                  onChange={(e) => updateGeneralSettings({ includeNsfw: e.target.checked })}
                  className="rounded border-border text-primary focus:ring-primary/20 bg-background/50 cursor-pointer"
                />
                Include NSFW Content
              </label>
            </div>
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
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm font-medium text-destructive shadow-inner">
            {disabledMessage}
          </div>
        )}
      </div>
    </div>
  );
}
