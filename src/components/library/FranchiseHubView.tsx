import { memo, useState, useMemo, useEffect, useCallback } from 'react';
import {
  BookOpen, Layers, Tv, Film, Globe, Network, Filter, SortAsc, SortDesc,
  Clock, LayoutGrid, List, Check, ArrowRight, ExternalLink
} from 'lucide-react';
import { cn, isMangaDomain, pageCountLabel } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AppTooltip } from '@/components/ui/tooltip';
import { PremiumBookCard } from './ModernBookCard';
import { useCoverImage } from '../common/hooks/useCoverImage';
import { compareBooksNatural, parseVolumeOrChapterNumber } from '@/lib/seriesSorting';
import {
  cleanFranchiseTitle,
  fetchCrossFormatLibraryMedia,
  fetchFranchiseTransmedia,
  type CrossFormatFranchiseBooks,
  type FranchiseTransmediaData
} from '@/lib/franchiseHub';
import { FranchiseAdaptationSection } from './FranchiseAdaptationSection';
import type { Book } from '@/lib/tauri';

interface FranchiseHubViewProps {
  seriesTitle: string;
  currentBooks: Book[];
  onOpenBook: (id: number) => void;
  onSelectBook?: (id: number) => void;
  onViewDetailsBook?: (id: number) => void;
  onEditBook?: (id: number) => void;
  onDeleteBook?: (id: number) => void;
  onFavoriteBook?: (id: number) => void;
  selectedBookIds?: Set<number>;
  favoritedBookIds?: Set<number>;
  coverSize?: 'small' | 'medium' | 'large';
}

function getBookFormatBadge(book: Book) {
  const isManga = isMangaDomain(book);
  const ext = (book.file_format || '').replace(/^\./, '').toUpperCase();
  return {
    label: isManga ? (ext ? `Manga · ${ext}` : 'Manga') : (ext ? `Novel · ${ext}` : 'Light Novel'),
    className: 'bg-background/95 dark:bg-card/95 backdrop-blur-md text-foreground border-border/60 shadow-xs font-semibold',
    icon: isManga ? Layers : BookOpen,
  };
}

const FranchiseListCard = memo(function FranchiseListCard({
  book,
  isSelected,
  onSelect,
  onOpen,
}: {
  book: Book;
  isSelected: boolean;
  onSelect?: (id: number) => void;
  onOpen: (id: number) => void;
}) {
  const { coverUrl } = useCoverImage(book.id, book.cover_path);
  const isRead = book.reading_status === 'completed';
  const pageCount = pageCountLabel(book);
  const formatBadge = getBookFormatBadge(book);
  const BadgeIcon = formatBadge.icon;
  const volNum = book.series_index ?? parseVolumeOrChapterNumber(book);

  return (
    <div
      className={cn(
        'flex items-center gap-3.5 p-3 rounded-xl border transition-all cursor-pointer group',
        isSelected
          ? 'bg-primary/5 border-primary shadow-xs'
          : 'bg-card/70 border-border/50 hover:border-primary/50 hover:bg-muted/50'
      )}
      onClick={(e) => {
        if (onSelect && (e.shiftKey || e.ctrlKey || e.metaKey)) {
          onSelect(book.id!);
        } else {
          onOpen(book.id!);
        }
      }}
    >
      <div className="w-12 h-16 rounded-md overflow-hidden bg-muted/80 flex-shrink-0 relative border border-border/30">
        {coverUrl ? (
          <img src={coverUrl} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-muted-foreground/30" />
          </div>
        )}
        {isRead && (
          <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5 shadow-xs">
            <Check className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border/40 bg-secondary/60 text-foreground/90 inline-flex items-center gap-1 shadow-xs">
            <BadgeIcon className="w-3 h-3 text-primary" />
            {formatBadge.label}
          </span>
          {volNum != null && (
            <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-muted/80 text-foreground/80 border border-border/30">
              Vol. {volNum}
            </span>
          )}
        </div>

        <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {book.title}
        </h4>

        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {pageCount && <span>{pageCount}</span>}
          {book.reading_status === 'reading' && <span className="text-primary font-medium">Reading</span>}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="opacity-0 group-hover:opacity-100 transition-opacity font-semibold text-xs h-8"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(book.id!);
        }}
      >
        Read
      </Button>
    </div>
  );
});

export const FranchiseHubView = memo(function FranchiseHubView({
  seriesTitle,
  currentBooks,
  onOpenBook,
  onSelectBook,
  onViewDetailsBook,
  onEditBook,
  onDeleteBook,
  onFavoriteBook,
  selectedBookIds,
  favoritedBookIds,
  coverSize = 'medium',
}: FranchiseHubViewProps) {
  const franchiseTitle = useMemo(() => cleanFranchiseTitle(seriesTitle), [seriesTitle]);

  // Cross-Format Library Media State
  const [libraryData, setLibraryData] = useState<CrossFormatFranchiseBooks | null>(null);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);

  // Transmedia AniList / MAL State
  const [transmediaData, setTransmediaData] = useState<FranchiseTransmediaData | null>(null);
  const [isTransmediaLoading, setIsTransmediaLoading] = useState(true);

  // Filters & Display
  const [formatFilter, setFormatFilter] = useState<'all' | 'novels' | 'manga'>('all');
  const [sortOrder, setSortOrder] = useState<'chapter_asc' | 'chapter_desc' | 'date_added'>('chapter_asc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Load Cross-Format Library Books
  useEffect(() => {
    let cancelled = false;
    setIsLibraryLoading(true);

    fetchCrossFormatLibraryMedia(seriesTitle, currentBooks)
      .then((data) => {
        if (!cancelled) {
          setLibraryData(data);
          setIsLibraryLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch cross format books:', err);
        if (!cancelled) setIsLibraryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [seriesTitle, currentBooks]);

  // Load Transmedia Adaptations from AniList
  const loadTransmedia = useCallback(() => {
    let cancelled = false;
    setIsTransmediaLoading(true);

    fetchFranchiseTransmedia(seriesTitle)
      .then((data) => {
        if (!cancelled) {
          setTransmediaData(data);
          setIsTransmediaLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch transmedia:', err);
        if (!cancelled) setIsTransmediaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [seriesTitle]);

  useEffect(() => {
    const cleanup = loadTransmedia();
    return cleanup;
  }, [loadTransmedia]);

  // Filtered Library Books
  const displayedBooks = useMemo(() => {
    if (!libraryData) return [];
    let list: Book[] = [];
    if (formatFilter === 'all') list = [...libraryData.all];
    else if (formatFilter === 'novels') list = [...libraryData.novels];
    else if (formatFilter === 'manga') list = [...libraryData.manga];

    list.sort((a, b) => {
      if (sortOrder === 'chapter_asc') return compareBooksNatural(a, b, 'chapter_asc');
      if (sortOrder === 'chapter_desc') return compareBooksNatural(a, b, 'chapter_desc');
      if (sortOrder === 'date_added') return new Date(b.added_date).getTime() - new Date(a.added_date).getTime();
      return 0;
    });

    return list;
  }, [libraryData, formatFilter, sortOrder]);

  const novelsCount = libraryData?.novels.length ?? 0;
  const mangaCount = libraryData?.manga.length ?? 0;
  const hasCrossFormat = libraryData?.hasCrossFormat ?? false;
  const animeCount = transmediaData?.anime.length ?? 0;

  return (
    <div className="flex flex-col gap-8 p-4 md:p-6 animate-in fade-in duration-300">
      {/* Franchise Summary Card */}
      <div className="relative overflow-hidden rounded-xl p-5 md:p-6 bg-card border border-border/50 shadow-xs">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] md:text-xs font-black tracking-wider uppercase bg-primary text-primary-foreground shadow-xs">
                Transmedia Hub
              </span>
              {hasCrossFormat && (
                <span className="text-[10px] md:text-xs text-foreground/90 font-medium flex items-center gap-1.5 backdrop-blur-md bg-secondary/60 px-2.5 py-0.5 rounded-full border border-border/30">
                  <Network className="w-3.5 h-3.5 text-primary" />
                  Cross-Format Linked
                </span>
              )}
            </div>

            <h2 className="text-xl md:text-2xl font-black text-foreground tracking-tight">
              {franchiseTitle}
            </h2>

            <p className="text-xs md:text-sm text-muted-foreground">
              {hasCrossFormat
                ? 'Unifying both your Light Novels and Manga under a synchronized chronological franchise shelf.'
                : 'Browse all media formats, related light novels, manga, and official anime adaptations.'}
            </p>
          </div>

          {/* Quick Stats Badges */}
          <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto">
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-secondary/60 border border-border/40 shadow-xs backdrop-blur-md">
              <BookOpen className="w-4 h-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Light Novels</span>
                <span className="text-xs font-black text-foreground">{novelsCount} in Library</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-secondary/60 border border-border/40 shadow-xs backdrop-blur-md">
              <Layers className="w-4 h-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Manga</span>
                <span className="text-xs font-black text-foreground">{mangaCount} in Library</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-secondary/60 border border-border/40 shadow-xs backdrop-blur-md">
              <Tv className="w-4 h-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Anime</span>
                <span className="text-xs font-black text-foreground">{animeCount} Adaptations</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cross-Format Library Collection Section */}
      <div className="flex flex-col gap-4">
        {/* Controls Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-border/50">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <span>Library Franchise Collection</span>
              <span className="text-xs font-normal text-muted-foreground">
                ({displayedBooks.length} {displayedBooks.length === 1 ? 'item' : 'items'})
              </span>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Format Filter Switcher */}
            <div className="inline-flex items-center p-1 bg-muted/80 backdrop-blur-xl border border-border/60 rounded-full shadow-inner">
              <button
                type="button"
                onClick={() => setFormatFilter('all')}
                className={cn(
                  'px-3.5 py-1.5 text-xs font-bold rounded-full transition-all duration-200 flex items-center gap-1.5 cursor-pointer',
                  formatFilter === 'all'
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 scale-[1.02]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                )}
              >
                <span>All</span>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold',
                    formatFilter === 'all'
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {(libraryData?.all.length ?? 0)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFormatFilter('novels')}
                className={cn(
                  'px-3.5 py-1.5 text-xs font-bold rounded-full transition-all duration-200 flex items-center gap-1.5 cursor-pointer',
                  formatFilter === 'novels'
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 scale-[1.02]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                )}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Novels</span>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold',
                    formatFilter === 'novels'
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {novelsCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFormatFilter('manga')}
                className={cn(
                  'px-3.5 py-1.5 text-xs font-bold rounded-full transition-all duration-200 flex items-center gap-1.5 cursor-pointer',
                  formatFilter === 'manga'
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 scale-[1.02]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Manga</span>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold',
                    formatFilter === 'manga'
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {mangaCount}
                </span>
              </button>
            </div>

            {/* Sort & Layout Toggles */}
            <div className="inline-flex items-center gap-0.5 p-1 bg-muted/80 backdrop-blur-xl border border-border/60 rounded-full shadow-inner">
              <AppTooltip content="Ascending Volume Order" side="top">
                <button
                  type="button"
                  onClick={() => setSortOrder('chapter_asc')}
                  className={cn(
                    'p-1.5 rounded-full transition-all',
                    sortOrder === 'chapter_asc' ? 'bg-card text-foreground font-bold shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <SortAsc className="w-3.5 h-3.5" />
                </button>
              </AppTooltip>
              <AppTooltip content="Descending Volume Order" side="top">
                <button
                  type="button"
                  onClick={() => setSortOrder('chapter_desc')}
                  className={cn(
                    'p-1.5 rounded-full transition-all',
                    sortOrder === 'chapter_desc' ? 'bg-card text-foreground font-bold shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <SortDesc className="w-3.5 h-3.5" />
                </button>
              </AppTooltip>
            </div>

            <div className="inline-flex items-center gap-0.5 p-1 bg-muted/80 backdrop-blur-xl border border-border/60 rounded-full shadow-inner">
              <AppTooltip content="Grid View" side="top">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'p-1.5 rounded-full transition-all',
                    viewMode === 'grid' ? 'bg-card text-foreground font-bold shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </AppTooltip>
              <AppTooltip content="List View" side="top">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'p-1.5 rounded-full transition-all',
                    viewMode === 'list' ? 'bg-card text-foreground font-bold shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </AppTooltip>
            </div>
          </div>
        </div>

        {/* Books List or Grid */}
        {isLibraryLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 py-8">
            {[1, 2, 3, 4, 5].map((idx) => (
              <div key={idx} className="h-64 rounded-xl bg-muted/40 border border-border/40 animate-pulse" />
            ))}
          </div>
        ) : displayedBooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-border/60">
            <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-2" />
            <h4 className="text-sm font-bold text-foreground">No books matching this format</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Select &ldquo;All&rdquo; to see the entire franchise collection.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4.5">
            {displayedBooks.map((book) => {
              const volNum = book.series_index ?? parseVolumeOrChapterNumber(book);

              return (
                <div key={book.id ?? book.uuid} className="relative group transition-all duration-300">
                  <PremiumBookCard
                    book={book}
                    isSelected={selectedBookIds?.has(book.id!) ?? false}
                    onSelect={onSelectBook ?? (() => {})}
                    onOpen={onOpenBook}
                    onViewDetails={onViewDetailsBook}
                    onEdit={onEditBook ?? (() => {})}
                    onDelete={onDeleteBook ?? (() => {})}
                    isFavorited={favoritedBookIds?.has(book.id!) ?? false}
                    onFavorite={onFavoriteBook}
                    coverSize={coverSize}
                    forceVisible={true}
                  />

                  {book.reading_status === 'completed' && (
                    <div className="absolute -top-1.5 -right-1.5 z-10 bg-green-500 rounded-full p-1 shadow-md shadow-green-500/20 animate-in zoom-in">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                  )}

                  {volNum != null && (
                    <div className="absolute top-2 right-2 z-10 bg-background/90 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-black border border-border/50 shadow-xs opacity-0 group-hover:opacity-100 transition-opacity">
                      VOL {volNum}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {displayedBooks.map((book) => (
              <FranchiseListCard
                key={book.id ?? book.uuid}
                book={book}
                isSelected={selectedBookIds?.has(book.id!) ?? false}
                onSelect={onSelectBook}
                onOpen={onOpenBook}
              />
            ))}
          </div>
        )}
      </div>

      {/* External Transmedia & AniList/MAL Adaptations Section */}
      <div className="pt-4 border-t border-border/50">
        <FranchiseAdaptationSection
          data={transmediaData}
          isLoading={isTransmediaLoading}
          onRetry={loadTransmedia}
          franchiseTitle={franchiseTitle}
        />
      </div>
    </div>
  );
});
