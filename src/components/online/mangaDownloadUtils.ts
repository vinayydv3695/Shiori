import type { UnifiedChapter } from "./OnlineMangaDetailView";

/** Per-chapter download lifecycle state, keyed by chapter id. */
export type ChapterDownloadStatus =
  | "queued"
  | "downloading"
  | "done"
  | "failed";
export type ChapterDownloadStatusMap = Record<string, ChapterDownloadStatus>;

export interface VolumeGroup {
  id: string;
  volumeNumber: number | null;
  volumeLabel: string;
  chapterRangeLabel: string;
  chapters: UnifiedChapter[];
}

/**
 * Extracts a volume number from raw volume field, title, or chapter string.
 */
export function extractChapterVolume(
  rawVolume: string | undefined | null,
  title: string = '',
  chapterStr: string = ''
): string | null {
  if (rawVolume && rawVolume !== 'None' && rawVolume !== 'null' && rawVolume !== '?' && rawVolume.trim() !== '') {
    return rawVolume.trim();
  }

  // Check title for "Vol. 1", "Volume 2", "v01"
  const volRegex = /(?:vol(?:ume)?|v)\s*[\.\-:#]?\s*(\d+(?:\.\d+)?)/i;
  const matchTitle = title.match(volRegex);
  if (matchTitle && matchTitle[1]) {
    return matchTitle[1];
  }

  const matchChapter = chapterStr.match(volRegex);
  if (matchChapter && matchChapter[1]) {
    return matchChapter[1];
  }

  return null;
}

/**
 * Cleanly formats a chapter's display title, preventing duplicate "Chapter X: Chapter X" labels,
 * and prepending the volume when available (e.g. "Vol. 1 Ch. 60", "Vol. 1 Ch. 60: The Battle", or "Chapter 60").
 */
export function formatChapterTitle(ch: {
  volume?: string | null;
  chapter?: string | null;
  title?: string | null;
}): string {
  const volNum = extractChapterVolume(ch.volume, ch.title ?? '', ch.chapter ?? '');
  const hasVol = !!volNum && volNum !== 'None' && volNum !== '?';
  
  const rawChapter = (ch.chapter && ch.chapter !== '?') ? String(ch.chapter).trim() : '';
  const rawTitle = (ch.title ?? '').trim();

  // Deduplicate and clean rawTitle
  let cleanTitle = rawTitle;
  if (cleanTitle) {
    // If title is just "Chapter 60", "chapter 60", "Ch. 60", "Ch 60", "Chapter 60: Chapter 60"
    const exactChapterRegex = /^(?:chapter|ch|vol(?:ume)?\s*\d+\s*ch(?:apter)?)\.?\s*\d+(?:\.\d+)?$/i;
    if (
      exactChapterRegex.test(cleanTitle) ||
      (rawChapter && cleanTitle.toLowerCase() === `chapter ${rawChapter}`.toLowerCase()) ||
      (rawChapter && cleanTitle.toLowerCase() === `ch. ${rawChapter}`.toLowerCase()) ||
      (rawChapter && cleanTitle.toLowerCase() === `ch ${rawChapter}`.toLowerCase()) ||
      (rawChapter && cleanTitle.toLowerCase() === rawChapter.toLowerCase())
    ) {
      cleanTitle = '';
    } else {
      // Strip leading "Chapter 60: ", "Chapter 60 - ", "Ch.60 - ", "Chapter 60 "
      if (rawChapter) {
        const leadingChapterRegex = new RegExp(`^(?:chapter|ch)\\.?\\s*${rawChapter}\\s*[:\\-–—.]*\\s*`, 'i');
        cleanTitle = cleanTitle.replace(leadingChapterRegex, '').trim();
      }
      // Also strip leading "Vol. 1 Chapter 60: ", "Vol 1: "
      if (hasVol) {
        const leadingVolRegex = new RegExp(`^(?:vol(?:ume)?|v)\\.?\\s*${volNum}\\s*[:\\-–—.]*\\s*`, 'i');
        cleanTitle = cleanTitle.replace(leadingVolRegex, '').trim();
        if (rawChapter) {
          const leadingChapterRegex = new RegExp(`^(?:chapter|ch)\\.?\\s*${rawChapter}\\s*[:\\-–—.]*\\s*`, 'i');
          cleanTitle = cleanTitle.replace(leadingChapterRegex, '').trim();
        }
      }
    }
  }

  // Construct label: e.g. "Vol. 1 Ch. 60" or "Chapter 60" or "Vol. 1"
  let prefix = '';
  if (hasVol && rawChapter) {
    prefix = `Vol. ${volNum} Ch. ${rawChapter}`;
  } else if (hasVol && !rawChapter) {
    prefix = `Vol. ${volNum}`;
  } else if (!hasVol && rawChapter) {
    prefix = `Chapter ${rawChapter}`;
  }

  if (prefix && cleanTitle) {
    return `${prefix}: ${cleanTitle}`;
  }
  if (prefix) {
    return prefix;
  }
  if (cleanTitle) {
    return cleanTitle;
  }
  return rawChapter ? `Chapter ${rawChapter}` : 'Oneshot';
}

/** Unique chapter title used for CBZ filenames / import (matches the download loop contract). */
export function buildChapterDownloadTitle(
  ch: Pick<UnifiedChapter, "volume" | "title" | "chapter">,
): string {
  return formatChapterTitle(ch);
}

/** Short display label, e.g. "Vol. 1 Ch. 60" / "Chapter 12: The Return" / "Oneshot". */
export function chapterDisplayLabel(
  ch: Pick<UnifiedChapter, "volume" | "title" | "chapter">,
): string {
  return formatChapterTitle(ch);
}

/** Tally per-chapter download statuses. */
export function countChapterStatuses(status: ChapterDownloadStatusMap): {
  queued: number;
  downloading: number;
  done: number;
  failed: number;
} {
  const counts = { queued: 0, downloading: 0, done: 0, failed: 0 };
  for (const s of Object.values(status)) counts[s]++;
  return counts;
}

/** Sort chapters ascending by volume then chapter number. */
export function sortChaptersAscending(
  chapters: UnifiedChapter[],
): UnifiedChapter[] {
  return [...chapters].sort((a, b) => {
    const aVol = a.volume === "None" ? 0 : Number(a.volume) || 0;
    const bVol = b.volume === "None" ? 0 : Number(b.volume) || 0;
    const aChap = Number(a.chapter) || 0;
    const bChap = Number(b.chapter) || 0;
    if (aVol !== bVol) return aVol - bVol;
    return aChap - bChap;
  });
}

/**
 * Groups a flat list of chapters into structured volumes.
 * Handles sources with explicit volume tags (e.g. MangaDex) as well as sources
 * without volume tags (grouping into clean 10-chapter volume bundles with chapter ranges).
 */
export function groupChaptersIntoVolumes(chapters: UnifiedChapter[]): VolumeGroup[] {
  if (!chapters || chapters.length === 0) return [];

  // Sort chapters ascending so everything is in proper reading order
  const sorted = [...chapters].sort((a, b) => {
    const numA = parseFloat(a.chapter);
    const numB = parseFloat(b.chapter);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.chapter.localeCompare(b.chapter, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Check if any chapters have explicit or parsed volume information
  const chaptersWithParsedVol = sorted.map(ch => ({
    ch,
    vol: extractChapterVolume(ch.volume, ch.title, ch.chapter)
  }));

  const hasExplicitVolumes = chaptersWithParsedVol.filter(item => item.vol !== null).length >= Math.max(2, Math.floor(sorted.length * 0.2));

  if (hasExplicitVolumes) {
    // Group by explicit volume string
    const map = new Map<string, UnifiedChapter[]>();
    const unassigned: UnifiedChapter[] = [];

    for (const item of chaptersWithParsedVol) {
      if (item.vol !== null) {
        let list = map.get(item.vol);
        if (!list) {
          list = [];
          map.set(item.vol, list);
        }
        list.push(item.ch);
      } else {
        unassigned.push(item.ch);
      }
    }

    const groups: VolumeGroup[] = [];

    // Sort volume keys naturally
    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    for (const key of sortedKeys) {
      const chs = map.get(key)!;
      const first = chs[0]?.chapter;
      const last = chs[chs.length - 1]?.chapter;
      const range = first && last ? (first === last ? `Ch. ${first}` : `Ch. ${first} – ${last}`) : `${chs.length} chapters`;
      const num = parseFloat(key);
      groups.push({
        id: `vol-${key}`,
        volumeNumber: !isNaN(num) ? num : null,
        volumeLabel: `Volume ${key}`,
        chapterRangeLabel: range,
        chapters: chs,
      });
    }

    if (unassigned.length > 0) {
      groups.push({
        id: 'vol-specials',
        volumeNumber: null,
        volumeLabel: 'Specials & Extras',
        chapterRangeLabel: `${unassigned.length} chapters`,
        chapters: unassigned,
      });
    }

    return groups;
  }

  // If no explicit volume metadata from source:
  // Dynamically group chapters into standard 10-chapter volume bundles
  const groups: VolumeGroup[] = [];
  const numericChapters: UnifiedChapter[] = [];
  const nonNumericChapters: UnifiedChapter[] = [];

  for (const ch of sorted) {
    const num = parseFloat(ch.chapter);
    if (!isNaN(num)) {
      numericChapters.push(ch);
    } else {
      nonNumericChapters.push(ch);
    }
  }

  if (numericChapters.length > 0) {
    const CHUNK_SIZE = 10;
    const totalChunks = Math.ceil(numericChapters.length / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const chunk = numericChapters.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const volIndex = i + 1;
      const first = chunk[0]?.chapter;
      const last = chunk[chunk.length - 1]?.chapter;
      const range = first && last ? (first === last ? `Ch. ${first}` : `Ch. ${first} – ${last}`) : `${chunk.length} chapters`;

      groups.push({
        id: `vol-${volIndex}`,
        volumeNumber: volIndex,
        volumeLabel: `Volume ${volIndex}`,
        chapterRangeLabel: range,
        chapters: chunk,
      });
    }
  }

  if (nonNumericChapters.length > 0) {
    groups.push({
      id: 'vol-extras',
      volumeNumber: null,
      volumeLabel: numericChapters.length === 0 ? 'Chapters' : 'Specials & Extras',
      chapterRangeLabel: `${nonNumericChapters.length} chapters`,
      chapters: nonNumericChapters,
    });
  }

  return groups;
}
