import { OpenLibrarySearchResponse, OpenLibraryTrendingResponse, OpenLibraryWork, OpenLibrarySubjectResponse } from './types';

const BASE_URL = 'https://openlibrary.org';

export async function fetchTrendingBooks(): Promise<OpenLibraryWork[]> {
  const response = await fetch(`${BASE_URL}/trending/daily.json`);
  if (!response.ok) {
    throw new Error('Failed to fetch trending books from OpenLibrary');
  }
  const data = await response.json() as OpenLibraryTrendingResponse;
  return data.works;
}

export async function fetchSubjectBooks(subject: string): Promise<OpenLibrarySubjectResponse['works']> {
  const response = await fetch(`${BASE_URL}/subjects/${encodeURIComponent(subject.toLowerCase())}.json?limit=12`);
  if (!response.ok) {
    throw new Error(`Failed to fetch books for subject ${subject}`);
  }
  const data = await response.json() as OpenLibrarySubjectResponse;
  return data.works;
}

export async function fetchCoverForBook(title: string, author?: string): Promise<string | null> {
  let query = `title=${encodeURIComponent(title)}`;
  if (author) {
    query += `&author=${encodeURIComponent(author)}`;
  }
  
  try {
    const response = await fetch(`${BASE_URL}/search.json?${query}&limit=1`);
    if (!response.ok) return null;
    
    const data = await response.json() as OpenLibrarySearchResponse;
    if (data.docs && data.docs.length > 0 && data.docs[0].cover_i) {
      return `https://covers.openlibrary.org/b/id/${data.docs[0].cover_i}-M.jpg`;
    }
  } catch (err) {
    console.error('Failed to fetch cover from OpenLibrary:', err);
  }
  
  return null;
}
