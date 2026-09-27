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
      'p, blockquote, li, dd, dt, div.paragraph, div.calibre_p, div[class*="text"], div[class*="line"]'
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
    try {
      target.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
    } catch {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const relativeTop = targetRect.top - containerRect.top;
      const targetScrollTop =
        container.scrollTop + relativeTop - container.clientHeight / 2 + targetRect.height / 2;
      container.scrollTo({ top: Math.max(0, targetScrollTop), behavior });
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

/**
 * Unified entry point to scroll any reader container to the target dialogue/search term.
 * Checks for:
 * 1. [data-target-scene="true"] or .scene-dialogue-highlight
 * 2. .search-highlight--active or .search-highlight
 * 3. Best matching paragraph/block by text content (resilient fallback)
 */
export function scrollCanvasToSearchTerm(
  container: HTMLElement,
  searchTerm: string,
  options?: { isHorizontal?: boolean; behavior?: ScrollBehavior }
): boolean {
  if (!container || !searchTerm?.trim()) return false;

  const isHoriz = Boolean(options?.isHorizontal);
  const behavior: ScrollBehavior = options?.behavior ?? 'smooth';

  // 1. Check for explicit target-scene marker
  const targetScene = container.querySelector<HTMLElement>(
    '[data-target-scene="true"], .scene-dialogue-highlight'
  );
  if (targetScene && container.contains(targetScene)) {
    scrollElementToCenter(container, targetScene, isHoriz, behavior);
    pulseElement(targetScene);
    return true;
  }

  // 2. Check for active or standard search highlights
  const activeHighlight = container.querySelector<HTMLElement>(
    '.search-highlight--active, .search-highlight'
  );
  if (activeHighlight && container.contains(activeHighlight)) {
    // If the highlight is inside a paragraph, pulse the paragraph for full-line spotlight
    const parentBlock = activeHighlight.closest<HTMLElement>(
      'p, blockquote, li, dd, div.paragraph, div.calibre_p'
    );
    const elementToScroll = parentBlock || activeHighlight;
    scrollElementToCenter(container, elementToScroll, isHoriz, behavior);
    pulseElement(elementToScroll);
    return true;
  }

  // 3. Resilient block text-content matcher
  const bestBlock = findBestMatchingBlock(container, searchTerm);
  if (bestBlock && container.contains(bestBlock)) {
    scrollElementToCenter(container, bestBlock, isHoriz, behavior);
    pulseElement(bestBlock);
    return true;
  }

  return false;
}
