import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOnlineSearchStore, type OnlineAdvancedFilters } from '@/store/onlineSearchStore';
import { Search, X } from 'lucide-react';

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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Advanced Online Search</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Note: Some sources may ignore fields they don't support. Gutenberg supports Era (Years) and Language. LibGen supports Author, Year, Publisher, Language.
          </p>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="author">Author</Label>
            <Input
              id="author"
              placeholder="e.g. Stephen King"
              value={localFilters.author || ''}
              onChange={e => handleChange('author', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="yearStart">Year Start / Era</Label>
              <Input
                id="yearStart"
                type="number"
                placeholder="e.g. 1990"
                value={localFilters.yearStart || ''}
                onChange={e => handleChange('yearStart', parseInt(e.target.value) || undefined)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="yearEnd">Year End</Label>
              <Input
                id="yearEnd"
                type="number"
                placeholder="e.g. 2000"
                value={localFilters.yearEnd || ''}
                onChange={e => handleChange('yearEnd', parseInt(e.target.value) || undefined)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="publisher">Publisher</Label>
            <Input
              id="publisher"
              placeholder="e.g. Penguin"
              value={localFilters.publisher || ''}
              onChange={e => handleChange('publisher', e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="language">Language Code</Label>
            <Input
              id="language"
              placeholder="e.g. en, fr, de"
              value={localFilters.language || ''}
              onChange={e => handleChange('language', e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
          <Button variant="ghost" onClick={handleClear} className="text-muted-foreground">
            <X className="w-4 h-4 mr-2" />
            Clear
          </Button>
          <Button onClick={handleApply}>
            <Search className="w-4 h-4 mr-2" />
            Search
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
