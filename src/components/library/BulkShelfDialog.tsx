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
import { X, FolderPlus } from 'lucide-react';
import { api, type Shelf } from '@/lib/tauri';
import { Button } from '@/components/ui/button';
import { useToast } from '@/store/toastStore';
import { computeBulkShelfAssignments } from './bulkShelfAssignments';

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
    // Intentional: reset + fetch shelves every time the dialog opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[70] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-[70] grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg">
          <div className="flex flex-col space-y-1.5">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
                <FolderPlus className="h-5 w-5" />
                Add to Shelf
              </Dialog.Title>
              <Dialog.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Dialog.Close>
            </div>
            <Dialog.Description className="text-sm text-muted-foreground">
              Add {bookIds.length} selected book{bookIds.length === 1 ? '' : 's'} to the
              shelf{selectedIds.size === 1 ? '' : 'es'} below.
            </Dialog.Description>
          </div>

          <div className="py-4 max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : shelves.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No shelves found. Create one from the sidebar.
              </div>
            ) : (
              <div className="space-y-2">
                {shelves.map((shelf) => (
                  <label
                    key={shelf.id}
                    className="flex items-center space-x-3 p-3 rounded-md hover:bg-accent cursor-pointer transition-colors border border-transparent hover:border-border"
                  >
                    <input
                      type="checkbox"
                      checked={shelf.id !== undefined && selectedIds.has(shelf.id)}
                      onChange={() => shelf.id !== undefined && handleToggle(shelf.id)}
                      className="h-4 w-4 rounded border-primary text-primary focus:ring-primary bg-background accent-primary"
                    />
                    <span className="text-sm font-medium leading-none">{shelf.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || saving || bookIds.length === 0}>
              {saving ? 'Adding…' : 'Add to Shelf'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default BulkShelfDialog;
