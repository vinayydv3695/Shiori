import { useEffect, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import { EpubReader } from './EpubReader';
import { PdfReader } from './PdfReader';
import { ReaderControls } from './ReaderControls';
import { AnnotationSidebar } from './AnnotationSidebar';
import { X } from '@/components/icons';

interface ReaderLayoutProps {
  bookId: number;
  onClose: () => void;
}

export function ReaderLayout({ bookId, onClose }: ReaderLayoutProps) {
  const {
    currentBookPath,
    currentBookFormat,
    setProgress,
    setAnnotations,
    setSettings,
    closeBook,
  } = useReaderStore();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBookData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Load book file path
        const filePath = await api.getBookFilePath(bookId);
        
        // Determine format from file extension
        const format = filePath.split('.').pop()?.toLowerCase() || 'epub';
        
        // Load book details
        const book = await api.getBook(bookId);

        // Load reading progress
        const progress = await api.getReadingProgress(bookId);
        if (progress) {
          setProgress(progress);
        }

        // Load annotations
        const annotations = await api.getAnnotations(bookId);
        setAnnotations(annotations);

        // Load reader settings
        const settings = await api.getReaderSettings('default');
        setSettings(settings);

        setIsLoading(false);
      } catch (err) {
        console.error('Error loading book data:', err);
        setError('Failed to load book. Please try again.');
        setIsLoading(false);
      }
    };

    loadBookData();
  }, [bookId]);

  const handleClose = () => {
    closeBook();
    onClose();
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4 mx-auto"></div>
          <p className="text-gray-600">Loading reader...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">{error}</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Close Reader
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Top bar with close button */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Close reader"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="text-sm text-gray-600">Reader</span>
        </div>

        <ReaderControls />
      </div>

      {/* Reader content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {currentBookPath && currentBookFormat === 'epub' && (
            <EpubReader bookPath={currentBookPath} bookId={bookId} />
          )}
          {currentBookPath && currentBookFormat === 'pdf' && (
            <PdfReader bookPath={currentBookPath} bookId={bookId} />
          )}
          {!currentBookPath && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">No book loaded</p>
            </div>
          )}
        </div>

        {/* Annotation sidebar */}
        <AnnotationSidebar />
      </div>
    </div>
  );
}
