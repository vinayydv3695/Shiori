import { OpenLibrarySearchResponse, OpenLibraryTrendingResponse, OpenLibraryWork, OpenLibrarySubjectResponse } from './types';

const GUTENDEX_BASE = 'https://gutendex.com/books';
const OPEN_LIBRARY_BASE = 'https://openlibrary.org';

async function fetchWithTimeout(url: string, timeoutMs: number = 3500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function fetchTrendingBooks(): Promise<OpenLibraryWork[]> {
  // 1. Try Gutendex (fast, no rate limits)
  try {
    const res = await fetchWithTimeout(`${GUTENDEX_BASE}/?topic=fiction`, 3000);
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const works: OpenLibraryWork[] = data.results.map((item: any) => ({
          key: `gutenberg-${item.id}`,
          title: item.title,
          author_name: (item.authors || []).map((a: any) => a.name),
          first_publish_year: undefined,
          cover_url: item.formats?.['image/jpeg'] || undefined,
        }));
        if (works.length > 0) return works;
      }
    }
  } catch {
    // fallback
  }

  // 2. Fallback to OpenLibrary Trending Daily
  try {
    const response = await fetchWithTimeout(`${OPEN_LIBRARY_BASE}/trending/daily.json`, 3500);
    if (response.ok) {
      const data = (await response.json()) as OpenLibraryTrendingResponse;
      if (data.works && data.works.length > 0) {
        return data.works;
      }
    }
  } catch {
    // Ignore and let caller use cached/curated items
  }

  return [];
}

export async function fetchSubjectBooks(subject: string, limit: number = 36): Promise<any[]> {
  const gutendexTopicMap: Record<string, string> = {
    science_fiction: 'science fiction',
    classic_literature: 'classic',
    fantasy: 'adventure',
  };

  const topic = gutendexTopicMap[subject] || subject;

  // 1. Try Gutendex
  try {
    const res = await fetchWithTimeout(`${GUTENDEX_BASE}/?topic=${encodeURIComponent(topic)}`, 3000);
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const works = data.results.slice(0, limit).map((item: any) => ({
          key: `gutenberg-${item.id}`,
          title: item.title,
          authors: (item.authors || []).map((a: any) => ({ name: a.name })),
          first_publish_year: undefined,
          cover_url: item.formats?.['image/jpeg'] || undefined,
        }));
        if (works.length > 0) return works;
      }
    }
  } catch {
    // fallback
  }

  // 2. Fallback to OpenLibrary subject API
  try {
    const response = await fetchWithTimeout(
      `${OPEN_LIBRARY_BASE}/subjects/${encodeURIComponent(subject.toLowerCase())}.json?limit=${limit}`,
      3500,
    );
    if (response.ok) {
      const data = (await response.json()) as OpenLibrarySubjectResponse;
      if (data.works && data.works.length > 0) {
        return data.works;
      }
    }
  } catch {
    // Ignore and let caller use cached/curated items
  }

  return [];
}

export async function fetchCoverForBook(title: string, author?: string): Promise<string | null> {
  const cleanTitle = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
  const cleanAuthor = author && author !== 'Unknown Author' ? author.replace(/Unknown Author/i, '').trim() : '';

  // 1. Try Google Books API first for high quality covers
  try {
    let q = `intitle:${encodeURIComponent(cleanTitle)}`;
    if (cleanAuthor) {
      q += `+inauthor:${encodeURIComponent(cleanAuthor)}`;
    }
    const gRes = await fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`, 2500);
    if (gRes.ok) {
      const gData = await gRes.json();
      if (gData.items && gData.items.length > 0 && gData.items[0].volumeInfo?.imageLinks) {
        const links = gData.items[0].volumeInfo.imageLinks;
        let cover = links.extraLarge || links.large || links.medium || links.thumbnail || links.smallThumbnail;
        if (cover) {
          cover = cover.replace('http:', 'https:').replace('&edge=curl', '');
          return cover;
        }
      }
    }
  } catch {
    // Fallback to OpenLibrary
  }

  // 2. Fallback to OpenLibrary search
  let query = `title=${encodeURIComponent(cleanTitle)}`;
  if (cleanAuthor) {
    query += `&author=${encodeURIComponent(cleanAuthor)}`;
  }
  
  try {
    const response = await fetchWithTimeout(`${OPEN_LIBRARY_BASE}/search.json?${query}&limit=1`, 2500);
    if (!response.ok) return null;
    
    const data = (await response.json()) as OpenLibrarySearchResponse;
    if (data.docs && data.docs.length > 0 && data.docs[0].cover_i) {
      return `https://covers.openlibrary.org/b/id/${data.docs[0].cover_i}-L.jpg`;
    }
  } catch (err) {
    // fallback
  }
  
  return null;
}
