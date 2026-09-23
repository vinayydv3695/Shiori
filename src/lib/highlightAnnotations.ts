import type { Annotation } from './tauri';

/**
 * Apply annotation highlights to a DOM container by matching selectedText
 * in text nodes and wrapping matches in <mark> elements.
 *
 * Operates directly on the live DOM — call after React has committed
 * the chapter content via dangerouslySetInnerHTML.
 */
export function applyHighlightsToDOM(
  container: HTMLElement,
  annotations: Annotation[]
): void {
  // First, remove any existing annotation highlights
  clearHighlightsFromDOM(container);

  // Filter to only highlights/notes that have selectedText
  const highlightAnnotations = annotations.filter(
    (a) =>
      (a.annotationType === 'highlight' || a.annotationType === 'note') &&
      a.selectedText &&
      a.selectedText.trim().length > 0
  );

  if (highlightAnnotations.length === 0) return;

  // Apply each annotation's highlight
  for (const annotation of highlightAnnotations) {
    highlightTextInContainer(container, annotation);
  }
}

/**
 * Remove all annotation <mark> elements, restoring original text nodes.
 */
export function clearHighlightsFromDOM(container: HTMLElement): void {
  const marks = container.querySelectorAll('mark.epub-highlight, mark.pdf-highlight');
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    // Replace the mark with its text content
    const textNode = document.createTextNode(mark.textContent || '');
    parent.replaceChild(textNode, mark);
    // Normalize to merge adjacent text nodes
    parent.normalize();
  });
}

/**
 * Normalize Unicode characters (quotes, dashes, non-breaking spaces, zero-width chars)
 * for fuzzy, robust text matching across diverse EPUB engines.
 */
function normalizeForMatch(str: string): string {
  return str
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035`']/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036«»"]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000\t\n\r]+/g, ' ')
    .replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '');
}

/**
 * Find annotation.selectedText within the container's text nodes
 * and wrap it in a <mark> element.
 */
interface TextRangeAnchor {
  version: 1;
  chapterIndex?: string | null;
  start: number;
  end: number;
}

function parseTextRangeAnchor(value?: string): TextRangeAnchor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<TextRangeAnchor>;
    if (
      parsed.version !== 1 ||
      typeof parsed.start !== 'number' ||
      typeof parsed.end !== 'number' ||
      !Number.isFinite(parsed.start) ||
      !Number.isFinite(parsed.end) ||
      parsed.start < 0 ||
      parsed.end <= parsed.start
    ) {
      return null;
    }
    return parsed as TextRangeAnchor;
  } catch {
    // Older rows contain EPUB CFI or no range; use text fallback below.
    return null;
  }
}

/** Apply a chapter-local text offset anchor. Returns false for old/invalid anchors. */
function highlightTextByOffset(
  container: HTMLElement,
  annotation: Annotation,
  anchor: TextRangeAnchor,
): boolean {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const nodes: { node: Text; start: number; end: number }[] = [];
  let fullLength = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node.parentElement?.tagName === 'SCRIPT' || node.parentElement?.tagName === 'STYLE') continue;
    const length = node.textContent?.length ?? 0;
    nodes.push({ node, start: fullLength, end: fullLength + length });
    fullLength += length;
  }

  const start = Math.max(0, Math.min(fullLength, Math.floor(anchor.start)));
  const end = Math.max(start, Math.min(fullLength, Math.floor(anchor.end)));
  if (end <= start) return false;

  let wrapped = 0;
  const affected = nodes.filter((entry) => entry.start < end && entry.end > start);
  for (let i = affected.length - 1; i >= 0; i -= 1) {
    const entry = affected[i];
    const localStart = Math.max(0, start - entry.start);
    const localEnd = Math.min(entry.end - entry.start, end - entry.start);
    if (localEnd <= localStart) continue;
    try {
      const range = document.createRange();
      range.setStart(entry.node, localStart);
      range.setEnd(entry.node, localEnd);
      range.surroundContents(createHighlightMark(annotation));
      wrapped += 1;
    } catch {
      // Fall back to selected-text matching if DOM changed since save.
      return false;
    }
  }
  return wrapped > 0;
}

function highlightTextInContainer(
  container: HTMLElement,
  annotation: Annotation
): void {
  const anchor = parseTextRangeAnchor(annotation.cfiRange);
  if (anchor && highlightTextByOffset(container, annotation, anchor)) return;

  const searchText = annotation.selectedText?.trim();
  if (!searchText) return;

  // Collect all text nodes in document order
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  );

  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    // Skip empty or whitespace-only nodes from script/style
    if (node.parentElement?.tagName === 'SCRIPT' || node.parentElement?.tagName === 'STYLE') {
      continue;
    }
    textNodes.push(node);
  }

  const normSearch = normalizeForMatch(searchText);

  // Strategy 1: Single text-node match
  for (const textNode of textNodes) {
    const nodeText = textNode.textContent || '';
    if (!nodeText) continue;

    // Direct match
    let matchStart = nodeText.indexOf(searchText);
    let matchLength = searchText.length;

    // Case-insensitive direct match
    if (matchStart === -1) {
      matchStart = nodeText.toLowerCase().indexOf(searchText.toLowerCase());
    }

    // Normalized Unicode match
    if (matchStart === -1) {
      const normNode = normalizeForMatch(nodeText);
      const normIdx = normNode.toLowerCase().indexOf(normSearch.toLowerCase());
      if (normIdx !== -1) {
        // Find approximate position in original node text
        const flex = findFlexibleMatch(nodeText, searchText);
        if (flex) {
          matchStart = flex.start;
          matchLength = flex.length;
        }
      }
    }

    if (matchStart === -1) continue;

    try {
      const range = document.createRange();
      range.setStart(textNode, matchStart);
      range.setEnd(textNode, matchStart + matchLength);

      const mark = createHighlightMark(annotation);
      range.surroundContents(mark);
      return; // Successfully wrapped in single node
    } catch {
      // Continue to next or fallback to multi-node
    }
  }

  // Strategy 2: Multi-node match (selection spans across elements/tags)
  let fullText = '';
  const nodeMap: { node: Text; start: number; end: number; text: string }[] = [];
  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    const start = fullText.length;
    fullText += text;
    nodeMap.push({ node: textNode, start, end: fullText.length, text });
  }

  let matchStart = fullText.indexOf(searchText);
  let matchLength = searchText.length;

  if (matchStart === -1) {
    matchStart = fullText.toLowerCase().indexOf(searchText.toLowerCase());
  }

  if (matchStart === -1) {
    const flex = findFlexibleMatch(fullText, searchText);
    if (flex) {
      matchStart = flex.start;
      matchLength = flex.length;
    }
  }

  if (matchStart === -1) return;

  const matchEnd = matchStart + matchLength;

  // Find overlapping text nodes
  const affectedNodes = nodeMap.filter(
    (n) => n.start < matchEnd && n.end > matchStart
  );
  if (affectedNodes.length === 0) return;

  // Process in reverse order so DOM mutation doesn't invalidate offsets
  for (let i = affectedNodes.length - 1; i >= 0; i--) {
    const affected = affectedNodes[i];
    const nodeLen = affected.node.textContent?.length || 0;
    const localStart = Math.max(0, matchStart - affected.start);
    const localEnd = Math.min(nodeLen, matchEnd - affected.start);

    if (localStart >= localEnd) continue;

    try {
      const range = document.createRange();
      range.setStart(affected.node, localStart);
      range.setEnd(affected.node, localEnd);

      const mark = createHighlightMark(annotation);
      range.surroundContents(mark);
    } catch {
      // Skip failed chunk
    }
  }
}

function findFlexibleMatch(haystack: string, needle: string): { start: number; length: number } | null {
  const normalizedNeedle = needle.trim();
  if (!normalizedNeedle) return null;

  const words = normalizedNeedle.split(/\s+/).map(escapeRegExp);
  if (words.length === 0) return null;

  const pattern = words.join('[\\s\\u00A0\\u2000-\\u200B\\u00AD]+');
  try {
    const regex = new RegExp(pattern, 'i');
    const match = regex.exec(haystack);
    if (!match || match.index === undefined) return null;

    return {
      start: match.index,
      length: match[0].length,
    };
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format note content into a clean, human-readable plain text preview.
 * Prevents raw JSON from leaking into fallback tooltips or title attributes.
 */
export function formatNotePreview(noteContent?: string): string {
  if (!noteContent) return '';
  try {
    const parsed = JSON.parse(noteContent);
    if (parsed && typeof parsed === 'object') {
      if (parsed.type === 'define' && parsed.data) {
        const word = parsed.data.word || '';
        const phonetic = parsed.data.phonetic ? ` ${parsed.data.phonetic}` : '';
        const firstMeaning = parsed.data.meanings?.[0];
        const pos = firstMeaning?.part_of_speech ? `[${firstMeaning.part_of_speech}] ` : '';
        const def = firstMeaning?.definitions?.[0]?.definition || '';
        return `${word}${phonetic}: ${pos}${def}`.trim();
      }
      if (parsed.type === 'translate' && parsed.data) {
        const trans = parsed.data.translated_text || '';
        return `Translation: ${trans}`.trim();
      }
    }
  } catch {
    // Plain text note
  }
  return noteContent;
}

/**
 * Create a styled <mark> element for an annotation.
 */
function createHighlightMark(annotation: Annotation): HTMLElement {
  const mark = document.createElement('mark');
  mark.className = 'epub-highlight';
  const color = annotation.color || '#fbbf24';
  mark.style.setProperty('--highlight-color', color);
  mark.dataset.annotationId = String(annotation.id || '');
  mark.dataset.annotationType = annotation.annotationType;

  if (annotation.categoryId) {
    mark.dataset.categoryId = String(annotation.categoryId);
  }

  // Derive semantic label from saved custom labels or default preset
  try {
    const customLabels = JSON.parse(localStorage.getItem('shiori-highlight-labels') || '{}');
    const label = customLabels[color] || {
      '#fbbf24': 'Important',
      '#34d399': 'Quote',
      '#60a5fa': 'Research',
      '#a78bfa': 'Vocabulary',
      '#f472b6': 'Idea',
      '#fb923c': 'Review',
      '#f87171': 'Critical',
      '#2dd4bf': 'Reference',
    }[color.toLowerCase()];
    if (label) {
      mark.dataset.categoryName = label;
    }
  } catch {
    // ignore parsing errors
  }

  if (annotation.noteContent) {
    mark.dataset.hasNote = 'true';
    mark.dataset.noteContent = annotation.noteContent;
    // Format human-readable preview for fallback title attribute (no raw JSON!)
    mark.title = formatNotePreview(annotation.noteContent);
  }

  return mark;
}

/**
 * Find the horizontally-scrolled paginated/two-page canvas that contains
 * the mark (CSS multi-column layout — each column is one page/spread).
 */
function findPaginatedScroller(mark: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = mark.parentElement;
  while (el) {
    if (
      el.classList.contains('premium-reading-canvas--paginated') ||
      el.classList.contains('premium-reading-canvas--two-page')
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Jump a horizontally-paginated canvas to the exact page (CSS column/spread)
 * containing the mark. Pages are laid out as multi-column content with a
 * fixed column pitch; the snap grid advances one viewport per spread, so the
 * target scrollLeft is the snapped column's start offset — the same geometry
 * the reader's nextPage/prevPage and restore-position math relies on.
 */
function scrollPaginatedCanvasToMark(scroller: HTMLElement, mark: HTMLElement): void {
  const scrollerRect = scroller.getBoundingClientRect();
  const markRect = mark.getBoundingClientRect();
  // Canvas-space X of the mark (independent of the current scroll offset).
  const markX = scroller.scrollLeft + (markRect.left - scrollerRect.left);

  const content = scroller.querySelector<HTMLElement>('.premium-chapter-content');
  let firstColumnStart = 0;
  let pitch = scroller.clientWidth;
  let columnsPerPage = scroller.classList.contains('premium-reading-canvas--two-page') ? 2 : 1;

  if (content) {
    const cs = getComputedStyle(content);
    const colWidth = parseFloat(cs.columnWidth);
    const colGap = parseFloat(cs.columnGap);
    firstColumnStart = content.getBoundingClientRect().left - scrollerRect.left + scroller.scrollLeft;
    if (Number.isFinite(colWidth) && colWidth > 0 && Number.isFinite(colGap) && colGap >= 0) {
      pitch = colWidth + colGap;
    } else {
      columnsPerPage = 1;
    }
  }

  const columnIndex = Math.max(0, Math.floor((markX - firstColumnStart) / pitch));
  // Snap to the first column of the containing page (spread = 2 columns).
  const snapColumn = Math.floor(columnIndex / columnsPerPage) * columnsPerPage;
  const maxScroll = scroller.scrollWidth - scroller.clientWidth;
  const target = Math.max(0, Math.min(maxScroll, firstColumnStart + snapColumn * pitch));

  // Instant jump — on Android exactness beats animation; a smooth CSS
  // scroll-behavior would animate and could fight scroll-snap.
  const previousBehavior = scroller.style.scrollBehavior;
  scroller.style.scrollBehavior = 'auto';
  try {
    scroller.scrollLeft = target;
  } finally {
    scroller.style.scrollBehavior = previousBehavior;
  }
}

/**
 * Scroll the mark into the center of the viewport instantly, even when CSS
 * sets scroll-behavior: smooth on the scroll container (behavior:'auto'
 * would otherwise honour the CSS animation).
 */
function scrollMarkIntoViewInstant(mark: HTMLElement): void {
  const overridden: HTMLElement[] = [];
  let el: HTMLElement | null = mark.parentElement;
  while (el && el !== document.body?.parentElement) {
    const style = getComputedStyle(el);
    const scrollable =
      style.overflowY === 'auto' || style.overflowY === 'scroll' ||
      style.overflowX === 'auto' || style.overflowX === 'scroll';
    if (scrollable && style.scrollBehavior !== 'auto') {
      overridden.push(el);
      el.style.scrollBehavior = 'auto';
    }
    el = el.parentElement;
  }
  try {
    mark.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
  } finally {
    for (const s of overridden) s.style.scrollBehavior = '';
  }
}

/**
 * Scroll to an exact annotation mark in the reader container — instantly
 * (exactness on Android) and trigger a luminous pulse animation so the user
 * immediately spots the exact line.
 *
 * Works in both reading modes: in horizontally-paginated canvases the mark
 * lives on a CSS column page, so the canvas is jumped straight to the page
 * containing the mark; everywhere else the mark is centered in the viewport.
 *
 * If the mark is not in the DOM yet (highlights may have just been applied
 * to freshly rendered content in the same frame — the known flakiness source
 * on Android WebView), it retries once on the next animation frame before
 * returning false. Callers decide when to give up and clear pending state.
 */
export function scrollToAnnotationMark(
  container: HTMLElement | Document | null,
  annotationId: number | string | null | undefined
): boolean {
  if (!container || !annotationId) return false;
  const root = container instanceof Document ? container.documentElement : container;
  const mark = root.querySelector<HTMLElement>(
    `mark.epub-highlight[data-annotation-id="${annotationId}"], mark.pdf-highlight[data-annotation-id="${annotationId}"], [data-annotation-id="${annotationId}"]`
  );
  if (!mark) {
    // ONE rAF-delayed retry for highlights-DOM timing, then give up (false).
    requestAnimationFrame(() => {
      scrollToAnnotationMark(container, annotationId);
    });
    return false;
  }

  try {
    const paginatedScroller = findPaginatedScroller(mark);
    if (paginatedScroller) {
      // Paginated/two-page mode: jump the canvas to the exact page first;
      // the whole page column is visible in the viewport, so the mark is
      // guaranteed on screen and the pulse below points at the exact line.
      scrollPaginatedCanvasToMark(paginatedScroller, mark);
    } else {
      scrollMarkIntoViewInstant(mark);
    }

    // Trigger visual pulse glow on target
    mark.classList.remove('annotation-jump-focus');
    // Force reflow to re-trigger animation if clicked repeatedly
    void mark.offsetWidth;
    mark.classList.add('annotation-jump-focus');

    setTimeout(() => {
      mark.classList.remove('annotation-jump-focus');
    }, 2800);
    return true;
  } catch {
    return false;
  }
}
