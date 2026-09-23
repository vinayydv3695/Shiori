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
// Bumped cache key to v13 to flush stale book-cover image entries and rebuild character dossiers
const LOCAL_STORAGE_KEY = 'shiori-char-portraits-v13';
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
    'User-Agent': 'Shiori-Reader/1.0.13 (https://github.com/vinayydv3695/Shiori)',
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

  // Literary & Novel Franchises
  if (
    combined.includes('harry potter') ||
    combined.includes('hogwarts') ||
    combined.includes('dumbledore') ||
    combined.includes('voldemort') ||
    combined.includes('gryffindor')
  ) {
    return 'harrypotter';
  }
  if (
    combined.includes('sherlock') ||
    combined.includes('holmes') ||
    combined.includes('baker street') ||
    combined.includes('conan doyle')
  ) {
    return 'bakerstreet';
  }
  if (
    combined.includes('percy jackson') ||
    combined.includes('camp half blood') ||
    combined.includes('lightning thief') ||
    combined.includes('rick riordan')
  ) {
    return 'riordan';
  }
  if (
    combined.includes('lord of the rings') ||
    combined.includes('lotr') ||
    combined.includes('middle earth') ||
    combined.includes('tolkien') ||
    combined.includes('the hobbit')
  ) {
    return 'lotr';
  }
  if (
    combined.includes('game of thrones') ||
    combined.includes('song of ice and fire') ||
    combined.includes('westeros') ||
    combined.includes('targaryen')
  ) {
    return 'gameofthrones';
  }
  if (
    combined.includes('dune') ||
    combined.includes('arrakis') ||
    combined.includes('atreides') ||
    combined.includes('frank herbert')
  ) {
    return 'dune';
  }
  if (
    combined.includes('hunger games') ||
    combined.includes('katniss') ||
    combined.includes('panem') ||
    combined.includes('mockingjay')
  ) {
    return 'thehungergames';
  }
  if (
    combined.includes('arsene lupin') ||
    combined.includes('arsène lupin') ||
    combined.includes('gentleman burglar') ||
    combined.includes('gentleman-cambrioleur') ||
    combined.includes('maurice leblanc')
  ) {
    return 'lupin';
  }
  if (
    combined.includes('agatha christie') ||
    combined.includes('hercule poirot') ||
    combined.includes('poirot') ||
    combined.includes('miss marple')
  ) {
    return 'agathachristie';
  }
  if (
    combined.includes('twilight') ||
    combined.includes('edward cullen') ||
    combined.includes('bella swan')
  ) {
    return 'twilight';
  }
  if (
    combined.includes('stephen king') ||
    combined.includes('dark tower') ||
    combined.includes('gunslinger')
  ) {
    return 'stephenking';
  }
  if (
    combined.includes('narnia') ||
    combined.includes('aslan') ||
    combined.includes('c.s. lewis')
  ) {
    return 'narnia';
  }
  if (
    combined.includes('wheel of time') ||
    combined.includes('robert jordan') ||
    combined.includes('rand al\'thor')
  ) {
    return 'wot';
  }
  if (
    combined.includes('discworld') ||
    combined.includes('terry pratchett') ||
    combined.includes('ankh-morpork')
  ) {
    return 'discworld';
  }
  if (
    combined.includes('maze runner') ||
    combined.includes('glade') ||
    combined.includes('james dashner')
  ) {
    return 'mazerunner';
  }
  if (
    combined.includes('grisha') ||
    combined.includes('shadow and bone') ||
    combined.includes('six of crows') ||
    combined.includes('leigh bardugo')
  ) {
    return 'thegrishaverse';
  }
  if (
    combined.includes('shadowhunter') ||
    combined.includes('mortal instruments') ||
    combined.includes('cassandra clare')
  ) {
    return 'shadowhunters';
  }
  if (
    combined.includes('witcher') ||
    combined.includes('geralt') ||
    combined.includes('rivia')
  ) {
    return 'witcher';
  }
  if (
    combined.includes('vampire chronicles') ||
    combined.includes('lestat') ||
    combined.includes('anne rice')
  ) {
    return 'vampirechronicles';
  }
  if (
    combined.includes('hitchhiker') ||
    combined.includes('douglas adams') ||
    combined.includes('arthur dent')
  ) {
    return 'hitchhikers';
  }
  if (
    combined.includes('dracula') ||
    combined.includes('bram stoker') ||
    combined.includes('van helsing')
  ) {
    return 'dracula';
  }
  if (
    combined.includes('star wars') ||
    combined.includes('jedi') ||
    combined.includes('sith')
  ) {
    return 'starwars';
  }

  // Manga / Anime Franchises
  if (
    combined.includes('one piece') ||
    combined.includes('straw hat') ||
    combined.includes('grand line') ||
    combined.includes('devil fruit')
  ) {
    return 'onepiece';
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
  if (combined.includes('dragon ball') || combined.includes('goku') || combined.includes('saiyan')) {
    return 'dragonball';
  }
  if (combined.includes('attack on titan') || combined.includes('shingeki') || combined.includes('eren yeager')) {
    return 'attackontitan';
  }
  if (combined.includes('my hero academia') || combined.includes('boku no hero') || combined.includes('deku')) {
    return 'myheroacademia';
  }
  if (combined.includes('demon slayer') || combined.includes('kimetsu') || combined.includes('tanjiro')) {
    return 'kimetsu-no-yaiba';
  }
  if (combined.includes('chainsaw man') || combined.includes('denji') || combined.includes('makima')) {
    return 'chainsaw-man';
  }
  if (combined.includes('death note') || combined.includes('light yagami') || combined.includes('ryuk')) {
    return 'deathnote';
  }
  if (combined.includes('tokyo ghoul') || combined.includes('kaneki')) {
    return 'tokyoghoul';
  }
  if (combined.includes('berserk') || combined.includes('guts') || combined.includes('griffith')) {
    return 'berserk';
  }
  if (combined.includes('hunter x hunter') || combined.includes('killua') || combined.includes('gon freecss')) {
    return 'hunterxhunter';
  }
  if (combined.includes('fullmetal alchemist') || combined.includes('elric')) {
    return 'fma';
  }
  if (combined.includes('frieren')) {
    return 'frieren';
  }
  if (combined.includes('dungeon meshi') || combined.includes('delicious in dungeon')) {
    return 'delicious-in-dungeon';
  }
  if (combined.includes('solo leveling') || combined.includes('sung jinwoo')) {
    return 'solo-leveling';
  }
  if (combined.includes('spy x family') || combined.includes('anya forger') || combined.includes('loid forger')) {
    return 'spy-x-family';
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
 * Detects whether an image URL or page context represents a book cover,
 * publication jacket, or frontispiece rather than an individual character's face.
 */
function isBookCoverImage(url?: string | null, pageTitle?: string, bookTitle?: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();

  const coverKeywords = [
    'cover',
    'jacket',
    'edition',
    'first_edition',
    'title_page',
    'frontispiece',
    'hardcover',
    'paperback',
    'binding',
    'cambrioleur',
    'dust_jacket',
    'novel_cover',
    'book_cover',
    'children%27s_books',
    '1001_books',
    'publishing',
    'magazine_cover',
    'comic_cover',
  ];

  if (coverKeywords.some((kw) => lowerUrl.includes(kw))) {
    return true;
  }

  // If page title is the book's own title, its lead thumbnail is virtually always the book cover!
  if (pageTitle && bookTitle) {
    const cleanBook = cleanBookTitle(bookTitle).toLowerCase();
    const cleanPage = pageTitle.toLowerCase();
    if (cleanBook && cleanPage.includes(cleanBook)) {
      return true;
    }
  }

  return false;
}

/**
 * Verifies whether a Wikipedia page title actually refers to the queried character (or actor)
 * and is NOT a page about the whole novel, series, author, or unrelated subject.
 */
function isCharacterArticle(pageTitle: string, characterName: string, actorName?: string): boolean {
  const pLower = pageTitle.toLowerCase();
  const cLower = characterName.toLowerCase();

  // 1. Actor match for movie/tv adaptations (e.g. "Ezra Miller" for Patrick)
  if (actorName && pLower.includes(actorName.toLowerCase())) {
    return true;
  }

  // 2. Exact name or "(character)" / "(novel character)" qualifier
  if (pLower === cLower || pLower.startsWith(`${cLower} (`)) {
    return true;
  }

  // 3. Name token match (e.g. "Lupin" in "Arsène Lupin", "Dumbledore" in "Albus Dumbledore")
  const tokens = cLower.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length > 0 && tokens.every((t) => pLower.includes(t))) {
    return true;
  }
  if (tokens.length > 1 && tokens.some((t) => pLower.includes(t))) {
    return true;
  }

  return false;
}

const BOOK_TEXT_CACHE = new Map<string, string>();
const IN_FLIGHT_BOOK_TEXT = new Map<string, Promise<string | null>>();

/**
 * Dynamically fetches and caches the parsed text of a book's Wikipedia article
 * to extract character-specific mentions without making repetitive network calls.
 */
async function getBookWikipediaText(bookTitle?: string): Promise<string | null> {
  const cleanBook = cleanBookTitle(bookTitle).toLowerCase();
  if (!cleanBook || cleanBook.length < 3) return null;

  if (BOOK_TEXT_CACHE.has(cleanBook)) {
    return BOOK_TEXT_CACHE.get(cleanBook) || null;
  }
  if (IN_FLIGHT_BOOK_TEXT.has(cleanBook)) {
    return IN_FLIGHT_BOOK_TEXT.get(cleanBook)!;
  }

  const promise = (async () => {
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanBook)}&srlimit=3&format=json&origin=*`;
      const searchRes = await safeFetch(searchUrl);
      if (!searchRes.ok) return null;
      const searchJson = await searchRes.json();
      const firstResult = searchJson.query?.search?.[0]?.title;
      if (!firstResult) return null;

      const parseUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(firstResult)}&prop=text&format=json&origin=*&redirects=1`;
      const parseRes = await safeFetch(parseUrl);
      if (!parseRes.ok) return null;
      const parseJson = await parseRes.json();
      const html = parseJson.parse?.text?.['*'] || '';
      if (!html) return null;

      const cleaned = html
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<table[\s\S]*?<\/table>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[\d+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      BOOK_TEXT_CACHE.set(cleanBook, cleaned);
      return cleaned;
    } catch (err) {
      logger.debug('[characterImageService] getBookWikipediaText failed:', err);
      return null;
    } finally {
      IN_FLIGHT_BOOK_TEXT.delete(cleanBook);
    }
  })();

  IN_FLIGHT_BOOK_TEXT.set(cleanBook, promise);
  return promise;
}

/**
 * Extracts specific sentences from the book's Wikipedia article that mention the character.
 * e.g. Miss Nelly -> "A woman's jewels are stolen and d'Andrèzy courts Miss Nelly..."
 */
function extractCharacterMentionsFromBookText(
  name: string,
  bookText: string,
  maxSentences = 3
): string | undefined {
  if (!bookText || !name || name.length < 2) return undefined;

  const rawSentences = bookText.split(/(?<=[.!?])\s+(?=[A-Z0-9"“'‘])/);
  const nameLower = name.toLowerCase();
  const nameTokens = nameLower.split(/\s+/).filter((t) => t.length >= 3);

  const matches: { priority: number; text: string }[] = [];

  for (const s of rawSentences) {
    const cleanS = s.trim();
    if (cleanS.length < 25 || cleanS.length > 350) continue;
    const sLower = cleanS.toLowerCase();

    // Skip publication/metadata sentences
    if (
      sLower.includes('first published') ||
      sLower.includes('short stories published') ||
      sLower.includes('is a collection of') ||
      sLower.includes('isbn') ||
      sLower.includes('table of contents')
    ) {
      continue;
    }

    // Exact full name match has highest priority
    if (sLower.includes(nameLower)) {
      matches.push({ priority: 10, text: cleanS });
    } else if (nameTokens.some((t) => sLower.includes(t))) {
      matches.push({ priority: 5, text: cleanS });
    }
  }

  if (matches.length === 0) return undefined;

  matches.sort((a, b) => b.priority - a.priority);
  const selected = matches.slice(0, maxSentences).map((m) => m.text);
  return selected.join(' ');
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

  // 2. Heavy PENALTY if title is the book itself, because this article is about the book, NOT the character!
  if (lowerBook && (title === lowerBook || title.includes(lowerBook)) && !title.includes(lowerName)) {
    score -= 100;
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

  // 4. Book title match in extract (only bonus if title is already character-related)
  if (lowerBook && score > 0) {
    const bookKeywords = lowerBook
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    for (const kw of bookKeywords) {
      if (extract.includes(kw)) score += 15;
    }
  }

  // 5. Penalties for non-character pages
  if (title.includes('controversy') || title.includes('discography') || title.includes('soundtrack') || title.includes('1001 children')) {
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

    // Check if the page is genuinely a character page
    const isChar = isCharacterArticle(best.page.title, characterName);
    const isCover = isBookCoverImage(best.page.thumbnail?.source, best.page.title, bookContext);

    // CRITICAL: A thumbnail is ONLY a character's face if the page is about the character and NOT a book cover!
    const thumb = isChar && !isCover ? (best.page.thumbnail?.source || null) : null;
    const extract = isChar ? cleanWikipediaExtract(best.page.extract) : undefined;

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

async function queryWikipediaExactTitles(name: string, bookTitle?: string): Promise<CharacterPortrait | null> {
  try {
    const titles = `${encodeURIComponent(name)}|${encodeURIComponent(name + ' (character)')}`;
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${titles}&prop=pageimages|extracts&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=600&pilicense=any&format=json&origin=*&redirects=1`;
    const res = await safeFetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const pages = Object.values(json.query?.pages || {}) as any[];
    for (const p of pages) {
      if (p.missing !== undefined || p.pageid < 0) continue;
      const isChar = isCharacterArticle(p.title, name);
      if (!isChar) continue;

      const extract = cleanWikipediaExtract(p.extract);
      if (extract?.includes('may refer to:') || extract?.includes('can refer to:')) continue;

      const isCover = isBookCoverImage(p.thumbnail?.source, p.title, bookTitle);
      const thumb = !isCover ? (p.thumbnail?.source || null) : null;

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
  bookTitle?: string,
  introductionLine?: string
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
  const exactRes = await queryWikipediaExactTitles(name, bookTitle);
  if (exactRes?.imageUrl || exactRes?.description) {
    return exactRes;
  }

  // 4. Secondary Characters: Extract mentions from the Book's Wikipedia Article text!
  // E.g. "Miss Nelly", "Varin", "Daspry" in "Arsène Lupin, Gentleman Burglar"
  if (cleanBook) {
    const bookText = await getBookWikipediaText(cleanBook);
    if (bookText) {
      const mentions =
        extractCharacterMentionsFromBookText(name, bookText) ||
        (rawName !== name ? extractCharacterMentionsFromBookText(rawName, bookText) : undefined);

      if (mentions) {
        return {
          imageUrl: null, // CRITICAL: Never assign the book cover to secondary characters!
          source: 'wikipedia',
          description: mentions,
        };
      }
    }
  }

  // 5. In-novel introduction line fallback
  if (introductionLine && introductionLine.trim().length > 15) {
    return {
      imageUrl: null,
      source: 'wikipedia',
      description: introductionLine.trim(),
    };
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
      const wiki = await queryWikipediaCharacter(cleanName, rawName, bookTitle, introductionLine);
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
    // 1. Franchise Fandom FIRST when a dedicated literary universe is detected
    // (e.g. Harry Potter, Baker Street / Sherlock Holmes, Percy Jackson, Lupin, LOTR, Dune, Hunger Games)
    if (franchise) {
      result = await queryFandom(cleanName, franchise);
      if (!result && cleanName !== rawName) {
        result = await queryFandom(rawName, franchise);
      }
    }

    // 2. Wikipedia Comprehensive Pipeline (Cast Map -> Character Pages -> Book Mentions -> Intro snippet)
    if (!result?.imageUrl || !result?.description) {
      const wiki = await queryWikipediaCharacter(cleanName, rawName, bookTitle, introductionLine);
      if (wiki) {
        if (!result) {
          result = wiki;
        } else {
          if (!result.imageUrl && wiki.imageUrl) result.imageUrl = wiki.imageUrl;
          if (!result.description && wiki.description) result.description = wiki.description;
        }
      }
    }

    // 3. Dynamic Fandom Check for book titles without hardcoded franchise
    if ((!result?.imageUrl || !result?.description) && bookTitle && !franchise) {
      const cleanBook = cleanBookTitle(bookTitle);
      const bookSlug = cleanBook.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (bookSlug.length >= 4 && bookSlug.length <= 25) {
        const dynamicFandom = await queryFandom(cleanName, bookSlug);
        if (dynamicFandom) {
          if (!result) {
            result = dynamicFandom;
          } else {
            if (!result.imageUrl && dynamicFandom.imageUrl) result.imageUrl = dynamicFandom.imageUrl;
            if (!result.description && dynamicFandom.description) result.description = dynamicFandom.description;
          }
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

/**
 * Synchronously retrieves a cached character portrait if available in memory or localStorage
 */
export function getCachedCharacterPortrait(name: string, bookTitle?: string): CharacterPortrait | null {
  const normalized = name.trim().toLowerCase();
  const cacheKey = `${normalized}::${(bookTitle || '').toLowerCase()}`;
  if (MEMORY_CACHE.has(cacheKey)) {
    return MEMORY_CACHE.get(cacheKey)!;
  }
  const stored = getStoredCache();
  if (stored[cacheKey]) {
    MEMORY_CACHE.set(cacheKey, stored[cacheKey]);
    return stored[cacheKey];
  }
  return null;
}

/**
 * Prefetches portraits for a batch of character names (used by the relationship graph)
 */
export async function prefetchCharacterPortraits(
  names: string[],
  bookTitle?: string
): Promise<Record<string, CharacterPortrait>> {
  const results: Record<string, CharacterPortrait> = {};
  const missing: string[] = [];

  for (const name of names) {
    const cached = getCachedCharacterPortrait(name, bookTitle);
    if (cached) {
      results[name] = cached;
    } else {
      missing.push(name);
    }
  }

  // Fetch missing concurrently with rate limiting
  await Promise.allSettled(
    missing.slice(0, 30).map(async (name) => {
      try {
        const p = await fetchCharacterPortrait(name, undefined, bookTitle);
        if (p && (p.imageUrl || p.description)) {
          results[name] = p;
        }
      } catch {
        // Ignore errors
      }
    })
  );

  return results;
}
