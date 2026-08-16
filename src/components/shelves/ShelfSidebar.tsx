import React, { useEffect, useState, useCallback } from 'react';
import { Folder, FolderOpen, Zap, MoreVertical, Plus, Trash2, Edit, FolderPlus, Search, Heart, Library, Star, Bookmark, BookOpen, Target, Lightbulb, Palette, Flame } from 'lucide-react';
import { useShelfStore } from '../../store/shelfStore';
import { useToast } from '../../store/toastStore';
import { api, Shelf } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

interface ShelfItemProps {
  shelf: Shelf;
  depth: number;
  onEdit: (shelf: Shelf) => void;
  onDelete: (shelf: Shelf) => void;
  onAddSubshelf: (parentId: number) => void;
}

const ShelfItem = ({ shelf, depth, onEdit, onDelete, onAddSubshelf }: ShelfItemProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const selectedShelf = useShelfStore(state => state.selectedShelf);
  const selectShelf = useShelfStore(state => state.selectShelf);
  const toast = useToast();
  const isSelected = selectedShelf?.id === shelf.id;
  const hasChildren = shelf.children && shelf.children.length > 0;
  const itemRef = React.useRef<HTMLDivElement>(null);

  const handleClick = () => {
    selectShelf(shelf);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Don't allow drops on smart shelves
    if (shelf.isSmart) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (shelf.isSmart) {
      return;
    }

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));

      if (data.type === 'book' && data.bookId) {
        await api.addBookToShelf(shelf.id!, data.bookId);

        toast.success(
          'Book added to shelf',
          `"${data.bookTitle}" was added to "${shelf.name}"`
        );
      } else if (data.type === 'books' && data.bookIds) {
        // Multi-select support
        await api.addBooksToShelf(shelf.id!, data.bookIds);

        toast.success(
          'Books added to shelf',
          `${data.bookIds.length} books were added to "${shelf.name}"`
        );
      }
     } catch (error) {
       logger.error('Failed to add book to shelf:', error);
       toast.error('Failed to add book', 'Could not add book to shelf');
     }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter: Select shelf
    if (e.key === 'Enter') {
      e.preventDefault();
      handleClick();
    }
    // Space: Toggle expansion if has children
    else if (e.key === ' ' && hasChildren) {
      e.preventDefault();
      setIsExpanded(!isExpanded);
    }
    // Delete/Backspace: Delete shelf (with confirmation)
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !e.repeat) {
      e.preventDefault();
      onDelete(shelf);
    }
    // e: Edit shelf
    else if (e.key === 'e' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onEdit(shelf);
    }
    // n: Add subshelf
    else if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onAddSubshelf(shelf.id!);
    }
    // Arrow Right: Expand if collapsed and has children
    else if (e.key === 'ArrowRight' && hasChildren && !isExpanded) {
      e.preventDefault();
      setIsExpanded(true);
    }
    // Arrow Left: Collapse if expanded and has children
    else if (e.key === 'ArrowLeft' && hasChildren && isExpanded) {
      e.preventDefault();
      setIsExpanded(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuOpen(true);
  };

const isDefaultBlueColor = (c?: string) => !c || c.toLowerCase() === '#3b82f6' || c.toLowerCase() === '#2563eb' || c.toLowerCase() === '#1d4ed8' || c.toLowerCase() === '#60a5fa';

  return (
    <div>
      <DropdownMenu.Root open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
        <DropdownMenu.Trigger asChild>
          <div
            ref={itemRef}
            className={`
              flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer
              transition-all group border select-none my-0.5
              ${isSelected
                ? 'bg-primary/15 border-primary/25 text-foreground font-bold shadow-sm'
                : 'bg-transparent border-transparent text-foreground/80 hover:bg-muted/60 hover:text-foreground'}
              ${isDragOver && !shelf.isSmart ? 'ring-2 ring-primary bg-primary/10' : ''}
              ${shelf.isSmart ? 'opacity-75' : ''}
            `}
            style={{ paddingLeft: `${depth * 14 + 12}px` }}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onKeyDown={handleKeyDown}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            tabIndex={0}
            role="button"
            aria-label={`Shelf: ${shelf.name}. ${shelf.bookCount} books. Press Enter to select, E to edit, N to add subshelf, Delete to remove.`}
            aria-expanded={hasChildren ? isExpanded : undefined}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {hasChildren && (
                <button
                  onClick={handleToggle}
                  className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                  title={isExpanded ? "Collapse" : "Expand"}
                  tabIndex={-1}
                >
                  {isExpanded ? (
                    <FolderOpen className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  ) : (
                    <Folder className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  )}
                </button>
              )}
              {!hasChildren && (
                <Folder className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              )}
              {shelf.isSmart && (
                <Zap className="w-3.5 h-3.5 text-primary" />
              )}
              <span
                className="flex-1 text-sm font-medium truncate flex items-center gap-1.5"
                style={{ color: !isDefaultBlueColor(shelf.color) ? shelf.color : undefined }}
              >
                {shelf.icon === 'library' && <Library className="w-3.5 h-3.5" />}
                {shelf.icon === 'star' && <Star className="w-3.5 h-3.5" />}
                {shelf.icon === 'heart' && <Heart className="w-3.5 h-3.5" />}
                {shelf.icon === 'bookmark' && <Bookmark className="w-3.5 h-3.5" />}
                {shelf.icon === 'bookopen' && <BookOpen className="w-3.5 h-3.5" />}
                {shelf.icon === 'target' && <Target className="w-3.5 h-3.5" />}
                {(shelf.icon === 'sparkles' || shelf.icon === 'zap') && <Zap className="w-3.5 h-3.5" />}
                {shelf.icon === 'lightbulb' && <Lightbulb className="w-3.5 h-3.5" />}
                {shelf.icon === 'palette' && <Palette className="w-3.5 h-3.5" />}
                {shelf.icon === 'flame' && <Flame className="w-3.5 h-3.5" />}
                {shelf.name}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {shelf.bookCount}
              </span>
            </div>

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  onClick={(e) => e.stopPropagation()}
                  title="More options"
                  tabIndex={-1}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[180px] bg-popover text-popover-foreground backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl p-1.5 z-50 text-sm animate-in fade-in zoom-in-95 duration-200"
                  sideOffset={5}
                >
                  <DropdownMenu.Item
                    className="flex items-center px-3 py-2 rounded-lg cursor-pointer outline-none transition-all duration-150 select-none hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground text-foreground/90"
                    onSelect={() => onEdit(shelf)}
                  >
                    <Edit className="w-4 h-4 mr-2.5" />
                    <span className="font-medium tracking-tight">Edit Shelf</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="flex items-center px-3 py-2 rounded-lg cursor-pointer outline-none transition-all duration-150 select-none hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground text-foreground/90"
                    onSelect={() => onAddSubshelf(shelf.id!)}
                  >
                    <FolderPlus className="w-4 h-4 mr-2.5" />
                    <span className="font-medium tracking-tight">Add Subshelf</span>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="h-px bg-border/50 my-1.5 mx-1" />
                  <DropdownMenu.Item
                    className="flex items-center px-3 py-2 rounded-lg cursor-pointer outline-none transition-all duration-150 select-none hover:bg-destructive/15 focus:bg-destructive/15 text-destructive"
                    onSelect={() => onDelete(shelf)}
                  >
                    <Trash2 className="w-4 h-4 mr-2.5" />
                    <span className="font-medium tracking-tight">Delete Shelf</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="min-w-[180px] bg-popover text-popover-foreground backdrop-blur-md border border-border rounded-xl shadow-2xl p-1.5 z-50 text-sm animate-in fade-in zoom-in-95 duration-200"
            sideOffset={5}
          >
            <DropdownMenu.Item
              className="flex items-center px-3 py-2 rounded-lg cursor-pointer outline-none transition-all duration-150 select-none hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground text-foreground/90"
              onSelect={() => {
                onEdit(shelf);
                setContextMenuOpen(false);
              }}
            >
              <Edit className="w-4 h-4 mr-2.5" />
              <span className="font-medium tracking-tight">Edit Shelf</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="flex items-center px-3 py-2 rounded-lg cursor-pointer outline-none transition-all duration-150 select-none hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground text-foreground/90"
              onSelect={() => {
                onAddSubshelf(shelf.id!);
                setContextMenuOpen(false);
              }}
            >
              <FolderPlus className="w-4 h-4 mr-2.5" />
              <span className="font-medium tracking-tight">Add Subshelf</span>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="h-px bg-border/50 my-1.5 mx-1" />
            <DropdownMenu.Item
              className="flex items-center px-3 py-2 rounded-lg cursor-pointer outline-none transition-all duration-150 select-none hover:bg-destructive/15 focus:bg-destructive/15 text-destructive"
              onSelect={() => {
                onDelete(shelf);
                setContextMenuOpen(false);
              }}
            >
              <Trash2 className="w-4 h-4 mr-2.5" />
              <span className="font-medium tracking-tight">Delete Shelf</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {hasChildren && isExpanded && (
        <div>
          {shelf.children!.map((child) => (
            <ShelfItem
              key={child.id}
              shelf={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddSubshelf={onAddSubshelf}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface ShelfSidebarProps {
  onCreateShelf: (parentId?: number) => void;
  onEditShelf: (shelf: Shelf) => void;
}

export const ShelfSidebar = ({ onCreateShelf, onEditShelf }: ShelfSidebarProps) => {
  const shelves = useShelfStore(state => state.shelves) || [];
  const setShelfs = useShelfStore(state => state.setShelfs);
  const selectShelf = useShelfStore(state => state.selectShelf);
  const selectedShelf = useShelfStore(state => state.selectedShelf);
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritesShelf, setFavoritesShelf] = useState<Shelf | null>(null);
  const [localShelves, setLocalShelves] = useState<Shelf[]>([]);

  const loadSpecialShelfs = useCallback(async () => {
    try {
      const [favs, shelfList] = await Promise.all([
        api.getShelfsByType('favorites'),
        api.getShelfsByType('shelf'),
      ]);
      const favsArray = favs || [];
      const shelfListArray = shelfList || [];
      setFavoritesShelf(favsArray[0] || null);
      setLocalShelves(shelfListArray);
      setShelfs([...favsArray, ...shelfListArray]);
    } catch (error) {
       logger.error('Failed to load special shelves:', error);
     }
  }, []);

  const loadShelfs = useCallback(async () => {
    try {
      setLoading(true);
      const nested = await api.getNestedShelfs();
      setShelfs(nested);
      await loadSpecialShelfs();
     } catch (error) {
       logger.error('Failed to load shelves:', error);
     } finally {
       setLoading(false);
     }
  }, [setShelfs, loadSpecialShelfs]);

  useEffect(() => {
    loadShelfs();
  }, [loadShelfs]);

  const handleDelete = async (shelf: Shelf) => {
    if (!confirm(`Delete "${shelf.name}" and all its subshelves?`)) {
      return;
    }

    try {
      await api.deleteShelf(shelf.id!);
      await loadShelfs();
      selectShelf(null);
      toast.success('Shelf deleted', `"${shelf.name}" has been deleted`);
     } catch (error) {
       logger.error('Failed to delete shelf:', error);
       toast.error('Failed to delete shelf', 'An error occurred while deleting the shelf');
     }
  };

  const handleAddSubshelf = (parentId: number) => {
    onCreateShelf(parentId);
  };

  // Filter shelves recursively
  const filterShelfs = (shelves: Shelf[], query: string): Shelf[] => {
    if (!query.trim()) return shelves;

    const lowerQuery = query.toLowerCase();
    return shelves.reduce((acc: Shelf[], shelf) => {
      const matchesName = shelf.name.toLowerCase().includes(lowerQuery);
      const filteredChildren = shelf.children
        ? filterShelfs(shelf.children, query)
        : [];

      if (matchesName || filteredChildren.length > 0) {
        acc.push({
          ...shelf,
          children: filteredChildren.length > 0 ? filteredChildren : shelf.children,
        });
      }

      return acc;
    }, []);
  };

  const displayShelfs = filterShelfs(shelves || [], searchQuery) || [];
  const regularShelfs = displayShelfs.filter(
    c => c && (c.shelfType === 'regular' || !c.shelfType)
  );

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
        Loading shelves...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Shelves</h3>
        <button
          onClick={() => onCreateShelf()}
          className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md transition-colors"
          title="New Shelf"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Search Bar */}
      {shelves.length > 0 && (
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shelves..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-border/60 rounded-lg bg-muted/40 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/40 outline-none transition-all"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-2">
        {favoritesShelf && (
          <div
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors
              ${selectedShelf?.id === favoritesShelf.id
                ? 'bg-primary/15 text-primary font-semibold'
                : 'hover:bg-muted/60 text-foreground/90 hover:text-foreground'}
            `}
            onClick={() => selectShelf(favoritesShelf)}
          >
            <Heart className="w-4 h-4 text-red-500" fill="currentColor" />
            <span className="flex-1 text-sm font-medium">Favorites</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {favoritesShelf.bookCount}
            </span>
          </div>
        )}

        {(favoritesShelf || regularShelfs.length > 0) && (
          <div className="my-2 border-t border-border/50" />
        )}

        {regularShelfs.length === 0 && searchQuery ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-muted-foreground">
              No shelves match "{searchQuery}"
            </p>
          </div>
        ) : regularShelfs.length === 0 && !favoritesShelf && shelves.length === 0 ? (
          <div className="px-4 py-8 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-muted/60 border border-border/50 flex items-center justify-center mb-3 text-muted-foreground shadow-sm">
              <FolderPlus className="w-6 h-6" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground mb-3">
              No shelves yet
            </p>
            <button
              onClick={() => onCreateShelf()}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20 text-xs font-bold transition-all hover:scale-105 active:scale-95 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Create your first shelf
            </button>
          </div>
        ) : regularShelfs.length > 0 ? (
          <div className="space-y-0.5">
            {regularShelfs.map((shelf) => (
              <ShelfItem
                key={shelf.id}
                shelf={shelf}
                depth={0}
                onEdit={onEditShelf}
                onDelete={handleDelete}
                onAddSubshelf={handleAddSubshelf}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
