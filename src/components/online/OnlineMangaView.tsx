import { useState } from 'react';
import { Search, BookOpen, ExternalLink, Calendar, User, Tag, Info } from 'lucide-react';
import { useMangaDex, type MangaDexManga, type MangaDexChapter } from '@/hooks/useMangaDex';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logger } from '@/lib/logger';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function OnlineMangaView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<MangaDexManga[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedManga, setSelectedManga] = useState<MangaDexManga | null>(null);
  const [chapters, setChapters] = useState<MangaDexChapter[]>([]);
  const [chaptersDialogOpen, setChaptersDialogOpen] = useState(false);
  
  const { searchManga, getChapters, getMangaUrl, getChapterUrl, loading, error } = useMangaDex();

  const handleSearch = async (page: number = 1) => {
    if (!searchQuery.trim()) return;

    logger.info('Searching MangaDex:', { query: searchQuery, page });
    
    const result = await searchManga(searchQuery, page, 20);
    
    if (result) {
      setResults(result.data);
      setTotalResults(result.total);
      setCurrentPage(page);
      setHasSearched(true);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch(1);
    }
  };

  const handleViewChapters = async (manga: MangaDexManga) => {
    setSelectedManga(manga);
    setChaptersDialogOpen(true);
    
    const chapterList = await getChapters(manga.id);
    setChapters(chapterList);
  };

  const openInBrowser = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const totalPages = Math.ceil(totalResults / 20);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-shrink-0 border-b border-border bg-muted/30 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Online Manga</h1>
              <p className="text-sm text-muted-foreground">Search and read manga from MangaDex</p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Search manga by title..."
                className="pl-10"
              />
            </div>
            <Button onClick={() => handleSearch(1)} disabled={loading || !searchQuery.trim()}>
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && hasSearched && results.length === 0 && (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">No manga found</p>
              <p className="text-sm text-muted-foreground mt-1">Try a different search query</p>
            </div>
          )}

          {!loading && !hasSearched && (
            <div className="text-center py-12">
              <Search className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">Search for manga</p>
              <p className="text-sm text-muted-foreground mt-1">Enter a title to get started</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{totalResults.toLocaleString()}</span> results
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSearch(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSearch(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid gap-4">
                {results.map((manga) => (
                  <div
                    key={manga.id}
                    className="flex gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="w-32 h-48 flex-shrink-0 bg-muted rounded overflow-hidden">
                      {manga.coverUrl ? (
                        <img
                          src={manga.coverUrl}
                          alt={manga.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="w-8 h-8 text-muted-foreground opacity-50" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <h3 className="font-semibold text-lg line-clamp-2">{manga.title}</h3>
                        {manga.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {manga.description}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {manga.status && (
                          <div className="px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                            {manga.status}
                          </div>
                        )}
                        {manga.contentRating && (
                          <div className="px-2 py-1 rounded-full bg-muted">
                            {manga.contentRating}
                          </div>
                        )}
                        {manga.year && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{manga.year}</span>
                          </div>
                        )}
                        {manga.author && (
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span>{manga.author}</span>
                          </div>
                        )}
                      </div>

                      {manga.tags && manga.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {manga.tags.slice(0, 5).map((tag, idx) => (
                            <div
                              key={idx}
                              className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                            >
                              {tag}
                            </div>
                          ))}
                          {manga.tags.length > 5 && (
                            <div className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              +{manga.tags.length - 5} more
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => handleViewChapters(manga)}
                          className="gap-1.5"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          View Chapters
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openInBrowser(getMangaUrl(manga.id))}
                          className="gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open on MangaDex
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => handleSearch(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-4">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => handleSearch(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog.Root open={chaptersDialogOpen} onOpenChange={setChaptersDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-2xl w-[90vw] max-w-2xl max-h-[85vh] flex flex-col z-50 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <Dialog.Title className="text-lg font-semibold">
                {selectedManga?.title || 'Chapters'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="text-muted-foreground hover:text-foreground p-1.5 rounded-md transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!loading && chapters.length === 0 && (
                <div className="text-center py-12">
                  <Info className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No chapters available</p>
                </div>
              )}

              {!loading && chapters.length > 0 && (
                <div className="space-y-2">
                  {chapters.map((chapter) => (
                    <div
                      key={chapter.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => openInBrowser(getChapterUrl(chapter.id))}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">
                          {chapter.volume && `Vol. ${chapter.volume} `}
                          {chapter.chapter && `Ch. ${chapter.chapter}`}
                          {chapter.title && ` - ${chapter.title}`}
                        </div>
                        {chapter.scanlationGroup && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {chapter.scanlationGroup}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{chapter.pages} pages</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
