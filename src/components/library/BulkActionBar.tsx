/**
 * BulkActionBar.tsx
 *
 * Contextual Topbar Mode (Google Drive / Apple Photos / macOS Finder style)
 *
 * When books or series are multi-selected, this toolbar smoothly replaces the topbar:
 *   • Keeps the book grid 100% unobstructed (zero cards covered).
 *   • Positioned immediately adjacent to the books and user cursor at the top of the viewport.
 *   • Complete desktop & mobile responsive layout with window controls preserved on desktop.
 *   • Batch tools: Select all, Convert to EPUB, Add to Shelf, Add to Series.
 *   • Destructive actions: Move to Trash (Recycle Bin) vs Permanent Delete (bypasses Trash).
 *   • Clear selection & Escape key listener.
 */
import { useCallback, useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FileOutput,
  FolderPlus,
  Layers,
  CheckSquare,
  Square,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { useLibraryStore } from '@/store/libraryStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Button } from '@/components/ui/button';
import { AppTooltip } from '@/components/ui/tooltip';
import { WindowControls } from '@/components/layout/WindowControls';
import { BulkDeleteDialog } from './BulkDeleteDialog';

interface BulkActionBarProps {
  /** IDs of the books currently visible in the grid (for Select all). */
  visibleBookIds: number[];
  onConvert: () => void;
  onAddToShelf: () => void;
  onAddToSeries?: () => void;
}

export function BulkActionBar({
  visibleBookIds,
  onConvert,
  onAddToShelf,
  onAddToSeries,
}: BulkActionBarProps) {
  const selectedBookIds = useLibraryStore((s) => s.selectedBookIds);
  const clearSelection = useLibraryStore((s) => s.clearSelection);
  const selectAllBooks = useLibraryStore((s) => s.selectAllBooks);
  const books = useLibraryStore((s) => s.books);
  const isMobile = useIsMobile();

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalMode, setDeleteModalMode] = useState<'trash' | 'permanent'>('trash');

  const count = selectedBookIds.size;
  const allVisibleSelected =
    visibleBookIds.length > 0 && visibleBookIds.every((id) => selectedBookIds.has(id));

  // Determine series vs standalone breakdown for informative count
  const { seriesCount, standaloneCount } = useMemo(() => {
    const seriesMap = new Map<string, number[]>();
    let standalone = 0;

    for (const b of books) {
      if (b.id != null && selectedBookIds.has(b.id)) {
        const sName = b.series?.trim();
        if (sName) {
          if (!seriesMap.has(sName)) seriesMap.set(sName, []);
          seriesMap.get(sName)!.push(b.id);
        } else {
          standalone++;
        }
      }
    }

    return {
      seriesCount: seriesMap.size,
      standaloneCount: standalone,
    };
  }, [books, selectedBookIds]);

  const selectedIdsArray = useMemo(() => Array.from(selectedBookIds), [selectedBookIds]);

  const handleSelectAll = useCallback(() => {
    if (allVisibleSelected) {
      const remaining = new Set(selectedBookIds);
      for (const id of visibleBookIds) remaining.delete(id);
      useLibraryStore.setState({ selectedBookIds: remaining });
    } else {
      const next = new Set(selectedBookIds);
      for (const id of visibleBookIds) next.add(id);
      selectAllBooks(Array.from(next));
    }
  }, [allVisibleSelected, selectedBookIds, visibleBookIds, selectAllBooks]);

  // Pressing Escape clears selection when no modal is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleteModalOpen && count > 0) {
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, deleteModalOpen, count]);

  const handleOpenDelete = (mode: 'trash' | 'permanent') => {
    setDeleteModalMode(mode);
    setDeleteModalOpen(true);
  };

  if (count === 0) return null;

  const barContent = (
    <AnimatePresence>
      {isMobile ? (
        /* ── Mobile Contextual Topbar ── */
        <motion.header
          key="contextual-topbar-mobile"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18 }}
          className="fixed top-0 left-0 right-0 z-50 bg-card/98 border-b border-border/80 shadow-md flex items-center justify-between px-3 select-none md:hidden font-sans"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4px)',
            height: 'calc(env(safe-area-inset-top, 0px) + 54px)',
          }}
        >
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Clear selection (Esc)"
              onClick={clearSelection}
              className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-4 h-4" />
            </Button>
            <span className="text-xs font-bold text-foreground tabular-nums">
              {count} selected
            </span>
          </div>

          <div className="flex items-center gap-1">
            <AppTooltip content="Convert to EPUB" side="bottom">
              <Button
                variant="ghost"
                size="sm"
                onClick={onConvert}
                className="h-8 w-8 p-0 rounded-lg text-foreground/80 cursor-pointer"
              >
                <FileOutput className="w-4 h-4" />
              </Button>
            </AppTooltip>

            <AppTooltip content="Add to Shelf" side="bottom">
              <Button
                variant="ghost"
                size="sm"
                onClick={onAddToShelf}
                className="h-8 w-8 p-0 rounded-lg text-foreground/80 cursor-pointer"
              >
                <FolderPlus className="w-4 h-4" />
              </Button>
            </AppTooltip>

            {onAddToSeries && (
              <AppTooltip content="Add to Series" side="bottom">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAddToSeries}
                  className="h-8 w-8 p-0 rounded-lg text-foreground/80 cursor-pointer"
                >
                  <Layers className="w-4 h-4" />
                </Button>
              </AppTooltip>
            )}

            <AppTooltip content="Delete (Recycle Bin)" side="bottom">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Delete"
                onClick={() => handleOpenDelete('trash')}
                className="h-8 w-8 p-0 rounded-lg text-destructive/90 hover:bg-destructive/10 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </AppTooltip>

            <AppTooltip content="Permanent Delete" side="bottom">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Permanent Delete"
                onClick={() => handleOpenDelete('permanent')}
                className="h-8 w-8 p-0 rounded-lg text-destructive hover:bg-destructive/15 cursor-pointer"
              >
                <AlertTriangle className="w-4 h-4" />
              </Button>
            </AppTooltip>
          </div>
        </motion.header>
      ) : (
        /* ── Desktop Contextual Topbar ── */
        <motion.header
          key="contextual-topbar-desktop"
          initial={{ opacity: 0, y: -14, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.995 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          data-tauri-drag-region
          className="fixed top-2 left-2 right-2 h-[58px] px-4 gap-3 rounded-2xl border border-border/80 bg-card/95 dark:bg-card/95 backdrop-blur-2xl shadow-xl z-50 flex items-center justify-between select-none font-sans"
        >
          {/* ── ZONE 1: Left Actions (Clear, Counter Badge, Select All) ── */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Clear Button */}
            <AppTooltip content="Clear selection (Esc)" side="bottom">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Clear selection (Esc)"
                onClick={clearSelection}
                className="h-9 w-9 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 cursor-pointer active:scale-95 transition-all"
              >
                <X className="w-4 h-4" />
              </Button>
            </AppTooltip>

            <div className="w-px h-5 bg-border/60 mx-0.5 shrink-0" />

            {/* Selection Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/80 text-foreground font-bold text-xs shrink-0 select-none border border-border/50 shadow-2xs">
              {seriesCount > 0 && <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              <span className="tabular-nums">
                {seriesCount > 0 && standaloneCount === 0
                  ? `${seriesCount} ${seriesCount === 1 ? 'series' : 'series'} (${count} ${count === 1 ? 'vol' : 'vols'})`
                  : seriesCount > 0 && standaloneCount > 0
                  ? `${count} selected (${seriesCount} ${seriesCount === 1 ? 'series' : 'series'})`
                  : `${count} selected`}
              </span>
            </div>

            {/* Select all visible / Deselect */}
            <AppTooltip content={allVisibleSelected ? 'Deselect visible' : 'Select all visible'} side="bottom">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="gap-1.5 h-9 px-2.5 rounded-xl text-xs font-semibold shrink-0 cursor-pointer text-foreground/80 hover:text-foreground hover:bg-muted/60 active:scale-97"
              >
                {allVisibleSelected ? (
                  <CheckSquare className="w-4 h-4 text-primary" />
                ) : (
                  <Square className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="hidden xl:inline">{allVisibleSelected ? 'Deselect visible' : 'Select all'}</span>
              </Button>
            </AppTooltip>
          </div>

          {/* ── ZONE 2: Center Batch Actions ── */}
          <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
            {/* Convert to EPUB */}
            <AppTooltip content="Convert selected books to EPUB" side="bottom">
              <Button
                variant="ghost"
                size="sm"
                onClick={onConvert}
                className="gap-2 h-9 px-3 rounded-xl text-xs font-semibold shrink-0 cursor-pointer text-foreground/85 hover:text-foreground hover:bg-muted/70 active:scale-97"
              >
                <FileOutput className="w-4 h-4 text-foreground/70" />
                <span className="hidden sm:inline">Convert to EPUB</span>
                <span className="sm:hidden">Convert</span>
              </Button>
            </AppTooltip>

            {/* Add to Shelf */}
            <AppTooltip content="Add selected books to a shelf" side="bottom">
              <Button
                variant="ghost"
                size="sm"
                onClick={onAddToShelf}
                className="gap-2 h-9 px-3 rounded-xl text-xs font-semibold shrink-0 cursor-pointer text-foreground/85 hover:text-foreground hover:bg-muted/70 active:scale-97"
              >
                <FolderPlus className="w-4 h-4 text-foreground/70" />
                <span className="hidden sm:inline">Add to Shelf…</span>
                <span className="sm:hidden">Shelf</span>
              </Button>
            </AppTooltip>

            {/* Add to Series */}
            {onAddToSeries && (
              <AppTooltip content="Add selected books to a series" side="bottom">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAddToSeries}
                  className="gap-2 h-9 px-3 rounded-xl text-xs font-semibold shrink-0 cursor-pointer text-foreground/85 hover:text-foreground hover:bg-muted/70 active:scale-97"
                >
                  <Layers className="w-4 h-4 text-foreground/70" />
                  <span className="hidden sm:inline">Add to Series…</span>
                  <span className="sm:hidden">Series</span>
                </Button>
              </AppTooltip>
            )}
          </div>

          {/* ── ZONE 3: Right Actions (Delete, Permanent Delete & Window Controls) ── */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Move to Recycle Bin (Trash) */}
            <AppTooltip content="Move selected items to Recycle Bin (Trash)" side="bottom">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Delete"
                onClick={() => handleOpenDelete('trash')}
                className="gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold shrink-0 cursor-pointer text-destructive/90 hover:text-destructive hover:bg-destructive/10 active:scale-97"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden lg:inline">Delete</span>
              </Button>
            </AppTooltip>

            {/* Permanent Delete (Bypasses Recycle Bin) */}
            <AppTooltip content="Permanently delete from disk (bypasses Recycle Bin completely)" side="bottom">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Permanent Delete"
                onClick={() => handleOpenDelete('permanent')}
                className="gap-1.5 h-9 px-3 rounded-xl text-xs font-bold shrink-0 cursor-pointer text-destructive hover:text-destructive hover:bg-destructive/15 active:scale-97"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Permanent Delete</span>
                <span className="lg:hidden">Permanent</span>
              </Button>
            </AppTooltip>

            <div className="w-px h-5 bg-border/40 mx-1 shrink-0" />

            {/* Window Controls (Preserved on Desktop) */}
            <WindowControls />
          </div>
        </motion.header>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {typeof document !== 'undefined' ? createPortal(barContent, document.body) : barContent}

      {/* Bulk Delete Dialog */}
      <BulkDeleteDialog
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        bookIds={selectedIdsArray}
        initialMode={deleteModalMode}
      />
    </>
  );
}

export default BulkActionBar;
