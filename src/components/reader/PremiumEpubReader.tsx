import { logger } from '@/lib/logger';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { api, isAndroid } from '@/lib/tauri';
import type { BookMetadata, Chapter, TocEntry } from '@/lib/tauri';
import { findCurrentTocEntry } from '@/lib/toc';
import { useReaderUIStore, useReadingSettings, applyReaderThemeToElement, removeReaderThemeFromElement, applyAllSettingsToDOM } from '@/store/premiumReaderStore';
import { useReaderStore } from '@/store/readerStore';
import { useDoodleStore } from '@/store/doodleStore';
import { usePremiumReaderKeyboard } from '@/hooks/usePremiumReaderKeyboard';
import { useReadingSession } from '@/hooks/useReadingSession';
import { PremiumSidebar } from './PremiumSidebar';
import { DoodleCanvas } from './DoodleCanvas';
import { DoodleToolbar } from './DoodleToolbar';
import { PageFlipEngine, type PageFlipHandle } from './PageFlipEngine';
import { TextSelectionToolbar } from './TextSelectionToolbar';
import { ReaderAnnotationTooltip } from './ReaderAnnotationTooltip';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Search, BookOpen, Highlighter } from '@/components/icons';
import { ReaderTooltip } from './ReaderTooltip';
import { sanitizeBookContent, escapeHtml } from '@/lib/sanitize';
import { applyHighlightsToDOM, scrollToAnnotationMark } from '@/lib/highlightAnnotations';
import { handleExternalLinkClick } from '@/lib/externalLinks';
import { useToastStore } from '@/store/toastStore';
import { ReaderTopBar } from './ReaderTopBar';
import { ReadingProgressIndicator } from './ReadingProgressIndicator';
import { ContinuousEpubView } from './ContinuousEpubView';
import { BookSkeletonLoading } from './BookSkeletonLoading';
import type { ReaderContent } from './readerContent';
import '@/styles/premium-reader.css';
import '@/styles/themes/paper-theme.css';
import '@/styles/page-flip.css';
import { TTSControlBar } from './TTSControlBar';

interface PremiumEpubReaderProps {
  bookPath: string;
  bookId: number;
  readerContent?: ReaderContent | null;
  onClose: () => void;
}

export function ChapterHtml({ content }: { content: string }) {
  const html = useMemo(() => sanitizeBookContent(content), [content]);
  return <div className="premium-chapter-content" dangerouslySetInnerHTML={{ __html: html }} />;
}

// Helper function to convert resource URLs to data URIs and inline CSS
/** Convert a byte array to base64 without hitting call-stack limits on large files. */
function bytesToBase64(data: number[] | Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data
    : data instanceof ArrayBuffer ? new Uint8Array(data)
    : new Uint8Array(data);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(binary);
}

export async function processEpubHtml(bookId: number, html: string): Promise<string> {
  let processedHtml = html;

  // Step 1: Process CSS stylesheets - Convert <link> tags to <style> tags
  const cssLinkRegex = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
  const cssMatches = Array.from(html.matchAll(cssLinkRegex));

  for (const match of cssMatches) {
    const linkTag = match[0];
    const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i);

    if (!hrefMatch) continue;

    const cssPath = hrefMatch[1];

    // Skip absolute URLs
    if (cssPath.startsWith('http') || cssPath.startsWith('data:')) {
      continue;
    }

    try {
      let cleanPath = cssPath;
      while (cleanPath.startsWith('../') || cleanPath.startsWith('./')) {
        cleanPath = cleanPath.replace(/^\.\.\//, '').replace(/^\.\//, '');
      }

      const cssData = await api.getEpubResource(bookId, cleanPath);
      const cssText = new TextDecoder().decode(new Uint8Array(cssData));
      const styleTag = `<style type="text/css">\n${cssText}\n</style>`;
      processedHtml = processedHtml.replace(linkTag, styleTag);
    } catch {
      processedHtml = processedHtml.replace(linkTag, '');
    }
  }

  // Step 2: Process images and other resources
  const srcRegex = /(src|href)="([^"']+)"/g;
  const matches = Array.from(processedHtml.matchAll(srcRegex));

  for (const match of matches) {
    const attr = match[1];
    const originalPath = match[2];

    // Skip absolute URLs, data URIs, anchors, and CSS files (already processed)
    if (originalPath.startsWith('http') ||
      originalPath.startsWith('data:') ||
      originalPath.startsWith('#') ||
      originalPath.endsWith('.css')) {
      continue;
    }

    // Skip HTML files (these are internal anchor links, not embedded resources)
    const originalPathLower = originalPath.toLowerCase();
    if (originalPathLower.includes('.xhtml') || originalPathLower.includes('.html') || originalPathLower.includes('.htm') || originalPathLower.includes('.xml')) {
      continue;
    }

    try {
      let cleanPath = originalPath.split('#')[0]; // Strip hash if any
      while (cleanPath.startsWith('../') || cleanPath.startsWith('./')) {
        cleanPath = cleanPath.replace(/^\.\.\//, '').replace(/^\.\//, '');
      }

      const resourceData = await api.getEpubResource(bookId, cleanPath);

      // Determine MIME type
      let mimeType = 'application/octet-stream';
      const ext = cleanPath.toLowerCase();
      if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (ext.endsWith('.png')) mimeType = 'image/png';
      else if (ext.endsWith('.gif')) mimeType = 'image/gif';
      else if (ext.endsWith('.svg')) mimeType = 'image/svg+xml';
      else if (ext.endsWith('.webp')) mimeType = 'image/webp';
      else if (ext.endsWith('.bmp')) mimeType = 'image/bmp';
      else if (ext.endsWith('.woff')) mimeType = 'font/woff';
      else if (ext.endsWith('.woff2')) mimeType = 'font/woff2';
      else if (ext.endsWith('.ttf')) mimeType = 'font/ttf';
      else if (ext.endsWith('.otf')) mimeType = 'font/otf';

      // Convert to base64 (chunked to avoid call-stack overflow on large files)
      const base64 = bytesToBase64(resourceData);
      const dataUri = `data:${mimeType};base64,${base64}`;

      processedHtml = processedHtml.replace(`${attr}="${originalPath}"`, `${attr}="${dataUri}"`);
    } catch {
      // Skip failed resources silently
    }
  }

  return processedHtml;
}

/**
 * Apply search-term highlighting to already-processed chapter HTML.
 * Cheaper than re-inlining every resource per new search term: the two-layer
 * cache (base chapter, then highlighted variant) keeps resource work done
 * exactly once per chapter.
 */
export function applySearchHighlight(html: string, searchTerm?: string | null): string {
  if (!searchTerm?.trim()) return html;
  return highlightSearchTerm(html, searchTerm);
}

// Helper function to highlight search terms in HTML (case-insensitive, preserves HTML tags)
function highlightSearchTerm(html: string, searchTerm: string): string {
  if (!searchTerm || !searchTerm.trim()) return html;

  // Create a temporary DOM element to parse HTML safely
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Escape special regex characters in search term
  const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedTerm})`, 'gi');

  // Recursive function to highlight text nodes only
  const highlightTextNodes = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (regex.test(text)) {
        const highlightedHTML = text.replace(regex, (match) => `<mark class="search-highlight">${escapeHtml(match)}</mark>`);
        const span = document.createElement('span');
        span.innerHTML = highlightedHTML;
        node.parentNode?.replaceChild(span, node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Don't highlight inside <script>, <style>, or <mark> tags
      const tagName = (node as Element).tagName?.toLowerCase();
      if (tagName !== 'script' && tagName !== 'style' && tagName !== 'mark') {
        Array.from(node.childNodes).forEach(highlightTextNodes);
      }
    }
  };

  highlightTextNodes(doc.body);

  // Add styles for highlighted text
  const style = doc.createElement('style');
  style.textContent = `
    .search-highlight {
      background-color: color-mix(in srgb, #fbbf24 38%, transparent) !important;
      color: inherit !important;
      border-radius: 6px !important;
      padding: 1px 4px !important;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, #fbbf24 60%, transparent), 0 1px 4px color-mix(in srgb, #fbbf24 20%, transparent) !important;
      font-weight: 500;
      display: inline;
      transition: all 0.3s ease;
    }
    [data-reader-theme="dark"] .search-highlight,
    [data-reader-theme="black"] .search-highlight,
    [data-reader-theme="paper-dark"] .search-highlight {
      background-color: color-mix(in srgb, #f59e0b 35%, transparent) !important;
      color: inherit !important;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, #f59e0b 60%, transparent), 0 0 10px color-mix(in srgb, #f59e0b 30%, transparent) !important;
    }
  `;
  doc.head.appendChild(style);

  return doc.documentElement.outerHTML;
}

// ─── Processed-chapter LRU cache ─────────────────────────────────────────────
// Back-navigation used to re-fetch + re-process + re-base64 every chapter
// resource on every visit. Cache the fully processed Chapter (HTML with data
// URIs inlined) keyed by book+index+highlight-term so revisiting a chapter is
// a Map hit instead of N IPC round-trips. Module-level: survives reader
// unmount/remount within the session. Mirrors ContinuousEpubView's eviction
// approach (drop oldest beyond a small bound).
const MAX_PROCESSED_CHAPTERS = isAndroid ? 3 : 5;
const MAX_PROCESSED_CHAPTER_BYTES = (isAndroid ? 16 : 64) * 1024 * 1024;
const processedChapterCache = new Map<string, Chapter>();
let processedChapterCacheBytes = 0;

function estimateProcessedChapterBytes(chapter: Chapter): number {
  // JS strings are UTF-16; data-URI HTML also keeps browser-side decoded
  // resources, so this is deliberately conservative rather than exact.
  return chapter.content.length * 2;
}

function getCachedChapter(bookId: number, index: number, term: string | null | undefined): Chapter | undefined {
  const key = `${bookId}:${index}:${term ?? ''}`;
  const hit = processedChapterCache.get(key);
  if (hit !== undefined) {
    // Refresh recency
    processedChapterCache.delete(key);
    processedChapterCache.set(key, hit);
  }
  return hit;
}

export async function waitForStableReaderLayout(element: HTMLElement | null): Promise<void> {
  if (!element) return;

  // Font readiness can be unavailable in older Android WebViews. Bound the
  // wait so navigation never hangs on a broken font provider.
  if (document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => window.setTimeout(resolve, 500)),
    ]);
  }

  let previous = '';
  let stableFrames = 0;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const metrics = [
      element.scrollHeight,
      element.scrollWidth,
      element.clientHeight,
      element.clientWidth,
    ].join(':');
    if (metrics === previous) stableFrames += 1;
    else stableFrames = 0;
    previous = metrics;
    if (stableFrames >= 2) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
  }
}


function setCachedChapter(bookId: number, index: number, term: string | null | undefined, chapter: Chapter): void {
  const key = `${bookId}:${index}:${term ?? ''}`;
  const size = estimateProcessedChapterBytes(chapter);
  const previous = processedChapterCache.get(key);
  if (previous) {
    processedChapterCacheBytes -= estimateProcessedChapterBytes(previous);
    processedChapterCache.delete(key);
  }
  if (size > MAX_PROCESSED_CHAPTER_BYTES) return;

  while (
    processedChapterCache.size > 0 &&
    (processedChapterCache.size >= MAX_PROCESSED_CHAPTERS ||
      processedChapterCacheBytes + size > MAX_PROCESSED_CHAPTER_BYTES)
  ) {
    const oldest = processedChapterCache.keys().next().value;
    if (oldest === undefined) break;
    const oldChapter = processedChapterCache.get(oldest);
    if (oldChapter) processedChapterCacheBytes -= estimateProcessedChapterBytes(oldChapter);
    processedChapterCache.delete(oldest);
  }

  processedChapterCache.set(key, chapter);
  processedChapterCacheBytes += size;
}

export function clearProcessedChapterCache(bookId?: number): void {
  const prefix = bookId === undefined ? undefined : `${bookId}:`;
  for (const [key, chapter] of processedChapterCache) {
    if (prefix === undefined || key.startsWith(prefix)) {
      processedChapterCacheBytes -= estimateProcessedChapterBytes(chapter);
      processedChapterCache.delete(key);
    }
  }
  if (processedChapterCache.size === 0) processedChapterCacheBytes = 0;
}

/** Fetch a chapter and process its HTML, reusing the module-level cache. */
async function loadProcessedChapter(bookId: number, index: number, term?: string | null): Promise<Chapter> {
  // Two-layer cache: the expensive resource-inlined base chapter is keyed
  // without the search term, so changing the search term reuses it and only
  // re-runs the cheap search-highlight pass. Term variants stay bounded by
  // the same byte/count eviction.
  const safeTerm = term?.trim() ? term : '';
  const termVariant = safeTerm ? getCachedChapter(bookId, index, safeTerm) : undefined;
  if (termVariant !== undefined) return termVariant;

  const base = getCachedChapter(bookId, index, '');
  if (base !== undefined) {
    if (!safeTerm) return base;
    const highlighted: Chapter = { ...base, content: applySearchHighlight(base.content, safeTerm) };
    setCachedChapter(bookId, index, safeTerm, highlighted);
    return highlighted;
  }

  const chapter = await api.getBookChapter(bookId, index);
  const processed = await processEpubHtml(bookId, chapter.content);
  const processedChapter: Chapter = { ...chapter, content: processed };
  // Never cache empty chapters — the caller throws on them, so a cached empty
  // string would only poison the LRU slot.
  if (chapter.content && chapter.content.trim().length > 0) {
    setCachedChapter(bookId, index, '', processedChapter);
    if (safeTerm) {
      const highlighted: Chapter = { ...processedChapter, content: applySearchHighlight(processed, safeTerm) };
      setCachedChapter(bookId, index, safeTerm, highlighted);
      return highlighted;
    }
  }
  return processedChapter;
}

export function PremiumEpubReader({ bookPath, bookId, readerContent, onClose }: PremiumEpubReaderProps) {
  // State management
  const isFocusMode = useReaderUIStore(state => state.isFocusMode);
  const isTopBarShortcutOnly = useReaderUIStore(state => state.isTopBarShortcutOnly);
  const setTopBarVisible = useReaderUIStore(state => state.setTopBarVisible);
  const toggleSidebar = useReaderUIStore(state => state.toggleSidebar);
  const setScrollProgress = useReaderUIStore(state => state.setScrollProgress);
  // Read the startFromBeginning flag from the global reader store.
  // This survives ReaderLayout's openBook call that would otherwise overwrite readerContent.
  const startFromBeginning = useReaderStore(state => state.startFromBeginning);
  const setStartFromBeginning = useReaderStore(state => state.setStartFromBeginning);
  const explicitResumeTarget = useReaderStore(state => state.explicitResumeTarget);
  const setExplicitResumeTarget = useReaderStore(state => state.setExplicitResumeTarget);

  const readingSettings = useReadingSettings();
  const { theme, width, twoPageView, isPaginated, continuousFlow, toggleTwoPageView, pageFlipEnabled, pageFlipSpeed, animationStyle } = readingSettings;

  // Apply all reading settings (typography, margins, etc.) on mount and when they change
  useEffect(() => {
    applyAllSettingsToDOM(readingSettings);
  }, [readingSettings]);
  const isDoodleMode = useDoodleStore(state => state.isDoodleMode);
  const toggleDoodleMode = useDoodleStore(state => state.toggleDoodleMode);
  const setActivePage = useDoodleStore(state => state.setActivePage);

  useReadingSession(bookId);

  // Book state
  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchHighlight, setSearchHighlight] = useState<string | null>(null); // NEW: Store search term for highlighting

  // Refs
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const pageFlipRef = useRef<PageFlipHandle>(null);
  const scrollPositionsRef = useRef<Map<number, number>>(new Map());
  /** Keep the per-chapter scroll map bounded on long books. */
  const rememberScrollPosition = (index: number, ratio: number): void => {
    const map = scrollPositionsRef.current;
    if (map.has(index)) map.delete(index);
    map.set(index, ratio);
    while (map.size > 100) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  };
  const currentIndexRef = useRef(0);
  const metadataRef = useRef<BookMetadata | null>(null);
  const loadChapterRef = useRef<(index: number, highlightTerm?: string | null, initialScrollRatio?: number) => Promise<void>>(async () => { });
  const chapterRequestRef = useRef(0);
  const chapterLoadInFlightRef = useRef(false);
  const previousTwoPageViewRef = useRef(twoPageView);
  const previousDoodleChapterRef = useRef<number | null>(null);

  // Preloaded chapter content for page flip
  const [nextChapterContent, setNextChapterContent] = useState<string | null>(null);
  const [prevChapterContent, setPrevChapterContent] = useState<string | null>(null);

  // ────────────────────────────────────────────────────────────
  // READER THEME — scoped to this container, not global <html>
  // ────────────────────────────────────────────────────────────
  const loadChapter = useCallback(async (index: number, highlightTerm?: string | null, initialScrollRatio?: number) => {
    if (chapterLoadInFlightRef.current) return;
    const requestToken = ++chapterRequestRef.current;
    chapterLoadInFlightRef.current = true;

    try {
      setIsLoading(true);

      // Save current scroll position before navigating away
      if (canvasRef.current && currentChapter) {
        const isHoriz = canvasRef.current.classList.contains('premium-reading-canvas--paginated') ||
                        canvasRef.current.classList.contains('premium-reading-canvas--two-page') ||
                        !continuousFlow;
        if (isHoriz) {
          const { scrollLeft, scrollWidth, clientWidth } = canvasRef.current;
          const scrollRatio = scrollWidth > clientWidth ? scrollLeft / (scrollWidth - clientWidth) : 0;
          rememberScrollPosition(currentIndex, scrollRatio);
        } else {
          const { scrollTop, scrollHeight, clientHeight } = canvasRef.current;
          const scrollRatio = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;
          rememberScrollPosition(currentIndex, scrollRatio);
        }
      }

      // Update search highlight state
      if (highlightTerm !== undefined) {
        setSearchHighlight(highlightTerm);
      }

      const termToHighlight = highlightTerm !== undefined ? highlightTerm : searchHighlight;
      const chapter = await loadProcessedChapter(bookId, index, termToHighlight);
      if (requestToken !== chapterRequestRef.current) return;

      if (!chapter.content || chapter.content.trim().length === 0) {
        throw new Error(`Chapter ${index + 1} has no content`);
      }

      const processedChapter = chapter;

      setCurrentChapter(processedChapter);
      setCurrentIndex(index);
      setIsLoading(false);

      const progressPercent = metadata
        ? ((index + 1) / metadata.total_chapters) * 100
        : 0;

      const scrollRatio = scrollPositionsRef.current.get(index) || 0;
      const location = scrollRatio > 0
        ? `chapter_${index}:scroll_${scrollRatio.toFixed(6)}`
        : `chapter_${index}`;
      const cfi = `epubcfi(/0/${index}!/scroll/${scrollRatio.toFixed(6)})`;

      try {
        await api.saveReadingProgress(bookId, location, progressPercent, undefined, undefined, cfi);
      } catch {
        // Silently ignore database errors
      }

      await waitForStableReaderLayout(canvasRef.current);
      if (requestToken !== chapterRequestRef.current) return;

      const canvas = canvasRef.current;
      if (canvas) {
        const isHoriz = canvas.classList.contains('premium-reading-canvas--paginated') ||
                        canvas.classList.contains('premium-reading-canvas--two-page') ||
                        !continuousFlow;

        const isPendingAnnotation = Boolean(useReaderUIStore.getState().pendingAnnotationId);
        if (!isPendingAnnotation) {
          if (initialScrollRatio !== undefined && !termToHighlight) {
            if (isHoriz) {
              canvas.scrollLeft = initialScrollRatio * Math.max(0, canvas.scrollWidth - canvas.clientWidth);
            } else {
              canvas.scrollTop = initialScrollRatio * Math.max(0, canvas.scrollHeight - canvas.clientHeight);
            }
          } else {
            const savedPos = scrollPositionsRef.current.get(index);
            if (savedPos && savedPos > 0 && !termToHighlight) {
              if (isHoriz) {
                canvas.scrollLeft = savedPos * Math.max(0, canvas.scrollWidth - canvas.clientWidth);
              } else {
                canvas.scrollTop = savedPos * Math.max(0, canvas.scrollHeight - canvas.clientHeight);
              }
            } else if (isHoriz) {
              canvas.scrollLeft = 0;
            } else {
              canvas.scrollTop = 0;
            }
          }
        }
      }

      // If we have a highlight term, scroll to first highlight after content renders
      if (termToHighlight) {
        let attempts = 0;
        const scrollToSearch = () => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const highlight = canvas.querySelector<HTMLElement>('.search-highlight');
          if (highlight) {
            const isHoriz = canvas.classList.contains('premium-reading-canvas--paginated') ||
                            canvas.classList.contains('premium-reading-canvas--two-page') ||
                            !continuousFlow;
            if (isHoriz) {
              const clientWidth = canvas.clientWidth || 1;
              const pageIdx = Math.floor(highlight.offsetLeft / clientWidth);
              canvas.scrollTo({ left: pageIdx * clientWidth, behavior: 'smooth' });
            } else {
              highlight.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }

            highlight.classList.remove('search-highlight--active');
            void highlight.offsetWidth;
            highlight.classList.add('search-highlight--active');
            setTimeout(() => {
              highlight.classList.remove('search-highlight--active');
            }, 2800);
          } else if (attempts < 15) {
            attempts++;
            setTimeout(scrollToSearch, 60);
          }
        };

        requestAnimationFrame(() => {
          setTimeout(scrollToSearch, 40);
        });
      }
    } catch (err) {
      if (requestToken === chapterRequestRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load chapter');
        setIsLoading(false);
      }
    } finally {
      if (requestToken === chapterRequestRef.current) {
        chapterLoadInFlightRef.current = false;
      }
    }
  }, [bookId, currentChapter, currentIndex, metadata, searchHighlight, continuousFlow]);

  useEffect(() => {
    loadChapterRef.current = loadChapter;
  }, [loadChapter]);

  useEffect(() => {
    const el = readerContainerRef.current;
    if (el) {
      applyReaderThemeToElement(el, theme);
    }
    return () => {
      if (el) removeReaderThemeFromElement(el);
    };
  }, [theme, isLoading, error]);

  // ────────────────────────────────────────────────────────────
  // AUTO-HIDE TOP BAR LOGIC
  // ────────────────────────────────────────────────────────────
  
  // Initial visibility and Focus mode override
  useEffect(() => {
    if (isFocusMode || isTopBarShortcutOnly) {
      setTopBarVisible(false);
    } else {
      setTopBarVisible(true);
    }
  }, [isFocusMode, setTopBarVisible, isTopBarShortcutOnly]);

  // ────────────────────────────────────────────────────────────
  // SCROLL PROGRESS TRACKING (optimized)
  // ────────────────────────────────────────────────────────────
  const saveScrollProgressRef = useRef<number | null>(null);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const hasLoadedChapterRef = useRef(false);

  useEffect(() => {
    hasLoadedChapterRef.current = Boolean(currentChapter);
  }, [currentChapter]);

  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);

  const flushProgressNow = useCallback(() => {
    const totalChapters = metadataRef.current?.total_chapters ?? 1;
    const chapterIndex = currentIndexRef.current;
    const canvas = canvasRef.current;
    let scrollRatio = scrollPositionsRef.current.get(chapterIndex) ?? 0;

    if (canvas) {
      const isPag = canvas.classList.contains('premium-reading-canvas--paginated') ||
                    canvas.classList.contains('premium-reading-canvas--two-page');
      if (isPag) {
        const { scrollLeft, scrollWidth, clientWidth } = canvas;
        scrollRatio = scrollWidth > clientWidth ? scrollLeft / (scrollWidth - clientWidth) : 0;
      } else {
        const activeEl = canvas.querySelector(`[data-chapter-index="${chapterIndex}"]`) as HTMLElement;
        if (activeEl) {
           const distance = canvas.scrollTop - activeEl.offsetTop;
           scrollRatio = distance > 0 && activeEl.scrollHeight > 0 ? distance / activeEl.scrollHeight : 0;
           scrollRatio = Math.max(0, Math.min(1, scrollRatio));
        } else {
           const { scrollTop, scrollHeight, clientHeight } = canvas;
           scrollRatio = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;
        }
      }
      rememberScrollPosition(chapterIndex, scrollRatio);
    }

    const progressPercent = ((chapterIndex + scrollRatio) / totalChapters) * 100;
    const loc = scrollRatio > 0
      ? `chapter_${chapterIndex}:scroll_${scrollRatio.toFixed(6)}`
      : `chapter_${chapterIndex}`;
    const cfi = `epubcfi(/0/${chapterIndex}!/scroll/${scrollRatio.toFixed(6)})`;

    api.saveReadingProgress(bookId, loc, Math.min(100, progressPercent), undefined, undefined, cfi).catch(() => { });
  }, [bookId]);

  const handleScroll = useMemo(() => {
    let ticking = false;
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 150;
    let lastScrollTop = 0;

    return () => {
      const now = Date.now();

      if (!ticking && (now - lastUpdateTime) >= UPDATE_INTERVAL) {
        requestAnimationFrame(() => {
          const canvas = canvasRef.current;
          if (canvas) {
            const scrollTop = canvas.scrollTop;

            if (!isFocusMode && !isTopBarShortcutOnly) {
              if (scrollTop > lastScrollTop + 20) {
                setTopBarVisible(false);
              } else if (scrollTop < lastScrollTop - 20) {
                setTopBarVisible(true);
              }
            }
            lastScrollTop = scrollTop;

            const isPag = canvas.classList.contains('premium-reading-canvas--paginated') ||
                          canvas.classList.contains('premium-reading-canvas--two-page');
            const scrollHeight = canvas.scrollHeight;
            const clientHeight = canvas.clientHeight;
            
            let progress = 0;
            if (isPag) {
              const { scrollLeft, scrollWidth, clientWidth } = canvas;
              progress = scrollWidth > clientWidth ? (scrollLeft / (scrollWidth - clientWidth)) * 100 : 0;
            } else {
              progress = scrollHeight > clientHeight ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 0;
            }
            setScrollProgress(Math.min(100, Math.max(0, progress)));
            lastUpdateTime = Date.now();

            if (saveScrollProgressRef.current) {
              clearTimeout(saveScrollProgressRef.current);
            }
            // Save via flushProgressNow: Reads chapter index from a ref to prevent delayed timers from writing stale progress.
            saveScrollProgressRef.current = window.setTimeout(() => {
              saveScrollProgressRef.current = null;
              flushProgressNow();
            }, 2000);
          }
          ticking = false;
        });
        ticking = true;
      }
    };
  }, [setScrollProgress, isFocusMode, isTopBarShortcutOnly, setTopBarVisible, flushProgressNow]);


  // ────────────────────────────────────────────────────────────
  // BOOK LOADING
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    const run = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Add small delay to ensure book is in database
        await new Promise(resolve => setTimeout(resolve, 500));

        const bookMetadata = await api.openBookRenderer(bookId, bookPath, 'epub');
        setMetadata(bookMetadata);

        // Load the TOC so the top bar can show the real chapter the user is in
        api.getBookToc(bookId).then(setToc).catch(() => setToc([]));

        // Add another small delay to ensure HashMap insert completes
        await new Promise(resolve => setTimeout(resolve, 200));

        // Restore chapter + scroll.
        // Priority:
        // 1) explicit one-shot target from resume prompt (exact intent)
        // 2) persisted DB progress
        // Skip all restore if user chose "Start from beginning".
        let startIndex = 0;
        let savedScrollRatio = 0;
        const skipRestore = startFromBeginning;

        const normalizeChapterIndex = (rawIdx: number): number | null => {
          if (Number.isNaN(rawIdx)) return null;

          // Preferred: zero-based index
          if (rawIdx >= 0 && rawIdx < bookMetadata.total_chapters) {
            return rawIdx;
          }

          // Legacy compatibility: one-based index
          if (rawIdx > 0 && rawIdx <= bookMetadata.total_chapters) {
            return rawIdx - 1;
          }

          return null;
        };

        // Consume start-over flag immediately so it doesn't leak into future opens.
        if (skipRestore) {
          setStartFromBeginning(false);
        }

        if (!skipRestore) {
          const directTarget = explicitResumeTarget?.bookId === bookId ? explicitResumeTarget : null;

          if (directTarget) {
            const normalized = normalizeChapterIndex(directTarget.chapterIndex);
            if (normalized !== null) {
              startIndex = normalized;
            }
            const ratio = directTarget.scrollRatio;
            if (!Number.isNaN(ratio) && ratio >= 0 && ratio <= 1) {
              savedScrollRatio = ratio;
            }
            // One-shot target consumed.
            setExplicitResumeTarget(null);
          } else {
            try {
              const progress = await api.getReadingProgress(bookId);
              if (progress) {
                const fallbackFromLocation = () => {
                  if (!progress.currentLocation) return { chapter: null as number | null, scroll: null as number | null };
                  // Legacy location format: "chapter_N" or "chapter_N:scroll_R"
                  const parts = progress.currentLocation.split(':');

                  let chapter: number | null = null;
                  if (parts[0].startsWith('chapter_')) {
                    const idx = parseInt(parts[0].replace('chapter_', ''), 10);
                    chapter = normalizeChapterIndex(idx);
                  }

                  let scroll: number | null = null;
                  if (parts[1]?.startsWith('scroll_')) {
                    const ratio = parseFloat(parts[1].replace('scroll_', ''));
                    if (!Number.isNaN(ratio) && ratio >= 0 && ratio <= 1) {
                      scroll = ratio;
                    }
                  }

                  return { chapter, scroll };
                };

                let cfiChapter: number | null = null;
                let cfiScroll: number | null = null;

                // Prefer CFI-based restore for precision.
                // Fill missing parts from currentLocation fallback when needed.
                if (progress.cfiLocation?.startsWith('epubcfi(') && progress.cfiLocation.endsWith(')')) {
                  const cfiInner = progress.cfiLocation.slice(8, -1);
                  const cfiParts = cfiInner.split('!/');
                  if (cfiParts.length === 2) {
                    const pathParts = cfiParts[0].split('/').filter(Boolean);
                    if (pathParts.length >= 2) {
                      const idx = parseInt(pathParts[1], 10);
                      cfiChapter = normalizeChapterIndex(idx);
                    }

                    const scrollMatch = cfiParts[1].match(/^scroll\/([0-9.]+)/);
                    if (scrollMatch) {
                      const ratio = parseFloat(scrollMatch[1]);
                      if (!Number.isNaN(ratio) && ratio >= 0 && ratio <= 1) {
                        cfiScroll = ratio;
                      }
                    }
                  }
                }

                const fallback = fallbackFromLocation();
                startIndex = cfiChapter ?? fallback.chapter ?? startIndex;
                savedScrollRatio = cfiScroll ?? fallback.scroll ?? savedScrollRatio;
              }
            } catch {
              // Silently ignore
            }
          }
        }

        // Seed the scroll map so continuous-flow mode restores the exact position.
        if (savedScrollRatio > 0) {
          rememberScrollPosition(startIndex, savedScrollRatio);
        }

        await loadChapterRef.current(startIndex, null, savedScrollRatio);
        setIsLoading(false);

        if (!skipRestore && (startIndex > 0 || savedScrollRatio > 0)) {
          const pct = bookMetadata.total_chapters > 0
            ? Math.round((startIndex / bookMetadata.total_chapters) * 100)
            : 0;
          useToastStore.getState().addToast({
            title: 'Resuming reading',
            description: `Chapter ${startIndex + 1} of ${bookMetadata.total_chapters} (${pct}%)`,
            variant: 'info',
            duration: 3000,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load eBook');
        setIsLoading(false);
      }
    };

    void run();
    const hideFlush = () => flushProgressNow();
    // Android can background/kill the app without unmounting React — flush the
    // debounced scroll save on hide so the last position survives.
    window.addEventListener('pagehide', hideFlush);
    document.addEventListener('visibilitychange', hideFlush);
    return () => {
      window.removeEventListener('pagehide', hideFlush);
      document.removeEventListener('visibilitychange', hideFlush);
      if (saveScrollProgressRef.current) {
        clearTimeout(saveScrollProgressRef.current);
        saveScrollProgressRef.current = null;
      }
      flushProgressNow();
      clearProcessedChapterCache(bookId);
      api.closeBookRenderer(bookId).catch(logger.error);
    };
  }, [bookPath, bookId, flushProgressNow]);

  const handleClose = useCallback(() => {
    if (saveScrollProgressRef.current) {
      clearTimeout(saveScrollProgressRef.current);
      saveScrollProgressRef.current = null;
    }
    flushProgressNow();
    clearProcessedChapterCache(bookId);
    onClose();
  }, [bookId, flushProgressNow, onClose]);

  // ────────────────────────────────────────────────────────────
  // NAVIGATION
  // ────────────────────────────────────────────────────────────
  const nextChapter = useCallback(() => {
    if (!metadata) return;
    if (currentIndex < metadata.total_chapters - 1) {
      loadChapter(currentIndex + 1, null, 0); // Start at beginning of next chapter
    }
  }, [metadata, currentIndex, loadChapter]);

  const prevChapter = useCallback((startAtEnd = false) => {
    if (currentIndex > 0) {
      loadChapter(currentIndex - 1, null, startAtEnd ? 1.0 : 0); // If paging backward, start at end of previous chapter
    }
  }, [currentIndex, loadChapter]);

  useEffect(() => {
    if (!hasLoadedChapterRef.current) {
      previousTwoPageViewRef.current = twoPageView;
      return;
    }
    if (previousTwoPageViewRef.current === twoPageView) return;
    previousTwoPageViewRef.current = twoPageView;
    void loadChapterRef.current(currentIndexRef.current);
  }, [twoPageView]);

  useEffect(() => {
    if (previousDoodleChapterRef.current === currentIndex) return;
    previousDoodleChapterRef.current = currentIndex;
    setActivePage(`epub-${bookId}-${currentIndex}`);
  }, [currentIndex, setActivePage, bookId]);

  // Preload adjacent chapters for page flip — deferred to idle time
  useEffect(() => {
    // Page-flip preloading duplicates processed HTML. Disable on Android;
    // navigation remains on-demand and memory stays bounded.
    if (isAndroid || !pageFlipEnabled || !metadata) {
      setNextChapterContent(null);
      setPrevChapterContent(null);
      return;
    }

    let cancelled = false;

    const preload = async () => {
      // Preload next chapter
      if (currentIndex < metadata.total_chapters - 1) {
        try {
          const processed = await loadProcessedChapter(bookId, currentIndex + 1);
          if (!cancelled) setNextChapterContent(processed.content);
        } catch {
          if (!cancelled) setNextChapterContent(null);
        }
      } else {
        if (!cancelled) setNextChapterContent(null);
      }

      // Preload prev chapter
      if (currentIndex > 0) {
        try {
          const processed = await loadProcessedChapter(bookId, currentIndex - 1);
          if (!cancelled) setPrevChapterContent(processed.content);
        } catch {
          if (!cancelled) setPrevChapterContent(null);
        }
      } else {
        if (!cancelled) setPrevChapterContent(null);
      }
    };

    // Use requestIdleCallback to avoid blocking the main thread
    const idleId = 'requestIdleCallback' in window
      ? (window as Window & { requestIdleCallback: (callback: () => void) => number }).requestIdleCallback(() => preload())
      : setTimeout(() => preload(), 500);

    return () => {
      cancelled = true;
      if ('cancelIdleCallback' in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      } else {
        clearTimeout(idleId);
      }
    };
  }, [currentIndex, pageFlipEnabled, metadata, bookId]);

  // ────────────────────────────────────────────────────────────
  // ANNOTATION HIGHLIGHTS — render saved highlights into DOM
  // ────────────────────────────────────────────────────────────
  const applyAnnotationsNow = useCallback(async () => {
    const container = contentContainerRef.current;
    if (!container || continuousFlow) return;

    try {
      const annotations = await api.getAnnotations(bookId);
      const chapterLocation = `chapter_${currentIndexRef.current}`;
      const chapterAnnotations = annotations.filter(
        (a) =>
          a.location === chapterLocation ||
          a.location.startsWith(`${chapterLocation}:`)
      );

      applyHighlightsToDOM(container, chapterAnnotations);

      const pendingId = useReaderUIStore.getState().pendingAnnotationId;
      if (pendingId) {
        const scrolled = scrollToAnnotationMark(container, pendingId);
        if (scrolled) {
          useReaderUIStore.getState().setPendingAnnotationId(null);
        }
      }
    } catch {
      // Silently ignore — highlights are non-critical
    }
  }, [bookId, continuousFlow]);

  useEffect(() => {
    if (!currentChapter || isLoading) return;

    // Ensure dangerouslySetInnerHTML content is in the DOM
    const timerId = window.setTimeout(applyAnnotationsNow, 60);

    const handleAnnotationChanged = () => {
      window.setTimeout(applyAnnotationsNow, 50);
    };
    window.addEventListener('annotation-changed', handleAnnotationChanged);

    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener('annotation-changed', handleAnnotationChanged);
    };
  }, [currentChapter, currentIndex, isLoading, applyAnnotationsNow]);

  // Dedicated reactive listener to smoothly scroll directly to the exact line of any clicked annotation
  const pendingAnnotationId = useReaderUIStore((state) => state.pendingAnnotationId);
  useEffect(() => {
    if (!pendingAnnotationId) return;

    let attempts = 0;
    const maxAttempts = 35;

    const tryScroll = async () => {
      const container = contentContainerRef.current;
      if (!container) {
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(tryScroll, 80);
        }
        return;
      }

      // 1. Try to scroll to mark if already in DOM
      let success = scrollToAnnotationMark(container, pendingAnnotationId);
      if (success) {
        useReaderUIStore.getState().setPendingAnnotationId(null);
        return;
      }

      // 2. If mark not found in DOM yet, re-apply highlights now to newly rendered content
      try {
        await applyAnnotationsNow();
        success = scrollToAnnotationMark(container, pendingAnnotationId);
        if (success) {
          useReaderUIStore.getState().setPendingAnnotationId(null);
          return;
        }
      } catch {
        // continue to retry
      }

      if (attempts < maxAttempts) {
        attempts++;
        setTimeout(tryScroll, 80);
      } else {
        useReaderUIStore.getState().setPendingAnnotationId(null);
      }
    };

    const timerId = setTimeout(tryScroll, 40);
    return () => clearTimeout(timerId);
  }, [pendingAnnotationId, currentIndex, isLoading, applyAnnotationsNow]);

  const isHorizontalPaging = twoPageView || isPaginated;

  const lastPageNavigationRef = useRef(0);
  const lastTouchNavigationRef = useRef(0);

  const nextPage = useCallback(() => {
    const now = Date.now();
    if (now - lastPageNavigationRef.current < 120) return;
    lastPageNavigationRef.current = now;

    if (!isFocusMode && !isTopBarShortcutOnly) {
      setTopBarVisible(false);
    }

    // Normal scroll mode or paginated / two-page mode
    if (canvasRef.current) {
      if (isHorizontalPaging) {
        const { scrollLeft, scrollWidth, clientWidth } = canvasRef.current;
        const maxScroll = scrollWidth - clientWidth;
        // If at or near the end of the chapter spreads, navigate to next chapter
        if (maxScroll <= 20 || scrollLeft >= maxScroll - 30) {
          nextChapter();
        } else {
          const target = Math.min(maxScroll, scrollLeft + clientWidth);
          canvasRef.current.scrollTo({ 
            left: target, 
            behavior: animationStyle !== 'none' ? 'smooth' : 'auto' 
          });
        }
      } else {
        const { scrollTop, scrollHeight, clientHeight } = canvasRef.current;
        const maxScroll = scrollHeight - clientHeight;
        if (maxScroll <= 20 || scrollTop >= maxScroll - 50) {
          nextChapter();
        } else {
          canvasRef.current.scrollBy({ 
            top: clientHeight * 0.85, 
            behavior: animationStyle !== 'none' ? 'smooth' : 'auto' 
          });
        }
      }
    } else {
      nextChapter();
    }
  }, [nextChapter, isHorizontalPaging, animationStyle, isFocusMode, isTopBarShortcutOnly]);

  const prevPage = useCallback(() => {
    const now = Date.now();
    if (now - lastPageNavigationRef.current < 120) return;
    lastPageNavigationRef.current = now;

    if (!isFocusMode && !isTopBarShortcutOnly) {
      setTopBarVisible(false);
    }

    // Normal scroll mode or paginated / two-page mode
    if (canvasRef.current) {
      if (isHorizontalPaging) {
        const { scrollLeft, clientWidth } = canvasRef.current;
        if (scrollLeft <= 30) {
          prevChapter(true);
        } else {
          const target = Math.max(0, scrollLeft - clientWidth);
          canvasRef.current.scrollTo({ 
            left: target, 
            behavior: animationStyle !== 'none' ? 'smooth' : 'auto' 
          });
        }
      } else {
        const { scrollTop, clientHeight } = canvasRef.current;
        if (scrollTop <= 50) {
          prevChapter(true);
        } else {
          canvasRef.current.scrollBy({ 
            top: -clientHeight * 0.85, 
            behavior: animationStyle !== 'none' ? 'smooth' : 'auto' 
          });
        }
      }
    } else {
      prevChapter(true);
    }
  }, [prevChapter, isHorizontalPaging, animationStyle, isFocusMode, isTopBarShortcutOnly]);

  // Mouse wheel navigation: ONLY intercept in horizontal two-page or paginated mode
  const lastWheelTimeRef = useRef(0);
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!isHorizontalPaging) {
      // In vertical scroll mode, let native browser scrolling happen naturally!
      return;
    }
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(delta) > 20) {
      const now = Date.now();
      if (now - lastWheelTimeRef.current > 250) {
        lastWheelTimeRef.current = now;
        if (delta > 0) {
          nextPage();
        } else {
          prevPage();
        }
      }
    }
  }, [isHorizontalPaging, nextPage, prevPage]);

  // Click zone handling: left 20% prev, right 20% next, center toggle top bar
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Canvas owns reader taps. Stop parent `.premium-reader` from running a
    // second page/toggle action on the same Android-synthesized click.
    e.stopPropagation();
    if (Date.now() - lastTouchNavigationRef.current < 500) return;
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, [role="button"], .premium-nav-arrow')) {
      return;
    }
    if (isHorizontalPaging) {
      const clickX = e.clientX;
      const width = window.innerWidth;
      if (clickX < width * 0.20) {
        prevPage();
        return;
      }
      if (clickX > width * 0.80) {
        nextPage();
        return;
      }
    }
    if (!isFocusMode && !isTopBarShortcutOnly) {
      setTopBarVisible(!useReaderUIStore.getState().isTopBarVisible);
    }
  }, [isHorizontalPaging, prevPage, nextPage, isFocusMode, isTopBarShortcutOnly, setTopBarVisible]);

  const scrollLineUp = useCallback(() => {
    if (canvasRef.current) {
      if (isHorizontalPaging) {
        prevPage();
      } else {
        canvasRef.current.scrollBy({ top: -140, behavior: 'smooth' });
      }
    }
  }, [isHorizontalPaging, prevPage]);

  const scrollLineDown = useCallback(() => {
    if (canvasRef.current) {
      if (isHorizontalPaging) {
        nextPage();
      } else {
        canvasRef.current.scrollBy({ top: 140, behavior: 'smooth' });
      }
    }
  }, [isHorizontalPaging, nextPage]);

  // Keyboard shortcuts
  usePremiumReaderKeyboard({
    onPrevChapter: () => prevChapter(true),
    onNextChapter: () => nextChapter(),
    onPrevPage: prevPage,
    onNextPage: nextPage,
    onScrollUp: scrollLineUp,
    onScrollDown: scrollLineDown,
    isPaginatedOrTwoPage: isHorizontalPaging,
  });

  // Handle page flip completion — navigate to next/prev chapter
  const handleFlipComplete = useCallback((direction: 'forward' | 'backward') => {
    if (direction === 'forward') {
      nextChapter();
    } else {
      prevChapter();
    }
  }, [nextChapter, prevChapter]);

  // Current page identifier for doodle storage
  const currentPageId = useMemo(() => `chapter_${currentIndex}`, [currentIndex]);

  // ────────────────────────────────────────────────────────────
  // TOUCH GESTURES (SWIPE)
  // ────────────────────────────────────────────────────────────
  const touchStartRef = useRef<{ x: number, y: number, time: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Ignore multi-touch
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touchStart = touchStartRef.current;
    touchStartRef.current = null;
    
    // If doodle mode is active, text is selected, or reader is vertical-flow,
    // let native Android scrolling handle the gesture.
    if (isDoodleMode || !isHorizontalPaging || window.getSelection()?.toString().trim()) return;

    // Use changedTouches since touches is empty on touchend
    if (e.changedTouches.length !== 1) return;
    const touchEnd = e.changedTouches[0];

    const dx = touchEnd.clientX - touchStart.x;
    const dy = touchEnd.clientY - touchStart.y;
    const dt = Date.now() - touchStart.time;

    // Fast enough swipe (under 400ms) and mostly horizontal
    if (dt < 400 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 2) {
      // Android may synthesize a click after touchend. Canvas click handler
      // ignores this short window so one swipe = one navigation.
      lastTouchNavigationRef.current = Date.now();
      if (dx < 0) {
        // Swipe Left -> Next
        nextPage();
      } else {
        // Swipe Right -> Prev
        prevPage();
      }
    }
  }, [isDoodleMode, isHorizontalPaging, nextPage, prevPage]);

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────

  const handleContainerDoubleClick = useCallback((e: React.MouseEvent) => {
    // If doodle mode or text selection is active, let them handle it
    if (isDoodleMode) return;
    
    // Ignore if clicking an interactive element or if already handled
    const target = e.target as Element;
    if (e.defaultPrevented || !target || typeof target.closest !== 'function') return;
    
    if (target.closest('a') || target.closest('button') || target.closest('.premium-top-bar') || target.closest('.premium-sidebar') || target.closest('.text-selection-toolbar')) {
      return;
    }

    const uiStore = useReaderUIStore.getState();
    if (uiStore.isSidebarOpen) {
      uiStore.closeSidebar();
    } else {
      setTopBarVisible(!uiStore.isTopBarVisible);
    }
  }, [isDoodleMode, setTopBarVisible]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (isDoodleMode) return;
    const target = e.target as Element;
    if (e.defaultPrevented || !target || typeof target.closest !== 'function') return;
    if (target.closest('a') || target.closest('button') || target.closest('.premium-top-bar') || target.closest('.premium-sidebar') || target.closest('.text-selection-toolbar') || target.closest('.doodle-toolbar')) {
      return;
    }

    // If user is selecting text, don't toggle UI on click
    if (window.getSelection()?.toString().trim()) {
      return;
    }

    // Determine click region (left 20%, right 20%, center 60%)
    const windowWidth = window.innerWidth;
    // On mobile touch events, clientX might sometimes be 0 in click events if not properly synthesized,
    // though React normally handles it. We fallback to screenX or just assume center if 0 and width > 0.
    const clickX = e.clientX || (e.nativeEvent as any).changedTouches?.[0]?.clientX || e.clientX;
    const clickRatio = clickX / windowWidth;

    if (clickRatio < 0.2) {
      prevPage();
    } else if (clickRatio > 0.8) {
      nextPage();
    } else {
      // Center tap toggles UI or dismisses sidebar
      const uiStore = useReaderUIStore.getState();
      if (uiStore.isSidebarOpen) {
        uiStore.closeSidebar();
      } else {
        setTopBarVisible(!uiStore.isTopBarVisible);
      }
    }
  }, [isDoodleMode, prevPage, nextPage, setTopBarVisible]);

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div ref={readerContainerRef} className="premium-reader premium-reader--error">
        <div className="premium-error-container">
          <AlertCircle className="premium-error-icon" />
          <p className="premium-error-title">{error}</p>
          <p className="premium-error-subtitle">Try opening a different book or check the file format.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="premium-error-button"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  if (!currentChapter) {
    const chapterSubtitle =
      findCurrentTocEntry(toc, currentIndex)?.label?.trim() ||
      (metadata ? `Chapter ${currentIndex + 1} of ${metadata.total_chapters}` : undefined);

    return (
      <BookSkeletonLoading
        title={metadata?.title ?? readerContent?.title}
        subtitle={readerContent?.author}
        progressText={chapterSubtitle}
        message="Resuming reading"
        coverUrl={metadata?.cover_url ?? readerContent?.cover}
        format="epub"
      />
    );
  }

  const progressPercentage = metadata
    ? ((currentIndex + 1) / metadata.total_chapters) * 100
    : 0;

  // Use the TOC to resolve readable chapter names instead of the renderer's manifest ID.
  const chapterSubtitle =
    findCurrentTocEntry(toc, currentIndex)?.label?.trim() ||
    (metadata ? `Chapter ${currentIndex + 1} of ${metadata.total_chapters}` : currentChapter.title);

  return (
    <div 
      ref={readerContainerRef} 
      className={`premium-reader ${isFocusMode ? 'premium-reader--focus-mode' : ''}`} 
      onClick={handleContainerClick} 
      onDoubleClick={handleContainerDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Auto-hide Top Bar */}
      <ReaderTopBar
        bookId={bookId}
        title={metadata?.title || readerContent?.title || 'Loading...'}
        subtitle={chapterSubtitle}
        progress={progressPercentage}
        format="epub"
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
              <svg aria-hidden="true" className="premium-control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          </>
        }
      />

      {/* Reading Canvas */}
      {continuousFlow && metadata ? (
        <ContinuousEpubView
          bookId={bookId}
          metadata={metadata}
          initialChapterIndex={currentIndex}
          initialScrollRatio={scrollPositionsRef.current.get(currentIndex)}
          onChapterChange={(idx) => {
            setCurrentIndex(idx);
            // Update the ref immediately and save with the real scroll position instead of a hardcoded
            currentIndexRef.current = idx;
            flushProgressNow();
          }}
          widthClass={width}
          isFocusMode={isFocusMode}
          searchTerm={searchHighlight}
          scrollRef={canvasRef}
          contentRef={contentContainerRef}
          onScroll={handleScroll as any}
        />
      ) : (
        <div
          ref={canvasRef}
          onScroll={handleScroll as any}
          onWheel={handleWheel}
          onClick={handleCanvasClick}
          className={`premium-reading-canvas ${isFocusMode ? 'premium-reading-canvas--focus-mode' : ''} ${twoPageView ? 'premium-reading-canvas--two-page' : isPaginated ? 'premium-reading-canvas--paginated' : ''} ${isLoading ? 'opacity-50 pointer-events-none transition-opacity duration-300' : 'opacity-100 transition-opacity duration-300'}`}
        >
          <div
            ref={contentContainerRef}
            onClick={(e) => {
              // External links (http/https/mailto) → system browser; internal
              // links (anchors, epubcfi, relative) bubble on untouched.
              handleExternalLinkClick(e.nativeEvent, contentContainerRef.current);
            }}
            className={`premium-content-container premium-content-container--${width} ${twoPageView ? 'premium-content-container--two-page' : ''} ${isPaginated ? 'premium-content-container--paginated' : ''}`}
          >
            {pageFlipEnabled && !isHorizontalPaging ? (
              /* Page flip mode */
              <PageFlipEngine
                ref={pageFlipRef}
                currentContent={currentChapter.content}
                chapterIndex={currentIndex}
                nextContent={nextChapterContent}
                prevContent={prevChapterContent}
                flipSpeed={pageFlipSpeed}
                enabled={pageFlipEnabled}
                animationStyle={animationStyle}
                onFlipComplete={handleFlipComplete}
                onRendered={applyAnnotationsNow}
                className="premium-chapter-page"
              />
            ) : (
              /* Standard & Two-Page spread layout */
              <div className="premium-chapter-page" data-chapter-index={currentIndex}>
                <ChapterHtml content={currentChapter.content} />
              </div>
            )}

          {/* Doodle Canvas Overlay — must be inside the scrolling container to match its height */}
          {isDoodleMode && (
            <DoodleCanvas
              bookId={bookId}
              pageId={currentPageId}
              containerRef={contentContainerRef}
            />
          )}
        </div>
      </div>
      )}

      {/* Doodle Toolbar (floating, only when active) */}
      {isDoodleMode && <DoodleToolbar />}

      {/* Text Selection Toolbar */}
      {!isDoodleMode && (
        <TextSelectionToolbar
          bookId={bookId}
          currentLocation={`chapter_${currentIndex}`}
        />
      )}

      {/* Rich Hover Annotation / Definition Tooltip */}
      <ReaderAnnotationTooltip />



      {/* Floating Navigation Arrows */}
      {!isFocusMode && !continuousFlow && (
        <>
          <button
            type="button"
            onClick={prevPage}
            className="premium-nav-arrow premium-nav-arrow--left"
            aria-label="Previous page"
          >
            <ChevronLeft className="premium-nav-icon" />
          </button>

          <button
            type="button"
            onClick={nextPage}
            className="premium-nav-arrow premium-nav-arrow--right"
            aria-label="Next page"
          >
            <ChevronRight className="premium-nav-icon" />
          </button>
        </>
      )}

      {/* Reading Progress Indicator (Bottom Left) */}
      <ReadingProgressIndicator
        bookId={bookId}
        progressPercentage={progressPercentage}
        isVisible={true}
      />

      {/* Sidebar */}
      <PremiumSidebar
        bookId={bookId}
        currentIndex={currentIndex}
        onNavigate={loadChapter}
      />

      {/* TTS Audiobook UI */}
      <TTSControlBar
        contentRef={contentContainerRef}
        onChapterEnd={() => loadChapter(currentIndex + 1)}
        contentKey={currentIndex}
      />
    </div>
  );
}
