/**
 * Utility for resiliently finding, scrolling to, and spotlighting dialogue / scene quotes
 * in reader views (EPUB, MOBI, Generic HTML, Continuous Flow).
 */

/**
 * Normalizes text for resilient punctuation-, quote-, and whitespace-insensitive matching.
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'") // smart single quotes to straight '
    .replace(/[\u201C\u201D]/g, '"') // smart double quotes to straight "
    .replace(/[\u2013\u2014]/g, '-') // en/em dashes to hyphen
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts clean, distinctive search words from a query/quote snippet.
 */
export function extractSearchTokens(searchTerm: string): string[] {
  if (!searchTerm) return [];
  const normalized = normalizeText(searchTerm);
  return normalized
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length >= 2);
}

/**
 * Scours a container element for the paragraph or block element that best matches
 * the given dialogue / quote snippet.
 * 
 * Works even when:
 * - Text is fragmented across nested formatting tags (<em>, <span>, <strong>, <a>, <q>)
 * - Smart quotes, apostrophes, dashes, or punctuation differ
 * - Typo/omissions exist in the snippet vs the book HTML
 */
export function findBestMatchingBlock(container: HTMLElement, searchTerm: string): HTMLElement | null {
  if (!container || !searchTerm?.trim()) return null;

  const normalizedSearch = normalizeText(searchTerm);
  const searchTokens = extractSearchTokens(searchTerm);
  if (searchTokens.length === 0) return null;

  // Search candidate block elements
  const allCandidates = Array.from(
    container.querySelectorAll<HTMLElement>(
      'p, blockquote, li, dd, dt, h1, h2, h3, h4, h5, h6, div.paragraph, div.calibre_p, div[class*="text"], div[class*="line"], div[class*="calibre"]'
    )
  );

  // If no standard block tags exist, look for leaf block-level divs
  const candidates: HTMLElement[] =
    allCandidates.length > 0
      ? allCandidates
      : Array.from(container.querySelectorAll<HTMLElement>('div, section, article')).filter((el) => {
          const hasBlock = el.querySelector('p, div, blockquote, section, article');
          return !hasBlock && (el.textContent || '').trim().length > 15;
        });

  let bestEl: HTMLElement | null = null;
  let bestScore = 0;

  // Pre-calculate subphrase needles (e.g. 4 consecutive words, 3 consecutive words)
  const fourWordPhrases: string[] = [];
  if (searchTokens.length >= 4) {
    for (let i = 0; i <= searchTokens.length - 4; i++) {
      fourWordPhrases.push(searchTokens.slice(i, i + 4).join(' '));
    }
  }

  const threeWordPhrases: string[] = [];
  if (searchTokens.length >= 3) {
    for (let i = 0; i <= searchTokens.length - 3; i++) {
      threeWordPhrases.push(searchTokens.slice(i, i + 3).join(' '));
    }
  }

  // Significant tokens (longer words >= 4 letters)
  const significantTokens = searchTokens.filter((t) => t.length >= 4);

  for (const el of candidates) {
    const rawText = el.textContent || '';
    if (rawText.length < 5) continue;
    const norm = normalizeText(rawText);

    let score = 0;

    // 1. Verbatim or full normalized search substring (highest confidence)
    if (normalizedSearch.length >= 10 && norm.includes(normalizedSearch)) {
      score += 1500;
    }

    // 2. Sliding 4-word consecutive phrases
    for (const phrase of fourWordPhrases) {
      if (norm.includes(phrase)) {
        score += 300;
      }
    }

    // 3. Sliding 3-word consecutive phrases
    for (const phrase of threeWordPhrases) {
      if (norm.includes(phrase)) {
        score += 120;
      }
    }

    // 4. Token overlap scoring with word-boundary checks
    let matchedSignificantCount = 0;
    for (const token of searchTokens) {
      const isSignificant = token.length >= 4;
      const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(norm)) {
        score += isSignificant ? 25 : 8;
        if (isSignificant) matchedSignificantCount++;
      }
    }

    // Ratio boost: if majority of search tokens appear in this single block
    if (searchTokens.length > 0) {
      const matchRatio = matchedSignificantCount / (significantTokens.length || 1);
      if (matchRatio >= 0.75) {
        score += 250;
      } else if (matchRatio >= 0.5) {
        score += 100;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestEl = el;
    }
  }

  // Minimum threshold to prevent false positives on totally unrelated paragraphs
  return bestScore >= 50 ? bestEl : null;
}

/**
 * Highlights matching words directly in an element's text nodes if not already highlighted.
 */
export function highlightTextInElement(el: HTMLElement, term: string) {
  if (!el || !term?.trim()) return;
  if (el.querySelector('.search-highlight')) return;

  const tokens = extractSearchTokens(term);
  if (tokens.length === 0) return;

  const phrase = tokens.length > 5 ? tokens.slice(0, 5).join(' ') : tokens.join(' ');
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s,.:;!?"\'“”‘’—–\\-]+');
  const regex = new RegExp(`(${escaped})`, 'i');

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('mark, script, style')) continue;
    if ((node.textContent || '').trim().length > 0) {
      textNodes.push(node as Text);
    }
  }

  let matched = false;
  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    if (regex.test(text)) {
      matched = true;
      const span = document.createElement('span');
      span.innerHTML = text.replace(regex, '<mark class="search-highlight search-highlight--active">$1</mark>');
      textNode.parentNode?.replaceChild(span, textNode);
      break;
    }
  }

  if (!matched) {
    const significant = tokens.filter((t) => t.length >= 4);
    if (significant.length > 0) {
      const altPattern = significant.slice(0, 4).map((t) => `\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).join('|');
      const altRegex = new RegExp(`(${altPattern})`, 'gi');
      for (const textNode of textNodes) {
        const text = textNode.textContent || '';
        if (altRegex.test(text)) {
          const span = document.createElement('span');
          span.innerHTML = text.replace(altRegex, '<mark class="search-highlight search-highlight--active">$1</mark>');
          textNode.parentNode?.replaceChild(span, textNode);
        }
      }
    }
  }
}

/**
 * Scrolls the given element to the center of the container.
 */
export function scrollElementToCenter(
  container: HTMLElement,
  target: HTMLElement,
  isHorizontal: boolean,
  behavior: ScrollBehavior = 'smooth'
) {
  if (isHorizontal) {
    const clientWidth = container.clientWidth || 1;
    const targetRect = target.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const offsetInCanvas = (targetRect.left - containerRect.left) + container.scrollLeft;
    const pageIdx = Math.floor(offsetInCanvas / clientWidth);
    container.scrollTo({ left: pageIdx * clientWidth, behavior });
  } else {
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const relativeTop = targetRect.top - containerRect.top;
    const targetScrollTop =
      container.scrollTop + relativeTop - container.clientHeight / 2 + targetRect.height / 2;
    container.scrollTo({ top: Math.max(0, targetScrollTop), behavior });
    try {
      target.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
    } catch {
      // Ignore if unsupported in environment
    }
  }
}

/**
 * Triggers a spotlight pulsing animation on the target element.
 */
export function pulseElement(el: HTMLElement) {
  el.classList.remove('scene-dialogue-highlight');
  void el.offsetWidth;
  el.classList.add('scene-dialogue-highlight');

  const marks = el.querySelectorAll<HTMLElement>('.search-highlight');
  marks.forEach((m) => {
    m.classList.remove('search-highlight--active');
    void m.offsetWidth;
    m.classList.add('search-highlight--active');
  });

  setTimeout(() => {
    marks.forEach((m) => m.classList.remove('search-highlight--active'));
  }, 3500);
}

export interface ScrollToSearchOptions {
  isHorizontal?: boolean;
  behavior?: ScrollBehavior;
  searchRoot?: HTMLElement;
  targetSnippet?: string;
  searchTerm?: string | null;
}

/**
 * Unified entry point to scroll any reader container to the target dialogue/search term.
 * Checks for:
 * 1. Matching block by targetSnippet or multi-token quote/phrase (highest precision)
 * 2. [data-target-scene="true"] or .scene-dialogue-highlight
 * 3. .search-highlight--active or .search-highlight
 * 4. Best matching paragraph/block by text content (resilient fallback)
 */
export function scrollCanvasToSearchTerm(
  container: HTMLElement,
  searchTerm: string,
  options?: ScrollToSearchOptions
): boolean {
  if (!container || !searchTerm?.trim()) return false;

  const root = options?.searchRoot || container;
  const isHoriz = Boolean(options?.isHorizontal);
  const behavior: ScrollBehavior = options?.behavior ?? 'smooth';
  const queryToMatch = options?.targetSnippet?.trim() || searchTerm.trim();

  // 1. If targetSnippet or a distinctive multi-token search term/quote is provided,
  // locate the EXACT paragraph first (avoiding jumping to the wrong occurrence on page 1).
  if (queryToMatch) {
    const bestBlock = findBestMatchingBlock(root, queryToMatch);
    if (bestBlock && root.contains(bestBlock)) {
      highlightTextInElement(bestBlock, options?.searchTerm || searchTerm);
      scrollElementToCenter(container, bestBlock, isHoriz, behavior);
      pulseElement(bestBlock);
      return true;
    }
  }

  // 2. Check for explicit target-scene marker
  const targetScene = root.querySelector<HTMLElement>(
    '[data-target-scene="true"], .scene-dialogue-highlight'
  );
  if (targetScene && root.contains(targetScene)) {
    scrollElementToCenter(container, targetScene, isHoriz, behavior);
    pulseElement(targetScene);
    return true;
  }

  // 3. Check for active or standard search highlights
  const activeHighlight = root.querySelector<HTMLElement>(
    '.search-highlight--active, .search-highlight'
  );
  if (activeHighlight && root.contains(activeHighlight)) {
    const parentBlock = activeHighlight.closest<HTMLElement>(
      'p, blockquote, li, dd, h1, h2, h3, h4, h5, h6, div.paragraph, div.calibre_p'
    );
    const elementToScroll = parentBlock || activeHighlight;
    scrollElementToCenter(container, elementToScroll, isHoriz, behavior);
    pulseElement(elementToScroll);
    return true;
  }

  // 4. Resilient block text-content matcher fallback
  const bestBlock = findBestMatchingBlock(root, searchTerm);
  if (bestBlock && root.contains(bestBlock)) {
    highlightTextInElement(bestBlock, searchTerm);
    scrollElementToCenter(container, bestBlock, isHoriz, behavior);
    pulseElement(bestBlock);
    return true;
  }

  return false;
}
