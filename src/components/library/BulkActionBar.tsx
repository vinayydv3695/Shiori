/**
 * BulkActionBar.tsx
 *
 * Floating action bar shown while books are multi-selected in the library.
 * Previously bulk actions lived in a toolbar that was removed — this bar
 * restores them for the current multi-select flow:
 *
 *   • Select all visible / Clear selection
 *   • Convert to EPUB (batch, via BatchConvertDialog)
 *   • Add to Shelf… (batch, via BulkShelfDialog)
 *
 * Rendered by LibraryGrid; positioned fixed so it floats above the grid and
 * clears the mobile bottom nav.
 */
import { useCallback } from 'react';
import { X, FileOutput, FolderPlus, CheckSquare, Square } from 'lucide-react';
import { useLibraryStore } from '@/store/libraryStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BulkActionBarProps {
  /** Titles of the books currently visible in the grid (for Select all). */
  visibleBookIds: number[];
  onConvert: () => void;
  onAddToShelf: () => void;
}

export function BulkActionBar({ visibleBookIds, onConvert, onAddToShelf }: BulkActionBarProps) {
  const selectedBookIds = useLibraryStore((s) => s.selectedBookIds);
  const clearSelection = useLibraryStore((s) => s.clearSelection);
  const selectAllBooks = useLibraryStore((s) => s.selectAllBooks);

  const count = selectedBookIds.size;
  const allVisibleSelected =
    visibleBookIds.length > 0 && visibleBookIds.every((id) => selectedBookIds.has(id));

  const handleSelectAll = useCallback(() => {
    if (allVisibleSelected) {
      // Deselect everything currently visible (keep any off-screen selection).
      const remaining = new Set(selectedBookIds);
      for (const id of visibleBookIds) remaining.delete(id);
      useLibraryStore.setState({ selectedBookIds: remaining });
    } else {
      const next = new Set(selectedBookIds);
      for (const id of visibleBookIds) next.add(id);
      selectAllBooks(Array.from(next));
    }
  }, [allVisibleSelected, selectedBookIds, visibleBookIds, selectAllBooks]);

  if (count === 0) return null;

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] md:bottom-6 left-1/2 -translate-x-1/2 z-[65] max-w-[95vw]">
      <div className="flex items-center gap-1.5 px-2 py-2 rounded-2xl border border-border/60 bg-background/90 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
        <span className="px-3 text-sm font-semibold text-foreground whitespace-nowrap tabular-nums">
          {count} selected
        </span>

        <div className="w-px h-6 bg-border/70 mx-0.5" />

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSelectAll}
          className="gap-1.5 h-9 rounded-lg text-sm"
          title={allVisibleSelected ? 'Deselect visible' : 'Select all visible'}
        >
          {allVisibleSelected ? (
            <CheckSquare className="w-4 h-4" />
          ) : (
            <Square className="w-4 h-4" />
          )}
          <span className="max-md:hidden">{allVisibleSelected ? 'Deselect' : 'Select all'}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onConvert}
          className="gap-1.5 h-9 rounded-lg text-sm"
          title="Convert selected books to EPUB"
        >
          <FileOutput className="w-4 h-4" />
          <span className={cn('max-md:hidden')}>Convert to EPUB</span>
          <span className="md:hidden">Convert</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onAddToShelf}
          className="gap-1.5 h-9 rounded-lg text-sm"
          title="Add selected books to a shelf"
        >
          <FolderPlus className="w-4 h-4" />
          <span className={cn('max-md:hidden')}>Add to Shelf…</span>
          <span className="md:hidden">Shelf</span>
        </Button>

        <div className="w-px h-6 bg-border/70 mx-0.5" />

        <Button
          variant="ghost"
          size="sm"
          onClick={clearSelection}
          className="gap-1.5 h-9 rounded-lg text-sm text-muted-foreground hover:text-foreground"
          title="Clear selection"
        >
          <X className="w-4 h-4" />
          <span className="max-md:hidden">Clear</span>
        </Button>
      </div>
    </div>
  );
}

export default BulkActionBar;
