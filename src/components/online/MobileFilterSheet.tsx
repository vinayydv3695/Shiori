import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, ChevronDown, CircleDot, Circle, Square, CheckSquare, ArrowDownUp, LayoutGrid, Tags, Shuffle, ShieldAlert } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { usePreferencesStore } from '@/store/preferencesStore';

const GENRES = [
  'Action', 'Adventure', 'Avant Garde', 'Boys Love', 'Comedy', 'Demons',
  'Drama', 'Ecchi', 'Fantasy', 'Girls Love', 'Gourmet', 'Harem',
  'Horror', 'Isekai', 'Iyashikei', 'Josei', 'Kids', 'Magic',
  'Mahou Shoujo', 'Martial Arts', 'Mecha', 'Military', 'Music', 'Mystery',
  'Parody', 'Psychological', 'Reverse Harem', 'Romance', 'School', 'Sci-Fi',
  'Seinen', 'Shoujo', 'Shounen', 'Slice of Life', 'Space', 'Sports',
  'Super Power', 'Supernatural', 'Suspense', 'Thriller', 'Vampire'
];

const TYPES = ['Manga', 'One-Shot', 'Doujinshi', 'Novel', 'Manhwa', 'Manhua'];
const MODES = [
  { id: 'popular', label: 'Popular' },
  { id: 'Newest', label: 'Newest' },
  { id: 'Updated', label: 'Updated' },
  { id: 'Added', label: 'Added' }
];

interface MobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeGenres: string[];
  activeTypes: string[];
  activeMode: string;
  onApply: (genres: string[], types: string[], mode: string) => void;
  onRandomClick?: () => void;
}

export function MobileFilterSheet({
  open,
  onOpenChange,
  activeGenres: initialGenres,
  activeTypes: initialTypes,
  activeMode: initialMode,
  onApply,
  onRandomClick
}: MobileFilterSheetProps) {
  const [genres, setGenres] = useState<string[]>(initialGenres);
  const [types, setTypes] = useState<string[]>(initialTypes);
  const [mode, setMode] = useState<string>(initialMode);
  
  const [isTypesExpanded, setIsTypesExpanded] = useState(true);
  const [isGenresExpanded, setIsGenresExpanded] = useState(true);

  const preferences = usePreferencesStore(state => state.preferences);
  const updateGeneralSettings = usePreferencesStore(state => state.updateGeneralSettings);

  const handleReset = () => {
    setGenres([]);
    setTypes([]);
    setMode('popular');
  };

  const handleApply = () => {
    onApply(genres, types, mode);
    onOpenChange(false);
  };

  const toggleGenre = (genre: string) => {
    setGenres(prev => prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]);
  };

  const toggleType = (type: string) => {
    setTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "shiori-select-content fixed z-50 p-0 border border-border flex flex-col shadow-2xl overflow-hidden [&>button.absolute]:hidden transition-all duration-300",
        "md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[92vw] md:max-w-[500px] md:max-h-[85vh] md:rounded-3xl",
        "max-md:bottom-0 max-md:top-auto max-md:left-0 max-md:right-0 max-md:translate-x-0 max-md:translate-y-0 max-md:w-full max-md:max-h-[88vh] max-md:rounded-t-3xl max-md:rounded-b-none"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 shrink-0 bg-secondary/30">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-foreground tracking-tight">Filter Manga</h2>
            {(genres.length > 0 || types.length > 0 || mode !== 'popular') && (
              <span className="bg-primary/20 text-primary text-xs font-bold px-2.5 py-0.5 rounded-full">
                {genres.length + types.length + (mode !== 'popular' ? 1 : 0)} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="text-xs font-bold text-muted-foreground hover:text-primary px-2.5 py-1 rounded-lg hover:bg-secondary transition-colors">
              Reset
            </button>
            <button onClick={() => onOpenChange(false)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-secondary/60 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Body */}
        <ScrollArea className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-6">
            {/* Quick Actions (Random + NSFW) */}
            <div className="grid grid-cols-2 gap-3">
              {onRandomClick && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onRandomClick();
                  }}
                  className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary font-extrabold text-xs transition-all shadow-sm active:scale-95"
                >
                  <Shuffle className="w-4 h-4" /> Random Manga
                </button>
              )}
              
              <label className={cn(
                "flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-extrabold cursor-pointer transition-all select-none",
                preferences?.includeNsfw 
                  ? "bg-red-500/15 border-red-500/40 text-red-500 shadow-sm" 
                  : "bg-secondary/30 border-border/40 text-muted-foreground hover:text-foreground"
              )}>
                <input
                  type="checkbox"
                  checked={preferences?.includeNsfw ?? false}
                  onChange={(e) => updateGeneralSettings({ includeNsfw: e.target.checked })}
                  className="sr-only"
                />
                <ShieldAlert className="w-4 h-4" />
                <span>NSFW Content</span>
              </label>
            </div>

            {/* Sort Mode */}
            <div>
              <h3 className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest mb-3 px-1 flex items-center gap-2">
                <ArrowDownUp className="w-3.5 h-3.5 text-primary" /> Sort By
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {MODES.map(m => {
                  const isSelected = mode.toLowerCase() === m.id.toLowerCase();
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl text-xs font-extrabold transition-all border",
                        isSelected 
                          ? "bg-primary text-primary-foreground border-primary/50 shadow-md shadow-primary/20" 
                          : "bg-secondary/30 border-border/40 text-foreground hover:bg-secondary/60"
                      )}
                    >
                      <span>{m.label}</span>
                      {isSelected ? <CircleDot className="w-4 h-4" /> : <Circle className="w-4 h-4 opacity-30" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Types */}
            <div>
              <button 
                type="button"
                onClick={() => setIsTypesExpanded(!isTypesExpanded)}
                className="w-full flex items-center justify-between text-xs font-extrabold text-muted-foreground uppercase tracking-widest mb-3 px-1"
              >
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-3.5 h-3.5 text-primary" /> Types {types.length > 0 && `(${types.length})`}
                </div>
                <ChevronDown className={cn("w-4 h-4 transition-transform", isTypesExpanded ? "rotate-180" : "")} />
              </button>
              
              {isTypesExpanded && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TYPES.map(type => {
                    const isSelected = types.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleType(type)}
                        className={cn(
                          "flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all border",
                          isSelected 
                            ? "bg-primary/20 text-primary border-primary/40 shadow-sm" 
                            : "bg-secondary/20 border-border/30 text-foreground hover:bg-secondary/50"
                        )}
                      >
                        <span className="truncate">{type}</span>
                        {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0" /> : <Square className="w-3.5 h-3.5 opacity-30 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Genres */}
            <div>
              <button 
                type="button"
                onClick={() => setIsGenresExpanded(!isGenresExpanded)}
                className="w-full flex items-center justify-between text-xs font-extrabold text-muted-foreground uppercase tracking-widest mb-3 px-1"
              >
                <div className="flex items-center gap-2">
                  <Tags className="w-3.5 h-3.5 text-primary" /> Genres {genres.length > 0 && `(${genres.length})`}
                </div>
                <ChevronDown className={cn("w-4 h-4 transition-transform", isGenresExpanded ? "rotate-180" : "")} />
              </button>
              
              {isGenresExpanded && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-60 overflow-y-auto pr-1">
                  {GENRES.map(genre => {
                    const isSelected = genres.includes(genre);
                    return (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => toggleGenre(genre)}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-xl text-[11px] font-bold transition-all border",
                          isSelected 
                            ? "bg-primary text-primary-foreground border-primary/50 shadow-sm" 
                            : "bg-secondary/20 border-border/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                        )}
                      >
                        <span className="truncate">{genre}</span>
                        {isSelected && <CheckSquare className="w-3 h-3 text-primary-foreground shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
        
        {/* Footer */}
        <div className="p-4 bg-secondary/30 border-t border-border/50 shrink-0">
          <Button onClick={handleApply} className="w-full h-11 rounded-2xl text-sm font-extrabold shadow-lg shadow-primary/25">
            Apply Filters {genres.length + types.length > 0 ? `(${genres.length + types.length})` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
