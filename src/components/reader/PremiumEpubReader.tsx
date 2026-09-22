import { logger } from '@/lib/logger';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, isAndroid, getEpubResourceUrl } from '@/lib/tauri';
import type { Annotation, BookMetadata, Chapter, TocEntry } from '@/lib/tauri';
import { findCurrentTocEntry } from '@/lib/toc';
import { useReaderUIStore, useReadingSettings, applyReaderThemeToElement, removeReaderThemeFromElement, applyAllSettingsToDOM } from '@/store/premiumReaderStore';
import { syncReaderStatusBar, restoreAppStatusBar } from '@/lib/statusBarTheme';
import { useReaderStore } from '@/store/readerStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useDoodleStore } from '@/store/doodleStore';
import { usePremiumReaderKeyboard } from '@/hooks/usePremiumReaderKeyboard';
import { useFullscreen } from '@/hooks/useFullscreen';
import { FootnotePopover } from './FootnotePopover';
import { useReadingSession } from '@/hooks/useReadingSession';
import { PremiumSidebar } from './PremiumSidebar';
import { DoodleCanvas } from './DoodleCanvas';
import { DoodleToolbar } from './DoodleToolbar';
import { PageFlipEngine, type PageFlipHandle } from './PageFlipEngine';
import { TextSelectionToolbar } from './TextSelectionToolbar';
import { ReaderAnnotationTooltip } from './ReaderAnnotationTooltip';
import { ReaderContextMenu } from './ReaderContextMenu';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Search, BookOpen, Highlighter, Bookmark } from '@/components/icons';
import { ReaderTooltip } from './ReaderTooltip';
import { escapeHtml } from '@/lib/sanitize';
import DOMPurify from 'dompurify';
import { applyHighlightsToDOM, scrollToAnnotationMark } from '@/lib/highlightAnnotations';
import { notifyAnnotationsChanged, onAnnotationsChanged } from '@/lib/annotationEvents';
import { handleExternalLinkClick } from '@/lib/externalLinks';
import { useToastStore } from '@/store/toastStore';
import { ReaderTopBar } from './ReaderTopBar';
import { ReadingProgressIndicator } from './ReadingProgressIndicator';
import { isSelectionOrNoteActive, isTouchOnSelectionOrModal } from '@/lib/selectionLock';
import { ContinuousEpubView } from './ContinuousEpubView';
import { triggerHaptic } from '@/lib/haptics';
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

// Sanitizer config mirrors sanitizeBookContent (rich book-content subset; script
// and event-handler XSS stripped) but additionally permits the shiori-epub custom
// protocol URIs that processEpubHtml emits (desktop: shiori-epub://, Windows:
// tauri://; Android's http://shiori-epub.localhost is already http:). Kept local
// because the default DOMPurify URI regexp drops any unknown scheme — which would
// silently strip every resourced <img> src at injection time.
const EPUB_SAFE_URI_REGEXP =
  /^(?:(?:https?|mailto|tel|callto|sms|cid|xmpp):|(?:shiori-epub|tauri):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

function sanitizeChapterHtml(content: string): string {
  return DOMPurify.sanitize(content, {
    // Keep style attributes — books rely on inline styles for formatting
    ADD_ATTR: ['style'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    ALLOWED_URI_REGEXP: EPUB_SAFE_URI_REGEXP,
  });
}

export function ChapterHtml({ content }: { content: string }) {
  const html = useMemo(() => sanitizeChapterHtml(content), [content]);
  return <div className="premium-chapter-content" dangerouslySetInnerHTML={{ __html: html }} />;
}

// Strip leading ../ and ./ (plus any fragment) from an EPUB-relative resource
// path — same sanitization the old base64 inliner applied before fetching.
function cleanEpubPath(path: string): string {
  let clean = path.split('#')[0];
  while (clean.startsWith('../') || clean.startsWith('./')) {
    clean = clean.replace(/^\.\.\//, '').replace(/^\.\//, '');
  }
  return clean;
}

// Rewrite url() references inside inlined CSS to absolute shiori-epub:// URLs.
// Relative refs inside CSS resolve against the CSS file's location (baseUrl),
// NOT the app document — so fonts/images load lazily through the protocol.
function rewriteCssUrls(css: string, baseUrl: string, bookId: number): string {
  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  return css.replace(urlRe, (whole, quote: string, ref: string) => {
    const trimmed = ref.trim();
    if (trimmed.startsWith('data:') || trimmed.startsWith('http') || trimmed.startsWith('#')) {
      return whole;
    }
    try {
      const abs = new URL(trimmed, baseUrl);
      // Only rewrite refs that resolve back into the EPUB protocol.
      if (!/^(shiori-epub:|tauri:|https?:)/i.test(abs.protocol)) return whole;
      // abs.pathname is percent-encoded and still carries the /<bookId>/ prefix.
      const rel = decodeURIComponent(abs.pathname.replace(/^\/(\d+)\//, ''));
      const cleaned = cleanEpubPath(rel);
      if (cleaned) {
        return `url(${quote || "'"}${getEpubResourceUrl(bookId, cleaned)}${quote || "'"})`;
      }
    } catch {
      // malformed url() — leave untouched
    }
    return whole;
  });
}

// Rewrite one src/srcset/href attribute value (no fetch, no base64).
function rewriteResourceValue(attr: string, value: string, bookId: number): string {
  if (attr === 'srcset') {
    return value
      .split(',')
      .map((candidate) => {
        const parts = candidate.trim().split(/\s+/);
        const url = parts[0];
        if (url.startsWith('http') || url.startsWith('data:')) return candidate;
        const clean = cleanEpubPath(url);
        if (!clean) return candidate;
        const suffix = parts.length > 1 ? ` ${parts.slice(1).join(' ')}` : '';
        return `${getEpubResourceUrl(bookId, clean)}${suffix}`;
      })
      .join(', ');
  }
  const clean = cleanEpubPath(value);
  return clean ? getEpubResourceUrl(bookId, clean) : value;
}

export async function processEpubHtml(bookId: number, html: string): Promise<string> {
  // Step 1: Process CSS stylesheets. <link rel=stylesheet> tags can't be kept
  // as-is: DOMPurify strips <link> tags entirely at injection time (and the
  // reader injects into the app document, not an iframe). So the CSS is still
  // inlined as <style> — but url() references inside it (fonts/images) are
  // rewritten to absolute shiori-epub:// URLs instead of base64 data URIs, and
  // the WebView fetches those lazily through the custom protocol.
  //
  // K3-006: collect all CSS link tags first, then fetch them with bounded
  // concurrency (≤4 at a time) instead of sequential await-per-tag.
  const cssLinkRegex = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
  const cssMatches = Array.from(html.matchAll(cssLinkRegex));

  // Build a map: linkTag → replacement (<style>…</style> or '')
  const cssReplacements = new Map<string, string>();

  if (cssMatches.length > 0) {
    // Bounded concurrency: process up to 4 CSS files in parallel.
    const BATCH = 4;
    for (let i = 0; i < cssMatches.length; i += BATCH) {
      const batch = cssMatches.slice(i, i + BATCH);
      await Promise.all(batch.map(async (match) => {
        const linkTag = match[0];
        if (cssReplacements.has(linkTag)) return; // deduplicate
        const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i);
        if (!hrefMatch) { cssReplacements.set(linkTag, ''); return; }
        const cssPath = hrefMatch[1];
        if (cssPath.startsWith('http') || cssPath.startsWith('data:')) return;
        try {
          const cleanPath = cleanEpubPath(cssPath);
          const cssData = await api.getEpubResource(bookId, cleanPath);
          const cssText = new TextDecoder().decode(new Uint8Array(cssData));
          const cssWithProtoUrls = rewriteCssUrls(cssText, getEpubResourceUrl(bookId, cleanPath), bookId);
          cssReplacements.set(linkTag, `<style type="text/css">\n${cssWithProtoUrls}\n</style>`);
        } catch {
          cssReplacements.set(linkTag, '');
        }
      }));
    }
  }

  // Apply CSS replacements in a single pass over the HTML string.
  let processedHtml = html;
  for (const [linkTag, replacement] of cssReplacements) {
    // Use a literal string replace (no regex) — linkTag is an exact match.
    processedHtml = processedHtml.split(linkTag).join(replacement);
  }

  try {
    const imgPaths = new Set<string>();
    for (const m of processedHtml.matchAll(/<img\b[^>]*?\bsrc="([^"']+)"/gi)) {
      const src = m[1];
      if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('#')) continue;
      imgPaths.add(cleanEpubPath(src));
    }
    if (imgPaths.size > 0) {
      const sizes = await api.getEpubImageSizes(bookId, Array.from(imgPaths));
      if (sizes.length > 0) {
        const sizeMap = new Map<string, [number, number]>();
        for (const [p, w, h] of sizes) sizeMap.set(p, [w, h]);
        processedHtml = processedHtml.replace(/<img\b[^>]*>/gi, (tag) => {
          if (/\b(width|height)\s*=/i.test(tag)) return tag; // already sized by the EPUB
          const sm = tag.match(/\bsrc="([^"']+)"/i);
          if (!sm) return tag;
          const size = sizeMap.get(cleanEpubPath(sm[1]));
          if (!size) return tag;
          return tag.replace(/<img\b/i, `<img width="${size[0]}" height="${size[1]}"`);
        });
      }
    }
  } catch {
    // Best-effort: if sizing fails, the reactive post-decode stamp still applies.
  }

  // Step 2: Rewrite images/media/resources — no fetch + base64, just point
  // src/srcset/href at the custom protocol and let the WebView fetch and
  // decode lazily (custom protocols are async, so early injection is fine).
  //
  // K3-006: single-pass replace with a replacer function instead of a
  // per-resource loop that allocated the whole string on every iteration.
  // The replacer is called for each match without rebuilding processedHtml.
  const srcRegex = /(src|srcset|href)="([^"']+)"/g;
  processedHtml = processedHtml.replace(srcRegex, (whole, attr: string, originalPath: string) => {
    // Skip absolute URLs, data URIs, anchors, and CSS files (already processed)
    if (
      originalPath.startsWith('http') ||
      originalPath.startsWith('data:') ||
      originalPath.startsWith('#') ||
      originalPath.endsWith('.css')
    ) {
      return whole;
    }

    // Skip HTML files (internal anchor links, not embedded resources)
    const originalPathLower = originalPath.toLowerCase();
    if (
      originalPathLower.includes('.xhtml') ||
      originalPathLower.includes('.html') ||
      originalPathLower.includes('.htm') ||
      originalPathLower.includes('.xml')
    ) {
      return whole;
    }

    return `${attr}="${rewriteResourceValue(attr, originalPath, bookId)}"`;
  });

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
// Cache the fully processed Chapter (HTML with shiori-epub protocol URIs and inlined
// CSS styles) keyed by book+index+highlight-term so revisiting a chapter in simple or
// continuous mode is a Map hit instead of repeated IPC + resource parsing round-trips.
// Module-level: shared between PremiumEpubReader and ContinuousEpubView (K3-007, K3-020).
const MAX_PROCESSED_CHAPTERS = isAndroid ? 3 : 5;
const MAX_PROCESSED_CHAPTER_BYTES = (isAndroid ? 16 : 64) * 1024 * 1024;
const processedChapterCache = new Map<string, Chapter>();
let processedChapterCacheBytes = 0;
// Book whose chapters are currently cached; used to drop the previous book's
// entries when the user switches books mid-session (the cache is keyed by
// bookId, so stale entries from Book A would otherwise linger behind Book B).
let cachedBookId: number | undefined = undefined;

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


/** Block-level tags that can anchor a paragraph-level resume position. */
const PARAGRAPH_ANCHOR_TAG_RE = /^(?:H[1-6]|P|LI|BLOCKQUOTE|PRE|FIGURE|DIV)$/;

/**
 * Direct block children of a chapter's content wrapper
 * (`premium-chapter-content`). Save and restore MUST use this identical list
 * so the recorded index resolves to the same paragraph across sessions and
 * font/device changes. Non-empty check drops spacer/wrapper divs.
 */
function getChapterBlockElements(canvas: HTMLElement, chapterIndex: number): HTMLElement[] {
  const content = canvas.querySelector<HTMLElement>(`[data-chapter-index="${chapterIndex}"] .premium-chapter-content`);
  if (!content) return [];
  const blocks: HTMLElement[] = [];
  const children = content.children;
  for (let i = 0; i < children.length; i += 1) {
    const el = children[i] as HTMLElement;
    if (!PARAGRAPH_ANCHOR_TAG_RE.test(el.tagName)) continue;
    if (!el.textContent || !el.textContent.trim()) continue;
    blocks.push(el);
  }
  return blocks;
}

/**
 * Index (in getChapterBlockElements order) of the block whose top edge is at
 * the canvas viewport top — closest while ≥ -2px — or -1 when none qualifies.
 */
function getChapterBlockAtViewportTop(canvas: HTMLElement, chapterIndex: number): number {
  const blocks = getChapterBlockElements(canvas, chapterIndex);
  if (blocks.length === 0) return -1;
  const viewTop = canvas.getBoundingClientRect().top;
  let best = -1;
  let bestTop = Number.POSITIVE_INFINITY;
  for (let i = 0; i < blocks.length; i += 1) {
    const top = blocks[i].getBoundingClientRect().top;
    if (top >= viewTop - 2 && top < bestTop) {
      bestTop = top;
      best = i;
    }
  }
  return best;
}

/** Bounded wait for visible font readiness. document.fonts.ready can hang on
 *  broken font providers, so cap it — navigation must never block. */
async function waitForVisibleFonts(timeoutMs = 500): Promise<void> {
  const fonts = document.fonts;
  if (!fonts?.ready) return;
  await Promise.race([
    fonts.ready,
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
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

/** Fetch a chapter and process its HTML, reusing the module-level LRU cache.
 * Exported so ContinuousEpubView can share the same cache (K3-007). */
export async function loadProcessedChapter(bookId: number, index: number, term?: string | null): Promise<Chapter> {
  // Book switch: drop the previous book's cached chapters before loading the
  // first chapter of the new book (per-chapter LRU caps stay intact).
  if (cachedBookId !== undefined && cachedBookId !== bookId) {
    clearProcessedChapterCache(cachedBookId);
  }
  cachedBookId = bookId;
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
  const toggleFocusMode = useReaderUIStore(state => state.toggleFocusMode);
  const setSidebarTab = useReaderUIStore(state => state.setSidebarTab);
  const setPendingSearchQuery = useReaderUIStore(state => state.setPendingSearchQuery);
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
  const { theme, width, twoPageView, isPaginated, continuousFlow, toggleTwoPageView, pageFlipEnabled, pageFlipSpeed, animationStyle, fontSize, uiScale, margin, paperTextureIntensity } = readingSettings;

  /** Signature of everything that changes how pagination lays out. When it
   *  changes, the paginated page cache must be rebuilt (F2). Initialised to
   *  the mount-time key so the first settings effect run doesn't re-paginate. */
  const lastLayoutKeyRef = useRef<string | null>(
    JSON.stringify([theme, width, twoPageView, isPaginated, fontSize, uiScale, margin, paperTextureIntensity])
  );
  /** Pending (debounced) re-pagination from a layout-setting change. */
  const _rePagSettingsTimerRef = useRef<number | null>(null);

  // Apply all reading settings (typography, margins, etc.) on mount and when they change
  useEffect(() => {
    applyAllSettingsToDOM(readingSettings);

    // F2 — a LAYOUT-affecting setting changed: the paginated page cache was
    // built for the old width/font/margins, so text would clip at stale page
    // boundaries. Rebuild the current chapter's pages (position preserved) via
    // a short debounce. Continuous flow reflows in place — nothing to rebuild.
    const layoutKey = JSON.stringify([theme, width, twoPageView, isPaginated, fontSize, uiScale, margin, paperTextureIntensity]);
    if (layoutKey !== lastLayoutKeyRef.current) {
      lastLayoutKeyRef.current = layoutKey;
      if ((isPaginated || twoPageView) && !continuousFlow) {
        if (_rePagSettingsTimerRef.current !== null) {
          window.clearTimeout(_rePagSettingsTimerRef.current);
        }
        _rePagSettingsTimerRef.current = window.setTimeout(() => {
          _rePagSettingsTimerRef.current = null;
          rePaginatePreservingPosition();
        }, 150);
      }
    }
    return () => {
      if (_rePagSettingsTimerRef.current !== null) {
        window.clearTimeout(_rePagSettingsTimerRef.current);
        _rePagSettingsTimerRef.current = null;
      }
    };
  }, [readingSettings]);
  const isDoodleMode = useDoodleStore(state => state.isDoodleMode);
  const toggleDoodleMode = useDoodleStore(state => state.toggleDoodleMode);
  const setActivePage = useDoodleStore(state => state.setActivePage);
  const autoAdvance = usePreferencesStore(state => state.preferences?.tts?.autoAdvance ?? true);

  useReadingSession(bookId);

  // Book state
  const initialTargetIndex = (() => {
    const target = useReaderStore.getState().explicitResumeTarget;
    if (target && target.bookId === bookId && typeof target.chapterIndex === 'number') {
      return target.chapterIndex;
    }
    return 0;
  })();

  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [currentIndex, setCurrentIndex] = useState(initialTargetIndex);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchHighlight, setSearchHighlight] = useState<string | null>(null); // NEW: Store search term for highlighting

  // Desktop power-user features: Fullscreen, cursor auto-hide, and footnote popover
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [cursorHidden, setCursorHidden] = useState(false);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeFootnote, setActiveFootnote] = useState<{
    title: string;
    content: string;
    anchorRect: DOMRect;
    targetId: string | null;
  } | null>(null);

  // Auto-hide mouse cursor after 2.5s of inactivity when in Focus Mode or Fullscreen
  useEffect(() => {
    if (!isFocusMode && !isFullscreen) {
      setCursorHidden(false);
      if (cursorTimerRef.current) {
        clearTimeout(cursorTimerRef.current);
        cursorTimerRef.current = null;
      }
      return;
    }

    const resetCursorTimer = () => {
      setCursorHidden(false);
      if (cursorTimerRef.current) {
        clearTimeout(cursorTimerRef.current);
      }
      cursorTimerRef.current = setTimeout(() => {
        setCursorHidden(true);
      }, 2500);
    };

    resetCursorTimer();
    window.addEventListener('mousemove', resetCursorTimer, { passive: true });
    window.addEventListener('mousedown', resetCursorTimer, { passive: true });
    window.addEventListener('keydown', resetCursorTimer, { passive: true });

    return () => {
      window.removeEventListener('mousemove', resetCursorTimer);
      window.removeEventListener('mousedown', resetCursorTimer);
      window.removeEventListener('keydown', resetCursorTimer);
      if (cursorTimerRef.current) {
        clearTimeout(cursorTimerRef.current);
        cursorTimerRef.current = null;
      }
    };
  }, [isFocusMode, isFullscreen]);

  // Refs
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const pageFlipRef = useRef<PageFlipHandle>(null);
  const scrollPositionsRef = useRef<Map<number, number>>(new Map());
  /** Parallel per-chapter paragraph anchor (block index at viewport top). Kept
   *  separate so scrollPositionsRef's `Map<number, number>` shape (and every
   *  existing consumer of it) stays untouched. */
  const blockPositionsRef = useRef<Map<number, number>>(new Map());
  /** Keep the per-chapter scroll map bounded on long books. */
  const rememberScrollPosition = (index: number, ratio: number, blockIndex?: number): void => {
    const map = scrollPositionsRef.current;
    if (map.has(index)) map.delete(index);
    map.set(index, ratio);
    while (map.size > 100) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
      blockPositionsRef.current.delete(oldest);
    }
    if (blockIndex === undefined) return;
    if (blockIndex >= 0) blockPositionsRef.current.set(index, blockIndex);
    else blockPositionsRef.current.delete(index);
  };
  const currentIndexRef = useRef(initialTargetIndex);
  const metadataRef = useRef<BookMetadata | null>(null);
  const loadChapterRef = useRef<(index: number, highlightTerm?: string | null, initialScrollRatio?: number) => Promise<void>>(async () => { });
  const chapterRequestRef = useRef(0);
  const chapterLoadInFlightRef = useRef(false);
  const previousTwoPageViewRef = useRef(twoPageView);
  const previousDoodleChapterRef = useRef<number | null>(null);
  /** Guards the "Resuming reading" toast so it fires at most once per mount,
   *  even if the init useEffect re-runs due to unstable dep references. */
  const hasShownResumeToastRef = useRef(false);

  // Preloaded chapter content for page flip
  const [nextChapterContent, setNextChapterContent] = useState<string | null>(null);
  const [prevChapterContent, setPrevChapterContent] = useState<string | null>(null);

  // Active chapter bookmark state
  const [isCurrentChapterBookmarked, setIsCurrentChapterBookmarked] = useState(false);

  const checkBookmark = useCallback(async () => {
    if (!bookId) return;
    try {
      const annotations = await api.getAnnotations(bookId);
      const chapterLoc = `chapter_${currentIndexRef.current}`;
      const isBookmarked = annotations.some(
        (a) => a.annotationType === 'bookmark' && a.location === chapterLoc
      );
      setIsCurrentChapterBookmarked(isBookmarked);
    } catch {
      // Ignore
    }
  }, [bookId]);

  useEffect(() => {
    checkBookmark();
  }, [currentIndex, checkBookmark]);

  useEffect(() => {
    return onAnnotationsChanged(checkBookmark);
  }, [checkBookmark]);

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
          const blockIndex = getChapterBlockAtViewportTop(canvasRef.current, currentIndex);
          rememberScrollPosition(currentIndex, scrollRatio, blockIndex >= 0 ? blockIndex : undefined);
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
      const savedBlockIndex = blockPositionsRef.current.get(index);
      const location = scrollRatio > 0
        ? `chapter_${index}:scroll_${scrollRatio.toFixed(6)}${savedBlockIndex !== undefined ? `:b${savedBlockIndex}` : ''}`
        : `chapter_${index}`;
      const cfi = `epubcfi(/0/${index}!/scroll/${scrollRatio.toFixed(6)})`;

      try {
        await api.saveReadingProgress(bookId, location, progressPercent, undefined, undefined, cfi);
      } catch {
        // Silently ignore database errors
      }

      await waitForStableReaderLayout(canvasRef.current);
      if (requestToken !== chapterRequestRef.current) return;

      // Fonts can swap in after the first stability pass (late @font-face
      // loads — worst on resume in continuous flow). Re-check visible font
      // readiness before the FIRST ratio apply; short timeout, same bound as
      // waitForStableReaderLayout, so navigation never hangs.
      await waitForVisibleFonts();
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

        // Paragraph-anchor restore: after the ratio is applied, additionally
        // center the remembered block (index into getChapterBlockElements).
        // Bounded retries absorb late font swaps / late-mounting content; a
        // missing or out-of-range block silently falls back to the ratio scroll.
        if (!isPendingAnnotation && !termToHighlight && !isHoriz) {
          const requestedBlock = blockPositionsRef.current.get(index);
          if (requestedBlock !== undefined && requestedBlock >= 0) {
            void (async () => {
              for (let attempt = 0; attempt < 3; attempt += 1) {
                const canv = canvasRef.current;
                if (!canv || canv.clientHeight <= 0) return;
                const blocks = getChapterBlockElements(canv, index);
                const target = blocks[requestedBlock];
                if (target) {
                  const canvasRect = canv.getBoundingClientRect();
                  const elRect = target.getBoundingClientRect();
                  const delta = (elRect.top - canvasRect.top) - (canv.clientHeight / 2) + (elRect.height / 2);
                  canv.scrollBy({ top: Math.round(delta), behavior: 'instant' });
                  return;
                }
                await new Promise<void>((resolve) => requestAnimationFrame(() => window.setTimeout(resolve, 60)));
              }
            })();
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

  // Keep the latest theme in a ref so the callback ref below can apply it the
  // moment the reader container node attaches (initial mount, remount, or a
  // null→node transition caused by chapter loads / error state).
  const latestThemeRef = useRef(theme);
  useEffect(() => {
    latestThemeRef.current = theme;
  }, [theme]);

  const setReaderContainerNode = useCallback((node: HTMLDivElement | null) => {
    readerContainerRef.current = node;
    if (node) {
      applyReaderThemeToElement(node, latestThemeRef.current);
      syncReaderStatusBar(latestThemeRef.current);
    }
  }, []);

  // Apply on theme change only — no cleanup, so an apply can never strip the
  // theme while the container is temporarily detached (which left light
  // content while settings still reported e.g. 'black').
  useEffect(() => {
    const el = readerContainerRef.current;
    if (el) {
      applyReaderThemeToElement(el, theme);
      // Android: match the system-bar strip to the reading surface (paper
      // color) — PremiumEpubReader applies its theme directly (not via the
      // useReaderTheme hook), so the sync must be wired here explicitly.
      syncReaderStatusBar(theme);
    }
  }, [theme]);

  // Unmount-only cleanup.
  useEffect(() => () => {
    const el = readerContainerRef.current;
    if (el) removeReaderThemeFromElement(el);
    restoreAppStatusBar();
  }, []);

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

  // Auto-hide the top bar 2s after it appears (user request).
  const isTopBarVisible = useReaderUIStore(state => state.isTopBarVisible);
  const isSidebarOpen = useReaderUIStore(state => state.isSidebarOpen);
  const [isPointerOverTopBar, setIsPointerOverTopBar] = useState(false);

  // ReaderSettings keeps its open state locally inside ReaderTopBar, so detect
  // the mounted panel (desktop dropdown or mobile sheet) to keep the bar pinned
  // while the user is inside the settings dialog — on all platforms.
  const [isReaderSettingsOpen, setIsReaderSettingsOpen] = useState(false);
  useEffect(() => {
    const check = () => {
      const open = Boolean(document.querySelector('.premium-settings-panel'));
      setIsReaderSettingsOpen(prev => (prev === open ? prev : open));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Single shared schedule-hide helper — every trigger (visibility flip,
  // pointer leave, sidebar/settings close) routes through it.
  const topBarHideTimerRef = useRef<number | null>(null);
  const cancelTopBarHide = useCallback(() => {
    if (topBarHideTimerRef.current !== null) {
      clearTimeout(topBarHideTimerRef.current);
      topBarHideTimerRef.current = null;
    }
  }, []);
  const scheduleTopBarHide = useCallback(() => {
    cancelTopBarHide();
    topBarHideTimerRef.current = window.setTimeout(() => {
      topBarHideTimerRef.current = null;
      setTopBarVisible(false);
    }, 2000);
  }, [cancelTopBarHide, setTopBarVisible]);

  // Skip auto-hide while the sidebar, the settings dialog, or the pointer
  // (desktop hover over the top bar / its dropdowns) is active; re-arm 2s
  // after they clear.
  useEffect(() => {
    if (!isTopBarVisible || isSidebarOpen || isReaderSettingsOpen || isPointerOverTopBar) {
      cancelTopBarHide();
      return;
    }
    scheduleTopBarHide();
    return cancelTopBarHide;
  }, [isTopBarVisible, isSidebarOpen, isReaderSettingsOpen, isPointerOverTopBar, scheduleTopBarHide, cancelTopBarHide]);

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

  /**
   * Rebuild the paginated layout for the current chapter while preserving the
   * reader's position. Shared by the twoPageView toggle, the resize /
   * orientation listener (F1) and the layout-affecting settings handler (F2).
   *
   * Position is preserved by loadChapter itself: it snapshots the current
   * horizontal scroll ratio into scrollPositionsRef before re-rendering, then
   * re-applies that ratio once the new pagination has stabilized. No-op unless
   * a paginated (CSS-columns) layout is active; continuous flow already reflows
   * in place and needs no rebuild.
   */
  const rePaginatePreservingPosition = useCallback(() => {
    if (!hasLoadedChapterRef.current) return;
    if (continuousFlow) return;
    if (!isPaginated && !twoPageView) return;
    void loadChapterRef.current(currentIndexRef.current);
  }, [continuousFlow, isPaginated, twoPageView]);

  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);

  const flushProgressNow = useCallback(() => {
    const totalChapters = metadataRef.current?.total_chapters ?? 1;
    let chapterIndex = currentIndexRef.current;
    const canvas = canvasRef.current;
    let scrollRatio = scrollPositionsRef.current.get(chapterIndex) ?? 0;
    let blockIndex = -1;

    if (canvas) {
      const isPag = canvas.classList.contains('premium-reading-canvas--paginated') ||
                    canvas.classList.contains('premium-reading-canvas--two-page');
      if (isPag) {
        const { scrollLeft, scrollWidth, clientWidth } = canvas;
        scrollRatio = scrollWidth > clientWidth ? scrollLeft / (scrollWidth - clientWidth) : 0;
        rememberScrollPosition(chapterIndex, scrollRatio);
      } else {
        // Continuous/vertical flow: save by the chapter at the VIEWPORT TOP,
        // NOT the largest-visible-area chapter (currentIndexRef, driven by the
        // IntersectionObserver). Just after crossing a boundary the top of the
        // screen is already in chapter N while N-1 may still cover more pixels;
        // trusting the area-based index would save `chapter_{N-1}` at ratio ~1.0
        // and resume a chapter early. Find the loaded chapter element that
        // straddles scrollTop and compute the ratio against it.
        const scrollTop = canvas.scrollTop;
        const chapterEls = Array.from(
          canvas.querySelectorAll('[data-chapter-index]')
        ) as HTMLElement[];
        let activeEl: HTMLElement | null = null;
        for (const el of chapterEls) {
          if (el.offsetTop <= scrollTop && scrollTop < el.offsetTop + el.scrollHeight) {
            activeEl = el;
            break;
          }
        }
        // Fall back to the area-based active chapter's element when nothing
        // straddles the top (e.g. very short first chapter above scrollTop 0).
        if (!activeEl) {
          activeEl = canvas.querySelector(`[data-chapter-index="${chapterIndex}"]`) as HTMLElement;
        }
        if (activeEl) {
           const topIdx = parseInt(activeEl.getAttribute('data-chapter-index') || '', 10);
           if (!Number.isNaN(topIdx)) chapterIndex = topIdx;
           const distance = scrollTop - activeEl.offsetTop;
           scrollRatio = distance > 0 && activeEl.scrollHeight > 0 ? distance / activeEl.scrollHeight : 0;
           scrollRatio = Math.max(0, Math.min(1, scrollRatio));
        } else {
           const { scrollHeight, clientHeight } = canvas;
           scrollRatio = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;
        }
        // Vertical flow only: remember which block sits at the viewport top so
        // "continue reading" can re-center the exact paragraph on restore.
        // Horizontal (paged) layouts get no anchor — their scroll math is
        // scrollLeft-based and centering a block would break column alignment.
        blockIndex = getChapterBlockAtViewportTop(canvas, chapterIndex);
        rememberScrollPosition(chapterIndex, scrollRatio, blockIndex);
      }
    }

    const progressPercent = ((chapterIndex + scrollRatio) / totalChapters) * 100;
    const loc = scrollRatio > 0
      ? `chapter_${chapterIndex}:scroll_${scrollRatio.toFixed(6)}${blockIndex >= 0 ? `:b${blockIndex}` : ''}`
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

            if (!isFocusMode && !isTopBarShortcutOnly && !isPointerOverTopBar) {
              const uiState = useReaderUIStore.getState();
              if (!uiState.isTopBarVisible) {
                if (scrollTop > lastScrollTop + 60) {
                  setTopBarVisible(false);
                } else if (scrollTop < lastScrollTop - 30) {
                  setTopBarVisible(true);
                }
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

        const bookMetadata = await api.openBookRenderer(bookId, bookPath, 'epub');
        setMetadata(bookMetadata);

        // Load the TOC so the top bar can show the real chapter the user is in
        api.getBookToc(bookId).then(setToc).catch(() => setToc([]));

        // Restore chapter + scroll.
        // Priority:
        // 1) explicit one-shot target from resume prompt (exact intent)
        // 2) persisted DB progress
        // Skip all restore if user chose "Start from beginning".
        let startIndex = 0;
        let savedScrollRatio = 0;
        let savedBlockIndex: number | null = null;
        // Read from the live store — NOT from the closed-over React state. On
        // Android WebView the component can mount and this effect can fire before
        // Zustand has propagated the updated values to the component's reactive
        // closure, causing annotation jumps and resume targets to be silently
        // discarded. getState() always reflects the latest committed store value.
        const liveState = useReaderStore.getState();
        const skipRestore = liveState.startFromBeginning;

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
          // Also read explicitResumeTarget from live state for same reason.
          const liveTarget = liveState.explicitResumeTarget;
          const directTarget = liveTarget?.bookId === bookId ? liveTarget : null;

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
                  if (!progress.currentLocation) return { chapter: null as number | null, scroll: null as number | null, block: null as number | null };
                  // Legacy location format: "chapter_N" or "chapter_N:scroll_R";
                  // paragraph anchors are appended as ":b<blockIndex>" (absent
                  // in older saves — those fall back to ratio-only restore).
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

                  let block: number | null = null;
                  if (parts[2]?.startsWith('b')) {
                    const b = parseInt(parts[2].slice(1), 10);
                    if (!Number.isNaN(b) && b >= 0) block = b;
                  }

                  return { chapter, scroll, block };
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
                savedBlockIndex = fallback.block;
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
        if (savedBlockIndex !== null) {
          blockPositionsRef.current.set(startIndex, savedBlockIndex);
        }

        setCurrentIndex(startIndex);
        currentIndexRef.current = startIndex;

        await loadChapterRef.current(startIndex, null, savedScrollRatio);
        setIsLoading(false);

        if (!skipRestore && (startIndex > 0 || savedScrollRatio > 0) && !hasShownResumeToastRef.current) {
          hasShownResumeToastRef.current = true;
          const pct = bookMetadata.total_chapters > 0
            ? Math.round((startIndex / bookMetadata.total_chapters) * 100)
            : 0;
          useToastStore.getState().addToast({
            id: 'resume-reading',
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
      // Drop the per-chapter scroll-ratio map when the reader closes or the
      // book changes — indices from the previous book must not restore wrong
      // positions in the next one (the 100-entry cap stays intact).
      scrollPositionsRef.current = new Map<number, number>();
      blockPositionsRef.current = new Map<number, number>();
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
    rePaginatePreservingPosition();
  }, [twoPageView, rePaginatePreservingPosition]);

  // F1 — resize / orientation: pagination is laid out for the current width,
  // so rotating the phone or resizing the window leaves pages built for the old
  // width (cut / overlapping until chapter reload). Rebuild on demand —
  // rAF-batched with a short debounce so a drag-resize storm only fires once it
  // settles. The paginated/two-page guard lives in the shared helper.
  useEffect(() => {
    let debounceId: number | null = null;
    let rafId = 0;

    const schedule = () => {
      if (debounceId !== null) window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        debounceId = null;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          rePaginatePreservingPosition();
        });
      }, 100);
    };
    const orientation = window.matchMedia('(orientation: portrait)');
    window.addEventListener('resize', schedule);
    orientation.addEventListener('change', schedule);
    return () => {
      window.removeEventListener('resize', schedule);
      orientation.removeEventListener('change', schedule);
      if (debounceId !== null) window.clearTimeout(debounceId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [rePaginatePreservingPosition]);

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

  // Dedicated reactive listener to jump directly to the exact line of any clicked
  // annotation. Flow: resolve the target chapter BEFORE scrolling — if it differs
  // from the loaded chapter, switch chapters first and let this effect re-run after
  // currentIndex changes (React commits → effects run), then apply highlights and
  // scroll in a single requestAnimationFrame (one layout pass, no busy retry loop).
  const pendingAnnotationId = useReaderUIStore((state) => state.pendingAnnotationId);
  useEffect(() => {
    if (!pendingAnnotationId) return;
    // Continuous mode renders ContinuousEpubView (and shares contentContainerRef) —
    // it owns pending-annotation scrolling there; acting here would double-run.
    if (continuousFlow) return;
    // Chapter (re)load in progress: the container still shows the old chapter.
    // Return without touching pending — the effect re-runs when isLoading flips.
    if (isLoading) return;

    let cancelled = false;
    let redirects = 0;

    const tryScroll = async () => {
      if (cancelled) return;
      const container = contentContainerRef.current;
      if (!container) return; // not rendered yet — effect re-runs via deps below

      // Resolve the annotation's chapter from its location BEFORE scrolling.
      let targetIndex: number | null = null;
      let chapterAnnotations: Annotation[] = [];
      try {
        const annotations = await api.getAnnotations(bookId);
        if (cancelled) return;
        const target = annotations.find((a) => a.id === pendingAnnotationId);
        const chapterMatch = target?.location?.match(/^chapter_(\d+)/);
        if (chapterMatch) targetIndex = parseInt(chapterMatch[1], 10);
        const chapterLocation = `chapter_${currentIndexRef.current}`;
        chapterAnnotations = annotations.filter(
          (a) =>
            a.location === chapterLocation ||
            a.location.startsWith(`${chapterLocation}:`)
        );
      } catch {
        // Non-critical — fall through and scroll anyway.
      }

      // Cross-chapter: load the target chapter FIRST, wait for the render, and
      // let the follow-up effect run (currentIndex dep) finish the scroll.
      if (targetIndex !== null && targetIndex !== currentIndexRef.current) {
        const inBounds =
          targetIndex >= 0 &&
          (!metadataRef.current || targetIndex < metadataRef.current.total_chapters);
        if (!inBounds) {
          useReaderUIStore.getState().setPendingAnnotationId(null);
          return;
        }
        await loadChapterRef.current(targetIndex);
        if (cancelled) return;
        if (currentIndexRef.current !== targetIndex && redirects < 3) {
          // Load was deferred (another chapter load in flight) or still settling:
          // bounded re-check, not a busy loop; give up after 3 redirects.
          redirects++;
          setTimeout(tryScroll, 120);
        } else if (currentIndexRef.current !== targetIndex) {
          useReaderUIStore.getState().setPendingAnnotationId(null);
        }
        return;
      }

      // Same chapter: apply highlights and scroll in ONE rAF (single layout
      // pass), then ONE rAF-delayed retry for highlights-DOM timing, then give
      // up and clear pending exactly once.
      requestAnimationFrame(() => {
        if (cancelled) return;
        const c = contentContainerRef.current;
        if (!c) return;
        applyHighlightsToDOM(c, chapterAnnotations);
        if (scrollToAnnotationMark(c, pendingAnnotationId)) {
          useReaderUIStore.getState().setPendingAnnotationId(null);
          return;
        }
        requestAnimationFrame(() => {
          if (cancelled) return;
          if (scrollToAnnotationMark(contentContainerRef.current, pendingAnnotationId)) {
            useReaderUIStore.getState().setPendingAnnotationId(null);
          } else {
            // Give up — mark never materialised.
            useReaderUIStore.getState().setPendingAnnotationId(null);
          }
        });
      });
    };

    const timerId = setTimeout(tryScroll, 40);
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [pendingAnnotationId, currentIndex, isLoading, continuousFlow, bookId]);

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
      } else if (pageFlipEnabled && pageFlipRef.current) {
        const flipped = pageFlipRef.current.flipForward();
        if (!flipped) {
          nextChapter();
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
  }, [nextChapter, isHorizontalPaging, pageFlipEnabled, animationStyle, isFocusMode, isTopBarShortcutOnly]);

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
      } else if (pageFlipEnabled && pageFlipRef.current) {
        const flipped = pageFlipRef.current.flipBackward();
        if (!flipped) {
          prevChapter(true);
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
  }, [prevChapter, isHorizontalPaging, pageFlipEnabled, animationStyle, isFocusMode, isTopBarShortcutOnly]);

  // Mouse wheel navigation, Ctrl+Wheel zoom, trackpad flip & Scroll Up/Down topbar visibility
  const lastWheelTimeRef = useRef(0);
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // Ctrl/Cmd + Mouse Wheel: dynamic font scaling with 80ms throttle
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelTimeRef.current > 80) {
        lastWheelTimeRef.current = now;
        if (e.deltaY < 0) {
          useReadingSettings.getState().increaseFontSize();
        } else if (e.deltaY > 0) {
          useReadingSettings.getState().decreaseFontSize();
        }
      }
      return;
    }

    // Detect vertical scroll direction to show/hide top bar
    if (e.deltaY < -10) {
      // Scroll Up -> Show top bar!
      setTopBarVisible(true);
    } else if (e.deltaY > 20) {
      // Scroll Down -> Hide top bar
      if (!isFocusMode && !isTopBarShortcutOnly) {
        setTopBarVisible(false);
      }
    }

    // If a modal, translation, define, or selection popup is active, disable wheel page navigation
    if (isSelectionOrNoteActive() || isTouchOnSelectionOrModal(e.target as Element)) {
      return;
    }

    // Page navigation via wheel / trackpad
    // In horizontal paging: wheel deltaY or deltaX turns pages
    // In page-flip mode: trackpad horizontal swipe (deltaX) turns pages
    const canWheelPage = isHorizontalPaging || (pageFlipEnabled && Math.abs(e.deltaX) > Math.abs(e.deltaY));
    if (!canWheelPage) {
      return;
    }

    const delta = isHorizontalPaging
      ? (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX)
      : e.deltaX;

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
  }, [isHorizontalPaging, pageFlipEnabled, nextPage, prevPage, isFocusMode, isTopBarShortcutOnly, setTopBarVisible]);

  // Click zone handling in simple mode: left 25% prev chapter, right 25% next chapter, center 50% toggle top bar
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (Date.now() - lastTouchNavigationRef.current < 500) return;
    
    // If a popup (Translate, Define, Note, Dialog) or text selection is active, disable page navigation!
    if (isSelectionOrNoteActive()) {
      return;
    }

    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      return;
    }
    const target = e.target as HTMLElement;
    if (isTouchOnSelectionOrModal(target) || target.closest('button, a, input, select, textarea, [role="button"], .premium-nav-arrow, mark.epub-highlight, mark.pdf-highlight, [data-note-content], [data-annotation-id], .reader-annotation-tooltip, .translation-popup, .text-selection-toolbar')) {
      return;
    }

    const clickX = e.clientX || (e.nativeEvent as any)?.clientX || (e.nativeEvent as any)?.changedTouches?.[0]?.clientX || 0;
    const width = window.innerWidth;
    const clickRatio = width > 0 ? clickX / width : 0.5;

    // Edge taps turn PAGES in explicit horizontal-paging mode or page-flip mode
    const canPageTurn = isHorizontalPaging || pageFlipEnabled;
    if (canPageTurn && clickRatio < 0.25) {
      lastTouchNavigationRef.current = Date.now();
      triggerHaptic(10);
      prevPage();
      return;
    }
    if (canPageTurn && clickRatio > 0.75) {
      lastTouchNavigationRef.current = Date.now();
      triggerHaptic(10);
      nextPage();
      return;
    }

    // Any non-paging tap toggles the top bar
    if (!isFocusMode && !isTopBarShortcutOnly) {
      setTopBarVisible(!useReaderUIStore.getState().isTopBarVisible);
    }
  }, [prevPage, nextPage, isHorizontalPaging, pageFlipEnabled, isFocusMode, isTopBarShortcutOnly, setTopBarVisible]);

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

  const scrollToTop = useCallback(() => {
    if (canvasRef.current) {
      if (isHorizontalPaging) {
        canvasRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        canvasRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [isHorizontalPaging]);

  const scrollToBottom = useCallback(() => {
    if (canvasRef.current) {
      if (isHorizontalPaging) {
        canvasRef.current.scrollTo({ left: canvasRef.current.scrollWidth, behavior: 'smooth' });
      } else {
        canvasRef.current.scrollTo({ top: canvasRef.current.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [isHorizontalPaging]);

  const handleToggleBookmark = useCallback(async () => {
    try {
      const chapterLoc = `chapter_${currentIndexRef.current}`;
      const annotations = await api.getAnnotations(bookId);
      const existing = annotations.find(
        (a) => a.annotationType === 'bookmark' && a.location === chapterLoc
      );
      if (existing?.id) {
        await api.deleteAnnotation(existing.id);
        setIsCurrentChapterBookmarked(false);
        notifyAnnotationsChanged();
        useToastStore.getState().addToast({
          title: 'Bookmark removed',
          variant: 'info',
        });
      } else {
        const currentChapterTitle =
          toc[currentIndexRef.current]?.label ||
          (metadata ? `Chapter ${currentIndexRef.current + 1} of ${metadata.total_chapters}` : `Chapter ${currentIndexRef.current + 1}`);
        await api.createAnnotation(
          bookId,
          'bookmark',
          chapterLoc,
          undefined,
          undefined,
          undefined,
          '#e11d48',
          undefined,
          currentChapterTitle
        );
        setIsCurrentChapterBookmarked(true);
        notifyAnnotationsChanged();
        useToastStore.getState().addToast({
          title: 'Bookmark added',
          variant: 'success',
        });
      }
    } catch (err) {
      logger.error('Failed to toggle bookmark:', err);
    }
  }, [bookId, metadata, toc]);

  // Keyboard shortcuts
  usePremiumReaderKeyboard({
    onPrevChapter: () => prevChapter(true),
    onNextChapter: () => nextChapter(),
    onPrevPage: prevPage,
    onNextPage: nextPage,
    onScrollUp: scrollLineUp,
    onScrollDown: scrollLineDown,
    onScrollTop: scrollToTop,
    onScrollBottom: scrollToBottom,
    onToggleFullscreen: toggleFullscreen,
    onToggleBookmark: handleToggleBookmark,
    isPaginatedOrTwoPage: isHorizontalPaging,
    pageFlipEnabled: pageFlipEnabled && !isHorizontalPaging,
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
  // TOUCH GESTURES (SWIPE, DOUBLE-TAP & SINGLE TAP)
  // ────────────────────────────────────────────────────────────
  const touchStartRef = useRef<{ x: number, y: number, time: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as Element;
    if (isSelectionOrNoteActive() || isTouchOnSelectionOrModal(target)) {
      touchStartRef.current = null;
      return;
    }
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const target = e.target as Element;
    if (isSelectionOrNoteActive() || isTouchOnSelectionOrModal(target) || isDoodleMode) {
      touchStartRef.current = null;
      return;
    }
    if (!touchStartRef.current) return;
    const touchStart = touchStartRef.current;
    touchStartRef.current = null;
    
    if (e.changedTouches.length !== 1) return;
    const touchEnd = e.changedTouches[0];

    const dx = touchEnd.clientX - touchStart.x;
    const dy = touchEnd.clientY - touchStart.y;
    const dt = Date.now() - touchStart.time;

    // Vertical Scroll-Up gesture (swipe down) -> Show Top Bar
    if (dt < 500 && Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      if (dy > 25) {
        // Scrolled UP -> Show top bar
        setTopBarVisible(true);
      } else if (dy < -35) {
        // Scrolled DOWN -> Hide top bar
        if (!isFocusMode && !isTopBarShortcutOnly) {
          setTopBarVisible(false);
        }
      }
    }

    // Fast horizontal swipe (< 450ms, |dx| > 35)
    if (dt < 450 && Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      lastTouchNavigationRef.current = Date.now();
      triggerHaptic(12);
      if (dx < 0) {
        nextPage();
      } else {
        prevPage();
      }
      return;
    }

    // Double Tap detection (< 300ms apart) -> Toggle top bar
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;
    lastTapTimeRef.current = now;

    if (dt < 300 && Math.abs(dx) < 20 && Math.abs(dy) < 20 && timeSinceLastTap < 320 && timeSinceLastTap > 30) {
      lastTouchNavigationRef.current = now;
      triggerHaptic(15);
      const uiStore = useReaderUIStore.getState();
      if (uiStore.isSidebarOpen) {
        uiStore.closeSidebar();
      } else {
        setTopBarVisible(!uiStore.isTopBarVisible);
      }
      return;
    }

    // Single Tap (< 350ms, |dx| < 20, |dy| < 20): edge taps turn PAGES in
    // explicit horizontal-paging mode or page-flip mode — in vertical scroll mode
    // they don't jump, so any tap toggles the top bar.
    if (dt < 350 && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      const windowWidth = window.innerWidth;
      const tapX = touchEnd.clientX;
      const tapRatio = windowWidth > 0 ? tapX / windowWidth : 0.5;

      const canPageTurn = isHorizontalPaging || pageFlipEnabled;
      if (canPageTurn && tapRatio < 0.25) {
        lastTouchNavigationRef.current = Date.now();
        triggerHaptic(10);
        prevPage();
      } else if (canPageTurn && tapRatio > 0.75) {
        lastTouchNavigationRef.current = Date.now();
        triggerHaptic(10);
        nextPage();
      } else {
        // Toggle top bar
        triggerHaptic(8);
        const uiStore = useReaderUIStore.getState();
        if (uiStore.isSidebarOpen) {
          uiStore.closeSidebar();
        } else {
          setTopBarVisible(!uiStore.isTopBarVisible);
        }
      }
    }
  }, [isDoodleMode, nextPage, prevPage, isHorizontalPaging, pageFlipEnabled, isFocusMode, isTopBarShortcutOnly, setTopBarVisible]);

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────

  // ────────────────────────────────────────────────────────────
  // HOLD-TO-AUTO-SCROLL (Android) — press and hold the reading
  // surface to auto-scroll; release to stop. Native long-press text
  // selection cancels it (checked per frame), and the existing
  // tap / double-tap / swipe logic is untouched.
  // ────────────────────────────────────────────────────────────
  const HOLD_AUTO_SCROLL_MS = 550;
  const HOLD_MOVE_TOLERANCE_PX = 14;
  // Hold-to-auto-scroll speed curve: starts fast and accelerates while held.
  const HOLD_AUTO_SCROLL_START_PX_PER_S = 150;
  const HOLD_AUTO_SCROLL_RAMP_PX_PER_S2 = 15; // +15 px/s per second held
  const HOLD_AUTO_SCROLL_MAX_PX_PER_S = 300;
  // Paginated advance interval: 1600ms initially, accelerating to 900ms over 10s held.
  const PAGINATED_AUTO_ADVANCE_START_MS = 1600;
  const PAGINATED_AUTO_ADVANCE_MIN_MS = 900;

  const nextPageRef = useRef<() => void>(() => { });
  useEffect(() => { nextPageRef.current = nextPage; }, [nextPage]);

  const holdStateRef = useRef<{
    timer: number | null;
    raf: number | null;
    lastTs: number;
    startTs: number;
    pageAccMs: number;
    pointer: { x: number; y: number } | null;
  }>({ timer: null, raf: null, lastTs: 0, startTs: 0, pageAccMs: 0, pointer: null });
  const autoScrollActiveRef = useRef(false);

  const stopAutoScroll = useCallback(() => {
    const h = holdStateRef.current;
    if (h.timer != null) { clearTimeout(h.timer); h.timer = null; }
    if (h.raf != null) { cancelAnimationFrame(h.raf); h.raf = null; }
    h.pointer = null;
    if (autoScrollActiveRef.current) {
      autoScrollActiveRef.current = false;
      triggerHaptic(10);
    }
  }, []);

  const beginAutoScroll = useCallback(() => {
    if (autoScrollActiveRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    autoScrollActiveRef.current = true;
    triggerHaptic(14);

    const isPaginatedCanvas =
      canvas.classList.contains('premium-reading-canvas--paginated') ||
      canvas.classList.contains('premium-reading-canvas--two-page');

    const h = holdStateRef.current;
    h.lastTs = performance.now();
    h.startTs = h.lastTs;
    h.pageAccMs = 0;

    // Match the previous on-hold feel: the first paginated advance is immediate;
    // afterwards the single rAF loop below re-advances via an accumulator.
    if (isPaginatedCanvas) {
      nextPageRef.current();
    }

    const step = (ts: number) => {
      const hs = holdStateRef.current;
      if (!autoScrollActiveRef.current || hs.raf == null) return;
      const dt = Math.min(ts - hs.lastTs, 100);
      hs.lastTs = ts;
      // The OS long-press text selection cancels the scroll.
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        stopAutoScroll();
        return;
      }
      const canvasEl = canvasRef.current;
      if (!canvasEl) {
        stopAutoScroll();
        return;
      }

      const heldSeconds = (ts - hs.startTs) / 1000;

      if (isPaginatedCanvas) {
        // Accelerating page-advance interval: 1600ms → 900ms over 10s held.
        hs.pageAccMs += dt;
        const interval = Math.max(
          PAGINATED_AUTO_ADVANCE_MIN_MS,
          PAGINATED_AUTO_ADVANCE_START_MS -
            (PAGINATED_AUTO_ADVANCE_START_MS - PAGINATED_AUTO_ADVANCE_MIN_MS) *
              Math.min(heldSeconds / 10, 1),
        );
        if (hs.pageAccMs >= interval) {
          hs.pageAccMs = 0;
          nextPageRef.current();
        }
      } else {
        // Accelerating continuous scroll: 150 px/s, +15 px/s per second held, cap 300 px/s.
        const speed = Math.min(
          HOLD_AUTO_SCROLL_START_PX_PER_S + HOLD_AUTO_SCROLL_RAMP_PX_PER_S2 * heldSeconds,
          HOLD_AUTO_SCROLL_MAX_PX_PER_S,
        );
        canvasEl.scrollTop += (speed * dt) / 1000;
        const maxScroll = canvasEl.scrollHeight - canvasEl.clientHeight;
        if (maxScroll <= 0 || canvasEl.scrollTop >= maxScroll - 2) {
          stopAutoScroll();
          return;
        }
      }
      hs.raf = requestAnimationFrame(step);
    };
    h.raf = requestAnimationFrame(step);
  }, [stopAutoScroll]);

  const handleHoldTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isAndroid || isDoodleMode) return;
    if (isSelectionOrNoteActive() || isTouchOnSelectionOrModal(e.target as Element)) return;
    if (e.touches.length !== 1) return;
    stopAutoScroll();
    const t = e.touches[0];
    const h = holdStateRef.current;
    h.pointer = { x: t.clientX, y: t.clientY };
    h.timer = window.setTimeout(() => {
      h.timer = null;
      beginAutoScroll();
    }, HOLD_AUTO_SCROLL_MS);
  }, [beginAutoScroll, stopAutoScroll, isDoodleMode]);

  const handleHoldTouchMove = useCallback((e: React.TouchEvent) => {
    const h = holdStateRef.current;
    if (h.timer == null || !h.pointer) return;
    if (autoScrollActiveRef.current) return; // already scrolling — ignore drift
    if (e.touches.length !== 1) {
      stopAutoScroll();
      return;
    }
    const t = e.touches[0];
    const dx = t.clientX - h.pointer.x;
    const dy = t.clientY - h.pointer.y;
    if (Math.sqrt(dx * dx + dy * dy) > HOLD_MOVE_TOLERANCE_PX) {
      if (h.timer != null) { clearTimeout(h.timer); h.timer = null; }
      h.pointer = null;
    }
  }, [stopAutoScroll]);

  const handleHoldTouchEnd = useCallback((_e: React.TouchEvent) => { stopAutoScroll(); }, [stopAutoScroll]);
  const handleHoldTouchCancel = useCallback((_e: React.TouchEvent) => { stopAutoScroll(); }, [stopAutoScroll]);

  useEffect(() => () => stopAutoScroll(), [stopAutoScroll]);

  const handleContainerDoubleClick = useCallback((e: React.MouseEvent) => {
    if (isDoodleMode || isSelectionOrNoteActive()) return;
    
    const target = e.target as Element;
    if (e.defaultPrevented || !target || typeof target.closest !== 'function') return;
    
    if (isTouchOnSelectionOrModal(target) || target.closest('a') || target.closest('button') || target.closest('.premium-top-bar') || target.closest('.premium-sidebar') || target.closest('.text-selection-toolbar')) {
      return;
    }

    triggerHaptic(15);
    const uiStore = useReaderUIStore.getState();
    if (uiStore.isSidebarOpen) {
      uiStore.closeSidebar();
    } else {
      setTopBarVisible(!uiStore.isTopBarVisible);
    }
  }, [isDoodleMode, setTopBarVisible]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (isDoodleMode || isSelectionOrNoteActive()) return;
    const target = e.target as Element;
    if (e.defaultPrevented || !target || typeof target.closest !== 'function') return;

    // Check for footnote link clicks
    const anchor = target.closest('a');
    if (anchor) {
      const href = anchor.getAttribute('href') || '';
      const epubType = anchor.getAttribute('epub:type') || '';
      const role = anchor.getAttribute('role') || '';
      const isFootnote =
        href.includes('#') ||
        epubType.includes('noteref') ||
        role.includes('doc-noteref');

      if (isFootnote && href.includes('#')) {
        const targetId = href.split('#')[1];
        if (targetId) {
          const targetEl = contentContainerRef.current?.querySelector(`#${CSS.escape(targetId)}`);
          if (targetEl) {
            e.preventDefault();
            e.stopPropagation();
            setActiveFootnote({
              title: anchor.textContent?.trim() || 'Footnote',
              content: sanitizeChapterHtml(targetEl.innerHTML),
              anchorRect: anchor.getBoundingClientRect(),
              targetId,
            });
            return;
          }
        }
      }
      return;
    }

    if (isTouchOnSelectionOrModal(target) || target.closest('button') || target.closest('.premium-top-bar') || target.closest('.premium-sidebar') || target.closest('.text-selection-toolbar') || target.closest('.doodle-toolbar')) {
      return;
    }

    if (Date.now() - lastTouchNavigationRef.current < 400) return;
    if (window.getSelection()?.toString().trim()) return;

    // Single tap on canvas toggles top bar / sidebar UI cleanly without accidental page jumps
    triggerHaptic(10);
    const uiStore = useReaderUIStore.getState();
    if (uiStore.isSidebarOpen) {
      uiStore.closeSidebar();
    } else {
      setTopBarVisible(!uiStore.isTopBarVisible);
    }
  }, [isDoodleMode, setTopBarVisible]);

  // Context menu state & handlers for right-click in reader
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number; selectedText?: string } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Desktop only — Android uses the mobile TextSelectionToolbar
    if (isAndroid || isDoodleMode) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, .premium-sidebar, .annotation-tooltip, .text-selection-toolbar, .doodle-toolbar')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    const selection = window.getSelection()?.toString().trim();
    setContextMenuPos({
      x: e.clientX,
      y: e.clientY,
      selectedText: selection || undefined,
    });
  }, [isDoodleMode]);

  const handleCopySelection = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      useToastStore.getState().addToast({
        title: 'Copied to clipboard',
        variant: 'success',
        duration: 2000,
      });
    } catch {
      useToastStore.getState().addToast({
        title: 'Failed to copy',
        variant: 'error',
        duration: 2000,
      });
    }
  }, []);

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div ref={setReaderContainerNode} className="premium-reader premium-reader--error">
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
    return null;
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
      ref={setReaderContainerNode} 
      className={`premium-reader ${isFocusMode ? 'premium-reader--focus-mode' : ''} ${cursorHidden ? 'premium-reader--cursor-hidden' : ''}`} 
      onClick={handleContainerClick} 
      onDoubleClick={handleContainerDoubleClick}
      onContextMenu={handleContextMenu}
      onTouchStart={(e) => { handleTouchStart(e); handleHoldTouchStart(e); }}
      onTouchEnd={(e) => { handleTouchEnd(e); handleHoldTouchEnd(e); }}
      onTouchMove={handleHoldTouchMove}
      onTouchCancel={handleHoldTouchCancel}
    >
      {/* Corner Bookmark Ribbon */}
      <AnimatePresence>
        {isCurrentChapterBookmarked && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="absolute top-0 right-10 sm:right-14 z-20 pointer-events-none drop-shadow-md select-none"
            aria-hidden="true"
          >
            <div
              className="w-6 h-9 sm:w-7 sm:h-10 flex items-center justify-center pt-1"
              style={{
                backgroundColor: '#e11d48',
                clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)',
              }}
            >
              <Bookmark size={13} className="text-white" fill="white" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auto-hide Top Bar — hover keeps it pinned, leaving re-arms the 2s timer */}
      <div
        onPointerEnter={() => setIsPointerOverTopBar(true)}
        onPointerLeave={() => setIsPointerOverTopBar(false)}
      >
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

            <ReaderTooltip content={isCurrentChapterBookmarked ? "Remove bookmark" : "Bookmark this chapter"}>
              <button
                type="button"
                onClick={handleToggleBookmark}
                className={`premium-control-button ${isCurrentChapterBookmarked ? 'premium-control-button--active !text-rose-500' : ''}`}
                aria-label={isCurrentChapterBookmarked ? "Remove bookmark" : "Bookmark chapter"}
              >
                <Bookmark
                  className="premium-control-icon"
                  fill={isCurrentChapterBookmarked ? "currentColor" : "none"}
                />
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
      </div>

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
          onToggleUI={() => {
            // No-arg toggle: ContinuousEpubView calls onToggleUI() with no event,
            // so it must NOT be handleContainerClick (which reads e.target and
            // would throw on undefined, leaving the top bar stuck hidden).
            const ui = useReaderUIStore.getState();
            if (ui.isSidebarOpen) {
              ui.closeSidebar();
            } else {
              setTopBarVisible(!ui.isTopBarVisible);
            }
          }}
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
              if (handleExternalLinkClick(e.nativeEvent, contentContainerRef.current)) {
                return;
              }

              // Footnote & endnote preview popover on internal note links
              const target = e.target as Element | null;
              const anchor = target?.closest('a');
              if (anchor && contentContainerRef.current?.contains(anchor)) {
                const href = anchor.getAttribute('href') || '';
                const epubType = anchor.getAttribute('epub:type') || '';
                const role = anchor.getAttribute('role') || '';
                const isFootnote =
                  href.includes('#') ||
                  epubType.includes('noteref') ||
                  role.includes('doc-noteref');

                if (isFootnote && href.includes('#')) {
                  const targetId = href.split('#')[1];
                  if (targetId) {
                    const targetEl = contentContainerRef.current?.querySelector(`#${CSS.escape(targetId)}`);
                    if (targetEl) {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveFootnote({
                        title: anchor.textContent?.trim() || 'Footnote',
                        content: sanitizeChapterHtml(targetEl.innerHTML),
                        anchorRect: anchor.getBoundingClientRect(),
                        targetId,
                      });
                      return;
                    }
                  }
                }
              }
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

      {/* Right-click Context Menu (Desktop only) */}
      {!isAndroid && contextMenuPos && (
        <ReaderContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          selectedText={contextMenuPos.selectedText}
          isFocusMode={isFocusMode}
          isFullscreen={isFullscreen}
          isBookmarked={isCurrentChapterBookmarked}
          onClose={() => setContextMenuPos(null)}
          onSearchInBook={(query) => {
            if (query) {
              setPendingSearchQuery(query);
            }
            setSidebarTab('search');
          }}
          onOpenToc={() => setSidebarTab('toc')}
          onOpenBookmarks={() => setSidebarTab('bookmarks')}
          onOpenHighlights={() => setSidebarTab('highlights')}
          onToggleBookmark={handleToggleBookmark}
          onToggleFocusMode={toggleFocusMode}
          onToggleFullscreen={toggleFullscreen}
          onNextPage={nextPage}
          onPrevPage={prevPage}
          onCopy={handleCopySelection}
          onOpenSettings={() => setTopBarVisible(true)}
        />
      )}



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
        onChapterEnd={() => {
          const lastIndex = (metadata?.total_chapters ?? 1) - 1;
          if (autoAdvance && currentIndex < lastIndex) {
            loadChapter(currentIndex + 1);
          }
        }}
        contentKey={currentIndex}
      />

      {/* Footnote & Endnote Floating Popover */}
      {activeFootnote && (
        <FootnotePopover
          title={activeFootnote.title}
          content={activeFootnote.content}
          anchorRect={activeFootnote.anchorRect}
          onClose={() => setActiveFootnote(null)}
          onJump={activeFootnote.targetId ? () => {
            const targetEl = contentContainerRef.current?.querySelector(`#${CSS.escape(activeFootnote.targetId!)}`);
            if (targetEl) {
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          } : undefined}
        />
      )}
    </div>
  );
}
