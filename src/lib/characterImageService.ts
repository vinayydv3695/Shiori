import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauri } from '@/lib/tauri';

export interface CharacterPortrait {
  imageUrl: string | null;
  nativeName?: string;
  source?: 'anilist' | 'fandom' | 'wikipedia';
  description?: string;
}

const MEMORY_CACHE = new Map<string, CharacterPortrait>();
// Bumped cache key to v9 to refresh descriptions with complete sentences and point formatting
const LOCAL_STORAGE_KEY = 'shiori-char-portraits-v9';
const IN_FLIGHT_REQUESTS = new Map<string, Promise<CharacterPortrait>>();
const NEGATIVE_CACHE = new Map<string, number>(); // cacheKey -> expiresAt timestamp
let anilistCooldownUntil = 0;

/**
 * Robust fetch that routes through Tauri Rust backend when running on desktop/mobile
 * to completely eliminate browser CORS origin rejections.
 */
async function safeFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (isTauri) {
    try {
      return await tauriFetch(url, init);
    } catch (err) {
      logger.debug('[characterImageService] tauriFetch failed, falling back to window.fetch:', err);
    }
  }
  return await fetch(url, init);
}

/**
 * Rate-limiting queue to prevent API flooding and 429 errors when dozens of characters load.
 */
class RequestQueue {
  private concurrency: number;
  private delayMs: number;
  private running = 0;
  private queue: (() => void)[] = [];

  constructor(concurrency = 2, delayMs = 150) {
    this.concurrency = concurrency;
    this.delayMs = delayMs;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      if (this.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }
      this.running--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next?.();
      }
    }
  }
}

const apiQueue = new RequestQueue(2, 120);

function getStoredCache(): Record<string, CharacterPortrait> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveToStoredCache(cacheKey: string, portrait: CharacterPortrait) {
  // CRITICAL: NEVER persist nulls to localStorage so transient network/CORS glitches can retry
  if (!portrait.imageUrl) return;

  try {
    const existing = getStoredCache();
    existing[cacheKey.toLowerCase()] = portrait;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // Ignore quota errors
  }
}

/**
 * Clean character name by stripping common English honorifics & titles, and map translation aliases
 */
function cleanCharacterName(name: string): string {
  const stripped = name
    .replace(/^(Mr|Mrs|Ms|Miss|Dr|Doctor|Lord|Lady|Sir|Captain|Professor|Father|Prince|Princess|King|Queen|Grandma|Grandpa|Elder)\.?\s+/i, '')
    .trim();

  const lower = stripped.toLowerCase();
  // Map common manga/novel translation aliases (e.g. 4Kids/Viz "Zolo" -> "Zoro")
  if (lower === 'zolo') return 'Zoro';
  if (lower === 'jinbei') return 'Jinbe';

  return stripped;
}

/**
 * Infer universe or franchise from book title and introduction snippet
 */
function detectFranchise(bookTitle?: string, introductionLine?: string): string | null {
  const combined = `${bookTitle || ''} ${introductionLine || ''}`.toLowerCase();
  if (
    combined.includes('one piece') ||
    combined.includes('kuja') ||
    combined.includes('straw hat') ||
    combined.includes('grand line') ||
    combined.includes('shanks') ||
    combined.includes('luffy') ||
    combined.includes('tashigi') ||
    combined.includes('smoker') ||
    combined.includes('hancock') ||
    combined.includes('trafalgar') ||
    combined.includes('doflamingo') ||
    combined.includes('bepo') ||
    combined.includes('polar tang') ||
    combined.includes('heart pirates') ||
    combined.includes('devil fruit')
  ) {
    return 'onepiece';
  }
  if (
    combined.includes('harry potter') ||
    combined.includes('hogwarts') ||
    combined.includes('dumbledore') ||
    combined.includes('voldemort') ||
    combined.includes('gryffindor')
  ) {
    return 'harrypotter';
  }
  if (combined.includes('naruto') || combined.includes('konoha') || combined.includes('hokage')) {
    return 'naruto';
  }
  if (combined.includes('bleach') || combined.includes('soul society') || combined.includes('shinigami')) {
    return 'bleach';
  }
  if (combined.includes('jujutsu kaisen') || combined.includes('gojo') || combined.includes('sukuna')) {
    return 'jujutsu-kaisen';
  }
  if (combined.includes('lord of the rings') || combined.includes('lotr') || combined.includes('middle-earth')) {
    return 'lotr';
  }
  if (combined.includes('game of thrones') || combined.includes('song of ice and fire') || combined.includes('westeros')) {
    return 'gameofthrones';
  }
  if (combined.includes('star wars') || combined.includes('jedi') || combined.includes('sith')) {
    return 'starwars';
  }
  return null;
}

/**
 * Strip markdown, spoilers, and raw HTML formatting from AniList character descriptions
 */
function cleanAniListDescription(desc?: string): string | undefined {
  if (!desc) return undefined;
  const cleaned = desc
    .replace(/~![\s\S]*?!~/g, '') // remove spoiler tags and their contents
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\(Source:.*?\)/gi, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || undefined;
}

/**
 * Clean Wikipedia extract by standardizing whitespace and removing pronunciation tags
 */
function cleanWikipediaExtract(extract?: string): string | undefined {
  if (!extract) return undefined;
  const cleaned = extract
    .replace(/\([^)]*Japanese:[^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
}

/**
 * Extract clean introductory paragraph from Fandom wiki page, stripping TOC buttons & notes
 */
async function fetchFandomLeadSection(title: string, franchise: string): Promise<string | undefined> {
  try {
    const url = `https://${franchise}.fandom.com/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&section=0&format=json&origin=*&redirects=1`;
    const res = await safeFetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return undefined;
    const json = await res.json();
    const html = json.parse?.text?.['*'] || '';
    if (!html) return undefined;

    let text = '';
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('.article-tabs, .hatnote, .dablink, .trfc, aside, table, script, style, nav, .toc, .mw-empty-elt, .reference, .citation').forEach((el) => el.remove());
      text = doc.body.textContent || '';
    } else {
      text = html
        .replace(/<div class="article-tabs"[\s\S]*?<\/div>\s*<\/ul>\s*<\/div>/gi, '')
        .replace(/<aside[\s\S]*?<\/aside>/gi, '')
        .replace(/<table[\s\S]*?<\/table>/gi, '')
        .replace(/<div class="trfc[\s\S]*?<\/div>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ');
    }

    text = text
      .replace(/Introduction\s+Gallery[\s\S]*?Misc\.\s*/gi, '')
      .replace(/For other characters with the same name[^.]*\.\s*/gi, '')
      .replace(/The subject of this article is sometimes called[^.]*\.\s*/gi, '')
      .replace(/\[\s*\d+\s*\]/g, '')
      .replace(/\(\s*[^)]*?\?\s*\)/g, '')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length > 25) {
      if (text.length <= 750) {
        return text;
      }
      const sliced = text.slice(0, 750);
      const lastSentenceEnd = Math.max(
        sliced.lastIndexOf('. '),
        sliced.lastIndexOf('! '),
        sliced.lastIndexOf('? ')
      );
      if (lastSentenceEnd > 120) {
        return sliced.slice(0, lastSentenceEnd + 1).trim();
      }
      return sliced.replace(/\s+\S*$/, '') + '...';
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Query franchise Fandom MediaWiki API for high-resolution transparent character art
 * Uses both exact title match and fallback generator search with CORS origin=* and &redirects=1
 */
async function queryFandom(name: string, franchise: string): Promise<CharacterPortrait | null> {
  try {
    // 1. Try exact title match first (with redirects automatically resolved e.g. "Law" -> "Trafalgar D. Water Law")
    const exactUrl = `https://${franchise}.fandom.com/api.php?action=query&titles=${encodeURIComponent(name)}&prop=pageimages&format=json&pithumbsize=500&origin=*&redirects=1`;
    const exactRes = await safeFetch(exactUrl, { headers: { Accept: 'application/json' } });
    if (exactRes.ok) {
      const exactJson = await exactRes.json();
      const pages = exactJson.query?.pages || {};
      for (const key of Object.keys(pages)) {
        const thumb = pages[key].thumbnail?.source;
        const pageTitle = pages[key].title;
        if (thumb) {
          // Use direct CDN revision URL to avoid Thumblr thumbnail scaler 404s
          const cleanThumb = thumb.replace(/\/scale-to-width-down\/\d+/, '');
          const desc = pageTitle ? await fetchFandomLeadSection(pageTitle, franchise) : undefined;
          return { imageUrl: cleanThumb, source: 'fandom', description: desc };
        }
      }
    }

    // 2. Fallback to generator search for partial or mononym names (e.g. "Hancock" -> "Boa Hancock")
    const searchUrl = `https://${franchise}.fandom.com/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(name)}&gsrlimit=3&prop=pageimages&piprop=thumbnail&pithumbsize=500&format=json&origin=*&redirects=1`;
    const searchRes = await safeFetch(searchUrl, { headers: { Accept: 'application/json' } });
    if (searchRes.ok) {
      const searchJson = await searchRes.json();
      const pages = searchJson.query?.pages || {};
      const sorted = Object.values(pages).sort((a: any, b: any) => (a.index || 99) - (b.index || 99));
      for (const p of sorted as any[]) {
        if (p.thumbnail?.source && !p.title?.includes('Episode') && !p.title?.includes('Chapter')) {
          const cleanThumb = p.thumbnail.source.replace(/\/scale-to-width-down\/\d+/, '');
          const desc = p.title ? await fetchFandomLeadSection(p.title, franchise) : undefined;
          return { imageUrl: cleanThumb, source: 'fandom', description: desc };
        }
      }
    }

    return null;
  } catch (err) {
    logger.debug('[characterImageService] Fandom query failed:', err);
    return null;
  }
}

/**
 * Query AniList GraphQL API with candidate scoring using introduction line & book context
 */
async function queryAniListScored(
  name: string,
  introductionLine?: string,
  bookTitle?: string
): Promise<CharacterPortrait | null> {
  // If AniList rate limited recently, respect cooldown to prevent 429 errors
  if (Date.now() < anilistCooldownUntil) {
    return null;
  }

  try {
    const query = `
      query ($name: String) {
        Page(page: 1, perPage: 8) {
          characters(search: $name) {
            id
            name {
              full
              native
              alternative
            }
            image {
              large
              medium
            }
            description
            media(page: 1, perPage: 5) {
              nodes {
                title {
                  romaji
                  english
                  userPreferred
                }
              }
            }
          }
        }
      }
    `;

    const res = await safeFetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables: { name } }),
    });

    if (res.status === 429) {
      // Cooldown AniList for 65 seconds
      anilistCooldownUntil = Date.now() + 65_000;
      logger.debug('[characterImageService] AniList rate limited (429), cooling down for 65s');
      return null;
    }

    if (!res.ok) return null;
    const json = await res.json();
    const candidates = json?.data?.Page?.characters || [];
    if (!candidates.length) return null;

    const lowerBook = (bookTitle || '').toLowerCase();
    const lowerIntro = (introductionLine || '').toLowerCase();

    // Extract notable keywords (4+ chars) from introduction line
    const introKeywords = lowerIntro
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4);

    let bestCandidate = candidates[0];
    let highestScore = -1;

    for (const c of candidates) {
      let score = 0;
      const allTitles = (c.media?.nodes || [])
        .flatMap((n: any) => [n.title?.romaji, n.title?.english, n.title?.userPreferred])
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const desc = (c.description || '').toLowerCase();

      // Check media match against book title
      if (lowerBook) {
        const bookWords = lowerBook.split(/\s+/).filter((w) => w.length >= 3);
        for (const bw of bookWords) {
          if (allTitles.includes(bw)) score += 40;
        }
      }

      // Check candidate media & description against introduction line
      for (const kw of introKeywords) {
        if (allTitles.includes(kw)) score += 30;
        if (desc.includes(kw)) score += 15;
      }

      // Exact name match bonus
      if (c.name?.full?.toLowerCase() === name.toLowerCase()) {
        score += 20;
      }

      if (score > highestScore) {
        highestScore = score;
        bestCandidate = c;
      }
    }

    const img = bestCandidate.image?.large || bestCandidate.image?.medium;
    if (!img || img.includes('default.jpg')) return null;

    return {
      imageUrl: img,
      nativeName: bestCandidate.name?.native || undefined,
      source: 'anilist',
      description: cleanAniListDescription(bestCandidate.description),
    };
  } catch (err) {
    logger.debug('[characterImageService] AniList query failed:', err);
    return null;
  }
}

/**
 * Query Wikipedia search API with book title context, extracts, and CORS origin=*
 */
async function queryWikipediaSearch(name: string, context?: string): Promise<CharacterPortrait | null> {
  try {
    const q = `${name} ${context || ''}`.trim();
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=3&prop=pageimages|extracts&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=500&format=json&origin=*&redirects=1`;
    const res = await safeFetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const json = await res.json();
    const pages = json.query?.pages || {};
    for (const key of Object.keys(pages)) {
      const thumb = pages[key].thumbnail?.source;
      const extract = pages[key].extract;
      if (thumb || extract) {
        return {
          imageUrl: thumb || null,
          source: 'wikipedia',
          description: cleanWikipediaExtract(extract),
        };
      }
    }
    return null;
  } catch (err) {
    logger.debug('[characterImageService] Wikipedia search failed:', err);
    return null;
  }
}

async function fetchCharacterPortraitInternal(
  rawName: string,
  introductionLine?: string,
  bookTitle?: string,
  cacheKey?: string
): Promise<CharacterPortrait> {
  const cleanName = cleanCharacterName(rawName);
  const franchise = detectFranchise(bookTitle, introductionLine);

  let result: CharacterPortrait | null = null;

  // 1. If franchise recognized (e.g. One Piece, Harry Potter), query specialized Fandom MediaWiki
  if (franchise) {
    result = await queryFandom(cleanName, franchise);
    if (!result && cleanName !== rawName) {
      result = await queryFandom(rawName, franchise);
    }
  }

  // If Fandom found a portrait with a description, return immediately!
  // NEVER call AniList in this case — avoids API flooding and 429 rate limit trips.
  if (result?.imageUrl && result.description) {
    if (cacheKey) {
      MEMORY_CACHE.set(cacheKey, result);
      saveToStoredCache(cacheKey, result);
    }
    return result;
  }

  // 2. Try AniList with candidate scoring (only if not currently cooling down from 429)
  if (Date.now() >= anilistCooldownUntil) {
    if (!result) {
      result = await queryAniListScored(cleanName, introductionLine, bookTitle);
      if (!result && cleanName !== rawName) {
        result = await queryAniListScored(rawName, introductionLine, bookTitle);
      }
    } else if (!result.description) {
      const bio = await queryAniListScored(cleanName, introductionLine, bookTitle);
      if (bio?.description && !result.description) {
        result.description = bio.description;
      }
      if (bio?.nativeName && !result.nativeName) {
        result.nativeName = bio.nativeName;
      }
    }
  }

  // 3. Try Wikipedia with franchise / book context
  if (!result) {
    result = await queryWikipediaSearch(cleanName, franchise || bookTitle);
    if (!result && cleanName !== rawName) {
      result = await queryWikipediaSearch(rawName, franchise || bookTitle);
    }
  } else if (!result.description) {
    const wiki = await queryWikipediaSearch(cleanName, franchise || bookTitle);
    if (wiki?.description) {
      result.description = wiki.description;
    }
  }

  // 4. Cache and return
  if (result?.imageUrl) {
    if (cacheKey) {
      MEMORY_CACHE.set(cacheKey, result);
      saveToStoredCache(cacheKey, result);
    }
    return result;
  }

  // Negative cache for 5 minutes so we don't spam APIs for unknown words/terms
  if (cacheKey) {
    NEGATIVE_CACHE.set(cacheKey, Date.now() + 5 * 60 * 1000);
  }

  const emptyResult: CharacterPortrait = { imageUrl: null };
  if (cacheKey) {
    MEMORY_CACHE.set(cacheKey, emptyResult);
  }
  return emptyResult;
}

/**
 * Fetch character portrait in real time using introduction line and book context.
 * Uses request deduplication and rate-limiting queue.
 */
export async function fetchCharacterPortrait(
  rawName: string,
  introductionLine?: string,
  bookTitle?: string
): Promise<CharacterPortrait> {
  const normalized = rawName.trim().toLowerCase();
  if (!normalized) return { imageUrl: null };

  const cacheKey = `${normalized}::${(bookTitle || '').toLowerCase()}`;

  // 1. Check in-memory cache
  if (MEMORY_CACHE.has(cacheKey)) {
    return MEMORY_CACHE.get(cacheKey)!;
  }

  // 2. Check localStorage cache
  const stored = getStoredCache();
  if (stored[cacheKey]) {
    MEMORY_CACHE.set(cacheKey, stored[cacheKey]);
    return stored[cacheKey];
  }

  // 3. Check negative cache
  const negExpires = NEGATIVE_CACHE.get(cacheKey);
  if (negExpires && Date.now() < negExpires) {
    return { imageUrl: null };
  }

  // 4. In-flight request deduplication
  if (IN_FLIGHT_REQUESTS.has(cacheKey)) {
    return IN_FLIGHT_REQUESTS.get(cacheKey)!;
  }

  const promise = apiQueue.run(() =>
    fetchCharacterPortraitInternal(rawName, introductionLine, bookTitle, cacheKey)
  );

  IN_FLIGHT_REQUESTS.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    IN_FLIGHT_REQUESTS.delete(cacheKey);
  }
}

/**
 * React hook to fetch and reactively observe character portraits with context
 */
export function useCharacterPortrait(name: string, introductionLine?: string, bookTitle?: string) {
  const normalized = name.trim().toLowerCase();
  const cacheKey = `${normalized}::${(bookTitle || '').toLowerCase()}`;

  const [portrait, setPortrait] = useState<CharacterPortrait>(() => {
    if (MEMORY_CACHE.has(cacheKey)) {
      return MEMORY_CACHE.get(cacheKey)!;
    }
    const stored = getStoredCache();
    return stored[cacheKey] || { imageUrl: null };
  });

  const [isLoading, setIsLoading] = useState(!portrait.imageUrl && !MEMORY_CACHE.has(cacheKey));

  useEffect(() => {
    let isMounted = true;

    if (MEMORY_CACHE.has(cacheKey)) {
      setPortrait(MEMORY_CACHE.get(cacheKey)!);
      setIsLoading(false);
      return;
    }

    const stored = getStoredCache();
    if (stored[cacheKey]) {
      MEMORY_CACHE.set(cacheKey, stored[cacheKey]);
      setPortrait(stored[cacheKey]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchCharacterPortrait(name, introductionLine, bookTitle).then((res) => {
      if (isMounted) {
        setPortrait(res);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [name, cacheKey, introductionLine, bookTitle]);

  return { portrait, isLoading };
}
