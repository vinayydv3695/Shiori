import { useCallback, useState, useEffect } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useToastStore } from '@/store/toastStore';
import { useBookOpen } from '@/hooks/useBookOpen';
import { api, type Book } from '@/lib/tauri';
import { logger } from '@/lib/logger';

/**
 * Encapsulates all book-level action handlers that were inlined in App.tsx:
 * open, close, edit, delete, download, convert, view details, etc.
 *
 * Now uses `useBookOpen` for automatic EPUB conversion on open.
 */
export function useBookActions(books: Book[]) {
  const closeBook = useReaderStore(state => state.closeBook);
  const loadInitialBooks = useLibraryStore(state => state.loadInitialBooks);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);

  // Use the new auto-convert hook for book opening
  const bookOpen = useBookOpen();

  const handleOpenBook = useCallback(async (bookId: number) => {
    logger.debug('[App] Opening book:', bookId);
    const result = await bookOpen.handleOpenBook(bookId);
    if (result !== null) {
      setSelectedBookId(result);
    }
  }, [bookOpen.handleOpenBook]);

  // Listen for the custom 'open-book' event dispatched by other components
  useEffect(() => {
    const handler = (e: Event) => {
      const bookId = (e as CustomEvent<{ bookId: number }>).detail?.bookId;
      if (bookId) handleOpenBook(bookId);
    };
    window.addEventListener('open-book', handler);
    return () => window.removeEventListener('open-book', handler);
  }, [handleOpenBook]);

  const handleCloseReader = useCallback(() => {
    closeBook();
    setSelectedBookId(null);
  }, [closeBook]);

  const handleDownloadBook = useCallback((bookId: number) => {
    const book = books.find(b => b.id === bookId);
    if (book) {
      navigator.clipboard.writeText(book.file_path).then(
        () => {
          useToastStore.getState().addToast({
            title: 'File path copied',
            description: book.file_path,
            variant: 'info',
          });
        },
        () => {
          useToastStore.getState().addToast({
            title: 'Book file location',
            description: book.file_path,
            variant: 'info',
          });
        }
      );
    }
  }, [books]);

  const handleAutoGroupManga = useCallback(async () => {
    try {
      const count = await api.autoGroupMangaVolumes();
      if (count > 0) {
        useToastStore.getState().addToast({
          title: 'Auto-grouping complete',
          description: `Grouped ${count} manga volume${count > 1 ? 's' : ''} into series`,
          variant: 'success',
        });
        await loadInitialBooks();
      } else {
        useToastStore.getState().addToast({
          title: 'No volumes grouped',
          description: 'No manga volumes matched the auto-grouping pattern',
          variant: 'info',
        });
      }
    } catch (error) {
      logger.error('Auto-grouping failed:', error);
      useToastStore.getState().addToast({
        title: 'Auto-grouping failed',
        description: String(error),
        variant: 'error',
      });
    }
  }, [loadInitialBooks]);

  return {
    selectedBookId,
    handleOpenBook,
    handleCloseReader,
    handleDownloadBook,
    handleAutoGroupManga,
    // Expose auto-convert dialog state
    autoConvert: {
      showDialog: bookOpen.showConvertDialog,
      isConverting: bookOpen.isConverting,
      pendingBook: bookOpen.pendingBook,
      onConfirm: bookOpen.handleConfirmConvert,
      onCancel: bookOpen.handleCancelConvert,
      onDialogOpenChange: bookOpen.handleDialogOpenChange,
    },
  };
}
