import { useEffect } from "react"
import { Layout } from "./components/layout/Layout"
import { LibraryGrid } from "./components/library/LibraryGrid"
import { useLibraryStore } from "./store/libraryStore"
import { useUIStore } from "./store/uiStore"
import { api } from "./lib/tauri"
import { Grid3x3, List, Table2 } from "./components/icons"
import { Button } from "./components/ui/Button"

function App() {
  const { books, setBooks, viewMode, setViewMode } = useLibraryStore()
  const { theme } = useUIStore()

  useEffect(() => {
    // Apply theme to document
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])

  useEffect(() => {
    // Load books on mount
    const loadBooks = async () => {
      try {
        const loadedBooks = await api.getBooks()
        setBooks(loadedBooks)
      } catch (error) {
        console.error("Failed to load books:", error)
      }
    }

    loadBooks()
  }, [setBooks])

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Library</h1>
            <p className="text-muted-foreground">
              {books.length} {books.length === 1 ? "book" : "books"}
            </p>
          </div>

          {/* View mode toggle */}
          <div className="flex gap-1 rounded-lg border border-border p-1">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("grid")}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("table")}
            >
              <Table2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Library view */}
        {viewMode === "grid" && <LibraryGrid books={books} />}
        {viewMode === "list" && (
          <div className="text-center text-muted-foreground">
            List view coming soon
          </div>
        )}
        {viewMode === "table" && (
          <div className="text-center text-muted-foreground">
            Table view coming soon
          </div>
        )}
      </div>
    </Layout>
  )
}

export default App
