import type { Book, BookSummary, SearchQuery, SearchResult, LibraryStats, Chapter, MangaSeries } from '../tauri';
import { emit } from '@tauri-apps/api/event';
import {
  INITIAL_BOOKS,
  INITIAL_MANGA_BOOKS,
  INITIAL_MANGA_SERIES,
  INITIAL_TAGS,
  INITIAL_SHELVES,
  INITIAL_PROGRESS,
  generateCoverSvg,
  generateMangaPageSvg,
  getMockEpubChapter,
  getMockEpubToc,
} from './mockData';

const STORAGE_KEY_BOOKS = 'shiori_sim_books';
const STORAGE_KEY_SERIES = 'shiori_sim_series';
const STORAGE_KEY_PROGRESS = 'shiori_sim_progress';
const STORAGE_KEY_FAVORITES = 'shiori_sim_favorites';

class MockBackendStore {
  private books: Book[] = [];
  private mangaSeries: MangaSeries[] = [];
  private readingProgress: Record<number, any> = {};
  private favoriteIds: Set<number> = new Set();
  private annotations: Record<number, any[]> = {};
  private annotationCategories: any[] = [
    { id: 1, name: 'Important', color: '#f59e0b', icon: 'star' },
    { id: 2, name: 'Note', color: '#3b82f6', icon: 'bookmark' },
    { id: 3, name: 'Quote', color: '#10b981', icon: 'quote' },
  ];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const storedBooks = localStorage.getItem(STORAGE_KEY_BOOKS);
      if (storedBooks) {
        this.books = JSON.parse(storedBooks);
      } else {
        this.books = [...INITIAL_BOOKS, ...INITIAL_MANGA_BOOKS];
      }

      const storedSeries = localStorage.getItem(STORAGE_KEY_SERIES);
      if (storedSeries) {
        this.mangaSeries = JSON.parse(storedSeries);
      } else {
        this.mangaSeries = [...INITIAL_MANGA_SERIES];
      }

      const storedProgress = localStorage.getItem(STORAGE_KEY_PROGRESS);
      if (storedProgress) {
        this.readingProgress = JSON.parse(storedProgress);
      } else {
        this.readingProgress = { ...INITIAL_PROGRESS };
      }

      const storedFavs = localStorage.getItem(STORAGE_KEY_FAVORITES);
      if (storedFavs) {
        this.favoriteIds = new Set(JSON.parse(storedFavs));
      } else {
        this.favoriteIds = new Set(this.books.filter(b => b.is_favorite && b.id).map(b => b.id!));
      }
    } catch (e) {
      console.warn('[MockBackend] Failed to load from localStorage, initializing fresh', e);
      this.resetToDefaults();
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY_BOOKS, JSON.stringify(this.books));
      localStorage.setItem(STORAGE_KEY_SERIES, JSON.stringify(this.mangaSeries));
      localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(this.readingProgress));
      localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(Array.from(this.favoriteIds)));
    } catch (e) {
      console.warn('[MockBackend] Failed to save to localStorage', e);
    }
  }

  public resetToDefaults() {
    this.books = [...INITIAL_BOOKS, ...INITIAL_MANGA_BOOKS];
    this.mangaSeries = [...INITIAL_MANGA_SERIES];
    this.readingProgress = { ...INITIAL_PROGRESS };
    this.favoriteIds = new Set(this.books.filter(b => b.is_favorite && b.id).map(b => b.id!));
    this.saveToStorage();
    this.notifyLibraryUpdated();
  }

  public notifyLibraryUpdated() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('shiori-mock-library-updated'));
      // Also emit via mock event listener if registered
      try {
        void emit('library-updated', { kind: 'books-imported', ids: this.books.map(b => b.id!) });
      } catch {
        // Safe fallback
      }
    }
  }

  // ── Public Helper Methods for Simulator UI ──

  public addDummyBook(title?: string, author?: string, rating: number = 5): Book {
    const bookTitle = title || `Chronicles of Shiori Vol. ${Math.floor(Math.random() * 90 + 10)}`;
    const bookAuthor = author || 'H. G. Wells';
    const nextId = Math.max(0, ...this.books.map(b => b.id || 0)) + 1;
    
    const newBook: Book = {
      id: nextId,
      uuid: `mock-book-${nextId}`,
      title: bookTitle,
      authors: [{ id: nextId, name: bookAuthor }],
      tags: [INITIAL_TAGS[0], INITIAL_TAGS[3]],
      file_path: `/mock/books/${bookTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}.epub`,
      file_format: 'epub',
      file_size: 2840000,
      cover_path: generateCoverSvg(bookTitle, bookAuthor, 'book', '#3b82f6'),
      rating,
      language: 'en',
      added_date: new Date().toISOString(),
      reading_status: 'reading',
      is_favorite: true,
      domain: 'books',
      page_count: 384,
      publisher: 'Shiori Press',
      pubdate: '2026',
    };

    this.books.unshift(newBook);
    this.favoriteIds.add(nextId);
    this.saveToStorage();
    this.notifyLibraryUpdated();
    return newBook;
  }

  public addDummyManga(title?: string, author?: string): MangaSeries {
    const seriesTitle = title || `Shadow Blade Vol. ${Math.floor(Math.random() * 50 + 1)}`;
    const seriesAuthor = author || 'Kentaro Studio';
    const nextSeriesId = Math.max(0, ...this.mangaSeries.map(s => s.id || 0)) + 1;
    const nextBookId = Math.max(0, ...this.books.map(b => b.id || 0)) + 1;

    const newSeries: MangaSeries = {
      id: nextSeriesId,
      title: seriesTitle,
      sort_title: seriesTitle,
      cover_path: generateCoverSvg(seriesTitle, seriesAuthor, 'manga', '#8b5cf6'),
      status: 'Ongoing',
      added_date: new Date().toISOString(),
    };

    const newVolume: Book = {
      id: nextBookId,
      uuid: `mock-manga-${nextBookId}`,
      title: `${seriesTitle} - Vol. 1`,
      series: seriesTitle,
      series_index: 1,
      authors: [{ id: nextBookId, name: seriesAuthor }],
      tags: [INITIAL_TAGS[2], INITIAL_TAGS[0]],
      file_path: `/mock/manga/${seriesTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_v01.cbz`,
      file_format: 'cbz',
      file_size: 45000000,
      cover_path: newSeries.cover_path,
      rating: 5,
      added_date: new Date().toISOString(),
      reading_status: 'reading',
      is_favorite: true,
      domain: 'manga_comics',
      page_count: 24,
    };

    this.mangaSeries.unshift(newSeries);
    this.books.unshift(newVolume);
    this.favoriteIds.add(nextBookId);
    this.saveToStorage();
    this.notifyLibraryUpdated();
    return newSeries;
  }

  // ── IPC Command Dispatcher ──

  public async handleInvoke(cmd: string, args: any = {}): Promise<any> {
    // Startup data
    if (cmd === 'get_startup_data') {
      return {
        preferences: {
          theme: 'dark',
          preferredContentType: 'both',
          accentColor: '#3B82F6',
          uiScale: 1.0,
          performanceMode: 'standard',
          metadataMode: 'online',
          autoGroupManga: true,
          book: {
            fontFamily: 'serif',
            fontSize: 16,
            lineHeight: 1.6,
            pageWidth: 800,
            scrollMode: 'paged',
            justification: 'left',
            paragraphSpacing: 1.2,
          },
          manga: {
            mode: 'single',
            direction: 'ltr',
            fitWidth: true,
            backgroundColor: '#000000',
            progressBar: 'bottom',
          },
        },
        bookOverrides: [],
        mangaOverrides: [],
        onboarding: { completed: true },
        readingGoalMinutes: 30,
      };
    }

    // Books & Library
    if (cmd === 'get_book_summaries' || cmd === 'get_all_books') {
      const { limit = 50, offset = 0 } = args;
      return this.books.slice(offset, offset + limit).map(b => this.toSummary(b));
    }

    if (cmd === 'get_book_summaries_by_domain') {
      const { domain } = args;
      const filtered = domain ? this.books.filter(b => b.domain === domain) : this.books;
      return filtered.map(b => this.toSummary(b));
    }

    if (cmd === 'search_books' || cmd === 'search_library') {
      const q: SearchQuery = args.query || {};
      let filtered = [...this.books];

      if (q.domain) {
        filtered = filtered.filter(b => b.domain === q.domain);
      }
      if (q.query) {
        const needle = q.query.toLowerCase();
        filtered = filtered.filter(b =>
          b.title.toLowerCase().includes(needle) ||
          b.authors?.some(a => a.name.toLowerCase().includes(needle))
        );
      }
      if (q.is_favorite) {
        filtered = filtered.filter(b => b.is_favorite || (b.id && this.favoriteIds.has(b.id)));
      }

      const limit = q.limit || 50;
      const offset = q.offset || 0;
      const paged = filtered.slice(offset, offset + limit);

      return {
        books: paged,
        total: filtered.length,
        query: q.query || '',
      };
    }

    if (cmd === 'get_book') {
      const id = Number(args.id);
      const book = this.books.find(b => b.id === id);
      if (book) return book;
      return this.books[0] || null;
    }

    if (cmd === 'get_books_by_paths') {
      const paths: string[] = args.paths || [];
      return this.books.filter(b => paths.includes(b.file_path));
    }

    if (cmd === 'get_books_by_ids') {
      const ids: number[] = args.ids || [];
      const idSet = new Set(ids);
      return this.books.filter(b => b.id && idSet.has(b.id));
    }

    if (cmd === 'get_books_by_reading_status') {
      const status: string = args.status;
      const limit = args.limit || 50;
      const offset = args.offset || 0;
      const filtered = this.books.filter(b => b.reading_status === status);
      return filtered.slice(offset, offset + limit);
    }

    if (cmd === 'get_recommended_books') {
      const limit = args.limit || 20;
      return this.books.slice(0, limit).map(b => this.toSummary(b));
    }

    if (cmd === 'get_reading_history') {
      const limit = args.limit || 50;
      const offset = args.offset || 0;
      const withHistory = this.books
        .filter(b => b.last_opened)
        .sort((a, b) => new Date(b.last_opened!).getTime() - new Date(a.last_opened!).getTime());
      return withHistory.slice(offset, offset + limit);
    }

    if (cmd === 'get_total_books') {
      return this.books.length;
    }

    if (cmd === 'get_library_stats') {
      const totalBooks = this.books.filter(b => b.domain === 'books').length;
      const totalManga = this.books.filter(b => b.domain === 'manga_comics').length;
      const totalSize = this.books.reduce((sum, b) => sum + (b.file_size || 0), 0);
      return {
        total_books: totalBooks,
        total_manga: totalManga,
        total_size_bytes: totalSize,
        total_chapters: 142,
        unread_chapters: 35,
        reading_time_minutes: 480,
        total_series: this.mangaSeries.length,
      };
    }

    if (cmd === 'get_favorite_book_ids') {
      return Array.from(this.favoriteIds);
    }

    if (cmd === 'add_book') {
      const b: Book = args.book;
      const id = b.id || Math.max(0, ...this.books.map(x => x.id || 0)) + 1;
      const created = { ...b, id };
      this.books.unshift(created);
      this.saveToStorage();
      this.notifyLibraryUpdated();
      return id;
    }

    if (cmd === 'update_book') {
      const b: Book = args.book;
      const idx = this.books.findIndex(x => x.id === b.id);
      if (idx !== -1) {
        this.books[idx] = { ...this.books[idx], ...b };
        if (b.is_favorite) {
          this.favoriteIds.add(b.id!);
        } else if (b.id) {
          this.favoriteIds.delete(b.id);
        }
        this.saveToStorage();
        this.notifyLibraryUpdated();
      }
      return null;
    }

    if (cmd === 'delete_book') {
      const id = Number(args.id);
      this.books = this.books.filter(b => b.id !== id);
      this.favoriteIds.delete(id);
      delete this.readingProgress[id];
      this.saveToStorage();
      this.notifyLibraryUpdated();
      return null;
    }

    if (cmd === 'delete_books') {
      const ids: number[] = args.ids || [];
      const idSet = new Set(ids);
      this.books = this.books.filter(b => b.id && !idSet.has(b.id));
      ids.forEach(id => {
        this.favoriteIds.delete(id);
        delete this.readingProgress[id];
      });
      this.saveToStorage();
      this.notifyLibraryUpdated();
      return null;
    }

    // Shelves & Tags
    if (cmd === 'get_shelves' || cmd === 'get_collections') {
      return INITIAL_SHELVES;
    }
    if (cmd === 'get_tags') {
      return INITIAL_TAGS;
    }

    // Reading Progress
    if (cmd === 'get_reading_progress') {
      const id = Number(args.bookId);
      return this.readingProgress[id] || null;
    }

    if (cmd === 'get_reading_progress_batch') {
      const ids: number[] = args.bookIds || [];
      const res: Record<number, any> = {};
      ids.forEach(id => {
        if (this.readingProgress[id]) {
          res[id] = this.readingProgress[id];
        }
      });
      return res;
    }

    if (cmd === 'save_reading_progress') {
      const { bookId, currentLocation, progressPercent, currentPage, totalPages, cfiLocation } = args;
      this.readingProgress[bookId] = {
        bookId,
        currentLocation,
        progressPercent,
        currentPage,
        totalPages,
        cfiLocation,
        lastRead: new Date().toISOString(),
      };
      this.saveToStorage();
      return null;
    }

    // Reader IPC (EPUB & Books)
    if (cmd === 'open_book_renderer' || cmd === 'get_epub_metadata') {
      const id = Number(args.bookId);
      const b = this.books.find(x => x.id === id) || this.books[0];
      return {
        title: b.title,
        author: b.authors?.map(a => a.name).join(', ') || 'Unknown Author',
        total_chapters: 6,
        total_pages: b.page_count || 320,
        format: b.file_format || 'epub',
        cover_path: b.cover_path || null,
      };
    }

    if (cmd === 'close_book_renderer') {
      return null;
    }

    if (cmd === 'get_epub_resource') {
      return new Uint8Array();
    }

    if (cmd === 'get_epub_image_sizes') {
      return [];
    }

    if (cmd === 'get_renderer_cache_stats') {
      return { total_entries: 0, total_bytes: 0 };
    }

    if (cmd === 'clear_renderer_cache') {
      return null;
    }

    if (cmd === 'book_needs_conversion') {
      return false;
    }

    if (cmd === 'open_book_for_reading') {
      const id = Number(args.bookId);
      const b = this.books.find(x => x.id === id);
      return b ? b.file_path : '/mock/books/sample.epub';
    }

    if (cmd === 'get_reader_startup_data') {
      const id = Number(args.bookId);
      const b = this.books.find(x => x.id === id) || this.books[0];
      return {
        book: b,
        progress: this.readingProgress[id] || null,
        annotations: this.annotations[id] || [],
      };
    }

    if (cmd === 'get_annotations') {
      const id = Number(args.bookId);
      return this.annotations[id] || [];
    }

    if (cmd === 'create_annotation') {
      const id = Number(args.bookId);
      if (!this.annotations[id]) {
        this.annotations[id] = [];
      }
      const newAnn = {
        id: Date.now(),
        bookId: id,
        annotationType: args.annotationType,
        location: args.location,
        cfiRange: args.cfiRange,
        selectedText: args.selectedText,
        noteContent: args.noteContent,
        color: args.color || '#f59e0b',
        categoryId: args.categoryId,
        chapterTitle: args.chapterTitle,
        createdAt: new Date().toISOString(),
      };
      this.annotations[id].push(newAnn);
      return newAnn;
    }

    if (cmd === 'update_annotation') {
      const targetId = Number(args.id);
      for (const annList of Object.values(this.annotations)) {
        const found = annList.find(a => a.id === targetId);
        if (found) {
          if (args.noteContent !== undefined) found.noteContent = args.noteContent;
          if (args.color !== undefined) found.color = args.color;
          if (args.categoryId !== undefined) found.categoryId = args.categoryId;
          break;
        }
      }
      return null;
    }

    if (cmd === 'delete_annotation') {
      const targetId = Number(args.id);
      for (const [bId, annList] of Object.entries(this.annotations)) {
        this.annotations[Number(bId)] = annList.filter(a => a.id !== targetId);
      }
      return null;
    }

    if (cmd === 'get_annotation_categories') {
      return this.annotationCategories;
    }

    if (cmd === 'create_annotation_category') {
      const newCat = {
        id: this.annotationCategories.length + 1,
        name: args.name,
        color: args.color,
        icon: args.icon,
      };
      this.annotationCategories.push(newCat);
      return newCat;
    }

    if (cmd === 'update_annotation_category') {
      const cat = this.annotationCategories.find(c => c.id === Number(args.id));
      if (cat) {
        if (args.name) cat.name = args.name;
        if (args.color) cat.color = args.color;
        if (args.icon) cat.icon = args.icon;
      }
      return null;
    }

    if (cmd === 'delete_annotation_category') {
      this.annotationCategories = this.annotationCategories.filter(c => c.id !== Number(args.id));
      return null;
    }

    if (cmd === 'get_all_annotations' || cmd === 'search_annotations_global') {
      return [];
    }

    if (cmd === 'get_book_toc') {
      return getMockEpubToc();
    }

    if (cmd === 'get_book_chapter') {
      const { bookId, chapterIndex } = args;
      return getMockEpubChapter(Number(bookId), Number(chapterIndex));
    }

    if (cmd === 'get_book_chapter_count') {
      return 6;
    }

    if (cmd === 'search_in_book') {
      const { query } = args;
      return [
        {
          chapter_index: 1,
          chapter_title: 'Chapter 1: Stormblessed',
          snippet: `Kaladin crouched against the stone, pulling his threadbare coat tightly... ${query} was everywhere.`,
          location: 'chapter_1:scroll_0.2',
          match_count: 1,
        },
      ];
    }

    // Manga Reader IPC
    if (cmd === 'open_manga') {
      const id = Number(args.bookId);
      const b = this.books.find(x => x.id === id) || this.books[0];
      return {
        title: b.title,
        page_count: 24,
        has_comic_info: true,
        series: b.series || b.title,
        volume: b.series_index || 1,
        writer: b.authors?.[0]?.name || 'Author',
        page_dimensions: Array.from({ length: 24 }, () => [800, 1200]),
      };
    }

    if (cmd === 'get_manga_page' || cmd === 'get_manga_page_path') {
      const { bookId, pageIndex = 0 } = args;
      const b = this.books.find(x => x.id === Number(bookId)) || this.books[0];
      return generateMangaPageSvg(b.title, `Vol. ${b.series_index || 1}`, pageIndex + 1, 24);
    }

    if (cmd === 'get_manga_page_dimensions') {
      return Array.from({ length: 24 }, () => [800, 1200]);
    }

    if (cmd === 'preload_manga_pages') {
      return null;
    }

    // Online Sources & Plugins
    if (cmd === 'list_sources') {
      return [
        { id: 'mangadex', name: 'MangaDex', type: 'manga', enabled: true, is_official: true },
        { id: 'mangafire', name: 'MangaFire', type: 'manga', enabled: true, is_official: false },
        { id: 'gutenberg', name: 'Project Gutenberg', type: 'book', enabled: true, is_official: true },
        { id: 'openlibrary', name: 'Open Library', type: 'book', enabled: true, is_official: true },
      ];
    }

    if (cmd === 'list_sources_by_type') {
      const { contentType } = args;
      if (contentType === 'manga') {
        return [
          { id: 'mangadex', name: 'MangaDex', type: 'manga', enabled: true },
          { id: 'mangafire', name: 'MangaFire', type: 'manga', enabled: true },
        ];
      }
      return [
        { id: 'gutenberg', name: 'Project Gutenberg', type: 'book', enabled: true },
        { id: 'openlibrary', name: 'Open Library', type: 'book', enabled: true },
      ];
    }

    if (cmd === 'plugin_search' || cmd === 'plugin_search_with_meta' || cmd === 'plugin_browse') {
      const sourceId = args.sourceId || 'mangadex';
      const isManga = sourceId.includes('manga');
      const items = [
        {
          id: 'item-1',
          title: isManga ? 'Chainsaw Man' : 'Pride and Prejudice',
          cover_url: generateCoverSvg(isManga ? 'Chainsaw Man' : 'Pride and Prejudice', isManga ? 'Tatsuki Fujimoto' : 'Jane Austen', isManga ? 'manga' : 'book', '#ef4444'),
          description: isManga ? 'Denji has a simple dream—to live a happy and peaceful life, spending time with a girl he likes.' : 'A romantic classic of manners, upbringing, morality, and marriage.',
          source_id: sourceId,
          extra: { rating: '4.9', author: isManga ? 'Tatsuki Fujimoto' : 'Jane Austen', status: 'Ongoing' },
        },
        {
          id: 'item-2',
          title: isManga ? 'Jujutsu Kaisen' : 'Frankenstein',
          cover_url: generateCoverSvg(isManga ? 'Jujutsu Kaisen' : 'Frankenstein', isManga ? 'Gege Akutami' : 'Mary Shelley', isManga ? 'manga' : 'book', '#8b5cf6'),
          description: isManga ? 'A boy swallowed a cursed talisman - the finger of the demon - and became cursed himself.' : 'A gothic thriller exploring the limits of science and humanity.',
          source_id: sourceId,
          extra: { rating: '4.8', author: isManga ? 'Gege Akutami' : 'Mary Shelley', status: 'Ongoing' },
        },
        {
          id: 'item-3',
          title: isManga ? 'Spy x Family' : 'The Great Gatsby',
          cover_url: generateCoverSvg(isManga ? 'Spy x Family' : 'The Great Gatsby', isManga ? 'Tatsuya Endo' : 'F. Scott Fitzgerald', isManga ? 'manga' : 'book', '#10b981'),
          description: isManga ? 'Master spy Twilight is unparalleled when it comes to going undercover on dangerous missions.' : 'A portrait of the Jazz Age and the elusive American Dream.',
          source_id: sourceId,
          extra: { rating: '4.8', author: isManga ? 'Tatsuya Endo' : 'F. Scott Fitzgerald', status: 'Ongoing' },
        },
      ];

      if (cmd === 'plugin_search_with_meta') {
        return { items, total: 3, offset: 0, limit: 20, diagnostics: null };
      }
      return items;
    }

    if (cmd === 'plugin_get_chapters') {
      return Array.from({ length: 15 }, (_, i) => ({
        index: i,
        title: `Chapter ${i + 1}`,
        location: `chap_${i + 1}`,
        content: '',
      }));
    }

    if (cmd === 'source_health' || cmd === 'source_health_all') {
      return cmd === 'source_health_all' ? { mangadex: 'available', mangafire: 'available', gutenberg: 'available' } : 'available';
    }

    // Android SAF stubs
    if (cmd === 'take_opened_urls') return [];
    if (cmd === 'pick_library_root') return '/storage/emulated/0/Books';
    if (cmd === 'migrate_library_to_saf') return { migrated: 5, failed: [] };
    if (cmd === 'set_library_mode') return null;

    // Reading statistics
    if (cmd === 'get_reading_streak') {
      return { current_streak: 7, longest_streak: 21, total_reading_days: 45 };
    }
    if (cmd === 'get_reading_goals') {
      return [{ id: 1, daily_minutes_target: 30, yearly_books_target: 25, is_active: true }];
    }
    if (cmd === 'get_daily_reading_stats') {
      return [];
    }

    // Conversions
    if (cmd === 'list_conversion_jobs') return [];
    if (cmd === 'get_supported_conversions') return [];
    if (cmd === 'convert_file') return '/mock/converted/book.epub';

    // RSS & Extensions
    if (cmd === 'list_rss_feeds') return [];
    if (cmd === 'get_unread_articles') return [];
    if (cmd === 'extension_list' || cmd === 'extension_repo_list' || cmd === 'extension_check_updates') return [];
    if (cmd === 'list_book_shares') return [];
    if (cmd === 'cf_list_sessions') return [];
    if (cmd === 'scan_for_companions') return [];
    if (cmd === 'get_local_ips') return [];

    // Metadata search
    if (cmd === 'search_book_metadata' || cmd === 'search_manga_metadata' || cmd === 'search_manga_sources') return [];
    if (cmd === 'get_books_by_reading_status' || cmd === 'get_recommended_books') return [];
    if (cmd === 'get_manga_chapters') return [];
    if (cmd === 'get_cover_paths_batch') return {};
    if (cmd === 'get_preference_overrides') return [];

    // Misc
    if (cmd === 'plugin:os|platform') return 'android';
    if (cmd === 'get_system_fonts') return ['Roboto', 'Inter', 'Serif', 'Sans-serif', 'Merriweather', 'Literata'];
    if (cmd === 'plugin:dialog|open') return null;
    if (cmd === 'plugin:dialog|save') return null;

    // Graceful unhandled command fallback
    console.debug(`[MockBackend] Unhandled IPC command: "${cmd}"`, args);
    return null;
  }

  private toSummary(b: Book): BookSummary {
    return {
      id: b.id,
      uuid: b.uuid,
      title: b.title,
      sort_title: b.sort_title || b.title,
      file_path: b.file_path,
      file_format: b.file_format,
      file_size: b.file_size,
      cover_path: b.cover_path,
      added_date: b.added_date,
      is_favorite: b.is_favorite || (b.id ? this.favoriteIds.has(b.id) : false),
      reading_status: b.reading_status,
      domain: b.domain,
      series_index: b.series_index,
    };
  }
}

export const mockBackend = new MockBackendStore();
