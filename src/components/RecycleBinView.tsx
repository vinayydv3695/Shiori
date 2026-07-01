import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Trash2, RefreshCw, XCircle, CheckSquare, Square } from "lucide-react"
import { api, BookSummary } from "../lib/tauri"
import { Button } from "./ui/button"
import { useToast } from "../store/toastStore"
import { useLibraryStore } from "../store/libraryStore"
import { logger } from "../lib/logger"
import { convertFileSrc } from '@tauri-apps/api/core'
const formatTimeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export function RecycleBinView() {
  const [trashedBooks, setTrashedBooks] = useState<BookSummary[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [isActioning, setIsActioning] = useState(false)
  const { toast } = useToast()
  const loadBooks = useLibraryStore(s => s.loadInitialBooks)

  const fetchTrashedBooks = async () => {
    try {
      setLoading(true)
      setSelectedIds(new Set())
      const result = await api.searchBooks({ in_trash: true })
      setTrashedBooks(result.books)
    } catch (err) {
      logger.error("Failed to fetch trashed books", err)
      toast({
        title: "Error",
        description: "Failed to load recycle bin.",
        variant: "error",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTrashedBooks()
  }, [])

  const handleRestore = async (id: number) => {
    try {
      setIsActioning(true)
      await api.restoreBook(id)
      toast({ title: "Book Restored", description: "The book has been returned to your library." })
      await fetchTrashedBooks()
      await loadBooks()
    } catch (err) {
      logger.error("Failed to restore book", err)
      toast({ title: "Error", description: "Failed to restore book.", variant: "error" })
    } finally {
      setIsActioning(false)
    }
  }

  const handleRestoreSelected = async () => {
    if (selectedIds.size === 0) return
    try {
      setIsActioning(true)
      for (const id of selectedIds) {
        await api.restoreBook(id)
      }
      toast({ title: "Books Restored", description: `${selectedIds.size} books have been returned to your library.` })
      await fetchTrashedBooks()
      await loadBooks()
    } catch (err) {
      logger.error("Failed to restore books", err)
      toast({ title: "Error", description: "Failed to restore some books.", variant: "error" })
    } finally {
      setIsActioning(false)
    }
  }

  const handlePermanentDelete = async (id: number) => {
    try {
      setIsActioning(true)
      await api.permanentDeleteBook(id)
      toast({ title: "Book Deleted", description: "The book has been permanently deleted." })
      await fetchTrashedBooks()
    } catch (err) {
      logger.error("Failed to delete book", err)
      toast({ title: "Error", description: "Failed to permanently delete book.", variant: "error" })
    } finally {
      setIsActioning(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Are you sure you want to permanently delete ${selectedIds.size} items?`)) return
    try {
      setIsActioning(true)
      for (const id of selectedIds) {
        await api.permanentDeleteBook(id)
      }
      toast({ title: "Books Deleted", description: `${selectedIds.size} books have been permanently deleted.` })
      await fetchTrashedBooks()
    } catch (err) {
      logger.error("Failed to delete books", err)
      toast({ title: "Error", description: "Failed to delete some books.", variant: "error" })
    } finally {
      setIsActioning(false)
    }
  }

  const handleEmptyTrash = async () => {
    if (!window.confirm("Are you sure you want to empty the recycle bin? This action cannot be undone.")) return
    
    try {
      setIsActioning(true)
      await api.emptyTrash()
      toast({ title: "Recycle Bin Emptied", description: "All items have been permanently deleted." })
      await fetchTrashedBooks()
    } catch (err) {
      logger.error("Failed to empty trash", err)
      toast({ title: "Error", description: "Failed to empty recycle bin.", variant: "error" })
    } finally {
      setIsActioning(false)
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.size === trashedBooks.length && trashedBooks.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(trashedBooks.map(b => b.id).filter((id): id is number => id !== undefined)))
    }
  }

  const toggleSelection = (id: number) => {
    const newSelection = new Set(selectedIds)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedIds(newSelection)
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="p-2 bg-destructive/10 text-destructive rounded-lg shrink-0">
            <Trash2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Recycle Bin</h1>
            <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
              Items in the recycle bin will be automatically deleted after 7 days.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full md:w-auto">
          {selectedIds.size > 0 && (
            <>
              <Button 
                variant="secondary" 
                onClick={handleRestoreSelected}
                disabled={isActioning}
                className="gap-1.5 flex-1 md:flex-none h-9 md:h-10 text-[11px] md:text-sm px-2 md:px-4"
              >
                <RefreshCw className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span className="truncate">Restore ({selectedIds.size})</span>
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteSelected}
                disabled={isActioning}
                className="gap-1.5 flex-1 md:flex-none h-9 md:h-10 text-[11px] md:text-sm px-2 md:px-4"
              >
                <XCircle className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span className="truncate">Delete ({selectedIds.size})</span>
              </Button>
            </>
          )}
          <Button 
            variant="outline" 
            onClick={handleSelectAll} 
            disabled={trashedBooks.length === 0 || isActioning || loading}
            className="gap-1.5 flex-1 md:flex-none h-9 md:h-10 text-[11px] md:text-sm px-2 md:px-4"
          >
            {selectedIds.size === trashedBooks.length && trashedBooks.length > 0 ? (
              <CheckSquare className="h-3.5 w-3.5 md:h-4 md:w-4" />
            ) : (
              <Square className="h-3.5 w-3.5 md:h-4 md:w-4" />
            )}
            <span className="truncate hidden sm:inline">Select All</span>
            <span className="truncate sm:hidden">All</span>
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleEmptyTrash} 
            disabled={trashedBooks.length === 0 || isActioning || loading}
            className="gap-1.5 flex-1 md:flex-none h-9 md:h-10 text-[11px] md:text-sm px-2 md:px-4"
          >
            <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="truncate hidden sm:inline">Empty Recycle Bin</span>
            <span className="truncate sm:hidden">Empty</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0 border rounded-lg bg-card/50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : trashedBooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
            <div className="p-4 bg-muted/50 rounded-full">
              <Trash2 className="h-12 w-12 text-muted-foreground opacity-50" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-medium text-foreground">Recycle bin is empty</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Any items you delete will appear here and can be restored for up to 7 days before being permanently deleted.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-4 p-3 md:p-4">
            {trashedBooks.map((book) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`group relative flex flex-col gap-2 md:gap-3 p-2 md:p-3 rounded-xl border bg-card hover:border-border/80 hover:shadow-md transition-all duration-300 cursor-pointer ${
                  book.id && selectedIds.has(book.id) ? 'ring-2 ring-primary border-primary' : ''
                }`}
                onClick={() => book.id && toggleSelection(book.id)}
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg">
                  {book.id && selectedIds.has(book.id) && (
                    <div className="absolute top-2 left-2 z-10 bg-primary text-primary-foreground rounded-full p-0.5">
                      <CheckSquare className="h-5 w-5" />
                    </div>
                  )}
                  {book.cover_path ? (
                    <img
                      src={convertFileSrc(book.cover_path)}
                      alt={book.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => e.currentTarget.style.display = 'none'}
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
                      {book.title}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2 p-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        book.id && handleRestore(book.id);
                      }}
                      disabled={isActioning}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Restore
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        book.id && handlePermanentDelete(book.id);
                      }}
                      disabled={isActioning}
                    >
                      <XCircle className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
                
                <div className="flex flex-col gap-1">
                  <h3 className="font-medium text-sm line-clamp-1 text-foreground" title={book.title}>
                    {book.title}
                  </h3>
                  {book.deleted_at && (
                    <span className="text-[11px] text-muted-foreground font-medium bg-muted w-fit px-1.5 rounded">
                      Deleted {formatTimeAgo(book.deleted_at)}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
