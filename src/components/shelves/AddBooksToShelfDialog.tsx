import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Loader2, Plus, Check, BookOpen } from 'lucide-react';
import { api, type Book, type Shelf } from '@/lib/tauri';
import { useToast } from '@/store/toastStore';
import { logger } from '@/lib/logger';

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
      <DialogContent className="max-w-xl w-[92vw] sm:w-full rounded-2xl p-0 overflow-hidden bg-background/95 backdrop-blur-2xl border-border/50 shadow-2xl flex flex-col max-h-[85vh]">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" /> Add Books to "{shelf.name}"
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 sm:p-6 flex flex-col gap-4 overflow-hidden flex-1">
          {/* Search bar & quick actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search books by title, author, or series..."
                className="pl-9 h-10 rounded-xl bg-secondary/50 border-border/50 text-sm focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={selectAllFiltered}
                className="text-xs h-9 rounded-lg"
              >
                Select All
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={deselectAllFiltered}
                className="text-xs h-9 rounded-lg"
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Book List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar border border-border/40 rounded-xl p-2 bg-secondary/10 min-h-[250px] max-h-[400px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs">Loading library books...</span>
              </div>
            ) : filteredBooks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                <BookOpen className="w-8 h-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium text-foreground">No books found</p>
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
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors border ${
                        isChecked
                          ? 'bg-primary/10 border-primary/40 text-foreground'
                          : 'hover:bg-secondary/60 border-transparent text-foreground/80'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                        isChecked
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border/80 bg-background/50'
                      }`}>
                        {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>

                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm font-semibold truncate leading-tight">
                          {book.title}
                        </span>
                        {authorStr && (
                          <span className="text-xs text-muted-foreground truncate mt-0.5">
                            {authorStr}
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-secondary border border-border/40 text-muted-foreground shrink-0">
                        {book.file_format}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="text-xs text-muted-foreground flex justify-between items-center px-1">
            <span>
              {selectedBookIds.size} of {allBooks.length} books selected
            </span>
          </div>
        </div>

        <DialogFooter 
          className="px-6 py-4 bg-secondary/30 border-t border-border/40 flex items-center justify-end gap-2"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
        >
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-xl h-10 px-4 text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="rounded-xl h-10 px-5 text-xs font-semibold gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
