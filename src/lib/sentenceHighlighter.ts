/**
 * DOM-based sentence highlighting for TTS
 * Handles text that spans multiple nodes, whitespace variations, and preserves DOM structure
 */

const HIGHLIGHT_CLASS = 'tts-highlight';

/**
 * Walk DOM tree and collect all text nodes
 */
function getTextNodes(node: Node): Text[] {
  const textNodes: Text[] = [];
  
  function walk(current: Node): void {
    if (current.nodeType === Node.TEXT_NODE) {
      const text = current.textContent || '';
      if (text.trim().length > 0) {
        textNodes.push(current as Text);
      }
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      // Skip script, style, and hidden overlay elements
      const element = current as HTMLElement;
      if (
        element.tagName !== 'SCRIPT' && 
        element.tagName !== 'STYLE' &&
        !element.classList.contains('premium-top-bar') &&
        !element.classList.contains('premium-sidebar') &&
        !element.classList.contains('tts-control-bar')
      ) {
        for (const child of Array.from(current.childNodes)) {
          walk(child);
        }
      }
    }
  }
  
  walk(node);
  return textNodes;
}

/**
 * Find text nodes and character ranges that match the target sentence
 */
function findTextRanges(
  textNodes: Text[],
  targetText: string
): Array<{ node: Text; start: number; end: number }> {
  const normalizedTarget = targetText.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalizedTarget) return [];

  const ranges: Array<{ node: Text; start: number; end: number }> = [];

  // Build character map tracking node and offset for each character in concatenated raw text
  let rawConcat = '';
  const rawMap: Array<{ node: Text; offset: number }> = [];

  for (const node of textNodes) {
    const text = node.textContent || '';
    for (let i = 0; i < text.length; i++) {
      rawConcat += text[i];
      rawMap.push({ node, offset: i });
    }
  }

  // Create a normalized string and a mapping from normalized index -> rawConcat index
  let normConcat = '';
  const normToRawIndex: number[] = [];
  let inWhitespace = false;

  for (let i = 0; i < rawConcat.length; i++) {
    const char = rawConcat[i];
    if (/\s/.test(char)) {
      if (!inWhitespace) {
        normConcat += ' ';
        normToRawIndex.push(i);
        inWhitespace = true;
      }
    } else {
      normConcat += char;
      normToRawIndex.push(i);
      inWhitespace = false;
    }
  }

  const normConcatLower = normConcat.toLowerCase();
  let matchIndex = normConcatLower.indexOf(normalizedTarget);

  // Fallback: if exact normalized sentence is not found, try matching the first 30 characters
  if (matchIndex === -1 && normalizedTarget.length > 20) {
    const prefix = normalizedTarget.substring(0, Math.min(30, normalizedTarget.length));
    matchIndex = normConcatLower.indexOf(prefix);
  }

  if (matchIndex === -1) {
    return ranges;
  }

  const startNorm = matchIndex;
  const targetLength = matchIndex + normalizedTarget.length <= normToRawIndex.length
    ? normalizedTarget.length
    : normToRawIndex.length - matchIndex;
  
  const endNorm = Math.min(startNorm + targetLength - 1, normToRawIndex.length - 1);

  const startRaw = normToRawIndex[startNorm];
  const endRaw = normToRawIndex[endNorm] + 1;

  // Group raw character indices by node
  const nodeRanges = new Map<Text, { start: number; end: number }>();

  for (let r = startRaw; r < endRaw && r < rawMap.length; r++) {
    const { node, offset } = rawMap[r];
    const existing = nodeRanges.get(node);
    if (!existing) {
      nodeRanges.set(node, { start: offset, end: offset + 1 });
    } else {
      existing.end = offset + 1;
    }
  }

  for (const [node, range] of nodeRanges.entries()) {
    ranges.push({ node, start: range.start, end: range.end });
  }

  return ranges;
}

/**
 * Wrap text range in a text node with a highlight span
 */
function wrapTextRange(node: Text, start: number, end: number): HTMLSpanElement {
  const text = node.textContent || '';
  const before = text.slice(0, start);
  const highlighted = text.slice(start, end);
  const after = text.slice(end);
  
  const span = document.createElement('span');
  span.className = HIGHLIGHT_CLASS;
  span.textContent = highlighted;
  
  const parent = node.parentNode;
  if (!parent) {
    return span;
  }
  
  if (before) {
    parent.insertBefore(document.createTextNode(before), node);
  }
  parent.insertBefore(span, node);
  if (after) {
    parent.insertBefore(document.createTextNode(after), node);
  }
  parent.removeChild(node);
  
  return span;
}

/**
 * Highlight a sentence in the DOM container
 * Returns a cleanup function to remove the highlight
 */
export function highlightSentence(
  container: HTMLElement,
  sentenceText: string
): () => void {
  const textNodes = getTextNodes(container);
  const ranges = findTextRanges(textNodes, sentenceText);
  
  if (ranges.length === 0) {
    return () => {};
  }
  
  // Wrap each range
  const createdSpans: HTMLSpanElement[] = [];
  for (const range of ranges) {
    const span = wrapTextRange(range.node, range.start, range.end);
    createdSpans.push(span);
  }
  
  // Auto-scroll the first highlighted span into view smoothly
  if (createdSpans.length > 0) {
    const firstSpan = createdSpans[0];
    
    // 1. Scroll window / element into view
    firstSpan.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest'
    });

    // 2. Scroll container explicitly if inside scrollable reader canvas
    const scrollContainer = firstSpan.closest('.premium-reading-canvas') || 
                            firstSpan.closest('.premium-content-container') ||
                            firstSpan.closest('.generic-html-content') ||
                            firstSpan.closest('.mobi-content-container');

    if (scrollContainer && typeof scrollContainer.scrollTo === 'function') {
      const containerRect = scrollContainer.getBoundingClientRect();
      const spanRect = firstSpan.getBoundingClientRect();
      const relativeTop = spanRect.top - containerRect.top + scrollContainer.scrollTop;
      const targetScroll = Math.max(0, relativeTop - containerRect.height / 3);

      scrollContainer.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
      });
    }
  }
  
  // Return cleanup function
  return () => {
    for (const span of createdSpans) {
      const parent = span.parentNode;
      if (parent) {
        const textNode = document.createTextNode(span.textContent || '');
        parent.replaceChild(textNode, span);
        parent.normalize(); // Merge adjacent text nodes
      }
    }
  };
}

/**
 * Remove all TTS highlight spans from the container
 */
export function clearAllHighlights(container: HTMLElement): void {
  const highlights = container.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
  
  for (const highlight of Array.from(highlights)) {
    const parent = highlight.parentNode;
    if (parent) {
      const textNode = document.createTextNode(highlight.textContent || '');
      parent.replaceChild(textNode, highlight);
    }
  }
  
  // Normalize to merge adjacent text nodes
  container.normalize();
}
