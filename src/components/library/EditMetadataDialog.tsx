import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { 
  X, Save, Loader2, Lock, Unlock, Pencil, 
  BookOpen, Users, Hash, Building2, Calendar, 
  Layers, ListOrdered, Star, Globe, FileText 
} from 'lucide-react';
import { api, type Book } from '../../lib/tauri';
import { useToast } from '../../store/toastStore';
import { logger } from '@/lib/logger';
import { useLibraryStore } from '../../store/libraryStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useBottomSheetDrag } from '@/hooks/useBottomSheetDrag';

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
    let canceled = false;

    if (open && bookId) {
      // Synchronously sync from libraryStore to eliminate loading delay & state flashes
      const cached = useLibraryStore.getState().books.find(b => b.id === bookId);
      if (cached) {
        setBook(cached);
        setFormData({
          title: cached.title || '',
          authors: cached.authors?.map(a => a.name).join(', ') || '',
          isbn: cached.isbn || '',
          isbn13: cached.isbn13 || '',
          publisher: cached.publisher || '',
          pubdate: cached.pubdate || '',
          series: cached.series || '',
          series_index: cached.series_index?.toString() || '',
          rating: cached.rating?.toString() || '',
          language: cached.language || 'en',
          notes: cached.notes || '',
        });
        setLockedFields(cached.metadata_locked || {});
        setLoading(false);
      } else {
        setBook(null);
        setLoading(true);
      }

      // Fetch fresh / complete metadata from API
      api.getBook(bookId)
        .then(loadedBook => {
          if (!canceled) {
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
            setLoading(false);
          }
        })
        .catch(error => {
          logger.error('Failed to load book for editing:', error);
          if (!canceled) setLoading(false);
        });
    } else if (!open) {
      setBook(null);
      setLoading(false);
    }

    return () => {
      canceled = true;
    };
  }, [open, bookId]);

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
        authors: formData.authors
          .split(',')
          .map(a => a.trim())
          .filter(a => a.length > 0)
          .map(name => ({ id: 0, name })),
        isbn: formData.isbn || undefined,
        isbn13: formData.isbn13 || undefined,
        publisher: formData.publisher || undefined,
        pubdate: formData.pubdate || undefined,
        series: formData.series || undefined,
        series_index: formData.series_index ? parseFloat(formData.series_index) : undefined,
        rating: formData.rating ? parseFloat(formData.rating) : undefined,
        language: formData.language || 'en',
        notes: formData.notes || undefined,
        modified_date: new Date().toISOString(),
        metadata_locked: lockedFields,
      };

      await api.updateBook(updatedBook);
      
      const currentBooks = useLibraryStore.getState().books;
      setBooks(currentBooks.map(b => b.id === book.id ? { ...b, ...updatedBook } : b));
      
      toast.success('Metadata saved', 'Book details updated successfully');
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to save book metadata:', error);
      toast.error('Failed to save', 'Could not update book details');
    } finally {
      setSaving(false);
    }
  };

  const renderLockBtn = (fieldKey: string) => {
    const isLocked = lockedFields[fieldKey];
    return (
      <button
        onClick={() => toggleLock(fieldKey)}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold border transition-all cursor-pointer active:scale-95 shrink-0 select-none ${
          isLocked 
            ? 'bg-primary/15 text-primary border-primary/30 shadow-2xs' 
            : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60'
        }`}
        title={isLocked ? 'Locked: prevents auto-enrich from overwriting' : 'Auto: auto-enrich can update this field'}
        type="button"
      >
        {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
        <span>{isLocked ? 'Locked' : 'Auto'}</span>
      </button>
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 bg-black/60 backdrop-blur-xl z-[200] transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />
        <Dialog.Content 
          aria-describedby={undefined} 
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-28px)] sm:w-[90vw] max-w-2xl max-h-[85vh] bg-popover dark:bg-card/98 backdrop-blur-3xl border border-border/80 rounded-3xl shadow-2xl z-[210] flex flex-col overflow-hidden focus:outline-none transition-all duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 sm:py-4 border-b border-border/50 bg-muted/20 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-2xs shrink-0">
                <Pencil className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="text-sm sm:text-base font-extrabold text-foreground tracking-tight">
                  Edit Metadata
                </Dialog.Title>
                <Dialog.Description className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1 font-semibold">
                  {book?.title || 'Loading...'}
                </Dialog.Description>
              </div>
            </div>
            
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 sm:p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
              title="Close"
            >
              <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>
          </div>

          {/* Body Content */}
          {loading && !book ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[300px]">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          ) : !book ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[300px] text-muted-foreground text-sm font-medium">
              Book details unavailable.
            </div>
          ) : (
            /* Scrollable Form Content */
            <div 
              className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 custom-scrollbar"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
            >
              {/* General Information Section */}
              <div className="space-y-3">
                <div className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                  General Info
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                      <label className="text-xs font-bold text-foreground">
                        Title <span className="text-destructive">*</span>
                      </label>
                    </div>
                    {renderLockBtn('title')}
                  </div>
                  <Input
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="Book title"
                    className={`w-full h-10 sm:h-11 bg-muted/30 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-2 focus:ring-primary/20 rounded-2xl px-3.5 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all ${lockedFields['title'] ? 'opacity-85' : ''}`}
                  />
                </div>

                {/* Authors */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                      <label className="text-xs font-bold text-foreground">
                        Authors
                      </label>
                      <span className="text-[10px] text-muted-foreground hidden min-[400px]:inline">
                        (comma separated)
                      </span>
                    </div>
                    {renderLockBtn('author')}
                  </div>
                  <Input
                    value={formData.authors}
                    onChange={(e) => handleInputChange('authors', e.target.value)}
                    placeholder="e.g. Author 1, Author 2"
                    className={`w-full h-10 sm:h-11 bg-muted/30 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-2 focus:ring-primary/20 rounded-2xl px-3.5 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all ${lockedFields['author'] ? 'opacity-85' : ''}`}
                  />
                </div>
              </div>

              {/* Series & Rating Section */}
              <div className="space-y-3 pt-1">
                <div className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                  Series & Details
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Series */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                        <label className="text-xs font-bold text-foreground">Series</label>
                      </div>
                      {renderLockBtn('series')}
                    </div>
                    <Input
                      value={formData.series}
                      onChange={(e) => handleInputChange('series', e.target.value)}
                      placeholder="Series name"
                      className={`w-full h-10 sm:h-11 bg-muted/30 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-2 focus:ring-primary/20 rounded-2xl px-3.5 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all ${lockedFields['series'] ? 'opacity-85' : ''}`}
                    />
                  </div>

                  {/* Volume / Index */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <ListOrdered className="w-3.5 h-3.5 text-primary shrink-0" />
                        <label className="text-xs font-bold text-foreground">Volume / Index</label>
                      </div>
                      {renderLockBtn('series_index')}
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.series_index}
                      onChange={(e) => handleInputChange('series_index', e.target.value)}
                      placeholder="e.g. 1 or 2.5"
                      className={`w-full h-10 sm:h-11 bg-muted/30 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-2 focus:ring-primary/20 rounded-2xl px-3.5 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all ${lockedFields['series_index'] ? 'opacity-85' : ''}`}
                    />
                  </div>

                  {/* Rating */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 shrink-0" />
                        <label className="text-xs font-bold text-foreground">Rating (0 - 5)</label>
                      </div>
                      {renderLockBtn('rating')}
                    </div>
                    <Input
                      type="number"
                      min="0"
                      max="5"
                      step="0.5"
                      value={formData.rating}
                      onChange={(e) => handleInputChange('rating', e.target.value)}
                      placeholder="e.g. 4.5"
                      className={`w-full h-10 sm:h-11 bg-muted/30 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-2 focus:ring-primary/20 rounded-2xl px-3.5 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all ${lockedFields['rating'] ? 'opacity-85' : ''}`}
                    />
                  </div>

                  {/* Language */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
                        <label className="text-xs font-bold text-foreground">Language</label>
                      </div>
                      {renderLockBtn('language')}
                    </div>
                    <Input
                      value={formData.language}
                      onChange={(e) => handleInputChange('language', e.target.value)}
                      placeholder="en"
                      className={`w-full h-10 sm:h-11 bg-muted/30 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-2 focus:ring-primary/20 rounded-2xl px-3.5 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all ${lockedFields['language'] ? 'opacity-85' : ''}`}
                    />
                  </div>
                </div>
              </div>

              {/* Publishing & Identifiers Section */}
              <div className="space-y-3 pt-1">
                <div className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                  Publishing & Identifiers
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Publisher */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                        <label className="text-xs font-bold text-foreground">Publisher</label>
                      </div>
                      {renderLockBtn('publisher')}
                    </div>
                    <Input
                      value={formData.publisher}
                      onChange={(e) => handleInputChange('publisher', e.target.value)}
                      placeholder="Publisher name"
                      className={`w-full h-10 sm:h-11 bg-muted/30 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-2 focus:ring-primary/20 rounded-2xl px-3.5 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all ${lockedFields['publisher'] ? 'opacity-85' : ''}`}
                    />
                  </div>

                  {/* Published Date */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                        <label className="text-xs font-bold text-foreground">Published Date</label>
                      </div>
                      {renderLockBtn('pubdate')}
                    </div>
                    <Input
                      type="date"
                      value={formData.pubdate ? formData.pubdate.split('T')[0] : ''}
                      onChange={(e) => handleInputChange('pubdate', e.target.value)}
                      className={`w-full h-10 sm:h-11 bg-muted/30 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-2 focus:ring-primary/20 rounded-2xl px-3.5 text-xs sm:text-sm font-medium text-foreground transition-all ${lockedFields['pubdate'] ? 'opacity-85' : ''}`}
                    />
                  </div>

                  {/* ISBN */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-primary shrink-0" />
                        <label className="text-xs font-bold text-foreground">ISBN</label>
                      </div>
                      {renderLockBtn('isbn')}
                    </div>
                    <Input
                      value={formData.isbn}
                      onChange={(e) => handleInputChange('isbn', e.target.value)}
                      placeholder="ISBN-10"
                      className={`w-full h-10 sm:h-11 font-mono bg-muted/30 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-2 focus:ring-primary/20 rounded-2xl px-3.5 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all ${lockedFields['isbn'] ? 'opacity-85' : ''}`}
                    />
                  </div>

                  {/* ISBN-13 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-primary shrink-0" />
                        <label className="text-xs font-bold text-foreground">ISBN-13</label>
                      </div>
                      {renderLockBtn('isbn')}
                    </div>
                    <Input
                      value={formData.isbn13}
                      onChange={(e) => handleInputChange('isbn13', e.target.value)}
                      placeholder="ISBN-13"
                      className={`w-full h-10 sm:h-11 font-mono bg-muted/30 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-2 focus:ring-primary/20 rounded-2xl px-3.5 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all ${lockedFields['isbn'] ? 'opacity-85' : ''}`}
                    />
                  </div>
                </div>
              </div>

              {/* Notes & Summary Section */}
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                      <label className="text-xs font-bold text-foreground">Notes & Summary</label>
                    </div>
                    {renderLockBtn('description')}
                  </div>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder="Add notes, summaries, or metadata..."
                    rows={3}
                    className={`w-full p-3.5 bg-muted/30 focus:bg-background border border-border/70 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-2xl text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 resize-none leading-relaxed transition-all outline-none ${lockedFields['description'] ? 'opacity-85' : ''}`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div 
            className="flex items-center justify-end px-4 sm:px-6 py-3 sm:py-4 border-t border-border/50 bg-card/80 backdrop-blur-xl shrink-0 gap-2.5"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
          >
            <Dialog.Close asChild>
              <Button 
                variant="ghost" 
                disabled={saving} 
                className="rounded-2xl px-4 sm:px-5 font-bold text-muted-foreground hover:text-foreground hover:bg-muted text-xs sm:text-sm h-10 sm:h-11 cursor-pointer"
              >
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleSave}
              disabled={loading || saving || !formData.title}
              className="rounded-2xl px-5 sm:px-6 h-10 sm:h-11 font-bold shadow-lg shadow-primary/25 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 text-xs sm:text-sm active:scale-95 transition-all cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save Changes</span>
                </>
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

