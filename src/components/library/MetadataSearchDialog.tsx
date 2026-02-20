import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Loader2, Download, Check, ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../ui/button';
import { useToast } from '@/store/toastStore';

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
  bookId: number;
  bookTitle: string;
  isManga: boolean;
  isbn?: string | null;
  onMetadataSelected: () => void;
}

export const MetadataSearchDialog = ({
  open,
  onOpenChange,
  bookId,
  bookTitle,
  isManga,
  isbn,
  onMetadataSelected,
}: MetadataSearchDialogProps) => {
  const [searching, setSearching] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [results, setResults] = useState<(MangaMetadata | BookMetadata)[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (open) {
      // Auto-search when dialog opens
      performSearch();
    }
  }, [open, bookId]);

  const performSearch = async () => {
    setSearching(true);
    setResults([]);

    try {
      if (isManga) {
        // Parse manga title from filename
        const parsedTitle = await invoke<string>('parse_manga_filename', {
          filename: bookTitle,
        });

        const query = searchQuery || parsedTitle;
        console.log('[MetadataSearch] Searching manga:', query);

        const mangaResults = await invoke<MangaMetadata[]>('search_manga_metadata', {
          title: query,
        });

        setResults(mangaResults);
        console.log('[MetadataSearch] Found', mangaResults.length, 'manga results');
      } else {
        // Book search
        if (isbn) {
          console.log('[MetadataSearch] Searching by ISBN:', isbn);
          const bookResult = await invoke<BookMetadata | null>('search_book_by_isbn', {
            isbn,
          });

          if (bookResult) {
            setResults([bookResult]);
          } else {
            // Fallback to title search
            await searchBookByTitle();
          }
        } else {
          await searchBookByTitle();
        }
      }
    } catch (error) {
      console.error('[MetadataSearch] Search failed:', error);
      toast.error('Search failed', 'Could not fetch metadata from API');
    } finally {
      setSearching(false);
    }
  };

  const searchBookByTitle = async () => {
    const query = searchQuery || bookTitle;
    console.log('[MetadataSearch] Searching book by title:', query);

    const bookResults = await invoke<BookMetadata[]>('search_book_metadata', {
      title: query,
      author: null,
    });

    setResults(bookResults);
    console.log('[MetadataSearch] Found', bookResults.length, 'book results');
  };

  const handleSelectMetadata = async (metadata: MangaMetadata | BookMetadata) => {
    const index = results.indexOf(metadata);
    setDownloading(index);

    try {
      // Use the auto-enrichment command
      const success = await invoke<boolean>('enrich_book_metadata', {
        bookId,
      });

      if (success) {
        toast.success('Metadata updated', 'Book has been enriched with API data');
        onMetadataSelected();
        onOpenChange(false);
      } else {
        toast.error('Update failed', 'Could not update book metadata');
      }
    } catch (error) {
      console.error('[MetadataSearch] Failed to apply metadata:', error);
      toast.error('Update failed', 'An error occurred while updating metadata');
    } finally {
      setDownloading(null);
    }
  };

  const isMangaResult = (result: any): result is MangaMetadata => {
    return 'anilist_id' in result;
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-lg shadow-lg w-[90vw] max-w-3xl max-h-[85vh] z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              Fetch Metadata from {isManga ? 'AniList' : 'Open Library'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Search Bar */}
          <div className="p-6 border-b border-border flex-shrink-0">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder={`Search ${isManga ? 'manga' : 'books'}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      performSearch();
                    }
                  }}
                  className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <Button
                onClick={performSearch}
                disabled={searching}
                className="min-w-24"
              >
                {searching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Currently searching for: <span className="font-medium text-foreground">{bookTitle}</span>
            </p>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto p-6">
            {searching ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Searching {isManga ? 'AniList' : 'Open Library'}...
                  </p>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-foreground font-medium mb-1">No results found</p>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search query or check the title
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {results.map((result, index) => {
                  const isDownloading = downloading === index;
                  
                  if (isMangaResult(result)) {
                    // Manga result card
                    return (
                      <div
                        key={result.anilist_id}
                        className="flex gap-4 p-4 border border-border rounded-lg hover:border-primary/50 transition-colors bg-card"
                      >
                        {/* Cover */}
                        <img
                          src={result.cover_url_large}
                          alt={result.title_romaji}
                          className="w-24 h-36 object-cover rounded"
                        />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground mb-1 truncate">
                            {result.title_english || result.title_romaji}
                          </h3>
                          {result.title_english && result.title_romaji && (
                            <p className="text-sm text-muted-foreground mb-2">{result.title_romaji}</p>
                          )}

                          {result.description && (
                            <p className="text-sm text-muted-foreground line-clamp-3 mb-2">
                              {result.description.substring(0, 200)}...
                            </p>
                          )}

                          <div className="flex flex-wrap gap-2 mb-2">
                            {result.genres.slice(0, 4).map((genre) => (
                              <span
                                key={genre}
                                className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded"
                              >
                                {genre}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {result.average_score && (
                              <span>⭐ {result.average_score}%</span>
                            )}
                            {result.volumes && <span>📚 {result.volumes} vols</span>}
                            {result.status && <span>{result.status}</span>}
                            {result.start_year && <span>{result.start_year}</span>}
                          </div>

                          {result.authors.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              by {result.authors.join(', ')}
                            </p>
                          )}
                        </div>

                        {/* Action */}
                        <div className="flex-shrink-0">
                          <Button
                            size="sm"
                            onClick={() => handleSelectMetadata(result)}
                            disabled={isDownloading}
                          >
                            {isDownloading ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                Applying...
                              </>
                            ) : (
                              <>
                                <Download className="h-3 w-3 mr-1" />
                                Use This
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  } else {
                    // Book result card
                    const bookResult = result as BookMetadata;
                    return (
                      <div
                        key={bookResult.open_library_id || index}
                        className="flex gap-4 p-4 border border-border rounded-lg hover:border-primary/50 transition-colors bg-card"
                      >
                        {/* Cover */}
                        {bookResult.cover_url_medium ? (
                          <img
                            src={bookResult.cover_url_medium}
                            alt={bookResult.title}
                            className="w-24 h-36 object-cover rounded"
                          />
                        ) : (
                          <div className="w-24 h-36 bg-muted rounded flex items-center justify-center text-muted-foreground">
                            <span className="text-3xl">📚</span>
                          </div>
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground mb-1">
                            {bookResult.title}
                          </h3>
                          {bookResult.subtitle && (
                            <p className="text-sm text-muted-foreground mb-2">{bookResult.subtitle}</p>
                          )}

                          {bookResult.authors.length > 0 && (
                            <p className="text-sm text-muted-foreground mb-2">
                              by {bookResult.authors.map(a => a.name).join(', ')}
                            </p>
                          )}

                          {bookResult.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                              {bookResult.description.substring(0, 200)}...
                            </p>
                          )}

                          <div className="flex flex-wrap gap-2 mb-2">
                            {bookResult.subjects.slice(0, 3).map((subject, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded"
                              >
                                {subject}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {bookResult.publishers.length > 0 && (
                              <span>{bookResult.publishers[0]}</span>
                            )}
                            {bookResult.publish_date && <span>{bookResult.publish_date}</span>}
                            {bookResult.number_of_pages && (
                              <span>{bookResult.number_of_pages} pages</span>
                            )}
                          </div>
                        </div>

                        {/* Action */}
                        <div className="flex-shrink-0">
                          <Button
                            size="sm"
                            onClick={() => handleSelectMetadata(bookResult)}
                            disabled={isDownloading}
                          >
                            {isDownloading ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                Applying...
                              </>
                            ) : (
                              <>
                                <Download className="h-3 w-3 mr-1" />
                                Use This
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
          <div className="flex items-center justify-between p-6 border-t border-border bg-muted/30 flex-shrink-0">
            <p className="text-xs text-muted-foreground">
              {isManga ? (
                <>
                  Data from{' '}
                  <a
                    href="https://anilist.co"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    AniList
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              ) : (
                <>
                  Data from{' '}
                  <a
                    href="https://openlibrary.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Open Library
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
            </p>
            <Dialog.Close asChild>
              <Button variant="outline">Close</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
