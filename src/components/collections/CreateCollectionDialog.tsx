import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Folder, Sparkles, BookMarked, Loader2 } from 'lucide-react';
import { api, Collection, SmartRule } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import { useCollectionStore } from '../../store/collectionStore';
import { SmartCollectionEditor } from './SmartCollectionEditor';
import { useToast } from '@/store/toastStore';

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
  const [collectionType, setCollectionType] = useState<'regular' | 'shelf'>('regular');
  const [smartRules, setSmartRules] = useState<SmartRule[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [allCollections, setAllCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; rules?: string }>({});
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const toast = useToast();

  const addCollection = useCollectionStore(state => state.addCollection);
  const updateCollection = useCollectionStore(state => state.updateCollection);

  useEffect(() => {
    if (open) {
      loadCollections();
      if (editCollection) {
        // Edit mode
        setName(editCollection.name);
        setDescription(editCollection.description || '');
        setColor(editCollection.color || PRESET_COLORS[0]);
        setIcon(editCollection.icon || '');
        setIsSmart(editCollection.isSmart);
        setCollectionType(
          editCollection.collectionType === 'shelf' ? 'shelf' : 'regular'
        );
        setSelectedParentId(editCollection.parentId || null);

        // Parse smart rules if exists
        if (editCollection.smartRules) {
          try {
            const rules = JSON.parse(editCollection.smartRules);
            setSmartRules(rules);
           } catch (e) {
             logger.error('Failed to parse smart rules:', e);
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
       logger.error('Failed to load collections:', error);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setColor(PRESET_COLORS[0]);
    setIcon('');
    setIsSmart(false);
    setCollectionType('regular');
    setSmartRules([]);
    setSelectedParentId(null);
    setErrors({});
    setPreviewCount(null);
  };

  const updatePreview = async (rules: SmartRule[]) => {
    if (rules.length === 0) {
      setPreviewCount(null);
      return;
    }

    setPreviewLoading(true);
    try {
      const count = await api.previewSmartCollection(JSON.stringify(rules));
      setPreviewCount(count);
    } catch (error) {
      logger.error('Failed to preview smart collection:', error);
      setPreviewCount(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!name.trim()) newErrors.name = "Collection name is required";
    if (isSmart && smartRules.length === 0) {
      newErrors.rules = "Smart collections must have at least one rule";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

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
        collection_type: collectionType,
      };

      if (editCollection && editCollection.id !== undefined) {
        // Update existing collection
        const updated = await api.updateCollection(editCollection.id, collectionData);
        updateCollection(editCollection.id, updated);
      } else {
        // Create new collection
        const created = await api.createCollection(collectionData);
        addCollection(created);
      }

      onOpenChange(false);
      resetForm();
    } catch (error) {
      logger.error('Failed to save collection:', error);
      toast.error('Failed to save collection', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getAvailableParentCollections = () => {
    if (!editCollection) return allCollections;
    
    // When editing, exclude self and descendants to prevent cycles
    const excludedIds = new Set<number>([editCollection.id!]);
    
    // Recursively find all descendants
    const findDescendants = (parentId: number) => {
      allCollections.forEach(c => {
        if (c.parentId === parentId && !excludedIds.has(c.id!)) {
          excludedIds.add(c.id!);
          findDescendants(c.id!);
        }
      });
    };
    
    findDescendants(editCollection.id!);
    
    return allCollections.filter(c => !excludedIds.has(c.id!));
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card/40 backdrop-blur-2xl border border-border/50 rounded-[2rem] shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-500 custom-scrollbar">
          <div className="sticky top-0 bg-transparent backdrop-blur-xl border-b border-border/50 px-8 py-6 z-10 flex items-center justify-between">
            <Dialog.Title className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3">
              {editCollection ? 'Edit Collection' : 'Create Collection'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2.5 bg-card/40 hover:bg-card/80 border border-border/50 rounded-2xl transition-all duration-300 text-muted-foreground hover:text-foreground" title="Close">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-8">
            {/* Collection Type Toggle */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setIsSmart(false)}
                className={`group flex-1 flex flex-col items-center text-center gap-6 px-6 py-8 rounded-3xl border transition-all duration-500 relative overflow-hidden ${!isSmart
                  ? 'border-blue-500/50 bg-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.15)]'
                  : 'border-border/50 bg-card/40 backdrop-blur-md hover:border-blue-500/50 hover:bg-card/60'
                  }`}
              >
                <div className={`absolute top-0 right-0 w-32 h-32 opacity-20 bg-gradient-to-bl from-blue-500 to-transparent rounded-bl-full -z-10 transition-transform duration-700 ${!isSmart ? 'scale-150' : 'group-hover:scale-150'}`} />
                <div className={`p-4 rounded-2xl shadow-sm transition-transform duration-500 ${!isSmart ? 'bg-background/80 scale-110 text-blue-500' : 'bg-background/50 text-muted-foreground group-hover:text-blue-500 group-hover:scale-110'}`}>
                  <Folder className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <div className="text-lg font-bold text-foreground">Manual</div>
                  <div className="text-sm text-muted-foreground">Add books manually</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setIsSmart(true)}
                className={`group flex-1 flex flex-col items-center text-center gap-6 px-6 py-8 rounded-3xl border transition-all duration-500 relative overflow-hidden ${isSmart
                  ? 'border-purple-500/50 bg-purple-500/10 shadow-[0_0_30px_rgba(168,85,247,0.15)]'
                  : 'border-border/50 bg-card/40 backdrop-blur-md hover:border-purple-500/50 hover:bg-card/60'
                  }`}
              >
                <div className={`absolute top-0 right-0 w-32 h-32 opacity-20 bg-gradient-to-bl from-purple-500 to-transparent rounded-bl-full -z-10 transition-transform duration-700 ${isSmart ? 'scale-150' : 'group-hover:scale-150'}`} />
                <div className={`p-4 rounded-2xl shadow-sm transition-transform duration-500 ${isSmart ? 'bg-background/80 scale-110 text-purple-500' : 'bg-background/50 text-muted-foreground group-hover:text-purple-500 group-hover:scale-110'}`}>
                  <Sparkles className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <div className="text-lg font-bold text-foreground">Smart</div>
                  <div className="text-sm text-muted-foreground">Auto-filter by rules</div>
                </div>
              </button>
            </div>

            {/* Collection Type (Regular vs Shelf) */}
            <AnimatePresence>
              {!isSmart && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }} 
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2">
                    <label className="block text-sm font-semibold text-foreground tracking-tight mb-3">Structure Type</label>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setCollectionType('regular')}
                        className={`group flex-1 flex items-center justify-center gap-3 px-5 py-4 rounded-2xl border transition-all duration-300 ${collectionType === 'regular'
                          ? 'border-primary/50 bg-primary/10 text-primary shadow-inner shadow-primary/5'
                          : 'border-border/50 bg-card/40 backdrop-blur-md hover:bg-card/60 hover:border-primary/30 text-muted-foreground'
                          }`}
                      >
                        <Folder className={`w-4 h-4 transition-transform duration-300 ${collectionType === 'regular' ? 'scale-110' : 'group-hover:scale-110'}`} />
                        <span className="text-sm font-bold">Standard</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCollectionType('shelf')}
                        className={`group flex-1 flex items-center justify-center gap-3 px-5 py-4 rounded-2xl border transition-all duration-300 ${collectionType === 'shelf'
                          ? 'border-amber-500/50 bg-amber-500/10 text-amber-500 shadow-inner shadow-amber-500/5'
                          : 'border-border/50 bg-card/40 backdrop-blur-md hover:bg-card/60 hover:border-amber-500/30 text-muted-foreground'
                          }`}
                      >
                        <BookMarked className={`w-4 h-4 transition-transform duration-300 ${collectionType === 'shelf' ? 'scale-110' : 'group-hover:scale-110'}`} />
                        <span className="text-sm font-bold">Bookshelf</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-6 bg-card/40 backdrop-blur-md p-6 rounded-3xl border border-border/50 shadow-sm transition-all duration-500 hover:border-primary/20">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-foreground tracking-tight mb-2">
                  Collection Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative group">
                  <div className={`absolute inset-0 bg-primary/5 blur-md rounded-2xl transition-colors ${errors.name ? 'bg-rose-500/5' : 'group-hover:bg-primary/10'}`} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setErrors(prev => ({ ...prev, name: undefined }));
                    }}
                    placeholder="e.g., Science Fiction, Favorites, To Read"
                    className={`relative w-full px-5 py-4 rounded-2xl bg-background/50 backdrop-blur-md border outline-none transition-all placeholder:text-muted-foreground/50 text-foreground font-medium ${
                      errors.name 
                        ? 'border-rose-500/50 focus:ring-2 focus:ring-rose-500/30' 
                        : 'border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 hover:border-primary/30'
                    }`}
                    required
                  />
                </div>
                {errors.name && <p className="text-xs text-rose-500 mt-2 font-bold flex items-center gap-1.5"><X className="w-3.5 h-3.5"/> {errors.name}</p>}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-foreground tracking-tight mb-2">
                  Description <span className="text-muted-foreground font-normal ml-1">(Optional)</span>
                </label>
                <div className="relative group">
                  <div className="absolute inset-0 bg-primary/5 blur-md rounded-2xl transition-colors group-hover:bg-primary/10" />
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's this collection about?"
                    rows={2}
                    className="relative w-full px-5 py-4 rounded-2xl bg-background/50 backdrop-blur-md border border-border/50 outline-none transition-all placeholder:text-muted-foreground/50 text-foreground font-medium focus:border-primary/50 focus:ring-2 focus:ring-primary/20 hover:border-primary/30 resize-none"
                  />
                </div>
              </div>

              {/* Parent Collection */}
              <div>
                <label className="block text-sm font-semibold text-foreground tracking-tight mb-2">Parent Collection</label>
                <div className="relative group">
                  <div className="absolute inset-0 bg-primary/5 blur-md rounded-2xl transition-colors group-hover:bg-primary/10" />
                  <select
                    value={selectedParentId || ''}
                    onChange={(e) => setSelectedParentId(e.target.value ? Number(e.target.value) : null)}
                    className="relative w-full px-5 py-4 rounded-2xl bg-background/50 backdrop-blur-md border border-border/50 outline-none transition-all text-foreground font-medium focus:border-primary/50 focus:ring-2 focus:ring-primary/20 hover:border-primary/30 appearance-none cursor-pointer"
                  >
                    <option value="">None (Top Level)</option>
                    {getAvailableParentCollections().map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground transition-transform group-hover:translate-y-[-40%]">
                    <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 bg-card/40 backdrop-blur-md p-6 rounded-3xl border border-border/50 shadow-sm transition-all duration-500 hover:border-primary/20">
              {/* Color Picker */}
              <div>
                <label className="block text-sm font-semibold text-foreground tracking-tight mb-4">Theme Color</label>
                <div className="flex gap-3 items-center flex-wrap">
                  {PRESET_COLORS.map((presetColor) => (
                    <button
                      key={presetColor}
                      type="button"
                      onClick={() => setColor(presetColor)}
                      className={`relative w-8 h-8 rounded-full border-2 transition-all duration-300 hover:scale-110 group ${color === presetColor ? 'border-foreground scale-110 shadow-md' : 'border-transparent opacity-60 hover:opacity-100 hover:shadow-sm'
                        }`}
                      style={{ backgroundColor: presetColor }}
                    >
                      {color === presetColor && (
                        <div className="absolute inset-0 rounded-full ring-4 ring-current opacity-20 pointer-events-none" style={{ color: presetColor }} />
                      )}
                    </button>
                  ))}
                  <div className="w-[2px] h-6 bg-border mx-1.5 rounded-full" />
                  <div className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-transparent hover:border-foreground/50 transition-all cursor-pointer shadow-sm hover:shadow-md hover:scale-110 duration-300">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="absolute -inset-4 w-16 h-16 cursor-pointer opacity-0"
                    />
                    <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: color }} />
                  </div>
                </div>
              </div>

              {/* Icon Picker */}
              <div>
                <label className="block text-sm font-semibold text-foreground tracking-tight mb-4">Icon</label>
                <div className="flex gap-2.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setIcon('')}
                    className={`w-11 h-11 rounded-2xl border transition-all duration-300 flex items-center justify-center text-lg shadow-sm ${!icon
                      ? 'border-primary/50 bg-primary/10 text-primary scale-105 shadow-primary/20'
                      : 'border-border/50 bg-background/50 hover:bg-card hover:border-primary/30 text-muted-foreground opacity-60 hover:opacity-100'
                      }`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                  {PRESET_ICONS.slice(0, 6).map((presetIcon) => (
                    <button
                      key={presetIcon}
                      type="button"
                      onClick={() => setIcon(presetIcon)}
                      className={`w-11 h-11 rounded-2xl border transition-all duration-300 flex items-center justify-center text-xl shadow-sm ${icon === presetIcon
                        ? 'border-primary/50 bg-primary/10 text-primary scale-110 shadow-primary/20'
                        : 'border-border/50 bg-background/50 hover:bg-card hover:border-primary/30 opacity-60 hover:opacity-100 hover:scale-105'
                        }`}
                    >
                      {presetIcon}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Smart Collection Rules */}
            <AnimatePresence>
              {isSmart && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }} 
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="pt-2">
                    <label className="block text-sm font-semibold text-foreground tracking-tight mb-3">
                      Filter Rules <span className="text-rose-500">*</span>
                    </label>
                    <div className={`transition-all duration-300 ${errors.rules ? 'ring-2 ring-rose-500/50 rounded-2xl' : ''}`}>
                      <SmartCollectionEditor 
                        rules={smartRules} 
                        onChange={(rules) => {
                          setSmartRules(rules);
                          setErrors(prev => ({ ...prev, rules: undefined }));
                          updatePreview(rules);
                        }} 
                      />
                    </div>
                    {errors.rules && <p className="text-xs text-rose-500 mt-3 font-bold flex items-center gap-1.5"><X className="w-3.5 h-3.5"/> {errors.rules}</p>}
                    
                    {previewLoading && (
                      <div className="mt-5 px-6 py-4 bg-primary/5 backdrop-blur-md border border-primary/20 rounded-2xl flex items-center gap-4 shadow-sm">
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        <p className="text-sm font-bold text-primary">Calculating library preview...</p>
                      </div>
                    )}
                    
                    {!previewLoading && previewCount !== null && (
                      <div className="mt-5 px-6 py-4 bg-primary/5 backdrop-blur-md border border-primary/20 rounded-2xl flex items-center gap-4 shadow-inner shadow-primary/5">
                        <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          This smart collection currently matches <strong className="text-primary text-lg ml-1 mr-1">{previewCount}</strong> {previewCount === 1 ? 'book' : 'books'}
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-8 border-t border-border/50">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-6 py-3 bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl hover:bg-card/80 transition-all duration-300 font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-[0_0_20px_rgba(var(--primary),0.2)] hover:shadow-[0_0_30px_rgba(var(--primary),0.4)] transition-all duration-300 font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                {loading ? 'Saving...' : editCollection ? 'Update Collection' : 'Create Collection'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
