import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trash2, RefreshCw, XCircle, CheckSquare, Square, AlertTriangle, ArrowLeft, BookOpen, Library, Check, X } from "lucide-react"
import { api, BookSummary } from "../lib/tauri"
import { Button } from "./ui/button"
import { AppTooltip } from "./ui/tooltip"
import { useToast } from "../store/toastStore"
import { useLibraryStore } from "../store/libraryStore"
import { useUIStore } from "../store/uiStore"
import { logger } from "../lib/logger"
import { convertFileSrc } from '@tauri-apps/api/core'
import { invalidateCover, invalidateAllCovers } from "../lib/coverCache"
import { cn } from "@/lib/utils"

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
  const [confirmModal, setConfirmModal] = useState<{ type: 'empty' | 'delete-selected'; count?: number } | null>(null)
  
  const { toast } = useToast()
  const loadBooks = useLibraryStore(s => s.loadInitialBooks)
  const setView = useUIStore(s => s.setCurrentView)

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
      toast({ title: "Books Restored", description: `${selectedIds.size} items returned to your library.` })
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
      invalidateCover(id)
      toast({ title: "Permanently Deleted", description: "The item was deleted forever." })
      await fetchTrashedBooks()
    } catch (err) {
      logger.error("Failed to delete book", err)
      toast({ title: "Error", description: "Failed to delete book permanently.", variant: "error" })
    } finally {
      setIsActioning(false)
    }
  }

  const executeDeleteSelected = async () => {
    setConfirmModal(null)
    if (selectedIds.size === 0) return
    try {
      setIsActioning(true)
      for (const id of selectedIds) {
        await api.permanentDeleteBook(id)
        invalidateCover(id)
      }
      toast({ title: "Items Deleted", description: `${selectedIds.size} items permanently deleted.` })
      await fetchTrashedBooks()
    } catch (err) {
      logger.error("Failed to delete books", err)
      toast({ title: "Error", description: "Failed to delete items.", variant: "error" })
    } finally {
      setIsActioning(false)
    }
  }

  const executeEmptyTrash = async () => {
    setConfirmModal(null)
    try {
      setIsActioning(true)
      await api.emptyTrash()
      invalidateAllCovers()
      toast({ title: "Recycle Bin Emptied", description: "All trashed items deleted permanently." })
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
    <div 
      className="h-full flex flex-col p-4 sm:p-6 space-y-4 md:space-y-5 pb-24 md:pb-6 bg-background relative overflow-hidden"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 6px)',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 16px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 16px)'
      }}
    >
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4 p-4 sm:p-5 rounded-3xl bg-secondary/30 border border-border/50 backdrop-blur-xl shadow-xs">
        <div className="flex items-center justify-between md:justify-start gap-3.5 w-full md:w-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-destructive/15 border border-destructive/30 flex items-center justify-center shrink-0 text-destructive shadow-xs">
              <Trash2 className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight">Recycle Bin</h1>
                {trashedBooks.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-extrabold bg-destructive/15 border border-destructive/30 text-destructive">
                    {trashedBooks.length} {trashedBooks.length === 1 ? 'item' : 'items'}
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mt-0.5 hidden sm:block">
                Items in the recycle bin are automatically deleted after 7 days
              </p>
            </div>
          </div>

          {/* Quick Select/Empty Controls for Mobile (Right-aligned in header) */}
          <div className="flex items-center gap-1.5 md:hidden">
            <AppTooltip content="Select All" side="bottom">
              <button 
                onClick={handleSelectAll} 
                disabled={trashedBooks.length === 0 || isActioning || loading}
                aria-label="Select All"
                className="p-2 text-xs font-extrabold text-muted-foreground hover:text-foreground bg-secondary/50 border border-border/40 rounded-xl transition-all disabled:opacity-40 active:scale-95"
              >
                {selectedIds.size === trashedBooks.length && trashedBooks.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-primary" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
            </AppTooltip>

            <AppTooltip content="Empty Trash" side="bottom">
              <button 
                onClick={() => setConfirmModal({ type: 'empty' })} 
                disabled={trashedBooks.length === 0 || isActioning || loading}
                aria-label="Empty Trash"
                className="p-2 text-xs font-extrabold text-destructive bg-destructive/15 border border-destructive/30 rounded-xl transition-all disabled:opacity-40 active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </AppTooltip>
          </div>
        </div>

        {/* Desktop Header Action Buttons */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {selectedIds.size > 0 && (
            <>
              <button 
                onClick={handleRestoreSelected}
                disabled={isActioning}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-extrabold text-foreground bg-secondary/60 hover:bg-secondary border border-border/50 rounded-xl transition-all disabled:opacity-40 active:scale-95 shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span>Restore ({selectedIds.size})</span>
              </button>
              <button 
                onClick={() => setConfirmModal({ type: 'delete-selected', count: selectedIds.size })}
                disabled={isActioning}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-extrabold text-destructive-foreground bg-destructive hover:bg-destructive/90 rounded-xl transition-all disabled:opacity-40 active:scale-95 shadow-xs"
              >
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Delete ({selectedIds.size})</span>
              </button>
            </>
          )}

          <button 
            onClick={handleSelectAll} 
            disabled={trashedBooks.length === 0 || isActioning || loading}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-extrabold text-muted-foreground hover:text-foreground bg-secondary/40 hover:bg-secondary/70 border border-border/40 rounded-xl transition-all disabled:opacity-40 active:scale-95"
          >
            {selectedIds.size === trashedBooks.length && trashedBooks.length > 0 ? (
              <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0" />
            ) : (
              <Square className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{selectedIds.size === trashedBooks.length && trashedBooks.length > 0 ? 'Deselect All' : 'Select All'}</span>
          </button>

          <button 
            onClick={() => setConfirmModal({ type: 'empty' })} 
            disabled={trashedBooks.length === 0 || isActioning || loading}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-extrabold text-destructive bg-destructive/10 hover:bg-destructive/20 border border-destructive/25 rounded-xl transition-all disabled:opacity-40 active:scale-95"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>Empty Trash</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[320px]">
            <RefreshCw className="w-8 h-8 animate-spin text-primary opacity-80" />
            <p className="text-xs font-extrabold text-muted-foreground mt-3">Loading recycle bin...</p>
          </div>
        ) : trashedBooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[360px] text-center p-6 sm:p-12 border border-border/40 rounded-3xl bg-secondary/15 backdrop-blur-md space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-secondary/50 border border-border/50 flex items-center justify-center text-muted-foreground/60 shadow-inner">
              <Trash2 className="w-10 h-10" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-base sm:text-lg font-extrabold text-foreground tracking-tight">Your Recycle Bin is empty</h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Books and manga deleted from your library will stay here for up to 7 days before being permanently removed.
              </p>
            </div>
            <button
              onClick={() => setView('library')}
              className="mt-2 flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 transition-all active:scale-95 shadow-md shadow-primary/20"
            >
              <Library className="w-4 h-4" />
              <span>Go to Library</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5 pb-28">
            {trashedBooks.map((book) => {
              const isSelected = book.id ? selectedIds.has(book.id) : false
              return (
                <motion.div
                  key={book.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    "group relative flex flex-col rounded-2xl sm:rounded-3xl border bg-card/80 p-2 sm:p-3 transition-all duration-200 cursor-pointer shadow-xs hover:shadow-xl hover:border-primary/50",
                    isSelected ? 'ring-2 ring-primary border-primary bg-primary/5' : 'border-border/60 hover:bg-card'
                  )}
                  onClick={() => book.id && toggleSelection(book.id)}
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-secondary/50 border border-border/40">
                    {/* Checkbox overlay */}
                    <div className={cn(
                      "absolute top-2 left-2 z-20 w-6 h-6 rounded-lg flex items-center justify-center transition-all shadow-md",
                      isSelected ? "bg-primary text-primary-foreground scale-100" : "bg-background/80 text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    )}>
                      {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                    </div>

                    {/* Quick Touch Restore & Delete Actions on Top-Right Corner */}
                    <div className="absolute top-2 right-2 z-20 flex items-center gap-1 sm:hidden">
                      <AppTooltip content="Restore" side="bottom">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            book.id && handleRestore(book.id);
                          }}
                          aria-label="Restore"
                          className="w-7 h-7 rounded-lg bg-background/90 text-primary flex items-center justify-center border border-border/40 shadow-md active:scale-95"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </AppTooltip>
                      <AppTooltip content="Delete" side="bottom">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            book.id && handlePermanentDelete(book.id);
                          }}
                          aria-label="Delete"
                          className="w-7 h-7 rounded-lg bg-destructive text-destructive-foreground flex items-center justify-center border border-destructive/30 shadow-md active:scale-95"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </AppTooltip>
                    </div>

                    {/* Book Cover */}
                    {book.cover_path ? (
                      <img
                        src={convertFileSrc(book.cover_path)}
                        alt={book.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => e.currentTarget.style.display = 'none'}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-3 text-center text-xs font-bold text-muted-foreground/70">
                        {book.title}
                      </div>
                    )}

                    {/* Desktop Hover Action Overlay */}
                    <div className="absolute inset-0 bg-background/85 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 hidden sm:flex flex-col items-center justify-center gap-2 p-3 z-10">
                      <button
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold text-foreground bg-secondary hover:bg-secondary/80 border border-border/60 rounded-xl transition-all active:scale-95"
                        onClick={(e) => {
                          e.stopPropagation();
                          book.id && handleRestore(book.id);
                        }}
                        disabled={isActioning}
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-primary" />
                        <span>Restore</span>
                      </button>
                      <button
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold text-destructive-foreground bg-destructive hover:bg-destructive/90 rounded-xl transition-all active:scale-95"
                        onClick={(e) => {
                          e.stopPropagation();
                          book.id && handlePermanentDelete(book.id);
                        }}
                        disabled={isActioning}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Title & Metadata */}
                  <div className="mt-2 space-y-1">
                    <AppTooltip content={book.title} side="top">
                      <h3 className="font-extrabold text-[11px] sm:text-xs text-foreground truncate leading-tight">
                        {book.title}
                      </h3>
                    </AppTooltip>
                    {book.deleted_at && (
                      <span className="inline-block text-[10px] font-extrabold text-muted-foreground bg-secondary/60 border border-border/40 px-1.5 py-0.5 rounded-lg">
                        Deleted {formatTimeAgo(book.deleted_at)}
                      </span>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* Floating Selection Bar for Mobile & Desktop when items selected */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[100] p-3 rounded-2xl bg-background/95 border border-border/80 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 pl-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-extrabold text-foreground">{selectedIds.size} selected</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleRestoreSelected}
                disabled={isActioning}
                className="flex items-center gap-1 px-3 py-2 text-xs font-extrabold text-foreground bg-secondary hover:bg-secondary/80 border border-border/50 rounded-xl transition-all active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5 text-primary" />
                <span>Restore</span>
              </button>
              <button
                onClick={() => setConfirmModal({ type: 'delete-selected', count: selectedIds.size })}
                disabled={isActioning}
                className="flex items-center gap-1 px-3 py-2 text-xs font-extrabold text-destructive-foreground bg-destructive rounded-xl hover:bg-destructive/90 transition-all active:scale-95"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
              <AppTooltip content="Cancel selection" side="top">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  aria-label="Cancel selection"
                  className="p-2 text-muted-foreground hover:text-foreground rounded-xl transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </AppTooltip>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal Sheet */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-background/70 backdrop-blur-xl animate-in fade-in-0 duration-200">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-background border border-border/80 rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-base font-extrabold text-foreground tracking-tight">
                  {confirmModal.type === 'empty' ? 'Empty Recycle Bin?' : `Delete ${confirmModal.count} items permanently?`}
                </h3>
                <p className="text-xs font-medium text-muted-foreground mt-1.5 leading-relaxed">
                  {confirmModal.type === 'empty'
                    ? 'All items in the recycle bin will be permanently deleted. This action cannot be undone.'
                    : 'The selected items will be deleted forever from your disk. This action cannot be undone.'}
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 py-2.5 text-xs font-extrabold text-foreground bg-secondary/50 border border-border/50 rounded-xl hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmModal.type === 'empty' ? executeEmptyTrash : executeDeleteSelected}
                  className="flex-1 py-2.5 text-xs font-extrabold text-destructive-foreground bg-destructive rounded-xl hover:bg-destructive/90 transition-all shadow-md shadow-destructive/20"
                >
                  Permanently Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
