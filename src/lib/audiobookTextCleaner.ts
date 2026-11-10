/**
 * audiobookTextCleaner.ts
 *
 * Intelligent sanitizer for audiobook narration and live transcripts.
 * - Converts HTML blocks (<p>, <div>, <h1>, <br>) into natural sentence boundaries
 * - Strips leading repetitive book title / volume boilerplate (e.g. "Re:ZERO -Starting Life in Another World- Short Story Collection, Vol. 4")
 * - Protects abbreviations (Vol., Ch., Mr., Mrs., Dr.) from accidental sentence fragmentation
 * - Strips orphan chapter/volume numbers and leading colon artifacts
 * - Sanitizes existing transcripts and stored sentences on the fly
 * - Delivers clean, story-first sentences ready for narration and read-along
 */

import { splitSentences } from '@/lib/sentenceSplitter';

/**
 * Normalizes title by removing (Audiobook) tags, volume suffixes, and punctuation.
 */
function extractTitleKeywords(title?: string): string[] {
  if (!title) return [];
  return title
    .replace(/\s*\(Audiobook\)$/i, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['vol', 'volume', 'chapter', 'part', 'book', 'the', 'and', 'for'].includes(w));
}

/**
 * Strips HTML and leading book/chapter boilerplate from raw chapter content.
 */
export function cleanChapterContent(
  rawContent: string,
  bookTitle?: string,
  chapterTitle?: string
): string {
  if (!rawContent || !rawContent.trim()) return '';

  // 1. Convert block level elements into distinct sentence boundaries
  let text = rawContent
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|section|header)>/gi, '.\n')
    .replace(/<(br|hr)\s*\/?>/gi, '.\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Protect abbreviations like "Vol. 4", "Ch. 16", "Mr. Smith", "Mrs. Brown", "Dr. Stone"
  text = text.replace(
    /\b(Vol|Volume|Ch|Chap|Chapter|Mr|Mrs|Ms|Dr|Prof|vs|etc)\.\s*(\d+|[A-Z])/gi,
    '$1 $2'
  );

  // Normalize repeated periods created from block conversions
  text = text.replace(/\.{2,}/g, '.');

  // 3. Strip leading book title boilerplate if present at start of chapter
  if (bookTitle) {
    const cleanTitle = bookTitle.replace(/\s*\(Audiobook\)$/i, '').trim();

    // Check with full title tokens
    const allTokens = cleanTitle.split(/[^\w]+/i).filter((t) => t.length > 1);
    if (allTokens.length >= 2) {
      // Try full match first
      const fullPattern = allTokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-zA-Z0-9]+');
      const fullRegex = new RegExp(`^[^a-zA-Z0-9]*${fullPattern}[^a-zA-Z0-9"“'‘]*`, 'i');
      text = text.replace(fullRegex, '').trim();

      // If full title had volume/extra subtitles, try matching the core title (first 3-5 tokens)
      const coreTokens = allTokens.slice(0, Math.min(5, allTokens.length));
      if (coreTokens.length >= 2) {
        const corePattern = coreTokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-zA-Z0-9]+');
        // Matches core title + any following volume/subtitle up to dialogue or story text
        const coreRegex = new RegExp(
          `^[^a-zA-Z0-9]*${corePattern}(?:[^"“'‘\\n\\r]{0,80}?)(?:Vol(?:ume)?\\.?\\s*\\d+)?(?:[^a-zA-Z0-9"“'‘]*)`,
          'i'
        );
        text = text.replace(coreRegex, '').trim();
      }
    }
  }

  // 4. Strip leading repetitive chapter title if present (e.g. "Chapter 16" or "Chapter 16: Felt's Story")
  if (chapterTitle) {
    const cleanChapter = chapterTitle.replace(/[^\w\s]/gi, '').trim();
    if (cleanChapter.length > 2) {
      const chPattern = new RegExp(
        `^[\\s\\W_]*${cleanChapter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-zA-Z0-9"“'‘]*`,
        'i'
      );
      text = text.replace(chPattern, '').trim();
    }
  }

  // Strip generic "Chapter \d+" or "Part \d+" at the very beginning
  text = text.replace(/^(chapter|ch\.|part|episode)\s*\d+[:.\s—–-]*/i, '').trim();

  // 5. Clean up any remaining orphan leading volume/chapter prefix e.g. "4 \"I have..." or ": \"I have..."
  text = text.replace(/^[\s,.:;—–-]*(\d+\s*)?["“'‘]/, '"').trim();
  text = text.replace(/^[\s,.:;—–-]+/, '').trim();

  return text;
}

/**
 * Checks whether a single sentence is a repetitive book or chapter title header.
 */
export function isTitleBoilerplate(
  sentence: string,
  bookTitle?: string,
  chapterTitle?: string
): boolean {
  const trimmed = sentence.trim();
  if (!trimmed || trimmed.length < 2) return true;

  // Single numbers or solitary punctuation
  if (/^[\d\s,.:;—–-]{1,6}$/.test(trimmed)) return true;

  // Generic chapter markers
  if (/^(chapter|ch\.|part|episode|prologue|epilogue)\s*\d*[:.\s—–-]*$/i.test(trimmed)) {
    return true;
  }

  // If sentence has dialogue quotes, it's story text, not title boilerplate
  const hasDialogue = trimmed.includes('"') || trimmed.includes('“') || trimmed.includes('”');

  if (bookTitle) {
    const cleanBookTitle = bookTitle.replace(/\s*\(Audiobook\)$/i, '').trim().toLowerCase();
    const sLower = trimmed.toLowerCase();

    // Exact or near-exact match
    if (sLower.includes(cleanBookTitle) || cleanBookTitle.includes(sLower)) {
      if (!hasDialogue || trimmed.length < 90) return true;
    }

    // Keyword overlap check
    const keywords = extractTitleKeywords(bookTitle);
    if (keywords.length >= 2) {
      const matchCount = keywords.filter((k) => sLower.includes(k)).length;
      const matchRatio = matchCount / keywords.length;
      if (matchRatio >= 0.5 && trimmed.length < 120 && !hasDialogue) {
        return true;
      }
      if (matchCount >= 2 && trimmed.length < 80 && !hasDialogue) {
        return true;
      }
    }
  }

  if (chapterTitle) {
    const cleanCh = chapterTitle.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const sClean = trimmed.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (cleanCh.length > 2 && sClean === cleanCh) {
      return true;
    }
  }

  return false;
}

/**
 * Strips orphan leftover volume numbers or quotes from sentence start.
 * e.g. '4 "I have granddaughters...' -> '"I have granddaughters...'
 * e.g. '" "You guys...' -> '"You guys...'
 */
export function cleanSentenceArtifacts(sentence: string): string {
  let s = sentence.trim();

  // Strip orphan volume/chapter digit followed by quote: '4 "I have...' -> '"I have...'
  s = s.replace(/^(\d+|[IVXLCDM]+)\s*["“'‘]/, '"');

  // Strip orphan volume/chapter digit followed by capital word: '4 I have...' -> 'I have...'
  s = s.replace(/^(\d+|[IVXLCDM]+)\s+([A-Z])/, '$2');

  // Fix double quote artifacts: '" "You...' -> '"You...'
  s = s.replace(/^["“'‘]\s*["“'‘]/, '"');

  // Strip leading punctuation artifacts
  s = s.replace(/^[\s,.:;—–-]+/, '');

  return s.trim();
}

/**
 * Intelligently sanitizes an entire array of transcript sentences:
 * - Drops any leading title / chapter header sentences
 * - Cleans orphan volume digits from subsequent sentences
 * - Removes duplicate / empty entries
 */
export function sanitizeTranscriptSentences(
  sentences: string[],
  bookTitle?: string,
  chapterTitle?: string
): string[] {
  if (!sentences || sentences.length === 0) return [];

  const cleaned: string[] = [];
  let foundFirstStorySentence = false;

  for (let i = 0; i < sentences.length; i++) {
    const raw = sentences[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Check if this initial sentence is title boilerplate
    if (!foundFirstStorySentence && isTitleBoilerplate(trimmed, bookTitle, chapterTitle)) {
      continue;
    }

    // Once we find a story sentence, clean any artifact at its head
    const sanitized = cleanSentenceArtifacts(trimmed);
    if (sanitized.length > 1) {
      foundFirstStorySentence = true;
      cleaned.push(sanitized);
    }
  }

  return cleaned.length > 0 ? cleaned : sentences.map(cleanSentenceArtifacts).filter(s => s.length > 0);
}

/**
 * Splits raw content into clean, story-first sentences.
 */
export function extractCleanSentences(
  rawContent: string,
  bookTitle?: string,
  chapterTitle?: string
): string[] {
  const cleanedText = cleanChapterContent(rawContent, bookTitle, chapterTitle);
  if (!cleanedText) return [];

  const rawSentences = splitSentences(cleanedText);
  return sanitizeTranscriptSentences(rawSentences, bookTitle, chapterTitle);
}

/**
 * Detects whether a book chapter is an image-only, cover, color insert,
 * illustration, or placeholder page with no substantive story text to narrate.
 */
export function isPlaceholderChapter(
  rawContent?: string,
  title?: string,
  cleanCharCount?: number
): boolean {
  const content = rawContent || '';
  const count =
    cleanCharCount !== undefined
      ? cleanCharCount
      : cleanChapterContent(content, '', title).length;

  // 1. Any chapter with fewer than 100 characters of clean text has no story narrative
  if (count < 100) return true;

  const t = (title || '').trim().toLowerCase();

  // 2. Front matter / image markers in title
  const placeholderTitleRegex =
    /^(cover|insert\d*|title\s*page|titlepage|color\s*(insert|page|plate)s?|illustrations?|gallery|table\s*of\s*contents|toc|copyright|newsletter|colophon|blank|contents)\b/i;
  if (placeholderTitleRegex.test(t) && count < 400) {
    return true;
  }

  // 3. Image-only pages: contains <img>, <image>, or <svg> and clean narrative text is under 250 characters
  const hasImage = /<img|<image|<svg/i.test(content);
  if (hasImage && count < 250) {
    return true;
  }

  return false;
}

