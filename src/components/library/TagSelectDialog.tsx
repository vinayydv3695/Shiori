import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Tag as TagIcon } from 'lucide-react';
import { api, type Tag } from '@/lib/tauri';
import { Button } from '@/components/ui/button';
import { useToast } from '@/store/toastStore';

interface TagSelectDialogProps {
  bookId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TagSelectDialog({ bookId, open, onOpenChange }: TagSelectDialogProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, bookId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allTags, bookTagIds] = await Promise.all([
        api.getTags(),
        api.getBookTagIds(bookId)
      ]);
      setTags(allTags);
      setSelectedIds(new Set(bookTagIds));
    } catch (error) {
      toast.error('Failed to load tags', 'An error occurred while loading tags');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const currentIds = await api.getBookTagIds(bookId);
      const currentSet = new Set(currentIds);
      
      const toAdd = [...selectedIds].filter(id => !currentSet.has(id));
      const toRemove = [...currentSet].filter(id => !selectedIds.has(id));

      await Promise.all([
        ...toAdd.map(id => api.addTagToBook(bookId, id)),
        ...toRemove.map(id => api.removeTagFromBook(bookId, id))
      ]);

      toast.success('Tags updated successfully', 'Tags updated successfully');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to update tags', 'An error occurred while updating tags');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg">
          <div className="flex flex-col space-y-1.5">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
                <TagIcon className="h-5 w-5" />
                Manage Tags
              </Dialog.Title>
              <Dialog.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Dialog.Close>
            </div>
          </div>
          
          <div className="py-4 max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : tags.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No tags found. Create one from the sidebar.
              </div>
            ) : (
              <div className="space-y-2">
                {tags.map(tag => (
                  <label
                    key={tag.id}
                    className="flex items-center space-x-3 p-3 rounded-md hover:bg-accent cursor-pointer transition-colors border border-transparent hover:border-border"
                  >
                    <input
                      type="checkbox"
                      checked={tag.id !== undefined && selectedIds.has(tag.id)}
                      onChange={() => tag.id !== undefined && handleToggle(tag.id)}
                      className="h-4 w-4 rounded border-primary text-primary focus:ring-primary bg-background accent-primary"
                    />
                    <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {tag.name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex items-center justify-end space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
