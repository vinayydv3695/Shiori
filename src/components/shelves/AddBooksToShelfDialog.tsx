import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Loader2, Plus, Check, BookOpen } from 'lucide-react';
import { api, type Book, type Shelf } from '@/lib/tauri';
import { useToast } from '@/store/toastStore';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

interface AddBooksToShelfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shelf: Shelf;
  onBooksUpdated: () => void;
}

export function AddBooksToShelfDialog({
  open,
  onOpenChange,
  shelf,
  onBooksUpdated,
}: AddBooksToShelfDialogProps) {
  const toast = useToast();
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [initialShelfBookIds, setInitialShelfBookIds] = useState<Set<number>>(new Set());
  const [selectedBookIds, setSelectedBookIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isCustomColor = Boolean(shelf.color && !['#3b82f6', '#2563eb', '#1d4ed8', '#60a5fa', '#6366f1'].includes(shelf.color.toLowerCase()));
  const shelfColor = isCustomColor ? shelf.color! : 'hsl(var(--primary))';

  useEffect(() => {
    if (!open || !shelf.id) return;

    async function loadData() {
      setLoading(true);
      try {
        const [libraryBooks, shelfBooks] = await Promise.all([
          api.getBooks(),
          api.getShelfBooks(shelf.id!),
        ]);

        const inShelfSet = new Set((shelfBooks || []).map((b) => b.id!).filter(Boolean));
        setAllBooks(libraryBooks || []);
        setInitialShelfBookIds(inShelfSet);
        setSelectedBookIds(new Set(inShelfSet));
      } catch (err) {
        logger.error('Failed to load books for shelf assignment:', err);
        toast.error('Failed to load books', String(err));
      } finally {
        setLoading(false);
      }
    }

    loadData();
    setSearchQuery('');
  }, [open, shelf.id]);

  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) return allBooks;
    const q = searchQuery.toLowerCase();
    return allBooks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.authors && b.authors.some((a) => a.name.toLowerCase().includes(q))) ||
        (b.series && b.series.toLowerCase().includes(q))
    );
  }, [allBooks, searchQuery]);

  const toggleBook = (bookId: number) => {
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        next.add(bookId);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      filteredBooks.forEach((b) => {
        if (b.id) next.add(b.id);
      });
      return next;
    });
  };

  const deselectAllFiltered = () => {
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      filteredBooks.forEach((b) => {
        if (b.id) next.delete(b.id);
      });
      return next;
    });
  };

  const handleSave = async () => {
    if (!shelf.id) return;
    setSaving(true);
    try {
      const toAdd = Array.from(selectedBookIds).filter((id) => !initialShelfBookIds.has(id));
      const toRemove = Array.from(initialShelfBookIds).filter((id) => !selectedBookIds.has(id));

      if (toAdd.length > 0) {
        await api.addBooksToShelf(shelf.id, toAdd);
      }
      for (const id of toRemove) {
        await api.removeBookFromShelf(shelf.id, id);
      }

      toast.success(
        'Shelf updated',
        `Updated books for "${shelf.name}"`
      );
      onBooksUpdated();
      onOpenChange(false);
    } catch (err) {
      logger.error('Failed to update shelf books:', err);
      toast.error('Failed to update shelf', String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[92vw] sm:w-full rounded-2xl p-0 overflow-hidden bg-background/95 backdrop-blur-2xl border-border/50 shadow-2xl flex flex-col max-h-[85vh]">
        <DialogHeader className="px-5 pt-5 pb-3.5 border-b border-border/40">
          <DialogTitle className="text-base sm:text-lg font-bold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: shelfColor }} />
              <span className="truncate">Add Books to Shelf</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary/80 text-muted-foreground border border-border/40 shrink-0 truncate max-w-[150px]">
                {shelf.name}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 sm:p-5 flex flex-col gap-3.5 overflow-hidden flex-1">
          {/* Search bar & quick actions */}
          <div className="flex flex-row items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, author, or series..."
                className="pl-9 h-9 rounded-xl bg-secondary/40 border-border/50 text-xs focus-visible:ring-1 focus-visible:ring-primary/50"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-xs font-semibold h-9 px-3 rounded-xl bg-secondary/60 hover:bg-secondary border border-border/50 text-foreground transition-all cursor-pointer shadow-xs active:scale-95"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={deselectAllFiltered}
                className="text-xs font-semibold h-9 px-3 rounded-xl bg-secondary/40 hover:bg-secondary/70 border border-border/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer active:scale-95"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Book List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar border border-border/40 rounded-xl p-1.5 bg-secondary/10 min-h-[240px] max-h-[380px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs font-medium">Loading library books...</span>
              </div>
            ) : filteredBooks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                <BookOpen className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm font-semibold text-foreground">No books found</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {searchQuery ? 'Try adjusting your search query' : 'Your library is empty'}
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {filteredBooks.map((book) => {
                  const isChecked = selectedBookIds.has(book.id!);
                  const authorStr =
                    book.authors && book.authors.length > 0
                      ? book.authors.map((a) => a.name).join(', ')
                      : null;

                  return (
                    <li
                      key={book.id}
                      onClick={() => toggleBook(book.id!)}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all border group",
                        isChecked
                          ? "bg-primary/10 border-primary/40 text-foreground shadow-xs"
                          : "hover:bg-secondary/50 border-transparent text-foreground/80"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0",
                        isChecked
                          ? "bg-primary border-primary text-primary-foreground shadow-xs scale-105"
                          : "border-border/80 bg-background/60 group-hover:border-primary/50"
                      )}>
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>

                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs sm:text-sm font-semibold truncate leading-tight">
                          {book.title}
                        </span>
                        {authorStr && (
                          <span className="text-[11px] text-muted-foreground truncate mt-0.5 font-medium">
                            {authorStr}
                          </span>
                        )}
                      </div>

                      <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-secondary/80 border border-border/50 text-muted-foreground shrink-0">
                        {book.file_format}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter 
          className="px-5 py-3.5 bg-secondary/20 border-t border-border/40 flex items-center justify-between gap-3"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 14px)' }}
        >
          <span className="text-xs font-medium text-muted-foreground">
            <span className="font-bold text-foreground">{selectedBookIds.size}</span> of {allBooks.length} books selected
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="rounded-xl h-9 px-3.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="rounded-xl h-9 px-4 text-xs font-bold gap-1.5 bg-primary/90 hover:bg-primary text-primary-foreground shadow-md shadow-primary/20 transition-all flex items-center cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Save Changes</span>
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
