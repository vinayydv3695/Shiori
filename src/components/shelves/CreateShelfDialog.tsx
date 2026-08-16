import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Zap, ImageIcon, BookMarked, Loader2, Library, Star, Heart, Bookmark, BookOpen, Target, Lightbulb, Palette, Flame, FolderOpen, Sparkles } from 'lucide-react';
import { api, Shelf } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import { useShelfStore } from '../../store/shelfStore';
import { useToast } from '@/store/toastStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface CreateShelfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editShelf?: Shelf | null;
  parentId?: number | null;
}

const PRESET_COLORS = [
  '#3b82f6', // blue (default)
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

const PRESET_ICONS = [
  { id: 'library', icon: Library },
  { id: 'star', icon: Star },
  { id: 'heart', icon: Heart },
  { id: 'bookmark', icon: Bookmark },
  { id: 'bookopen', icon: BookOpen },
  { id: 'target', icon: Target },
  { id: 'zap', icon: Zap },
  { id: 'lightbulb', icon: Lightbulb },
  { id: 'palette', icon: Palette },
  { id: 'flame', icon: Flame },
];

const SHELF_TEMPLATES = [
  {
    name: 'Currently Reading',
    description: 'Books and manga I am actively reading',
    color: '#3b82f6',
    icon: 'bookopen',
    shelfType: 'mixed' as const,
  },
  {
    name: 'Top Favorites',
    description: 'My highest rated stories and all-time favorites',
    color: '#f59e0b',
    icon: 'star',
    shelfType: 'mixed' as const,
  },
  {
    name: 'Manga & Comics',
    description: 'Manga series, comics, and graphic novels',
    color: '#ef4444',
    icon: 'library',
    shelfType: 'manga' as const,
  },
  {
    name: 'Novels & Fiction',
    description: 'Literature, light novels, and EPUBs',
    color: '#06b6d4',
    icon: 'bookmark',
    shelfType: 'books' as const,
  },
  {
    name: 'Plan to Read',
    description: 'My reading backlog and upcoming reading goals',
    color: '#8b5cf6',
    icon: 'target',
    shelfType: 'mixed' as const,
  },
];

export const CreateShelfDialog = ({
  open,
  onOpenChange,
  editShelf,
  parentId,
}: CreateShelfDialogProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [icon, setIcon] = useState('');
  const [shelfType, setShelfType] = useState<'regular' | 'books' | 'manga' | 'mixed' | 'shelf'>('regular');
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [allShelfs, setAllShelfs] = useState<Shelf[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string }>({});

  const toast = useToast();

  const addShelf = useShelfStore(state => state.addShelf);
  const updateShelf = useShelfStore(state => state.updateShelf);

  useEffect(() => {
    if (open) {
      loadShelfs();
      
      if (editShelf) {
        setName(editShelf.name);
        setDescription(editShelf.description || '');
        setColor(editShelf.color || PRESET_COLORS[0]);
        setIcon(editShelf.icon || '');
        setShelfType((editShelf.shelfType as any) || 'regular');
        setSelectedParentId(editShelf.parentId || null);
      } else {
        resetForm();
        setSelectedParentId(parentId || null);
      }
    }
  }, [open, editShelf, parentId]);

  const loadShelfs = async () => {
    try {
      const cols = await api.getShelfs();
      setAllShelfs(cols || []);
    } catch (error) {
      logger.error('Failed to load shelves:', error);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setColor(PRESET_COLORS[0]);
    setIcon('');
    setShelfType('regular');
    setSelectedParentId(null);
    setErrors({});
  };

  const handleApplyTemplate = (template: typeof SHELF_TEMPLATES[0]) => {
    setName(template.name);
    setDescription(template.description);
    setColor(template.color);
    setIcon(template.icon);
    setShelfType(template.shelfType);
    setErrors({});
  };

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!name.trim()) newErrors.name = "Required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const shelfData = {
        name: name.trim(),
        description: description.trim() || null,
        parent_id: selectedParentId,
        is_smart: false,
        smart_rules: null,
        icon: icon || null,
        color: color || null,
        shelf_type: shelfType,
      };

      if (editShelf && editShelf.id !== undefined) {
        const updated = await api.updateShelf(editShelf.id, shelfData);
        updateShelf(editShelf.id, updated);
      } else {
        const created = await api.createShelf(shelfData);
        addShelf(created);
      }

      onOpenChange(false);
      resetForm();
    } catch (error) {
      logger.error('Failed to save shelf:', error);
      toast.error('Failed to save shelf', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getAvailableParentShelfs = () => {
    const safeShelfs = Array.isArray(allShelfs) ? allShelfs : [];
    if (!editShelf) return safeShelfs;
    const excludedIds = new Set<number>([editShelf.id!]);
    const findDescendants = (parentId: number) => {
      safeShelfs.forEach(c => {
        if (c.parentId === parentId && !excludedIds.has(c.id!)) {
          excludedIds.add(c.id!);
          findDescendants(c.id!);
        }
      });
    };
    findDescendants(editShelf.id!);
    return safeShelfs.filter(c => !excludedIds.has(c.id!));
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[200] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content 
          aria-describedby={undefined} 
          className="fixed left-[50%] top-[50%] z-[200] w-[95vw] max-w-[800px] translate-x-[-50%] translate-y-[-50%] bg-background/95 backdrop-blur-2xl p-6 md:p-10 shadow-2xl border border-border rounded-3xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-2xl font-bold tracking-tight text-foreground">
              {editShelf ? 'Edit Shelf' : 'Create Shelf'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer">
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </button>
            </Dialog.Close>
          </div>

          {/* Quick Presets (Only when creating a new shelf) */}
          {!editShelf && (
            <div className="mb-6 pb-6 border-b border-border/50">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" /> Quick Presets
              </p>
              <div className="flex flex-wrap gap-2">
                {SHELF_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.name}
                    type="button"
                    onClick={() => handleApplyTemplate(tmpl)}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-secondary/80 hover:bg-secondary text-foreground border border-border/50 shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tmpl.color }} />
                    <span>{tmpl.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
              {/* Left Column: Text Inputs */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground ml-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setErrors(prev => ({ ...prev, name: undefined }));
                    }}
                    className={cn(
                      "flex w-full rounded-2xl bg-muted/50 border px-4 py-3 text-sm sm:text-base text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/50",
                      errors.name ? "border-destructive/50 bg-destructive/10" : "border-border hover:border-primary/50 hover:bg-muted"
                    )}
                    placeholder="e.g. Science Fiction"
                    required
                  />
                  {errors.name && <p className="text-xs text-destructive ml-1">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground ml-1">Description (Optional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="flex min-h-[120px] w-full rounded-2xl bg-muted/50 border border-border px-4 py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/50 hover:border-primary/50 hover:bg-muted resize-none leading-relaxed"
                    placeholder="What's this shelf about?"
                  />
                </div>
              </div>

              {/* Right Column: Selectors */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground ml-1">Parent Shelf (Optional)</label>
                  <Select
                    value={selectedParentId ? String(selectedParentId) : 'none'}
                    onValueChange={(val) => setSelectedParentId(val === 'none' ? null : Number(val))}
                  >
                    <SelectTrigger className="w-full h-11 rounded-2xl px-4 text-xs sm:text-sm">
                      <SelectValue placeholder="None (Top Level)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (Top Level)</SelectItem>
                      {getAvailableParentShelfs().map((col) => (
                        <SelectItem key={col.id} value={String(col.id)}>{col.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground ml-1">Content Type</label>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {[
                      { id: 'mixed', label: 'Mixed', icon: FolderOpen },
                      { id: 'books', label: 'Books', icon: BookMarked },
                      { id: 'manga', label: 'Manga', icon: ImageIcon }
                    ].map(type => {
                      const Icon = type.icon;
                      const isActive = shelfType === type.id || (type.id === 'mixed' && shelfType === 'regular');
                      return (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setShelfType(type.id as any)}
                          className={cn(
                            "flex flex-col items-center justify-center gap-2 py-3 rounded-2xl border text-xs font-semibold transition-all duration-300 cursor-pointer",
                            isActive 
                              ? "bg-primary text-primary-foreground border-primary shadow-md" 
                              : "bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <Icon className={cn("w-4 h-4 transition-transform duration-300", isActive ? "scale-110" : "")} />
                          {type.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Theme Color */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground ml-1">Color Theme</label>
                  <div className="flex flex-wrap gap-2.5">
                    {PRESET_COLORS.map((presetColor) => (
                      <button
                        key={presetColor}
                        type="button"
                        onClick={() => setColor(presetColor)}
                        className={cn(
                          "w-8 h-8 rounded-full transition-all duration-300 outline-none ring-offset-background cursor-pointer",
                          color === presetColor ? "ring-2 ring-foreground ring-offset-2 scale-110 shadow-lg" : "opacity-40 hover:opacity-100 hover:scale-110 hover:ring-2 hover:ring-foreground/30 hover:ring-offset-2"
                        )}
                        style={{ backgroundColor: presetColor, boxShadow: color === presetColor ? `0 0 20px ${presetColor}60` : 'none' }}
                      />
                    ))}
                  </div>
                </div>

                {/* SVG Icon Picker */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground ml-1">Icon Symbol</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setIcon('')}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 border cursor-pointer",
                        !icon ? "bg-primary border-primary text-primary-foreground shadow-lg" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    {PRESET_ICONS.map((preset) => {
                      const IconComponent = preset.icon;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setIcon(preset.id)}
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 border cursor-pointer",
                            icon === preset.id ? "bg-primary border-primary text-primary-foreground shadow-lg" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <IconComponent className="w-4 h-4" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-border/50">
              <button
                type="submit"
                disabled={loading}
                className="w-full md:w-auto px-8 py-3 text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-md"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Saving...' : editShelf ? 'Update Shelf' : 'Create Shelf'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
