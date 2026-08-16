import { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react';
import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import type { BookMetadata, Annotation } from '@/lib/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Minimize, FileText, Loader2, AlertCircle } from '@/components/icons';
import {
  useReaderUIStore,
  useReadingSettings,
  BG_COLOR_PRESETS,
  TEXT_COLOR_PRESETS,
} from '@/store/premiumReaderStore';
import { useDoodleStore } from '@/store/doodleStore';
import { useToastStore } from '@/store/toastStore';
import { handleExternalLinkClick } from '@/lib/externalLinks';
import { ReaderTopBar } from './ReaderTopBar';
import { PremiumSidebar } from './PremiumSidebar';
import { DoodleCanvas } from './DoodleCanvas';
import { DoodleToolbar } from './DoodleToolbar';
import { TextSelectionToolbar } from './TextSelectionToolbar';
import { ReaderAnnotationTooltip } from './ReaderAnnotationTooltip';
import { formatNotePreview } from '@/lib/highlightAnnotations';
import { useReadingSession } from '@/hooks/useReadingSession';
import { usePremiumReaderKeyboard } from '@/hooks/usePremiumReaderKeyboard';
import { useReaderAutoHide } from '@/hooks/useReaderAutoHide';
import { useReaderTheme } from '@/hooks/useReaderTheme';
import type { ReaderContent } from './readerContent';
import { BookOpen, Highlighter, Search } from '@/components/icons';
import { ReaderTooltip } from './ReaderTooltip';
import '@/styles/premium-reader.css';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { resolveReadingFontCss } from '@/lib/readingFonts';

import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
pdfjs.GlobalWorkerOptions.workerPort = new pdfWorker();

// ── Friendly page-level error (replaces react-pdf's default English string) ──
function PdfPageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center min-h-[220px]">
      <AlertCircle className="w-8 h-8" style={{ color: 'var(--color-error)' }} />
      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>This page could not be rendered.</p>
      <p className="text-xs max-w-sm opacity-70" style={{ color: 'var(--text-tertiary)' }}>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="premium-error-button">
          Retry Page
        </button>
      )}
    </div>
  );
}

interface MemoPdfPageProps {
  pageNumber: number;
  scale: number;
  renderEpoch: number;
  onLoadSuccess: (page: { width: number }) => void;
  onRetryPage: () => void;
}

/**
 * Memoized Page wrapper — pageNumber changes only re-render the affected
 * pages, not the whole scroll stack (kills the flicker on navigation).
 * Custom comparator ignores the freshly-created `error` element identity.
 */
const MemoPdfPage = memo(function MemoPdfPageInner({ pageNumber, scale, renderEpoch, onLoadSuccess, onRetryPage }: MemoPdfPageProps) {
  return (
    <Page
      key={`${pageNumber}-${renderEpoch}`}
      pageNumber={pageNumber}
      scale={scale}
      renderTextLayer={true}
      renderAnnotationLayer={true}
      className="pdf-page-surface"
      onLoadSuccess={onLoadSuccess}
      error={
        <PdfPageError
          message="This page could not be rendered. The file may be damaged or password-protected."
          onRetry={onRetryPage}
        />
      }
      onRenderError={(err) => logger.error('[PdfReader] Page render error:', err)}
    />
  );
}, (prev, next) =>
  prev.pageNumber === next.pageNumber &&
  prev.scale === next.scale &&
  prev.renderEpoch === next.renderEpoch &&
  prev.onLoadSuccess === next.onLoadSuccess &&
  prev.onRetryPage === next.onRetryPage
);

// ── Page Input Component ──
function PageInput({ pageNumber, numPages, onNavigate }: { pageNumber: number; numPages: number; onNavigate: (p: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(pageNumber));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setInputVal(String(pageNumber)); }, [pageNumber]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const p = parseInt(inputVal, 10);
    if (!Number.isNaN(p) && p >= 1 && p <= numPages && p !== pageNumber) {
      onNavigate(p);
    } else {
      setInputVal(String(pageNumber));
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs font-medium px-2 py-0.5 rounded hover:bg-white/10 transition-colors cursor-text"
        style={{ color: 'var(--text-secondary)' }}
        title="Click to jump to page"
      >
        {pageNumber} / {numPages}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      min={1}
      max={numPages}
      value={inputVal}
      onChange={(e) => setInputVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setInputVal(String(pageNumber)); } }}
      className="w-16 text-xs text-center rounded border px-1 py-0.5 outline-none"
      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
    />
  );
}

interface PdfReaderProps {
  bookPath: string;
  bookId: number;
  readerContent?: ReaderContent | null;
  onClose: () => void;
}

type SidebarNavigateHandler = (chapterIndex: number, searchTerm?: string | null) => void;

type PdfViewMode = 'page' | 'scroll';
type PdfZoomMode = 'manual' | 'fit-width' | 'fit-page';
const SCROLL_RENDER_WINDOW_RADIUS = 3;

const normalizeBookPath = (inputPath: string): string => {
  let normalized = inputPath;
  if (normalized.startsWith('file://')) {
    try {
      normalized = decodeURIComponent(new URL(normalized).pathname);
    } catch {
      // keep original path if URL parsing fails
    }
  }
  if (/^%2F/i.test(normalized) || normalized.includes('%2F')) {
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // keep original path if decoding fails
    }
  }
  return normalized;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const PDF_PROGRESS_PREFIX = 'pdf-progress-v2';

interface PdfProgressState {
  page: number;
  scale: number;
  viewMode: PdfViewMode;
  zoomMode: PdfZoomMode;
  scrollRatio?: number;
}

const parsePdfProgress = (location: string): PdfProgressState | null => {
  if (!location) return null;

  if (location.startsWith('{')) {
    try {
      const parsed = JSON.parse(location) as Partial<PdfProgressState>;
      if (typeof parsed.page !== 'number' || typeof parsed.scale !== 'number') return null;
      const rawScrollRatio = typeof parsed.scrollRatio === 'number' ? parsed.scrollRatio : undefined;
      return {
        page: parsed.page,
        scale: parsed.scale,
        viewMode: parsed.viewMode === 'scroll' ? 'scroll' : 'page',
        zoomMode: parsed.zoomMode === 'fit-width' || parsed.zoomMode === 'fit-page' ? parsed.zoomMode : 'manual',
        scrollRatio: rawScrollRatio !== undefined ? clamp(rawScrollRatio, 0, 1) : undefined,
      };
    } catch {
      return null;
    }
  }

  if (!location.startsWith(`${PDF_PROGRESS_PREFIX}|`)) return null;
  const payload = location.slice(PDF_PROGRESS_PREFIX.length + 1);
  const parts = payload.split('|');
  if (parts.length !== 4 && parts.length !== 5) return null;
  const [pageRaw, scaleRaw, viewRaw, zoomRaw, scrollRatioRaw] = parts;
  const page = parseInt(pageRaw, 10);
  const scale = parseFloat(scaleRaw);
  const viewMode: PdfViewMode = viewRaw === 'scroll' ? 'scroll' : 'page';
  const zoomMode: PdfZoomMode = zoomRaw === 'fit-width' || zoomRaw === 'fit-page' ? zoomRaw : 'manual';
  if (Number.isNaN(page) || page < 1 || Number.isNaN(scale)) return null;
  const parsedScrollRatio = scrollRatioRaw !== undefined && scrollRatioRaw !== ''
    ? parseFloat(scrollRatioRaw)
    : undefined;
  return {
    page,
    scale,
    viewMode,
    zoomMode,
    scrollRatio: parsedScrollRatio !== undefined && !Number.isNaN(parsedScrollRatio)
      ? clamp(parsedScrollRatio, 0, 1)
      : undefined,
  };
};

const encodePdfProgress = (state: PdfProgressState): string =>
  `${PDF_PROGRESS_PREFIX}|${state.page}|${state.scale.toFixed(4)}|${state.viewMode}|${state.zoomMode}|${state.viewMode === 'scroll' && typeof state.scrollRatio === 'number' ? state.scrollRatio.toFixed(6) : ''}`;

export function PdfReader({ bookPath, bookId, readerContent, onClose }: PdfReaderProps) {
  const { isFocusMode } = useReaderAutoHide();
  const setScrollProgress = useReaderUIStore(state => state.setScrollProgress);
  const pendingAnnotationId = useReaderUIStore(state => state.pendingAnnotationId);
  const setPendingAnnotationId = useReaderUIStore(state => state.setPendingAnnotationId);
  const setTopBarVisible = useReaderUIStore(state => state.setTopBarVisible);
  const toggleSidebar = useReaderUIStore(state => state.toggleSidebar);
  const { theme, width, margin, brightness, backgroundColor, textColor, fontFamily, fontSize, lineHeight } = useReadingSettings();

  const isDoodleMode = useDoodleStore(state => state.isDoodleMode);
  const toggleDoodleMode = useDoodleStore(state => state.toggleDoodleMode);
  const setActivePage = useDoodleStore(state => state.setActivePage);

  useReadingSession(bookId);

  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState<number>(1.0);
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>('fit-width');
  const [viewMode, setViewMode] = useState<PdfViewMode>('page');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [docBaseWidth, setDocBaseWidth] = useState<number>(0);
  // Bumped to force a page remount when the user hits "Retry Page"
  const [renderEpoch, setRenderEpoch] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const pageWrapperRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef<number | null>(null);
  const saveProgressTimerRef = useRef<number | null>(null);
  const pendingResumeScrollRatioRef = useRef<number | null>(null);
  // The mount effect must NOT depend on flushProgressNow's identity (it changes
  // on every page/scale/zoom change — depending on it re-ran the effect, which
  // closed + re-opened the renderer in a loop: endless 'Rendering PDF
  // Document...'). Keep the latest flush via a ref; only unmount/bookId changes
  // re-run the effect. loadedBookIdRef prevents duplicate opens on re-render.
  const flushProgressNowRef = useRef<() => void>(() => {});
  const loadedBookIdRef = useRef<number | null>(null);

  // ── Reader Theme ──
  useReaderTheme(readerContainerRef, theme);

  const widthFactor = useMemo(() => {
    switch (width) {
      case 'narrow':
        return 0.58;
      case 'medium':
        return 0.68;
      case 'wide':
        return 0.78;
      default:
        return 0.92;
    }
  }, [width]);

  const resolvedBackgroundColor = useMemo(() => {
    if (backgroundColor === 'default') return 'var(--bg-primary)';
    const preset = BG_COLOR_PRESETS.find((p) => p.id === backgroundColor);
    return preset?.color ?? backgroundColor;
  }, [backgroundColor]);

  const resolvedTextColor = useMemo(() => {
    if (textColor === 'default') return 'var(--text-primary)';
    const preset = TEXT_COLOR_PRESETS.find((p) => p.id === textColor);
    return preset?.color ?? textColor;
  }, [textColor]);

  const readerFontCss = useMemo(() => resolveReadingFontCss(fontFamily), [fontFamily]);

  // Theme-adaptive rendering for the PDF page surfaces. The canvas keeps the
  // PDF's own colors; dark/black themes invert it (standard PDF dark mode) so
  // a white-background book doesn't glare in a dark reader. Sepia/paper themes
  // get a gentle warm tint. Applied to .react-pdf__Page only — the reader
  // chrome (topbar/sidebar) is themed by useReaderTheme, unaffected here.
  const pageThemeFilter = useMemo(() => {
    switch (theme) {
      case 'dark':
        return 'invert(0.92) hue-rotate(180deg) brightness(0.92)';
      case 'black':
        return 'invert(0.88) hue-rotate(180deg) brightness(0.85)';
      case 'sepia':
        return 'sepia(0.25) brightness(0.98)';
      case 'paper':
        return 'sepia(0.12) brightness(1.02)';
      case 'paper-dark':
        return 'sepia(0.2) brightness(0.88)';
      default:
        return 'none';
    }
  }, [theme]);

  const getViewportMetrics = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return { widthPx: 900, heightPx: 1100 };
    }
    const horizontalPadding = 96 + margin * 2;
    const verticalPadding = 120;
    return {
      widthPx: Math.max(320, Math.floor(container.clientWidth * widthFactor - horizontalPadding)),
      heightPx: Math.max(420, Math.floor(container.clientHeight - verticalPadding)),
    };
  }, [margin, widthFactor]);

  const computeAutoScale = useCallback((mode: Exclude<PdfZoomMode, 'manual'>): number => {
    if (!docBaseWidth || !containerRef.current) {
      return 1.0;
    }
    const { widthPx, heightPx } = getViewportMetrics();
    if (mode === 'fit-width') {
      return clamp(widthPx / docBaseWidth, 0.5, 3);
    }
    const fitWidth = widthPx / docBaseWidth;
    const approxDocHeight = docBaseWidth * Math.sqrt(2);
    const fitHeight = heightPx / approxDocHeight;
    return clamp(Math.min(fitWidth, fitHeight), 0.5, 3);
  }, [docBaseWidth, getViewportMetrics]);

  const getInPageScrollRatio = useCallback((targetPage: number): number | undefined => {
    if (viewMode !== 'scroll') return undefined;
    const root = containerRef.current;
    if (!root) return undefined;
    const pageEl = root.querySelector<HTMLElement>(`[data-page-number="${targetPage}"]`);
    if (!pageEl) return undefined;

    const pageOffsetTop = pageEl.offsetTop;
    const pageHeight = pageEl.offsetHeight;
    if (pageHeight <= 0) return 0;

    const relativeOffset = root.scrollTop - pageOffsetTop;
    return clamp(relativeOffset / pageHeight, 0, 1);
  }, [viewMode]);

  const persistProgress = useCallback(async (nextPage: number, nextScale: number, nextViewMode: PdfViewMode, nextZoomMode: PdfZoomMode, nextScrollRatio?: number) => {
    if (numPages <= 0) return;
    const progressPercent = (nextPage / numPages) * 100;
    try {
      await api.saveReadingProgress(
        bookId,
        encodePdfProgress({
          page: nextPage,
          scale: nextScale,
          viewMode: nextViewMode,
          zoomMode: nextZoomMode,
          scrollRatio: nextViewMode === 'scroll' ? nextScrollRatio : undefined,
        }),
        progressPercent,
        nextPage,
        numPages
      );
    } catch (err) {
      logger.error('[PdfReader] Failed saving progress:', err);
    }
  }, [bookId, numPages]);

  const flushProgressNow = useCallback(() => {
    if (saveProgressTimerRef.current) {
      window.clearTimeout(saveProgressTimerRef.current);
      saveProgressTimerRef.current = null;
    }
    if (numPages <= 0) return;
    const safePage = clamp(pageNumber, 1, numPages);
    const ratio = getInPageScrollRatio(safePage);
    void persistProgress(safePage, scale, viewMode, zoomMode, ratio);
  }, [getInPageScrollRatio, numPages, pageNumber, persistProgress, scale, viewMode, zoomMode]);

  const applyPDFHighlights = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const textLayers = root.querySelectorAll('.react-pdf__Page__textContent');
    if (textLayers.length === 0) return;

    textLayers.forEach((layer) => {
      const marks = layer.querySelectorAll('mark.pdf-highlight');
      marks.forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        const textNode = document.createTextNode(mark.textContent || '');
        parent.replaceChild(textNode, mark);
        parent.normalize();
      });
    });

    const targetAnnotations = annotations.filter(
      (a) => (a.annotationType === 'highlight' || a.annotationType === 'note') && a.selectedText && a.selectedText.trim().length > 0
    );

    if (targetAnnotations.length === 0) return;

    textLayers.forEach((layer) => {
      const layerPage = Number((layer.closest('[data-page-number]') as HTMLElement | null)?.dataset.pageNumber);
      const effectivePage = Number.isNaN(layerPage) ? pageNumber : layerPage;
      const pageAnnotations = targetAnnotations.filter((a) => a.location === `page-${effectivePage}`);
      if (pageAnnotations.length === 0) return;

      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT, null);
      const textNodes: Text[] = [];
      let node: Text | null = walker.nextNode() as Text | null;
      while (node) {
        textNodes.push(node);
        node = walker.nextNode() as Text | null;
      }

      for (const annotation of pageAnnotations) {
        const searchText = annotation.selectedText;
        if (!searchText) continue;
        for (const textNode of textNodes) {
          const nodeText = textNode.textContent || '';
          const startIndex = nodeText.indexOf(searchText);
          if (startIndex === -1) continue;
          try {
            const range = document.createRange();
            range.setStart(textNode, startIndex);
            range.setEnd(textNode, startIndex + searchText.length);
            const mark = document.createElement('mark');
            mark.className = 'pdf-highlight';
            const color = annotation.color || '#fbbf24';
            mark.style.setProperty('--highlight-color', color);
            mark.style.backgroundColor = `color-mix(in srgb, ${color} 32%, transparent)`;
            mark.dataset.annotationId = String(annotation.id || '');
            mark.dataset.annotationType = annotation.annotationType;
            if (annotation.noteContent) {
              mark.dataset.hasNote = 'true';
              mark.dataset.noteContent = annotation.noteContent;
              mark.title = formatNotePreview(annotation.noteContent);
            }
            range.surroundContents(mark);
            break;
          } catch {
            break;
          }
        }
      }
    });

    if (pendingAnnotationId) {
      const target = root.querySelector<HTMLElement>(`mark.pdf-highlight[data-annotation-id="${pendingAnnotationId}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setPendingAnnotationId(null);
    }
  }, [annotations, pageNumber, pendingAnnotationId, setPendingAnnotationId]);

  const scrollRenderWindow = useMemo(() => {
    if (numPages <= 0) {
      return { start: 1, end: 0 };
    }
    return {
      start: clamp(pageNumber - SCROLL_RENDER_WINDOW_RADIUS, 1, numPages),
      end: clamp(pageNumber + SCROLL_RENDER_WINDOW_RADIUS, 1, numPages),
    };
  }, [numPages, pageNumber]);

  const placeholderHeight = useMemo(() => {
    const baseWidth = docBaseWidth > 0 ? docBaseWidth : 900;
    const renderedWidth = Math.max(240, baseWidth * scale);
    return Math.max(320, Math.round(renderedWidth * Math.sqrt(2)));
  }, [docBaseWidth, scale]);

  const loadBook = useCallback(async () => {
    // Never re-open a book this mount already loaded (success or failure) —
    // prevents the close/reopen churn that looped the loading overlay.
    if (loadedBookIdRef.current === bookId) return;
    loadedBookIdRef.current = bookId;
    try {
      setIsLoading(true);
      setError(null);

      const bookMetadata = await api.openBookRenderer(bookId, bookPath, 'pdf');
      setMetadata(bookMetadata);

      const normalizedPath = normalizeBookPath(bookPath);
      setPdfUrl(convertFileSrc(normalizedPath));

      try {
        const [bookAnnotations, savedProgress] = await Promise.all([
          api.getAnnotations(bookId),
          api.getReadingProgress(bookId),
        ]);
        setAnnotations(bookAnnotations);

        const parsed = savedProgress?.currentLocation ? parsePdfProgress(savedProgress.currentLocation) : null;
        if (parsed) {
          setPageNumber(parsed.page);
          setScale(clamp(parsed.scale, 0.5, 3));
          setViewMode(parsed.viewMode);
          setZoomMode(parsed.zoomMode);
          pendingResumeScrollRatioRef.current = parsed.viewMode === 'scroll' && typeof parsed.scrollRatio === 'number'
            ? clamp(parsed.scrollRatio, 0, 1)
            : null;
          if (parsed.page > 1) {
            useToastStore.getState().addToast({
              title: 'Resuming reading',
              description: `Page ${parsed.page}`,
              variant: 'info',
              duration: 3000,
            });
          }
        } else if (savedProgress?.currentLocation) {
          const match = savedProgress.currentLocation.match(/page-(\d+)/);
          if (match) {
            const savedPage = parseInt(match[1], 10);
            if (!Number.isNaN(savedPage) && savedPage >= 1) {
              setPageNumber(savedPage);
            }
          }
          pendingResumeScrollRatioRef.current = null;
        }
      } catch (innerError) {
        logger.warn('[PdfReader] Best-effort restore failed:', innerError);
      }
    } catch (err) {
      logger.error('[PdfReader] Error initializing PDF:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize PDF');
      setIsLoading(false);
    }
  }, [bookId, bookPath]);

  useEffect(() => {
    // Keep the latest flushProgressNow reachable from the mount effect's
    // cleanup without listing it in the deps (its identity changes on every
    // page/scale/zoom change; depending on it re-ran the mount effect and
    // looped the reader).
    flushProgressNowRef.current = flushProgressNow;
  }, [flushProgressNow]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      void loadBook();
    }, 0);
    return () => {
      window.clearTimeout(task);
      flushProgressNowRef.current();
      api.closeBookRenderer(bookId).catch(logger.error);
      loadedBookIdRef.current = null;
    };
  }, [bookId, loadBook]);

  useEffect(() => {
    const onResize = () => {
      if (zoomMode === 'fit-width' || zoomMode === 'fit-page') {
        setScale(computeAutoScale(zoomMode));
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [computeAutoScale, zoomMode]);


  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    setPageNumber((prev) => clamp(prev, 1, numPages));
  };

  const onDocumentLoadError = (documentError: Error) => {
    logger.error('[PdfReader] Error loading PDF document:', documentError);
    setError(documentError.message || 'Failed to parse PDF document.');
    setIsLoading(false);
  };

  /**
   * Anchor the fit-scale to the FIRST loaded page only. Computing per page
   * load re-renders every page (mixed-size scans oscillate the scale) — the
   * original source of the flicker. Container resizes are handled by the
   * ResizeObserver below, and zoom-mode switches by the mode setters.
   */
  const onPageLoadSuccess = useCallback((page: { width: number }) => {
    if (docBaseWidth) return;
    setDocBaseWidth(page.width);
    if (zoomMode === 'fit-width' || zoomMode === 'fit-page') {
      const metrics = getViewportMetrics();
      const nextScale = zoomMode === 'fit-width'
        ? clamp(metrics.widthPx / page.width, 0.5, 3)
        : clamp(Math.min(metrics.widthPx / page.width, metrics.heightPx / (page.width * Math.sqrt(2))), 0.5, 3);
      // Only update if meaningfully different to prevent re-render loops
      setScale((prev) => Math.abs(prev - nextScale) > 0.001 ? nextScale : prev);
    }
  }, [docBaseWidth, getViewportMetrics, zoomMode]);

  const handleRetryPage = useCallback(() => setRenderEpoch((e) => e + 1), []);

  // Refit when the reading container resizes (window resize, sidebar toggle, …)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || (zoomMode !== 'fit-width' && zoomMode !== 'fit-page')) return;
    const observer = new ResizeObserver(() => {
      if (zoomMode === 'fit-width' || zoomMode === 'fit-page') {
        setScale(computeAutoScale(zoomMode));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [zoomMode, computeAutoScale]);

  useEffect(() => {
    if (numPages <= 0) return;
    setActivePage(`pdf-${bookId}-${pageNumber}`);

    // Update global progress
    setScrollProgress(Math.min(100, (pageNumber / numPages) * 100));

    // Debounce progress persistence to reduce DB writes
    if (saveProgressTimerRef.current) clearTimeout(saveProgressTimerRef.current);
    saveProgressTimerRef.current = window.setTimeout(() => {
      const safePage = clamp(pageNumber, 1, numPages);
      const ratio = getInPageScrollRatio(safePage);
      persistProgress(safePage, scale, viewMode, zoomMode, ratio);
    }, 1500);

    return () => {
      if (saveProgressTimerRef.current) clearTimeout(saveProgressTimerRef.current);
    };
  }, [getInPageScrollRatio, numPages, pageNumber, persistProgress, setActivePage, scale, setScrollProgress, viewMode, zoomMode, bookId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      applyPDFHighlights();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [applyPDFHighlights]);

  const scrollToPage = useCallback((targetPage: number) => {
    const root = containerRef.current;
    if (!root) return;

    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) {
      window.clearTimeout(programmaticScrollTimerRef.current);
    }
    const pageEl = root.querySelector<HTMLElement>(`[data-page-number="${targetPage}"]`);
    pageEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    programmaticScrollTimerRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
      programmaticScrollTimerRef.current = null;
    }, 320);
  }, []);

  const nextPage = useCallback(() => {
    if (pageNumber < numPages) {
      const target = pageNumber + 1;
      setPageNumber(target);
      if (viewMode === 'scroll') {
        scrollToPage(target);
      } else {
        pageWrapperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [numPages, pageNumber, scrollToPage, viewMode]);

  const prevPage = useCallback(() => {
    if (pageNumber > 1) {
      const target = pageNumber - 1;
      setPageNumber(target);
      if (viewMode === 'scroll') {
        scrollToPage(target);
      } else {
        pageWrapperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [pageNumber, scrollToPage, viewMode]);

  usePremiumReaderKeyboard({
    onPrevChapter: prevPage,
    onNextChapter: nextPage,
    onPrevPage: prevPage,
    onNextPage: nextPage,
  });

  const zoomIn = () => {
    setZoomMode('manual');
    setScale((prev) => clamp(prev + 0.15, 0.5, 3));
  };

  const zoomOut = () => {
    setZoomMode('manual');
    setScale((prev) => clamp(prev - 0.15, 0.5, 3));
  };

  const setFitWidth = () => {
    setZoomMode('fit-width');
    setScale(computeAutoScale('fit-width'));
  };

  const setFitPage = () => {
    setZoomMode('fit-page');
    setScale(computeAutoScale('fit-page'));
  };

  const toggleViewMode = () => {
    setViewMode((prev) => {
      const nextMode: PdfViewMode = prev === 'page' ? 'scroll' : 'page';
      window.setTimeout(() => {
        if (nextMode === 'scroll') {
          scrollToPage(pageNumber);
        } else {
          pageWrapperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 0);
      return nextMode;
    });
  };

  const handleSidebarNavigate = useCallback<SidebarNavigateHandler>((chapterIndex) => {
    const page = chapterIndex;
    if (page >= 1 && page <= numPages) {
      setPageNumber(page);
      if (viewMode === 'scroll') {
        scrollToPage(page);
      } else {
        pageWrapperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [numPages, scrollToPage, viewMode]);

  const handleScrollSync = useCallback(() => {
    if (viewMode !== 'scroll') return;
    if (isProgrammaticScrollRef.current) return;
    const root = containerRef.current;
    if (!root) return;
    const pageEls = Array.from(root.querySelectorAll<HTMLElement>('[data-page-number]'));
    if (pageEls.length === 0) return;
    const viewportTop = root.getBoundingClientRect().top + 140;
    let closestPage = pageNumber;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const el of pageEls) {
      const rect = el.getBoundingClientRect();
      const distance = Math.abs(rect.top - viewportTop);
      if (distance < closestDistance) {
        closestDistance = distance;
        const raw = Number(el.dataset.pageNumber);
        if (!Number.isNaN(raw)) closestPage = raw;
      }
    }
    if (closestPage !== pageNumber) {
      setPageNumber(closestPage);
    }
  }, [pageNumber, viewMode]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || viewMode !== 'scroll') return;
    let timeoutId: number | null = null;
    const onScroll = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(handleScrollSync, 60);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [handleScrollSync, viewMode]);

  useEffect(() => {
    if (viewMode !== 'scroll') return;
    if (pendingResumeScrollRatioRef.current === null) return;
    const root = containerRef.current;
    if (!root) return;

    const targetRatio = pendingResumeScrollRatioRef.current;
    const timer = window.setTimeout(() => {
      const pageEl = root.querySelector<HTMLElement>(`[data-page-number="${pageNumber}"]`);
      if (!pageEl) return;
      const nextScrollTop = pageEl.offsetTop + (targetRatio * pageEl.offsetHeight);
      const maxScrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
      root.scrollTo({ top: clamp(nextScrollTop, 0, maxScrollTop), behavior: 'auto' });
      pendingResumeScrollRatioRef.current = null;
    }, 120);

    return () => window.clearTimeout(timer);
  }, [pageNumber, viewMode]);

  useEffect(() => () => {
    if (programmaticScrollTimerRef.current) {
      window.clearTimeout(programmaticScrollTimerRef.current);
    }
    flushProgressNow();
  }, [flushProgressNow]);

  const handleClose = useCallback(() => {
    flushProgressNow();
    onClose();
  }, [flushProgressNow, onClose]);

  if (error) {
    return (
      <div className="premium-reader premium-reader--error">
        <div className="premium-error-container">
          <AlertCircle className="premium-error-icon" />
          <p className="premium-error-title">{error}</p>
          <p className="premium-error-subtitle">Try opening a different book or check the file format.</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              void loadBook();
            }}
            className="premium-error-button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const handleContainerDoubleClick = (e: React.MouseEvent) => {
    // Ignore if clicking an interactive element
    const target = e.target as Element;
    if (e.defaultPrevented || !target || typeof target.closest !== 'function') return;
    if (target.closest('a') || target.closest('button') || target.closest('.premium-top-bar') || target.closest('.premium-sidebar') || target.closest('.pdf-doodle-layer')) return;
    
    setTopBarVisible(!useReaderUIStore.getState().isTopBarVisible);
  };

  return (
    <div ref={readerContainerRef} className={`premium-reader ${isFocusMode ? 'premium-reader--focus-mode' : ''}`} onDoubleClick={handleContainerDoubleClick}>
      {/* Typography settings (font family/size/line height) applied to react-pdf's
          selectable text layer — the canvas render itself is untouched. */}
      <style>{`
        .pdf-reading-canvas .react-pdf__Page__textContent {
          font-family: ${readerFontCss} !important;
          line-height: ${lineHeight} !important;
        }
        .pdf-reading-canvas .react-pdf__Page__textContent span {
          font-family: ${readerFontCss} !important;
          font-size: ${fontSize}px !important;
          line-height: ${lineHeight} !important;
        }
        /* Theme + user-brightness adaptation for the page surfaces only.
           Inverted in dark/black themes so white PDFs read like EPUB dark
           mode; the reader chrome is never filtered. */
        .pdf-reading-canvas .react-pdf__Page {
          filter: ${pageThemeFilter} brightness(${brightness});
        }
      `}</style>
      <ReaderTopBar
        bookId={bookId}
        title={metadata?.title || readerContent?.title || 'Loading...'}
        subtitle={numPages > 0 ? `Page ${pageNumber} of ${numPages}` : 'Loading...'}
        progress={Math.round((pageNumber / numPages) * 100 || 0)}
        format="pdf"
        onClose={handleClose}
        rightExtra={
          <>
            <ReaderTooltip content="Search in book">
              <button
                type="button"
                onClick={() => toggleSidebar('search')}
                className="premium-control-button"
                aria-label="Search in book"
              >
                <Search className="premium-control-icon" />
              </button>
            </ReaderTooltip>

            <ReaderTooltip content="Table of Contents">
              <button
                type="button"
                onClick={() => toggleSidebar('toc')}
                className="premium-control-button"
                aria-label="Table of Contents"
              >
                <BookOpen className="premium-control-icon" />
              </button>
            </ReaderTooltip>

            <button
              type="button"
              onClick={() => toggleSidebar('highlights')}
              className="premium-control-button"
              aria-label="Highlights & Notes"
            >
              <Highlighter className="premium-control-icon" />
            </button>

            <button
              type="button"
              onClick={toggleDoodleMode}
              className={`premium-control-button ${isDoodleMode ? 'premium-control-button--active' : ''}`}
              aria-label="Toggle drawing mode"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>

            <span className="premium-top-bar-separator" />
            <PageInput pageNumber={pageNumber} numPages={numPages} onNavigate={(p) => {
              setPageNumber(p);
              if (viewMode === 'scroll') scrollToPage(p);
            }} />

            <ReaderTooltip content="Zoom out">
              <button type="button" onClick={zoomOut} className="premium-control-button" aria-label="Zoom out">
                <ZoomOut className="premium-control-icon" />
              </button>
            </ReaderTooltip>

            <span className="text-xs font-medium min-w-[38px] text-center" style={{ color: 'var(--text-secondary)' }}>
              {Math.round(scale * 100)}%
            </span>

            <ReaderTooltip content="Zoom in">
              <button type="button" onClick={zoomIn} className="premium-control-button" aria-label="Zoom in">
                <ZoomIn className="premium-control-icon" />
              </button>
            </ReaderTooltip>

            <ReaderTooltip content="Fit width">
              <button
                type="button"
                onClick={setFitWidth}
                className={`premium-control-button ${zoomMode === 'fit-width' ? 'premium-control-button--active' : ''}`}
                aria-label="Fit width"
              >
                <Maximize className="premium-control-icon" />
              </button>
            </ReaderTooltip>

            <ReaderTooltip content="Fit page">
              <button
                type="button"
                onClick={setFitPage}
                className={`premium-control-button ${zoomMode === 'fit-page' ? 'premium-control-button--active' : ''}`}
                aria-label="Fit page"
              >
                <Minimize className="premium-control-icon" />
              </button>
            </ReaderTooltip>

            <ReaderTooltip content={viewMode === 'scroll' ? 'Switch to page view' : 'Switch to scroll view'}>
              <button
                type="button"
                onClick={toggleViewMode}
                className={`premium-control-button ${viewMode === 'scroll' ? 'premium-control-button--active' : ''}`}
                aria-label={viewMode === 'scroll' ? 'Switch to page view' : 'Switch to scroll view'}
              >
                <FileText className="premium-control-icon" />
              </button>
            </ReaderTooltip>
          </>
        }
      />

      <div
        ref={containerRef}
        onClick={(e) => {
          // PDF link annotations render as real <a> elements in react-pdf's
          // text layer — route external ones to the system browser.
          handleExternalLinkClick(e.nativeEvent, containerRef.current);
        }}
        className={`premium-reading-canvas ${isFocusMode ? 'premium-reading-canvas--focus-mode' : ''} pdf-reading-canvas pdf-reading-canvas--${viewMode}`}
        style={{
          backgroundColor: resolvedBackgroundColor,
          color: resolvedTextColor,
          paddingLeft: `${margin + 24}px`,
          paddingRight: `${margin + 24}px`,
          scrollBehavior: 'smooth',
        }}
      >
        {/* Loading overlay — fades out via CSS transition (no abrupt unmount,
            no flicker). Kept mounted but inert while the document is ready. */}
        <div
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center transition-opacity duration-300 ${isLoading ? 'opacity-100 backdrop-blur-sm' : 'opacity-0 pointer-events-none'}`}
          style={{ backgroundColor: isLoading ? 'var(--overlay-bg)' : 'transparent' }}
        >
          <Loader2 className={`w-12 h-12 mb-4 ${isLoading ? 'animate-spin' : ''}`} style={{ color: 'var(--loading-spinner)' }} />
          <p className={`font-medium transition-opacity duration-300 ${isLoading ? 'opacity-100' : 'opacity-0'}`} style={{ color: 'var(--text-secondary)' }}>Rendering PDF Document...</p>
        </div>

        {pdfUrl && (
          <div className="pdf-document-shell" ref={pageWrapperRef}>
            {/* key={pdfUrl} forces a clean Document remount per file — no stale
                pdf.js state when switching books. error={null} suppresses
                react-pdf's default English error; our Shiori-styled UI handles it. */}
            <Document
              key={pdfUrl}
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={null}
              error={null}
            >
              {viewMode === 'page' ? (
                <div className="pdf-page-frame" data-page-number={pageNumber}>
                  <MemoPdfPage
                    pageNumber={pageNumber}
                    scale={scale}
                    renderEpoch={renderEpoch}
                    onLoadSuccess={onPageLoadSuccess}
                    onRetryPage={handleRetryPage}
                  />
                </div>
              ) : (
                <div className="pdf-scroll-stack">
                  {Array.from({ length: numPages }, (_, index) => {
                    const page = index + 1;
                    const shouldRenderPage = page >= scrollRenderWindow.start && page <= scrollRenderWindow.end;
                    return (
                      <div key={page} className="pdf-page-frame" data-page-number={page}>
                        {shouldRenderPage ? (
                          <MemoPdfPage
                            pageNumber={page}
                            scale={scale}
                            renderEpoch={renderEpoch}
                            onLoadSuccess={onPageLoadSuccess}
                            onRetryPage={handleRetryPage}
                          />
                        ) : (
                          <div
                            className="pdf-page-placeholder"
                            style={{ height: `${placeholderHeight}px`, width: '100%' }}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Document>
          </div>
        )}
      </div>

      <div className="premium-progress-bar">
        <div className="premium-progress-bar-fill" style={{ width: `${(pageNumber / numPages) * 100 || 0}%` }} />
      </div>

      {!isFocusMode && viewMode === 'page' && (
        <>
          <button
            type="button"
            onClick={prevPage}
            disabled={pageNumber <= 1}
            className="premium-nav-arrow premium-nav-arrow--left"
            aria-label="Previous page"
          >
            <ChevronLeft className="premium-nav-icon" />
          </button>

          <button
            type="button"
            onClick={nextPage}
            disabled={pageNumber >= numPages}
            className="premium-nav-arrow premium-nav-arrow--right"
            aria-label="Next page"
          >
            <ChevronRight className="premium-nav-icon" />
          </button>
        </>
      )}

      <PremiumSidebar
        bookId={bookId}
        currentIndex={pageNumber}
        onNavigate={handleSidebarNavigate}
      />

      <TextSelectionToolbar
        bookId={bookId}
        currentLocation={`page-${pageNumber}`}
      />

      <ReaderAnnotationTooltip />

      {isDoodleMode && (
        <DoodleCanvas
          bookId={bookId}
          pageId={`page-${pageNumber}`}
          containerRef={containerRef}
        />
      )}

      {isDoodleMode && <DoodleToolbar />}
    </div>
  );
}
