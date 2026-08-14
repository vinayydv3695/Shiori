import { memo, useState, useMemo, useRef, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  X, BookOpen, Layers, Search, SortDesc, SortAsc,
  Clock, CheckCircle2, Edit2, Trash2, List, LayoutGrid, Check, Play, MoreVertical
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useIsMobile } from '@/hooks/useIsMobile'
import { usePreferencesStore } from '@/store/preferencesStore'
import { cn, pageCountLabel, fetchWithRetry } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PremiumBookCard } from './ModernBookCard'
import { useCoverImage } from '../common/hooks/useCoverImage'
import type { SeriesViewProps } from './types'
import { MetadataSearchDialog } from './MetadataSearchDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type Book } from '@/lib/tauri'
import { useToast } from '@/store/toastStore'
import { compareBooksNatural, parseVolumeOrChapterNumber } from '@/lib/seriesSorting'

function getBookReadStatus(book: Book) {
  return book.reading_status || 'planning';
}

const DesktopSeriesHeader = memo(function DesktopSeriesHeader({
  series,
  onFindMetadata,
  onMarkAllRead,
  onDelete,
  onOpenBook,
}: {
  series: SeriesViewProps['series']
  onFindMetadata: () => void
  onMarkAllRead: () => void
  onDelete: () => void
  onOpenBook: (id: number) => void
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // NOTE: All hooks must run unconditionally before any early return, otherwise
  // React throws "rendered fewer/more hooks than during the previous render".
  const firstBook = series?.books[0];
  const { coverUrl } = useCoverImage(firstBook?.id, firstBook?.cover_path)
  const [anilistBanner, setAnilistBanner] = useState<string | null>(null);

  useEffect(() => {
    if (series?.title) {
      const fetchBanner = async () => {
        try {
          const query = `
            query ($search: String) {
              Media(search: $search, type: MANGA) {
                bannerImage
              }
            }
          `;
          const res = await fetchWithRetry('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { search: series.title } })
          });
          const data = await res.json();
          if (data.data?.Media?.bannerImage) {
            setAnilistBanner(data.data.Media.bannerImage);
          }
        } catch {
          // ignore banner fetch failures gracefully
        }
      };
      fetchBanner();
    }
  }, [series?.title]);

  const totalPages = useMemo(() => (series?.books ?? []).reduce((acc, b) => acc + (b.page_count || 0), 0), [series?.books]);

  // Find next unread book (sorted naturally by volume/chapter)
  const sortedBooks = useMemo(() => [...(series?.books ?? [])].sort((a, b) => compareBooksNatural(a, b, 'chapter_asc')), [series?.books]);
  const nextUnreadBook = useMemo(() => sortedBooks.find(b => getBookReadStatus(b) !== 'completed'), [sortedBooks]);
  const nextVolNum = nextUnreadBook ? (nextUnreadBook.series_index ?? parseVolumeOrChapterNumber(nextUnreadBook)) : null;

  if (!series) return null;

  const readBooks = series.books.length - sortedBooks.filter(b => getBookReadStatus(b) !== 'completed').length;
  const progressPercent = series.books.length > 0 ? Math.round((readBooks / series.books.length) * 100) : 0;

  const status = 'Ongoing';
  const heroImage = anilistBanner || coverUrl;

  return (
    <div className="hidden md:block relative overflow-hidden shrink-0 border-b border-border/50 bg-card/60">
      {/* Hero Background Banner */}
      {heroImage && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div 
            className="absolute right-0 top-0 bottom-0 w-full md:w-3/5 bg-cover bg-right-top bg-no-repeat opacity-50 md:opacity-65 filter blur-[4px] transition-all duration-500"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          {/* Overlay gradients for high contrast and readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-card via-card/75 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
        </div>
      )}

      <div className="relative z-10 p-6 md:p-8 flex flex-row gap-6 md:gap-8 items-stretch w-full max-w-6xl">
        {/* Cover Artwork Card */}
        <div className="w-36 h-52 md:w-44 md:h-64 rounded-xl overflow-hidden shadow-2xl border border-white/10 flex-shrink-0 bg-muted/60 transform transition-transform hover:scale-[1.02] duration-300 relative group">
          {coverUrl ? (
            <img src={coverUrl} alt={series.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30 bg-muted">
              <BookOpen className="w-10 h-10 mb-2" />
            </div>
          )}
        </div>

        {/* Info & Actions Column (Fully Contained) */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-1 text-left">
          {/* Top metadata tags */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] md:text-xs font-black tracking-wider bg-primary text-primary-foreground shadow-sm uppercase">
                {status}
              </span>
              <span className="text-[10px] md:text-xs text-foreground/90 font-medium flex items-center gap-1.5 backdrop-blur-md bg-secondary/60 px-2.5 py-0.5 rounded-full border border-border/30">
                <Layers className="w-3.5 h-3.5 text-primary" />
                {series.bookCount} {series.bookCount === 1 ? 'Vol' : 'Vols'}
              </span>
              {totalPages > 0 && (
                <span className="text-[10px] md:text-xs text-foreground/90 font-medium flex items-center gap-1.5 backdrop-blur-md bg-secondary/60 px-2.5 py-0.5 rounded-full border border-border/30">
                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                  {totalPages.toLocaleString()} Pages
                </span>
              )}
            </div>
            
            {/* Title & Author */}
            <Dialog.Title className="text-2xl md:text-4xl font-black text-foreground tracking-tight line-clamp-2 drop-shadow-md leading-tight mt-1">
              {series.title}
            </Dialog.Title>
            <p className="text-sm md:text-base text-foreground/80 font-medium truncate">
              {Array.from(series.authors).join(', ') || 'Unknown Author'}
            </p>
          </div>

          {/* Bottom Actions & Reading Progress (Contained inside info box) */}
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-border/20">
            {/* Primary Action Button */}
            <Button 
              size="lg" 
              onClick={() => {
                if (nextUnreadBook?.id) onOpenBook(nextUnreadBook.id);
                else if (sortedBooks[0]?.id) onOpenBook(sortedBooks[0].id);
              }} 
              className="h-11 px-6 gap-2.5 font-bold text-sm rounded-xl bg-gradient-to-r from-primary via-primary/95 to-primary/85 hover:from-primary/90 hover:to-primary text-primary-foreground shadow-[0_4px_16px_-2px_rgba(var(--primary),0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Play className="w-4 h-4 fill-current" /> 
              <span>{nextUnreadBook ? `Continue Vol. ${nextVolNum ?? ''}` : 'Read Again'}</span>
            </Button>

            {/* Quick Action Icon Buttons */}
            <div className="flex items-center gap-1.5">
              <Button 
                variant="secondary" 
                size="lg" 
                onClick={onMarkAllRead} 
                className="w-11 h-11 shrink-0 px-0 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground/90 hover:text-foreground border border-border/40 hover:border-border/70 backdrop-blur-xl shadow-xs hover:scale-105 active:scale-95 transition-all" 
                title="Mark All Volumes as Read"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </Button>
              
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button 
                    variant="secondary" 
                    size="lg" 
                    className="w-11 h-11 shrink-0 px-0 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground/90 hover:text-foreground border border-border/40 hover:border-border/70 backdrop-blur-xl shadow-xs hover:scale-105 active:scale-95 transition-all"
                    title="More Options"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="start" className="w-52 bg-card/95 backdrop-blur-2xl border border-border/50 rounded-xl shadow-2xl p-1.5 z-[100] animate-in fade-in zoom-in-95 data-[side=bottom]:slide-in-from-top-2">
                    <DropdownMenu.Item onSelect={onFindMetadata} className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground cursor-pointer outline-none hover:bg-secondary rounded-lg transition-colors font-medium">
                      <Edit2 className="w-4 h-4 text-primary" /> Edit Metadata
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="h-px bg-border/40 my-1" />
                    {!showDeleteConfirm ? (
                      <DropdownMenu.Item onSelect={(e) => { e.preventDefault(); setShowDeleteConfirm(true); }} className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-destructive cursor-pointer outline-none hover:bg-destructive/10 rounded-lg transition-colors font-medium">
                        <Trash2 className="w-4 h-4" /> Ungroup Series
                      </DropdownMenu.Item>
                    ) : (
                      <div className="flex items-center justify-between p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <span className="text-xs text-destructive font-bold">Delete Series?</span>
                        <div className="flex gap-1.5">
                          <Button variant="destructive" size="sm" onClick={onDelete} className="h-7 text-xs px-2.5 rounded-md font-bold">Yes</Button>
                          <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} className="h-7 text-xs px-2.5 rounded-md hover:bg-destructive/20 text-destructive font-medium">No</Button>
                        </div>
                      </div>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>

            {/* Reading Progress Indicator (Compact & Contained) */}
            <div className="flex-1 min-w-[200px] max-w-xs flex flex-col justify-center gap-1.5 ml-auto bg-secondary/40 backdrop-blur-xl border border-border/30 rounded-xl px-3.5 py-2 shadow-xs">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Progress
                </span>
                <span className="text-foreground">
                  <span className="text-primary font-black">{readBooks}</span>/{series.books.length} <span className="text-muted-foreground font-medium">({progressPercent}%)</span>
                </span>
              </div>
              <div className="h-1.5 w-full bg-background/70 backdrop-blur-sm rounded-full overflow-hidden border border-border/20">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-700 rounded-full shadow-[0_0_8px_rgba(var(--primary),0.5)]" 
                  style={{ width: `${progressPercent}%` }} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

const MobileSeriesHeader = memo(function MobileSeriesHeader({
  series,
  onFindMetadata,
  onMarkAllRead,
  onDelete,
  onOpenBook,
}: {
  series: SeriesViewProps['series']
  onFindMetadata: () => void
  onMarkAllRead: () => void
  onDelete: () => void
  onOpenBook: (id: number) => void
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // NOTE: All hooks must run unconditionally before any early return, otherwise
  // React throws "rendered fewer/more hooks than during the previous render".
  const firstBook = series?.books[0];
  const { coverUrl } = useCoverImage(firstBook?.id, firstBook?.cover_path)
  const [anilistBanner, setAnilistBanner] = useState<string | null>(null);

  useEffect(() => {
    if (series?.title) {
      const fetchBanner = async () => {
        try {
          const query = `
            query ($search: String) {
              Media(search: $search, type: MANGA) {
                bannerImage
              }
            }
          `;
          const res = await fetchWithRetry('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { search: series.title } })
          });
          const data = await res.json();
          if (data.data?.Media?.bannerImage) {
            setAnilistBanner(data.data.Media.bannerImage);
          }
        } catch {
          // ignore banner fetch failures gracefully
        }
      };
      fetchBanner();
    }
  }, [series?.title]);

  const totalPages = useMemo(() => (series?.books ?? []).reduce((acc, b) => acc + (b.page_count || 0), 0), [series?.books]);

  // Find next unread book (sorted naturally by volume/chapter)
  const sortedBooks = useMemo(() => [...(series?.books ?? [])].sort((a, b) => compareBooksNatural(a, b, 'chapter_asc')), [series?.books]);
  const nextUnreadBook = useMemo(() => sortedBooks.find(b => getBookReadStatus(b) !== 'completed'), [sortedBooks]);
  const nextVolNum = nextUnreadBook ? (nextUnreadBook.series_index ?? parseVolumeOrChapterNumber(nextUnreadBook)) : null;

  if (!series) return null;

  const readBooks = series.books.length - sortedBooks.filter(b => getBookReadStatus(b) !== 'completed').length;
  const progressPercent = series.books.length > 0 ? Math.round((readBooks / series.books.length) * 100) : 0;

  const status = 'Ongoing';
  const heroImage = anilistBanner || coverUrl;

  return (
    <div className="md:hidden flex flex-col relative w-full shrink-0 border-b border-border/50 bg-card/60 overflow-hidden">
      {/* Hero Background Banner */}
      {heroImage && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40 filter blur-[4px] transition-all duration-500"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-card via-card/60 to-transparent" />
        </div>
      )}

      <div className="relative z-10 px-4 pt-16 pb-4 flex flex-col gap-3.5">
        {/* Top Section: Cover & Info (Horizontal) */}
        <div className="flex flex-row gap-3.5 items-center w-full">
          {/* Cover */}
          <div className="w-20 h-28 rounded-lg overflow-hidden shadow-xl border border-white/10 flex-shrink-0 bg-muted/60 relative z-20">
            {coverUrl ? (
              <img src={coverUrl} alt={series.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 bg-muted">
                <BookOpen className="w-7 h-7" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col justify-center w-full text-left">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider bg-primary text-primary-foreground shadow-sm uppercase">
                {status}
              </span>
              <span className="text-[10px] text-foreground/90 font-medium flex items-center gap-1 backdrop-blur-md bg-secondary/60 px-2 py-0.5 rounded-full border border-border/20">
                <Layers className="w-3 h-3 text-primary" />
                {series.bookCount} {series.bookCount === 1 ? 'Vol' : 'Vols'}
              </span>
            </div>
            
            <Dialog.Title className="text-lg font-black text-foreground line-clamp-2 tracking-tight leading-snug drop-shadow-md break-words">
              {series.title}
            </Dialog.Title>
            <p className="text-xs text-foreground/75 truncate font-medium mt-0.5">
              {Array.from(series.authors).join(', ') || 'Unknown Author'}
            </p>
          </div>
        </div>

        {/* Actions & Progress Section */}
        <div className="flex flex-col gap-2.5 w-full pt-1 border-t border-border/20">
          <div className="flex items-center gap-2 w-full">
            <Button 
              size="lg" 
              onClick={() => {
                if (nextUnreadBook?.id) onOpenBook(nextUnreadBook.id);
                else if (sortedBooks[0]?.id) onOpenBook(sortedBooks[0].id);
              }} 
              className="flex-1 h-10 gap-2 font-bold text-xs rounded-xl bg-gradient-to-r from-primary via-primary/95 to-primary/85 text-primary-foreground shadow-md shadow-primary/20 active:scale-[0.98] transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> 
              <span>{nextUnreadBook ? `Continue Vol. ${nextVolNum ?? ''}` : 'Read Again'}</span>
            </Button>

            <Button 
              variant="secondary" 
              size="lg" 
              onClick={onMarkAllRead} 
              className="w-10 h-10 shrink-0 px-0 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground/90 border border-border/40 backdrop-blur-xl shadow-xs transition-colors" 
              title="Mark All Read"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </Button>
            
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button 
                  variant="secondary" 
                  size="lg" 
                  className="w-10 h-10 shrink-0 px-0 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground/90 border border-border/40 backdrop-blur-xl shadow-xs transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" className="w-48 bg-card/95 backdrop-blur-2xl border border-border/50 rounded-xl shadow-2xl p-1.5 z-[100]">
                  <DropdownMenu.Item onSelect={onFindMetadata} className="flex items-center gap-2 px-3 py-2 text-sm text-foreground rounded-lg font-medium">
                    <Edit2 className="w-4 h-4 text-primary" /> Edit Metadata
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="h-px bg-border/40 my-1" />
                  {!showDeleteConfirm ? (
                    <DropdownMenu.Item onSelect={(e) => { e.preventDefault(); setShowDeleteConfirm(true); }} className="flex items-center gap-2 px-3 py-2 text-sm text-destructive rounded-lg font-medium">
                      <Trash2 className="w-4 h-4" /> Ungroup Series
                    </DropdownMenu.Item>
                  ) : (
                    <div className="flex items-center justify-between p-2 bg-destructive/10 rounded-lg">
                      <span className="text-xs text-destructive font-bold">Sure?</span>
                      <div className="flex gap-1">
                        <Button variant="destructive" size="sm" onClick={onDelete} className="h-6 text-[10px] px-2">Yes</Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} className="h-6 text-[10px] px-2 text-destructive">No</Button>
                      </div>
                    </div>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>

          {/* Reading Progress Bar */}
          <div className="bg-secondary/40 backdrop-blur-xl border border-border/30 rounded-xl px-3 py-2 shadow-xs">
            <div className="flex items-center justify-between mb-1 text-[10px] font-bold">
              <span className="text-muted-foreground uppercase tracking-wider">Progress</span>
              <span className="text-foreground">{readBooks}/{series.books.length} vols <span className="text-primary font-black">({progressPercent}%)</span></span>
            </div>
            <div className="h-1.5 w-full bg-background/70 rounded-full overflow-hidden border border-border/20">
              <div className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500 rounded-full" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

const ListBookCard = memo(function ListBookCard({
  book,
  isSelected,
  onSelect,
  onOpen,
}: {
  book: Book
  isSelected: boolean
  onSelect: (id: number) => void
  onOpen: (id: number) => void
}) {
  const { coverUrl } = useCoverImage(book.id, book.cover_path);
  const status = getBookReadStatus(book);
  const isRead = status === 'completed';
  const pageCount = pageCountLabel(book);

  return (
    <div 
      className={cn(
        "flex items-center gap-4 p-3 rounded-lg border transition-all cursor-pointer group",
        isSelected ? "bg-primary/5 border-primary shadow-sm" : "bg-card border-border hover:border-primary/50 hover:bg-muted/50"
      )}
      onClick={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          onSelect(book.id!);
        } else {
          onOpen(book.id!);
        }
      }}
    >
      <div className="w-12 h-16 rounded overflow-hidden bg-muted flex-shrink-0 relative">
        {coverUrl ? (
          <img src={coverUrl} alt={book.title} className="w-full h-full object-cover bg-muted" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-muted-foreground/30" />
          </div>
        )}
        {isRead && (
          <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5 shadow-sm">
            <Check className="w-2 h-2 text-white" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {book.title}
        </h4>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {(() => {
            const volNum = book.series_index ?? parseVolumeOrChapterNumber(book);
            return volNum !== null && volNum !== undefined ? (
              <span className="font-medium bg-muted px-1.5 py-0.5 rounded text-foreground/80">Vol. {volNum}</span>
            ) : null;
          })()}
          {pageCount && <span>{pageCount}</span>}
          {status === 'reading' && <span className="text-blue-500 font-medium">Reading</span>}
        </div>
      </div>
      
      <Button 
        variant="ghost" 
        size="sm" 
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); onOpen(book.id!); }}
      >
        Read
      </Button>
    </div>
  );
});

export const SeriesView = memo(function SeriesView({
  series,
  isOpen,
  onClose,
  onSelectBook,
  onOpenBook,
  onViewDetailsBook,
  onEditBook,
  onDeleteBook,
  onFavoriteBook,
  selectedBookIds,
  favoritedBookIds,
}: SeriesViewProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'unread' | 'read'>('all')
  const [sortOrder, setSortOrder] = useState<'chapter_asc' | 'chapter_desc' | 'date_added'>('chapter_asc')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [jumpInput, setJumpInput] = useState('')
  const [parentEl, setParentEl] = useState<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(0)
  const isMobile = useIsMobile()
  const toast = useToast()
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false)
  const [metadataSeriesId, setMetadataSeriesId] = useState<number | null>(null)

  const density = usePreferencesStore((state) => state.preferences?.libraryDensity ?? 'comfortable')
  const coverSize = usePreferencesStore((state) => state.preferences?.coverSize ?? 'medium')
  const bookRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const unreadCount = useMemo(() => (series?.books ?? []).filter(b => getBookReadStatus(b) !== 'completed').length, [series?.books]);
  const readCount = useMemo(() => (series?.books ?? []).length - unreadCount, [series?.books, unreadCount]);

  useEffect(() => {
    if (!parentEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(parentEl);
    return () => observer.disconnect();
  }, [parentEl]);

  const densityColumnSize = useMemo(() => {
    switch (density) {
      case 'compact': return 130;
      case 'spacious': return 210;
      case 'comfortable':
      default: return 160;
    }
  }, [density]);

  const columns = useMemo(() => {
    if (viewMode === 'list') return 1;
    if (!containerWidth) return isMobile ? 3 : 5;
    const padding = 32;
    const gap = 12;
    const availableWidth = containerWidth - padding;
    const calculated = Math.floor((availableWidth + gap) / (densityColumnSize + gap));
    return Math.max(1, calculated);
  }, [containerWidth, densityColumnSize, isMobile, viewMode]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'j' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        const jumpInputEl = document.getElementById('chapter-jump-input');
        if (jumpInputEl) jumpInputEl.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jumpInput) return;
    const targetChapter = parseFloat(jumpInput);
    if (isNaN(targetChapter)) return;
    
    const targetIndex = processedBooks.findIndex(b => {
      const idx = parseVolumeOrChapterNumber(b);
      return idx === targetChapter;
    });

    if (targetIndex !== -1) {
      const rowIndex = Math.floor(targetIndex / columns);
      rowVirtualizer.scrollToIndex(rowIndex, { align: 'center' });
      
      setTimeout(() => {
        const targetBook = processedBooks[targetIndex];
        if (targetBook && targetBook.id) {
          const el = bookRefs.current.get(targetBook.id);
          if (el) {
            el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'rounded-lg');
            setTimeout(() => {
              el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'rounded-lg');
            }, 2000);
          }
        }
      }, 150);
      setJumpInput('');
    } else {
      toast.error('Not Found', `Volume/Chapter ${targetChapter} is not in this series or is filtered out.`);
    }
  };

  const processedBooks = useMemo(() => {
    if (!series) return [];
    let result = [...series.books];
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(b => {
        const volNum = parseVolumeOrChapterNumber(b);
        return (
          b.title.toLowerCase().includes(q) || 
          (volNum !== null && (volNum.toString() === q || `vol ${volNum}`.includes(q) || `ch ${volNum}`.includes(q)))
        );
      });
    }
    if (filterStatus !== 'all') {
      result = result.filter(b => {
        const status = getBookReadStatus(b);
        return filterStatus === 'read' ? status === 'completed' : status !== 'completed';
      });
    }
    result.sort((a, b) => {
      if (sortOrder === 'chapter_asc') return compareBooksNatural(a, b, 'chapter_asc');
      if (sortOrder === 'chapter_desc') return compareBooksNatural(a, b, 'chapter_desc');
      if (sortOrder === 'date_added') return new Date(b.added_date).getTime() - new Date(a.added_date).getTime();
      return 0;
    });
    return result;
  }, [series, searchQuery, filterStatus, sortOrder]);

  const estimatedRowHeight = useMemo(() => {
    if (viewMode === 'list') return 90; // Approx height of list item + gap
    
    if (!containerWidth || columns === 0) {
      const coverHeight = densityColumnSize * 1.5;
      return Math.ceil(coverHeight + 8);
    }
    const horizontalPadding = 32; // p-4 md:p-6 (approx 16px to 24px each side)
    const totalGapWidth = (columns - 1) * 12; // gap-3 is 12px
    const availableWidth = containerWidth - horizontalPadding - totalGapWidth;
    const actualColumnWidth = availableWidth / columns;
    const actualCoverHeight = actualColumnWidth * 1.5;
    return Math.ceil(actualCoverHeight + 12);
  }, [containerWidth, columns, densityColumnSize, viewMode]);

  const rowsCount = Math.ceil(processedBooks.length / columns);
  const rowVirtualizer = useVirtualizer({
    count: rowsCount,
    getScrollElement: () => parentEl,
    estimateSize: () => estimatedRowHeight,
    overscan: 3,
  });

  if (!series) return null;

  const getErrorMessage = (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
      const maybe = err as { userMessage?: string; message?: string; technicalDetails?: string };
      return maybe.userMessage || maybe.message || maybe.technicalDetails || JSON.stringify(err);
    }
    return String(err);
  };

  const handleFindSeriesMetadata = async () => {
    if (!series) return;
    try {
      const list = await api.getMangaSeriesList(1000, 0);
      const match = list.find(s => s.title.toLowerCase() === series.title.toLowerCase());
      if (!match?.id) {
        toast.error('Series not found', 'Could not resolve this series in database.');
        return;
      }
      setMetadataSeriesId(match.id);
      setMetadataDialogOpen(true);
    } catch (err) {
      logger.error('Failed to resolve series ID for metadata:', err);
      toast.error('Metadata error', getErrorMessage(err));
    }
  };

  const handleDeleteSeries = async () => {
    try {
      const list = await api.getMangaSeriesList(1000, 0);
      const targetSeries = list.find(s => s.title.toLowerCase() === series.title.toLowerCase());
      
      if (targetSeries && targetSeries.id !== undefined) {
          await api.deleteMangaSeries(targetSeries.id);
      }

      const bookIds = series.books.map(b => b.id).filter((id): id is number => id !== undefined);
      if (bookIds.length > 0) {
          await api.deleteBooks(bookIds);
      }
      
      toast.success('Series Deleted', 'Series and all volumes have been deleted.');
      onClose();
     } catch (err) {
       logger.error(err);
       toast.error('Error', 'Failed to delete series.');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      for (const book of series.books) {
        if (book.id && getBookReadStatus(book) !== 'completed') {
          await api.updateBook({ ...book, reading_status: 'completed' });
        }
      }
      toast.success('Updated', 'All volumes marked as read. Note: Refresh required to see changes.');
     } catch (err) {
       logger.error(err);
       toast.error('Error', 'Failed to mark volumes as read.');
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content 
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'bg-background shadow-2xl',
            'w-full h-[100dvh] rounded-none border-none md:border md:border-border/50 md:rounded-xl md:w-[90vw] md:max-w-6xl md:h-[90vh]',
            'flex flex-col z-50 overflow-hidden',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          <Dialog.Close asChild>
            <button className="absolute top-[calc(env(safe-area-inset-top,0px)+1rem)] md:top-4 right-4 text-foreground/80 hover:text-foreground transition-colors flex-shrink-0 z-[60] bg-secondary/80 hover:bg-secondary backdrop-blur-md p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary border border-border/50 shadow-md hover:scale-105 active:scale-95" title="Close series view">
              <X className="h-5 w-5" />
            </button>
          </Dialog.Close>
          
          <ScrollArea className="flex-1 bg-background/50">
            <div ref={setParentEl} className="flex flex-col min-h-full">
            <DesktopSeriesHeader 
              series={series} 
              onFindMetadata={handleFindSeriesMetadata}
              onDelete={handleDeleteSeries}
              onMarkAllRead={handleMarkAllRead}
              onOpenBook={onOpenBook}
            />
            <MobileSeriesHeader 
              series={series} 
              onFindMetadata={handleFindSeriesMetadata}
              onDelete={handleDeleteSeries}
              onMarkAllRead={handleMarkAllRead}
              onOpenBook={onOpenBook}
            />

          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-border/40 bg-card/75 backdrop-blur-2xl shrink-0 sticky top-0 z-20 shadow-xs">
            {/* Left: Search & Jump */}
            <div className="flex items-center gap-2.5 w-full md:w-auto">
              <div className="relative flex-1 md:w-72 group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                <Input 
                  type="search"
                  placeholder="Search volumes..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 h-10 bg-secondary/50 hover:bg-secondary/80 focus-visible:bg-secondary border-border/40 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20 rounded-full text-sm font-medium transition-all shadow-xs"
                />
                {searchQuery && (
                  <button 
                    type="button" 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <form onSubmit={handleJumpSubmit} className="relative flex-shrink-0 group">
                <Input 
                  id="chapter-jump-input"
                  type="number"
                  inputMode="numeric"
                  placeholder="Vol #" 
                  value={jumpInput}
                  onChange={(e) => setJumpInput(e.target.value)}
                  className="h-10 w-24 bg-secondary/50 hover:bg-secondary/80 focus-visible:bg-secondary border-border/40 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20 rounded-full text-center text-sm font-bold transition-all shadow-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  title="Jump to Volume Number"
                />
              </form>
            </div>

            {/* Right: Filter Segmented Control, Sort Controls, and Layout Toggles */}
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
              {/* Segmented Filter Pills */}
              <div className="inline-flex items-center p-1 bg-secondary/60 backdrop-blur-xl border border-border/40 rounded-full shadow-inner">
                <button 
                  type="button"
                  onClick={() => setFilterStatus('all')} 
                  className={cn(
                    "px-3.5 py-1.5 text-xs font-bold rounded-full transition-all duration-200 flex items-center gap-1.5",
                    filterStatus === 'all' 
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25 scale-[1.02]" 
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )}
                >
                  <span>All</span>
                  <span className={cn("text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold", filterStatus === 'all' ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground")}>{series?.books.length ?? 0}</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setFilterStatus('unread')} 
                  className={cn(
                    "px-3.5 py-1.5 text-xs font-bold rounded-full transition-all duration-200 flex items-center gap-1.5",
                    filterStatus === 'unread' 
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25 scale-[1.02]" 
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )}
                >
                  <span>Unread</span>
                  <span className={cn("text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold", filterStatus === 'unread' ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground")}>{unreadCount}</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setFilterStatus('read')} 
                  className={cn(
                    "px-3.5 py-1.5 text-xs font-bold rounded-full transition-all duration-200 flex items-center gap-1.5",
                    filterStatus === 'read' 
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25 scale-[1.02]" 
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )}
                >
                  <span>Read</span>
                  <span className={cn("text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold", filterStatus === 'read' ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground")}>{readCount}</span>
                </button>
              </div>

              {/* Sort Action Group */}
              <div className="inline-flex items-center gap-0.5 p-1 bg-secondary/60 backdrop-blur-xl border border-border/40 rounded-full shadow-inner shrink-0">
                <button 
                  type="button"
                  onClick={() => setSortOrder('chapter_asc')} 
                  className={cn(
                    "p-2 rounded-full transition-all duration-200", 
                    sortOrder === 'chapter_asc' ? "bg-card text-foreground font-bold shadow-xs scale-105" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )} 
                  title="Sort Ascending (Oldest First)"
                >
                  <SortAsc className="w-4 h-4" />
                </button>
                <button 
                  type="button"
                  onClick={() => setSortOrder('chapter_desc')} 
                  className={cn(
                    "p-2 rounded-full transition-all duration-200", 
                    sortOrder === 'chapter_desc' ? "bg-card text-foreground font-bold shadow-xs scale-105" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )} 
                  title="Sort Descending (Newest First)"
                >
                  <SortDesc className="w-4 h-4" />
                </button>
                <button 
                  type="button"
                  onClick={() => setSortOrder('date_added')} 
                  className={cn(
                    "p-2 rounded-full transition-all duration-200", 
                    sortOrder === 'date_added' ? "bg-card text-foreground font-bold shadow-xs scale-105" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )} 
                  title="Sort by Date Added"
                >
                  <Clock className="w-4 h-4" />
                </button>
              </div>

              <div className="h-5 w-px bg-border/40 mx-0.5 hidden md:block shrink-0" />

              {/* Grid / List View Mode Switcher */}
              <div className="inline-flex items-center gap-0.5 p-1 bg-secondary/60 backdrop-blur-xl border border-border/40 rounded-full shadow-inner shrink-0">
                <button 
                  type="button"
                  onClick={() => setViewMode('grid')} 
                  className={cn(
                    "p-2 rounded-full transition-all duration-200", 
                    viewMode === 'grid' ? "bg-card text-foreground font-bold shadow-xs scale-105" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )} 
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button 
                  type="button"
                  onClick={() => setViewMode('list')} 
                  className={cn(
                    "p-2 rounded-full transition-all duration-200", 
                    viewMode === 'list' ? "bg-card text-foreground font-bold shadow-xs scale-105" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )} 
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 md:p-6 animate-in slide-in-from-bottom-4 fade-in duration-500 ease-out fill-mode-both">
              {processedBooks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed border-border/50 rounded-xl">
                  <Search className="w-12 h-12 mb-4 opacity-20" />
                  <h3 className="text-lg font-semibold text-foreground/80 mb-1">No volumes found</h3>
                  <p className="text-sm">Try adjusting your search or filters.</p>
                  {(searchQuery || filterStatus !== 'all') && (
                    <Button variant="link" onClick={() => { setSearchQuery(''); setFilterStatus('all'); }} className="mt-4">
                      Clear Filters
                    </Button>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const startIndex = virtualRow.index * columns;
                    const rowItems = processedBooks.slice(startIndex, startIndex + columns);

                    return (
                      <div
                        key={virtualRow.index}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                          display: 'flex',
                          gap: viewMode === 'grid' ? '12px' : '8px',
                          padding: viewMode === 'list' ? '4px 0' : '0',
                        }}
                      >
                        {rowItems.map((book, idx) => {
                          const absoluteIndex = startIndex + idx;
                          return (
                            <div
                              key={book.id ?? book.uuid}
                              ref={(el) => { if (book.id && el) bookRefs.current.set(book.id, el); }}
                              style={{ flex: '1 1 0', minWidth: 0 }}
                              className="relative group transition-all duration-300"
                            >
                              {viewMode === 'grid' ? (
                                <>
                                  <PremiumBookCard
                                    book={book}
                                    isSelected={selectedBookIds?.has(book.id!) ?? false}
                                    onSelect={onSelectBook}
                                    onOpen={onOpenBook}
                                    onViewDetails={onViewDetailsBook}
                                    onEdit={onEditBook}
                                    onDelete={onDeleteBook}
                                    isFavorited={favoritedBookIds?.has(book.id!) ?? false}
                                    onFavorite={onFavoriteBook}
                                    animationDelay={absoluteIndex * 20}
                                    coverSize={coverSize}
                                    scrollRoot={parentEl}
                                    forceVisible={true}
                                  />
                                  {getBookReadStatus(book) === 'completed' && (
                                    <div className="absolute -top-2 -right-2 z-10 bg-green-500 rounded-full p-1 shadow-md shadow-green-500/20 animate-in zoom-in">
                                      <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                                    </div>
                                  )}
                                  {(() => {
                                    const volNum = book.series_index ?? parseVolumeOrChapterNumber(book);
                                    return volNum !== null && volNum !== undefined ? (
                                      <div className="absolute top-2 left-2 z-10 bg-background/90 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-black border border-border/50 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                        VOL {volNum}
                                      </div>
                                    ) : null;
                                  })()}
                                </>
                              ) : (
                                <ListBookCard
                                  book={book}
                                  isSelected={selectedBookIds?.has(book.id!) ?? false}
                                  onSelect={onSelectBook}
                                  onOpen={onOpenBook}
                                />
                              )}
                            </div>
                          );
                        })}
                        {viewMode === 'grid' && Array.from({ length: columns - rowItems.length }).map((_, i) => (
                          <div key={`empty-${i}`} style={{ flex: '1 1 0' }} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </div>
          </ScrollArea>

          {metadataSeriesId && (
            <MetadataSearchDialog
              open={metadataDialogOpen}
              onOpenChange={setMetadataDialogOpen}
              bookIds={series.books.map((b) => b.id!).filter(Boolean)}
              bookTitle={series.title}
              isManga={true}
              isbn={null}
              seriesId={metadataSeriesId}
              onMetadataSelected={async () => {
                setMetadataDialogOpen(false);
              }}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
