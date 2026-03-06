/**
 * DOM-based sentence highlighting for TTS
 * Handles text that spans multiple nodes and preserves DOM structure
 */

const HIGHLIGHT_CLASS = 'tts-highlight';
const HIGHLIGHT_STYLE = 'background: #f3a6a68c; border-radius: 2px; transition: background 0.2s;';

/**
 * Normalize whitespace for text comparison
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Walk DOM tree and collect all text nodes
 */
function getTextNodes(node: Node): Text[] {
  const textNodes: Text[] = [];
  
  function walk(current: Node): void {
    if (current.nodeType === Node.TEXT_NODE) {
      const text = current.textContent?.trim() || '';
      if (text.length > 0) {
        textNodes.push(current as Text);
      }
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      // Skip script and style elements
      const element = current as HTMLElement;
      if (element.tagName !== 'SCRIPT' && element.tagName !== 'STYLE') {
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
  const normalizedTarget = normalizeWhitespace(targetText);
  const ranges: Array<{ node: Text; start: number; end: number }> = [];
  
  // Build combined text with node boundaries tracked
  let combinedText = '';
  const nodeMap: Array<{ node: Text; startOffset: number; endOffset: number }> = [];
  
  for (const node of textNodes) {
    const text = node.textContent || '';
    const startOffset = combinedText.length;
    combinedText += text;
    const endOffset = combinedText.length;
    nodeMap.push({ node, startOffset, endOffset });
    combinedText += ' '; // Add space between nodes
  }
  
  // Normalize combined text for matching
  const normalizedCombined = normalizeWhitespace(combinedText);
  
  // Find target in normalized text
  const matchIndex = normalizedCombined.indexOf(normalizedTarget);
  if (matchIndex === -1) {
    return ranges;
  }
  
  // Map back to original text positions (approximate due to normalization)
  
  // Find which nodes contain this range
  let targetStart = -1;
  let targetEnd = -1;
  
  // Simple approach: find the range in the original combined text
  const targetLower = targetText.toLowerCase();
  const combinedLower = combinedText.toLowerCase();
  const originalMatchIndex = combinedLower.indexOf(targetLower);
  
  if (originalMatchIndex !== -1) {
    targetStart = originalMatchIndex;
    targetEnd = originalMatchIndex + targetText.length;
    
    // Find nodes that overlap with this range
    for (const { node, startOffset, endOffset } of nodeMap) {
      if (endOffset <= targetStart || startOffset >= targetEnd) {
        continue; // No overlap
      }
      
      const rangeStart = Math.max(0, targetStart - startOffset);
      const rangeEnd = Math.min(node.textContent?.length || 0, targetEnd - startOffset);
      
      if (rangeStart < rangeEnd) {
        ranges.push({ node, start: rangeStart, end: rangeEnd });
      }
    }
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
  span.setAttribute('style', HIGHLIGHT_STYLE);
  span.textContent = highlighted;
  
  const parent = node.parentNode;
  if (!parent) {
    return span;
  }
  
  // Replace node with: before + span + after
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
    // No match found, return no-op cleanup
    return () => {};
  }
  
  // Wrap each range
  const createdSpans: HTMLSpanElement[] = [];
  for (const range of ranges) {
    const span = wrapTextRange(range.node, range.start, range.end);
    createdSpans.push(span);
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
