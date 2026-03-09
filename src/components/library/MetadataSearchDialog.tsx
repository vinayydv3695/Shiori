import { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Loader2, Download, ExternalLink, ImageIcon, CheckCircle, AlertTriangle, Play, FastForward, Settings2 } from 'lucide-react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { logger } from '@/lib/logger';
import { Button } from '../ui/button';
import { useToast } from '@/store/toastStore';
import { useLibraryStore } from '@/store/libraryStore';
import { Book } from '@/lib/tauri';

// [Keep existing interfaces]
interface MangaMetadata {
  anilist_id: number;
  title_english: string | null;
  title_romaji: string;
  title_native: string | null;
  description: string | null;
  cover_url_large: string;
  cover_url_extra_large: string;
  genres: string[];
  average_score: number | null;
  volumes: number | null;
  chapters: number | null;
  status: string;
  start_year: number | null;
  authors: string[];
}

interface BookMetadata {
  open_library_id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_url_small: string | null;
  cover_url_medium: string | null;
  cover_url_large: string | null;
  authors: Array<{ name: string; key: string | null }>;
  publishers: string[];
  publish_date: string | null;
  subjects: string[];
  isbn_10: string[];
  isbn_13: string[];
  number_of_pages: number | null;
  languages: string[];
}

interface MetadataSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookIds: number[];
  bookTitle?: string;
  isManga?: boolean;
  isbn?: string | null;
  onMetadataSelected: () => void;
}

export interface MetadataMatch {
  metadata: MangaMetadata | BookMetadata;
  confidence: number;
  provider: 'anilist' | 'openlibrary';
  mappedMetadata: Record<string, any>;
}

export interface BatchResult {
  book: Book;
  matches: MetadataMatch[];
  bestMatch?: MetadataMatch;
  status: 'pending' | 'searching' | 'review' | 'applied' | 'error' | 'skipped';
  error?: string;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function calculateConfidence(
  originalTitle: string,
  resultTitle: string,
  originalAuthor?: string,
  resultAuthors?: string[],
  originalIsbn?: string | null,
  resultIsbns?: string[],
  originalYear?: string | null,
  resultYear?: string | null,
): number {
  // ISBN exact match = highest priority
  if (originalIsbn && resultIsbns && resultIsbns.length > 0) {
    const normalizedOriginal = originalIsbn.replace(/[-\s]/g, '');
    const isbnMatch = resultIsbns.some(isbn => isbn.replace(/[-\s]/g, '') === normalizedOriginal);
    if (isbnMatch) return 99;
  }

  let score = 0;
  const titleA = originalTitle.toLowerCase().trim();
  const titleB = resultTitle.toLowerCase().trim();
  const distance = levenshteinDistance(titleA, titleB);
  const maxLen = Math.max(titleA.length, titleB.length);
  const titleSimilarity = maxLen === 0 ? 1 : 1 - distance / maxLen;
  score += titleSimilarity * 60; // Title: 60 points max

  if (originalAuthor && resultAuthors && resultAuthors.length > 0) {
    const authorA = originalAuthor.toLowerCase().trim();
    const authorMatch = resultAuthors.some(a => {
      const b = a.toLowerCase().trim();
      return b.includes(authorA) || authorA.includes(b);
    });
    if (authorMatch) score += 25; // Author: 25 points
  } else {
    score += 5;
  }

  // Year match: 15 points
  if (originalYear && resultYear) {
    const yearA = originalYear.match(/\d{4}/)?.[0];
    const yearB = resultYear.match(/\d{4}/)?.[0];
    if (yearA && yearB && yearA === yearB) score += 15;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

export const MetadataSearchDialog = ({
  open,
  onOpenChange,
  bookIds,
  bookTitle,
  isManga,
  isbn,
  onMetadataSelected,
}: MetadataSearchDialogProps) => {
  const isBatch = bookIds.length > 1;
  const [searching, setSearching] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [results, setResults] = useState<(MangaMetadata | BookMetadata)[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Single mode preview state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewMetadata, setPreviewMetadata] = useState<Record<string, any> | null>(null);
  const [previewCoverUrl, setPreviewCoverUrl] = useState<string | null>(null);
  const [currentCoverUrl, setCurrentCoverUrl] = useState<string | null>(null);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  
  // Batch state
  const booksStore = useLibraryStore(state => state.books);
  const [batchResults, setBatchResults] = useState<Map<number, BatchResult>>(new Map());
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, isRunning: false, summary: '' });
  const [providers, setProviders] = useState({ anilist: true, openlibrary: true, googlebooks: false });
  const cancelRef = useRef(false);
  
  const toast = useToast();

  useEffect(() => {
    if (open) {
      cancelRef.current = false;
      if (isBatch) {
        initBatchState();
      } else {
        performSingleSearch();
      }
    } else {
      cancelRef.current = true;
      setBatchProgress({ current: 0, total: 0, isRunning: false, summary: '' });
    }
  }, [open, bookIds]);

  const initBatchState = () => {
    const map = new Map<number, BatchResult>();
    bookIds.forEach(id => {
      const book = booksStore.find(b => b.id === id);
      if (book) {
        map.set(id, { book, matches: [], status: 'pending' });
      }
    });
    setBatchResults(map);
  };

  const mapMangaMetadata = (m: MangaMetadata) => ({
    title: m.title_english || m.title_romaji,
    description: m.description,
    authors: m.authors,
    genres: m.genres,
    coverUrl: m.cover_url_extra_large || m.cover_url_large,
    publisher: null,
    publishDate: m.start_year ? String(m.start_year) : null,
    pageCount: null,
    isbn: null,
    isbn13: null,
    anilistId: String(m.anilist_id),
    openLibraryId: null,
  });

  const mapBookMetadata = (b: BookMetadata) => ({
    title: b.title,
    description: b.description,
    authors: b.authors.map(a => a.name),
    genres: b.subjects.slice(0, 10),
    coverUrl: b.cover_url_large || b.cover_url_medium,
    publisher: b.publishers[0] || null,
    publishDate: b.publish_date,
    pageCount: b.number_of_pages,
    isbn: b.isbn_10[0] || null,
    isbn13: b.isbn_13[0] || null,
    anilistId: null,
    openLibraryId: b.open_library_id,
  });

  const performSingleSearch = async () => {
    if (bookIds.length === 0) return;
    setSearching(true);
    setResults([]);
    try {
      if (isManga) {
        const parsedTitle = await invoke<string>('parse_manga_filename', { filename: bookTitle || '' }).catch(() => bookTitle || '');
        const query = searchQuery || parsedTitle;
        const mangaResults = await invoke<MangaMetadata[]>('search_manga_metadata', { title: query });
        setResults(mangaResults);
      } else {
        if (isbn) {
          const bookResult = await invoke<BookMetadata | null>('search_book_by_isbn', { isbn }).catch(() => null);
          if (bookResult) {
            setResults([bookResult]);
          } else {
            await searchSingleBookByTitle();
          }
        } else {
          await searchSingleBookByTitle();
        }
      }
    } catch (error) {
      logger.error('Search failed:', error);
      toast.error('Search failed', 'Could not fetch metadata');
    } finally {
      setSearching(false);
    }
  };

  const searchSingleBookByTitle = async () => {
    const query = searchQuery || bookTitle || '';
    const bookResults = await invoke<BookMetadata[]>('search_book_metadata', { title: query, author: null });
    setResults(bookResults);
  };

  const invokeWithRetry = async <T,>(command: string, args: Record<string, unknown>, maxRetries = 3): Promise<T> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await invoke<T>(command, args);
      } catch (e: unknown) {
        const errMsg = String(e);
        const is429 = errMsg.includes('429') || errMsg.includes('Too Many Requests');
        if (attempt < maxRetries && (is429 || errMsg.includes('network') || errMsg.includes('timeout'))) {
          const delay = is429 ? 2000 * attempt : 1000 * attempt;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw e;
      }
    }
    throw new Error('Max retries exceeded');
  };

  const fetchMetadataForBook = async (book: Book): Promise<MetadataMatch[]> => {
    const matches: MetadataMatch[] = [];
    const isMangaFormat = ['cbz', 'cbr', 'zip', 'rar'].includes(book.file_format?.toLowerCase() || '');
    const titleToSearch = book.title;
    const bookAuthor = book.authors?.[0]?.name;
    const bookIsbn = book.isbn || book.isbn13;
    const bookYear = book.pubdate;

    try {
      if (isMangaFormat && providers.anilist) {
        const parsedTitle = await invokeWithRetry<string>('parse_manga_filename', { filename: titleToSearch }).catch(() => titleToSearch);
        const results = await invokeWithRetry<MangaMetadata[]>('search_manga_metadata', { title: parsedTitle });
        results.slice(0, 5).forEach(m => {
          matches.push({
            metadata: m,
            confidence: calculateConfidence(
              titleToSearch,
              m.title_english || m.title_romaji,
              bookAuthor,
              m.authors,
              undefined,
              undefined,
              bookYear,
              m.start_year ? String(m.start_year) : null,
            ),
            provider: 'anilist',
            mappedMetadata: mapMangaMetadata(m)
          });
        });
      }
      
      if (!isMangaFormat && providers.openlibrary) {
        const results = await invokeWithRetry<BookMetadata[]>('search_book_metadata', { title: titleToSearch, author: null });
        results.slice(0, 5).forEach(b => {
          matches.push({
            metadata: b,
            confidence: calculateConfidence(
              titleToSearch,
              b.title,
              bookAuthor,
              b.authors.map(a => a.name),
              bookIsbn,
              [...b.isbn_10, ...b.isbn_13],
              bookYear,
              b.publish_date,
            ),
            provider: 'openlibrary',
            mappedMetadata: mapBookMetadata(b)
          });
        });
      }
    } catch (e) {
      logger.error(`Failed to fetch for book ${book.id}`, e);
    }
    
    return matches.sort((a, b) => b.confidence - a.confidence);
  };

  const performBatchSearch = async () => {
    if (!providers.anilist && !providers.openlibrary) {
      toast.error('No providers selected', 'Please select at least one metadata provider.');
      return;
    }
    
    setBatchProgress(prev => ({ ...prev, isRunning: true, current: 0, total: bookIds.length, summary: '' }));
    let matchedCount = 0;
    let noMatchCount = 0;
    
    for (let i = 0; i < bookIds.length; i++) {
      if (cancelRef.current) break;
      
      const id = bookIds[i];
      setBatchProgress(prev => ({ ...prev, current: i + 1 }));
      setBatchResults(prev => {
        const next = new Map(prev);
        const item = next.get(id);
        if (item) next.set(id, { ...item, status: 'searching' });
        return next;
      });
      
      const book = booksStore.find(b => b.id === id);
      if (!book) continue;
      
      const matches = await fetchMetadataForBook(book);
      const bestMatch = matches.length > 0 ? matches[0] : undefined;
      
      if (matches.length > 0) matchedCount++;
      else noMatchCount++;
      
      setBatchResults(prev => {
        const next = new Map(prev);
        const item = next.get(id);
        if (item) {
          next.set(id, { 
            ...item, 
            matches, 
            bestMatch, 
            status: matches.length > 0 ? 'review' : 'error',
            error: matches.length === 0 ? 'No matches found' : undefined
          });
        }
        return next;
      });
      
      await new Promise(r => setTimeout(r, 500));
    }
    
    if (!cancelRef.current) {
      setBatchProgress(prev => ({ ...prev, isRunning: false }));
      toast.success('Batch Search Complete', `Found matches for ${matchedCount} books. ${noMatchCount} had no results. Review before applying.`);
    }
  };

  const applyHighConfidence = async () => {
    let applied = 0;
    let skipped = 0;
    let errors = 0;
    const errorBooks: string[] = [];
    
    setBatchProgress(prev => ({ ...prev, isRunning: true, summary: '' }));
    cancelRef.current = false;
    
    for (const [id, result] of Array.from(batchResults.entries())) {
      if (cancelRef.current) break;
      if (result.status === 'review' && result.bestMatch && result.bestMatch.confidence > 80) {
        try {
          await invokeWithRetry('apply_selected_metadata', { bookId: id, metadata: result.bestMatch.mappedMetadata });
          applied++;
          setBatchResults(prev => {
            const next = new Map(prev);
            const item = next.get(id);
            if (item) next.set(id, { ...item, status: 'applied' });
            return next;
          });
        } catch (e) {
          errors++;
          errorBooks.push(result.book.title);
          setBatchResults(prev => {
            const next = new Map(prev);
            const item = next.get(id);
            if (item) next.set(id, { ...item, status: 'error', error: String(e) });
            return next;
          });
        }
      } else if (result.status === 'review' && result.bestMatch && result.bestMatch.confidence <= 80) {
        skipped++;
      }
    }
    
    const summary = `Applied: ${applied} | Skipped (low confidence): ${skipped} | Errors: ${errors}`;
    setBatchProgress(prev => ({ ...prev, isRunning: false, summary }));
    
    if (applied > 0) {
      toast.success('Batch Apply Complete', `Updated ${applied} book${applied !== 1 ? 's' : ''}. Skipped ${skipped}, errors ${errors}.`);
      onMetadataSelected();
    }
    if (errors > 0) {
      toast.error('Some books failed', `Failed: ${errorBooks.slice(0, 3).join(', ')}${errorBooks.length > 3 ? ` and ${errorBooks.length - 3} more` : ''}`);
    }
  };

  const applyAllReviewed = async () => {
    let applied = 0;
    let skipped = 0;
    let errors = 0;
    const errorBooks: string[] = [];
    
    setBatchProgress(prev => ({ ...prev, isRunning: true, summary: '' }));
    cancelRef.current = false;
    
    for (const [id, result] of Array.from(batchResults.entries())) {
      if (cancelRef.current) break;
      if (result.status === 'review' && result.bestMatch && result.bestMatch.confidence >= 50) {
        try {
          await invokeWithRetry('apply_selected_metadata', { bookId: id, metadata: result.bestMatch.mappedMetadata });
          applied++;
          setBatchResults(prev => {
            const next = new Map(prev);
            const item = next.get(id);
            if (item) next.set(id, { ...item, status: 'applied' });
            return next;
          });
        } catch (e) {
          errors++;
          errorBooks.push(result.book.title);
          setBatchResults(prev => {
            const next = new Map(prev);
            const item = next.get(id);
            if (item) next.set(id, { ...item, status: 'error', error: String(e) });
            return next;
          });
        }
      } else if (result.status === 'review') {
        skipped++;
        setBatchResults(prev => {
          const next = new Map(prev);
          const item = next.get(id);
          if (item) next.set(id, { ...item, status: 'skipped' });
          return next;
        });
      }
    }
    
    const summary = `Applied: ${applied} | Skipped: ${skipped} | Errors: ${errors}`;
    setBatchProgress(prev => ({ ...prev, isRunning: false, summary }));
    
    if (applied > 0) {
      toast.success('Batch Apply Complete', `Updated ${applied} book${applied !== 1 ? 's' : ''}. Skipped ${skipped}, errors ${errors}.`);
      onMetadataSelected();
    }
    if (errors > 0) {
      toast.error('Some books failed', `Failed: ${errorBooks.slice(0, 3).join(', ')}${errorBooks.length > 3 ? ` and ${errorBooks.length - 3} more` : ''}`);
    }
  };

  // --- Single Book Handlers ---
  const handleSelectMetadata = async (metadata: MangaMetadata | BookMetadata) => {
    const index = results.indexOf(metadata);
    setDownloading(index);
    setFetchingPreview(true);

    try {
      const selectedMetadata = isMangaResult(metadata) ? mapMangaMetadata(metadata) : mapBookMetadata(metadata as BookMetadata);
      setPreviewMetadata(selectedMetadata);

       try {
         const coverPath = await invoke<string | null>('get_cover_path_by_id', { id: bookIds[0] });
         setCurrentCoverUrl(coverPath ? convertFileSrc(coverPath) : null);
       } catch { setCurrentCoverUrl(null); }

       try {
         if (selectedMetadata.coverUrl) {
           const bytes = await invoke<Uint8Array>('preview_cover_url', { url: selectedMetadata.coverUrl as string });
           const blob = new Blob([new Uint8Array(bytes)]);
           setPreviewCoverUrl(URL.createObjectURL(blob));
         } else { setPreviewCoverUrl(null); }
       } catch { setPreviewCoverUrl(null); }

       setPreviewModalOpen(true);
     } catch (error) {
       toast.error('Preview failed', 'An error occurred while preparing preview');
     } finally {
      setDownloading(null);
      setFetchingPreview(false);
    }
  };

  const executeApply = async (includeCover: boolean) => {
    if (!previewMetadata) return;
    const metadataToApply = { ...previewMetadata };
    if (!includeCover) metadataToApply.coverUrl = null;

    try {
      const success = await invoke<boolean>('apply_selected_metadata', { bookId: bookIds[0], metadata: metadataToApply });
       if (success) {
         toast.success('Metadata applied', 'Book has been updated');
         onMetadataSelected();
         handleClosePreview();
         onOpenChange(false);
       } else {
         toast.error('Update failed', 'Could not apply metadata');
       }
     } catch (error) {
       toast.error('Update failed', 'An error occurred while applying metadata');
     }
  };

  const handleClosePreview = () => {
    setPreviewModalOpen(false);
    if (previewCoverUrl && previewCoverUrl.startsWith('blob:')) URL.revokeObjectURL(previewCoverUrl);
    setPreviewCoverUrl(null);
    setCurrentCoverUrl(null);
    setPreviewMetadata(null);
  };

  const isMangaResult = (result: MangaMetadata | BookMetadata): result is MangaMetadata => 'anilist_id' in result;

  // Render Batch View
  if (isBatch) {
    const resultsArray = Array.from(batchResults.values());
    const pendingCount = resultsArray.filter(r => r.status === 'pending').length;
    const reviewCount = resultsArray.filter(r => r.status === 'review').length;
    const highConfidenceCount = resultsArray.filter(r => r.status === 'review' && r.bestMatch && r.bestMatch.confidence > 80).length;
    const mediumConfidenceCount = resultsArray.filter(r => r.status === 'review' && r.bestMatch && r.bestMatch.confidence >= 50 && r.bestMatch.confidence <= 80).length;
    const appliedCount = resultsArray.filter(r => r.status === 'applied').length;
    const errorCount = resultsArray.filter(r => r.status === 'error').length;
    
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-2xl w-[90vw] max-w-5xl max-h-[85vh] z-50 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-border bg-muted/30">
              <div className="flex flex-col">
                <Dialog.Title className="text-xl font-bold text-foreground">
                  Batch Fetch Metadata
                </Dialog.Title>
                <p className="text-sm text-muted-foreground">Searching metadata for {bookIds.length} items</p>
              </div>
              <Dialog.Close asChild>
                <button className="text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-muted transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Toolbar */}
              <div className="p-4 border-b border-border flex flex-wrap gap-4 items-center justify-between bg-card">
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium text-muted-foreground">Providers:</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={providers.anilist} onChange={e => setProviders(p => ({...p, anilist: e.target.checked}))} className="rounded border-border" />
                    AniList (Manga)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={providers.openlibrary} onChange={e => setProviders(p => ({...p, openlibrary: e.target.checked}))} className="rounded border-border" />
                    OpenLibrary (Books)
                  </label>
                  <label className="flex items-center gap-2 opacity-50 cursor-not-allowed" title="Not available">
                    <input type="checkbox" checked={false} disabled className="rounded border-border" />
                    Google Books
                  </label>
                </div>
                
                <div className="flex items-center gap-3">
                  {!batchProgress.isRunning && pendingCount > 0 && (
                    <Button onClick={performBatchSearch} className="gap-2">
                      <Search className="h-4 w-4" /> Start Batch Search
                    </Button>
                  )}
                  {batchProgress.isRunning && (
                    <Button variant="destructive" onClick={() => cancelRef.current = true}>
                      Cancel Search
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {batchProgress.isRunning && batchProgress.total > 0 && (
                <div className="px-6 py-3 border-b border-border bg-muted/20">
                  <div className="flex justify-between text-xs mb-1">
                    <span>Searching {batchProgress.current} of {batchProgress.total}...</span>
                    <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="bg-primary h-2 transition-all duration-300 ease-out" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}

              {/* Results Table */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0 z-10 backdrop-blur-md">
                    <tr>
                      <th className="px-6 py-3 font-medium">Book File</th>
                      <th className="px-6 py-3 font-medium">Matched Title</th>
                      <th className="px-6 py-3 font-medium">Provider</th>
                      <th className="px-6 py-3 font-medium">Confidence</th>
                      <th className="px-6 py-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {resultsArray.map((r) => (
                      <tr key={r.book.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 font-medium truncate max-w-[200px]" title={r.book.title}>{r.book.title}</td>
                        <td className="px-6 py-4 truncate max-w-[250px] text-muted-foreground">
                          {r.bestMatch ? r.bestMatch.mappedMetadata.title : '-'}
                        </td>
                        <td className="px-6 py-4">
                          {r.bestMatch ? (r.bestMatch.provider === 'anilist' ? 'AniList' : 'OpenLibrary') : '-'}
                        </td>
                        <td className="px-6 py-4">
                          {r.bestMatch ? (
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              r.bestMatch.confidence > 80 ? 'bg-green-500/10 text-green-500' :
                              r.bestMatch.confidence >= 50 ? 'bg-yellow-500/10 text-yellow-500' :
                              'bg-red-500/10 text-red-500'
                            }`}>
                              {r.bestMatch.confidence}%
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {r.status === 'pending' && <span className="text-muted-foreground">Pending</span>}
                          {r.status === 'searching' && <Loader2 className="w-4 h-4 animate-spin ml-auto text-primary" />}
                          {r.status === 'review' && <span className="text-blue-500">Ready</span>}
                          {r.status === 'applied' && <CheckCircle className="w-4 h-4 ml-auto text-green-500" />}
                          {r.status === 'error' && <span title={r.error}><AlertTriangle className="w-4 h-4 ml-auto text-red-500" /></span>}
                          {r.status === 'skipped' && <span className="text-muted-foreground">Skipped</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-6 border-t border-border bg-muted/30 flex justify-between items-center">
              <div className="text-sm text-muted-foreground space-y-0.5">
                <div className="font-medium">
                  {batchProgress.summary || (
                    <>
                      {reviewCount > 0 && <span>Ready: {reviewCount} ({highConfidenceCount} high, {mediumConfidenceCount} medium)</span>}
                      {appliedCount > 0 && <span className="ml-3 text-green-500">Applied: {appliedCount}</span>}
                      {errorCount > 0 && <span className="ml-3 text-red-500">Errors: {errorCount}</span>}
                      {reviewCount === 0 && appliedCount === 0 && errorCount === 0 && <span>No matches yet</span>}
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <Button variant="ghost">Close</Button>
                </Dialog.Close>
                {highConfidenceCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={applyHighConfidence} 
                    disabled={batchProgress.isRunning}
                    className="gap-2"
                  >
                    <FastForward className="w-4 h-4" /> Apply {highConfidenceCount} High ({'>'}80%)
                  </Button>
                )}
                <Button 
                  onClick={applyAllReviewed} 
                  disabled={reviewCount === 0 || batchProgress.isRunning}
                  className="gap-2"
                >
                  <CheckCircle className="w-4 h-4" /> Apply All {reviewCount} Matches
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  // --- Single mode render ---
  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-lg shadow-lg w-[90vw] max-w-3xl max-h-[85vh] z-50 flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
              <Dialog.Title className="text-lg font-semibold text-foreground">
                Fetch Metadata from {isManga ? 'AniList' : 'Open Library'}
              </Dialog.Title>
               <Dialog.Close asChild>
                 <button className="text-muted-foreground hover:text-foreground transition-colors" title="Close metadata search"><X className="h-5 w-5" /></button>
               </Dialog.Close>
            </div>
            
            <div className="p-6 border-b border-border flex-shrink-0">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder={`Search ${isManga ? 'manga' : 'books'}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && performSingleSearch()}
                    className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
                <Button onClick={performSingleSearch} disabled={searching} className="min-w-24">
                  {searching ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Searching...</> : <><Search className="h-4 w-4 mr-2" />Search</>}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Currently searching for: <span className="font-medium text-foreground">{bookTitle}</span></p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {searching ? (
                <div className="flex items-center justify-center h-40">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Searching {isManga ? 'AniList' : 'Open Library'}...</p>
                  </div>
                </div>
              ) : results.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-foreground font-medium mb-1">No results found</p>
                  <p className="text-sm text-muted-foreground">Try adjusting your search query</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {results.map((result, index) => {
                    const isDownloading = downloading === index;
                    if (isMangaResult(result)) {
                      return (
                        <div key={result.anilist_id} className="flex gap-4 p-4 border border-border rounded-lg hover:border-primary/50 transition-colors bg-card">
                          <img src={result.cover_url_large} alt={result.title_romaji} className="w-24 h-36 object-cover rounded" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground mb-1 truncate">{result.title_english || result.title_romaji}</h3>
                            {result.title_english && result.title_romaji && <p className="text-sm text-muted-foreground mb-2">{result.title_romaji}</p>}
                            {result.description && <p className="text-sm text-muted-foreground line-clamp-3 mb-2">{result.description.substring(0, 200)}...</p>}
                            <div className="flex flex-wrap gap-2 mb-2">
                              {result.genres.slice(0, 4).map((genre) => <span key={genre} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded">{genre}</span>)}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              {result.average_score && <span>⭐ {result.average_score}%</span>}
                              {result.volumes && <span>📚 {result.volumes} vols</span>}
                              {result.status && <span>{result.status}</span>}
                              {result.start_year && <span>{result.start_year}</span>}
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            <Button size="sm" onClick={() => handleSelectMetadata(result)} disabled={isDownloading}>
                              {isDownloading ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Applying...</> : <><Download className="h-3 w-3 mr-1" />Use This</>}
                            </Button>
                          </div>
                        </div>
                      );
                    } else {
                      const bookResult = result as BookMetadata;
                      return (
                        <div key={bookResult.open_library_id || index} className="flex gap-4 p-4 border border-border rounded-lg hover:border-primary/50 transition-colors bg-card">
                          {bookResult.cover_url_medium ? (
                            <img src={bookResult.cover_url_medium} alt={bookResult.title} className="w-24 h-36 object-cover rounded" />
                          ) : (
                            <div className="w-24 h-36 bg-muted rounded flex items-center justify-center text-muted-foreground"><span className="text-3xl">📚</span></div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground mb-1">{bookResult.title}</h3>
                            {bookResult.subtitle && <p className="text-sm text-muted-foreground mb-2">{bookResult.subtitle}</p>}
                            {bookResult.authors.length > 0 && <p className="text-sm text-muted-foreground mb-2">by {bookResult.authors.map(a => a.name).join(', ')}</p>}
                            {bookResult.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{bookResult.description.substring(0, 200)}...</p>}
                            <div className="flex flex-wrap gap-2 mb-2">
                              {bookResult.subjects.slice(0, 3).map((subject, idx) => <span key={idx} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded">{subject}</span>)}
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            <Button size="sm" onClick={() => handleSelectMetadata(bookResult)} disabled={isDownloading}>
                              {isDownloading ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Applying...</> : <><Download className="h-3 w-3 mr-1" />Use This</>}
                            </Button>
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-6 border-t border-border bg-muted/30 flex-shrink-0">
              <p className="text-xs text-muted-foreground">
                {isManga ? (
                  <>Data from <a href="https://anilist.co" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">AniList<ExternalLink className="h-3 w-3" /></a></>
                ) : (
                  <>Data from <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Open Library<ExternalLink className="h-3 w-3" /></a></>
                )}
              </p>
              <Dialog.Close asChild>
                <Button variant="outline">Close</Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Preview Modal for Single Mode */}
      <Dialog.Root open={previewModalOpen} onOpenChange={handleClosePreview}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] animate-in fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-2xl w-[95vw] max-w-4xl max-h-[90vh] z-[60] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-border bg-muted/10">
              <Dialog.Title className="text-xl font-bold tracking-tight text-foreground">Review Metadata & Cover</Dialog.Title>
               <Dialog.Close asChild>
                 <button className="text-muted-foreground hover:bg-muted p-2 rounded-full transition-colors" title="Close"><X className="h-5 w-5" /></button>
               </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-8">
              <div className="flex-1 space-y-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">Metadata Changes</h3>
                {previewMetadata && (
                  <div className="space-y-4">
                    <div><label className="text-xs text-muted-foreground font-medium">Title</label><p className="text-foreground font-medium">{String(previewMetadata.title || 'Unknown Title')}</p></div>
                    {previewMetadata.authors && Array.isArray(previewMetadata.authors) && previewMetadata.authors.length > 0 && (
                      <div><label className="text-xs text-muted-foreground font-medium">Authors</label><p className="text-foreground">{previewMetadata.authors.join(', ')}</p></div>
                    )}
                    {previewMetadata.genres && Array.isArray(previewMetadata.genres) && previewMetadata.genres.length > 0 && (
                      <div><label className="text-xs text-muted-foreground font-medium">Tags / Genres</label>
                        <div className="flex flex-wrap gap-2 mt-1">{previewMetadata.genres.map((g: string) => <span key={g} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">{g}</span>)}</div>
                      </div>
                    )}
                    {previewMetadata.description && (
                      <div><label className="text-xs text-muted-foreground font-medium">Description</label><p className="text-sm text-foreground/80 line-clamp-6 leading-relaxed mt-1">{String(previewMetadata.description)}</p></div>
                    )}
                  </div>
                )}
              </div>
              <div className="w-full md:w-72 flex-shrink-0 space-y-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">Cover Comparison</h3>
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center justify-between"><span>Suggested Cover</span><span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">New</span></p>
                    <div className="aspect-[2/3] w-full bg-muted rounded-lg overflow-hidden border-2 border-primary/30 shadow-sm relative group">
                      {previewCoverUrl ? <img src={previewCoverUrl} alt="Preview Cover" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2"><ImageIcon className="h-8 w-8 opacity-50" /><span className="text-xs font-medium">No cover found</span></div>}
                    </div>
                  </div>
                  {currentCoverUrl && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center justify-between"><span>Current Cover</span><span className="text-[10px] bg-muted-foreground/20 px-2 py-0.5 rounded-full">Existing</span></p>
                      <div className="aspect-[2/3] w-2/3 mx-auto bg-muted rounded-md overflow-hidden border border-border opacity-70">
                        <img src={currentCoverUrl} alt="Current Cover" className="w-full h-full object-cover grayscale-[0.2]" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-border bg-muted/10 flex flex-col sm:flex-row gap-3 justify-end items-center mt-auto">
              <Button variant="ghost" onClick={handleClosePreview} className="w-full sm:w-auto">Cancel</Button>
              <Button variant="outline" onClick={() => executeApply(false)} className="w-full sm:w-auto hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors">Apply Metadata Only</Button>
              <Button onClick={() => executeApply(true)} className="w-full sm:w-auto shadow-md hover:shadow-lg transition-all">Apply + Save Cover</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
