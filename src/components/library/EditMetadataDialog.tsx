import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Save, Loader2, Lock, Unlock, Pencil } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { api, type Book } from '../../lib/tauri';
import { useToast } from '../../store/toastStore';
import { logger } from '@/lib/logger';
import { useLibraryStore } from '../../store/libraryStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

function resolveCoverSrc(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return convertFileSrc(path.replace(/\\/g, '/'));
}

interface EditMetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: number;
}

export const EditMetadataDialog = ({ open, onOpenChange, bookId }: EditMetadataDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [book, setBook] = useState<Book | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    authors: '',
    isbn: '',
    isbn13: '',
    publisher: '',
    pubdate: '',
    series: '',
    series_index: '',
    rating: '',
    language: '',
    notes: '',
  });
  const [lockedFields, setLockedFields] = useState<Record<string, boolean>>({});
  const toast = useToast();
  const setBooks = useLibraryStore(state => state.setBooks);

  useEffect(() => {
    if (open && bookId) {
      loadBook();
    }
  }, [open, bookId]);

  const loadBook = async () => {
    setLoading(true);
    try {
      const loadedBook = await api.getBook(bookId);
      setBook(loadedBook);
      setFormData({
        title: loadedBook.title || '',
        authors: loadedBook.authors?.map(a => a.name).join(', ') || '',
        isbn: loadedBook.isbn || '',
        isbn13: loadedBook.isbn13 || '',
        publisher: loadedBook.publisher || '',
        pubdate: loadedBook.pubdate || '',
        series: loadedBook.series || '',
        series_index: loadedBook.series_index?.toString() || '',
        rating: loadedBook.rating?.toString() || '',
        language: loadedBook.language || 'en',
        notes: loadedBook.notes || '',
      });
      setLockedFields(loadedBook.metadata_locked || {});
    } catch (error) {
      logger.error('Failed to load book:', error);
      toast.error('Failed to load book', 'Could not load book metadata');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleLock = (field: string) => {
    setLockedFields(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleSave = async () => {
    if (!book) return;

    setSaving(true);
    try {
      const updatedBook: Book = {
        ...book,
        title: formData.title,
        authors: formData.authors.split(',').map(name => ({ name: name.trim() })),
        isbn: formData.isbn || undefined,
        isbn13: formData.isbn13 || undefined,
        publisher: formData.publisher || undefined,
        pubdate: formData.pubdate || undefined,
        series: formData.series || undefined,
        series_index: formData.series_index ? parseFloat(formData.series_index) : undefined,
        rating: formData.rating ? parseFloat(formData.rating) : undefined,
        language: formData.language,
        notes: formData.notes || undefined,
        modified_date: new Date().toISOString(),
        metadata_locked: lockedFields,
      };

      await api.updateBook(updatedBook);
      
      const books = await api.getBooks();
      setBooks(books);
      
      toast.success('Metadata updated', 'Book metadata has been saved successfully');
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to update book:', error);
      toast.error('Failed to update', 'Could not save book metadata');
    } finally {
      setSaving(false);
    }
  };

  const coverSrc = book?.cover_path ? resolveCoverSrc(book.cover_path) : null;

  if (loading || !book) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[90]" />
        <Dialog.Content aria-describedby={undefined} className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-full max-w-4xl h-[90vh] sm:h-[85vh] bg-card/85 backdrop-blur-3xl border border-white/10 sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
             <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 transition-all duration-300" />
        <Dialog.Content 
          aria-describedby={undefined} 
          className="dialog-content fixed inset-0 sm:inset-auto sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] bg-background/80 backdrop-blur-2xl sm:border sm:border-border sm:shadow-2xl sm:rounded-2xl w-full h-full sm:w-[90vw] sm:max-w-3xl sm:max-h-[90vh] overflow-hidden z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-top-[48%] duration-300"
        >
          {/* Blurred Background Header Art (Mobile Only) */}
          <div className="absolute top-0 left-0 right-0 h-48 overflow-hidden pointer-events-none select-none -z-10 bg-background sm:hidden">
            {coverSrc && (
              <img src={coverSrc} className="w-full h-full object-cover blur-[60px] opacity-40 scale-125 saturate-150 transform-gpu" alt="" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-card/80 to-card" />
          </div>

          {/* Floating Close Button */}
          <div className="absolute top-4 right-4 z-50">
             <Dialog.Close asChild>
               <button className="bg-secondary/80 hover:bg-secondary border border-border/50 text-muted-foreground hover:text-foreground p-2.5 rounded-full backdrop-blur-xl transition-all duration-200 shadow-md hover:scale-105 active:scale-95" title="Close">
                 <X className="h-5 w-5" />
               </button>
             </Dialog.Close>
          </div>

          {/* Header Title */}
          <div className="px-6 pt-10 sm:px-10 sm:pt-12 pb-4 shrink-0 flex items-center gap-3">
            <div className="p-2.5 bg-secondary text-primary rounded-xl border border-border/50 shadow-xs">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <Dialog.Title className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight drop-shadow-sm">
                Edit Metadata
              </Dialog.Title>
              <p className="text-muted-foreground font-medium text-sm sm:text-base mt-0.5 line-clamp-1">
                {book.title}
              </p>
            </div>
          </div>

          {/* Scrollable Form Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-6 pb-6 sm:px-10 sm:pb-10">
            <div className="space-y-6 max-w-2xl">
              {/* Title */}
              <div className="bg-muted/20 p-5 rounded-2xl border border-border/50 shadow-sm space-y-2 relative group focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-foreground/90 uppercase tracking-wider">
                    Title <span className="text-destructive">*</span>
                  </label>
                  <button
                    onClick={() => toggleLock('title')}
                    className={`p-1.5 rounded-md transition-colors ${lockedFields['title'] ? 'bg-muted/80 text-foreground/90 shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                    title={lockedFields['title'] ? 'Unlock to allow auto-updates' : 'Lock to prevent auto-updates'}
                    type="button"
                  >
                    {lockedFields['title'] ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                  </button>
                </div>
                <Input
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="Book title"
                  className={`w-full text-lg h-12 bg-background shadow-inner ${lockedFields['title'] ? 'opacity-80' : ''}`}
                />
              </div>

              {/* Authors */}
              <div className="bg-muted/20 p-5 rounded-2xl border border-border/50 shadow-sm space-y-2 relative group focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-bold text-foreground/90 uppercase tracking-wider">
                      Authors
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5 font-medium">Separate multiple authors with commas</p>
                  </div>
                  <button
                    onClick={() => toggleLock('author')}
                    className={`p-1.5 rounded-md transition-colors ${lockedFields['author'] ? 'bg-muted/80 text-foreground/90 shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                    title={lockedFields['author'] ? 'Unlock to allow auto-updates' : 'Lock to prevent auto-updates'}
                    type="button"
                  >
                    {lockedFields['author'] ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                  </button>
                </div>
                <Input
                  value={formData.authors}
                  onChange={(e) => handleInputChange('authors', e.target.value)}
                  placeholder="Author names"
                  className={`w-full text-base h-12 bg-background shadow-inner ${lockedFields['author'] ? 'opacity-80' : ''}`}
                />
              </div>

              {/* ISBN Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-muted/20 p-5 rounded-2xl border border-border/50 shadow-sm space-y-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-foreground/90 uppercase tracking-wider">
                      ISBN
                    </label>
                    <button
                      onClick={() => toggleLock('isbn')}
                      className={`p-1.5 rounded-md transition-colors ${lockedFields['isbn'] ? 'bg-muted/80 text-foreground/90 shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                      type="button"
                    >
                      {lockedFields['isbn'] ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </button>
                  </div>
                  <Input
                    value={formData.isbn}
                    onChange={(e) => handleInputChange('isbn', e.target.value)}
                    placeholder="ISBN-10"
                    className={`w-full font-mono bg-background shadow-inner ${lockedFields['isbn'] ? 'opacity-80' : ''}`}
                  />
                </div>
                <div className="bg-muted/20 p-5 rounded-2xl border border-border/50 shadow-sm space-y-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-foreground/90 uppercase tracking-wider">
                      ISBN-13
                    </label>
                    {/* Re-use isbn lock since they are usually managed together, or keep separate. Using isbn lock for UI simplicity as in original */}
                    <button
                      onClick={() => toggleLock('isbn')}
                      className={`p-1.5 rounded-md transition-colors ${lockedFields['isbn'] ? 'bg-muted/80 text-foreground/90 shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                      type="button"
                    >
                      {lockedFields['isbn'] ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </button>
                  </div>
                  <Input
                    value={formData.isbn13}
                    onChange={(e) => handleInputChange('isbn13', e.target.value)}
                    placeholder="ISBN-13"
                    className={`w-full font-mono bg-background shadow-inner ${lockedFields['isbn'] ? 'opacity-80' : ''}`}
                  />
                </div>
              </div>

              {/* Publisher & Publication Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-muted/20 p-5 rounded-2xl border border-border/50 shadow-sm space-y-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-foreground/90 uppercase tracking-wider">
                      Publisher
                    </label>
                    <button
                      onClick={() => toggleLock('publisher')}
                      className={`p-1.5 rounded-md transition-colors ${lockedFields['publisher'] ? 'bg-muted/80 text-foreground/90 shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                      type="button"
                    >
                      {lockedFields['publisher'] ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </button>
                  </div>
                  <Input
                    value={formData.publisher}
                    onChange={(e) => handleInputChange('publisher', e.target.value)}
                    placeholder="Publisher name"
                    className={`w-full bg-background shadow-inner ${lockedFields['publisher'] ? 'opacity-80' : ''}`}
                  />
                </div>
                <div className="bg-muted/20 p-5 rounded-2xl border border-border/50 shadow-sm space-y-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-foreground/90 uppercase tracking-wider">
                      Pub Date
                    </label>
                    <button
                      onClick={() => toggleLock('publish_date')}
                      className={`p-1.5 rounded-md transition-colors ${lockedFields['publish_date'] ? 'bg-muted/80 text-foreground/90 shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                      type="button"
                    >
                      {lockedFields['publish_date'] ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </button>
                  </div>
                  <Input
                    value={formData.pubdate}
                    onChange={(e) => handleInputChange('pubdate', e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className={`w-full bg-background shadow-inner ${lockedFields['publish_date'] ? 'opacity-80' : ''}`}
                  />
                </div>
              </div>

              {/* Series */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="sm:col-span-2 bg-muted/20 p-5 rounded-2xl border border-border/50 shadow-sm space-y-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <label className="block text-sm font-bold text-foreground/90 uppercase tracking-wider">
                    Series Name
                  </label>
                  <Input
                    value={formData.series}
                    onChange={(e) => handleInputChange('series', e.target.value)}
                    placeholder="Series name"
                    className="w-full bg-background shadow-inner"
                  />
                </div>
                <div className="bg-muted/20 p-5 rounded-2xl border border-border/50 shadow-sm space-y-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <label className="block text-sm font-bold text-foreground/90 uppercase tracking-wider">
                    Index
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.series_index}
                    onChange={(e) => handleInputChange('series_index', e.target.value)}
                    placeholder="1"
                    className="w-full bg-background shadow-inner"
                  />
                </div>
              </div>

              {/* Rating & Language */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-muted/20 p-5 rounded-2xl border border-border/50 shadow-sm space-y-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <label className="block text-sm font-bold text-foreground/90 uppercase tracking-wider">
                    Rating
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="5"
                    value={formData.rating}
                    onChange={(e) => handleInputChange('rating', e.target.value)}
                    placeholder="0-5"
                    className="w-full bg-background shadow-inner"
                  />
                </div>
                <div className="bg-muted/20 p-5 rounded-2xl border border-border/50 shadow-sm space-y-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <label className="block text-sm font-bold text-foreground/90 uppercase tracking-wider">
                    Language
                  </label>
                  <Input
                    value={formData.language}
                    onChange={(e) => handleInputChange('language', e.target.value)}
                    placeholder="e.g. en"
                    className="w-full bg-background shadow-inner"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="bg-muted/20 p-5 rounded-2xl border border-border/50 shadow-sm space-y-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-foreground/90 uppercase tracking-wider">
                    Notes & Summary
                  </label>
                  <button
                    onClick={() => toggleLock('description')}
                    className={`p-1.5 rounded-md transition-colors ${lockedFields['description'] ? 'bg-muted/80 text-foreground/90 shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                    type="button"
                  >
                    {lockedFields['description'] ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                  </button>
                </div>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Add notes, summaries, or metadata about this book..."
                  rows={5}
                  className={`w-full px-4 py-3 bg-background border border-input rounded-xl shadow-inner text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none leading-relaxed ${lockedFields['description'] ? 'opacity-80' : ''}`}
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 p-4 sm:p-6 border-t border-border bg-card sticky bottom-0 z-10 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.3)]">
            <Dialog.Close asChild>
              <Button variant="ghost" disabled={saving} className="rounded-full px-6 font-semibold hover:bg-muted">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleSave}
              disabled={loading || saving || !formData.title}
              className="min-w-32 rounded-full px-8 h-12 shadow-lg shadow-primary/20 font-bold"
            >
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
