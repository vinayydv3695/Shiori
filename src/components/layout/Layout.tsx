import type { ReactNode } from "react"
import { useState } from "react"
import { open } from "@tauri-apps/plugin-dialog"
import { ModernSidebar } from "../sidebar/ModernSidebar"
import { ModernToolbar, ViewControls, StatusBar } from "./ModernToolbar"
import { useUIStore } from "../../store/uiStore"
import { useLibraryStore } from "../../store/libraryStore"
import { cn, formatFileSize } from "../../lib/utils"
import { api } from "../../lib/tauri"

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { sidebarCollapsed } = useUIStore()
  const { books, viewMode, setViewMode, selectedBookIds } = useLibraryStore()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Initialize filter state
  const [selectedFilters, setSelectedFilters] = useState({
    authors: [] as string[],
    languages: [] as string[],
    series: [] as string[],
    formats: [] as string[],
    publishers: [] as string[],
    ratings: [] as string[],
    tags: [] as string[],
    identifiers: [] as string[],
  })

  // Calculate library stats
  const totalBooks = books.length
  const totalSize = books.reduce((sum, book) => sum + (book.file_size || 0), 0)
  const librarySize = totalSize > 0 ? formatFileSize(totalSize) : "0 B"

  // Extract filter data from books
  const getFilterItems = () => {
    // TODO: Extract real data from books
    return {
      authors: [],
      languages: [],
      series: [],
      formats: [],
      publishers: [],
      ratings: [],
      tags: [],
      identifiers: [],
    }
  }

  const filterItems = getFilterItems()

  // Toolbar action handlers
  const handleAddBook = async () => {
    try {
      const result = await open({
        multiple: true,
        directory: false,
        filters: [{
          name: 'eBooks',
          extensions: ['epub', 'pdf', 'mobi', 'azw3', 'txt']
        }]
      })
      
      if (result) {
        const paths = Array.isArray(result) ? result : [result]
        await api.importBooks(paths)
      }
    } catch (error) {
      console.error("Failed to import books:", error)
    }
  }

  const handleEditMetadata = () => {
    console.log("Edit metadata clicked")
  }

  const handleConvert = () => {
    console.log("Convert clicked")
  }

  const handleView = () => {
    console.log("View clicked")
  }

  const handleDownload = () => {
    console.log("Download clicked")
  }

  const handleFetchNews = () => {
    console.log("Fetch news clicked")
  }

  const handleSettings = () => {
    console.log("Settings clicked")
  }

  const handleRemove = () => {
    console.log("Remove clicked")
  }

  const handleSave = () => {
    console.log("Save clicked")
  }

  const handleShare = () => {
    console.log("Share clicked")
  }

  const handleEditBook = () => {
    console.log("Edit book clicked")
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleFilterToggle = (category: string, id: string) => {
    setSelectedFilters(prev => {
      const categoryFilters = prev[category as keyof typeof prev]
      const newFilters = categoryFilters.includes(id)
        ? categoryFilters.filter(item => item !== id)
        : [...categoryFilters, id]
      
      return {
        ...prev,
        [category]: newFilters,
      }
    })
  }

  const handleClearAllFilters = () => {
    setSelectedFilters({
      authors: [],
      languages: [],
      series: [],
      formats: [],
      publishers: [],
      ratings: [],
      tags: [],
      identifiers: [],
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      {sidebarOpen && (
        <ModernSidebar
          authors={filterItems.authors}
          languages={filterItems.languages}
          series={filterItems.series}
          formats={filterItems.formats}
          publishers={filterItems.publishers}
          ratings={filterItems.ratings}
          tags={filterItems.tags}
          identifiers={filterItems.identifiers}
          selectedFilters={selectedFilters}
          onFilterToggle={handleFilterToggle}
          onClearAll={handleClearAllFilters}
        />
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <ModernToolbar
          onAddBook={handleAddBook}
          onEditMetadata={handleEditMetadata}
          onConvert={handleConvert}
          onView={handleView}
          onDownload={handleDownload}
          onFetchNews={handleFetchNews}
          onSettings={handleSettings}
          onRemove={handleRemove}
          onSave={handleSave}
          onShare={handleShare}
          onEditBook={handleEditBook}
        />

        {/* View Controls */}
        <ViewControls
          view={viewMode}
          onViewChange={setViewMode}
          onFilterClick={toggleSidebar}
          selectedCount={selectedBookIds.size}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-auto bg-background p-6">
          {children}
        </main>

        {/* Status Bar */}
        <StatusBar
          totalBooks={totalBooks}
          filteredBooks={books.length}
          selectedBooks={selectedBookIds.size}
          librarySize={librarySize}
          syncStatus="synced"
        />
      </div>
    </div>
  )
}
