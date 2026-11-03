/**
 * franchiseHub.ts
 *
 * Provides cross-format franchise unification and AniList/MAL transmedia links.
 * Unifies Light Novels (EPUB/PDF/MOBI), Manga (CBZ/CBR/online), and Anime
 * adaptations under one roof.
 */

import { api, type Book } from '@/lib/tauri';
import { isMangaDomain, fetchWithRetry } from '@/lib/utils';
import { compareBooksNatural } from '@/lib/seriesSorting';
import { useLibraryStore } from '@/store/libraryStore';

export interface FranchiseMediaNode {
  id: number;
  idMal?: number | null;
  siteUrl: string;
  title: {
    romaji: string;
    english?: string | null;
    native?: string | null;
    userPreferred?: string;
  };
  type: 'ANIME' | 'MANGA';
  format: string; // 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'NOVEL' | 'MANGA' | 'ONE_SHOT'
  status: string; // 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS'
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  startDate?: { year?: number; month?: number; day?: number } | null;
  coverImage: {
    extraLarge?: string;
    large: string;
    medium?: string;
  };
  bannerImage?: string | null;
  averageScore?: number | null;
  description?: string | null;
  relationType?: string; // "ADAPTATION" | "SOURCE" | "PREQUEL" | "SEQUEL" | "SIDE_STORY" | "SPIN_OFF" | "SUMMARY" etc.
}

export interface FranchiseTransmediaData {
  rootTitle: string;
  bannerUrl?: string | null;
  anime: FranchiseMediaNode[];
  lightNovels: FranchiseMediaNode[];
  manga: FranchiseMediaNode[];
  sourceMedia?: FranchiseMediaNode | null;
}

export interface CrossFormatFranchiseBooks {
  franchiseTitle: string;
  novels: Book[];
  manga: Book[];
  all: Book[];
  hasCrossFormat: boolean;
}

/**
 * Strips volume indicators, format tags, and chapter subtitles to reveal
 * the core franchise title (e.g. "Re:ZERO -Starting Life in Another World-", "Solo Leveling").
 */
export function cleanFranchiseTitle(raw: string): string {
  if (!raw) return '';
  let title = raw.trim();

  // Strip bracketed or parenthesized format tags: (Light Novel), [LN], (Manga), etc.
  title = title.replace(
    /\s*[\(\[](?:light novel|novel|web novel|wn|ln|manga|comic|comics|manhwa|manhua|official|digital|scanlation)[\)\]]/gi,
    ''
  );

  // Strip volume / chapter suffixes with subtitles: e.g. ", Vol. 1: The Undead King", " - Vol. 01", " Chapter 2"
  title = title.replace(
    /[,:\-–—\s]+(?:vol(?:ume)?|ch(?:apter)?|v|#|bk|book|part)\.?\s*#?\s*\d+(?:\.\d+)?(?:\s*[:\-–—].*)?$/i,
    ''
  );

  // Strip simple trailing numbers if preceded by Vol/v or space + 2-3 digit number (e.g. "Sword Art Online 01: Aincrad")
  title = title.replace(/\s+\d{1,3}(?:\s*[:\-–—].*)?$/, '');

  // Strip trailing " - Chapter X: Subtitle" or " - Arc X"
  title = title.replace(/\s*[-–—]\s*(?:Chapter|Arc)\s*\d+.*$/i, '');

  // Clean trailing punctuation and whitespace
  title = title.replace(/[\s,\-–—:]+$/, '').trim();

  return title;
}

/**
 * Strips punctuation and returns a normalized alphanumeric key for safe fuzzy matching.
 */
function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Determines whether a candidate book belongs to the given franchise.
 */
export function isFranchiseMatch(
  franchiseCleanTitle: string,
  candidateTitle?: string,
  candidateSeries?: string
): boolean {
  const targetKey = normalizeKey(franchiseCleanTitle);
  if (!targetKey || targetKey.length < 2) return false;

  if (candidateSeries) {
    const candCleanSeries = cleanFranchiseTitle(candidateSeries);
    const candSeriesKey = normalizeKey(candCleanSeries);
    if (candSeriesKey) {
      if (candSeriesKey === targetKey) return true;
      if (
        candSeriesKey.length >= 4 &&
        targetKey.length >= 4 &&
        (candSeriesKey.includes(targetKey) || targetKey.includes(candSeriesKey))
      ) {
        return true;
      }
    }
  }

  if (candidateTitle) {
    const candCleanTitle = cleanFranchiseTitle(candidateTitle);
    const candTitleKey = normalizeKey(candCleanTitle);
    if (candTitleKey) {
      if (candTitleKey === targetKey) return true;
      if (
        candTitleKey.length >= 4 &&
        targetKey.length >= 4 &&
        (candTitleKey.includes(targetKey) || targetKey.includes(candTitleKey))
      ) {
        return true;
      }
    }
  }

  return false;
}

// Memory caches to keep franchise lookups instant across tab switches
const transmediaCache = new Map<string, FranchiseTransmediaData>();
const crossFormatBooksCache = new Map<string, CrossFormatFranchiseBooks>();

/**
 * Queries AniList's public GraphQL API for related transmedia works (Anime seasons,
 * Light Novels, Manga, and Adaptations) without requiring user authentication.
 */
export async function fetchFranchiseTransmedia(
  rawSeriesTitle: string
): Promise<FranchiseTransmediaData> {
  const cleanTitle = cleanFranchiseTitle(rawSeriesTitle);
  if (!cleanTitle) {
    return { rootTitle: rawSeriesTitle, anime: [], lightNovels: [], manga: [] };
  }

  const cached = transmediaCache.get(cleanTitle.toLowerCase());
  if (cached) return cached;

  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 4) {
        media(search: $search) {
          id
          idMal
          siteUrl
          title {
            romaji
            english
            native
            userPreferred
          }
          type
          format
          status
          episodes
          chapters
          volumes
          season
          seasonYear
          startDate {
            year
            month
            day
          }
          coverImage {
            extraLarge
            large
            medium
          }
          bannerImage
          averageScore
          description(asHtml: false)
          relations {
            edges {
              relationType
              node {
                id
                idMal
                siteUrl
                title {
                  romaji
                  english
                  native
                  userPreferred
                }
                type
                format
                status
                episodes
                chapters
                volumes
                season
                seasonYear
                startDate {
                  year
                  month
                  day
                }
                coverImage {
                  extraLarge
                  large
                  medium
                }
                bannerImage
                averageScore
                description(asHtml: false)
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetchWithRetry('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { search: cleanTitle } }),
    });

    if (!res.ok) {
      throw new Error(`AniList returned status ${res.status}`);
    }

    const data = await res.json();
    const mediaList: any[] = data.data?.Page?.media ?? [];

    const nodesMap = new Map<number, FranchiseMediaNode>();
    let bannerUrl: string | null = null;
    let sourceMedia: FranchiseMediaNode | null = null;

    for (const root of mediaList) {
      if (!bannerUrl && root.bannerImage) {
        bannerUrl = root.bannerImage;
      }

      // Add the root media entry
      const rootNode: FranchiseMediaNode = {
        id: root.id,
        idMal: root.idMal,
        siteUrl: root.siteUrl,
        title: root.title,
        type: root.type,
        format: root.format,
        status: root.status,
        episodes: root.episodes,
        chapters: root.chapters,
        volumes: root.volumes,
        season: root.season,
        seasonYear: root.seasonYear,
        startDate: root.startDate,
        coverImage: root.coverImage,
        bannerImage: root.bannerImage,
        averageScore: root.averageScore,
        description: root.description,
        relationType: root.format === 'NOVEL' ? 'SOURCE' : 'MAIN',
      };
      if (!nodesMap.has(root.id)) {
        nodesMap.set(root.id, rootNode);
      }

      // Add all related edges
      const edges = root.relations?.edges ?? [];
      for (const edge of edges) {
        const node = edge.node;
        if (!node || nodesMap.has(node.id)) continue;

        const mediaItem: FranchiseMediaNode = {
          id: node.id,
          idMal: node.idMal,
          siteUrl: node.siteUrl,
          title: node.title,
          type: node.type,
          format: node.format,
          status: node.status,
          episodes: node.episodes,
          chapters: node.chapters,
          volumes: node.volumes,
          season: node.season,
          seasonYear: node.seasonYear,
          startDate: node.startDate,
          coverImage: node.coverImage,
          bannerImage: node.bannerImage,
          averageScore: node.averageScore,
          description: node.description,
          relationType: edge.relationType,
        };

        if (edge.relationType === 'SOURCE' && !sourceMedia) {
          sourceMedia = mediaItem;
        }

        nodesMap.set(node.id, mediaItem);
      }
    }

    const allNodes = Array.from(nodesMap.values());

    // Categorize
    const anime = allNodes
      .filter((n) => n.type === 'ANIME')
      .sort((a, b) => {
        // Chronological order: year, then season, then title
        const yearA = a.seasonYear ?? a.startDate?.year ?? 9999;
        const yearB = b.seasonYear ?? b.startDate?.year ?? 9999;
        if (yearA !== yearB) return yearA - yearB;

        const seasonOrder: Record<string, number> = {
          WINTER: 1,
          SPRING: 2,
          SUMMER: 3,
          FALL: 4,
        };
        const sA = seasonOrder[a.season || ''] ?? 5;
        const sB = seasonOrder[b.season || ''] ?? 5;
        if (sA !== sB) return sA - sB;

        return (a.title.english || a.title.romaji).localeCompare(b.title.english || b.title.romaji);
      });

    const lightNovels = allNodes.filter(
      (n) => n.format === 'NOVEL' || (n.type === 'MANGA' && n.relationType === 'SOURCE')
    );

    const manga = allNodes.filter(
      (n) => n.type === 'MANGA' && n.format !== 'NOVEL' && n.relationType !== 'SOURCE'
    );

    const result: FranchiseTransmediaData = {
      rootTitle: cleanTitle,
      bannerUrl,
      anime,
      lightNovels,
      manga,
      sourceMedia,
    };

    transmediaCache.set(cleanTitle.toLowerCase(), result);
    return result;
  } catch (err) {
    console.warn('[FranchiseHub] Failed to fetch transmedia from AniList:', err);
    return {
      rootTitle: cleanTitle,
      anime: [],
      lightNovels: [],
      manga: [],
    };
  }
}

/**
 * Finds all books across the user's entire library matching this franchise,
 * unifying Light Novels (EPUB/PDF/MOBI) and Manga/Comics (CBZ/CBR/online).
 */
export async function fetchCrossFormatLibraryMedia(
  rawSeriesTitle: string,
  currentSeriesBooks: Book[] = []
): Promise<CrossFormatFranchiseBooks> {
  const cleanTitle = cleanFranchiseTitle(rawSeriesTitle);
  const cacheKey = cleanTitle.toLowerCase();

  const cached = crossFormatBooksCache.get(cacheKey);
  if (cached) return cached;

  // Search SQLite library database for books matching cleanTitle
  const candidateBooks: Book[] = [...currentSeriesBooks];

  try {
    // Search with first 2-3 prominent words to avoid over-constraining FTS5
    const searchTerms = cleanTitle
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 3)
      .join(' ');

    if (searchTerms) {
      const searchRes = await api.searchBooks({
        query: searchTerms,
        limit: 500,
        offset: 0,
      });
      if (searchRes?.books) {
        candidateBooks.push(...searchRes.books);
      }
    }
  } catch (err) {
    console.warn('[FranchiseHub] Database search fallback to local store:', err);
  }

  // Also include in-memory loaded books
  const storeBooks = useLibraryStore.getState().books;
  candidateBooks.push(...storeBooks);

  // Deduplicate and filter by franchise match
  const seenIds = new Set<number>();
  const matchedBooks: Book[] = [];

  for (const book of candidateBooks) {
    if (!book || book.id == null || seenIds.has(book.id)) continue;
    seenIds.add(book.id);

    if (isFranchiseMatch(cleanTitle, book.title, book.series)) {
      matchedBooks.push(book);
    }
  }

  const novels: Book[] = [];
  const manga: Book[] = [];

  for (const book of matchedBooks) {
    if (isMangaDomain(book)) {
      manga.push(book);
    } else {
      novels.push(book);
    }
  }

  // Natural numeric sort for both formats
  novels.sort((a, b) => compareBooksNatural(a, b, 'chapter_asc'));
  manga.sort((a, b) => compareBooksNatural(a, b, 'chapter_asc'));

  const result: CrossFormatFranchiseBooks = {
    franchiseTitle: cleanTitle,
    novels,
    manga,
    all: [...novels, ...manga],
    hasCrossFormat: novels.length > 0 && manga.length > 0,
  };

  crossFormatBooksCache.set(cacheKey, result);
  return result;
}
