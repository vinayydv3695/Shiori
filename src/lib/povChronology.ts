import type { TocEntry } from './tauri';

export interface PovCharacterArc {
  character: string;
  color: string;
  chapterIndices: number[];
  chapters: Array<{ index: number; label: string; location?: string }>;
}

export interface EraGroup {
  era: string;
  chapterIndices: number[];
}

export interface ChapterChronologyMetadata {
  index: number;
  label: string;
  character?: string;
  era?: string;
}

const CHARACTER_PALETTE = [
  '#f43f5e', // Rose
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#84cc16', // Lime
  '#f97316', // Orange
  '#6366f1', // Indigo
];

/** Hash string to pick a deterministic color from the palette */
export function getCharacterColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return CHARACTER_PALETTE[Math.abs(hash) % CHARACTER_PALETTE.length];
}

/** Detect era, year, or date indicators in a chapter title */
export function detectEraFromTitle(title: string): string | undefined {
  if (!title) return undefined;

  // Season + Year (e.g. "Winter 1942", "1942: Winter")
  const seasonYearMatch = title.match(/(?:Winter|Summer|Spring|Fall|Autumn)\s+\d{4}|\b\d{4}\s*[:—–\-]\s*(?:Winter|Summer|Spring|Fall|Autumn)/i);
  if (seasonYearMatch) {
    const parts = seasonYearMatch[0].replace(/[:—–\-]/g, ' ').trim().split(/\s+/);
    // Standardize to "Season Year"
    if (/^\d{4}$/.test(parts[0]) && parts[1]) {
      return `${parts[1]} ${parts[0]}`;
    }
    return seasonYearMatch[0].replace(/[:—–\-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Year pattern (e.g. 1942, 2049, 1888)
  const yearMatch = title.match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/);
  if (yearMatch) {
    return yearMatch[1];
  }

  // Era / Age / Day pattern (e.g. "Era 3", "First Age", "Day 14", "Year 200")
  const eraMatch = title.match(/\b(?:(?:First|Second|Third|Fourth)\s+Age|(?:Era|Age|Epoch|Day|Year)\s+[A-Za-z0-9]+)/i);
  if (eraMatch) return eraMatch[0];

  return undefined;
}

/** Common known POV words to skip as false positives */
const IGNORED_POV_TOKENS = new Set([
  'chapter', 'ch', 'act', 'part', 'epilogue', 'prologue', 'interlude', 'appendix',
  'preface', 'introduction', 'afterword', 'book', 'volume', 'section', 'scene',
  // Frontmatter & publishing metadata
  'cover', 'insert', 'inserts', 'copyright', 'copyrights', 'title', 'titlepage', 'contents',
  'table of contents', 'toc', 'illustration', 'illustrations', 'color illustrations',
  'pinup', 'pinups', 'frontmatter', 'backmatter', 'colophon', 'dedication',
  'acknowledgments', 'acknowledgements', 'about', 'about the author', 'author',
  'newsletter', 'bonus', 'special', 'notes', 'translator', 'translation',
  'editorial', 'credits', 'dramatis personae', 'characters', 'map', 'maps', 'glossary', 'index'
]);

/** Common narrative title nouns to prevent false positives when parsing chapter titles */
const COMMON_TITLE_NOUNS = new Set([
  'city', 'town', 'village', 'gate', 'water', 'sea', 'mountain', 'river', 'road', 'path',
  'forest', 'castle', 'kingdom', 'land', 'world', 'battle', 'journey', 'beginning', 'end',
  'tranquility', 'malice', 'secret', 'shadow', 'light', 'whisper', 'night', 'day', 'song',
  'dance', 'dream', 'hope', 'fear', 'silence', 'story', 'tale', 'legend', 'chronicle',
  'history', 'fall', 'rise', 'death', 'life', 'house', 'temple', 'church', 'tower',
  'room', 'door', 'window', 'mirror', 'stone', 'sword', 'crown', 'throne', 'ring',
  'fire', 'ice', 'blood', 'heart', 'wind', 'storm', 'visitor', 'stranger', 'arrival',
  'departure', 'return', 'meeting', 'parting', 'farewell', 'gathering', 'festival'
]);

/** Common verbs and prepositions that never appear in character names */
const VERBS_AND_PREPOSITIONS = new Set([
  'is', 'was', 'are', 'were', 'has', 'have', 'had', 'begins', 'ended', 'goes', 'went',
  'comes', 'came', 'falls', 'fell', 'rises', 'rose', 'dies', 'died', 'returns',
  'with', 'in', 'at', 'from', 'to', 'for', 'on', 'by', 'into', 'through', 'without',
  'between', 'among', 'under', 'over', 'behind', 'before', 'after', 'about', 'and', 'or', 'but'
]);

/** Check if a candidate string is plausible as a character name */
export function isLikelyCharacterName(candidate: string): boolean {
  if (!candidate) return false;
  const trimmed = candidate.trim();
  const words = trimmed.split(/\s+/);

  // Character names are 1 to 3 words at most (e.g. Kaladin, Jon Snow, Geralt of Rivia)
  if (words.length < 1 || words.length > 3) return false;

  // Cannot start with articles, demonstratives, or interrogatives
  if (/^(the|a|an|it|this|that|these|those|what|how|why|when|where|which|who|whom|whose)\b/i.test(trimmed)) {
    return false;
  }

  // Check each word
  for (let i = 0; i < words.length; i++) {
    const rawWord = words[i].toLowerCase().replace(/[^a-z]/g, '');
    if (!rawWord) continue;

    // Disallow verbs and prepositions (except 'of', 'de', 'van', 'von' in noble surnames)
    if (VERBS_AND_PREPOSITIONS.has(rawWord) && !['of', 'de', 'van', 'von'].includes(rawWord)) {
      return false;
    }

    // Disallow common narrative nouns
    if (COMMON_TITLE_NOUNS.has(rawWord)) {
      return false;
    }

    // Each word must start with an uppercase letter unless it's a surname preposition
    if (!/^[A-Z]/.test(words[i]) && !['of', 'de', 'van', 'von'].includes(words[i])) {
      return false;
    }
  }

  return true;
}

/** Check if a chapter title represents frontmatter, backmatter, or publication metadata */
export function isFrontmatterTitle(title: string): boolean {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  return /^(cover|insert|inserts|copyright|title|contents|illustration|illustrations|colophon|dedication|acknowledgment|acknowledgments|author|newsletter|bonus|credits|map|maps|glossary|index)\b/i.test(t);
}

/** Detect POV Character Name from chapter title */
export function detectCharacterFromTitle(title: string): string | undefined {
  if (!title) return undefined;
  const trimmed = title.trim();

  // Instant frontmatter / publishing metadata filter
  if (isFrontmatterTitle(trimmed)) {
    return undefined;
  }

  const clean = trimmed.replace(/[—–\-:.]/g, ' ').replace(/\s+/g, ' ').trim();

  // Pattern 1: Title is single character name or name + Roman numeral (e.g. "Tyrion", "Daenerys IV", "Ciri II")
  const singleNameMatch = clean.match(/^([A-Z][a-zA-Z'\-]+)(?:\s+[IVXLCDM\d]+)?$/);
  if (singleNameMatch) {
    const candidate = singleNameMatch[1].trim();
    if (!IGNORED_POV_TOKENS.has(candidate.toLowerCase()) && isLikelyCharacterName(candidate)) {
      return candidate;
    }
  }

  // Pattern 2: "Chapter X: Character Name" or "Chapter X - Character Name" or "Act 2 - Geralt of Rivia"
  const chapterNamedMatch = trimmed.match(/^(?:Chapter|Ch\.?|Act|Part)\s+\d+\s*[:—–\-]\s*([A-Za-z'\- ]+?)(?:\s*[:—–\-].*)?$/i);
  if (chapterNamedMatch) {
    const candidate = chapterNamedMatch[1].trim();
    if (candidate && !IGNORED_POV_TOKENS.has(candidate.toLowerCase()) && isLikelyCharacterName(candidate)) {
      return candidate;
    }
  }

  // Pattern 3: "Character Name: The Event" or "Character Name - Description"
  const colonMatch = trimmed.match(/^([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+)?)\s*[:—–\-]/);
  if (colonMatch) {
    const candidate = colonMatch[1].trim();
    if (!IGNORED_POV_TOKENS.has(candidate.toLowerCase()) && isLikelyCharacterName(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/** Load user-assigned overrides from localStorage */
export function getSavedPovOverrides(bookId: number): Record<number, { character?: string; era?: string }> {
  try {
    const raw = localStorage.getItem(`shiori-pov-tags-${bookId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Save user-assigned overrides to localStorage */
export function savePovOverride(
  bookId: number,
  chapterIndex: number,
  override: { character?: string; era?: string }
): void {
  try {
    const map = getSavedPovOverrides(bookId);
    map[chapterIndex] = { ...map[chapterIndex], ...override };
    localStorage.setItem(`shiori-pov-tags-${bookId}`, JSON.stringify(map));
  } catch (err) {
    console.error('[povChronology] Failed to save POV override:', err);
  }
}

/** Remove a user-assigned override from localStorage */
export function removePovOverride(bookId: number, chapterIndex: number): void {
  try {
    const map = getSavedPovOverrides(bookId);
    delete map[chapterIndex];
    localStorage.setItem(`shiori-pov-tags-${bookId}`, JSON.stringify(map));
  } catch (err) {
    console.error('[povChronology] Failed to remove POV override:', err);
  }
}

/** Extract all detected and configured POV character arcs from TOC */
export function extractPovArcs(
  toc: TocEntry[],
  bookId: number
): { characters: PovCharacterArc[]; eras: EraGroup[]; metadata: ChapterChronologyMetadata[] } {
  const overrides = getSavedPovOverrides(bookId);
  const metadata: ChapterChronologyMetadata[] = [];
  const charMap: Record<string, PovCharacterArc> = {};
  const eraMap: Record<string, number[]> = {};

  // Flatten TOC entries to extract index
  let flatIndex = 0;
  const visit = (entry: TocEntry) => {
    const chapterMatch = entry.location?.match(/^chapter_(\d+)/) || entry.location?.match(/^chapter:(\d+)/);
    const idx = chapterMatch ? parseInt(chapterMatch[1], 10) : flatIndex++;

    const override = overrides[idx];
    const character = override?.character || detectCharacterFromTitle(entry.label);
    const era = override?.era || detectEraFromTitle(entry.label);

    metadata.push({
      index: idx,
      label: entry.label,
      character,
      era,
    });

    if (character) {
      if (!charMap[character]) {
        charMap[character] = {
          character,
          color: getCharacterColor(character),
          chapterIndices: [],
          chapters: [],
        };
      }
      charMap[character].chapterIndices.push(idx);
      charMap[character].chapters.push({ index: idx, label: entry.label, location: entry.location });
    }

    if (era) {
      if (!eraMap[era]) eraMap[era] = [];
      eraMap[era].push(idx);
    }

    if (entry.children) {
      entry.children.forEach(visit);
    }
  };

  toc.forEach(visit);

  // Keep only multi-chapter arcs (>= 2 chapters),
  // OR characters whose chapters explicitly follow a Roman numeral series (e.g. "Tyrion I", "Daenerys IV"),
  // OR characters that have user-confirmed overrides.
  const characters = Object.values(charMap)
    .filter((arc) => {
      const hasUserOverride = arc.chapterIndices.some((idx) => overrides[idx]?.character === arc.character);
      if (hasUserOverride) return true;
      if (arc.chapterIndices.length >= 2) return true;
      const escaped = arc.character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const romanNumeralRegex = new RegExp(`^\\s*${escaped}\\s+[IVXLCDM]+\\b`, 'i');
      return arc.chapters.some((c) => romanNumeralRegex.test(c.label));
    })
    .sort((a, b) => b.chapterIndices.length - a.chapterIndices.length);

  const eras = Object.entries(eraMap).map(([era, indices]) => ({
    era,
    chapterIndices: indices,
  }));

  return { characters, eras, metadata };
}

/** Single-POV navigation helpers */
export function getPrevPovChapter(currentIdx: number, povIndices: number[]): number | null {
  const sorted = [...povIndices].sort((a, b) => a - b);
  const prevList = sorted.filter((idx) => idx < currentIdx);
  return prevList.length > 0 ? prevList[prevList.length - 1] : null;
}

export function getNextPovChapter(currentIdx: number, povIndices: number[]): number | null {
  const sorted = [...povIndices].sort((a, b) => a - b);
  const nextList = sorted.filter((idx) => idx > currentIdx);
  return nextList.length > 0 ? nextList[0] : null;
}

export function getPovArcProgress(
  currentIdx: number,
  povIndices: number[]
): { currentStep: number; totalSteps: number } {
  const sorted = [...povIndices].sort((a, b) => a - b);
  const stepIndex = sorted.indexOf(currentIdx);
  return {
    currentStep: stepIndex >= 0 ? stepIndex + 1 : 1,
    totalSteps: sorted.length,
  };
}
