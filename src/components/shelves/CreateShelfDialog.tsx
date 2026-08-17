import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Loader2,
  BookOpen,
  FolderOpen,
  Star,
  Layers,
  BookMarked,
} from 'lucide-react';
import { api, Shelf } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import { useShelfStore } from '../../store/shelfStore';
import { useToast } from '@/store/toastStore';
import { cn } from '@/lib/utils';
import { IconManga } from '@/components/icons/ShioriIcons';

interface CreateShelfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editShelf?: Shelf | null;
  parentId?: number | null;
}

const ESSENTIAL_ICONS = [
  { id: 'bookopen', icon: BookOpen, label: 'Books' },
  { id: 'folder', icon: FolderOpen, label: 'Shelf' },
  { id: 'star', icon: Star, label: 'Favorites' },
];

export const CreateShelfDialog = ({
  open,
  onOpenChange,
  editShelf,
  parentId,
}: CreateShelfDialogProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('bookopen');
  const [shelfType, setShelfType] = useState<'regular' | 'books' | 'manga' | 'mixed' | 'shelf'>('mixed');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string }>({});

  const toast = useToast();
  const addShelf = useShelfStore((state) => state.addShelf);
  const updateShelf = useShelfStore((state) => state.updateShelf);

  useEffect(() => {
    if (open) {
      if (editShelf) {
        setName(editShelf.name);
        setDescription(editShelf.description || '');
        setIcon(editShelf.icon || 'bookopen');
        setShelfType((editShelf.shelfType as any) || 'mixed');
      } else {
        resetForm();
      }
    }
  }, [open, editShelf]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setIcon('bookopen');
    setShelfType('mixed');
    setErrors({});
  };

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!name.trim()) newErrors.name = 'Please enter a shelf name';
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
        parent_id: parentId ?? null,
        is_smart: false,
        smart_rules: null,
        icon: icon || null,
        color: null,
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

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-[50%] top-[50%] z-[200] w-[90vw] max-w-[420px] translate-x-[-50%] translate-y-[-50%] bg-card/95 backdrop-blur-2xl p-6 shadow-2xl border border-border/60 rounded-3xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-border/40">
            <div>
              <Dialog.Title className="text-lg font-bold tracking-tight text-foreground">
                {editShelf ? 'Edit Shelf' : 'New Shelf'}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-3">
            {/* Shelf Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder="e.g. Favorites, Science Fiction"
                className={cn(
                  'w-full h-11 rounded-2xl bg-secondary/60 hover:bg-secondary/80 focus:bg-background border px-3.5 text-sm font-semibold text-foreground placeholder:text-muted-foreground/60 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40',
                  errors.name ? 'border-destructive bg-destructive/10' : 'border-border/60'
                )}
                autoFocus
              />
              {errors.name && <p className="text-[11px] font-medium text-destructive ml-1">{errors.name}</p>}
            </div>

            {/* Icon Selection (3 Essential Icons) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Icon</label>
              <div className="grid grid-cols-3 gap-2">
                {ESSENTIAL_ICONS.map((item) => {
                  const IconComponent = item.icon;
                  const isSelected = icon === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setIcon(item.id)}
                      className={cn(
                        'flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl border text-xs font-bold transition-all duration-200 cursor-pointer select-none',
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary shadow-xs scale-[1.02]'
                          : 'bg-secondary/50 border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
                      )}
                    >
                      <IconComponent className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content Type Segmented Switcher */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Type</label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-secondary/60 border border-border/50 rounded-2xl">
                {[
                  { id: 'mixed', label: 'All Items', icon: Layers },
                  { id: 'books', label: 'Books', icon: BookMarked },
                  { id: 'manga', label: 'Manga', icon: IconManga },
                ].map((type) => {
                  const IconComp = type.icon;
                  const isActive =
                    shelfType === type.id || (type.id === 'mixed' && shelfType === 'regular');
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setShelfType(type.id as any)}
                      className={cn(
                        'flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer select-none',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-xs scale-[1.02]'
                          : 'text-muted-foreground hover:text-foreground hover:bg-card/40'
                      )}
                    >
                      <IconComp className="w-3.5 h-3.5 shrink-0" />
                      <span>{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description (Optional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Description (Optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short note about this shelf"
                className="w-full h-10 rounded-2xl bg-secondary/50 hover:bg-secondary/80 focus:bg-background border border-border/50 px-3.5 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 rounded-2xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </Dialog.Close>

              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm font-extrabold shadow-md shadow-primary/25 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{loading ? 'Saving...' : editShelf ? 'Save Changes' : 'Create Shelf'}</span>
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
