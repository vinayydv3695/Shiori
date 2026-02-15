import { invoke } from "@tauri-apps/api/tauri"
import { open } from "@tauri-apps/api/dialog"

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

export const api = {
  // Library operations
  async getBooks(): Promise<Book[]> {
    return invoke("get_books")
  },

  async getBook(id: number): Promise<Book> {
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
    return invoke("add_tag_to_book", { bookId, tagId })
  },

  async removeTagFromBook(bookId: number, tagId: number): Promise<void> {
    return invoke("remove_tag_from_book", { bookId, tagId })
  },

  // File dialogs
  async openFileDialog(): Promise<string[] | null> {
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
}
