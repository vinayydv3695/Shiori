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
      logger.error('Failed to load book for editing:', error);
      toast.error('Failed to load book', 'Could not fetch book details');
      onOpenChange(false);
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

  if (!book && loading) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] transition-opacity" />
          <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-[calc(100vw-1.5rem)] sm:w-[90vw] max-w-2xl bg-card border border-border rounded-2xl sm:rounded-3xl shadow-2xl flex items-center justify-center p-12 focus:outline-none">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  if (!book) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] transition-opacity data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content 
          aria-describedby={undefined} 
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] sm:w-[90vw] max-w-2xl bg-card border border-border/80 rounded-2xl sm:rounded-3xl shadow-2xl z-[210] flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-300"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-5 border-b border-border/50 bg-card/70 backdrop-blur-xl shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 pr-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center text-primary shadow-xs shrink-0">
                <Pencil className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="text-base sm:text-lg font-extrabold text-foreground tracking-tight">
                  Edit Metadata
                </Dialog.Title>
                <Dialog.Description className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-1 font-semibold">
                  {book.title}
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

          {/* Scrollable Form Content */}
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-3 sm:space-y-4 custom-scrollbar">
            
            {/* Title Card */}
            <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 transition-all duration-200 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                  <label className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider truncate">
                    Title <span className="text-destructive">*</span>
                  </label>
                </div>
                <button
                  onClick={() => toggleLock('title')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border transition-all cursor-pointer active:scale-95 shrink-0 ${
                    lockedFields['title'] 
                      ? 'bg-primary/15 text-primary border-primary/30 shadow-2xs' 
                      : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60'
                  }`}
                  title={lockedFields['title'] ? 'Locked: prevents auto-enrich from overwriting' : 'Unlocked: auto-enrich can update this field'}
                  type="button"
                >
                  {lockedFields['title'] ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  <span>{lockedFields['title'] ? 'Locked' : 'Auto'}</span>
                </button>
              </div>
              <Input
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Book title"
                className={`w-full h-9 sm:h-10 bg-background/90 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none rounded-lg sm:rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all shadow-xs ${lockedFields['title'] ? 'opacity-80' : ''}`}
              />
            </div>

            {/* Authors Card */}
            <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 transition-all duration-200 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                    <label className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                      Authors
                    </label>
                  </div>
                  <p className="text-[10px] text-muted-foreground/80 mt-0.5">Separate multiple authors with commas</p>
                </div>
                <button
                  onClick={() => toggleLock('author')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border transition-all cursor-pointer active:scale-95 shrink-0 ${
                    lockedFields['author'] 
                      ? 'bg-primary/15 text-primary border-primary/30 shadow-2xs' 
                      : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60'
                  }`}
                  title={lockedFields['author'] ? 'Locked: prevents auto-enrich from overwriting' : 'Unlocked: auto-enrich can update this field'}
                  type="button"
                >
                  {lockedFields['author'] ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  <span>{lockedFields['author'] ? 'Locked' : 'Auto'}</span>
                </button>
              </div>
              <Input
                value={formData.authors}
                onChange={(e) => handleInputChange('authors', e.target.value)}
                placeholder="Author names"
                className={`w-full h-9 sm:h-10 bg-background/90 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none rounded-lg sm:rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all shadow-xs ${lockedFields['author'] ? 'opacity-80' : ''}`}
              />
            </div>

            {/* ISBN & ISBN-13 Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 transition-all duration-200 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Hash className="w-3.5 h-3.5 text-primary shrink-0" />
                    <label className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                      ISBN
                    </label>
                  </div>
                  <button
                    onClick={() => toggleLock('isbn')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border transition-all cursor-pointer active:scale-95 shrink-0 ${
                      lockedFields['isbn'] 
                        ? 'bg-primary/15 text-primary border-primary/30 shadow-2xs' 
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60'
                    }`}
                    type="button"
                  >
                    {lockedFields['isbn'] ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    <span>{lockedFields['isbn'] ? 'Locked' : 'Auto'}</span>
                  </button>
                </div>
                <Input
                  value={formData.isbn}
                  onChange={(e) => handleInputChange('isbn', e.target.value)}
                  placeholder="ISBN-10"
                  className={`w-full h-9 sm:h-10 font-mono bg-background/90 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none rounded-lg sm:rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all shadow-xs ${lockedFields['isbn'] ? 'opacity-80' : ''}`}
                />
              </div>

              <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 transition-all duration-200 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Hash className="w-3.5 h-3.5 text-primary shrink-0" />
                    <label className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                      ISBN-13
                    </label>
                  </div>
                  <button
                    onClick={() => toggleLock('isbn')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border transition-all cursor-pointer active:scale-95 shrink-0 ${
                      lockedFields['isbn'] 
                        ? 'bg-primary/15 text-primary border-primary/30 shadow-2xs' 
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60'
                    }`}
                    type="button"
                  >
                    {lockedFields['isbn'] ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    <span>{lockedFields['isbn'] ? 'Locked' : 'Auto'}</span>
                  </button>
                </div>
                <Input
                  value={formData.isbn13}
                  onChange={(e) => handleInputChange('isbn13', e.target.value)}
                  placeholder="ISBN-13"
                  className={`w-full h-9 sm:h-10 font-mono bg-background/90 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none rounded-lg sm:rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all shadow-xs ${lockedFields['isbn'] ? 'opacity-80' : ''}`}
                />
              </div>
            </div>

            {/* Publisher & Publication Date Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 transition-all duration-200 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                    <label className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                      Publisher
                    </label>
                  </div>
                  <button
                    onClick={() => toggleLock('publisher')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border transition-all cursor-pointer active:scale-95 shrink-0 ${
                      lockedFields['publisher'] 
                        ? 'bg-primary/15 text-primary border-primary/30 shadow-2xs' 
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60'
                    }`}
                    type="button"
                  >
                    {lockedFields['publisher'] ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    <span>{lockedFields['publisher'] ? 'Locked' : 'Auto'}</span>
                  </button>
                </div>
                <Input
                  value={formData.publisher}
                  onChange={(e) => handleInputChange('publisher', e.target.value)}
                  placeholder="Publisher name"
                  className={`w-full h-9 sm:h-10 bg-background/90 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none rounded-lg sm:rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all shadow-xs ${lockedFields['publisher'] ? 'opacity-80' : ''}`}
                />
              </div>

              <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 transition-all duration-200 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                    <label className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                      Published Date
                    </label>
                  </div>
                  <button
                    onClick={() => toggleLock('pubdate')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border transition-all cursor-pointer active:scale-95 shrink-0 ${
                      lockedFields['pubdate'] 
                        ? 'bg-primary/15 text-primary border-primary/30 shadow-2xs' 
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60'
                    }`}
                    type="button"
                  >
                    {lockedFields['pubdate'] ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    <span>{lockedFields['pubdate'] ? 'Locked' : 'Auto'}</span>
                  </button>
                </div>
                <Input
                  type="date"
                  value={formData.pubdate ? formData.pubdate.split('T')[0] : ''}
                  onChange={(e) => handleInputChange('pubdate', e.target.value)}
                  className={`w-full h-9 sm:h-10 bg-background/90 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none rounded-lg sm:rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-foreground transition-all shadow-xs ${lockedFields['pubdate'] ? 'opacity-80' : ''}`}
                />
              </div>
            </div>

            {/* Series & Series Index Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 transition-all duration-200 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                    <label className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                      Series
                    </label>
                  </div>
                  <button
                    onClick={() => toggleLock('series')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border transition-all cursor-pointer active:scale-95 shrink-0 ${
                      lockedFields['series'] 
                        ? 'bg-primary/15 text-primary border-primary/30 shadow-2xs' 
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60'
                    }`}
                    type="button"
                  >
                    {lockedFields['series'] ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    <span>{lockedFields['series'] ? 'Locked' : 'Auto'}</span>
                  </button>
                </div>
                <Input
                  value={formData.series}
                  onChange={(e) => handleInputChange('series', e.target.value)}
                  placeholder="Series name"
                  className={`w-full h-9 sm:h-10 bg-background/90 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none rounded-lg sm:rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all shadow-xs ${lockedFields['series'] ? 'opacity-80' : ''}`}
                />
              </div>

              <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 transition-all duration-200 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ListOrdered className="w-3.5 h-3.5 text-primary shrink-0" />
                    <label className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                      Volume / Index
                    </label>
                  </div>
                  <button
                    onClick={() => toggleLock('series_index')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border transition-all cursor-pointer active:scale-95 shrink-0 ${
                      lockedFields['series_index'] 
                        ? 'bg-primary/15 text-primary border-primary/30 shadow-2xs' 
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60'
                    }`}
                    type="button"
                  >
                    {lockedFields['series_index'] ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    <span>{lockedFields['series_index'] ? 'Locked' : 'Auto'}</span>
                  </button>
                </div>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.series_index}
                  onChange={(e) => handleInputChange('series_index', e.target.value)}
                  placeholder="e.g. 1 or 1.5"
                  className={`w-full h-9 sm:h-10 bg-background/90 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none rounded-lg sm:rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all shadow-xs ${lockedFields['series_index'] ? 'opacity-80' : ''}`}
                />
              </div>
            </div>

            {/* Rating & Language Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 transition-all duration-200 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20 shrink-0" />
                    <label className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                      Rating (0 - 5)
                    </label>
                  </div>
                  <button
                    onClick={() => toggleLock('rating')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border transition-all cursor-pointer active:scale-95 shrink-0 ${
                      lockedFields['rating'] 
                        ? 'bg-primary/15 text-primary border-primary/30 shadow-2xs' 
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60'
                    }`}
                    type="button"
                  >
                    {lockedFields['rating'] ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    <span>{lockedFields['rating'] ? 'Locked' : 'Auto'}</span>
                  </button>
                </div>
                <Input
                  type="number"
                  min="0"
                  max="5"
                  step="0.5"
                  value={formData.rating}
                  onChange={(e) => handleInputChange('rating', e.target.value)}
                  placeholder="e.g. 4.5"
                  className={`w-full h-9 sm:h-10 bg-background/90 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none rounded-lg sm:rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all shadow-xs ${lockedFields['rating'] ? 'opacity-80' : ''}`}
                />
              </div>

              <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 transition-all duration-200 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
                    <label className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                      Language
                    </label>
                  </div>
                  <button
                    onClick={() => toggleLock('language')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border transition-all cursor-pointer active:scale-95 shrink-0 ${
                      lockedFields['language'] 
                        ? 'bg-primary/15 text-primary border-primary/30 shadow-2xs' 
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60'
                    }`}
                    type="button"
                  >
                    {lockedFields['language'] ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    <span>{lockedFields['language'] ? 'Locked' : 'Auto'}</span>
                  </button>
                </div>
                <Input
                  value={formData.language}
                  onChange={(e) => handleInputChange('language', e.target.value)}
                  placeholder="en"
                  className={`w-full h-9 sm:h-10 bg-background/90 focus:bg-background border border-border/70 focus:border-primary focus-visible:border-primary focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none rounded-lg sm:rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 transition-all shadow-xs ${lockedFields['language'] ? 'opacity-80' : ''}`}
                />
              </div>
            </div>

            {/* Notes & Summary Card */}
            <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 transition-all duration-200 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                  <label className="text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                    Notes & Summary
                  </label>
                </div>
                <button
                  onClick={() => toggleLock('description')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border transition-all cursor-pointer active:scale-95 shrink-0 ${
                    lockedFields['description'] 
                      ? 'bg-primary/15 text-primary border-primary/30 shadow-2xs' 
                      : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60'
                  }`}
                  type="button"
                >
                  {lockedFields['description'] ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  <span>{lockedFields['description'] ? 'Locked' : 'Auto'}</span>
                </button>
              </div>
              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Add notes, summaries, or metadata about this book..."
                rows={3}
                className={`w-full px-3.5 py-2.5 bg-background/90 focus:bg-background border border-border/70 focus:border-primary focus:outline-none rounded-lg sm:rounded-xl shadow-xs text-xs sm:text-sm font-medium text-foreground placeholder:text-muted-foreground/40 resize-none leading-relaxed transition-all ${lockedFields['description'] ? 'opacity-80' : ''}`}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div 
            className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-t border-border/50 bg-card/80 backdrop-blur-xl shrink-0 gap-3"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
          >
            <Dialog.Close asChild>
              <Button variant="ghost" disabled={saving} className="rounded-full px-4 sm:px-5 font-semibold text-muted-foreground hover:text-foreground hover:bg-muted text-xs sm:text-sm h-9 sm:h-10">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleSave}
              disabled={loading || saving || !formData.title}
              className="rounded-full px-5 sm:px-6 h-9 sm:h-10 font-bold shadow-lg shadow-primary/25 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 text-xs sm:text-sm active:scale-95 transition-all cursor-pointer"
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
