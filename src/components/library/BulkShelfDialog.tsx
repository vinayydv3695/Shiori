/**
 * BulkShelfDialog.tsx
 *
 * "Add to Shelf…" for multi-selected library books. Lists all regular shelves
 * (favorites excluded) with checkboxes; on save, every selected book is added
 * to every selected shelf via the bulk `add_books_to_shelf` command.
 *
 * Unlike ShelfSelectDialog (single-book membership sync), this dialog only
 * ADDS — it never removes books from shelves.
 */
import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Check, Loader2, BookOpen, Star } from 'lucide-react';
import { BookshelfIcon } from '@/components/icons';
import { api, type Shelf } from '@/lib/tauri';
import { useToast } from '@/store/toastStore';
import { computeBulkShelfAssignments } from './bulkShelfAssignments';
import { cn } from '@/lib/utils';

interface BulkShelfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Books to add to the chosen shelf(es). */
  bookIds: number[];
}

export function BulkShelfDialog({ open, onOpenChange, bookIds }: BulkShelfDialogProps) {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedIds(new Set());
    api
      .getShelfs()
      .then((all) => setShelves(all.filter((s) => s.shelfType !== 'favorites')))
      .catch((error) => {
        console.error('Failed to load shelves', error);
        toast.error('Failed to load shelves', 'An error occurred while loading shelves');
      })
      .finally(() => setLoading(false));
  }, [open, toast]);

  const handleToggle = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (saving || bookIds.length === 0) return;
    const assignments = computeBulkShelfAssignments(Array.from(selectedIds), bookIds);
    if (assignments.length === 0) {
      toast.warning('No shelf selected', 'Pick at least one shelf to add the books to.');
      return;
    }

    setSaving(true);
    try {
      await Promise.all(
        assignments.map(({ shelfId, bookIds: ids }) => api.addBooksToShelf(shelfId, ids)),
      );
      const shelfNames = shelves
        .filter((s) => s.id !== undefined && selectedIds.has(s.id))
        .map((s) => s.name)
        .join(', ');
      toast.success(
        'Added to shelf',
        `${bookIds.length} book${bookIds.length === 1 ? '' : 's'} added to ${shelfNames}`,
      );
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to add books to shelves', error);
      toast.error('Failed to add to shelf', 'An error occurred while updating shelves');
    } finally {
      setSaving(false);
    }
  }, [saving, bookIds, selectedIds, shelves, toast, onOpenChange]);

  const getShelfIcon = (shelf: Shelf) => {
    if (shelf.icon === 'star') return <Star size={15} />;
    if (shelf.icon === 'bookopen') return <BookOpen size={15} />;
    return <BookshelfIcon className="w-4 h-4" />;
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-[200] w-[90vw] max-w-[420px] translate-x-[-50%] translate-y-[-50%] bg-card/95 backdrop-blur-2xl p-6 shadow-2xl border border-border/60 rounded-3xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-border/40">
            <div>
              <Dialog.Title className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <BookshelfIcon className="w-4 h-4" />
                </div>
                <span>Add to Shelf</span>
              </Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground mt-0.5">
                Add {bookIds.length} selected {bookIds.length === 1 ? 'item' : 'items'} to shelf
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </Dialog.Close>
          </div>

          {/* Shelf List */}
          <div className="py-3 max-h-[50vh] overflow-y-auto space-y-1.5">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin h-6 w-6 text-primary" />
              </div>
            ) : shelves.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-xs font-medium">
                No shelves found. Create one from the sidebar.
              </div>
            ) : (
              shelves.map((shelf) => {
                const isSelected = shelf.id !== undefined && selectedIds.has(shelf.id);
                return (
                  <button
                    key={shelf.id}
                    type="button"
                    onClick={() => shelf.id !== undefined && handleToggle(shelf.id)}
                    className={cn(
                      'w-full flex items-center justify-between p-2.5 rounded-2xl border transition-all duration-200 cursor-pointer select-none text-left',
                      isSelected
                        ? 'bg-primary/10 border-primary/40 shadow-xs'
                        : 'bg-secondary/40 hover:bg-secondary/80 border-border/40'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                          isSelected
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'bg-secondary text-muted-foreground'
                        )}
                      >
                        {getShelfIcon(shelf)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs sm:text-sm font-bold text-foreground truncate">
                          {shelf.name}
                        </span>
                        {shelf.bookCount !== undefined && (
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {shelf.bookCount} {shelf.bookCount === 1 ? 'item' : 'items'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Custom Checkbox Pill */}
                    <div
                      className={cn(
                        'w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border transition-all duration-200',
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground shadow-xs scale-105'
                          : 'border-border/80 bg-background/60 text-transparent'
                      )}
                    >
                      <Check size={12} strokeWidth={3} className={isSelected ? 'block' : 'opacity-0'} />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2 rounded-2xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </Dialog.Close>

            <button
              type="button"
              onClick={handleSave}
              disabled={loading || saving || bookIds.length === 0}
              className="px-5 py-2 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm font-extrabold shadow-md shadow-primary/25 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{saving ? 'Adding…' : 'Add to Shelf'}</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default BulkShelfDialog;
