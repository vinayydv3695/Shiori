import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2, CheckCircle, FolderPlus } from 'lucide-react';
import { api } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import { useToast } from '../../store/toastStore';
import { useShelfStore } from '../../store/shelfStore';
import type { ShelfSuggestion } from '../../lib/shelfSuggestions';

interface SmartShelfSuggestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: ShelfSuggestion[];
  successfulPaths: string[];
  onComplete?: () => void;
}

type CreationState = 'idle' | 'creating' | 'completed' | 'error';

export const SmartShelfSuggestionDialog = ({
  open,
  onOpenChange,
  suggestions,
  successfulPaths,
  onComplete,
}: SmartShelfSuggestionDialogProps) => {
  const [state, setState] = useState<CreationState>('idle');
  const [selectedShelfs, setSelectedShelfs] = useState<Set<string>>(
    new Set(suggestions.map(s => s.name))
  );
  const toast = useToast();
  const { addShelf } = useShelfStore();

  const handleToggleShelf = (name: string) => {
    const newSelected = new Set(selectedShelfs);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelectedShelfs(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedShelfs(new Set(suggestions.map(s => s.name)));
  };

  const handleClearAll = () => {
    setSelectedShelfs(new Set());
  };

  const handleCreateShelfs = async () => {
    setState('creating');

    try {
      const selectedSuggestions = suggestions.filter(s =>
        selectedShelfs.has(s.name)
      );

      for (const suggestion of selectedSuggestions) {
        const shelf = await api.createShelf({
          name: suggestion.name,
          description: `Auto-created from folder structure during import`,
          shelf_type: 'regular',
        });

        if (shelf.id) {
          addShelf(shelf);

          // Get the actual books that were imported to add their IDs to the shelf
          const booksForShelf = await api.getBooksByPaths(successfulPaths);
          const bookIdsToAdd = booksForShelf
            .filter(book =>
              suggestion.filePaths.some(
                path => book.file_path === path || book.file_path.endsWith(path)
              )
            )
            .map(book => book.id)
            .filter((id): id is number => id !== undefined);

          if (bookIdsToAdd.length > 0) {
            await api.addBooksToShelf(shelf.id, bookIdsToAdd);
            logger.info(
              `[Shelfs] Added ${bookIdsToAdd.length} books to shelf "${suggestion.name}"`
            );
          }
        }
      }

      setState('completed');
      toast.success(
        `Created ${selectedSuggestions.length} shelf${selectedSuggestions.length !== 1 ? 's' : ''}`,
        'Books automatically organized into new shelves'
      );

      setTimeout(() => {
        handleClose();
        onComplete?.();
      }, 1500);
    } catch (error) {
      logger.error('Failed to create shelves:', error);
      setState('error');
      toast.error(
        'Failed to create shelves',
        'An error occurred while creating shelves'
      );
    }
  };

  const handleClose = () => {
    setState('idle');
    setSelectedShelfs(new Set());
    onOpenChange(false);
  };

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content aria-describedby="shelf-suggestion-description" className="dialog-content fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-[1.5rem] shadow-2xl w-[calc(100vw-2rem)] max-w-[600px] max-h-[90vh] overflow-y-auto z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-300 custom-scrollbar outline-none">
          <Dialog.Description id="shelf-suggestion-description" className="sr-only">
            Suggestions for creating shelves based on your imported books.
          </Dialog.Description>
          <div className="sticky top-0 bg-transparent backdrop-blur-xl border-b border-border px-6 py-5 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FolderPlus className="w-6 h-6 text-primary" />
                <Dialog.Title className="text-xl font-bold tracking-tight text-foreground">
                  Smart Shelf Suggestions
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button
                  className="p-2.5 bg-secondary hover:bg-secondary/80 border border-transparent rounded-xl transition-all duration-200 text-muted-foreground hover:text-foreground"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {state === 'idle' && (
              <>
                <div className="bg-secondary/20 border border-border rounded-xl p-4">
                  <p className="text-sm text-foreground/80">
                    We detected folder patterns in your imported books. Create
                    shelves to auto-organize them?
                  </p>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                  {suggestions.map(suggestion => (
                    <label
                      key={suggestion.name}
                      className="flex items-center gap-3 p-3 border border-border rounded-xl bg-card/30 hover:bg-card/60 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedShelfs.has(suggestion.name)}
                        onChange={() =>
                          handleToggleShelf(suggestion.name)
                        }
                        className="w-4 h-4 rounded border-border bg-secondary text-primary focus:ring-primary/50"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground truncate">
                          {suggestion.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {suggestion.bookCount} book
                          {suggestion.bookCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSelectAll}
                    className="text-sm px-3 py-1 text-muted-foreground hover:text-foreground font-medium transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="text-sm px-3 py-1 text-muted-foreground hover:text-foreground font-medium transition-colors"
                  >
                    Clear All
                  </button>
                </div>

                <div className="flex gap-3 pt-6 border-t border-border mt-2">
                  <button
                    onClick={handleClose}
                    className="flex-1 px-5 py-2.5 bg-transparent hover:bg-secondary border border-transparent hover:border-border rounded-xl transition-all duration-200 font-medium text-muted-foreground hover:text-foreground"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleCreateShelfs}
                    disabled={selectedShelfs.size === 0}
                    className="flex-1 px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground rounded-xl shadow-sm transition-all duration-200 flex items-center justify-center gap-2 font-semibold"
                  >
                    <FolderPlus className="w-4 h-4" />
                    Create {selectedShelfs.size} Shelf
                    {selectedShelfs.size !== 1 ? 's' : ''}
                  </button>
                </div>
              </>
            )}

            {state === 'creating' && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="p-6 bg-card/40 backdrop-blur-md border border-primary/20 rounded-[2rem] shadow-inner shadow-primary/10 mb-6">
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                </div>
                <div className="text-xl font-bold tracking-tight text-foreground">
                  Creating shelves...
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  Organizing your books
                </div>
              </div>
            )}

            {state === 'completed' && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-[2rem] shadow-inner shadow-emerald-500/10 mb-6">
                  <CheckCircle className="w-12 h-12 text-emerald-500" />
                </div>
                <div className="text-xl font-bold tracking-tight text-foreground">Shelfs Created!</div>
                <div className="text-sm text-muted-foreground mt-2">
                  {selectedShelfs.size} shelf
                  {selectedShelfs.size !== 1 ? 's' : ''} ready to use
                </div>
              </div>
            )}

            {state === 'error' && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="text-xl font-bold tracking-tight text-destructive">
                  Failed to create shelves
                </div>
                <button
                  onClick={() => setState('idle')}
                  className="mt-6 px-6 py-2.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border rounded-xl transition-all duration-200 font-medium"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
