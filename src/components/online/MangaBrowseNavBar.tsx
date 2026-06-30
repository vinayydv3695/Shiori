import { Shuffle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
    <div className={`w-full bg-background/95 backdrop-blur-xl border-y border-border shadow-sm flex ${isMobileDialog ? 'flex-col gap-4 py-4 px-2 border-none items-stretch' : 'py-2 md:py-3 px-3 md:px-6 mb-2 md:mb-8 mt-0 md:mt-2 sticky top-0 z-50 items-center gap-4 md:gap-8 overflow-x-auto scrollbar-hide'}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={`font-medium flex items-center justify-between gap-1 transition-colors outline-none shrink-0 text-sm md:text-base ${isMobileDialog ? 'w-full bg-secondary/20 p-3 rounded-xl' : ''} ${activeTypes.length > 0 ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            <span>Types {activeTypes.length > 0 && `(${activeTypes.length})`}</span> <ChevronDown className="w-4 h-4 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48 bg-background/95 backdrop-blur-xl border-white/10" align="start">
          {TYPES.map(type => (
            <DropdownMenuItem key={type} onClick={() => toggleType(type)} className={`cursor-pointer hover:bg-white/5 ${activeTypes.includes(type) ? 'bg-white/10 text-primary' : ''}`}>
              {type}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={`font-medium flex items-center justify-between gap-1 transition-colors outline-none shrink-0 text-sm md:text-base ${isMobileDialog ? 'w-full bg-secondary/20 p-3 rounded-xl' : ''} ${activeGenres.length > 0 ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            <span>Genres {activeGenres.length > 0 && `(${activeGenres.length})`}</span> <ChevronDown className="w-4 h-4 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[min(600px,90vw)] bg-background/95 backdrop-blur-xl border-white/10 p-4" align="start">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {GENRES.map(genre => (
              <DropdownMenuItem key={genre} onClick={() => toggleGenre(genre)} className={`cursor-pointer text-sm rounded-md px-3 py-2 ${activeGenres.includes(genre) ? 'bg-white/10 text-primary hover:bg-white/15' : 'hover:bg-white/5'}`}>
                {genre}
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className={`flex flex-1 ${isMobileDialog ? 'flex-col gap-2 w-full mt-2' : 'items-center gap-3 md:gap-6 min-w-max'}`}>
        <button onClick={() => setMode('Newest')} className={`font-medium transition-colors ${isMobileDialog ? 'text-left p-3 rounded-xl bg-secondary/10' : ''} ${activeMode === 'Newest' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}>
          Newest
        </button>
        <button onClick={() => setMode('Updated')} className={`font-medium transition-colors ${isMobileDialog ? 'text-left p-3 rounded-xl bg-secondary/10' : ''} ${activeMode === 'Updated' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}>
          Updated
        </button>
        <button onClick={() => setMode('Added')} className={`font-medium transition-colors ${isMobileDialog ? 'text-left p-3 rounded-xl bg-secondary/10' : ''} ${activeMode === 'Added' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}>
          Added
        </button>
      </div>

      <div className={`flex items-center gap-2 cursor-pointer text-sm font-medium hover:text-foreground transition-colors select-none text-muted-foreground shrink-0 ${isMobileDialog ? 'w-full p-3 bg-secondary/10 rounded-xl justify-between' : ''}`}>
        <label className="flex items-center gap-2 cursor-pointer w-full">
          <input
            type="checkbox"
            checked={preferences?.includeNsfw ?? false}
            onChange={(e) => updateGeneralSettings({ includeNsfw: e.target.checked })}
            className="rounded border-border text-primary focus:ring-primary/20 bg-background/50 cursor-pointer w-4 h-4"
          />
          Include NSFW Content
        </label>
      </div>

      <Button variant="ghost" className={`text-muted-foreground hover:text-foreground hover:bg-white/5 gap-2 shrink-0 ${isMobileDialog ? 'w-full h-12 mt-4 bg-primary/10 text-primary' : 'h-8 md:h-10 text-xs md:text-sm px-2 md:px-4'}`} onClick={onRandomClick}>
        <Shuffle className="w-4 h-4" /> Random
      </Button>
    </div>
  );
}
