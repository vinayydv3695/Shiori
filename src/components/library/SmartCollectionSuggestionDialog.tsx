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
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto z-50">
          <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FolderPlus className="w-6 h-6 text-blue-600" />
                <Dialog.Title className="text-xl font-semibold">
                  Smart Collection Suggestions
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
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
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    We detected folder patterns in your imported books. Create
                    collections to auto-organize them?
                  </p>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {suggestions.map(suggestion => (
                    <label
                      key={suggestion.name}
                      className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCollections.has(suggestion.name)}
                        onChange={() =>
                          handleToggleCollection(suggestion.name)
                        }
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white truncate">
                          {suggestion.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
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
                    className="text-sm px-3 py-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="text-sm px-3 py-1 text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  >
                    Clear All
                  </button>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={handleClose}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleCreateCollections}
                    disabled={selectedCollections.size === 0}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
                <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-4" />
                <div className="text-lg font-medium">
                  Creating collections...
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  Organizing your books
                </div>
              </div>
            )}

            {state === 'completed' && (
              <div className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="w-16 h-16 text-green-600 mb-4" />
                <div className="text-lg font-medium">Collections Created!</div>
                <div className="text-sm text-gray-500 mt-1">
                  {selectedCollections.size} collection
                  {selectedCollections.size !== 1 ? 's' : ''} ready to use
                </div>
              </div>
            )}

            {state === 'error' && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="text-lg font-medium text-red-600">
                  Failed to create collections
                </div>
                <button
                  onClick={() => setState('idle')}
                  className="mt-4 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
