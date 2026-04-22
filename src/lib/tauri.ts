import { invoke } from "@tauri-apps/api/core"
import { open, save } from "@tauri-apps/plugin-dialog"
import type { UserPreferences, PreferenceOverride, OnboardingState, WatchFolder } from "../types/preferences"
import { logger } from '@/lib/logger'

// Check if we're running in Tauri environment
export const isTauri = (() => {
  if (typeof window === 'undefined') return false
  // Check for __TAURI__ or __TAURI_INTERNALS__ (Tauri v2)
  const hasTauri = '__TAURI__' in window || '__TAURI_INTERNALS__' in window
  logger.debug('[Tauri Detection]', hasTauri ? 'Running in Tauri mode' : 'Running in browser mode')
  return hasTauri
})()

export interface Book {
  id?: number
  uuid: string
  title: string
  sort_title?: string
  isbn?: string
  isbn13?: string
  publisher?: string
  pubdate?: string
  series?: string
  series_index?: number
  rating?: number
  file_path: string
  file_format: string
  file_size?: number
  file_hash?: string
  cover_path?: string
  page_count?: number
  word_count?: number
  language: string
  added_date: string
  modified_date: string
  last_opened?: string
  notes?: string
  online_metadata_fetched?: boolean
  metadata_source?: string
  metadata_last_sync?: string
  anilist_id?: string
  is_favorite?: boolean
  reading_status?: string
  domain?: string
  metadata_locked?: Record<string, boolean>
  authors: Author[]
  tags: Tag[]
}

export interface Author {
  id?: number
  name: string
  sort_name?: string
  link?: string
}

export interface Tag {
  id?: number
  name: string
  color?: string
}

export interface MangaSeries {
  id?: number
  title: string
  sort_title?: string
  cover_path?: string
  status?: string
  added_date: string
}

export interface MangaVolume {
  id?: number
  manga_series_id: number
  book_id: number
  volume_number?: number
}

export interface SearchQuery {
  query?: string
  authors?: string[]
  tags?: string[]
  formats?: string[]
  series?: string
  min_rating?: number
  limit?: number
  offset?: number
}

export interface SearchResult {
  books: Book[]
  total: number
  query: string
}

export interface ImportResult {
  success: string[]
  failed: [string, string][]
  duplicates: string[]
}

export interface ReadingProgress {
  id?: number
  bookId: number
  currentLocation: string
  progressPercent: number
  currentPage?: number
  totalPages?: number
  cfiLocation?: string
  lastRead: string
}

export interface Annotation {
  id?: number
  bookId: number
  annotationType: 'highlight' | 'note' | 'bookmark'
  location: string
  cfiRange?: string
  selectedText?: string
  noteContent?: string
  color: string
  createdAt: string
  updatedAt: string
  categoryId?: number
  chapterTitle?: string
}

export interface AnnotationCategory {
  id?: number;
  name: string;
  color: string;
  icon?: string;
  sortOrder: number;
  createdAt: string;
}

export interface AnnotationExportOptions {
  format: string;              // "markdown", "json", "text"
  book_id?: number;            // undefined = all books
  annotation_types?: string[]; // filter by type
  category_ids?: number[];     // filter by category
  include_book_info: boolean;
}

export interface AnnotationExportData {
  content: string;
  format: string;
  annotation_count: number;
}

export interface AnnotationSearchResult {
  annotation: Annotation;
  book_title: string;
  book_author: string;
}

export interface ReaderSettings {
  id?: number
  userId: string
  fontFamily: string
  fontSize: number
  lineHeight: number
  theme: string
  pageMode: 'paginated' | 'scrolled'
  marginSize: number
  updatedAt: string
}

export interface Collection {
  id?: number
  name: string
  description?: string
  parentId?: number
  isSmart: boolean
  smartRules?: string
  icon?: string
  color?: string
  collectionType: string  // "regular" | "shelf" | "favorites"
  sortOrder: number
  createdAt: string
  updatedAt: string
  bookCount?: number
  children: Collection[]
}

export interface SmartRule {
  field: string
  operator: string
  value: string
  matchType: string
}

export interface ExportOptions {
  format: string  // "csv", "json", "markdown"
  include_metadata: boolean
  include_collections: boolean
  include_reading_progress: boolean
  file_path: string
}

// Phase 2 Rendering System Types
export interface BookMetadata {
  title: string
  author: string | null
  total_chapters: number
  total_pages: number | null
  format: string
}

export interface TocEntry {
  label: string
  location: string
  level: number
  children: TocEntry[]
}

export interface Chapter {
  index: number
  title: string
  content: string
  location: string
}

export interface BookSearchResult {
  chapter_index: number
  chapter_title: string
  snippet: string
  location: string
  match_count: number
}

export interface CacheStats {
  total_size_bytes: number
  item_count: number
  hit_count: number
  miss_count: number
  hit_rate: number
}

export interface MangaMetadata {
  title: string
  page_count: number
  has_comic_info: boolean
  series: string | null
  volume: number | null
  writer: string | null
  page_dimensions: [number, number][]
}

export interface Doodle {
  id?: number
  book_id: number
  page_number: string
  strokes_json: string
  created_at: string
  updated_at: string
}

// Phase 3: Reading Statistics Types
export interface ReadingSession {
  id: string
  book_id: number
  started_at: string
  ended_at: string | null
  duration_seconds: number
  pages_start: number | null
  pages_end: number | null
  created_at: string
}

export interface DailyReadingStats {
  date: string
  total_seconds: number
  books_count: number
  sessions_count: number
}

export interface ReadingGoal {
  id?: number
  daily_minutes_target: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ReadingStreak {
  current_streak: number
  longest_streak: number
  total_reading_days: number
}

export interface BookReadingStats {
  book_id: number
  total_seconds: number
  sessions_count: number
  last_read: string | null
  average_session_minutes: number
}

export interface BackupInfo {
  version: string
  created_at: string
  app_version: string
  book_count: number
  annotation_count: number
  collection_count: number
  includes_books: boolean
  total_size_bytes: number
}

export interface RestoreInfo {
  books_restored: number
  annotations_restored: number
  collections_restored: number
  covers_restored: number
  settings_restored: boolean
  frontend_settings: string | null
}

export interface DictionaryMeaning {
  part_of_speech: string
  definitions: DictionaryDefinition[]
}

export interface DictionaryDefinition {
  definition: string
  example: string | null
  synonyms: string[]
  antonyms: string[]
}

export interface DictionaryResponse {
  word: string
  phonetic: string | null
  audio_url: string | null
  meanings: DictionaryMeaning[]
  source_url: string | null
}

export interface TranslationResponse {
  translated_text: string
  source_language: string
  target_language: string
  provider: string
}

export interface AnnaArchiveConfig {
  baseUrl?: string | null
  authKey?: string | null
  membershipKey?: string | null
  authCookie?: string | null
  apiKey: string | null
}

export interface RutrackerConfig {
  baseUrl: string | null
  cookie: string | null
}

export interface TorrentNetworkConfig {
  proxyUrl: string | null
  timeoutSeconds: number
  maxRetries: number
}

export interface VerifyTorboxKeyResult {
  valid: boolean
  message: string
}

export interface SendToTorboxResult {
  importedPath: string
  filename?: string | null
  importResult: ImportResult
}

export interface AddToTorboxQueueResult {
  torrentId: number
}

export interface DebridResolveResult {
  provider: string
  selectedLink: string
  importedPath: string
}

// Mock data for development (when not in Tauri)
const mockBooks: Book[] = [
  {
    uuid: "mock-1",
    title: "The Great Gatsby",
    authors: [{ name: "F. Scott Fitzgerald" }],
    tags: [{ name: "Classic" }, { name: "Fiction" }],
    file_path: "/mock/gatsby.epub",
    file_format: "epub",
    file_size: 245000,
    language: "en",
    rating: 4.5,
    added_date: new Date().toISOString(),
    modified_date: new Date().toISOString(),
    publisher: "Scribner",
    pubdate: "1925",
  },
  {
    uuid: "mock-2",
    title: "1984",
    authors: [{ name: "George Orwell" }],
    tags: [{ name: "Dystopian" }, { name: "Classic" }],
    file_path: "/mock/1984.epub",
    file_format: "epub",
    file_size: 328000,
    language: "en",
    rating: 5,
    added_date: new Date().toISOString(),
    modified_date: new Date().toISOString(),
    publisher: "Secker & Warburg",
    pubdate: "1949",
  },
]

export const api = {
  // Library operations
  async getBooks(limit: number = 50, offset: number = 0): Promise<Book[]> {
    if (!isTauri) {
      logger.warn("Running in browser mode - using mock data")
      return Promise.resolve(mockBooks)
    }
    try {
      logger.debug('[API] Calling get_books command')
      const books = await invoke<Book[]>("get_books", { limit, offset })
      logger.debug('[API] Got books:', books.length)
      return books
    } catch (error) {
      logger.error('[API] Failed to get books:', error)
      throw error
    }
  },

  async getTotalBooks(): Promise<number> {
    if (!isTauri) {
      return Promise.resolve(mockBooks.length)
    }
    return invoke("get_total_books")
  },

  async getBook(id: number): Promise<Book> {
    if (!isTauri) {
      const book = mockBooks[0]
      return Promise.resolve({ ...book, id })
    }
    return invoke("get_book", { id })
  },

  async addBook(book: Book): Promise<number> {
    return invoke("add_book", { book })
  },

  async updateBook(book: Book): Promise<void> {
    return invoke("update_book", { book })
  },

  async deleteBook(id: number): Promise<void> {
    return invoke("delete_book", { id })
  },

  async findDuplicateBooks(criteria: string, threshold?: number): Promise<Book[][]> {
    return invoke("find_duplicate_books", { criteria, threshold })
  },

  async deleteBooks(ids: number[]): Promise<void> {
    return invoke("delete_books", { ids })
  },

  async importBooks(paths: string[]): Promise<ImportResult> {
    logger.debug('[API] importBooks called with:', paths)
    try {
      const result = await invoke<ImportResult>("import_books", { paths })
      logger.debug('[API] importBooks result:', result)
      return result
    } catch (error) {
      logger.error('[API] importBooks error:', error)
      throw error
    }
  },

  async enrichBookMetadata(bookId: number): Promise<boolean> {
    return invoke("enrich_book_metadata", { bookId })
  },

  // Search
  async searchBooks(query: SearchQuery): Promise<SearchResult> {
    return invoke("search_books", { query })
  },

  // Tags
  async getTags(): Promise<Tag[]> {
    return invoke("get_tags")
  },

  async createTag(name: string, color?: string): Promise<number> {
    return invoke("create_tag", { name, color })
  },

  async addTagToBook(bookId: number, tagId: number): Promise<void> {
    return invoke("add_tag_to_book", { bookId, tagId })
  },

  async removeTagFromBook(bookId: number, tagId: number): Promise<void> {
    return invoke("remove_tag_from_book", { bookId, tagId })
  },

  // Reader - Reading Progress
  async getReadingProgress(bookId: number): Promise<ReadingProgress | null> {
    return invoke("get_reading_progress", { bookId })
  },

  async saveReadingProgress(
    bookId: number,
    currentLocation: string,
    progressPercent: number,
    currentPage?: number,
    totalPages?: number,
    cfiLocation?: string
  ): Promise<ReadingProgress> {
    return invoke("save_reading_progress", {
      bookId,
      currentLocation,
      progressPercent,
      currentPage,
      totalPages,
      cfiLocation,
    })
  },

  // Reader - Annotations
  async getAnnotations(bookId: number): Promise<Annotation[]> {
    return invoke("get_annotations", { bookId })
  },

  async createAnnotation(
    bookId: number,
    annotationType: string,
    location: string,
    cfiRange?: string,
    selectedText?: string,
    noteContent?: string,
    color?: string,
    categoryId?: number,
    chapterTitle?: string
  ): Promise<Annotation> {
    return invoke("create_annotation", {
      bookId,
      annotationType,
      location,
      cfiRange,
      selectedText,
      noteContent,
      color: color || "#fbbf24",
      categoryId,
      chapterTitle,
    })
  },

  async updateAnnotation(
    id: number,
    noteContent?: string,
    color?: string,
    categoryId?: number
  ): Promise<void> {
    return invoke("update_annotation", { id, noteContent, color, categoryId })
  },

  async deleteAnnotation(id: number): Promise<void> {
    return invoke("delete_annotation", { id })
  },

  // Annotation Categories
  async getAnnotationCategories(): Promise<AnnotationCategory[]> {
    return invoke("get_annotation_categories")
  },

  async createAnnotationCategory(name: string, color: string, icon?: string): Promise<AnnotationCategory> {
    return invoke("create_annotation_category", { name, color, icon })
  },

  async updateAnnotationCategory(id: number, name?: string, color?: string, icon?: string): Promise<void> {
    return invoke("update_annotation_category", { id, name, color, icon })
  },

  async deleteAnnotationCategory(id: number): Promise<void> {
    return invoke("delete_annotation_category", { id })
  },

  // Global Annotation Search
  async searchAnnotationsGlobal(
    query: string,
    bookId?: number,
    annotationType?: string,
    categoryId?: number,
    limit?: number,
    offset?: number
  ): Promise<AnnotationSearchResult[]> {
    return invoke("search_annotations_global", { query, bookId, annotationType, categoryId, limit: limit || 50, offset: offset || 0 })
  },

  async getAllAnnotations(
    bookId?: number,
    annotationType?: string,
    categoryId?: number,
    limit?: number,
    offset?: number
  ): Promise<AnnotationSearchResult[]> {
    return invoke("get_all_annotations", { bookId, annotationType, categoryId, limit: limit || 50, offset: offset || 0 })
  },

  // Annotation Export
  async exportAnnotations(options: AnnotationExportOptions): Promise<AnnotationExportData> {
    return invoke("export_annotations", { options })
  },

  async writeTextToFile(filePath: string, contents: string): Promise<void> {
    return invoke("write_text_to_file", { filePath, contents })
  },

  // Reader - Settings
  async getReaderSettings(userId: string): Promise<ReaderSettings> {
    return invoke("get_reader_settings", { userId })
  },

  async saveReaderSettings(
    userId: string,
    fontFamily: string,
    fontSize: number,
    lineHeight: number,
    theme: string,
    pageMode: string,
    marginSize: number
  ): Promise<ReaderSettings> {
    return invoke("save_reader_settings", {
      user_id: userId,
      font_family: fontFamily,
      font_size: fontSize,
      line_height: lineHeight,
      theme,
      page_mode: pageMode,
      margin_size: marginSize,
    })
  },

  // Reader - Book File Access
  async getBookFilePath(bookId: number): Promise<string> {
    return invoke("get_book_file_path", { bookId })
  },

  // Reader - Format Detection
  async detectBookFormat(path: string): Promise<string> {
    return invoke("detect_book_format", { path })
  },

  async validateBookFile(path: string, format: string): Promise<boolean> {
    return invoke("validate_book_file", { path, format })
  },

  // Collections
  async getCollections(): Promise<Collection[]> {
    return invoke("get_collections")
  },

  async getCollection(id: number): Promise<Collection> {
    return invoke("get_collection", { id })
  },

  async createCollection(data: {
    name: string;
    description?: string | null;
    parent_id?: number | null;
    is_smart?: boolean;
    smart_rules?: string | null;
    icon?: string | null;
    color?: string | null;
    collection_type?: string | null;
  }): Promise<Collection> {
    return invoke("create_collection", {
      name: data.name,
      description: data.description,
      parentId: data.parent_id,
      isSmart: data.is_smart || false,
      smartRules: data.smart_rules,
      icon: data.icon,
      color: data.color,
      collectionType: data.collection_type || 'regular',
    })
  },

  async updateCollection(
    id: number,
    data: {
      name: string;
      description?: string | null;
      parent_id?: number | null;
      is_smart?: boolean;
      smart_rules?: string | null;
      icon?: string | null;
      color?: string | null;
    }
  ): Promise<Collection> {
    return invoke("update_collection", {
      id,
      name: data.name,
      description: data.description,
      parentId: data.parent_id,
      smartRules: data.smart_rules,
      icon: data.icon,
      color: data.color,
    })
  },

  async deleteCollection(id: number): Promise<void> {
    return invoke("delete_collection", { id })
  },

  async addBookToCollection(collectionId: number, bookId: number): Promise<void> {
    return invoke("add_book_to_collection", { collectionId, bookId })
  },

  async removeBookFromCollection(collectionId: number, bookId: number): Promise<void> {
    return invoke("remove_book_from_collection", { collectionId, bookId })
  },

  async addBooksToCollection(collectionId: number, bookIds: number[]): Promise<void> {
    return invoke("add_books_to_collection", { collectionId, bookIds })
  },

  async getCollectionBooks(collectionId: number): Promise<Book[]> {
    return invoke("get_collection_books", { collectionId })
  },

  async getNestedCollections(): Promise<Collection[]> {
    return invoke("get_nested_collections")
  },

  async toggleBookFavorite(bookId: number): Promise<boolean> {
    return invoke("toggle_book_favorite", { bookId })
  },

  async getFavoriteBookIds(): Promise<number[]> {
    return invoke("get_favorite_book_ids")
  },

  async getCollectionsByType(collectionType: string): Promise<Collection[]> {
    return invoke("get_collections_by_type", { collectionType })
  },

  async previewSmartCollection(smartRules: string): Promise<number> {
    return invoke("preview_smart_collection", { smartRules })
  },

  // Import/Export
  async scanFolderForBooks(folderPath: string): Promise<ImportResult> {
    return invoke("scan_folder_for_books", { folderPath })
  },

  // Domain-separated import
  async importManga(paths: string[]): Promise<ImportResult> {
    logger.debug('[API] importManga called with:', paths)
    try {
      const result = await invoke<ImportResult>("import_manga", { paths })
      logger.debug('[API] importManga result:', result)
      return result
    } catch (error) {
      logger.error('[API] importManga error:', error)
      throw error
    }
  },

  async scanFolderForManga(folderPath: string): Promise<ImportResult> {
    return invoke("scan_folder_for_manga", { folderPath })
  },

  async importComics(paths: string[]): Promise<ImportResult> {
    logger.debug('[API] importComics called with:', paths)
    try {
      const result = await invoke<ImportResult>("import_comics", { paths })
      logger.debug('[API] importComics result:', result)
      return result
    } catch (error) {
      logger.error('[API] importComics error:', error)
      throw error
    }
  },

  async scanFolderForComics(folderPath: string): Promise<ImportResult> {
    return invoke("scan_folder_for_comics", { folderPath })
  },

  async getBooksByDomain(domain: 'books' | 'manga_comics', limit: number = 50, offset: number = 0): Promise<Book[]> {
    return invoke("get_books_by_domain", { domain, limit, offset })
  },

  async getTotalBooksByDomain(domain: 'books' | 'manga_comics'): Promise<number> {
    if (!isTauri) {
      return Promise.resolve(mockBooks.length) // Mock return
    }
    return invoke("get_total_books_by_domain", { domain })
  },

  async updateReadingStatus(bookId: number, status: string): Promise<void> {
    return invoke("update_reading_status", { bookId, status })
  },

  async getBooksByReadingStatus(status: string, limit: number = 50, offset: number = 0): Promise<Book[]> {
    return invoke("get_books_by_reading_status", { status, limit, offset })
  },

  async resetDatabase(): Promise<void> {
    return invoke("reset_database")
  },

  async exportLibrary(options: ExportOptions): Promise<string> {
    return invoke("export_library", { options })
  },

  // File dialogs
  async openFileDialog(): Promise<string[] | null> {
    if (!isTauri) {
      logger.warn("File dialogs only work in Tauri environment. Please run: npm run tauri dev")
      return Promise.resolve(null)
    }
    try {
      logger.debug('[API] Opening file dialog')
      const result = await open({
        multiple: true,
        filters: [
          {
            name: "eBooks",
            extensions: ["epub", "pdf", "mobi", "azw", "azw3", "txt", "cbz", "cbr", "fb2", "docx", "html", "htm", "md"],
          },
        ],
      }) as string[] | null
      logger.debug('[API] File dialog result:', result)
      return result
    } catch (error) {
      logger.error('[API] File dialog error:', error)
      throw error
    }
  },

  async openFolderDialog(): Promise<string | null> {
    if (!isTauri) {
      logger.warn("File dialogs only work in Tauri environment. Please run: npm run tauri dev")
      return Promise.resolve(null)
    }
    return open({
      directory: true,
    }) as Promise<string | null>
  },

  async saveFileDialog(defaultPath?: string): Promise<string | null> {
    if (!isTauri) {
      logger.warn("File dialogs only work in Tauri environment. Please run: npm run tauri dev")
      return Promise.resolve(null)
    }
    return save({
      defaultPath,
    }) as Promise<string | null>
  },

  // Phase 2 Rendering System
  async openBookRenderer(bookId: number, path: string, format: string): Promise<BookMetadata> {
    return invoke("open_book_renderer", { bookId, path, format })
  },

  async closeBookRenderer(bookId: number): Promise<void> {
    return invoke("close_book_renderer", { bookId })
  },

  async getBookToc(bookId: number): Promise<TocEntry[]> {
    return invoke("get_book_toc", { bookId })
  },

  async getBookChapter(bookId: number, chapterIndex: number): Promise<Chapter> {
    return invoke("get_book_chapter", { bookId, chapterIndex })
  },

  async getBookChapterCount(bookId: number): Promise<number> {
    return invoke("get_book_chapter_count", { bookId })
  },

  async searchInBook(bookId: number, query: string): Promise<BookSearchResult[]> {
    return invoke("search_in_book", { bookId, query })
  },

  async getRendererCacheStats(): Promise<CacheStats> {
    return invoke("get_renderer_cache_stats")
  },

  async clearRendererCache(): Promise<void> {
    return invoke("clear_renderer_cache")
  },

  async getEpubResource(bookId: number, resourcePath: string): Promise<Uint8Array> {
    return invoke("get_epub_resource", { bookId, resourcePath })
  },

  async renderPdfPage(bookId: number, pageIndex: number, scale: number = 1.0): Promise<number[]> {
    return invoke("render_pdf_page", { bookId, pageIndex, scale })
  },

  async getPdfPageDimensions(bookId: number, pageIndex: number): Promise<[number, number]> {
    return invoke("get_pdf_page_dimensions", { bookId, pageIndex })
  },

  // Manga Reader System
  async openManga(bookId: number, path: string): Promise<MangaMetadata> {
    return invoke("open_manga", { bookId, path })
  },

  async getMangaPage(bookId: number, pageIndex: number, maxDimension: number = 1600): Promise<number[]> {
    return invoke("get_manga_page", { bookId, pageIndex, maxDimension })
  },

  async preloadMangaPages(bookId: number, pageIndices: number[], maxDimension: number = 1600): Promise<void> {
    return invoke("preload_manga_pages", { bookId, pageIndices, maxDimension })
  },

  async getMangaPageDimensions(bookId: number, pageIndices: number[]): Promise<[number, number][]> {
    return invoke("get_manga_page_dimensions", { bookId, pageIndices })
  },

  async closeManga(bookId: number): Promise<void> {
    return invoke("close_manga", { bookId })
  },

  // Preferences System (v2.0)
  async getUserPreferences(): Promise<UserPreferences> {
    return invoke("get_user_preferences")
  },

  async getThemeSync(): Promise<string> {
    return invoke("get_theme_sync")
  },

  async updateUserPreferences(updates: Partial<UserPreferences>): Promise<void> {
    return invoke("update_user_preferences", { updates })
  },

  async getBookPreferenceOverrides(): Promise<PreferenceOverride[]> {
    return invoke("get_book_preference_overrides")
  },

  async setBookPreferenceOverride(bookId: number, overrides: Record<string, unknown>): Promise<void> {
    return invoke("set_book_preference_override", { bookId, overrides })
  },

  async clearBookPreferenceOverride(bookId: number): Promise<void> {
    return invoke("clear_book_preference_override", { bookId })
  },

  async getMangaPreferenceOverrides(): Promise<PreferenceOverride[]> {
    return invoke("get_manga_preference_overrides")
  },

  async setMangaPreferenceOverride(bookId: number, overrides: Record<string, unknown>): Promise<void> {
    return invoke("set_manga_preference_override", { bookId, overrides })
  },

  async clearMangaPreferenceOverride(bookId: number): Promise<void> {
    return invoke("clear_manga_preference_override", { bookId })
  },

  async getOnboardingState(): Promise<OnboardingState> {
    return invoke("get_onboarding_state")
  },

  async completeOnboarding(skippedSteps: string[]): Promise<void> {
    return invoke("complete_onboarding", { skippedSteps })
  },

  async resetOnboarding(): Promise<void> {
    return invoke("reset_onboarding")
  },

  // Doodle System
  async saveDoodle(bookId: number, pageNumber: string, strokesJson: string): Promise<Doodle> {
    return invoke("save_doodle", { bookId, pageNumber, strokesJson })
  },

  async getDoodle(bookId: number, pageNumber: string): Promise<Doodle | null> {
    return invoke("get_doodle", { bookId, pageNumber })
  },

  async deleteDoodle(bookId: number, pageNumber: string): Promise<void> {
    return invoke("delete_doodle", { bookId, pageNumber })
  },

  async deleteBookDoodles(bookId: number): Promise<number> {
    return invoke("delete_book_doodles", { bookId })
  },

  // Reading Sessions & Statistics
  async startReadingSession(bookId: number, pagesStart?: number): Promise<ReadingSession> {
    return invoke("start_reading_session", { bookId, pagesStart })
  },

  async endReadingSession(sessionId: string, pagesEnd?: number): Promise<void> {
    return invoke("end_reading_session", { sessionId, pagesEnd })
  },

  async heartbeatReadingSession(sessionId: string, durationSeconds: number): Promise<void> {
    return invoke("heartbeat_reading_session", { sessionId, durationSeconds })
  },

  async getDailyReadingStats(days?: number): Promise<DailyReadingStats[]> {
    return invoke("get_daily_reading_stats", { days })
  },

  async getBookReadingStats(bookId: number): Promise<BookReadingStats> {
    return invoke("get_book_reading_stats", { bookId })
  },

  async getReadingStreak(): Promise<ReadingStreak> {
    return invoke("get_reading_streak")
  },

  async getReadingGoal(): Promise<ReadingGoal> {
    return invoke("get_reading_goal")
  },

  async updateReadingGoal(dailyMinutesTarget: number): Promise<ReadingGoal> {
    return invoke("update_reading_goal", { dailyMinutesTarget })
  },

  async getTodayReadingTime(): Promise<number> {
    return invoke("get_today_reading_time")
  },

  // Backup & Restore
  async createBackup(backupPath: string, options: { include_books: boolean; frontend_settings?: string }): Promise<BackupInfo> {
    return invoke("create_backup", { backupPath, options })
  },

  async restoreBackup(backupPath: string): Promise<RestoreInfo> {
    return invoke("restore_backup", { backupPath })
  },

  async getBackupInfo(backupPath: string): Promise<BackupInfo> {
    return invoke("get_backup_info", { backupPath })
  },

  async dictionaryLookup(word: string, lang?: string): Promise<DictionaryResponse> {
    return invoke("dictionary_lookup", { word, lang })
  },

  async translateText(text: string, targetLang: string, sourceLang?: string): Promise<TranslationResponse> {
    return invoke("translate_text", { text, sourceLang, targetLang })
  },

  async getMangaSeriesList(limit?: number, offset?: number): Promise<MangaSeries[]> {
    return invoke("get_manga_series_list", { limit, offset })
  },

  async getSeriesVolumes(seriesId: number): Promise<MangaVolume[]> {
    return invoke("get_series_volumes", { seriesId })
  },

  async autoGroupMangaVolumes(): Promise<number> {
    return invoke("auto_group_manga_volumes")
  },

  async createMangaSeries(title: string): Promise<number> {
    return invoke("create_manga_series", { title })
  },

  async updateMangaSeries(seriesId: number, updates: Partial<MangaSeries>): Promise<void> {
    return invoke("update_manga_series", { seriesId, updates })
  },

  async assignBookToSeries(bookId: number, seriesTitle: string, chapterNumber?: number): Promise<void> {
    return invoke("assign_book_to_series", { bookId, seriesTitle, chapterNumber })
  },

  async removeBookFromSeries(bookId: number): Promise<void> {
    return invoke("remove_book_from_series", { bookId })
  },

  async deleteMangaSeries(seriesId: number): Promise<void> {
    return invoke("delete_manga_series", { seriesId })
  },

  async mergeMangaSeries(sourceIds: number[], targetId: number): Promise<void> {
    return invoke("merge_manga_series", { sourceIds, targetId })
  },

  async startFolderWatch(): Promise<void> {
    return invoke("start_folder_watch")
  },

  async stopFolderWatch(): Promise<void> {
    return invoke("stop_folder_watch")
  },

  async addWatchFolder(path: string, enabled: boolean): Promise<void> {
    return invoke("add_watch_folder", { path, enabled })
  },

  async removeWatchFolder(path: string): Promise<void> {
    return invoke("remove_watch_folder", { path })
  },

  async getWatchFolders(): Promise<WatchFolder[]> {
    return invoke("get_watch_folders")
  },

  async getWatchStatus(): Promise<{ is_running: boolean; watched_folders_count: number; enabled_folders_count: number }> {
    return invoke("get_watch_status")
  },

  // Torbox Integration
  async torboxSetApiKey(apiKey: string | null): Promise<void> {
    return invoke("torbox_set_api_key", { apiKey })
  },

  async torboxGetApiKey(): Promise<string | null> {
    return invoke("torbox_get_api_key")
  },

  async torboxAddMagnet(magnet: string): Promise<number> {
    return invoke("torbox_add_magnet", { magnet })
  },

  async torboxGetStatus(torrentId: number): Promise<{ name: string; progress: number; download_state: string; files: { id: number; name: string }[] | null }> {
    return invoke("torbox_get_status", { torrentId })
  },

  async torboxGetDownloadLink(torrentId: number, fileId?: number): Promise<string> {
    return invoke("torbox_get_download_link", { torrentId, fileId })
  },

  async torboxDownloadAndImport(magnet: string, filenameHint?: string): Promise<string> {
    return invoke("torbox_download_and_import", { magnet, filenameHint })
  },

  async verifyTorboxKey(apiKey: string): Promise<VerifyTorboxKeyResult> {
    return invoke<VerifyTorboxKeyResult>("verify_torbox_key", { apiKey })
  },

  async sendToTorbox(magnetLink: string, filenameHint?: string): Promise<SendToTorboxResult> {
    return invoke<SendToTorboxResult>("send_to_torbox", { magnetLink, filenameHint })
  },

  async getTorboxInstant(torrentId: number): Promise<{ id: number; name: string; size: number; progress: number; downloadSpeed: number; status: string; files: { id: number; name: string; size: number }[] | null }> {
    return invoke("get_torbox_instant", { torrentId })
  },

  async addToTorboxQueue(magnetLink: string): Promise<AddToTorboxQueueResult> {
    return invoke<AddToTorboxQueueResult>("add_to_torbox_queue", { magnetLink })
  },

  async saveTorboxKey(apiKey: string): Promise<void> {
    return invoke("save_torbox_key", { apiKey })
  },

  async getTorboxKey(): Promise<string | null> {
    return invoke("get_torbox_key")
  },

  async importFromTorbox(magnetLink: string, filenameHint?: string): Promise<string> {
    return invoke("import_from_torbox", { magnetLink, filenameHint })
  },

  async resolveTorboxDownload(torrentId: number, fileId?: number): Promise<string> {
    return invoke("resolve_torbox_download", { torrentId, fileId })
  },

  async waitForTorboxCompletion(torrentId: number, maxWaitSeconds?: number): Promise<{ id: number; name: string; size: number; progress: number; downloadSpeed: number; status: string; files: { id: number; name: string; size: number }[] | null }> {
    return invoke("wait_for_torbox_completion", { torrentId, maxWaitSeconds })
  },

  async importExistingTorboxTarget(torrentId: number, fileId?: number, filenameHint?: string): Promise<string> {
    return invoke("import_existing_torbox_target", { torrentId, fileId, filenameHint })
  },

  async annasArchiveDownload(contentId: string, titleHint?: string): Promise<string> {
    return invoke("annas_archive_download", { contentId, titleHint })
  },

  async annaArchiveGetConfig(): Promise<AnnaArchiveConfig> {
    return invoke("anna_archive_get_config")
  },

  async annaArchiveSetConfig(config: AnnaArchiveConfig): Promise<void> {
    return invoke("anna_archive_set_config", { config })
  },

  async rutrackerGetConfig(): Promise<RutrackerConfig> {
    return invoke("rutracker_get_config")
  },

  async rutrackerSetConfig(config: RutrackerConfig): Promise<void> {
    return invoke("rutracker_set_config", { config })
  },

  async torrentNetworkGetConfig(): Promise<TorrentNetworkConfig> {
    return invoke("torrent_network_get_config")
  },

  async torrentNetworkSetConfig(config: TorrentNetworkConfig): Promise<void> {
    return invoke("torrent_network_set_config", { config })
  },

  async debridResolveAndImport(provider: 'auto' | 'torbox', candidateLinks: string[], filenameHint?: string): Promise<DebridResolveResult> {
    return invoke("debrid_resolve_and_import", { provider, candidateLinks, filenameHint })
  },

  async proxyMangaImage(sourceId: string, imageUrl: string): Promise<Uint8Array> {
    return invoke<number[]>('proxy_manga_image', { sourceId, imageUrl }).then(arr => new Uint8Array(arr))
  },

  // Calibre Conversion
  async checkCalibreAvailable(): Promise<boolean> {
    return invoke("check_calibre_available")
  },

  async convertWithCalibre(
    inputPath: string,
    outputFormat: string,
    replaceOriginal: boolean,
    bookId?: number
  ): Promise<{ success: boolean; output_path: string; message: string }> {
    return invoke("convert_with_calibre", {
      inputPath,
      outputFormat,
      replaceOriginal,
      bookId,
    })
  },

  // Auto-Convert on Open
  async convertAndReplaceBook(
    bookId: number
  ): Promise<{ new_path: string; new_format: string; title: string; cover_path: string | null }> {
    return invoke("convert_and_replace_book", { bookId })
  },
}
