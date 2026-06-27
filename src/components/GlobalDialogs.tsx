import { lazy, Suspense } from "react"
import { ToastContainer } from "./ui/ToastContainer"
import { useLibraryStore } from "@/store/libraryStore"
import { api } from "@/lib/tauri"
import { Book } from "@/lib/tauri"

// Lazy load dialogs
const EditMetadataDialog = lazy(() => import("./library/EditMetadataDialog").then(m => ({ default: m.EditMetadataDialog })))
const DeleteBookDialog = lazy(() => import("./library/DeleteBookDialog").then(m => ({ default: m.DeleteBookDialog })))
const SettingsDialog = lazy(() => import("./settings/SettingsDialog").then(m => ({ default: m.SettingsDialog })))
const BookDetailsDialog = lazy(() => import("./library/BookDetailsDialog").then(m => ({ default: m.BookDetailsDialog })))
const ConversionDialog = lazy(() => import("./conversion/ConversionDialog").then(m => ({ default: m.ConversionDialog })))
const AutoConvertDialog = lazy(() => import("./conversion/AutoConvertDialog").then(m => ({ default: m.AutoConvertDialog })))
const ConversionJobTracker = lazy(() => import("./conversion/ConversionJobTracker"))
const MetadataSearchDialog = lazy(() => import("./library/MetadataSearchDialog").then(m => ({ default: m.MetadataSearchDialog })))
const SeriesView = lazy(() => import("./library/SeriesView").then(m => ({ default: m.SeriesView })))
const AdvancedFilterDialog = lazy(() => import("./library/AdvancedFilterDialog").then(m => ({ default: m.AdvancedFilterDialog })))
const ShortcutsDialog = lazy(() => import("./dialogs/ShortcutsDialog").then(m => ({ default: m.ShortcutsDialog })))
const CommandPalette = lazy(() => import("./CommandPalette").then(m => ({ default: m.CommandPalette })))
const ResumeReadingDialog = lazy(() => import("./reader/ResumeReadingDialog").then(m => ({ default: m.ResumeReadingDialog })))

export interface GlobalDialogsProps {
  books: Book[]
  dialogs: any
  autoConvert: any
  resumeReading: any
  handleOpenBook: (id: number, location?: string) => void
  handleViewDetails: (id: number) => void
  handleEditBook: (id: number) => void
  handleDeleteBook: (id: number) => void
  handleConvertBook: (id: number) => void
  clearSelection: () => void
  loadInitialBooks: () => void
}

export function GlobalDialogs({
  books,
  dialogs,
  autoConvert,
  resumeReading,
  handleOpenBook,
  handleViewDetails,
  handleEditBook,
  handleDeleteBook,
  handleConvertBook,
  clearSelection,
  loadInitialBooks
}: GlobalDialogsProps) {
  return (
    <>
      <Suspense fallback={null}><ConversionJobTracker /></Suspense>
      <ToastContainer />

      {dialogs.dialogBookId !== null && (
        <Suspense fallback={null}>
          <EditMetadataDialog open={dialogs.editDialogOpen} onOpenChange={dialogs.setEditDialogOpen} bookId={dialogs.dialogBookId} />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <DeleteBookDialog
          open={dialogs.deleteDialogOpen}
          onOpenChange={(open) => { dialogs.setDeleteDialogOpen(open); if (!open) clearSelection() }}
          bookIds={dialogs.deleteBookIds}
          bookTitle={dialogs.dialogBookTitle}
        />
      </Suspense>

      <Suspense fallback={null}>
        <MetadataSearchDialog
          open={dialogs.batchMetadataDialogOpen}
          onOpenChange={(open) => {
            dialogs.setBatchMetadataDialogOpen(open)
            if (!open) { dialogs.setBatchMetadataBookIds([]); loadInitialBooks() }
          }}
          bookIds={dialogs.batchMetadataBookIds}
          onMetadataSelected={() => loadInitialBooks()}
        />
      </Suspense>

      {dialogs.dialogBookId !== null && (
        <Suspense fallback={null}>
          <BookDetailsDialog
            open={dialogs.detailsDialogOpen}
            onOpenChange={dialogs.setDetailsDialogOpen}
            bookId={dialogs.dialogBookId}
            onEdit={() => { dialogs.setDetailsDialogOpen(false); dialogs.setEditDialogOpen(true) }}
            onDelete={() => {
              const book = books.find(b => b.id === dialogs.dialogBookId)
              dialogs.openDeleteDialog(dialogs.dialogBookId!, book?.title || "this book")
              dialogs.setDetailsDialogOpen(false)
            }}
            onRead={() => { dialogs.setDetailsDialogOpen(false); handleOpenBook(dialogs.dialogBookId!) }}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <SettingsDialog open={dialogs.settingsDialogOpen} onOpenChange={dialogs.setSettingsDialogOpen} />
      </Suspense>

      {autoConvert.pendingBook && (
        <Suspense fallback={null}>
          <AutoConvertDialog
            isOpen={autoConvert.showDialog}
            onOpenChange={autoConvert.onDialogOpenChange}
            bookTitle={autoConvert.pendingBook.title}
            currentFormat={autoConvert.pendingBook.file_format}
            onConfirm={autoConvert.onConfirm}
            isConverting={autoConvert.isConverting}
          />
        </Suspense>
      )}

      {resumeReading.pendingResume && (
        <ResumeReadingDialog
          isOpen={resumeReading.showDialog}
          onOpenChange={resumeReading.onDialogOpenChange}
          bookTitle={resumeReading.pendingResume.bookTitle}
          progressPercent={resumeReading.pendingResume.progress.progressPercent}
          locationLabel={resumeReading.buildLocationLabel(resumeReading.pendingResume.progress)}
          onResume={resumeReading.onResume}
          onStartOver={resumeReading.onStartOver}
        />
      )}

      {dialogs.dialogBookId !== null && (
        <Suspense fallback={null}>
          <ConversionDialog open={dialogs.conversionDialogOpen} onOpenChange={dialogs.setConversionDialogOpen} bookId={dialogs.dialogBookId} />
        </Suspense>
      )}

      {dialogs.selectedSeries && (
        <Suspense fallback={null}>
          <SeriesView
            series={dialogs.selectedSeries}
            isOpen={dialogs.seriesViewOpen}
            onClose={() => dialogs.setSeriesViewOpen(false)}
            onSelectBook={() => {}}
            onOpenBook={handleOpenBook}
            onViewDetailsBook={handleViewDetails}
            onEditBook={handleEditBook}
            onDeleteBook={handleDeleteBook}
            onConvertBook={handleConvertBook}
            onFavoriteBook={async (id) => {
              await api.toggleBookFavorite(id)
              useLibraryStore.getState().toggleFavorite(id)
            }}
            selectedBookIds={new Set()}
            favoritedBookIds={useLibraryStore.getState().favoriteBookIds}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <AdvancedFilterDialog open={dialogs.advancedFilterOpen} onOpenChange={dialogs.setAdvancedFilterOpen} />
      </Suspense>

      <ShortcutsDialog open={dialogs.shortcutsDialogOpen} onOpenChange={dialogs.setShortcutsDialogOpen} />
      
      <CommandPalette 
        books={books}
        onOpenBook={handleOpenBook}
        onImportFiles={() => {}}
        onSettings={() => dialogs.setSettingsDialogOpen(true)}
        onFetchMetadata={() => {}}
        onFindDuplicates={() => {}}
      />
    </>
  )
}
