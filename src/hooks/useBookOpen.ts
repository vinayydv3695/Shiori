import { useState, useCallback, useRef } from 'react';
import { api, isAndroid, type ReadingProgress } from '@/lib/tauri';
import { useUIStore } from '@/store/uiStore';
import { useReaderStore, type ResumeTarget } from '@/store/readerStore';
import { useToastStore } from '@/store/toastStore';
import { logger } from '@/lib/logger';
import type { ConvertOrOpenBook } from '@/components/conversion/ConvertOrOpenDialog';

/** Local formats worth offering EPUB conversion for (manga/comics excluded). */
const CONVERTIBLE_FORMATS = new Set(['pdf', 'mobi', 'azw', 'azw3', 'docx', 'fb2', 'txt', 'html', 'htm', 'md', 'markdown']);

/**
 * Small floor to ignore untouched books.
 * Anything above this counts as a real reading session.
 */
const MIN_RESUME_PROGRESS_PCT = 0.01;



function deriveResumeTarget(bookId: number, progress: ReadingProgress): ResumeTarget | null {
  let chapterIndex: number | null = null;
  let scrollRatio = 0;

  const cfi = progress.cfiLocation;
  if (cfi?.startsWith('epubcfi(') && cfi.endsWith(')')) {
    const inner = cfi.slice(8, -1);
    const parts = inner.split('!/');
    if (parts.length === 2) {
      const pathParts = parts[0].split('/').filter(Boolean);
      if (pathParts.length >= 2) {
        const idx = parseInt(pathParts[1], 10);
        if (!Number.isNaN(idx) && idx >= 0) {
          chapterIndex = idx;
        }
      }

      const scrollMatch = parts[1].match(/^scroll\/([0-9.]+)/);
      if (scrollMatch) {
        const ratio = parseFloat(scrollMatch[1]);
        if (!Number.isNaN(ratio) && ratio >= 0 && ratio <= 1) {
          scrollRatio = ratio;
        }
      }
    }
  }

  const loc = progress.currentLocation;
  if (loc.startsWith('chapter_')) {
    const [chapterPart, scrollPart] = loc.split(':');
    if (chapterIndex === null) {
      const idx = parseInt(chapterPart.replace('chapter_', ''), 10);
      if (!Number.isNaN(idx) && idx >= 0) {
        chapterIndex = idx;
      }
    }
    if (scrollPart?.startsWith('scroll_')) {
      const ratio = parseFloat(scrollPart.replace('scroll_', ''));
      if (!Number.isNaN(ratio) && ratio >= 0 && ratio <= 1) {
        scrollRatio = ratio;
      }
    }
  }

  if (chapterIndex === null) return null;

  return {
    bookId,
    chapterIndex,
    scrollRatio,
  };
}

function hasMeaningfulProgress(progress: ReadingProgress): boolean {
  if (progress.progressPercent > MIN_RESUME_PROGRESS_PCT) return true;

  if (typeof progress.currentPage === 'number' && progress.currentPage > 1) return true;

  const cfi = progress.cfiLocation;
  if (cfi?.startsWith('epubcfi(') && cfi.includes('!/scroll/')) {
    const scrollMatch = cfi.match(/!\/scroll\/([0-9.]+)/);
    if (scrollMatch) {
      const ratio = parseFloat(scrollMatch[1]);
      if (!Number.isNaN(ratio) && ratio > 0.001) return true;
    }

    const inner = cfi.slice(8, -1);
    const parts = inner.split('!/');
    if (parts.length === 2) {
      const pathParts = parts[0].split('/').filter(Boolean);
      if (pathParts.length >= 2) {
        const idx = parseInt(pathParts[1], 10);
        if (!Number.isNaN(idx) && idx > 0) return true;
      }
    }
  }

  const loc = progress.currentLocation;
  if (loc.startsWith('chapter_')) {
    const [chapterPart, scrollPart] = loc.split(':');
    const idx = parseInt(chapterPart.replace('chapter_', ''), 10);
    if (!Number.isNaN(idx) && idx > 0) return true;
    if (scrollPart?.startsWith('scroll_')) {
      const ratio = parseFloat(scrollPart.replace('scroll_', ''));
      if (!Number.isNaN(ratio) && ratio > 0.001) return true;
    }
  }

  return false;
}

/** Saved progress snapshot used for the resume dialog. */
interface PendingResume {
  bookId: number;
  bookTitle: string;
  filePath: string;
  format: string;
  progress: ReadingProgress;
}

export function useBookOpen() {
  const openBook = useReaderStore(s => s.openBook);
  const setExplicitResumeTarget = useReaderStore(s => s.setExplicitResumeTarget);

  // ── Resume-reading prompt state ─────────────────────────────────────────
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [pendingResume, setPendingResume] = useState<PendingResume | null>(null);
  // Convert-or-open choice for non-EPUB local formats.
  const [convertChoice, setConvertChoice] = useState<{ book: ConvertOrOpenBook; openNative: () => void } | null>(null);
  const nativeOpenedRef = useRef<Set<number>>(new Set());

  // ── Internal helpers ────────────────────────────────────────────────────

  /** Build a human-readable location label from reading progress. */
  const buildLocationLabel = (progress: ReadingProgress): string => {
    // Try to extract chapter index from location or CFI
    const cfi = progress.cfiLocation;
    if (cfi?.startsWith('epubcfi(') && cfi.endsWith(')')) {
      const inner = cfi.slice(8, -1);
      const parts = inner.split('!/');
      if (parts.length === 2) {
        const pathParts = parts[0].split('/').filter(Boolean);
        if (pathParts.length >= 2) {
          const idx = parseInt(pathParts[1], 10);
          if (!Number.isNaN(idx)) {
            return `Chapter ${idx + 1}`;
          }
        }
      }
    }

    const loc = progress.currentLocation;
    if (loc.startsWith('chapter_')) {
      const idx = parseInt(loc.replace('chapter_', ''), 10);
      if (!Number.isNaN(idx)) return `Chapter ${idx + 1}`;
    }

    if (progress.currentPage) {
      return `Page ${progress.currentPage}`;
    }

    return `${Math.round(progress.progressPercent)}% in`;
  };


  /**
   * Open a book — every format opens NATIVELY (no auto-conversion; conversion
   * is only ever triggered explicitly via the "Convert to EPUB" menu action).
   * For EPUB books with existing progress, prompts the user to resume or restart.
   * Returns the bookId for selection tracking in the caller.
   */
  const handleOpenBook = useCallback(async (bookId: number): Promise<number | null> => {
    logger.debug('[useBookOpen] Opening book:', bookId);
    try {
      // Clear stale one-shot target from previous open.
      setExplicitResumeTarget(null);

      const book = await api.getBook(bookId);
      const filePath = await api.getBookFilePath(bookId);
      const format = book.file_format.toLowerCase();

      if (format === 'online-manga') {
        const { useOnlineMangaBrowseStore } = await import('@/store/onlineMangaBrowseStore');
        const [protocol, rest] = filePath.split('://');
        if (protocol === 'online-manga' && rest) {
            const firstSlashIndex = rest.indexOf('/');
            const sourceId = firstSlashIndex !== -1 ? rest.substring(0, firstSlashIndex) : rest;
            const contentId = firstSlashIndex !== -1 ? rest.substring(firstSlashIndex + 1) : '';

            if (sourceId === 'mangadex') {
              // MangaDex path — handled by the MangaDex hook
              useOnlineMangaBrowseStore.getState().setSelectedManga({
                id: contentId,
                title: book.title,
                description: book.notes || '',
                coverUrl: book.cover_path,
              });
            } else {
              // Plugin source path (MangaFire, etc.) — handled by the plugin API
              useOnlineMangaBrowseStore.getState().setSelectedPluginManga({
                id: contentId,
                title: book.title,
                summary: book.notes || '',
                description: book.notes || '',
                cover_url: book.cover_path,
                coverUrl: book.cover_path,
                // Store sourceId in extra so OnlineMangaView picks the right plugin
                extra: { librarySourceId: sourceId },
              });
            }

            // Navigate directly to the online-manga detail view
            useUIStore.getState().setCurrentView('online-manga');
            return bookId;
        }
      }

      // EPUB: offer resume/restart when there is meaningful saved progress
      if (format === 'epub') {
        try {
          const progress = await api.getReadingProgress(bookId);
          if (progress && hasMeaningfulProgress(progress)) {
            if (isAndroid) {
              // On Android, skip the resume dialog (touch events don't work
              // reliably with Radix portals in WebView) and auto-resume directly.
              useReaderStore.getState().setStartFromBeginning(false);
              setExplicitResumeTarget(deriveResumeTarget(bookId, progress));
              openBook(bookId, filePath, format);
              return bookId;
            }
            // Desktop/web: Show resume dialog for user to choose
            setPendingResume({ bookId, bookTitle: book.title, filePath, format, progress });
            setShowResumeDialog(true);
            return bookId;
          }
        } catch {
          // Silently ignore — just open normally
        }
      }

      // Non-EPUB local formats: offer "Convert to EPUB / Open as-is" once per
      // book per session (the user's choice is remembered in nativeOpenedRef).
      // On Android the dialog renders a plain fixed overlay (no Radix portal)
      // so touch events stay reliable — see ConvertOrOpenDialog.
      if (CONVERTIBLE_FORMATS.has(format) && !nativeOpenedRef.current.has(bookId)) {
        if (isAndroid) {
          // On Android, bypass convert-choice modal (touch events don't work reliably with Radix portals in WebView)
          nativeOpenedRef.current.add(bookId);
          useReaderStore.getState().setStartFromBeginning(false);
          setExplicitResumeTarget(null);
          openBook(bookId, filePath, book.file_format);
          return bookId;
        }
        setConvertChoice({
          book: { id: bookId, title: book.title, format: book.file_format },
          openNative: () => {
            nativeOpenedRef.current.add(bookId);
            useReaderStore.getState().setStartFromBeginning(false);
            setExplicitResumeTarget(null);
            openBook(bookId, filePath, book.file_format);
          },
        });
        return bookId;
      }

      // Every format opens natively — the backend returns the original file.
      useReaderStore.getState().setStartFromBeginning(false);
      setExplicitResumeTarget(null);
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
  }, [openBook, setExplicitResumeTarget]);

  // ── Resume dialog handlers ──────────────────────────────────────────────

  /** User chose "Continue reading" — open at saved position (normal auto-resume). */
  const handleResume = useCallback(() => {
    if (!pendingResume) return;
    const { bookId, filePath, format } = pendingResume;
    // Ensure startFromBeginning is cleared so the reader auto-resumes saved progress
    useReaderStore.getState().setStartFromBeginning(false);
    setExplicitResumeTarget(deriveResumeTarget(bookId, pendingResume.progress));
    openBook(bookId, filePath, format);
    setShowResumeDialog(false);
    setPendingResume(null);
  }, [pendingResume, openBook, setExplicitResumeTarget]);

  /** User chose "Start from the beginning" — set the flag then open the book. */
  const handleStartOver = useCallback(() => {
    if (!pendingResume) return;
    const { bookId, filePath, format } = pendingResume;
    // Set flag BEFORE openBook so PremiumEpubReader can read it on mount
    useReaderStore.getState().setStartFromBeginning(true);
    setExplicitResumeTarget(null);
    openBook(bookId, filePath, format);
    setShowResumeDialog(false);
    setPendingResume(null);
  }, [pendingResume, openBook, setExplicitResumeTarget]);

  const handleResumeDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setShowResumeDialog(false);
      setPendingResume(null);
    }
  }, []);

  return {
    // Actions
    handleOpenBook,

    // Convert-or-open dialog (non-EPUB local formats)
    convertChoice,
    closeConvertChoice: () => setConvertChoice(null),

    // Resume-reading dialog
    showResumeDialog,
    pendingResume,
    buildLocationLabel,
    handleResume,
    handleStartOver,
    handleResumeDialogOpenChange,
  };
}
