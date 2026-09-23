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
// Bumped cache key to v12 to flush old anime portraits for western books
const LOCAL_STORAGE_KEY = 'shiori-char-portraits-v12';
const IN_FLIGHT_REQUESTS = new Map<string, Promise<CharacterPortrait>>();
const NEGATIVE_CACHE = new Map<string, number>(); // cacheKey -> expiresAt timestamp
let anilistCooldownUntil = 0;

/**
 * Robust fetch that routes through Tauri Rust backend when running on desktop/mobile
 * to completely eliminate browser CORS origin rejections.
 */
async function safeFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const customHeaders: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'Shiori-Reader/1.0.12 (https://github.com/vinayydv3695/Shiori)',
    ...((init?.headers as Record<string, string>) || {}),
  };
  const requestInit = {
    ...init,
    headers: customHeaders,
  };

  if (isTauri) {
    try {
      return await tauriFetch(url, requestInit);
    } catch (err) {
      logger.debug('[characterImageService] tauriFetch failed, falling back to window.fetch:', err);
    }
  }
  return await fetch(url, requestInit);
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
  if (!portrait.imageUrl && !portrait.description) return;

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
 * Clean book title by removing file extensions, bracket metadata, volume suffixes, etc.
 */
export function cleanBookTitle(title?: string): string {
  if (!title) return '';
  return title
    // Strip file extensions
    .replace(/\.(epub|pdf|mobi|azw3?|cbz|cbr|fb2|docx?|txt|md)$/i, '')
    // Strip common metadata brackets/parentheses like [1999], (Author), (Novel #1)
    .replace(/\[.*?\]|\(.*?\)/g, '')
    // Strip volume / chapter / part suffixes
    .replace(/\b(vol\.|volume|ch\.|chapter|book|part)\s*\d+.*$/i, '')
    // Normalize dashes and underscores
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect whether the reading context is Manga, Light Novel, or Anime-related.
 */
export function isAnimeOrManga(bookTitle?: string, introductionLine?: string): boolean {
  const combined = `${bookTitle || ''} ${introductionLine || ''}`.toLowerCase();

  if (
    combined.includes('manga') ||
    combined.includes('manhwa') ||
    combined.includes('manhua') ||
    combined.includes('light novel') ||
    combined.includes('webtoon') ||
    combined.includes('mangadex') ||
    combined.includes('shonen') ||
    combined.includes('seinen') ||
    combined.includes('shojo')
  ) {
    return true;
  }

  const animeFranchises = [
    'one piece', 'naruto', 'bleach', 'jujutsu kaisen', 'dragon ball',
    'chainsaw man', 'attack on titan', 'demon slayer', 'my hero academia',
    'black clover', 'fairy tail', 'hunter x hunter', 'death note',
    'fullmetal alchemist', 'tokyo ghoul', 'berserk', 'vinland saga',
    'spy x family', 'blue lock', 'haikyuu', 'solo leveling',
    'sword art online', 're:zero', 'mushoku tensei', 'overlord',
    'konosuba', 'frieren', 'dungeon meshi', 'boruto', 'gintama',
    'sailor moon', 'evangelion', 'cowboy bebop', 'jojo', 'baki',
    'dr. stone', 'mob psycho', 'one punch man', 'slime datta ken'
  ];
  if (animeFranchises.some((f) => combined.includes(f))) {
    return true;
  }

  // Japanese script characters (hiragana, katakana, kanji)
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(bookTitle || '')) {
    return true;
  }

  return false;
}

/**
 * Infer universe or franchise from book title and introduction snippet
 */
function detectFranchise(bookTitle?: string, introductionLine?: string): string | null {
  const combined = `${bookTitle || ''} ${introductionLine || ''}`.toLowerCase();
  if (
    combined.includes('one piece') ||
    combined.includes('straw hat') ||
    combined.includes('grand line') ||
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
  if (combined.includes('percy jackson') || combined.includes('camp half blood') || combined.includes('lightning thief')) {
    return 'riordan';
  }
  if (combined.includes('lord of the rings') || combined.includes('lotr') || combined.includes('middle earth') || combined.includes('tolkien')) {
    return 'lotr';
  }
  if (combined.includes('game of thrones') || combined.includes('song of ice and fire') || combined.includes('westeros')) {
    return 'gameofthrones';
  }
  if (combined.includes('dune') || combined.includes('arrakis') || combined.includes('atreides')) {
    return 'dune';
  }
  if (combined.includes('hunger games') || combined.includes('katniss') || combined.includes('panem')) {
    return 'thehungergames';
  }
  if (combined.includes('star wars') || combined.includes('jedi') || combined.includes('sith')) {
    return 'starwars';
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
 * Clean Wikipedia extract by standardizing whitespace and removing pronunciation tags and citations
 */
function cleanWikipediaExtract(extract?: string): string | undefined {
  if (!extract) return undefined;
  const cleaned = extract
    .replace(/\([^)]*(?:Japanese|Chinese|Korean|IPA|pronounced)[^)]*\)/gi, '')
    .replace(/\(\s*;\s*/g, '(')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\d+\]/g, '')
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
    const res = await safeFetch(url);
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
 */
async function queryFandom(name: string, franchise: string): Promise<CharacterPortrait | null> {
  try {
    // 1. Try exact title match first
    const exactUrl = `https://${franchise}.fandom.com/api.php?action=query&titles=${encodeURIComponent(name)}&prop=pageimages&format=json&pithumbsize=600&origin=*&redirects=1`;
    const exactRes = await safeFetch(exactUrl);
    if (exactRes.ok) {
      const exactJson = await exactRes.json();
      const pages = exactJson.query?.pages || {};
      for (const key of Object.keys(pages)) {
        const thumb = pages[key].thumbnail?.source;
        const pageTitle = pages[key].title;
        if (thumb) {
          const cleanThumb = thumb.replace(/\/scale-to-width-down\/\d+/, '');
          const desc = pageTitle ? await fetchFandomLeadSection(pageTitle, franchise) : undefined;
          return { imageUrl: cleanThumb, source: 'fandom', description: desc };
        }
      }
    }

    // 2. Fallback to generator search for partial or mononym names
    const searchUrl = `https://${franchise}.fandom.com/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(name)}&gsrlimit=3&prop=pageimages&piprop=thumbnail&pithumbsize=600&format=json&origin=*&redirects=1`;
    const searchRes = await safeFetch(searchUrl);
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
 * Query AniList GraphQL API with candidate scoring.
 * STRICT: Only called when isAnimeOrManga is true, or candidate media explicitly matches bookTitle!
 */
async function queryAniListScored(
  name: string,
  introductionLine?: string,
  bookTitle?: string
): Promise<CharacterPortrait | null> {
  // If not anime/manga context, AniList MUST NOT be queried to avoid anime character false positives!
  if (!isAnimeOrManga(bookTitle, introductionLine)) {
    return null;
  }

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
      },
      body: JSON.stringify({ query, variables: { name } }),
    });

    if (res.status === 429) {
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

    const introKeywords = lowerIntro
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4);

    let bestCandidate = candidates[0];
    let highestScore = -1;
    let highestMediaMatchScore = 0;

    for (const c of candidates) {
      let score = 0;
      let mediaScore = 0;
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
          if (allTitles.includes(bw)) {
            score += 40;
            mediaScore += 40;
          }
        }
      }

      // Check candidate media & description against introduction line
      for (const kw of introKeywords) {
        if (allTitles.includes(kw)) {
          score += 30;
          mediaScore += 30;
        }
        if (desc.includes(kw)) score += 15;
      }

      // Exact name match bonus
      if (c.name?.full?.toLowerCase() === name.toLowerCase()) {
        score += 20;
      }

      if (score > highestScore) {
        highestScore = score;
        bestCandidate = c;
        highestMediaMatchScore = mediaScore;
      }
    }

    // Require non-zero score when book title is present
    if (lowerBook && highestMediaMatchScore === 0 && !detectFranchise(bookTitle, introductionLine)) {
      return null;
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

// ──────────────────────────────────────────────────────────────────────────
// Wikipedia Book & Movie Adaptation Cast Parser
// ──────────────────────────────────────────────────────────────────────────

interface CastMember {
  actor: string;
  character: string;
  sourcePage: string;
}

const BOOK_CAST_CACHE = new Map<string, Record<string, CastMember>>();
const IN_FLIGHT_CAST_REQUESTS = new Map<string, Promise<Record<string, CastMember>>>();

/**
 * Dynamically resolves and extracts book & movie adaptation cast lists from Wikipedia.
 * E.g. For "The Perks of Being a Wallflower":
 *   Patrick -> Ezra Miller
 *   Sam -> Emma Watson
 *   Charlie -> Logan Lerman
 *   Brad -> Johnny Simmons
 *   Mary Elizabeth -> Mae Whitman
 */
async function getBookCastMap(bookTitle?: string): Promise<Record<string, CastMember>> {
  const cleanBook = cleanBookTitle(bookTitle).toLowerCase();
  if (!cleanBook || cleanBook.length < 3) return {};

  if (BOOK_CAST_CACHE.has(cleanBook)) {
    return BOOK_CAST_CACHE.get(cleanBook)!;
  }

  if (IN_FLIGHT_CAST_REQUESTS.has(cleanBook)) {
    return IN_FLIGHT_CAST_REQUESTS.get(cleanBook)!;
  }

  const promise = (async () => {
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanBook)}&srlimit=4&format=json&origin=*`;
      const searchRes = await safeFetch(searchUrl);
      if (!searchRes.ok) return {};
      const searchJson = await searchRes.json();
      const rawPages = (searchJson.query?.search || []) as any[];

      const candidatePages: string[] = [];
      for (const r of rawPages) {
        const t = r.title as string;
        if (!t) continue;
        const lowerT = t.toLowerCase();
        if (
          !lowerT.includes('soundtrack') &&
          !lowerT.includes('discography') &&
          !lowerT.includes('controversy') &&
          !lowerT.includes('album')
        ) {
          candidatePages.push(t);
        }
      }

      const castMap: Record<string, CastMember> = {};

      for (const pageTitle of candidatePages) {
        const parseUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&format=json&origin=*&redirects=1`;
        const parseRes = await safeFetch(parseUrl);
        if (!parseRes.ok) continue;
        const parseJson = await parseRes.json();
        const html = parseJson.parse?.text?.['*'] || '';
        if (!html) continue;

        const items = html.match(/<li>[\s\S]*?<\/li>/gi) || [];
        for (const item of items) {
          const text = item.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const m = text.match(/([A-Z][a-zA-Z\s\.\'-]+?)\s+as\s+([A-Z][a-zA-Z\s\.\'-]+)/);
          if (m) {
            const actor = m[1].trim();
            const charRaw = m[2].trim().split(/[,;]/)[0].trim();
            if (charRaw.length >= 2 && actor.length >= 3) {
              const fullLower = charRaw.toLowerCase();
              const entry: CastMember = { actor, character: charRaw, sourcePage: pageTitle };
              castMap[fullLower] = entry;

              const firstName = fullLower.split(/\s+/)[0];
              if (firstName && firstName.length >= 3 && !castMap[firstName]) {
                castMap[firstName] = entry;
              }
            }
          }
        }

        if (Object.keys(castMap).length >= 3) {
          break;
        }
      }

      BOOK_CAST_CACHE.set(cleanBook, castMap);
      return castMap;
    } catch (err) {
      logger.debug('[characterImageService] Failed to parse book cast map:', err);
      return {};
    } finally {
      IN_FLIGHT_CAST_REQUESTS.delete(cleanBook);
    }
  })();

  IN_FLIGHT_CAST_REQUESTS.set(cleanBook, promise);
  return promise;
}

/**
 * Score a Wikipedia page candidate for relevance to the queried character and book
 */
function scoreWikipediaPage(p: any, cleanName: string, bookTitle?: string): number {
  let score = 0;
  const title = (p.title || '').toLowerCase();
  const extract = (p.extract || '').toLowerCase();
  const lowerName = cleanName.toLowerCase();
  const lowerBook = (bookTitle || '').toLowerCase();

  // 1. Direct character title match
  if (title === lowerName) {
    score += 150;
  } else if (title === `${lowerName} (character)`) {
    score += 180;
  } else if (title.startsWith(lowerName)) {
    score += 110;
  } else if (title.includes(lowerName)) {
    score += 70;
  }

  // 2. Thumbnail presence (fair-use character posters/photos)
  if (p.thumbnail?.source) {
    score += 50;
  }

  // 3. Fictional character indicators in extract
  if (
    extract.includes('fictional character') ||
    extract.includes('protagonist') ||
    extract.includes('antagonist') ||
    extract.includes('character in') ||
    extract.includes('character created by')
  ) {
    score += 40;
  }

  // 4. Book title / franchise match in extract
  if (lowerBook) {
    const bookKeywords = lowerBook
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    for (const kw of bookKeywords) {
      if (extract.includes(kw)) score += 20;
      if (title.includes(kw)) score += 15;
    }
  }

  // 5. Penalties for non-character pages
  if (title.includes('controversy') || title.includes('discography') || title.includes('soundtrack')) {
    score -= 200;
  }
  if (extract.includes('may refer to:') || extract.includes('can refer to:')) {
    score -= 150;
  }
  if (title.startsWith('list of') && !title.includes(lowerName)) {
    score -= 40;
  }

  // 6. Search ranking index penalty (lower index is better)
  const idx = p.index || 99;
  score -= idx * 2;

  return score;
}

async function queryWikipediaPageDirect(title: string): Promise<{ imageUrl?: string; extract?: string } | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages|extracts&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=600&pilicense=any&format=json&origin=*&redirects=1`;
    const res = await safeFetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const pages = Object.values(json.query?.pages || {}) as any[];
    if (!pages.length) return null;
    const page = pages[0];
    if (page.missing !== undefined || page.pageid < 0) return null;
    return {
      imageUrl: page.thumbnail?.source,
      extract: cleanWikipediaExtract(page.extract),
    };
  } catch {
    return null;
  }
}

async function queryWikipediaGeneratorSearch(
  characterName: string,
  searchQuery: string,
  bookContext?: string
): Promise<CharacterPortrait | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=5&prop=pageimages|extracts&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=600&pilicense=any&format=json&origin=*&redirects=1`;
    const res = await safeFetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const pages = Object.values(json.query?.pages || {}) as any[];
    if (!pages.length) return null;

    const scored = pages.map((p) => ({
      page: p,
      score: scoreWikipediaPage(p, characterName, bookContext),
    }));

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    if (!best || best.score < 30) return null;

    const thumb = best.page.thumbnail?.source || null;
    const extract = cleanWikipediaExtract(best.page.extract);

    if (!thumb && !extract) return null;

    return {
      imageUrl: thumb,
      source: 'wikipedia',
      description: extract,
    };
  } catch (err) {
    logger.debug('[characterImageService] Wikipedia generator search failed:', err);
    return null;
  }
}

async function queryWikipediaExactTitles(name: string): Promise<CharacterPortrait | null> {
  try {
    const titles = `${encodeURIComponent(name)}|${encodeURIComponent(name + ' (character)')}`;
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${titles}&prop=pageimages|extracts&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=600&pilicense=any&format=json&origin=*&redirects=1`;
    const res = await safeFetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const pages = Object.values(json.query?.pages || {}) as any[];
    for (const p of pages) {
      if (p.missing !== undefined || p.pageid < 0) continue;
      const thumb = p.thumbnail?.source || null;
      const extract = cleanWikipediaExtract(p.extract);
      if (thumb || extract) {
        return {
          imageUrl: thumb,
          source: 'wikipedia',
          description: extract,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Query Wikipedia comprehensively for characters in books, literature, and films.
 */
async function queryWikipediaCharacter(
  name: string,
  rawName: string,
  bookTitle?: string
): Promise<CharacterPortrait | null> {
  const cleanBook = cleanBookTitle(bookTitle);
  const cleanNameLower = name.toLowerCase();
  const rawNameLower = rawName.toLowerCase();

  // 1. Check Adaptation / Movie Cast mapping first!
  // E.g. "Patrick" in "The Perks of Being a Wallflower" -> Ezra Miller as Patrick
  // E.g. "Sam" in "The Perks of Being a Wallflower" -> Emma Watson as Sam
  // E.g. "Brad" in "The Perks of Being a Wallflower" -> Johnny Simmons as Brad
  if (cleanBook) {
    const castMap = await getBookCastMap(bookTitle);
    const match = castMap[cleanNameLower] || castMap[rawNameLower];
    if (match) {
      const actorPortrait = await queryWikipediaPageDirect(match.actor);
      if (actorPortrait?.imageUrl) {
        const bookDisplayName = cleanBook
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        const desc = `${match.character} is a central character in ${bookDisplayName}, portrayed by ${match.actor} in the film adaptation.`;
        return {
          imageUrl: actorPortrait.imageUrl,
          source: 'wikipedia',
          description: desc,
        };
      }
    }
  }

  // 2. Direct Search on Wikipedia with Character Name + Book Title Context
  const queries: string[] = [];
  if (cleanBook) {
    queries.push(`${name} ${cleanBook}`);
  }
  queries.push(name);
  if (rawName !== name) {
    queries.push(rawName);
  }

  for (const q of queries) {
    const res = await queryWikipediaGeneratorSearch(name, q, cleanBook);
    if (res?.imageUrl || res?.description) {
      return res;
    }
  }

  // 3. Fallback: Query exact character titles on Wikipedia
  const exactRes = await queryWikipediaExactTitles(name);
  if (exactRes?.imageUrl || exactRes?.description) {
    return exactRes;
  }

  return null;
}

async function fetchCharacterPortraitInternal(
  rawName: string,
  introductionLine?: string,
  bookTitle?: string,
  cacheKey?: string
): Promise<CharacterPortrait> {
  const cleanName = cleanCharacterName(rawName);
  const franchise = detectFranchise(bookTitle, introductionLine);
  const isManga = isAnimeOrManga(bookTitle, introductionLine);

  let result: CharacterPortrait | null = null;

  if (isManga) {
    // ─────────────── MANGA / ANIME WORKFLOW ───────────────
    // 1. Franchise Fandom (e.g. One Piece, Naruto)
    if (franchise) {
      result = await queryFandom(cleanName, franchise);
      if (!result && cleanName !== rawName) {
        result = await queryFandom(rawName, franchise);
      }
    }

    // 2. AniList Scored
    if (!result?.imageUrl || !result?.description) {
      if (Date.now() >= anilistCooldownUntil) {
        const ani = await queryAniListScored(cleanName, introductionLine, bookTitle);
        if (ani) {
          if (!result) {
            result = ani;
          } else {
            if (!result.imageUrl && ani.imageUrl) result.imageUrl = ani.imageUrl;
            if (!result.description && ani.description) result.description = ani.description;
            if (!result.nativeName && ani.nativeName) result.nativeName = ani.nativeName;
          }
        }
      }
    }

    // 3. Wikipedia Fallback for Manga
    if (!result?.imageUrl || !result?.description) {
      const wiki = await queryWikipediaCharacter(cleanName, rawName, bookTitle);
      if (wiki) {
        if (!result) {
          result = wiki;
        } else {
          if (!result.imageUrl && wiki.imageUrl) result.imageUrl = wiki.imageUrl;
          if (!result.description && wiki.description) result.description = wiki.description;
        }
      }
    }
  } else {
    // ─────────────── NOVELS / BOOKS / WESTERN LITERATURE ───────────────
    // 1. Wikipedia FIRST (Checks Adaptation Cast Map, direct search, and exact titles)
    result = await queryWikipediaCharacter(cleanName, rawName, bookTitle);

    // 2. Franchise Fandom (e.g. Harry Potter, Lord of the Rings, Dune, Hunger Games)
    if ((!result?.imageUrl || !result?.description) && franchise) {
      const fandom = await queryFandom(cleanName, franchise);
      if (fandom) {
        if (!result) {
          result = fandom;
        } else {
          if (!result.imageUrl && fandom.imageUrl) result.imageUrl = fandom.imageUrl;
          if (!result.description && fandom.description) result.description = fandom.description;
        }
      }
    }

    // Note: AniList is INTENTIONALLY NOT CALLED for non-manga books!
    // This ensures western books like "The Perks of Being a Wallflower" or "Harry Potter"
    // will NEVER show random anime characters or Japanese katakana names!
  }

  // 4. Cache and return
  if (result?.imageUrl || result?.description) {
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
