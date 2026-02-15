import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Folder, Sparkles } from 'lucide-react';
import { api, Collection, SmartRule } from '../../lib/tauri';
import { useCollectionStore } from '../../store/collectionStore';
import { SmartCollectionEditor } from './SmartCollectionEditor';

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editCollection?: Collection | null;
  parentId?: number;
}

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
];

const PRESET_ICONS = ['📚', '⭐', '❤️', '🔖', '📖', '🎯', '🌟', '💡', '🎨', '🔥'];

export const CreateCollectionDialog = ({
  open,
  onOpenChange,
  editCollection,
  parentId,
}: CreateCollectionDialogProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [icon, setIcon] = useState('');
  const [isSmart, setIsSmart] = useState(false);
  const [smartRules, setSmartRules] = useState<SmartRule[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [allCollections, setAllCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);

  const { addCollection, updateCollection } = useCollectionStore();

  useEffect(() => {
    if (open) {
      loadCollections();
      if (editCollection) {
        // Edit mode
        setName(editCollection.name);
        setDescription(editCollection.description || '');
        setColor(editCollection.color || PRESET_COLORS[0]);
        setIcon(editCollection.icon || '');
        setIsSmart(editCollection.is_smart);
        setSelectedParentId(editCollection.parent_id || null);
        
        // Parse smart rules if exists
        if (editCollection.smart_rules) {
          try {
            const rules = JSON.parse(editCollection.smart_rules);
            setSmartRules(rules);
          } catch (e) {
            console.error('Failed to parse smart rules:', e);
          }
        }
      } else {
        // Create mode
        resetForm();
        setSelectedParentId(parentId || null);
      }
    }
  }, [open, editCollection, parentId]);

  const loadCollections = async () => {
    try {
      const cols = await api.getCollections();
      setAllCollections(cols);
    } catch (error) {
      console.error('Failed to load collections:', error);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setColor(PRESET_COLORS[0]);
    setIcon('');
    setIsSmart(false);
    setSmartRules([]);
    setSelectedParentId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      alert('Collection name is required');
      return;
    }

    if (isSmart && smartRules.length === 0) {
      alert('Smart collections must have at least one rule');
      return;
    }

    setLoading(true);
    try {
      const collectionData = {
        name: name.trim(),
        description: description.trim() || null,
        parent_id: selectedParentId,
        is_smart: isSmart,
        smart_rules: isSmart ? JSON.stringify(smartRules) : null,
        icon: icon || null,
        color: color || null,
        sort_order: 0,
      };

      if (editCollection) {
        // Update existing collection
        const updated = await api.updateCollection(editCollection.id, collectionData);
        updateCollection(updated);
      } else {
        // Create new collection
        const created = await api.createCollection(collectionData);
        addCollection(created);
      }

      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error('Failed to save collection:', error);
      alert('Failed to save collection');
    } finally {
      setLoading(false);
    }
  };

  const getAvailableParentCollections = () => {
    if (!editCollection) return allCollections;
    // When editing, exclude self and descendants to prevent cycles
    return allCollections.filter(c => {
      if (c.id === editCollection.id) return false;
      // TODO: Also exclude descendants (would need recursive check)
      return true;
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto z-50">
          <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-xl font-semibold">
                {editCollection ? 'Edit Collection' : 'Create Collection'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Collection Type Toggle */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setIsSmart(false)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  !isSmart
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'
                }`}
              >
                <Folder className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-medium">Manual Collection</div>
                  <div className="text-xs text-gray-500">Add books manually</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setIsSmart(true)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  isSmart
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'
                }`}
              >
                <Sparkles className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-medium">Smart Collection</div>
                  <div className="text-xs text-gray-500">Auto-filter by rules</div>
                </div>
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Collection Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Science Fiction, Favorites, To Read"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
            </div>

            {/* Parent Collection */}
            <div>
              <label className="block text-sm font-medium mb-2">Parent Collection</label>
              <select
                value={selectedParentId || ''}
                onChange={(e) => setSelectedParentId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">None (Top Level)</option>
                {getAvailableParentCollections().map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Color Picker */}
            <div>
              <label className="block text-sm font-medium mb-2">Color</label>
              <div className="flex gap-2">
                {PRESET_COLORS.map((presetColor) => (
                  <button
                    key={presetColor}
                    type="button"
                    onClick={() => setColor(presetColor)}
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      color === presetColor ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: presetColor }}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded-full cursor-pointer"
                />
              </div>
            </div>

            {/* Icon Picker */}
            <div>
              <label className="block text-sm font-medium mb-2">Icon (Optional)</label>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIcon('')}
                  className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg transition-all ${
                    !icon
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'
                  }`}
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
                {PRESET_ICONS.map((presetIcon) => (
                  <button
                    key={presetIcon}
                    type="button"
                    onClick={() => setIcon(presetIcon)}
                    className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg transition-all ${
                      icon === presetIcon
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {presetIcon}
                  </button>
                ))}
              </div>
            </div>

            {/* Smart Collection Rules */}
            {isSmart && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Filter Rules <span className="text-red-500">*</span>
                </label>
                <SmartCollectionEditor rules={smartRules} onChange={setSmartRules} />
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Saving...' : editCollection ? 'Update Collection' : 'Create Collection'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
