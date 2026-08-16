import { useState, useEffect, useMemo } from 'react';
import { fetchTrendingBooks, fetchSubjectBooks } from '@/online-books/openlibrary/api';
import type { OpenLibraryWork } from '@/online-books/openlibrary/types';
import { fetchLibgenBooks } from '@/online-books/libgen/api';
import { downloadAndImportLibgen } from '@/online-books/libgen/importer';
import { fetchGutenbergBooks } from '@/online-books/gutenberg/api';
import { downloadAndImportGutenberg } from '@/online-books/gutenberg/importer';
import { useLibraryStore } from '@/store/libraryStore';
import { useToast } from '@/store/toastStore';
import { useOnlineDownloadStore } from '@/store/onlineDownloadStore';
import { Flame, Rocket, BookOpen, Compass, ArrowLeft, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HeroMangaBanner } from './HeroMangaBanner';
import { MangaContentRow } from './MangaContentRow';
import { ModernBookCard } from './ModernBookCard';
import type { CarouselItem } from './ContentCarousel';

interface ActiveCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: CarouselItem[];
}

function toBookCarouselItems(books: any[]): CarouselItem[] {
  return books.map((book) => {
    const coverId = book.cover_i || book.cover_id;
    const authorName = Array.isArray(book.author_name) 
      ? book.author_name[0] 
      : (book.authors && book.authors[0]?.name);

    return {
      id: book.key,
      title: book.title,
      subtitle: authorName || (book.first_publish_year ? String(book.first_publish_year) : undefined),
      coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined,
    };
  });
}

export function OnlineBooksDashboard() {
  const [trending, setTrending] = useState<OpenLibraryWork[]>([]);
  const [scifi, setScifi] = useState<any[]>([]);
  const [classics, setClassics] = useState<any[]>([]);
  const [fantasy, setFantasy] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<ActiveCategory | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  
  const { success: showSuccessToast, error: showErrorToast } = useToast();

  useEffect(() => {
    let active = true;
    
    Promise.allSettled([
      fetchTrendingBooks(),
      fetchSubjectBooks('science_fiction', 36),
      fetchSubjectBooks('classic_literature', 36),
      fetchSubjectBooks('fantasy', 36)
    ]).then(([trendRes, scifiRes, classicRes, fantasyRes]) => {
      if (!active) return;
      
      if (trendRes.status === 'fulfilled') setTrending(trendRes.value.slice(0, 36));
      if (scifiRes.status === 'fulfilled') setScifi(scifiRes.value);
      if (classicRes.status === 'fulfilled') setClassics(classicRes.value);
      if (fantasyRes.status === 'fulfilled') setFantasy(fantasyRes.value);
      
      setLoading(false);
    });

    return () => { active = false; };
  }, []);

  const handleBookClick = async (item: CarouselItem) => {
    const bookKey = item.id;
    const title = item.title;
    const author = item.subtitle;

    // Check if already downloading
    const existingDownload = useOnlineDownloadStore.getState().downloads[bookKey];
    if (existingDownload && existingDownload.status === 'downloading') {
      return;
    }

    try {
      showSuccessToast('Finding Book...', `Searching for "${title}" on Libgen`);
      useOnlineDownloadStore.getState().registerDownload(bookKey, title);

      // Clean query: remove subtitles or brackets if too long
      const cleanTitle = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
      const searchTerms = [cleanTitle];
      if (cleanTitle.includes(':')) {
        searchTerms.push(cleanTitle.split(':')[0].trim());
      }
      if (author && author !== 'Unknown Author') {
        searchTerms.push(`${cleanTitle} ${author}`);
      }

      let downloaded = false;

      // 1. Try Libgen first
      for (const query of searchTerms) {
        try {
          const libgenRes = await fetchLibgenBooks(query, 1, 25);
          if (libgenRes.items && libgenRes.items.length > 0) {
            // Sort to prefer EPUB > PDF > MOBI
            const sortedItems = [...libgenRes.items].sort((a: any, b: any) => {
              const formatA = (a.extra?.format || '').toLowerCase();
              const formatB = (b.extra?.format || '').toLowerCase();
              if (formatA === 'epub' && formatB !== 'epub') return -1;
              if (formatA !== 'epub' && formatB === 'epub') return 1;
              return 0;
            });

            // Find best matching item
            for (const item of sortedItems) {
              const downloadUrl = (item as any).extra?.url || item.id;
              if (!downloadUrl) continue;

              const mirrors = [
                (item as any).extra?.url,
                (item as any).extra?.mirror_1,
                (item as any).extra?.mirror_2,
                (item as any).extra?.mirror_3,
                (item as any).extra?.mirror_4,
              ].filter(Boolean) as string[];

              const format = ((item as any).extra?.format || 'epub').toLowerCase();

              showSuccessToast('Downloading...', `Downloading "${title}" from Libgen`);
              useOnlineDownloadStore.getState().registerDownload(downloadUrl, title);

              const result = await downloadAndImportLibgen(downloadUrl, title, mirrors, format);
              if (result.success.length > 0) {
                await useLibraryStore.getState().loadInitialBooks();
                useOnlineDownloadStore.getState().setDownload(bookKey, {
                  target_id: bookKey,
                  status: 'completed',
                  downloaded_bytes: 1,
                  total_bytes: 1,
                  title,
                  unit: 'bytes',
                });
                showSuccessToast('Download Complete', `"${title}" has been added to your library.`);
                downloaded = true;
                break;
              }
            }

            if (downloaded) break;
          }
        } catch (libgenErr) {
          console.warn('Libgen search/download error:', libgenErr);
        }
      }

      if (downloaded) return;

      // 2. Fallback to Project Gutenberg
      showSuccessToast('Checking Gutenberg...', `Searching Project Gutenberg for "${title}"`);
      try {
        const gutenbergRes = await fetchGutenbergBooks(cleanTitle.split(':')[0].trim(), 1);
        if (gutenbergRes.results && gutenbergRes.results.length > 0) {
          for (const gBook of gutenbergRes.results) {
            const epubFormat = gBook.formats['application/epub+zip'];
            const mobiFormat = gBook.formats['application/x-mobipocket-ebook'];
            const downloadUrl = epubFormat || mobiFormat;
            if (!downloadUrl) continue;

            showSuccessToast('Downloading...', `Downloading "${title}" from Project Gutenberg`);
            useOnlineDownloadStore.getState().registerDownload(downloadUrl, title);

            const result = await downloadAndImportGutenberg(downloadUrl, title);
            if (result.success.length > 0) {
              await useLibraryStore.getState().loadInitialBooks();
              useOnlineDownloadStore.getState().setDownload(bookKey, {
                target_id: bookKey,
                status: 'completed',
                downloaded_bytes: 1,
                total_bytes: 1,
                title,
                unit: 'bytes',
              });
              showSuccessToast('Download Complete', `"${title}" downloaded from Project Gutenberg and added to your library.`);
              downloaded = true;
              break;
            }
          }
        }
      } catch (gutenbergErr) {
        console.warn('Gutenberg search/download error:', gutenbergErr);
      }

      if (!downloaded) {
        useOnlineDownloadStore.getState().setDownload(bookKey, {
          target_id: bookKey,
          status: 'error',
          downloaded_bytes: 0,
          total_bytes: null,
          title,
          unit: 'bytes',
        });
        showErrorToast('Download Failed', `Could not find a downloadable copy for "${title}" on Libgen or Project Gutenberg.`);
      }
    } catch (err: any) {
      useOnlineDownloadStore.getState().setDownload(bookKey, {
        target_id: bookKey,
        status: 'error',
        downloaded_bytes: 0,
        total_bytes: null,
        title,
        unit: 'bytes',
      });
      showErrorToast('Download Failed', err?.message || `Failed to download "${title}".`);
    }
  };

  const trendingItems = useMemo(() => toBookCarouselItems(trending), [trending]);
  const scifiItems = useMemo(() => toBookCarouselItems(scifi), [scifi]);
  const classicsItems = useMemo(() => toBookCarouselItems(classics), [classics]);
  const fantasyItems = useMemo(() => toBookCarouselItems(fantasy), [fantasy]);

  // Filter items in active category view
  const filteredCategoryItems = useMemo(() => {
    if (!activeCategory) return [];
    if (!categorySearch.trim()) return activeCategory.items;
    const query = categorySearch.toLowerCase().trim();
    return activeCategory.items.filter(
      (b) => b.title.toLowerCase().includes(query) || (b.subtitle && b.subtitle.toLowerCase().includes(query))
    );
  }, [activeCategory, categorySearch]);

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-6 pb-24 scroll-smooth">
      <div className="max-w-[1700px] mx-auto flex flex-col min-w-0">
        {activeCategory ? (
          /* ── Full Grid Category "View All" View ── */
          <div className="space-y-6">
            {/* Category Navigation Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveCategory(null);
                    setCategorySearch('');
                  }}
                  className="rounded-full px-3 py-1.5 h-9 font-bold text-muted-foreground hover:text-foreground hover:bg-secondary gap-2 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Explore</span>
                </Button>
                <div className="h-4 w-px bg-border/60 hidden sm:block" />
                <div className="flex items-center gap-2.5">
                  {activeCategory.icon}
                  <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                    {activeCategory.title}
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                    {filteredCategoryItems.length}
                  </span>
                </div>
              </div>

              {/* In-category search filter */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Filter category..."
                  className="pl-9 pr-8 h-9 rounded-full bg-card/85 border-border/60 text-xs sm:text-sm shadow-xs focus-visible:ring-1 focus-visible:ring-primary"
                />
                {categorySearch && (
                  <button
                    type="button"
                    onClick={() => setCategorySearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Books Grid */}
            {filteredCategoryItems.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(125px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 sm:gap-4 md:gap-6">
                {filteredCategoryItems.map((item) => (
                  <ModernBookCard
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    author={item.subtitle}
                    coverUrl={item.coverUrl}
                    onClick={() => handleBookClick(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Compass className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-base font-semibold">No books matching &ldquo;{categorySearch}&rdquo;</p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setCategorySearch('')}
                  className="mt-2 text-primary font-bold"
                >
                  Clear filter
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* ── Default Dashboard View with Rails ── */
          <>
            {/* Featured Hero Spotlight Banner */}
            <HeroMangaBanner
              items={trendingItems}
              loading={loading}
              onReadClick={handleBookClick}
              sourceId="generic"
            />

            {/* Trending Books Rail */}
            <MangaContentRow
              title="Trending & Best Sellers"
              icon={<Flame className="w-5 h-5 text-primary" />}
              items={trendingItems}
              loading={loading}
              onItemClick={handleBookClick}
              onViewAll={() =>
                setActiveCategory({
                  id: 'trending',
                  title: 'Trending & Best Sellers',
                  icon: <Flame className="w-5 h-5 text-primary" />,
                  items: trendingItems,
                })
              }
            />

            {/* Science Fiction & Cyberpunk Rail */}
            <MangaContentRow
              title="Science Fiction & Cyberpunk"
              icon={<Rocket className="w-5 h-5 text-primary" />}
              items={scifiItems}
              loading={loading}
              onItemClick={handleBookClick}
              onViewAll={() =>
                setActiveCategory({
                  id: 'scifi',
                  title: 'Science Fiction & Cyberpunk',
                  icon: <Rocket className="w-5 h-5 text-primary" />,
                  items: scifiItems,
                })
              }
            />

            {/* Classic Literature Rail */}
            <MangaContentRow
              title="Classic Literature & Philosophy"
              icon={<BookOpen className="w-5 h-5 text-primary" />}
              items={classicsItems}
              loading={loading}
              onItemClick={handleBookClick}
              onViewAll={() =>
                setActiveCategory({
                  id: 'classics',
                  title: 'Classic Literature & Philosophy',
                  icon: <BookOpen className="w-5 h-5 text-primary" />,
                  items: classicsItems,
                })
              }
            />

            {/* Epic Fantasy Rail */}
            <MangaContentRow
              title="Epic Fantasy & Adventure"
              icon={<Compass className="w-5 h-5 text-primary" />}
              items={fantasyItems}
              loading={loading}
              onItemClick={handleBookClick}
              onViewAll={() =>
                setActiveCategory({
                  id: 'fantasy',
                  title: 'Epic Fantasy & Adventure',
                  icon: <Compass className="w-5 h-5 text-primary" />,
                  items: fantasyItems,
                })
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
