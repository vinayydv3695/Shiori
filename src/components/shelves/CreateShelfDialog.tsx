import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Sparkles, BookMarked, Loader2, Library, Star, Heart, Bookmark, BookOpen, Target, Lightbulb, Palette, Flame, FolderOpen } from 'lucide-react';
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

const PRESET_ICONS = [
  { id: 'library', icon: Library },
  { id: 'star', icon: Star },
  { id: 'heart', icon: Heart },
  { id: 'bookmark', icon: Bookmark },
  { id: 'bookopen', icon: BookOpen },
  { id: 'target', icon: Target },
  { id: 'sparkles', icon: Sparkles },
  { id: 'lightbulb', icon: Lightbulb },
  { id: 'palette', icon: Palette },
  { id: 'flame', icon: Flame },
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
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[200] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content 
          aria-describedby={undefined} 
          className="fixed left-[50%] top-[50%] z-[200] w-[95vw] max-w-[800px] translate-x-[-50%] translate-y-[-50%] bg-background/95 backdrop-blur-2xl p-6 md:p-10 shadow-2xl border border-border rounded-3xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-8">
            <Dialog.Title className="text-2xl font-bold tracking-tight text-foreground">
              {editShelf ? 'Edit Shelf' : 'Create Shelf'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-10 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
              {/* Left Column: Text Inputs */}
              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-foreground ml-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setErrors(prev => ({ ...prev, name: undefined }));
                    }}
                    className={cn(
                      "flex w-full rounded-2xl bg-muted/50 border px-5 py-4 text-base text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/50",
                      errors.name ? "border-destructive/50 bg-destructive/10" : "border-border hover:border-primary/50 hover:bg-muted"
                    )}
                    placeholder="e.g. Science Fiction"
                    required
                  />
                  {errors.name && <p className="text-xs text-destructive ml-1">{errors.name}</p>}
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold text-foreground ml-1">Description (Optional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="flex min-h-[140px] w-full rounded-2xl bg-muted/50 border border-border px-5 py-4 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/50 hover:border-primary/50 hover:bg-muted resize-none leading-relaxed"
                    placeholder="What's this shelf about?"
                  />
                </div>
              </div>

              {/* Right Column: Selectors */}
              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-foreground ml-1">Parent Shelf (Optional)</label>
                  <Select
                    value={selectedParentId ? String(selectedParentId) : 'none'}
                    onValueChange={(val) => setSelectedParentId(val === 'none' ? null : Number(val))}
                  >
                    <SelectTrigger className="w-full h-12 rounded-2xl px-5">
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

                <div className="space-y-3">
                  <label className="text-sm font-semibold text-foreground ml-1">Content Type</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'mixed', label: 'Mixed', icon: FolderOpen },
                      { id: 'books', label: 'Books', icon: BookMarked },
                      { id: 'manga', label: 'Manga', icon: Sparkles }
                    ].map(type => {
                      const Icon = type.icon;
                      const isActive = shelfType === type.id || (type.id === 'mixed' && shelfType === 'regular');
                      return (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setShelfType(type.id as any)}
                          className={cn(
                            "flex flex-col items-center justify-center gap-2.5 py-4 rounded-2xl border text-xs font-medium transition-all duration-300",
                            isActive 
                              ? "bg-primary text-primary-foreground border-primary shadow-md" 
                              : "bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <Icon className={cn("w-5 h-5 transition-transform duration-300", isActive ? "scale-110" : "")} />
                          {type.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Theme Color */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-foreground ml-1">Color Theme</label>
                  <div className="flex flex-wrap gap-3">
                    {PRESET_COLORS.map((presetColor) => (
                      <button
                        key={presetColor}
                        type="button"
                        onClick={() => setColor(presetColor)}
                        className={cn(
                          "w-9 h-9 rounded-full transition-all duration-300 outline-none ring-offset-background",
                          color === presetColor ? "ring-2 ring-foreground ring-offset-2 scale-110 shadow-lg" : "opacity-40 hover:opacity-100 hover:scale-110 hover:ring-2 hover:ring-foreground/30 hover:ring-offset-2"
                        )}
                        style={{ backgroundColor: presetColor, boxShadow: color === presetColor ? `0 0 20px ${presetColor}60` : 'none' }}
                      />
                    ))}
                  </div>
                </div>

                {/* SVG Icon Picker */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-foreground ml-1">Icon Symbol</label>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIcon('')}
                      className={cn(
                        "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 border",
                        !icon ? "bg-primary border-primary text-primary-foreground shadow-lg" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <X className="w-5 h-5" />
                    </button>
                    {PRESET_ICONS.map((preset) => {
                      const IconComponent = preset.icon;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setIcon(preset.id)}
                          className={cn(
                            "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 border",
                            icon === preset.id ? "bg-primary border-primary text-primary-foreground shadow-lg" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <IconComponent className="w-5 h-5" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-6 mt-4 border-t border-border/50">
              <button
                type="submit"
                disabled={loading}
                className="w-full md:w-auto px-8 py-3 text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
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
