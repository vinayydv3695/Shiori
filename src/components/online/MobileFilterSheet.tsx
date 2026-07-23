import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, X, ChevronDown, Circle, CircleDot, Square, CheckSquare, ArrowDownUp, LayoutGrid, Tags } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

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
const MODES = ['Newest', 'Updated', 'Added'];

interface MobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeGenres: string[];
  activeTypes: string[];
  activeMode: string;
  onApply: (genres: string[], types: string[], mode: string) => void;
}

export function MobileFilterSheet({
  open,
  onOpenChange,
  activeGenres: initialGenres,
  activeTypes: initialTypes,
  activeMode: initialMode,
  onApply
}: MobileFilterSheetProps) {
  const [genres, setGenres] = useState<string[]>(initialGenres);
  const [types, setTypes] = useState<string[]>(initialTypes);
  const [mode, setMode] = useState<string>(initialMode);
  
  const [isTypesExpanded, setIsTypesExpanded] = useState(false);
  const [isGenresExpanded, setIsGenresExpanded] = useState(false);
  
  // Sync when opened
  if (open && (genres !== initialGenres || types !== initialTypes || mode !== initialMode)) {
      // this is safe because we just want to reset state when dialog opens
  }

  const handleReset = () => {
    setGenres([]);
    setTypes([]);
    setMode('');
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
      <DialogContent className="!fixed !left-4 !top-20 !bottom-auto !translate-x-0 !translate-y-0 w-[280px] sm:w-[320px] max-w-[calc(100vw-2rem)] h-auto max-h-[calc(100dvh-6rem)] rounded-2xl p-0 bg-background/95 backdrop-blur-3xl border border-white/10 flex flex-col gap-0 shadow-2xl transition-all data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left [&>button.absolute]:hidden overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border/50 shrink-0">
          <button onClick={() => onOpenChange(false)} className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-secondary/50 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Filters</h2>
          <button onClick={handleReset} className="text-sm font-medium text-primary hover:text-primary/80 px-2 py-1 transition-colors">
            RESET
          </button>
        </div>
        
        <ScrollArea className="flex-1 p-4 overflow-y-auto min-h-0">
          <div className="space-y-6 pb-20">
            <div>
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2 flex items-center gap-2">
                <ArrowDownUp className="w-4 h-4" /> Sort Mode
              </h3>
              <div className="flex flex-col bg-secondary/20 rounded-2xl overflow-hidden border border-border/40">
                {MODES.map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(mode === m ? '' : m)}
                    className={cn(
                      "flex items-center justify-between p-4 text-left transition-colors border-b border-border/40 last:border-0",
                      mode === m ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary/40"
                    )}
                  >
                    <span className="font-medium">{m}</span>
                    {mode === m ? (
                      <CircleDot className="w-5 h-5 text-primary" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground/40" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <button 
                onClick={() => setIsTypesExpanded(!isTypesExpanded)}
                className="w-full flex items-center justify-between text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2"
              >
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4" /> Types {types.length > 0 && `(${types.length})`}
                </div>
                <ChevronDown className={cn("w-4 h-4 transition-transform", isTypesExpanded ? "rotate-180" : "")} />
              </button>
              
              <div className={cn(
                "flex-col bg-secondary/20 rounded-2xl overflow-hidden border border-border/40 transition-all",
                isTypesExpanded ? "flex" : "hidden"
              )}>
                {TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={cn(
                      "flex items-center justify-between p-4 text-left transition-colors border-b border-border/40 last:border-0",
                      types.includes(type) ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary/40"
                    )}
                  >
                    <span className="font-medium">{type}</span>
                    {types.includes(type) ? (
                      <CheckSquare className="w-5 h-5 text-primary" />
                    ) : (
                      <Square className="w-5 h-5 text-muted-foreground/40" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <button 
                onClick={() => setIsGenresExpanded(!isGenresExpanded)}
                className="w-full flex items-center justify-between text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2"
              >
                <div className="flex items-center gap-2">
                  <Tags className="w-4 h-4" /> Genres {genres.length > 0 && `(${genres.length})`}
                </div>
                <ChevronDown className={cn("w-4 h-4 transition-transform", isGenresExpanded ? "rotate-180" : "")} />
              </button>
              
              <div className={cn(
                "flex-col bg-secondary/20 rounded-2xl overflow-hidden border border-border/40 transition-all",
                isGenresExpanded ? "flex" : "hidden"
              )}>
                {GENRES.map(genre => (
                  <button
                    key={genre}
                    onClick={() => toggleGenre(genre)}
                    className={cn(
                      "flex items-center justify-between p-4 text-left transition-colors border-b border-border/40 last:border-0",
                      genres.includes(genre) ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary/40"
                    )}
                  >
                    <span className="font-medium">{genre}</span>
                    {genres.includes(genre) ? (
                      <CheckSquare className="w-5 h-5 text-primary" />
                    ) : (
                      <Square className="w-5 h-5 text-muted-foreground/40" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
        
        <div className="p-4 bg-background border-t border-border/50 shrink-0 mt-auto pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <Button onClick={handleApply} className="w-full h-12 rounded-xl text-base font-semibold shadow-lg">
            Apply Filters {genres.length + types.length > 0 ? `(${genres.length + types.length})` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
