import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { getChapterCatchUpRecap } from '@/lib/ai/aiClient';

export interface ChapterCatchUpData {
  bookId: number;
  chapterIndex: number;
  chapterTitle: string;
  daysSinceRead: number;
  openingScene: string;
  keyMoments: string[];
  closingScene: string;
  activeCharacters: string[];
  rawExcerpt: string;
}

/**
 * Check if the user hasn't opened this book in 2+ days (48 hours)
 */
export function checkHiatus(lastRead?: string | null): { isHiatus: boolean; daysAgo: number; hoursAgo: number } {
  if (!lastRead) return { isHiatus: false, daysAgo: 0, hoursAgo: 0 };

  try {
    const lastDate = new Date(lastRead).getTime();
    if (isNaN(lastDate)) return { isHiatus: false, daysAgo: 0, hoursAgo: 0 };

    const diffMs = Date.now() - lastDate;
    const hoursAgo = Math.floor(diffMs / (1000 * 60 * 60));
    const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return {
      isHiatus: hoursAgo >= 48,
      daysAgo,
      hoursAgo,
    };
  } catch {
    return { isHiatus: false, daysAgo: 0, hoursAgo: 0 };
  }
}

const ACTION_VERB_REGEX = /\b(said|asked|replied|shouted|whispered|screamed|revealed|discovered|realized|decided|escaped|struck|killed|murdered|stabbed|shot|entered|arrived|fled|stood|turned|faced|grabbed|pulled|confessed|kissed|cried|collapsed)\b/i;

/**
 * Fast, 100% offline extractive summarization of a chapter's key narrative beats.
 */
export async function getChapterCatchUpData(
  bookId: number,
  currentChapterIndex: number,
  lastRead?: string
): Promise<ChapterCatchUpData | null> {
  try {
    // If user is past Chapter 0, summarize the previous completed chapter they left off from; otherwise Chapter 0
    const targetChapterIdx = currentChapterIndex > 0 ? currentChapterIndex - 1 : 0;

    const chapter = await api.getBookChapter(bookId, targetChapterIdx);
    if (!chapter?.content) return null;

    const doc = new DOMParser().parseFromString(chapter.content, 'text/html');
    doc.querySelectorAll('script, style, nav, header, footer').forEach((el) => el.remove());

    const titleEl = doc.querySelector('h1, h2, h3, .chapter-title, .title');
    const chapterTitle =
      titleEl?.textContent?.trim() || `Chapter ${targetChapterIdx + 1}`;

    const rawParagraphs = Array.from(doc.querySelectorAll('p, blockquote'))
      .map((p) => p.textContent?.trim() || '')
      .filter((p) => p.length >= 25);

    const fullText = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    if (!fullText || fullText.length < 50) return null;

    const hiatusInfo = checkHiatus(lastRead);

    // 1. Opening Scene
    const openingParagraphs = rawParagraphs.slice(0, 2).join(' ');
    const openingScene =
      openingParagraphs.length > 320
        ? openingParagraphs.slice(0, 310).replace(/\s+\S*$/, '') + '...'
        : openingParagraphs || fullText.slice(0, 250);

    // 2. Closing Scene / Cliffhanger
    const lastParagraph = rawParagraphs[rawParagraphs.length - 1] || '';
    const closingScene =
      lastParagraph.length > 300
        ? lastParagraph.slice(0, 290).replace(/\s+\S*$/, '') + '...'
        : lastParagraph;

    // 3. Key Narrative Moments / Sentences
    const sentences = fullText.split(/(?<=[.!?])\s+(?=[A-Z0-9"“'‘])/);
    const candidateMoments: { score: number; text: string }[] = [];

    for (let idx = 0; idx < sentences.length; idx++) {
      const s = sentences[idx].trim();
      if (s.length < 35 || s.length > 250) continue;

      let score = 0;
      // High action or dialogue verbs
      if (ACTION_VERB_REGEX.test(s)) score += 4;
      // Dialogue quotes
      if (/["“][^"”]{5,}["”]/.test(s)) score += 3;
      // Character names or capitalization mid-sentence
      if (/[a-z]\s+[A-Z][a-z]+/.test(s)) score += 2;

      // Penalize boilerplate, chapter titles, page numbers
      if (/chapter\s+\d+|page\s+\d+|all rights reserved/i.test(s)) score -= 10;

      if (score >= 4) {
        candidateMoments.push({ score, text: s });
      }
    }

    candidateMoments.sort((a, b) => b.score - a.score);
    // Take up to 4 distinctive moments
    const keyMoments = candidateMoments.slice(0, 4).map((m) => m.text);

    // 4. Active Characters in Chapter
    const nameMatches = fullText.match(/(?:[a-z,;:\-—]\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g) || [];
    const nameCounts = new Map<string, number>();
    for (const m of nameMatches) {
      const cleanName = m.replace(/^[a-z,;:\-—\s]+/, '').trim();
      if (cleanName.length >= 3 && cleanName.length <= 25) {
        nameCounts.set(cleanName, (nameCounts.get(cleanName) || 0) + 1);
      }
    }
    const activeCharacters = Array.from(nameCounts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);

    return {
      bookId,
      chapterIndex: targetChapterIdx,
      chapterTitle,
      daysSinceRead: hiatusInfo.daysAgo,
      openingScene,
      keyMoments: keyMoments.length > 0 ? keyMoments : [openingScene],
      closingScene,
      activeCharacters,
      rawExcerpt: fullText.slice(0, 5000),
    };
  } catch (err) {
    logger.warn('[catchUpService] Failed to extract chapter catch-up data:', err);
    return null;
  }
}

/**
 * Generate AI-enhanced dramatic narrative recap if user has AI configured
 */
export async function generateAICatchUpRecap(
  bookTitle: string,
  chapterTitle: string,
  rawExcerpt: string
): Promise<string> {
  return getChapterCatchUpRecap(bookTitle, chapterTitle, rawExcerpt);
}
