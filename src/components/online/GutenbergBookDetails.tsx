import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { GutendexBook } from '@/online-books/gutenberg/types';
import { Download, BookOpen, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { downloadAndImportGutenberg } from '@/online-books/gutenberg/importer';
import { useToast } from '@/store/toastStore';
import { useBookOpen } from '@/hooks/useBookOpen';
import { downloadGutenbergEpub } from '@/online-books/gutenberg/downloads';

interface Props {
  book: GutendexBook | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GutenbergBookDetails({ book, open, onOpenChange }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const { handleOpenBook } = useBookOpen();

  if (!book) return null;

  const epubFormatUrl = book.formats['application/epub+zip'];
  const hasEpub = !!epubFormatUrl;

  const handleDownload = async () => {
    if (!epubFormatUrl) return;
    setIsDownloading(true);
    try {
      const result = await downloadAndImportGutenberg(epubFormatUrl, book.title);
      if (result.success.length > 0 || result.duplicates.length > 0) {
        showSuccessToast('Added to Library', `${book.title} was added to your library.`);
        onOpenChange(false);
      } else if (result.failed.length > 0) {
        showErrorToast('Import Failed', result.failed[0][1] || 'Unknown error occurred.');
      }
    } catch (err) {
      showErrorToast('Download Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleReadNow = async () => {
    if (!epubFormatUrl) return;
    setIsReading(true);
    try {
      // 1. Download and import directly
      const result = await downloadAndImportGutenberg(epubFormatUrl, book.title);
      const path = result.success[0] || result.duplicates[0];
      
      if (!path) {
        throw new Error(result.failed[0]?.[1] || "Failed to download book.");
      }

      // 2. Fetch books to find the newly imported book's ID by its path
      const { api } = await import('@/lib/tauri');
      // We assume the newly imported book is among the most recently added (top 100)
      const recentBooks = await api.getBooks(100, 0);
      
      // If it was a duplicate, the 'path' is the new temp path which isn't in the DB.
      // So we fallback to matching the title.
      const foundBook = recentBooks.find(b => 
        b.file_path === path || 
        (b.title && book.title && b.title.toLowerCase().trim() === book.title.toLowerCase().trim())
      );

      if (!foundBook?.id) {
        throw new Error(`Could not find imported book ID to open reader. (Path: ${path})`);
      }

      // 3. Open it via Reader integration
      await handleOpenBook(foundBook.id);
      onOpenChange(false);
    } catch (err) {
      showErrorToast('Failed to Open Reader', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsReading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 bg-background/80 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content aria-describedby={undefined} className="dialog-content fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card/40 backdrop-blur-2xl border border-border/50 rounded-[2rem] shadow-2xl w-[600px] max-h-[90vh] flex flex-col z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-500 overflow-hidden">
          
          <div className="flex-none bg-transparent backdrop-blur-xl border-b border-border/50 px-8 py-6 z-10 flex flex-col justify-between relative">
            <Dialog.Title className="text-2xl font-black tracking-tight text-foreground pr-8">
              {book.title}
            </Dialog.Title>
            <Dialog.Description className="text-muted-foreground mt-1">
              {book.authors.map(a => a.name).join(', ') || 'Unknown Author'}
            </Dialog.Description>
            <Dialog.Close asChild>
              <button className="absolute right-6 top-6 p-2.5 bg-card/40 hover:bg-card/80 border border-border/50 rounded-2xl transition-all duration-300 text-muted-foreground hover:text-foreground" title="Close">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
            {book.subjects.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm text-foreground tracking-tight mb-3">Subjects</h3>
                <div className="flex flex-wrap gap-2">
                  {book.subjects.map(subject => (
                    <span key={subject} className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary border border-primary/20 text-xs font-medium">
                      {subject}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-semibold text-sm text-foreground tracking-tight mb-3">Languages</h3>
              <div className="flex gap-2">
                {book.languages.map(lang => (
                  <span key={lang} className="uppercase text-xs font-bold tracking-wider px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground">
                    {lang}
                  </span>
                ))}
              </div>
            </div>

            {!hasEpub && (
              <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-3">
                <div className="p-2 bg-destructive/20 rounded-xl">
                  <X className="w-4 h-4" />
                </div>
                This book is not available in EPUB format and cannot be read directly in the app.
              </div>
            )}
          </div>

          <div className="flex-none p-6 border-t border-border/50 bg-muted/30 flex justify-end gap-3 backdrop-blur-md">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-2xl px-6">
                Close
              </Button>
            </Dialog.Close>
            {hasEpub && (
              <>
                <Button 
                  variant="default" 
                  onClick={handleDownload}
                  disabled={isDownloading || isReading}
                  className="gap-2 rounded-2xl shadow-primary/20 shadow-lg hover:shadow-primary/30 transition-all"
                >
                  {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Add to Library
                </Button>
              </>
            )}
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
