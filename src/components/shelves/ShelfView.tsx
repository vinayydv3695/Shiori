import React, { useState, useEffect } from 'react';
import { useShelfStore } from '../../store/shelfStore';
import { useUIStore } from '../../store/uiStore';
import { CreateShelfDialog } from './CreateShelfDialog';
import { AddBooksToShelfDialog } from './AddBooksToShelfDialog';
import { ShelfGrid } from './ShelfGrid';
import { ShelfBookGrid } from './ShelfBookGrid';
import { Shelf, Book, api } from '../../lib/tauri';
import { Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useToast } from '../../store/toastStore';
import { useBackButton } from '@/hooks/useBackButton';

export function ShelfView() {
  const setCurrentView = useUIStore(state => state.setCurrentView);
  const selectedShelf = useShelfStore(state => state.selectedShelf);
  const selectShelf = useShelfStore(state => state.selectShelf);
  const shelves = useShelfStore(state => state.shelves);
  const setShelfs = useShelfStore(state => state.setShelfs);
  const toast = useToast();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editShelf, setEditShelf] = useState<Shelf | null>(null);
  const [parentId, setParentId] = useState<number | undefined>(undefined);
  const [addBooksShelf, setAddBooksShelf] = useState<Shelf | null>(null);

  const [books, setBooks] = useState<Book[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [loadingShelves, setLoadingShelves] = useState(true);

  useBackButton(!!selectedShelf, () => selectShelf(null));

  const loadShelfs = async () => {
    setLoadingShelves(true);
    try {
      const nested = await api.getNestedShelfs();
      
      // Also load special shelves
      const [favs, shelfList] = await Promise.all([
        api.getShelfsByType('favorites'),
        api.getShelfsByType('shelf'),
      ]);
      
      const allShelves = [
        ...(favs || []),
        ...(shelfList || []),
        ...(nested || [])
      ];
      
      // Deduplicate shelves by ID
      const uniqueShelves = Array.from(new Map(allShelves.map(s => [s.id, s])).values());
      setShelfs(uniqueShelves);
    } catch (error) {
      logger.error('Failed to load shelves:', error);
    } finally {
      setLoadingShelves(false);
    }
  };

  useEffect(() => {
    loadShelfs();
  }, [setShelfs]);

  const loadBooks = React.useCallback(async () => {
    if (!selectedShelf || selectedShelf.id === undefined) {
      setBooks([]);
      return;
    }
    
    setLoadingBooks(true);
    try {
      const shelfBooks = await api.getShelfBooks(selectedShelf.id);
      setBooks(shelfBooks || []);
    } catch (error) {
      logger.error('Failed to load shelf books:', error);
      setBooks([]);
    } finally {
      setLoadingBooks(false);
    }
  }, [selectedShelf]);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const handleCreateShelf = (parentShelfId?: number) => {
    setEditShelf(null);
    setParentId(parentShelfId);
    setDialogOpen(true);
  };

  const handleEditShelf = (shelf: Shelf) => {
    setEditShelf(shelf);
    setParentId(undefined);
    setDialogOpen(true);
  };

  const handleDeleteShelf = async (shelf: Shelf) => {
    if (!confirm(`Delete "${shelf.name}" and all its subshelves?`)) {
      return;
    }
    try {
      await api.deleteShelf(shelf.id!);
      await loadShelfs();
      if (selectedShelf?.id === shelf.id) {
        selectShelf(null);
      }
      toast.success('Shelf deleted', `"${shelf.name}" has been deleted`);
    } catch (error) {
      logger.error('Failed to delete shelf:', error);
      toast.error('Failed to delete shelf', 'An error occurred while deleting the shelf');
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden relative">
      {/* Dynamic Content */}
      <div className="flex-1 overflow-hidden relative">
        {loadingShelves ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !selectedShelf ? (
          <ShelfGrid 
            shelves={shelves} 
            onSelectShelf={selectShelf} 
            onCreateShelf={() => handleCreateShelf()} 
            onEditShelf={handleEditShelf}
            onDeleteShelf={handleDeleteShelf}
            onAddBooks={(shelf) => setAddBooksShelf(shelf)}
          />
        ) : loadingBooks ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ShelfBookGrid
            shelf={selectedShelf}
            books={books}
            onBack={() => selectShelf(null)}
            onRefreshBooks={loadBooks}
          />
        )}
      </div>

      <CreateShelfDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editShelf={editShelf}
        parentId={parentId}
      />

      {addBooksShelf && (
        <AddBooksToShelfDialog
          open={!!addBooksShelf}
          onOpenChange={(open) => {
            if (!open) setAddBooksShelf(null);
          }}
          shelf={addBooksShelf}
          onBooksUpdated={() => {
            loadShelfs();
          }}
        />
      )}
    </div>
  );
}
