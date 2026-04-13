import { convertFileSrc } from "@tauri-apps/api/core";
import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { X, Save, ImagePlus, Trash2, Split, Merge, Search } from 'lucide-react';
import { api, type MangaSeries, type Book } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useCoverImage } from '../common/hooks/useCoverImage';
import { MetadataSearchDialog } from './MetadataSearchDialog';

import { useToast } from '@/store/toastStore';

interface SeriesManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seriesId?: number;
  seriesTitle?: string;
  initialTab?: 'edit' | 'volumes' | 'merge';
  onUpdated?: () => void;
}

export const SeriesManagementDialog = ({
  open,
  onOpenChange,
  seriesId,
  seriesTitle,
  initialTab = 'edit',
  onUpdated
}: SeriesManagementDialogProps) => {
  const [loading, setLoading] = useState(true);
  const [volumes, setVolumes] = useState<Book[]>([]);
  const [allSeries, setAllSeries] = useState<MangaSeries[]>([]);
  const [resolvedSeriesId, setResolvedSeriesId] = useState<number | null>(seriesId ?? null);
  
  // Edit State
  const [title, setTitle] = useState('');
  const [sortTitle, setSortTitle] = useState('');
  const [status, setStatus] = useState('ongoing');
  const [coverPath, setCoverPath] = useState('');

  // Merge State
  const [targetSeriesId, setTargetSeriesId] = useState<number | null>(null);
  const [confirmMergeOpen, setConfirmMergeOpen] = useState(false);
  const [mergeTargetForConfirm, setMergeTargetForConfirm] = useState<number | null>(null);
  
  // Metadata Dialog State
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  
  const toast = useToast();

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, seriesId, seriesTitle]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch series from all series list (we'll fetch limit 1000 for now to find it)
      const list = await api.getMangaSeriesList(1000, 0);
      setAllSeries(list);
      
      let targetSeries = null;
      if (seriesId) {
        targetSeries = list.find(s => s.id === seriesId);
      } else if (seriesTitle) {
        targetSeries = list.find(s => s.title.toLowerCase() === seriesTitle.toLowerCase());
      }
      
      if (targetSeries && targetSeries.id !== undefined) {
        setResolvedSeriesId(targetSeries.id);
        setTitle(targetSeries.title || '');
        setSortTitle(targetSeries.sort_title || '');
        setStatus(targetSeries.status || 'ongoing');
        setCoverPath(targetSeries.cover_path || '');
        
        const volRecords = await api.getSeriesVolumes(targetSeries.id);
        const bookPromises = volRecords.map(v => api.getBook(v.book_id));
        const loadedBooks = await Promise.all(bookPromises);
        setVolumes(loadedBooks.filter(b => b != null));
      } else {
        setResolvedSeriesId(null);
      }
     } catch (err) {
       logger.error("Failed to load series data:", err);
       toast.error(`Failed to load series data: ${err instanceof Error ? err.message : String(err)}`);
     } finally {
       setLoading(false);
     }
  };

  const handleSave = async () => {
    if (!resolvedSeriesId) return;
    try {
      await api.updateMangaSeries(resolvedSeriesId, {
        title,
        sort_title: sortTitle,
        status,
        cover_path: coverPath
      });
       onUpdated?.();
       onOpenChange(false);
     } catch (err) {
       logger.error("Failed to update series:", err);
       toast.error(`Failed to update series: ${err instanceof Error ? err.message : String(err)}`);
     }
  };

  const handlePickCover = async () => {
    try {
      const selected = await api.openFileDialog();
      if (selected && selected.length > 0) {
        setCoverPath(selected[0]);
      }
     } catch (err) {
       logger.error("Failed to pick cover:", err);
       toast.error(`Failed to pick cover: ${err instanceof Error ? err.message : String(err)}`);
     }
  };

  const handleRemoveVolume = async (bookId: number) => {
    try {
      await api.removeBookFromSeries(bookId);
      
      const removed = volumes.find(v => v.id === bookId);
      setVolumes(volumes.filter(v => v.id !== bookId));
      onUpdated?.();
      
      if (removed && title) {
        toast.success('Volume removed', {
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await api.assignBookToSeries(bookId, title, removed.series_index);
                await loadData();
                onUpdated?.();
              } catch (undoErr) {
                logger.error("Failed to undo volume removal:", undoErr);
                toast.error(`Failed to undo: ${undoErr instanceof Error ? undoErr.message : String(undoErr)}`);
              }
            }
          }
        });
      } else {
        toast.success('Volume removed');
      }
     } catch (err) {
       logger.error("Failed to remove volume:", err);
       toast.error(`Failed to remove volume: ${err instanceof Error ? err.message : String(err)}`);
     }
  };

  const handleMergeClick = () => {
    if (!targetSeriesId) return;
    setMergeTargetForConfirm(targetSeriesId);
    setConfirmMergeOpen(true);
  };

  const handleMergeConfirm = async () => {
    if (!mergeTargetForConfirm || !resolvedSeriesId) return;
    try {
      await api.mergeMangaSeries([resolvedSeriesId], mergeTargetForConfirm);
      toast.success('Series merged successfully');
      onUpdated?.();
      setConfirmMergeOpen(false);
      onOpenChange(false);
     } catch (err) {
       logger.error("Failed to merge series:", err);
       toast.error(`Failed to merge series: ${err instanceof Error ? err.message : String(err)}`);
     }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-2xl w-[90vw] max-w-2xl max-h-[85vh] flex flex-col z-50 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
            <Dialog.Title className="text-lg font-semibold text-foreground tracking-tight">
              Manage Series
            </Dialog.Title>
             <Dialog.Close asChild>
               <button className="text-muted-foreground hover:text-foreground hover:bg-muted p-1.5 rounded-md transition-colors" title="Close">
                 <X className="h-5 w-5" />
               </button>
             </Dialog.Close>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <Tabs.Root defaultValue={initialTab} className="flex flex-col flex-1 overflow-hidden">
              <Tabs.List className="flex px-6 border-b border-border bg-muted/10">
                <Tabs.Trigger value="edit" className="px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary transition-colors">
                  Edit Details
                </Tabs.Trigger>
                <Tabs.Trigger value="volumes" className="px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary transition-colors">
                  Volumes ({volumes.length})
                </Tabs.Trigger>
                <Tabs.Trigger value="merge" className="px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary transition-colors">
                  Merge / Split
                </Tabs.Trigger>
              </Tabs.List>

              <div className="flex-1 overflow-y-auto p-6 bg-background">
                <Tabs.Content value="edit" className="space-y-6 outline-none">
                  <div className="grid grid-cols-3 gap-8">
                    <div className="col-span-1 flex flex-col gap-3">
                      <div className="aspect-[2/3] bg-muted rounded-lg overflow-hidden border border-border relative flex items-center justify-center group">
                        {coverPath ? (
                          <img src={convertFileSrc(coverPath)} className="absolute inset-0 w-full h-full object-contain bg-muted" alt="Cover" />
                        ) : (
                          <div className="text-muted-foreground text-center p-4">
                            <ImagePlus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <span className="text-xs">No Custom Cover</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button variant="secondary" size="sm" onClick={handlePickCover}>Choose File</Button>
                        </div>
                      </div>
                      {coverPath && (
                        <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive" onClick={() => setCoverPath('')}>
                          Clear Custom Cover
                        </Button>
                      )}
                    </div>
                    
                    <div className="col-span-2 space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Series Title</label>
                        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. One Piece" className="bg-muted/50 focus:bg-background" />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Sort Title (Optional)</label>
                        <Input value={sortTitle} onChange={e => setSortTitle(e.target.value)} placeholder="e.g. one piece" className="bg-muted/50 focus:bg-background" />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Status</label>
                        <select 
                          value={status} 
                          onChange={e => setStatus(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-muted/50 border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 dark:[color-scheme:dark] [&>option]:bg-popover [&>option]:text-popover-foreground"
                        >
                          <option value="ongoing">Ongoing</option>
                          <option value="completed">Completed</option>
                          <option value="hiatus">On Hiatus</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <Button 
                      variant="outline" 
                      onClick={() => setMetadataDialogOpen(true)} 
                      className="gap-2"
                      disabled={!resolvedSeriesId || volumes.length === 0}
                    >
                      <Search className="w-4 h-4" />
                      Find Metadata
                    </Button>
                    <Button onClick={handleSave} className="gap-2">
                      <Save className="w-4 h-4" />
                      Save Changes
                    </Button>
                  </div>
                </Tabs.Content>

                <Tabs.Content value="volumes" className="space-y-4 outline-none">
                  {volumes.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border/50 rounded-xl">
                      No volumes found in this series.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {volumes.map(vol => (
                        <div key={vol.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-8 h-12 bg-muted rounded overflow-hidden flex-shrink-0">
                              {/* Thumbnail placeholder */}
                            </div>
                            <div className="truncate">
                              <div className="font-medium text-sm truncate" title={vol.title}>{vol.title}</div>
                              <div className="text-xs text-muted-foreground">Vol. {vol.series_index || '?'}</div>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleRemoveVolume(vol.id!)}>
                            <Split className="w-4 h-4 mr-2" />
                            Ungroup
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Tabs.Content>

                <Tabs.Content value="merge" className="space-y-6 outline-none">
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-sm text-primary">
                    Merging will move all volumes from this series into the selected target series, and then delete this series.
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Select Target Series</label>
                    <select 
                      value={targetSeriesId || ''} 
                      onChange={e => setTargetSeriesId(Number(e.target.value))}
                      className="w-full px-3 py-2.5 text-sm bg-muted/50 border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 dark:[color-scheme:dark] [&>option]:bg-popover [&>option]:text-popover-foreground"
                    >
                      <option value="">-- Select a series --</option>
                      {allSeries.filter(s => s.id !== resolvedSeriesId).map(s => (
                        <option key={s.id} value={s.id}>{s.title} ({s.status})</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex justify-end pt-4">
                    <Button 
                      variant="destructive" 
                      disabled={!targetSeriesId} 
                      onClick={handleMergeClick}
                      className="gap-2"
                    >
                      <Merge className="w-4 h-4" />
                      Merge into Target
                    </Button>
                  </div>
                </Tabs.Content>
              </div>
            </Tabs.Root>
          )}
        </Dialog.Content>
      </Dialog.Portal>

      {resolvedSeriesId && volumes.length > 0 && (
        <MetadataSearchDialog
          open={metadataDialogOpen}
          onOpenChange={setMetadataDialogOpen}
          bookIds={volumes.map(v => v.id!).filter(Boolean)}
          bookTitle={title}
          isManga={true}
          isbn={null}
          onMetadataSelected={async () => {
            await loadData();
            onUpdated?.();
          }}
        />
      )}

      <Dialog.Root open={confirmMergeOpen} onOpenChange={setConfirmMergeOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-2xl w-[90vw] max-w-md p-6 z-[60] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <Dialog.Title className="text-lg font-semibold text-foreground mb-4">
              Confirm Series Merge
            </Dialog.Title>
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>
                Move <strong>{volumes.length}</strong> volumes from <strong>{title}</strong> to <strong>{allSeries.find(s => s.id === mergeTargetForConfirm)?.title || 'Target'}</strong> and delete <strong>{title}</strong>. Cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="ghost" onClick={() => setConfirmMergeOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleMergeConfirm}>
                Merge
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Dialog.Root>
  );
};
