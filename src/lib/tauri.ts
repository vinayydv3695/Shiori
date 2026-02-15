import { invoke } from "@tauri-apps/api/core"
import { open, save } from "@tauri-apps/plugin-dialog"

// Check if we're running in Tauri environment
export const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

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
  async getBooks(): Promise<Book[]> {
    if (!isTauri) {
      console.warn("Running in browser mode - using mock data")
      return Promise.resolve(mockBooks)
    }
    return invoke("get_books")
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

  async importBooks(paths: string[]): Promise<ImportResult> {
    return invoke("import_books", { paths })
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
    return invoke("add_tag_to_book", { book_id: bookId, tag_id: tagId })
  },

  async removeTagFromBook(bookId: number, tagId: number): Promise<void> {
    return invoke("remove_tag_from_book", { book_id: bookId, tag_id: tagId })
  },

  // Reader - Reading Progress
  async getReadingProgress(bookId: number): Promise<ReadingProgress | null> {
    return invoke("get_reading_progress", { book_id: bookId })
  },

  async saveReadingProgress(
    bookId: number,
    currentLocation: string,
    progressPercent: number,
    currentPage?: number,
    totalPages?: number
  ): Promise<ReadingProgress> {
    return invoke("save_reading_progress", {
      book_id: bookId,
      current_location: currentLocation,
      progress_percent: progressPercent,
      current_page: currentPage,
      total_pages: totalPages,
    })
  },

  // Reader - Annotations
  async getAnnotations(bookId: number): Promise<Annotation[]> {
    return invoke("get_annotations", { book_id: bookId })
  },

  async createAnnotation(
    bookId: number,
    annotationType: string,
    location: string,
    cfiRange?: string,
    selectedText?: string,
    noteContent?: string,
    color?: string
  ): Promise<Annotation> {
    return invoke("create_annotation", {
      book_id: bookId,
      annotation_type: annotationType,
      location,
      cfi_range: cfiRange,
      selected_text: selectedText,
      note_content: noteContent,
      color: color || "#fbbf24",
    })
  },

  async updateAnnotation(
    id: number,
    noteContent?: string,
    color?: string
  ): Promise<void> {
    return invoke("update_annotation", { id, note_content: noteContent, color })
  },

  async deleteAnnotation(id: number): Promise<void> {
    return invoke("delete_annotation", { id })
  },

  // Reader - Settings
  async getReaderSettings(userId: string): Promise<ReaderSettings> {
    return invoke("get_reader_settings", { user_id: userId })
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
    return invoke("get_book_file_path", { book_id: bookId })
  },

  // Collections
  async getCollections(): Promise<Collection[]> {
    return invoke("get_collections")
  },

  async getCollection(id: number): Promise<Collection> {
    return invoke("get_collection", { id })
  },

  async createCollection(
    name: string,
    description?: string,
    parentId?: number,
    isSmart?: boolean,
    smartRules?: string,
    icon?: string,
    color?: string
  ): Promise<Collection> {
    return invoke("create_collection", {
      name,
      description,
      parent_id: parentId,
      is_smart: isSmart || false,
      smart_rules: smartRules,
      icon,
      color,
    })
  },

  async updateCollection(
    id: number,
    name: string,
    description?: string,
    parentId?: number,
    smartRules?: string,
    icon?: string,
    color?: string
  ): Promise<void> {
    return invoke("update_collection", {
      id,
      name,
      description,
      parent_id: parentId,
      smart_rules: smartRules,
      icon,
      color,
    })
  },

  async deleteCollection(id: number): Promise<void> {
    return invoke("delete_collection", { id })
  },

  async addBookToCollection(collectionId: number, bookId: number): Promise<void> {
    return invoke("add_book_to_collection", { collection_id: collectionId, book_id: bookId })
  },

  async removeBookFromCollection(collectionId: number, bookId: number): Promise<void> {
    return invoke("remove_book_from_collection", { collection_id: collectionId, book_id: bookId })
  },

  async addBooksToCollection(collectionId: number, bookIds: number[]): Promise<void> {
    return invoke("add_books_to_collection", { collection_id: collectionId, book_ids: bookIds })
  },

  async getCollectionBooks(collectionId: number): Promise<Book[]> {
    return invoke("get_collection_books", { collection_id: collectionId })
  },

  async getNestedCollections(): Promise<Collection[]> {
    return invoke("get_nested_collections")
  },

  // Import/Export
  async scanFolderForBooks(folderPath: string): Promise<ImportResult> {
    return invoke("scan_folder_for_books", { folder_path: folderPath })
  },

  async exportLibrary(options: ExportOptions): Promise<string> {
    return invoke("export_library", { options })
  },

  // File dialogs
  async openFileDialog(): Promise<string[] | null> {
    if (!isTauri) {
      console.warn("File dialogs only work in Tauri environment. Please run: npm run tauri dev")
      return Promise.resolve(null)
    }
    return open({
      multiple: true,
      filters: [
        {
          name: "eBooks",
          extensions: ["epub", "pdf", "mobi", "azw", "azw3", "txt", "cbz", "cbr"],
        },
      ],
    }) as Promise<string[] | null>
  },

  async openFolderDialog(): Promise<string | null> {
    if (!isTauri) {
      console.warn("File dialogs only work in Tauri environment. Please run: npm run tauri dev")
      return Promise.resolve(null)
    }
    return open({
      directory: true,
    }) as Promise<string | null>
  },

  async saveFileDialog(defaultPath?: string): Promise<string | null> {
    if (!isTauri) {
      console.warn("File dialogs only work in Tauri environment. Please run: npm run tauri dev")
      return Promise.resolve(null)
    }
    return save({
      defaultPath,
    }) as Promise<string | null>
  },
}