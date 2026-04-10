import { useState, useCallback } from 'react';
import { api, type Book } from '@/lib/tauri';
import { useReaderStore } from '@/store/readerStore';
import { useToastStore } from '@/store/toastStore';
import { useLibraryStore } from '@/store/libraryStore';
import { logger } from '@/lib/logger';

/** Formats that should open directly without conversion prompt */
const DIRECT_OPEN_FORMATS = new Set(['epub', 'cbz', 'cbr']);

/** Formats that can be converted to EPUB */
const CONVERTIBLE_FORMATS = new Set(['mobi', 'azw3', 'pdf', 'txt', 'docx', 'fb2', 'html']);

export interface BookOpenState {
  /** Whether the auto-convert dialog is visible */
  showConvertDialog: boolean;
  /** Whether a conversion is in progress */
  isConverting: boolean;
  /** Book currently pending conversion decision */
  pendingBook: Book | null;
}

export function useBookOpen() {
  const openBook = useReaderStore(s => s.openBook);
  const loadInitialBooks = useLibraryStore(s => s.loadInitialBooks);

  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [pendingBook, setPendingBook] = useState<Book | null>(null);
  const [pendingBookPath, setPendingBookPath] = useState<string | null>(null);

  /**
   * Open a book — will prompt for EPUB conversion if the format is non-EPUB.
   * Returns the bookId for selection tracking in the caller.
   */
  const handleOpenBook = useCallback(async (bookId: number): Promise<number | null> => {
    logger.debug('[useBookOpen] Opening book:', bookId);
    try {
      const book = await api.getBook(bookId);
      const filePath = await api.getBookFilePath(bookId);
      const format = book.file_format.toLowerCase();

      // Direct open for EPUB and comic formats
      if (DIRECT_OPEN_FORMATS.has(format)) {
        openBook(bookId, filePath, book.file_format);
        return bookId;
      }

      // Convertible format → show prompt
      if (CONVERTIBLE_FORMATS.has(format)) {
        setPendingBook(book);
        setPendingBookPath(filePath);
        setShowConvertDialog(true);
        return bookId;
      }

      // Unknown but still try to open in native format
      openBook(bookId, filePath, book.file_format);
      return bookId;
    } catch (error) {
      logger.error('[useBookOpen] Failed to open book:', error);
      useToastStore.getState().addToast({
        title: 'Failed to open book',
        description: String(error),
        variant: 'error',
      });
      return null;
    }
  }, [openBook]);

  /** User confirmed: convert to EPUB, then open */
  const handleConfirmConvert = useCallback(async () => {
    if (!pendingBook?.id) return;

    setIsConverting(true);
    try {
      const result = await api.convertAndReplaceBook(pendingBook.id);

      logger.info('[useBookOpen] Conversion complete:', result.new_path);

      // Open the newly created EPUB
      openBook(pendingBook.id, result.new_path, 'epub');

      useToastStore.getState().addToast({
        title: 'Converted to EPUB',
        description: `"${result.title}" has been converted successfully.`,
        variant: 'success',
      });

      // Refresh library to pick up the format change
      loadInitialBooks();
    } catch (error) {
      logger.error('[useBookOpen] Conversion failed:', error);
      useToastStore.getState().addToast({
        title: 'Conversion failed',
        description: String(error),
        variant: 'error',
      });
    } finally {
      setIsConverting(false);
      setShowConvertDialog(false);
      setPendingBook(null);
      setPendingBookPath(null);
    }
  }, [pendingBook, openBook, loadInitialBooks]);

  /** User declined: open the book in its original format */
  const handleCancelConvert = useCallback(() => {
    if (pendingBook?.id && pendingBookPath) {
      openBook(pendingBook.id, pendingBookPath, pendingBook.file_format);
    }
    setShowConvertDialog(false);
    setPendingBook(null);
    setPendingBookPath(null);
  }, [pendingBook, pendingBookPath, openBook]);

  /** Close the dialog without opening anything */
  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open && !isConverting) {
      setShowConvertDialog(false);
      setPendingBook(null);
      setPendingBookPath(null);
    }
  }, [isConverting]);

  return {
    // State
    showConvertDialog,
    isConverting,
    pendingBook,

    // Actions
    handleOpenBook,
    handleConfirmConvert,
    handleCancelConvert,
    handleDialogOpenChange,
  };
}
