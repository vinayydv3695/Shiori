import { useState, useEffect, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Plus, ListPlus } from 'lucide-react';
import { api, type MangaSeries } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface SeriesAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: number;
  bookTitle?: string;
  onAssigned?: () => void;
}

export const SeriesAssignmentDialog = ({
  open,
  onOpenChange,
  bookId,
  bookTitle,
  onAssigned
}: SeriesAssignmentDialogProps) => {
  const [loading, setLoading] = useState(true);
  const [seriesList, setSeriesList] = useState<MangaSeries[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // New series creation state
  const [isCreating, setIsCreating] = useState(false);
  const [newSeriesTitle, setNewSeriesTitle] = useState('');

  useEffect(() => {
    if (open) {
      loadData();
      setIsCreating(false);
      setNewSeriesTitle('');
      setSearchQuery('');
    }
  }, [open]);

  const loadData = async () => {
    try {
      setLoading(true);
      const list = await api.getMangaSeriesList(1000, 0);
      setSeriesList(list);
     } catch (err) {
       logger.error("Failed to load series list:", err);
     } finally {
       setLoading(false);
     }
  };

  const filteredSeries = useMemo(() => {
    if (!searchQuery.trim()) return seriesList;
    const query = searchQuery.toLowerCase();
    return seriesList.filter(s => s.title.toLowerCase().includes(query));
  }, [seriesList, searchQuery]);

  const handleAssignToExisting = async (series: MangaSeries) => {
    try {
      await api.assignBookToSeries(bookId, series.title);
      onAssigned?.();
      onOpenChange(false);
     } catch (err) {
       logger.error("Failed to assign book:", err);
     }
  };

  const handleCreateAndAssign = async () => {
    if (!newSeriesTitle.trim()) return;
    try {
      await api.assignBookToSeries(bookId, newSeriesTitle.trim());
      onAssigned?.();
      onOpenChange(false);
     } catch (err) {
       logger.error("Failed to create and assign series:", err);
     }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-2xl w-[90vw] max-w-md max-h-[85vh] flex flex-col z-50 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
            <Dialog.Title className="text-lg font-semibold text-foreground tracking-tight">
              Assign to Series
            </Dialog.Title>
             <Dialog.Close asChild>
               <button className="text-muted-foreground hover:text-foreground hover:bg-muted p-1.5 rounded-md transition-colors" title="Close">
                 <X className="h-5 w-5" />
               </button>
             </Dialog.Close>
          </div>

          <div className="flex flex-col flex-1 p-6 overflow-hidden">
            {bookTitle && (
              <div className="mb-4 text-sm text-muted-foreground">
                Assigning <span className="font-medium text-foreground">{bookTitle}</span>
              </div>
            )}

            {!isCreating ? (
              <>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    value={searchQuery} 
                    onChange={e => setSearchQuery(e.target.value)} 
                    placeholder="Search series..." 
                    className="pl-9 bg-muted/50"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-1 mb-4 min-h-[200px] rounded-lg border border-border/50 bg-muted/10 p-2">
                  {loading ? (
                    <div className="flex justify-center p-8">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : filteredSeries.length === 0 ? (
                    <div className="text-center p-8 text-sm text-muted-foreground">
                      No series found.
                    </div>
                  ) : (
                    filteredSeries.map(s => (
                      <button
                        key={s.id}
                        onClick={() => handleAssignToExisting(s)}
                        className="w-full flex items-center justify-between p-3 text-left rounded-md hover:bg-muted/60 transition-colors group"
                      >
                        <span className="font-medium text-sm text-foreground truncate">{s.title}</span>
                        <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">Select</span>
                      </button>
                    ))
                  )}
                </div>

                <Button variant="outline" className="w-full gap-2 border-dashed" onClick={() => setIsCreating(true)}>
                  <Plus className="h-4 w-4" />
                  Create New Series
                </Button>
              </>
            ) : (
              <div className="flex flex-col flex-1 justify-center space-y-4 animate-in fade-in slide-in-from-bottom-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">New Series Title</label>
                  <Input 
                    value={newSeriesTitle} 
                    onChange={e => setNewSeriesTitle(e.target.value)} 
                    placeholder="e.g. Attack on Titan"
                    autoFocus
                  />
                </div>
                
                <div className="flex items-center gap-2 pt-4">
                  <Button variant="ghost" className="flex-1" onClick={() => setIsCreating(false)}>
                    Cancel
                  </Button>
                  <Button className="flex-1 gap-2" disabled={!newSeriesTitle.trim()} onClick={handleCreateAndAssign}>
                    <ListPlus className="h-4 w-4" />
                    Create & Assign
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
