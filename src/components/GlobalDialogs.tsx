import { lazy, Suspense } from "react"
import { useLibraryStore } from "@/store/libraryStore"
import { api } from "@/lib/tauri"
import { Book } from "@/lib/tauri"
import { useBackButton } from "@/hooks/useBackButton"

// Lazy load dialogs
const EditMetadataDialog = lazy(() => import("./library/EditMetadataDialog").then(m => ({ default: m.EditMetadataDialog })))
const DeleteBookDialog = lazy(() => import("./library/DeleteBookDialog").then(m => ({ default: m.DeleteBookDialog })))
const SettingsDialog = lazy(() => import("./settings/SettingsDialog").then(m => ({ default: m.SettingsDialog })))
const BookDetailsDialog = lazy(() => import("./library/BookDetailsDialog").then(m => ({ default: m.BookDetailsDialog })))
const AutoConvertDialog = lazy(() => import("./conversion/AutoConvertDialog").then(m => ({ default: m.AutoConvertDialog })))
const ConversionJobTracker = lazy(() => import("./conversion/ConversionJobTracker"))
const MetadataSearchDialog = lazy(() => import("./library/MetadataSearchDialog").then(m => ({ default: m.MetadataSearchDialog })))
const SeriesView = lazy(() => import("./library/SeriesView").then(m => ({ default: m.SeriesView })))
const AdvancedFilterDialog = lazy(() => import("./library/AdvancedFilterDialog").then(m => ({ default: m.AdvancedFilterDialog })))
const ShortcutsDialog = lazy(() => import("./dialogs/ShortcutsDialog").then(m => ({ default: m.ShortcutsDialog })))
const CommandPalette = lazy(() => import("./CommandPalette").then(m => ({ default: m.CommandPalette })))
const ResumeReadingDialog = lazy(() => import("./reader/ResumeReadingDialog").then(m => ({ default: m.ResumeReadingDialog })))
const CollectionSelectDialog = lazy(() => import("./library/CollectionSelectDialog").then(m => ({ default: m.CollectionSelectDialog })))
const TagSelectDialog = lazy(() => import("./library/TagSelectDialog").then(m => ({ default: m.TagSelectDialog })))
const UpdateDialog = lazy(() => import("./UpdateDialog").then(m => ({ default: m.UpdateDialog })))

export interface GlobalDialogsProps {
  books: Book[]
  dialogs: any
  autoConvert: any
  resumeReading: any
  handleOpenBook: (id: number, location?: string) => void
  handleViewDetails: (id: number) => void
  handleEditBook: (id: number) => void
  handleDeleteBook: (id: number) => void
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
  clearSelection,
  loadInitialBooks
}: GlobalDialogsProps) {
  useBackButton(dialogs.editDialogOpen, () => dialogs.setEditDialogOpen(false));
  useBackButton(dialogs.deleteDialogOpen, () => dialogs.setDeleteDialogOpen(false));
  useBackButton(dialogs.settingsDialogOpen, () => dialogs.setSettingsDialogOpen(false));
  useBackButton(dialogs.detailsDialogOpen, () => dialogs.setDetailsDialogOpen(false));
  useBackButton(dialogs.advancedFilterOpen, () => dialogs.setAdvancedFilterOpen(false));
  useBackButton(dialogs.seriesViewOpen, () => dialogs.setSeriesViewOpen(false));
  useBackButton(dialogs.batchMetadataDialogOpen, () => dialogs.setBatchMetadataDialogOpen(false));
  useBackButton(dialogs.collectionSelectDialogOpen, () => dialogs.setCollectionSelectDialogOpen(false));
  useBackButton(dialogs.tagSelectDialogOpen, () => dialogs.setTagSelectDialogOpen(false));
  useBackButton(autoConvert.showDialog, () => autoConvert.onDialogOpenChange(false));
  useBackButton(resumeReading.showDialog, () => resumeReading.onDialogOpenChange(false));

  return (
    <>
      <Suspense fallback={null}><ConversionJobTracker /></Suspense>
      <Suspense fallback={null}><UpdateDialog /></Suspense>

      {dialogs.dialogBookId !== null && (
        <Suspense fallback={null}>
          <EditMetadataDialog open={dialogs.editDialogOpen} onOpenChange={dialogs.setEditDialogOpen} bookId={dialogs.dialogBookId} />
          <CollectionSelectDialog open={dialogs.collectionSelectDialogOpen} onOpenChange={dialogs.setCollectionSelectDialogOpen} bookId={dialogs.dialogBookId} />
          <TagSelectDialog open={dialogs.tagSelectDialogOpen} onOpenChange={dialogs.setTagSelectDialogOpen} bookId={dialogs.dialogBookId} />
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
        <Suspense fallback={null}>
          <ResumeReadingDialog
            isOpen={resumeReading.showDialog}
            onOpenChange={resumeReading.onDialogOpenChange}
            bookTitle={resumeReading.pendingResume.bookTitle}
            progressPercent={resumeReading.pendingResume.progress.progressPercent}
            locationLabel={resumeReading.buildLocationLabel(resumeReading.pendingResume.progress)}
            onResume={resumeReading.onResume}
            onStartOver={resumeReading.onStartOver}
          />
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

      <Suspense fallback={null}>
        <ShortcutsDialog open={dialogs.shortcutsDialogOpen} onOpenChange={dialogs.setShortcutsDialogOpen} />
      </Suspense>
      
      <Suspense fallback={null}>
        <CommandPalette 
          books={books}
          onOpenBook={handleOpenBook}
          onImportFiles={() => {}}
          onSettings={() => dialogs.setSettingsDialogOpen(true)}
          onFetchMetadata={() => {}}
          onFindDuplicates={() => {}}
        />
      </Suspense>
    </>
  )
}
