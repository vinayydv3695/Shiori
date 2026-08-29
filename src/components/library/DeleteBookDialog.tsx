import { logger } from '@/lib/logger';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../../lib/tauri';
import { useToast } from '../../store/toastStore';
import { useLibraryStore } from '../../store/libraryStore';
import { usePreferencesStore } from '../../store/preferencesStore';
import { Button } from '../ui/button';

import { useBottomSheetDrag } from '@/hooks/useBottomSheetDrag';

interface DeleteBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookIds: number[];
  bookTitle?: string;
}

export const DeleteBookDialog = ({ open, onOpenChange, bookIds, bookTitle }: DeleteBookDialogProps) => {
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();
  const setBooks = useLibraryStore(state => state.setBooks);
  const clearSelection = useLibraryStore(state => state.clearSelection);
  const enableRecycleBin = usePreferencesStore(state => state.preferences?.enableRecycleBin ?? false);

  const isMultiple = bookIds.length > 1;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Optimistic UI update
      const currentBooks = useLibraryStore.getState().books;
      setBooks(currentBooks.filter(b => !bookIds.includes(b.id!)));
      clearSelection();

      // Database execution
      if (isMultiple) {
        await api.deleteBooks(bookIds);
      } else {
        await api.deleteBook(bookIds[0]);
      }

      // The optimistic UI update above is sufficient and prevents resetting pagination or search state.

      const message = isMultiple
        ? `${bookIds.length} books have been removed from your library`
        : `"${bookTitle || 'Book'}" has been removed from your library`;

      toast.error(isMultiple ? 'Books deleted' : 'Book deleted', message);
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to delete book(s):', error);
      toast.error('Failed to delete', 'Could not remove book(s) from library');
    } finally {
      setDeleting(false);
    }
  };

  const { isExpanded, handleProps, dragOffset } = useBottomSheetDrag({
    onClose: () => onOpenChange(false),
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/65 backdrop-blur-md transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />
        <Dialog.Content 
          aria-describedby={undefined} 
          className={`fixed inset-x-3 bottom-3 sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-[calc(100vw-24px)] sm:w-[90vw] max-w-md bg-popover dark:bg-card/98 backdrop-blur-2xl border border-border/80 rounded-3xl shadow-2xl z-[210] flex flex-col overflow-hidden focus:outline-none transition-all duration-300 transform-gpu ${
            isExpanded ? 'h-[95vh] sm:h-auto sm:max-h-[85vh]' : 'max-h-[85vh]'
          }`}
          style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
        >
          {/* Mobile Interactive Touch Drag Handle */}
          <div 
            className="w-full py-2.5 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing shrink-0 touch-none sm:hidden select-none"
            {...handleProps}
            title="Drag down to close, tap or drag up to expand full screen"
          >
            <div className="w-12 h-1.5 rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/70 transition-colors" />
          </div>
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <Dialog.Title className="text-lg font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {isMultiple ? 'Delete Books' : 'Delete Book'}
            </Dialog.Title>
             <Dialog.Close asChild>
               <button className="text-muted-foreground hover:text-foreground transition-colors" title="Close">
                 <X className="h-5 w-5" />
               </button>
             </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-6">
            <p className="text-sm text-foreground mb-4">
              Are you sure you want to delete{' '}
              {isMultiple ? (
                <span className="font-semibold">{bookIds.length} books</span>
              ) : (
                <span className="font-semibold">"{bookTitle || 'this book'}"</span>
              )}?
            </p>
            <p className="text-sm text-muted-foreground">
              {enableRecycleBin 
                ? `The ${isMultiple ? 'books' : 'book'} will be moved to the Recycle Bin and kept for 7 days before being permanently deleted.`
                : `This action cannot be undone. The ${isMultiple ? 'books' : 'book'} will be permanently removed from your library, but the ${isMultiple ? 'files' : 'file'} will remain on your disk.`
              }
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={deleting}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              variant="destructive"
              className="min-w-24"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
