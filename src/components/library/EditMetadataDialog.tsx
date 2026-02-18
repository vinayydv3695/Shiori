import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Save, Loader2 } from 'lucide-react';
import { api, type Book } from '../../lib/tauri';
import { useToast } from '../../store/toastStore';
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
  const toast = useToast();
  const { setBooks } = useLibraryStore();

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
        authors: loadedBook.authors.map(a => a.name).join(', ') || '',
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
    } catch (error) {
      console.error('Failed to load book:', error);
      toast.error('Failed to load book', 'Could not load book metadata');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
      };

      await api.updateBook(updatedBook);
      
      // Reload library
      const books = await api.getBooks();
      setBooks(books);
      
      toast.success('Metadata updated', 'Book metadata has been saved successfully');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to update book:', error);
      toast.error('Failed to update', 'Could not save book metadata');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-lg shadow-lg w-[90vw] max-w-2xl max-h-[85vh] overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              Edit Metadata
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(85vh-180px)]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Title *
                  </label>
                  <Input
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="Book title"
                    className="w-full"
                  />
                </div>

                {/* Authors */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Authors
                  </label>
                  <Input
                    value={formData.authors}
                    onChange={(e) => handleInputChange('authors', e.target.value)}
                    placeholder="Author names (comma-separated)"
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Separate multiple authors with commas
                  </p>
                </div>

                {/* ISBN Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      ISBN
                    </label>
                    <Input
                      value={formData.isbn}
                      onChange={(e) => handleInputChange('isbn', e.target.value)}
                      placeholder="ISBN-10"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      ISBN-13
                    </label>
                    <Input
                      value={formData.isbn13}
                      onChange={(e) => handleInputChange('isbn13', e.target.value)}
                      placeholder="ISBN-13"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Publisher & Publication Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Publisher
                    </label>
                    <Input
                      value={formData.publisher}
                      onChange={(e) => handleInputChange('publisher', e.target.value)}
                      placeholder="Publisher name"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Publication Date
                    </label>
                    <Input
                      value={formData.pubdate}
                      onChange={(e) => handleInputChange('pubdate', e.target.value)}
                      placeholder="YYYY-MM-DD"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Series */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Series
                    </label>
                    <Input
                      value={formData.series}
                      onChange={(e) => handleInputChange('series', e.target.value)}
                      placeholder="Series name"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Series #
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.series_index}
                      onChange={(e) => handleInputChange('series_index', e.target.value)}
                      placeholder="1"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Rating & Language */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
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
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Language
                    </label>
                    <Input
                      value={formData.language}
                      onChange={(e) => handleInputChange('language', e.target.value)}
                      placeholder="en"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder="Add notes about this book..."
                    rows={4}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={saving}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleSave}
              disabled={loading || saving || !formData.title}
              className="min-w-24"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
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
