import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../../lib/tauri';
import { useToast } from '../../store/toastStore';
import { useLibraryStore } from '../../store/libraryStore';
import { Button } from '../ui/button';

interface DeleteBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: number;
  bookTitle?: string;
}

export const DeleteBookDialog = ({ open, onOpenChange, bookId, bookTitle }: DeleteBookDialogProps) => {
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();
  const { setBooks } = useLibraryStore();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteBook(bookId);
      
      // Reload library
      const books = await api.getBooks();
      setBooks(books);
      
      toast.success('Book deleted', `"${bookTitle || 'Book'}" has been removed from your library`);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to delete book:', error);
      toast.error('Failed to delete', 'Could not remove book from library');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-lg shadow-lg w-[90vw] max-w-md z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <Dialog.Title className="text-lg font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Book
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-6">
            <p className="text-sm text-foreground mb-4">
              Are you sure you want to delete{' '}
              <span className="font-semibold">"{bookTitle || 'this book'}"</span>?
            </p>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. The book will be permanently removed from your library, 
              but the file will remain on your disk.
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
