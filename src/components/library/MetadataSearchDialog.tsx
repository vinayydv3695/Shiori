import { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Loader2, Download, ExternalLink, ImageIcon, CheckCircle, AlertTriangle, FastForward } from 'lucide-react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { logger } from '@/lib/logger';
import { openExternal } from '@/lib/externalLinks';
import { Button } from '../ui/button';

import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/store/toastStore';
import { useLibraryStore } from '@/store/libraryStore';
import { usePreferencesStore } from '@/store/preferencesStore';
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
  seriesId?: number;
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
  seriesId,
  onMetadataSelected,
}: MetadataSearchDialogProps) => {
  const isSeriesMode = typeof seriesId === 'number' && seriesId > 0;
  const isBatch = !isSeriesMode && bookIds.length > 1;
  const [searching, setSearching] = useState(false);
  const preferences = usePreferencesStore(state => state.preferences);
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
    status: m.status,
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
    if (!isSeriesMode && bookIds.length === 0) return;
    setSearching(true);
    setResults([]);
    try {
      if (isManga) {
        const parsedTitle = await invoke<string>('parse_manga_filename', { filename: bookTitle || '' }).catch(() => bookTitle || '');
        const query = searchQuery || parsedTitle;
        const mangaResults = await invoke<MangaMetadata[]>('search_manga_metadata', { title: query, includeNsfw: preferences?.includeNsfw ?? false });
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
        const results = await invokeWithRetry<MangaMetadata[]>('search_manga_metadata', { title: parsedTitle, includeNsfw: preferences?.includeNsfw ?? false });
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

       if (!isSeriesMode) {
         try {
           const coverPath = await invoke<string | null>('get_cover_path_by_id', { id: bookIds[0] });
           setCurrentCoverUrl(coverPath ? convertFileSrc(coverPath) : null);
         } catch {
           setCurrentCoverUrl(null);
         }
       } else {
         setCurrentCoverUrl(null);
       }

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
      const success = isSeriesMode
        ? await invoke<boolean>('apply_selected_series_metadata', { seriesId, metadata: metadataToApply })
        : await invoke<boolean>('apply_selected_metadata', { bookId: bookIds[0], metadata: metadataToApply });

       if (success) {
         toast.success('Metadata applied', isSeriesMode ? 'Series has been updated' : 'Book has been updated');
         onMetadataSelected();
         handleClosePreview();
         onOpenChange(false);
       } else {
         toast.error('Update failed', isSeriesMode ? 'Could not apply series metadata' : 'Could not apply metadata');
       }
     } catch (error) {
       toast.error('Update failed', isSeriesMode ? 'An error occurred while applying series metadata' : 'An error occurred while applying metadata');
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
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[240] transition-opacity data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content 
            aria-describedby={undefined} 
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] sm:w-[90vw] max-w-5xl bg-card border border-border rounded-2xl sm:rounded-3xl shadow-2xl z-[250] flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-300"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-5 border-b border-border/50 bg-card/60 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 pr-2">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs shrink-0">
                  <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <Dialog.Title className="text-base sm:text-lg font-extrabold text-foreground tracking-tight">
                    Batch Fetch Metadata
                  </Dialog.Title>
                  <Dialog.Description className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 font-medium">
                    Searching metadata for {bookIds.length} items
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="p-1.5 sm:p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0" title="Close">
                  <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>
              </Dialog.Close>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Toolbar */}
              <div className="p-3.5 sm:p-4 border-b border-border/50 flex flex-wrap gap-3 sm:gap-4 items-center justify-between bg-muted/20">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm">
                  <span className="font-bold text-muted-foreground uppercase text-[10px] sm:text-xs tracking-wider">Providers:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-foreground">
                    <input type="checkbox" checked={providers.anilist} onChange={e => setProviders(p => ({...p, anilist: e.target.checked}))} className="rounded border-border accent-primary" />
                    AniList (Manga)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-foreground">
                    <input type="checkbox" checked={providers.openlibrary} onChange={e => setProviders(p => ({...p, openlibrary: e.target.checked}))} className="rounded border-border accent-primary" />
                    OpenLibrary (Books)
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  {!batchProgress.isRunning && pendingCount > 0 && (
                    <Button onClick={performBatchSearch} className="rounded-full px-4 h-9 font-bold shadow-md shadow-primary/20 bg-primary text-primary-foreground gap-1.5 text-xs sm:text-sm active:scale-95 transition-all">
                      <Search className="h-3.5 w-3.5" /> Start Batch Search
                    </Button>
                  )}
                  {batchProgress.isRunning && (
                    <Button variant="destructive" onClick={() => cancelRef.current = true} className="rounded-full px-4 h-9 text-xs sm:text-sm">
                      Cancel Search
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {batchProgress.isRunning && batchProgress.total > 0 && (
                <div className="px-4 sm:px-6 py-3 border-b border-border/50 bg-primary/5">
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span className="text-foreground">Searching {batchProgress.current} of {batchProgress.total}...</span>
                    <span className="text-primary font-bold">{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="bg-primary h-2 rounded-full transition-all duration-300 ease-out" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}

              {/* Results Table */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-xs sm:text-sm text-left">
                  <thead className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase bg-muted/40 sticky top-0 z-10 backdrop-blur-md border-b border-border/50">
                    <tr>
                      <th className="px-4 sm:px-6 py-3">Book File</th>
                      <th className="px-4 sm:px-6 py-3">Matched Title</th>
                      <th className="px-4 sm:px-6 py-3">Provider</th>
                      <th className="px-4 sm:px-6 py-3">Confidence</th>
                      <th className="px-4 sm:px-6 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {resultsArray.map((r) => (
                      <tr key={r.book.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 sm:px-6 py-3.5 font-semibold text-foreground truncate max-w-[180px] sm:max-w-[220px]" title={r.book.title}>{r.book.title}</td>
                        <td className="px-4 sm:px-6 py-3.5 truncate max-w-[200px] sm:max-w-[260px] text-muted-foreground">
                          {r.bestMatch ? r.bestMatch.mappedMetadata.title : '-'}
                        </td>
                        <td className="px-4 sm:px-6 py-3.5">
                          {r.bestMatch ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                              {r.bestMatch.provider === 'anilist' ? 'AniList' : 'OpenLibrary'}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-4 sm:px-6 py-3.5">
                          {r.bestMatch ? (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold border ${
                              r.bestMatch.confidence > 80 ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                              r.bestMatch.confidence >= 50 ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                              'bg-red-500/10 text-red-500 border-red-500/20'
                            }`}>
                              {r.bestMatch.confidence}%
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-4 sm:px-6 py-3.5 text-right">
                          {r.status === 'pending' && <span className="text-muted-foreground text-xs">Pending</span>}
                          {r.status === 'searching' && <Loader2 className="w-4 h-4 animate-spin ml-auto text-primary" />}
                          {r.status === 'review' && <span className="text-primary font-semibold text-xs">Ready</span>}
                          {r.status === 'applied' && <CheckCircle className="w-4 h-4 ml-auto text-green-500" />}
                          {r.status === 'error' && <span title={r.error}><AlertTriangle className="w-4 h-4 ml-auto text-destructive" /></span>}
                          {r.status === 'skipped' && <span className="text-muted-foreground text-xs">Skipped</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div 
              className="p-3.5 sm:p-5 border-t border-border/50 bg-card/80 backdrop-blur-xl flex flex-col sm:flex-row justify-between items-center gap-3"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
            >
              <div className="text-xs sm:text-sm text-muted-foreground space-y-0.5">
                <div className="font-medium">
                  {batchProgress.summary || (
                    <>
                      {reviewCount > 0 && <span>Ready: {reviewCount} ({highConfidenceCount} high, {mediumConfidenceCount} medium)</span>}
                      {appliedCount > 0 && <span className="ml-3 text-green-500 font-semibold">Applied: {appliedCount}</span>}
                      {errorCount > 0 && <span className="ml-3 text-destructive font-semibold">Errors: {errorCount}</span>}
                      {reviewCount === 0 && appliedCount === 0 && errorCount === 0 && <span>No matches yet</span>}
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                <Dialog.Close asChild>
                  <Button variant="ghost" className="rounded-full px-4 h-9 text-xs sm:text-sm font-semibold">Close</Button>
                </Dialog.Close>
                {highConfidenceCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={applyHighConfidence} 
                    disabled={batchProgress.isRunning}
                    className="rounded-full px-4 h-9 text-xs sm:text-sm font-semibold gap-1.5"
                  >
                    <FastForward className="w-3.5 h-3.5" /> Apply {highConfidenceCount} High ({'>'}80%)
                  </Button>
                )}
                <Button 
                  onClick={applyAllReviewed} 
                  disabled={reviewCount === 0 || batchProgress.isRunning}
                  className="rounded-full px-5 h-9 text-xs sm:text-sm font-bold shadow-lg shadow-primary/20 bg-primary text-primary-foreground gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Apply All {reviewCount} Matches
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
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[240] transition-opacity data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content 
            aria-describedby={undefined} 
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] sm:w-[90vw] max-w-3xl bg-card border border-border rounded-2xl sm:rounded-3xl shadow-2xl z-[250] flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-300"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-5 border-b border-border/50 bg-card/60 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 pr-2">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs shrink-0">
                  <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <Dialog.Title className="text-base sm:text-lg font-extrabold text-foreground tracking-tight">
                    Find Metadata Match
                  </Dialog.Title>
                  <Dialog.Description className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-1 font-medium">
                    Search {isManga ? 'AniList' : 'Open Library'} for covers and details
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="p-1.5 sm:p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0" title="Close">
                  <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>
              </Dialog.Close>
            </div>
            
            {/* Search Input Bar */}
            <div className="p-3.5 sm:p-5 border-b border-border/50 bg-muted/20 shrink-0 space-y-2">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder={`Search ${isManga ? 'manga title' : 'book title or author'}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && performSingleSearch()}
                    className="w-full h-10 px-3.5 pr-9 bg-background/80 border border-border/50 rounded-xl text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all shadow-xs"
                  />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
                </div>
                <Button 
                  onClick={performSingleSearch} 
                  disabled={searching} 
                  className="rounded-full px-5 h-10 font-bold shadow-md shadow-primary/20 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 text-xs sm:text-sm active:scale-95 transition-all cursor-pointer"
                >
                  {searching ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Searching...</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-3.5 w-3.5" />
                      <span>Search</span>
                    </>
                  )}
                </Button>
              </div>
              {bookTitle && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span>Searching for:</span>
                  <span className="font-semibold text-foreground truncate max-w-sm">{bookTitle}</span>
                </p>
              )}
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 custom-scrollbar">
              {searching ? (
                <div className="space-y-3 sm:space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3 sm:gap-4 p-3.5 sm:p-4 border border-border/40 rounded-2xl bg-muted/20 animate-pulse">
                      <Skeleton className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl shrink-0" />
                      <div className="flex-1 space-y-2.5 py-1">
                        <Skeleton className="h-4 sm:h-5 w-3/4 rounded-lg" />
                        <Skeleton className="h-3.5 w-1/2 rounded-lg" />
                        <Skeleton className="h-3 w-1/4 mt-3 rounded-lg" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : results.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-muted/40 border border-border/50 flex items-center justify-center mx-auto mb-3 text-muted-foreground">
                    <Search className="w-6 h-6" />
                  </div>
                  <p className="text-foreground font-bold text-sm sm:text-base mb-1">No matches found</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">Try adjusting your search keywords above</p>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {results.map((result, index) => {
                    const isDownloading = downloading === index;
                    if (isMangaResult(result)) {
                      return (
                        <div 
                          key={result.anilist_id} 
                          className="flex flex-col sm:flex-row gap-3.5 sm:gap-4 p-3.5 sm:p-4 border border-border/40 hover:border-primary/40 rounded-2xl bg-muted/30 hover:bg-muted/40 transition-all duration-200 shadow-xs"
                        >
                          <div className="flex gap-3.5 flex-1 min-w-0">
                            <div className="w-16 min-[380px]:w-20 sm:w-24 aspect-[2/3] rounded-xl overflow-hidden shadow-md bg-muted/40 border border-border/40 shrink-0">
                              <img src={result.cover_url_large} alt={result.title_romaji} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                              <h3 className="font-bold text-foreground text-sm sm:text-base leading-snug truncate">
                                {result.title_english || result.title_romaji}
                              </h3>
                              {result.title_english && result.title_romaji && (
                                <p className="text-xs text-muted-foreground truncate">{result.title_romaji}</p>
                              )}
                              {result.description && (
                                <p className="text-xs text-muted-foreground/90 line-clamp-2 leading-relaxed pt-0.5">
                                  {result.description.replace(/<[^>]*>/g, '')}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-1 sm:gap-1.5 pt-1">
                                {result.genres && result.genres.slice(0, 3).map((genre) => (
                                  <span key={genre} className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] sm:text-[11px] font-semibold rounded-full border border-primary/20">
                                    {genre}
                                  </span>
                                ))}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-medium text-muted-foreground">
                                {result.average_score && <span>⭐ {result.average_score}%</span>}
                                {result.volumes && <span>• 📚 {result.volumes} vols</span>}
                                {result.status && <span>• {result.status}</span>}
                                {result.start_year && <span>• {result.start_year}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="w-full sm:w-auto sm:self-center shrink-0 pt-1 sm:pt-0">
                            <Button 
                              className="w-full sm:w-auto rounded-full px-5 h-9 sm:h-10 font-bold shadow-md shadow-primary/20 bg-primary text-primary-foreground hover:bg-primary/90 text-xs sm:text-sm active:scale-95 transition-all cursor-pointer" 
                              onClick={() => handleSelectMetadata(result)} 
                              disabled={isDownloading}
                            >
                              {isDownloading ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                  <span>Applying...</span>
                                </>
                              ) : (
                                <>
                                  <Download className="h-3.5 w-3.5 mr-1.5" />
                                  <span>Use This</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    } else {
                      const bookResult = result as BookMetadata;
                      return (
                        <div 
                          key={bookResult.open_library_id || index} 
                          className="flex flex-col sm:flex-row gap-3.5 sm:gap-4 p-3.5 sm:p-4 border border-border/40 hover:border-primary/40 rounded-2xl bg-muted/30 hover:bg-muted/40 transition-all duration-200 shadow-xs"
                        >
                          <div className="flex gap-3.5 flex-1 min-w-0">
                            <div className="w-16 min-[380px]:w-20 sm:w-24 aspect-[2/3] rounded-xl overflow-hidden shadow-md bg-muted/40 border border-border/40 shrink-0 flex items-center justify-center">
                              {bookResult.cover_url_medium ? (
                                <img src={bookResult.cover_url_medium} alt={bookResult.title} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-2xl">📚</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                              <h3 className="font-bold text-foreground text-sm sm:text-base leading-snug truncate">
                                {bookResult.title}
                              </h3>
                              {bookResult.subtitle && (
                                <p className="text-xs text-muted-foreground truncate">{bookResult.subtitle}</p>
                              )}
                              {bookResult.authors && bookResult.authors.length > 0 && (
                                <p className="text-xs text-muted-foreground font-medium truncate">
                                  by {bookResult.authors.map(a => a.name).join(', ')}
                                </p>
                              )}
                              {bookResult.description && (
                                <p className="text-xs text-muted-foreground/90 line-clamp-2 leading-relaxed pt-0.5">
                                  {bookResult.description}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-1 sm:gap-1.5 pt-1">
                                {bookResult.subjects && bookResult.subjects.slice(0, 3).map((subject, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] sm:text-[11px] font-semibold rounded-full border border-primary/20">
                                    {subject}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="w-full sm:w-auto sm:self-center shrink-0 pt-1 sm:pt-0">
                            <Button 
                              className="w-full sm:w-auto rounded-full px-5 h-9 sm:h-10 font-bold shadow-md shadow-primary/20 bg-primary text-primary-foreground hover:bg-primary/90 text-xs sm:text-sm active:scale-95 transition-all cursor-pointer" 
                              onClick={() => handleSelectMetadata(bookResult)} 
                              disabled={isDownloading}
                            >
                              {isDownloading ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                  <span>Applying...</span>
                                </>
                              ) : (
                                <>
                                  <Download className="h-3.5 w-3.5 mr-1.5" />
                                  <span>Use This</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div 
              className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-t border-border/50 bg-card/80 backdrop-blur-xl shrink-0 gap-3"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
            >
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                {isManga ? (
                  <>Data from <a href="https://anilist.co" target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); void openExternal('https://anilist.co'); }} className="text-primary font-semibold hover:underline inline-flex items-center gap-1">AniList<ExternalLink className="h-3 w-3" /></a></>
                ) : (
                  <>Data from <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); void openExternal('https://openlibrary.org'); }} className="text-primary font-semibold hover:underline inline-flex items-center gap-1">Open Library<ExternalLink className="h-3 w-3" /></a></>
                )}
              </p>
              <Dialog.Close asChild>
                <Button variant="ghost" className="rounded-full px-5 font-semibold text-muted-foreground hover:text-foreground text-xs sm:text-sm h-9 sm:h-10">
                  Close
                </Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Preview Modal for Single Mode */}
      <Dialog.Root open={previewModalOpen} onOpenChange={handleClosePreview}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[260] transition-opacity data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content 
            aria-describedby={undefined} 
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] sm:w-[90vw] max-w-4xl bg-card border border-border rounded-2xl sm:rounded-3xl shadow-2xl z-[270] flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-300"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-5 border-b border-border/50 bg-card/60 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 pr-2">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs shrink-0">
                  <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <Dialog.Title className="text-base sm:text-lg font-extrabold text-foreground tracking-tight">
                    Review Metadata & Cover
                  </Dialog.Title>
                  <Dialog.Description className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-1 font-medium">
                    Confirm details before applying changes
                  </Dialog.Description>
                </div>
              </div>
              <button 
                onClick={handleClosePreview}
                className="p-1.5 sm:p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0" 
                title="Close"
              >
                <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-7 custom-scrollbar flex flex-col md:flex-row gap-6 sm:gap-8">
              <div className="flex-1 space-y-4 sm:space-y-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-2">
                  Metadata Changes
                </h3>
                {previewMetadata && (
                  <div className="space-y-3 sm:space-y-4">
                    <div className="bg-muted/30 border border-border/40 rounded-xl p-3 sm:p-3.5 space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Title</label>
                      <p className="text-xs sm:text-sm font-bold text-foreground">{String(previewMetadata.title || 'Unknown Title')}</p>
                    </div>

                    {previewMetadata.authors && Array.isArray(previewMetadata.authors) && previewMetadata.authors.length > 0 && (
                      <div className="bg-muted/30 border border-border/40 rounded-xl p-3 sm:p-3.5 space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Authors</label>
                        <p className="text-xs sm:text-sm font-semibold text-foreground">{previewMetadata.authors.join(', ')}</p>
                      </div>
                    )}

                    {previewMetadata.genres && Array.isArray(previewMetadata.genres) && previewMetadata.genres.length > 0 && (
                      <div className="bg-muted/30 border border-border/40 rounded-xl p-3 sm:p-3.5 space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tags / Genres</label>
                        <div className="flex flex-wrap gap-1.5">
                          {previewMetadata.genres.map((g: string) => (
                            <span key={g} className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] sm:text-[11px] font-semibold rounded-full border border-primary/20">
                              {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {previewMetadata.description && (
                      <div className="bg-muted/30 border border-border/40 rounded-xl p-3 sm:p-3.5 space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Description</label>
                        <p className="text-xs sm:text-sm text-foreground/90 line-clamp-6 leading-relaxed">
                          {String(previewMetadata.description)}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Cover Comparison */}
              <div className="w-full md:w-72 shrink-0 space-y-4 sm:space-y-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-2">
                  Cover Comparison
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-1 gap-4">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center justify-between">
                      <span>Suggested Cover</span>
                      <span className="text-[10px] bg-primary/20 text-primary font-bold px-2 py-0.5 rounded-full">New</span>
                    </div>
                    <div className="aspect-[2/3] w-full bg-muted/30 rounded-2xl overflow-hidden border-2 border-primary/40 shadow-md relative group">
                      {previewCoverUrl ? (
                        <img src={previewCoverUrl} alt="Preview Cover" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <ImageIcon className="h-8 w-8 opacity-40" />
                          <span className="text-xs font-medium">No cover found</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {currentCoverUrl && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center justify-between">
                        <span>Current Cover</span>
                        <span className="text-[10px] bg-muted-foreground/20 text-muted-foreground font-bold px-2 py-0.5 rounded-full">Existing</span>
                      </div>
                      <div className="aspect-[2/3] w-full bg-muted/30 rounded-2xl overflow-hidden border border-border/50 opacity-70">
                        <img src={currentCoverUrl} alt="Current Cover" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div 
              className="p-3.5 sm:p-5 border-t border-border/50 bg-card/80 backdrop-blur-xl flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 justify-end items-center mt-auto"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
            >
              <Button variant="ghost" onClick={handleClosePreview} className="w-full sm:w-auto rounded-full px-5 h-9 sm:h-10 text-xs sm:text-sm font-semibold">
                Cancel
              </Button>
              <Button 
                variant="outline" 
                onClick={() => executeApply(false)} 
                className="w-full sm:w-auto rounded-full px-5 h-9 sm:h-10 text-xs sm:text-sm font-semibold border-border/60 hover:bg-primary/10 hover:text-primary transition-all"
              >
                Apply Metadata Only
              </Button>
              <Button 
                onClick={() => executeApply(true)} 
                className="w-full sm:w-auto rounded-full px-6 h-9 sm:h-10 text-xs sm:text-sm font-bold shadow-lg shadow-primary/20 bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95"
              >
                Apply + Save Cover
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
