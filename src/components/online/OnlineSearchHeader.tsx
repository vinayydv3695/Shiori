import { Search, Filter } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { OnlineSourceSelector } from './OnlineSourceSelector';
import { AdvancedOnlineSearchDialog } from './AdvancedOnlineSearchDialog';

import { useOnlineSearchStore } from '@/store/onlineSearchStore';
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

  return (
    <div className="flex-shrink-0 border-b border-white/5 bg-gradient-to-b from-background to-background/80 backdrop-blur-2xl p-8 relative overflow-hidden z-10">
      {/* Decorative gradient orbs for a premium glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[128px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-[96px] -z-10 pointer-events-none" />
      
      <div className="max-w-5xl mx-auto space-y-8 relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              {title}
            </h1>
            <p className="text-sm font-medium text-muted-foreground/80 mt-1">{subtitle}</p>
          </div>
          <div className="shadow-lg shadow-black/20 rounded-xl overflow-hidden">
            <OnlineSourceSelector kind={kind} variant="secondary" className="h-11 px-5 border-none bg-secondary/80 hover:bg-secondary backdrop-blur-xl transition-all font-medium" />
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <div className="relative flex-1 group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent rounded-2xl blur-md opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center bg-background/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 focus-within:border-primary/50 focus-within:bg-background/80 focus-within:shadow-2xl focus-within:shadow-primary/10">
              <Search className="absolute left-4 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
              <input
                value={searchValue}
                onChange={(e) => onSearchValueChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSubmit();
                }}
                placeholder={kind === 'books' ? 'Search by title, author, ISBN...' : 'Search manga by title...'}
                className="w-full h-14 pl-12 pr-4 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60 focus:ring-0 text-base"
                disabled={disabled}
              />
            </div>
          </div>
          {kind === 'books' && (
            <Button 
              variant={hasFilters ? "default" : "secondary"}
              onClick={() => setAdvancedOpen(true)}
              className={`h-14 w-14 rounded-2xl shadow-lg transition-all duration-300 flex items-center justify-center ${hasFilters ? 'shadow-primary/25 hover:shadow-primary/40 bg-primary text-primary-foreground' : 'bg-background/60 backdrop-blur-xl border border-white/10 hover:bg-background/80 hover:border-white/20'}`}
              disabled={disabled}
              title="Advanced Search"
            >
              <Filter className={`w-5 h-5 ${hasFilters ? '' : 'text-muted-foreground'}`} />
            </Button>
          )}
          <Button 
            onClick={onSubmit} 
            disabled={loading || (!searchValue.trim() && !hasFilters) || disabled}
            className="h-14 px-8 rounded-2xl bg-foreground text-background hover:bg-foreground/90 shadow-lg shadow-black/20 hover:shadow-black/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 font-semibold text-base"
          >
            {loading ? 'Searching...' : 'Search'}
          </Button>
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
