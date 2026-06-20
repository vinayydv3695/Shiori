import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2, CheckCircle, FolderPlus } from 'lucide-react';
import { api } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import { useToast } from '../../store/toastStore';
import { useCollectionStore } from '../../store/collectionStore';
import type { CollectionSuggestion } from '../../lib/collectionSuggestions';

interface SmartCollectionSuggestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: CollectionSuggestion[];
  successfulPaths: string[];
  onComplete?: () => void;
}

type CreationState = 'idle' | 'creating' | 'completed' | 'error';

export const SmartCollectionSuggestionDialog = ({
  open,
  onOpenChange,
  suggestions,
  successfulPaths,
  onComplete,
}: SmartCollectionSuggestionDialogProps) => {
  const [state, setState] = useState<CreationState>('idle');
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(
    new Set(suggestions.map(s => s.name))
  );
  const toast = useToast();
  const { addCollection } = useCollectionStore();

  const handleToggleCollection = (name: string) => {
    const newSelected = new Set(selectedCollections);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelectedCollections(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedCollections(new Set(suggestions.map(s => s.name)));
  };

  const handleClearAll = () => {
    setSelectedCollections(new Set());
  };

  const handleCreateCollections = async () => {
    setState('creating');

    try {
      const selectedSuggestions = suggestions.filter(s =>
        selectedCollections.has(s.name)
      );

      for (const suggestion of selectedSuggestions) {
        const collection = await api.createCollection({
          name: suggestion.name,
          description: `Auto-created from folder structure during import`,
          collection_type: 'regular',
        });

        if (collection.id) {
          addCollection(collection);

          const booksForCollection = await api.getBooks();
          const bookIdsToAdd = booksForCollection
            .filter(book =>
              suggestion.filePaths.some(
                path => book.file_path === path || book.file_path.endsWith(path)
              )
            )
            .map(book => book.id)
            .filter((id): id is number => id !== undefined);

          if (bookIdsToAdd.length > 0) {
            await api.addBooksToCollection(collection.id, bookIdsToAdd);
            logger.info(
              `[Collections] Added ${bookIdsToAdd.length} books to collection "${suggestion.name}"`
            );
          }
        }
      }

      setState('completed');
      toast.success(
        `Created ${selectedSuggestions.length} collection${selectedSuggestions.length !== 1 ? 's' : ''}`,
        'Books automatically organized into new collections'
      );

      setTimeout(() => {
        handleClose();
        onComplete?.();
      }, 1500);
    } catch (error) {
      logger.error('Failed to create collections:', error);
      setState('error');
      toast.error(
        'Failed to create collections',
        'An error occurred while creating collections'
      );
    }
  };

  const handleClose = () => {
    setState('idle');
    setSelectedCollections(new Set());
    onOpenChange(false);
  };

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 bg-background/80 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content aria-describedby={undefined} className="dialog-content fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-3xl border border-border rounded-[1.5rem] shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-300 custom-scrollbar outline-none">
          <div className="sticky top-0 bg-transparent backdrop-blur-xl border-b border-border px-6 py-5 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FolderPlus className="w-6 h-6 text-primary" />
                <Dialog.Title className="text-xl font-bold tracking-tight text-foreground">
                  Smart Collection Suggestions
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
                    collections to auto-organize them?
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
                        checked={selectedCollections.has(suggestion.name)}
                        onChange={() =>
                          handleToggleCollection(suggestion.name)
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
                    onClick={handleCreateCollections}
                    disabled={selectedCollections.size === 0}
                    className="flex-1 px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground rounded-xl shadow-sm transition-all duration-200 flex items-center justify-center gap-2 font-semibold"
                  >
                    <FolderPlus className="w-4 h-4" />
                    Create {selectedCollections.size} Collection
                    {selectedCollections.size !== 1 ? 's' : ''}
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
                  Creating collections...
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
                <div className="text-xl font-bold tracking-tight text-foreground">Collections Created!</div>
                <div className="text-sm text-muted-foreground mt-2">
                  {selectedCollections.size} collection
                  {selectedCollections.size !== 1 ? 's' : ''} ready to use
                </div>
              </div>
            )}

            {state === 'error' && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="text-xl font-bold tracking-tight text-destructive">
                  Failed to create collections
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
