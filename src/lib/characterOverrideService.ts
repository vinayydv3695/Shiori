import {
  safeFetch,
  cleanBookTitle,
  setCachedPortrait,
  removeCachedPortrait,
  type CharacterPortrait,
} from './characterImageService';
import { logger } from './logger';
import type { TrackedCharacter } from './characterTracker';

export interface CharacterSearchResult {
  id: string | number;
  name: string;
  nativeName?: string;
  imageUrl?: string | null;
  description?: string;
  source: 'anilist' | 'fandom' | 'wikipedia' | 'custom';
  mediaTitle?: string;
}

export interface CharacterOverride {
  originalName: string;
  resolvedName: string;
  imageUrl?: string | null;
  nativeName?: string;
  description?: string;
  source?: 'anilist' | 'fandom' | 'wikipedia' | 'custom';
  updatedAt: number;
}

const OVERRIDE_STORAGE_PREFIX = 'shiori-char-overrides-';
const PORTRAIT_STORAGE_KEY = 'shiori-char-portraits-v13';

/**
 * Searches AniList, Franchise Fandom Wiki, and Wikipedia for character candidates matching a user query.
 * Results matching the current book title are boosted to the top of the list.
 */
export async function searchCharacterOnline(
  query: string,
  bookTitle?: string
): Promise<CharacterSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const results: CharacterSearchResult[] = [];
  const cleanBook = (bookTitle ? cleanBookTitle(bookTitle) : '').toLowerCase();

  // Run AniList, Fandom, and Wikipedia searches concurrently
  const [aniListRes, fandomRes, wikiRes] = await Promise.allSettled([
    searchAniListCharacters(cleanQuery),
    searchFandomCharacters(cleanQuery, bookTitle),
    searchWikipediaCharacters(cleanQuery, bookTitle),
  ]);

  if (fandomRes.status === 'fulfilled' && fandomRes.value) {
    results.push(...fandomRes.value);
  }

  if (aniListRes.status === 'fulfilled' && aniListRes.value) {
    results.push(...aniListRes.value);
  }

  if (wikiRes.status === 'fulfilled' && wikiRes.value) {
    results.push(...wikiRes.value);
  }

  // Deduplicate by name + image
  const seen = new Set<string>();
  const deduped: CharacterSearchResult[] = [];
  for (const item of results) {
    const key = `${item.name.toLowerCase()}::${item.source}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  // Score & sort results so relevant media matches appear first
  return deduped.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    if (cleanBook) {
      if (a.mediaTitle && cleanBook.includes(a.mediaTitle.toLowerCase())) scoreA += 6;
      if (b.mediaTitle && cleanBook.includes(b.mediaTitle.toLowerCase())) scoreB += 6;
    }

    // Fandom match for detected franchise gets strong boost
    if (a.source === 'fandom') scoreA += 4;
    if (b.source === 'fandom') scoreB += 4;

    // Exact name match boost
    if (a.name.toLowerCase() === cleanQuery.toLowerCase()) scoreA += 3;
    if (b.name.toLowerCase() === cleanQuery.toLowerCase()) scoreB += 3;

    // Has image boost
    if (a.imageUrl) scoreA += 2;
    if (b.imageUrl) scoreB += 2;

    return scoreB - scoreA;
  });
}

/**
 * Infer Fandom wiki subdomain from book title
 */
function inferFandomFranchise(bookTitle?: string): string | null {
  if (!bookTitle) return null;
  const lower = bookTitle.toLowerCase();

  if (lower.includes('re:zero') || lower.includes('rezero') || lower.includes('starting life in another world')) return 'rezero';
  if (lower.includes('one piece')) return 'onepiece';
  if (lower.includes('naruto') || lower.includes('boruto')) return 'naruto';
  if (lower.includes('bleach')) return 'bleach';
  if (lower.includes('jujutsu kaisen') || lower.includes('jjk')) return 'jujutsu-kaisen';
  if (lower.includes('mushoku tensei') || lower.includes('jobless reincarnation')) return 'mushokutensei';
  if (lower.includes('slime') || lower.includes('tensura') || lower.includes('reincarnated as a slime')) return 'tensura';
  if (lower.includes('overlord')) return 'overlord';
  if (lower.includes('sword art online') || lower.includes('sao')) return 'swordartonline';
  if (lower.includes('konosuba')) return 'konosuba';
  if (lower.includes('classroom of the elite') || lower.includes('youkoso jitsuryoku')) return 'you-zitsu';
  if (lower.includes('danmachi') || lower.includes('wrong to try to pick up girls in a dungeon')) return 'danmachi';
  if (lower.includes('harry potter')) return 'harrypotter';
  if (lower.includes('percy jackson')) return 'riordan';
  if (lower.includes('lord of the rings') || lower.includes('tolkien')) return 'lotr';
  if (lower.includes('game of thrones') || lower.includes('song of ice and fire')) return 'gameofthrones';
  if (lower.includes('dune')) return 'dune';
  if (lower.includes('hunger games')) return 'thehungergames';

  // Fallback to sanitized title slug
  const clean = cleanBookTitle(bookTitle).toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean.length >= 4 && clean.length <= 25 ? clean : null;
}

/**
 * Search franchise Fandom wiki for character matches
 */
async function searchFandomCharacters(query: string, bookTitle?: string): Promise<CharacterSearchResult[]> {
  const franchise = inferFandomFranchise(bookTitle);
  if (!franchise) return [];

  try {
    const url = `https://${franchise}.fandom.com/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      query
    )}&gsrlimit=6&prop=pageimages|extracts&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=600&format=json&origin=*&redirects=1`;

    const res = await safeFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data?.query?.pages || {};

    const list: CharacterSearchResult[] = [];
    for (const [key, p] of Object.entries(pages) as [string, any][]) {
      const title = p.title || '';
      // Filter out non-character pages (e.g. "Gallery", "Relationships", "Episode", "Volume")
      if (
        title.includes('/Gallery') ||
        title.includes('/Image Gallery') ||
        title.includes('/Relationships') ||
        title.includes('/Synopsis')
      ) {
        continue;
      }

      list.push({
        id: `fandom-${key}`,
        name: title,
        imageUrl: p.thumbnail?.source || null,
        description: p.extract || undefined,
        source: 'fandom' as const,
        mediaTitle: `${franchise.toUpperCase()} Fandom Wiki`,
      });
    }
    return list;
  } catch (err) {
    logger.debug('[characterOverrideService] Fandom search failed:', err);
    return [];
  }
}

/**
 * Search AniList GraphQL for character matches
 */
async function searchAniListCharacters(query: string): Promise<CharacterSearchResult[]> {
  const gql = `
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
          media(page: 1, perPage: 3) {
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

  try {
    const res = await safeFetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: gql, variables: { name: query } }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const characters = data?.data?.Page?.characters || [];

    return characters.map((c: any) => {
      const mediaNode = c.media?.nodes?.[0];
      const mediaTitle = mediaNode?.title?.english || mediaNode?.title?.romaji || mediaNode?.title?.userPreferred || '';

      return {
        id: `anilist-${c.id}`,
        name: c.name?.full || query,
        nativeName: c.name?.native || undefined,
        imageUrl: c.image?.large || c.image?.medium || null,
        description: c.description || undefined,
        source: 'anilist' as const,
        mediaTitle: mediaTitle || undefined,
      };
    });
  } catch (err) {
    logger.debug('[characterOverrideService] AniList search failed:', err);
    return [];
  }
}

/**
 * Search Wikipedia for character matches
 */
async function searchWikipediaCharacters(query: string, bookTitle?: string): Promise<CharacterSearchResult[]> {
  try {
    const searchTerms = bookTitle ? `${query} ${cleanBookTitle(bookTitle)}` : query;
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      searchTerms
    )}&gsrlimit=6&prop=pageimages|extracts&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=600&pilicense=any&format=json&origin=*&redirects=1`;

    const res = await safeFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data?.query?.pages || {};

    return Object.values(pages).map((p: any) => ({
      id: `wiki-${p.pageid}`,
      name: p.title || query,
      imageUrl: p.thumbnail?.source || null,
      description: p.extract || undefined,
      source: 'wikipedia' as const,
    }));
  } catch (err) {
    logger.debug('[characterOverrideService] Wikipedia search failed:', err);
    return [];
  }
}

/**
 * Retrieves all saved character overrides for a given book
 */
export function getCharacterOverrides(bookId: number): Record<string, CharacterOverride> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`${OVERRIDE_STORAGE_PREFIX}${bookId}`);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Checks if a specific character has an active override in this book
 */
export function getCharacterOverride(
  bookId: number,
  name: string
): CharacterOverride | null {
  const overrides = getCharacterOverrides(bookId);
  const lower = name.trim().toLowerCase();

  for (const [key, ov] of Object.entries(overrides)) {
    if (
      key.toLowerCase() === lower ||
      ov.originalName.toLowerCase() === lower ||
      ov.resolvedName.toLowerCase() === lower
    ) {
      return ov;
    }
  }
  return null;
}

/**
 * Saves a character override for a book and updates the portrait cache immediately
 */
export function saveCharacterOverride(
  bookId: number,
  override: CharacterOverride,
  bookTitle?: string
): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const existing = getCharacterOverrides(bookId);
    existing[override.originalName] = override;
    localStorage.setItem(`${OVERRIDE_STORAGE_PREFIX}${bookId}`, JSON.stringify(existing));

    // Update portrait cache in memory and storage for both original and resolved name
    const portraitData: CharacterPortrait = {
      imageUrl: override.imageUrl !== undefined ? override.imageUrl : null,
      nativeName: override.nativeName,
      source: override.source,
      description: override.description,
    };
    setCachedPortrait(override.originalName, bookTitle, portraitData);
    setCachedPortrait(override.resolvedName, bookTitle, portraitData);

    // Broadcast change event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('shiori-character-overrides-changed', {
          detail: { bookId, override },
        })
      );
    }
  } catch (err) {
    logger.error('[characterOverrideService] Failed to save override:', err);
  }
}

/**
 * Reverts a character override back to original
 */
export function removeCharacterOverride(
  bookId: number,
  originalName: string,
  bookTitle?: string
): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const existing = getCharacterOverrides(bookId);
    let removedKey: string | null = null;
    let removedResolvedName: string | null = null;
    const lower = originalName.trim().toLowerCase();

    for (const key of Object.keys(existing)) {
      if (key.toLowerCase() === lower || existing[key].resolvedName.toLowerCase() === lower) {
        removedKey = key;
        removedResolvedName = existing[key].resolvedName;
        delete existing[key];
        break;
      }
    }

    if (removedKey) {
      localStorage.setItem(`${OVERRIDE_STORAGE_PREFIX}${bookId}`, JSON.stringify(existing));
      removeCachedPortrait(removedKey, bookTitle);
      if (removedResolvedName) {
        removeCachedPortrait(removedResolvedName, bookTitle);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('shiori-character-overrides-changed', {
            detail: { bookId, originalName: removedKey },
          })
        );
      }
    }
  } catch (err) {
    logger.error('[characterOverrideService] Failed to remove override:', err);
  }
}

/**
 * Applies character overrides to an array of TrackedCharacter objects
 */
export function applyOverridesToCharacters(
  bookId: number,
  characters: TrackedCharacter[]
): TrackedCharacter[] {
  const overrides = getCharacterOverrides(bookId);
  if (!Object.keys(overrides).length) return characters;

  return characters.map((char) => {
    const ov = getCharacterOverride(bookId, char.name);
    if (!ov) return char;

    return {
      ...char,
      name: ov.resolvedName,
      nativeName: ov.nativeName || char.nativeName,
      imageUrl: ov.imageUrl || char.imageUrl,
      // Store original name in a custom property for reference
      ...(ov.originalName !== ov.resolvedName ? { originalExtractedName: ov.originalName } : {}),
    };
  });
}
