import { Shuffle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePreferencesStore } from '@/store/preferencesStore';
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

interface MangaBrowseNavBarProps {
  activeGenres: string[];
  activeTypes: string[];
  activeMode: string;
  onFilterChange: (genres: string[], types: string[], mode: string) => void;
  onRandomClick: () => void;
  isMobileDialog?: boolean;
}

export function MangaBrowseNavBar({ activeGenres, activeTypes, activeMode, onFilterChange, onRandomClick, isMobileDialog }: MangaBrowseNavBarProps) {
  const preferences = usePreferencesStore(state => state.preferences);
  const updateGeneralSettings = usePreferencesStore(state => state.updateGeneralSettings);
  const toggleGenre = (genre: string) => {
    const newGenres = activeGenres.includes(genre) 
      ? activeGenres.filter(g => g !== genre)
      : [...activeGenres, genre];
    onFilterChange(newGenres, activeTypes, activeMode);
  };

  const toggleType = (type: string) => {
    const newTypes = activeTypes.includes(type)
      ? activeTypes.filter(t => t !== type)
      : [...activeTypes, type];
    onFilterChange(activeGenres, newTypes, activeMode);
  };

  const setMode = (mode: string) => {
    // Toggle off if already selected
    const newMode = activeMode === mode ? '' : mode;
    onFilterChange(activeGenres, activeTypes, newMode);
  };

  return (
    <div className={`w-full bg-card/70 backdrop-blur-2xl border border-border/50 rounded-2xl shadow-xl flex items-center justify-between transition-all duration-300 ${isMobileDialog ? 'flex-col gap-4 py-4 px-2 border-none items-stretch bg-transparent shadow-none' : 'py-2.5 px-4 md:px-6 mb-6 mt-0 sticky top-0 z-40 gap-3 overflow-x-auto scrollbar-hide'}`}>
      <div className="flex items-center gap-2.5 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(
              "font-extrabold flex items-center gap-1.5 transition-all text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-border/50 shadow-sm outline-none",
              activeTypes.length > 0 ? "bg-primary text-primary-foreground border-primary/40 shadow-primary/20" : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}>
              <span>Types {activeTypes.length > 0 && `(${activeTypes.length})`}</span> <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="shiori-select-content w-48 border border-border rounded-2xl shadow-2xl z-[9999] p-1.5" align="start">
            {TYPES.map(type => (
              <DropdownMenuItem key={type} onClick={() => toggleType(type)} className={cn("cursor-pointer rounded-xl font-bold text-xs py-2 px-3", activeTypes.includes(type) ? "bg-primary text-primary-foreground" : "hover:bg-secondary/60")}>
                {type}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(
              "font-extrabold flex items-center gap-1.5 transition-all text-xs sm:text-sm px-3.5 py-2 rounded-xl border border-border/50 shadow-sm outline-none",
              activeGenres.length > 0 ? "bg-primary text-primary-foreground border-primary/40 shadow-primary/20" : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}>
              <span>Genres {activeGenres.length > 0 && `(${activeGenres.length})`}</span> <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="shiori-select-content w-[min(560px,90vw)] border border-border rounded-2xl shadow-2xl z-[9999] p-3" align="start">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {GENRES.map(genre => (
                <DropdownMenuItem key={genre} onClick={() => toggleGenre(genre)} className={cn("cursor-pointer text-xs font-bold rounded-xl px-3 py-2 transition-colors", activeGenres.includes(genre) ? "bg-primary text-primary-foreground" : "hover:bg-secondary/60")}>
                  {genre}
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-1 bg-secondary/40 backdrop-blur-xl p-1 rounded-xl border border-border/40 shadow-inner shrink-0">
        {['popular', 'Newest', 'Updated', 'Added'].map(mode => {
          const isActive = activeMode.toLowerCase() === mode.toLowerCase();
          return (
            <button 
              key={mode} 
              onClick={() => setMode(mode)} 
              className={cn(
                "relative font-extrabold transition-all px-3.5 py-1.5 rounded-lg text-xs capitalize select-none z-10",
                isActive ? "text-primary-foreground bg-primary shadow-md shadow-primary/20" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {mode}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-2 cursor-pointer text-xs font-semibold hover:text-foreground transition-colors select-none text-muted-foreground bg-secondary/30 hover:bg-secondary/60 px-3 py-2 rounded-xl border border-border/40">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences?.includeNsfw ?? false}
              onChange={(e) => updateGeneralSettings({ includeNsfw: e.target.checked })}
              className="rounded border-border text-primary focus:ring-primary/20 bg-background/50 cursor-pointer w-3.5 h-3.5"
            />
            <span>Include NSFW</span>
          </label>
        </div>

        <Button 
          variant="ghost" 
          size="sm"
          className="text-muted-foreground hover:text-foreground hover:bg-secondary/60 gap-1.5 shrink-0 rounded-xl font-bold text-xs px-3 py-2 h-auto border border-border/40" 
          onClick={onRandomClick}
        >
          <Shuffle className="w-3.5 h-3.5 text-primary" /> Random
        </Button>
      </div>
    </div>
  );
}
