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
import { HeroBookBanner } from './HeroBookBanner';
import { MangaContentRow } from './MangaContentRow';
import { ModernBookCard } from './ModernBookCard';
import type { CarouselItem } from './ContentCarousel';

interface ActiveCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: CarouselItem[];
}

function launchCacheGet<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(`shiori:${key}`);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}

function launchCacheSet<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`shiori:${key}`, JSON.stringify(data));
  } catch {}
}

const SPOTLIGHT_BANNER_ITEMS: CarouselItem[] = [
  {
    id: 'spotlight-1',
    title: 'The Great Gatsby',
    subtitle: 'F. Scott Fitzgerald',
    coverUrl: 'https://www.gutenberg.org/cache/epub/64317/pg64317.cover.medium.jpg',
  },
  {
    id: 'spotlight-2',
    title: 'Pride and Prejudice',
    subtitle: 'Jane Austen',
    coverUrl: 'https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg',
  },
  {
    id: 'spotlight-3',
    title: 'Frankenstein',
    subtitle: 'Mary Wollstonecraft Shelley',
    coverUrl: 'https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg',
  },
  {
    id: 'spotlight-4',
    title: 'Dracula',
    subtitle: 'Bram Stoker',
    coverUrl: 'https://www.gutenberg.org/cache/epub/345/pg345.cover.medium.jpg',
  },
  {
    id: 'spotlight-5',
    title: 'The Picture of Dorian Gray',
    subtitle: 'Oscar Wilde',
    coverUrl: 'https://www.gutenberg.org/cache/epub/174/pg174.cover.medium.jpg',
  },
];

const DEFAULT_TRENDING_ITEMS: CarouselItem[] = [
  {
    id: 'trending-1',
    title: 'Atomic Habits',
    subtitle: 'James Clear',
    coverUrl: 'https://covers.openlibrary.org/b/id/12843521-L.jpg',
  },
  {
    id: 'trending-2',
    title: 'Dune',
    subtitle: 'Frank Herbert',
    coverUrl: 'https://covers.openlibrary.org/b/id/9140341-L.jpg',
  },
  {
    id: 'trending-3',
    title: 'Project Hail Mary',
    subtitle: 'Andy Weir',
    coverUrl: 'https://covers.openlibrary.org/b/id/10958382-L.jpg',
  },
  {
    id: 'trending-4',
    title: 'The Hobbit',
    subtitle: 'J.R.R. Tolkien',
    coverUrl: 'https://covers.openlibrary.org/b/id/8406786-L.jpg',
  },
  {
    id: 'trending-5',
    title: '1984',
    subtitle: 'George Orwell',
    coverUrl: 'https://covers.openlibrary.org/b/id/14555818-L.jpg',
  },
  {
    id: 'trending-6',
    title: 'The Three-Body Problem',
    subtitle: 'Cixin Liu',
    coverUrl: 'https://covers.openlibrary.org/b/id/8259447-L.jpg',
  },
  {
    id: 'trending-7',
    title: 'Brave New World',
    subtitle: 'Aldous Huxley',
    coverUrl: 'https://covers.openlibrary.org/b/id/14457816-L.jpg',
  },
  {
    id: 'trending-8',
    title: 'To Kill a Mockingbird',
    subtitle: 'Harper Lee',
    coverUrl: 'https://covers.openlibrary.org/b/id/8225261-L.jpg',
  },
  {
    id: 'trending-9',
    title: 'The Midnight Library',
    subtitle: 'Matt Haig',
    coverUrl: 'https://covers.openlibrary.org/b/id/10478065-L.jpg',
  },
  {
    id: 'trending-10',
    title: 'Fahrenheit 451',
    subtitle: 'Ray Bradbury',
    coverUrl: 'https://covers.openlibrary.org/b/id/14457802-L.jpg',
  },
  {
    id: 'trending-11',
    title: 'Sapiens: A Brief History of Humankind',
    subtitle: 'Yuval Noah Harari',
    coverUrl: 'https://covers.openlibrary.org/b/id/8257842-L.jpg',
  },
  {
    id: 'trending-12',
    title: 'Foundation',
    subtitle: 'Isaac Asimov',
    coverUrl: 'https://covers.openlibrary.org/b/id/8235116-L.jpg',
  },
];

const DEFAULT_SCIFI_ITEMS: CarouselItem[] = [
  {
    id: 'scifi-1',
    title: 'Neuromancer',
    subtitle: 'William Gibson',
    coverUrl: 'https://covers.openlibrary.org/b/id/8234342-L.jpg',
  },
  {
    id: 'scifi-2',
    title: 'Snow Crash',
    subtitle: 'Neal Stephenson',
    coverUrl: 'https://covers.openlibrary.org/b/id/8231991-L.jpg',
  },
  {
    id: 'scifi-3',
    title: 'Hyperion',
    subtitle: 'Dan Simmons',
    coverUrl: 'https://covers.openlibrary.org/b/id/8232938-L.jpg',
  },
  {
    id: 'scifi-4',
    title: 'Blindsight',
    subtitle: 'Peter Watts',
    coverUrl: 'https://covers.openlibrary.org/b/id/7222246-L.jpg',
  },
  {
    id: 'scifi-5',
    title: 'Do Androids Dream of Electric Sheep?',
    subtitle: 'Philip K. Dick',
    coverUrl: 'https://covers.openlibrary.org/b/id/8234581-L.jpg',
  },
  {
    id: 'scifi-6',
    title: "Ender's Game",
    subtitle: 'Orson Scott Card',
    coverUrl: 'https://covers.openlibrary.org/b/id/8235224-L.jpg',
  },
  {
    id: 'scifi-7',
    title: 'The Left Hand of Darkness',
    subtitle: 'Ursula K. Le Guin',
    coverUrl: 'https://covers.openlibrary.org/b/id/8234672-L.jpg',
  },
  {
    id: 'scifi-8',
    title: 'Altered Carbon',
    subtitle: 'Richard K. Morgan',
    coverUrl: 'https://covers.openlibrary.org/b/id/8232573-L.jpg',
  },
  {
    id: 'scifi-9',
    title: "Childhood's End",
    subtitle: 'Arthur C. Clarke',
    coverUrl: 'https://covers.openlibrary.org/b/id/8234411-L.jpg',
  },
  {
    id: 'scifi-10',
    title: 'The Stars My Destination',
    subtitle: 'Alfred Bester',
    coverUrl: 'https://covers.openlibrary.org/b/id/8233812-L.jpg',
  },
];

const DEFAULT_CLASSIC_ITEMS: CarouselItem[] = [
  {
    id: 'classic-1',
    title: 'Pride and Prejudice',
    subtitle: 'Jane Austen',
    coverUrl: 'https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg',
  },
  {
    id: 'classic-2',
    title: 'Crime and Punishment',
    subtitle: 'Fyodor Dostoevsky',
    coverUrl: 'https://www.gutenberg.org/cache/epub/2554/pg2554.cover.medium.jpg',
  },
  {
    id: 'classic-3',
    title: 'The Great Gatsby',
    subtitle: 'F. Scott Fitzgerald',
    coverUrl: 'https://www.gutenberg.org/cache/epub/64317/pg64317.cover.medium.jpg',
  },
  {
    id: 'classic-4',
    title: 'Moby Dick',
    subtitle: 'Herman Melville',
    coverUrl: 'https://www.gutenberg.org/cache/epub/2701/pg2701.cover.medium.jpg',
  },
  {
    id: 'classic-5',
    title: 'The Picture of Dorian Gray',
    subtitle: 'Oscar Wilde',
    coverUrl: 'https://www.gutenberg.org/cache/epub/174/pg174.cover.medium.jpg',
  },
  {
    id: 'classic-6',
    title: 'Meditations',
    subtitle: 'Marcus Aurelius',
    coverUrl: 'https://www.gutenberg.org/cache/epub/2680/pg2680.cover.medium.jpg',
  },
  {
    id: 'classic-7',
    title: 'Frankenstein',
    subtitle: 'Mary Wollstonecraft Shelley',
    coverUrl: 'https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg',
  },
  {
    id: 'classic-8',
    title: 'Dracula',
    subtitle: 'Bram Stoker',
    coverUrl: 'https://www.gutenberg.org/cache/epub/345/pg345.cover.medium.jpg',
  },
  {
    id: 'classic-9',
    title: 'A Tale of Two Cities',
    subtitle: 'Charles Dickens',
    coverUrl: 'https://www.gutenberg.org/cache/epub/98/pg98.cover.medium.jpg',
  },
  {
    id: 'classic-10',
    title: 'Jane Eyre',
    subtitle: 'Charlotte Brontë',
    coverUrl: 'https://www.gutenberg.org/cache/epub/1260/pg1260.cover.medium.jpg',
  },
];

const DEFAULT_FANTASY_ITEMS: CarouselItem[] = [
  {
    id: 'fantasy-1',
    title: 'The Name of the Wind',
    subtitle: 'Patrick Rothfuss',
    coverUrl: 'https://covers.openlibrary.org/b/id/8235221-L.jpg',
  },
  {
    id: 'fantasy-2',
    title: 'The Way of Kings',
    subtitle: 'Brandon Sanderson',
    coverUrl: 'https://covers.openlibrary.org/b/id/8235223-L.jpg',
  },
  {
    id: 'fantasy-3',
    title: 'A Game of Thrones',
    subtitle: 'George R.R. Martin',
    coverUrl: 'https://covers.openlibrary.org/b/id/8235225-L.jpg',
  },
  {
    id: 'fantasy-4',
    title: 'The Eye of the World',
    subtitle: 'Robert Jordan',
    coverUrl: 'https://covers.openlibrary.org/b/id/8235227-L.jpg',
  },
  {
    id: 'fantasy-5',
    title: 'The Blade Itself',
    subtitle: 'Joe Abercrombie',
    coverUrl: 'https://covers.openlibrary.org/b/id/8235229-L.jpg',
  },
  {
    id: 'fantasy-6',
    title: 'The Lies of Locke Lamora',
    subtitle: 'Scott Lynch',
    coverUrl: 'https://covers.openlibrary.org/b/id/8235231-L.jpg',
  },
  {
    id: 'fantasy-7',
    title: 'Gardens of the Moon',
    subtitle: 'Steven Erikson',
    coverUrl: 'https://covers.openlibrary.org/b/id/8235233-L.jpg',
  },
  {
    id: 'fantasy-8',
    title: 'The Final Empire',
    subtitle: 'Brandon Sanderson',
    coverUrl: 'https://covers.openlibrary.org/b/id/8235235-L.jpg',
  },
  {
    id: 'fantasy-9',
    title: "Assassin's Apprentice",
    subtitle: 'Robin Hobb',
    coverUrl: 'https://covers.openlibrary.org/b/id/8232880-L.jpg',
  },
  {
    id: 'fantasy-10',
    title: 'The Priory of the Orange Tree',
    subtitle: 'Samantha Shannon',
    coverUrl: 'https://covers.openlibrary.org/b/id/8943210-L.jpg',
  },
];

function toBookCarouselItems(works: any[]): CarouselItem[] {
  if (!Array.isArray(works) || works.length === 0) return [];

  return works.map((book) => {
    if (book.id && book.coverUrl && !book.key) {
      return book as CarouselItem;
    }

    const coverId = book.cover_i || book.cover_id;
    const authorName = Array.isArray(book.author_name)
      ? book.author_name[0]
      : (book.authors && book.authors[0]?.name) || book.author;

    const directCover = book.cover_url || book.coverUrl || (coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
      : book.imageLinks?.thumbnail);

    return {
      id: book.key || book.id || book.title,
      title: book.title,
      subtitle: authorName || (book.first_publish_year ? String(book.first_publish_year) : undefined),
      coverUrl: directCover,
    };
  });
}

export function OnlineBooksDashboard() {
  const [trending, setTrending] = useState<CarouselItem[]>(() => {
    const cached = launchCacheGet<CarouselItem[]>('online-books:trending:v4');
    return cached && cached.length > 0 ? cached : DEFAULT_TRENDING_ITEMS;
  });

  const [scifi, setScifi] = useState<CarouselItem[]>(() => {
    const cached = launchCacheGet<CarouselItem[]>('online-books:scifi:v4');
    return cached && cached.length > 0 ? cached : DEFAULT_SCIFI_ITEMS;
  });

  const [classics, setClassics] = useState<CarouselItem[]>(() => {
    const cached = launchCacheGet<CarouselItem[]>('online-books:classics:v4');
    return cached && cached.length > 0 ? cached : DEFAULT_CLASSIC_ITEMS;
  });

  const [fantasy, setFantasy] = useState<CarouselItem[]>(() => {
    const cached = launchCacheGet<CarouselItem[]>('online-books:fantasy:v4');
    return cached && cached.length > 0 ? cached : DEFAULT_FANTASY_ITEMS;
  });

  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ActiveCategory | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  
  const { success: showSuccessToast, error: showErrorToast } = useToast();

  useEffect(() => {
    let active = true;

    // Progressive background refresh without blocking the UI
    fetchTrendingBooks()
      .then((works) => {
        if (!active || !works || works.length === 0) return;
        const items = toBookCarouselItems(works.slice(0, 36));
        if (items.length > 0) {
          setTrending(items);
          launchCacheSet('online-books:trending:v4', items);
        }
      })
      .catch(() => {});

    fetchSubjectBooks('science_fiction', 36)
      .then((works) => {
        if (!active || !works || works.length === 0) return;
        const items = toBookCarouselItems(works);
        if (items.length > 0) {
          setScifi(items);
          launchCacheSet('online-books:scifi:v4', items);
        }
      })
      .catch(() => {});

    fetchSubjectBooks('classic_literature', 36)
      .then((works) => {
        if (!active || !works || works.length === 0) return;
        const items = toBookCarouselItems(works);
        if (items.length > 0) {
          setClassics(items);
          launchCacheSet('online-books:classics:v4', items);
        }
      })
      .catch(() => {});

    fetchSubjectBooks('fantasy', 36)
      .then((works) => {
        if (!active || !works || works.length === 0) return;
        const items = toBookCarouselItems(works);
        if (items.length > 0) {
          setFantasy(items);
          launchCacheSet('online-books:fantasy:v4', items);
        }
      })
      .catch(() => {});

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

  const trendingItems = trending;
  const scifiItems = scifi;
  const classicsItems = classics;
  const fantasyItems = fantasy;

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
    <div className="flex-1 overflow-y-auto px-3 sm:px-6 md:px-8 pt-4 sm:pt-6 pb-28 md:pb-24 scroll-smooth">
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
              <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-6">
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
            <HeroBookBanner
              items={SPOTLIGHT_BANNER_ITEMS}
              loading={false}
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
