import { useState, useEffect, useCallback } from 'react';
import { api, type Book } from '@/lib/tauri';
import { LibraryGrid } from '../library/LibraryGrid';
import { Loader2, X, History } from 'lucide-react';
import { Button } from '../ui/button';
import { motion } from 'framer-motion';
import { useUIStore } from '@/store/uiStore';

interface HistoryViewProps {
  onClose: () => void;
  onOpenBook: (bookId: number, location?: string) => void;
  onViewDetails: (bookId: number) => void;
  onEditBook: (bookId: number) => void;
  onDeleteBook: (bookId: number) => void;
  dialogs: any;
}

export function HistoryView({
  onClose,
  onOpenBook,
  onViewDetails,
  onEditBook,
  onDeleteBook,
  dialogs
}: HistoryViewProps) {
  const currentDomain = useUIStore(s => s.currentDomain);
  const [books, setBooks] = useState<Book[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const loadHistory = useCallback(async (isLoadMore = false) => {
    if (!isLoadMore) {
      setLoading(true);
      setOffset(0);
    }
    
    try {
      const currentOffset = isLoadMore ? offset : 0;
      const fetchedBooks = await api.getReadingHistory(LIMIT, currentOffset);
      
      if (isLoadMore) {
        setBooks(prev => [...prev, ...fetchedBooks]);
      } else {
        setBooks(fetchedBooks);
      }
      
      setHasMore(fetchedBooks.length === LIMIT);
      setOffset(currentOffset + LIMIT);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    loadHistory();
  }, []);

  const displayBooks = books.filter(book => 
    !searchQuery || book.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      <div className="flex-none sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-5xl mx-auto flex items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <History size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-light text-foreground tracking-tight">Reading History</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Your previously read books and manga
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                title="Close history"
                className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
              >
                <X size={18} />
              </Button>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-background relative">
        {loading && books.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-destructive">{error}</p>
            <Button onClick={() => loadHistory(false)} variant="outline">Retry</Button>
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 opacity-70">
            <History size={48} className="text-muted-foreground" />
            <p className="text-lg text-muted-foreground">No reading history found.</p>
          </div>
        ) : (
          <div className="h-full pt-4 w-full">
            <LibraryGrid
              books={displayBooks}
              currentDomain={currentDomain}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onBookClick={onOpenBook}
              onViewDetails={onViewDetails}
              onEditBook={onEditBook}
              onDeleteBook={onDeleteBook}
              onAddToCollection={dialogs.openCollectionSelectDialog}
              onManageTags={dialogs.openTagSelectDialog}
              hasMoreOverride={hasMore}
              isLoadingOverride={loading}
              onLoadMoreOverride={() => loadHistory(true)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
