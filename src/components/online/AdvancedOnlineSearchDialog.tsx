import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOnlineSearchStore, type OnlineAdvancedFilters } from '@/store/onlineSearchStore';
import { 
  Search, 
  X, 
  BookText, 
  UserRound, 
  Library, 
  Building2, 
  CalendarDays, 
  Globe2, 
  FileBox, 
  Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearch: () => void;
}

export function AdvancedOnlineSearchDialog({ open, onOpenChange, onSearch }: Props) {
  const filters = useOnlineSearchStore(state => state.filters['online-books']);
  const setFilters = useOnlineSearchStore(state => state.setFilters);

  const [localFilters, setLocalFilters] = useState<OnlineAdvancedFilters>({});

  useEffect(() => {
    if (open) {
      setLocalFilters(filters || {});
    }
  }, [open, filters]);

  const handleChange = (key: keyof OnlineAdvancedFilters, value: string | number | undefined) => {
    setLocalFilters(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApply = () => {
    setFilters('online-books', localFilters);
    onOpenChange(false);
    onSearch();
  };

  const handleClear = () => {
    setLocalFilters({});
    setFilters('online-books', {});
    onOpenChange(false);
    onSearch();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-border/50">
        <DialogHeader className="pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <Filter className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">Advanced Search</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Refine your results with specific criteria.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-8 py-6">
          
          {/* Metadata Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Book Metadata</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              <div className="space-y-2">
                <Label htmlFor="title" className="text-xs font-semibold flex items-center gap-2 text-foreground/80">
                  <BookText className="w-3.5 h-3.5" /> Title Contains
                </Label>
                <Input
                  id="title"
                  placeholder="e.g. Foundation"
                  value={localFilters.title || ''}
                  onChange={e => handleChange('title', e.target.value)}
                  className="bg-background/50 border-border/50 focus-visible:ring-primary/30 transition-all rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="author" className="text-xs font-semibold flex items-center gap-2 text-foreground/80">
                  <UserRound className="w-3.5 h-3.5" /> Author
                </Label>
                <Input
                  id="author"
                  placeholder="e.g. Isaac Asimov"
                  value={localFilters.author || ''}
                  onChange={e => handleChange('author', e.target.value)}
                  className="bg-background/50 border-border/50 focus-visible:ring-primary/30 transition-all rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="series" className="text-xs font-semibold flex items-center gap-2 text-foreground/80">
                  <Library className="w-3.5 h-3.5" /> Series
                </Label>
                <Input
                  id="series"
                  placeholder="e.g. Galactic Empire"
                  value={localFilters.series || ''}
                  onChange={e => handleChange('series', e.target.value)}
                  className="bg-background/50 border-border/50 focus-visible:ring-primary/30 transition-all rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="publisher" className="text-xs font-semibold flex items-center gap-2 text-foreground/80">
                  <Building2 className="w-3.5 h-3.5" /> Publisher
                </Label>
                <Input
                  id="publisher"
                  placeholder="e.g. Doubleday"
                  value={localFilters.publisher || ''}
                  onChange={e => handleChange('publisher', e.target.value)}
                  className="bg-background/50 border-border/50 focus-visible:ring-primary/30 transition-all rounded-xl"
                />
              </div>

            </div>
          </div>

          {/* Publication & Language */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Publication & Locale</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              
              <div className="space-y-2">
                <Label htmlFor="yearStart" className="text-xs font-semibold flex items-center gap-2 text-foreground/80">
                  <CalendarDays className="w-3.5 h-3.5" /> Year Start / Era
                </Label>
                <Input
                  id="yearStart"
                  type="number"
                  placeholder="e.g. 1950"
                  value={localFilters.yearStart || ''}
                  onChange={e => handleChange('yearStart', parseInt(e.target.value) || undefined)}
                  className="bg-background/50 border-border/50 focus-visible:ring-primary/30 transition-all rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="yearEnd" className="text-xs font-semibold flex items-center gap-2 text-foreground/80">
                  <CalendarDays className="w-3.5 h-3.5" /> Year End
                </Label>
                <Input
                  id="yearEnd"
                  type="number"
                  placeholder="e.g. 2000"
                  value={localFilters.yearEnd || ''}
                  onChange={e => handleChange('yearEnd', parseInt(e.target.value) || undefined)}
                  className="bg-background/50 border-border/50 focus-visible:ring-primary/30 transition-all rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="language" className="text-xs font-semibold flex items-center gap-2 text-foreground/80">
                  <Globe2 className="w-3.5 h-3.5" /> Language Code
                </Label>
                <Input
                  id="language"
                  placeholder="e.g. en, fr, de"
                  value={localFilters.language || ''}
                  onChange={e => handleChange('language', e.target.value)}
                  className="bg-background/50 border-border/50 focus-visible:ring-primary/30 transition-all rounded-xl"
                />
              </div>

            </div>
          </div>

          {/* Format Preference */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
              <FileBox className="w-4 h-4" /> File Format
            </h3>
            <div className="flex flex-wrap gap-3">
              {(['any', 'epub', 'pdf', 'mobi', 'azw3'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => handleChange('format', fmt)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95",
                    (localFilters.format || 'any') === fmt
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "bg-secondary/50 text-secondary-foreground hover:bg-secondary/80 border border-transparent hover:border-border/50"
                  )}
                >
                  {fmt === 'any' ? 'Any Format' : fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full pt-4 border-t border-border/40">
          <Button 
            variant="ghost" 
            onClick={handleClear} 
            className="text-muted-foreground hover:text-foreground hover:bg-destructive/10 rounded-xl px-5"
          >
            <X className="w-4 h-4 mr-2" />
            Clear Filters
          </Button>
          <Button 
            onClick={handleApply}
            className="rounded-xl px-8 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all"
          >
            <Search className="w-4 h-4 mr-2" />
            Apply & Search
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
