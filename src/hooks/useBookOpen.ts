import { useState, useCallback } from 'react';
import { api, type Book, type ReadingProgress } from '@/lib/tauri';
import { useReaderStore, type ResumeTarget } from '@/store/readerStore';
import { useToastStore } from '@/store/toastStore';
import { useLibraryStore } from '@/store/libraryStore';
import { logger } from '@/lib/logger';

/** Formats that should open directly without conversion prompt */
const DIRECT_OPEN_FORMATS = new Set(['epub', 'cbz', 'cbr', 'zip', 'rar']);

/** Formats that can be converted to EPUB */
const CONVERTIBLE_FORMATS = new Set(['mobi', 'azw3', 'pdf', 'txt', 'docx', 'fb2', 'html']);

/**
 * Small floor to ignore untouched books.
 * Anything above this counts as a real reading session.
 */
const MIN_RESUME_PROGRESS_PCT = 0.01;

/** Persisted per-book resume behavior preference. */
type ResumeChoice = 'resume' | 'start_over';
const RESUME_CHOICE_STORAGE_KEY = 'shiori-epub-resume-choice:v1';

function getResumeChoices(): Record<string, ResumeChoice> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(RESUME_CHOICE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ResumeChoice>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function getResumeChoiceForBook(bookId: number): ResumeChoice | null {
  const choices = getResumeChoices();
  return choices[String(bookId)] ?? null;
}

function setResumeChoiceForBook(bookId: number, choice: ResumeChoice): void {
  if (typeof window === 'undefined') return;
  const key = String(bookId);
  const next = {
    ...getResumeChoices(),
    [key]: choice,
  };
  try {
    window.localStorage.setItem(RESUME_CHOICE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures silently
  }
}

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

export interface BookOpenState {
  /** Whether the auto-convert dialog is visible */
  showConvertDialog: boolean;
  /** Whether a conversion is in progress */
  isConverting: boolean;
  /** Book currently pending conversion decision */
  pendingBook: Book | null;
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
  const loadInitialBooks = useLibraryStore(s => s.loadInitialBooks);

  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [pendingBook, setPendingBook] = useState<Book | null>(null);
  const [pendingBookPath, setPendingBookPath] = useState<string | null>(null);

  // ── Resume-reading prompt state ─────────────────────────────────────────
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [pendingResume, setPendingResume] = useState<PendingResume | null>(null);

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
   * Open a book — will prompt for EPUB conversion if the format is non-EPUB.
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

      // Direct open for EPUB and comic formats
      if (DIRECT_OPEN_FORMATS.has(format)) {
        // For EPUB, check if the user has meaningful saved progress to offer resume
        if (format === 'epub') {
          try {
            const progress = await api.getReadingProgress(bookId);
            if (progress && hasMeaningfulProgress(progress)) {
              const rememberedChoice = getResumeChoiceForBook(bookId);

              // Ask only once per book: honor remembered choice on next opens
              if (rememberedChoice === 'resume') {
                useReaderStore.getState().setStartFromBeginning(false);
                setExplicitResumeTarget(deriveResumeTarget(bookId, progress));
                openBook(bookId, filePath, book.file_format);
                return bookId;
              }

              if (rememberedChoice === 'start_over') {
                useReaderStore.getState().setStartFromBeginning(true);
                setExplicitResumeTarget(null);
                openBook(bookId, filePath, book.file_format);
                return bookId;
              }

              // No remembered choice yet: show dialog once
              setPendingResume({ bookId, bookTitle: book.title, filePath, format, progress });
              setShowResumeDialog(true);
              return bookId;
            }
          } catch {
            // Silently ignore — just open normally
          }
        }

        // Default direct-open behavior should not force start-over.
        useReaderStore.getState().setStartFromBeginning(false);
        setExplicitResumeTarget(null);
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
    setResumeChoiceForBook(bookId, 'resume');
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
    setResumeChoiceForBook(bookId, 'start_over');
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

// ── Convert dialog handlers ─────────────────────────────────────────────

/** User confirmed: convert to EPUB, then open */
const handleConfirmConvert = useCallback(async () => {
  if (!pendingBook?.id) return;

  setIsConverting(true);
  try {
    const result = await api.convertAndReplaceBook(pendingBook.id);

    logger.info('[useBookOpen] Conversion complete:', result.new_path);

    // Converted open should not inherit stale one-shot resume flags.
    useReaderStore.getState().setStartFromBeginning(false);
    setExplicitResumeTarget(null);

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
}, [pendingBook, openBook, loadInitialBooks, setExplicitResumeTarget]);

/** User declined: open the book in its original format */
const handleCancelConvert = useCallback(() => {
  if (pendingBook?.id && pendingBookPath) {
    useReaderStore.getState().setStartFromBeginning(false);
    setExplicitResumeTarget(null);
    openBook(pendingBook.id, pendingBookPath, pendingBook.file_format);
  }
  setShowConvertDialog(false);
  setPendingBook(null);
  setPendingBookPath(null);
}, [pendingBook, pendingBookPath, openBook, setExplicitResumeTarget]);

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

  // Resume-reading dialog
  showResumeDialog,
  pendingResume,
  buildLocationLabel,
  handleResume,
  handleStartOver,
  handleResumeDialogOpenChange,
};
}
