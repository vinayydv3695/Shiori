import { useState, useEffect, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Plus, ListPlus, Layers, Trash2 } from 'lucide-react';
import { api, type Book } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/store/toastStore';
import { useLibraryStore } from '@/store/libraryStore';
import { groupBooksBySeries, extractSeriesTitle } from '@/hooks/useGroupedLibrary';
import { parseVolumeOrChapterNumber } from '@/lib/seriesSorting';

export interface SeriesAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId?: number;
  bookIds?: number[];
  bookTitle?: string;
  currentSeries?: string | null;
  onAssigned?: () => void;
}

interface SeriesItem {
  title: string;
  count: number;
}

export const SeriesAssignmentDialog = ({
  open,
  onOpenChange,
  bookId,
  bookIds,
  bookTitle,
  currentSeries,
  onAssigned,
}: SeriesAssignmentDialogProps) => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // New series creation state
  const [isCreating, setIsCreating] = useState(false);
  const [newSeriesTitle, setNewSeriesTitle] = useState('');

  const targetBookIds = useMemo(() => {
    if (bookIds && bookIds.length > 0) return bookIds;
    if (bookId != null) return [bookId];
    return [];
  }, [bookId, bookIds]);

  useEffect(() => {
    if (open) {
      void loadData();
      setIsCreating(false);
      setNewSeriesTitle('');
      setSearchQuery('');
    }
  }, [open]);

  const loadData = async () => {
    try {
      setLoading(true);

      const seriesCountMap = new Map<string, { title: string; count: number }>();

      // 1. Fetch series from database (manga_series)
      const dbList = await api.getMangaSeriesList(1000, 0).catch(() => []);
      for (const item of dbList) {
        const title = item.title?.trim();
        if (title) {
          const key = title.toLowerCase();
          seriesCountMap.set(key, {
            title,
            count: 0,
          });
        }
      }

      // 2. Fetch or retrieve books to capture automatically created series
      let allBooks = useLibraryStore.getState().books;
      const totalCount = useLibraryStore.getState().totalCount;

      // If library has more books than currently loaded in window, query full list
      if (totalCount > allBooks.length) {
        try {
          const fullRes = await api.searchBooks({ limit: 5000, offset: 0 });
          if (fullRes?.books && fullRes.books.length > 0) {
            allBooks = fullRes.books;
          }
        } catch {
          // Fall back to currently loaded books
        }
      }

      // 3. Process automatically created series groups from the books
      const grouped = groupBooksBySeries(allBooks, true);
      for (const item of grouped) {
        if (item.type === 'series' && item.data.title?.trim()) {
          const title = item.data.title.trim();
          const key = title.toLowerCase();
          const existing = seriesCountMap.get(key);
          if (existing) {
            existing.count = Math.max(existing.count, item.data.bookCount);
          } else {
            seriesCountMap.set(key, {
              title,
              count: item.data.bookCount,
            });
          }
        }
      }

      // 4. Extract series from individual books (either explicit b.series or auto regex extraction)
      for (const b of allBooks) {
        const explicit = b.series?.trim();
        const extracted = extractSeriesTitle(b)?.trim();
        const candidate = explicit || extracted;
        if (candidate) {
          const key = candidate.toLowerCase();
          const existing = seriesCountMap.get(key);
          if (!existing) {
            // Count occurrences across allBooks
            let occurrences = 0;
            for (const other of allBooks) {
              const otherCandidate = other.series?.trim() || extractSeriesTitle(other)?.trim();
              if (otherCandidate && otherCandidate.toLowerCase() === key) {
                occurrences++;
              }
            }
            seriesCountMap.set(key, {
              title: candidate,
              count: occurrences,
            });
          }
        }
      }

      const options = Array.from(seriesCountMap.values()).sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      );

      setSeriesList(options);
    } catch (err) {
      logger.error('Failed to load series list:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredSeries = useMemo(() => {
    if (!searchQuery.trim()) return seriesList;
    const query = searchQuery.toLowerCase();
    return seriesList.filter((s) => s.title.toLowerCase().includes(query));
  }, [seriesList, searchQuery]);

  const handleAssignToSeries = async (seriesTitleToAssign: string) => {
    const trimmed = seriesTitleToAssign.trim();
    if (!trimmed || targetBookIds.length === 0 || submitting) return;

    try {
      setSubmitting(true);
      const libraryBooks = useLibraryStore.getState().books;
      const bookMap = new Map<number, Book>();
      libraryBooks.forEach((b) => {
        if (b.id != null) bookMap.set(b.id, b);
      });

      for (const id of targetBookIds) {
        const targetBook = bookMap.get(id);
        const volNumber = targetBook ? parseVolumeOrChapterNumber(targetBook) : undefined;
        await api.assignBookToSeries(id, trimmed, volNumber != null ? Math.round(volNumber) : undefined);
      }

      toast.success(
        'Added to Series',
        targetBookIds.length === 1
          ? `Added to "${trimmed}"`
          : `Added ${targetBookIds.length} books to "${trimmed}"`
      );

      onAssigned?.();
      void useLibraryStore.getState().refreshLibrary();
      onOpenChange(false);
    } catch (err) {
      logger.error('Failed to assign book to series:', err);
      toast.error('Failed to assign', 'Could not assign book(s) to series');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveFromSeries = async () => {
    if (targetBookIds.length === 0 || submitting) return;

    try {
      setSubmitting(true);
      for (const id of targetBookIds) {
        await api.removeBookFromSeries(id);
      }

      toast.success('Removed from Series', 'Successfully removed book(s) from series');
      onAssigned?.();
      void useLibraryStore.getState().refreshLibrary();
      onOpenChange(false);
    } catch (err) {
      logger.error('Failed to remove book from series:', err);
      toast.error('Failed to remove', 'Could not remove book(s) from series');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border/80 rounded-2xl shadow-2xl w-[92vw] max-w-md max-h-[85vh] flex flex-col z-50 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                <Layers className="w-4 h-4" />
              </div>
              <Dialog.Title className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                Add to Series
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground hover:bg-muted/60 p-1.5 rounded-lg transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-col flex-1 p-5 sm:p-6 overflow-hidden">
            {/* Book Info / Selection context */}
            {bookTitle && (
              <div className="mb-3 text-xs sm:text-sm text-muted-foreground truncate">
                Adding <span className="font-semibold text-foreground">{bookTitle}</span>
              </div>
            )}
            {!bookTitle && targetBookIds.length > 1 && (
              <div className="mb-3 text-xs sm:text-sm text-muted-foreground">
                Adding <span className="font-semibold text-foreground">{targetBookIds.length} selected books</span>
              </div>
            )}

            {/* Current Series Indicator + Remove button */}
            {currentSeries && (
              <div className="flex items-center justify-between p-2.5 px-3 mb-3 rounded-xl bg-primary/10 border border-primary/20 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-muted-foreground">Current:</span>
                  <span className="font-bold text-primary truncate">{currentSeries}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFromSeries}
                  disabled={submitting}
                  className="flex items-center gap-1 text-destructive hover:underline font-semibold ml-2 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            )}

            {!isCreating ? (
              <>
                <div className="relative mb-3">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search or pick existing series..."
                    className="pl-9.5 h-10 rounded-xl bg-muted/40 border-border/60 text-sm"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-1 mb-3.5 min-h-[200px] max-h-[300px] rounded-xl border border-border/60 bg-muted/10 p-1.5 [scrollbar-width:thin]">
                  {loading ? (
                    <div className="flex justify-center items-center h-40">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : filteredSeries.length === 0 ? (
                    <div className="text-center py-10 px-4 text-xs sm:text-sm text-muted-foreground">
                      {searchQuery ? `No series found matching "${searchQuery}".` : 'No series found in library.'}
                    </div>
                  ) : (
                    filteredSeries.map((item) => (
                      <button
                        key={item.title}
                        type="button"
                        disabled={submitting}
                        onClick={() => handleAssignToSeries(item.title)}
                        className="w-full flex items-center justify-between p-2.5 px-3 text-left rounded-lg hover:bg-secondary/70 active:bg-secondary transition-colors group cursor-pointer disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Layers className="w-3.5 h-3.5 text-primary shrink-0 opacity-70 group-hover:opacity-100" />
                          <span className="font-semibold text-xs sm:text-sm text-foreground truncate">{item.title}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {item.count > 0 && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground group-hover:text-foreground">
                              {item.count} {item.count === 1 ? 'book' : 'books'}
                            </span>
                          )}
                          <span className="text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                            Select
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <Button
                  variant="outline"
                  className="w-full gap-2 border-dashed rounded-xl h-10 text-xs sm:text-sm font-semibold cursor-pointer hover:bg-secondary/70"
                  onClick={() => setIsCreating(true)}
                  disabled={submitting}
                >
                  <Plus className="h-4 w-4 text-primary" />
                  Create New Series
                </Button>
              </>
            ) : (
              <div className="flex flex-col flex-1 justify-center space-y-4 pt-2">
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm font-semibold text-foreground">
                    New Series Title
                  </label>
                  <Input
                    value={newSeriesTitle}
                    onChange={(e) => setNewSeriesTitle(e.target.value)}
                    placeholder="e.g. Re:ZERO, Harry Potter..."
                    autoFocus
                    className="h-10 rounded-xl bg-muted/40 border-border/60"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleAssignToSeries(newSeriesTitle);
                      }
                    }}
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="ghost"
                    className="flex-1 rounded-xl h-10 text-xs sm:text-sm font-medium cursor-pointer"
                    onClick={() => setIsCreating(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 gap-2 rounded-xl h-10 text-xs sm:text-sm font-bold cursor-pointer"
                    disabled={!newSeriesTitle.trim() || submitting}
                    onClick={() => handleAssignToSeries(newSeriesTitle)}
                  >
                    <ListPlus className="h-4 w-4" />
                    {submitting ? 'Adding...' : 'Create & Add'}
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
