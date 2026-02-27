import { Search, Moon, Sun, Plus } from "../icons"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { useTheme } from "../../hooks/useTheme"
import { api } from "../../lib/tauri"
import { useLibraryStore } from "../../store/libraryStore"

export function Topbar() {
  const { theme, toggleTheme } = useTheme()
  const { addBook } = useLibraryStore()

  const handleImport = async () => {
    const files = await api.openFileDialog()
    if (files && files.length > 0) {
      const result = await api.importBooks(files)
      console.log("Import result:", result)
      // Refresh library
      const books = await api.getBooks()
      useLibraryStore.setState({ books })
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-card px-6">
      {/* Search */}
      <div className="flex flex-1 items-center gap-2">
        <Search className="h-5 w-5 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search books, authors, tags..."
          className="max-w-md"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button onClick={handleImport}>
          <Plus className="h-4 w-4" />
          Import Books
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="rounded-full"
        >
          {theme === "black" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </Button>
      </div>
    </header>
  )
}
