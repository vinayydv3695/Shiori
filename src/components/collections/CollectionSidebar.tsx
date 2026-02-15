import { useEffect, useState } from 'react';
import { Folder, FolderOpen, Sparkles, MoreVertical, Plus, Trash2, Edit, FolderPlus, Search } from 'lucide-react';
import { useCollectionStore } from '../../store/collectionStore';
import { useToast } from '../../store/toastStore';
import { api, Collection } from '../../lib/tauri';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

interface CollectionItemProps {
  collection: Collection;
  depth: number;
  onEdit: (collection: Collection) => void;
  onDelete: (collection: Collection) => void;
  onAddSubcollection: (parentId: number) => void;
}

const CollectionItem = ({ collection, depth, onEdit, onDelete, onAddSubcollection }: CollectionItemProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const { selectedCollection, selectCollection } = useCollectionStore();
  const toast = useToast();
  const isSelected = selectedCollection?.id === collection.id;
  const hasChildren = collection.children && collection.children.length > 0;

  const handleClick = () => {
    selectCollection(collection);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't allow drops on smart collections
    if (collection.is_smart) {
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

    if (collection.is_smart) {
      return;
    }

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      
      if (data.type === 'book' && data.bookId) {
        await api.addBookToCollection(collection.id, data.bookId);
        
        toast.success(
          'Book added to collection',
          `"${data.bookTitle}" was added to "${collection.name}"`
        );
      } else if (data.type === 'books' && data.bookIds) {
        // Multi-select support
        await api.addBooksToCollection(collection.id, data.bookIds);
        
        toast.success(
          'Books added to collection',
          `${data.bookIds.length} books were added to "${collection.name}"`
        );
      }
    } catch (error) {
      console.error('Failed to add book to collection:', error);
      toast.error('Failed to add book', 'Could not add book to collection');
    }
  };

  return (
    <div>
      <div
        className={`
          flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer
          transition-colors group
          ${isSelected ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}
          ${isDragOver && !collection.is_smart ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/50' : ''}
          ${collection.is_smart ? 'opacity-75' : ''}
        `}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hasChildren && (
            <button
              onClick={handleToggle}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            >
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              ) : (
                <Folder className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              )}
            </button>
          )}
          {!hasChildren && (
            <Folder className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          )}
          {collection.is_smart && (
            <Sparkles className="w-3 h-3 text-purple-500" />
          )}
          <span
            className="flex-1 text-sm font-medium truncate"
            style={{ color: collection.color || undefined }}
          >
            {collection.icon && <span className="mr-1">{collection.icon}</span>}
            {collection.name}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            {collection.book_count}
          </span>
        </div>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[180px] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-1"
              sideOffset={5}
            >
              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-gray-700 outline-none"
                onSelect={() => onEdit(collection)}
              >
                <Edit className="w-4 h-4" />
                Edit Collection
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-gray-700 outline-none"
                onSelect={() => onAddSubcollection(collection.id)}
              >
                <FolderPlus className="w-4 h-4" />
                Add Subcollection
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 outline-none"
                onSelect={() => onDelete(collection)}
              >
                <Trash2 className="w-4 h-4" />
                Delete Collection
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {collection.children!.map((child) => (
            <CollectionItem
              key={child.id}
              collection={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddSubcollection={onAddSubcollection}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface CollectionSidebarProps {
  onCreateCollection: (parentId?: number) => void;
  onEditCollection: (collection: Collection) => void;
}

export const CollectionSidebar = ({ onCreateCollection, onEditCollection }: CollectionSidebarProps) => {
  const { collections, setCollections, selectCollection } = useCollectionStore();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadCollections = async () => {
    try {
      setLoading(true);
      const nested = await api.getNestedCollections();
      setCollections(nested);
    } catch (error) {
      console.error('Failed to load collections:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollections();
  }, []);

  const handleDelete = async (collection: Collection) => {
    if (!confirm(`Delete "${collection.name}" and all its subcollections?`)) {
      return;
    }

    try {
      await api.deleteCollection(collection.id);
      await loadCollections();
      selectCollection(null);
      toast.success('Collection deleted', `"${collection.name}" has been deleted`);
    } catch (error) {
      console.error('Failed to delete collection:', error);
      toast.error('Failed to delete collection', 'An error occurred while deleting the collection');
    }
  };

  const handleAddSubcollection = (parentId: number) => {
    onCreateCollection(parentId);
  };

  // Filter collections recursively
  const filterCollections = (collections: Collection[], query: string): Collection[] => {
    if (!query.trim()) return collections;
    
    const lowerQuery = query.toLowerCase();
    return collections.reduce((acc: Collection[], collection) => {
      const matchesName = collection.name.toLowerCase().includes(lowerQuery);
      const filteredChildren = collection.children 
        ? filterCollections(collection.children, query)
        : [];
      
      if (matchesName || filteredChildren.length > 0) {
        acc.push({
          ...collection,
          children: filteredChildren.length > 0 ? filteredChildren : collection.children,
        });
      }
      
      return acc;
    }, []);
  };

  const displayCollections = filterCollections(collections, searchQuery);

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
        Loading collections...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Collections</h3>
        <button
          onClick={() => onCreateCollection()}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="New Collection"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Search Bar */}
      {collections.length > 0 && (
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search collections..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-2">
        {displayCollections.length === 0 && searchQuery ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No collections match "{searchQuery}"
            </p>
          </div>
        ) : displayCollections.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <Folder className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              No collections yet
            </p>
            <button
              onClick={() => onCreateCollection()}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Create your first collection
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {displayCollections.map((collection) => (
              <CollectionItem
                key={collection.id}
                collection={collection}
                depth={0}
                onEdit={onEditCollection}
                onDelete={handleDelete}
                onAddSubcollection={handleAddSubcollection}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
