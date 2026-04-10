import { useState, useCallback } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import type { SeriesGroup } from '@/hooks/useGroupedLibrary';

/**
 * Manages all dialog open/close state that was previously inlined in App.tsx.
 * Reduces ~15 useState calls and their associated handlers into a single hook.
 */
export function useDialogManager() {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false);
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [batchMetadataDialogOpen, setBatchMetadataDialogOpen] = useState(false);
  const [seriesViewOpen, setSeriesViewOpen] = useState(false);

  // Shared dialog context
  const [dialogBookId, setDialogBookId] = useState<number | null>(null);
  const [dialogBookTitle, setDialogBookTitle] = useState<string>('');
  const [deleteBookIds, setDeleteBookIds] = useState<number[]>([]);
  const [batchMetadataBookIds, setBatchMetadataBookIds] = useState<number[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<SeriesGroup | null>(null);

  const openEditDialog = useCallback((bookId: number) => {
    setDialogBookId(bookId);
    setEditDialogOpen(true);
  }, []);

  const openDeleteDialog = useCallback((bookId: number, title: string) => {
    setDeleteBookIds([bookId]);
    setDialogBookTitle(title);
    setDeleteDialogOpen(true);
  }, []);

  const openDeleteMultipleDialog = useCallback((bookIds: number[]) => {
    setDeleteBookIds(bookIds);
    setDialogBookTitle('');
    setDeleteDialogOpen(true);
  }, []);

  const openDetailsDialog = useCallback((bookId: number) => {
    setDialogBookId(bookId);
    setDetailsDialogOpen(true);
  }, []);

  const openConversionDialog = useCallback((bookId: number) => {
    setDialogBookId(bookId);
    setConversionDialogOpen(true);
  }, []);

  const openBatchMetadataDialog = useCallback(() => {
    const lib = useLibraryStore.getState();
    if (lib.selectedBookIds.size > 0) {
      setBatchMetadataBookIds(Array.from(lib.selectedBookIds));
      setBatchMetadataDialogOpen(true);
    }
  }, []);

  const openSeriesView = useCallback((series: SeriesGroup) => {
    setSelectedSeries(series);
    setSeriesViewOpen(true);
  }, []);

  return {
    // Dialog open states
    editDialogOpen, setEditDialogOpen,
    deleteDialogOpen, setDeleteDialogOpen,
    settingsDialogOpen, setSettingsDialogOpen,
    detailsDialogOpen, setDetailsDialogOpen,
    shortcutsDialogOpen, setShortcutsDialogOpen,
    conversionDialogOpen, setConversionDialogOpen,
    advancedFilterOpen, setAdvancedFilterOpen,
    batchMetadataDialogOpen, setBatchMetadataDialogOpen,
    seriesViewOpen, setSeriesViewOpen,

    // Context data
    dialogBookId,
    dialogBookTitle,
    deleteBookIds,
    batchMetadataBookIds, setBatchMetadataBookIds,
    selectedSeries,

    // Openers
    openEditDialog,
    openDeleteDialog,
    openDeleteMultipleDialog,
    openDetailsDialog,
    openConversionDialog,
    openBatchMetadataDialog,
    openSeriesView,
  };
}
