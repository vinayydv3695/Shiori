import { Shuffle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
}

export function MangaBrowseNavBar({ activeGenres, activeTypes, activeMode, onFilterChange, onRandomClick }: MangaBrowseNavBarProps) {
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
    <div className="w-full bg-background/95 backdrop-blur-xl border-y border-border py-3 px-6 mb-8 mt-2 sticky top-0 z-50 flex items-center gap-8 shadow-sm">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={`font-medium flex items-center gap-1 transition-colors outline-none ${activeTypes.length > 0 ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            Types {activeTypes.length > 0 && `(${activeTypes.length})`} <ChevronDown className="w-4 h-4 opacity-50" />
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
          <button className={`font-medium flex items-center gap-1 transition-colors outline-none ${activeGenres.length > 0 ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            Genres {activeGenres.length > 0 && `(${activeGenres.length})`} <ChevronDown className="w-4 h-4 opacity-50" />
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

      <div className="flex items-center gap-6 flex-1">
        <button onClick={() => setMode('Newest')} className={`font-medium transition-colors ${activeMode === 'Newest' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
          Newest
        </button>
        <button onClick={() => setMode('Updated')} className={`font-medium transition-colors ${activeMode === 'Updated' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
          Updated
        </button>
        <button onClick={() => setMode('Added')} className={`font-medium transition-colors ${activeMode === 'Added' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
          Added
        </button>
      </div>

      <Button variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-white/5 gap-2" onClick={onRandomClick}>
        <Shuffle className="w-4 h-4" /> Random
      </Button>
    </div>
  );
}
