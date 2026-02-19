import React, { useState, useEffect } from 'react';
import { useConversionStore } from '../../store/conversionStore';
import { open } from '@tauri-apps/plugin-dialog';
import { api } from '../../lib/tauri';

interface ConversionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  bookPath?: string;
  bookFormat?: string;
  bookId?: number;
}

export const ConversionDialog: React.FC<ConversionDialogProps> = ({
  isOpen,
  onClose,
  bookPath: initialBookPath,
  bookFormat: initialFormat,
  bookId,
}) => {
  const { submitConversion, supportedFormats, loadSupportedFormats, isLoading } = useConversionStore();
  
  const [bookPath, setBookPath] = useState(initialBookPath || '');
  const [outputFormat, setOutputFormat] = useState('epub');
  const [outputDir, setOutputDir] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch book details if bookId is provided
  useEffect(() => {
    const fetchBookDetails = async () => {
      if (bookId && !initialBookPath) {
        try {
          const book = await api.getBook(bookId);
          const filePath = await api.getBookFilePath(bookId);
          setBookPath(filePath);
          // Optionally set a different default output format based on current format
          if (book.file_format.toLowerCase() === 'epub') {
            setOutputFormat('pdf');
          } else {
            setOutputFormat('epub');
          }
        } catch (error) {
          console.error('Failed to fetch book details:', error);
          setError('Failed to load book information');
        }
      }
    };

    if (isOpen) {
      fetchBookDetails();
    }
  }, [bookId, initialBookPath, isOpen]);

  useEffect(() => {
    if (isOpen && supportedFormats.length === 0) {
      loadSupportedFormats();
    }
  }, [isOpen, supportedFormats.length, loadSupportedFormats]);

  useEffect(() => {
    if (initialBookPath) {
      setBookPath(initialBookPath);
    }
  }, [initialBookPath]);

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { 
            name: 'eBooks', 
            extensions: ['epub', 'pdf', 'mobi', 'azw3', 'txt', 'html', 'docx', 'fb2', 'cbz', 'cbr'] 
          }
        ],
      });
      
      if (selected && typeof selected === 'string') {
        setBookPath(selected);
      }
    } catch (err) {
      setError('Failed to select file');
      console.error(err);
    }
  };

  const handleSelectOutputDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      
      if (selected && typeof selected === 'string') {
        setOutputDir(selected);
      }
    } catch (err) {
      setError('Failed to select directory');
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!bookPath) {
      setError('Please select a book to convert');
      return;
    }

    try {
      const jobId = await submitConversion(
        bookPath,
        outputFormat,
        outputDir || undefined
      );
      
      console.log('Conversion job submitted:', jobId);
      onClose();
    } catch (err) {
      setError(String(err));
    }
  };

  const getAvailableFormats = () => {
    if (!bookPath || !initialFormat) {
      return ['epub', 'pdf', 'mobi', 'txt'];
    }
    
    const conversion = supportedFormats.find(f => f.from === initialFormat);
    return conversion?.to || ['epub'];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Convert Book
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Input File */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Input File
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={bookPath}
                onChange={(e) => setBookPath(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Select a book file..."
                readOnly
              />
              <button
                type="button"
                onClick={handleSelectFile}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Output Format */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Output Format
            </label>
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {getAvailableFormats().map(format => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Output Directory */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Output Directory (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Same as input file..."
                readOnly
              />
              <button
                type="button"
                onClick={handleSelectOutputDir}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-md">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !bookPath}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Converting...' : 'Convert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
