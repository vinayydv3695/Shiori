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
  const marks = container.querySelectorAll('mark.epub-highlight');
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
 * Find annotation.selectedText within the container's text nodes
 * and wrap it in a <mark> element.
 */
function highlightTextInContainer(
  container: HTMLElement,
  annotation: Annotation
): void {
  const searchText = annotation.selectedText;
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
    textNodes.push(node);
  }

  // Strategy 1: Try single text-node match (most common case)
  for (const textNode of textNodes) {
    const nodeText = textNode.textContent || '';
    const directIndex = nodeText.indexOf(searchText);
    let matchStart = directIndex;
    let matchLength = searchText.length;

    // Fallback: ignore whitespace differences + case while preserving original ranges
    if (matchStart === -1) {
      const flexible = findFlexibleMatch(nodeText, searchText);
      if (flexible) {
        matchStart = flexible.start;
        matchLength = flexible.length;
      }
    }

    if (matchStart === -1) continue;

    try {
      const range = document.createRange();
      range.setStart(textNode, matchStart);
      range.setEnd(textNode, matchStart + matchLength);

      const mark = createHighlightMark(annotation);
      range.surroundContents(mark);
      return; // Done — found and wrapped
    } catch {
      // surroundContents can fail in edge cases; fall through to multi-node
      break;
    }
  }

  // Strategy 2: Multi-node match (selection spans across elements)
  // Build a concatenated view of all text with node boundary tracking
  let fullText = '';
  const nodeMap: { node: Text; start: number; end: number }[] = [];
  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    const start = fullText.length;
    fullText += text;
    nodeMap.push({ node: textNode, start, end: fullText.length });
  }

  const directIndex = fullText.indexOf(searchText);
  const match = directIndex !== -1
    ? { start: directIndex, length: searchText.length }
    : findFlexibleMatch(fullText, searchText);
  if (!match) return;

  const matchIndex = match.start;
  const matchEnd = match.start + match.length;

  // Find which text nodes overlap with our match
  const affectedNodes = nodeMap.filter(
    (n) => n.start < matchEnd && n.end > matchIndex
  );
  if (affectedNodes.length === 0) return;

  // Process in reverse order so DOM modifications don't invalidate
  // subsequent text node references
  for (let i = affectedNodes.length - 1; i >= 0; i--) {
    const affected = affectedNodes[i];
    const nodeLen = affected.node.textContent?.length || 0;
    const localStart = Math.max(0, matchIndex - affected.start);
    const localEnd = Math.min(nodeLen, matchEnd - affected.start);

    if (localStart >= localEnd) continue;

    try {
      const range = document.createRange();
      range.setStart(affected.node, localStart);
      range.setEnd(affected.node, localEnd);

      const mark = createHighlightMark(annotation);
      range.surroundContents(mark);
    } catch {
      // Skip this node portion if wrapping fails
    }
  }
}

function findFlexibleMatch(haystack: string, needle: string): { start: number; length: number } | null {
  const normalizedNeedle = needle.trim();
  if (!normalizedNeedle) return null;

  const words = normalizedNeedle.split(/\s+/).map(escapeRegExp);
  if (words.length === 0) return null;

  const pattern = words.join('\\s+');
  const regex = new RegExp(pattern, 'i');
  const match = regex.exec(haystack);
  if (!match || match.index === undefined) return null;

  return {
    start: match.index,
    length: match[0].length,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a styled <mark> element for an annotation.
 */
function createHighlightMark(annotation: Annotation): HTMLElement {
  const mark = document.createElement('mark');
  mark.className = 'epub-highlight';
  mark.style.backgroundColor = annotation.color || '#fbbf24';
  mark.dataset.annotationId = String(annotation.id || '');
  mark.dataset.annotationType = annotation.annotationType;

  if (annotation.annotationType === 'note') {
    mark.title = annotation.noteContent || '';
  }

  return mark;
}
