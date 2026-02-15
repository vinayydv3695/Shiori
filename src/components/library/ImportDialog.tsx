import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, FolderOpen, File, Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { api, ImportResult } from '../../lib/tauri';
import { useToast } from '../../store/toastStore';
import { useLibraryStore } from '../../store/libraryStore';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ImportMode = 'files' | 'folder';
type ImportStatus = 'idle' | 'importing' | 'completed' | 'error';

export const ImportDialog = ({ open, onOpenChange }: ImportDialogProps) => {
  const [mode, setMode] = useState<ImportMode>('folder');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const toast = useToast();
  const { setBooks } = useLibraryStore();

  const handleSelectFolder = async () => {
    try {
      const path = await api.openFolderDialog();
      if (path) {
        setSelectedPath(path);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
      toast.error('Failed to select folder', 'Could not open folder selection dialog');
    }
  };

  const handleSelectFiles = async () => {
    try {
      const paths = await api.openFileDialog();
      if (paths && paths.length > 0) {
        setSelectedPath(`${paths.length} file(s) selected`);
        // Store paths for import
        (window as any).__selectedFilePaths = paths;
      }
    } catch (error) {
      console.error('Failed to select files:', error);
      toast.error('Failed to select files', 'Could not open file selection dialog');
    }
  };

  const handleImport = async () => {
    setStatus('importing');
    setResult(null);

    try {
      let importResult: ImportResult;

      if (mode === 'folder') {
        if (!selectedPath) {
          toast.error('No folder selected', 'Please select a folder to import from');
          setStatus('idle');
          return;
        }
        importResult = await api.scanFolderForBooks(selectedPath);
      } else {
        const paths = (window as any).__selectedFilePaths as string[];
        if (!paths || paths.length === 0) {
          toast.error('No files selected', 'Please select files to import');
          setStatus('idle');
          return;
        }
        importResult = await api.importBooks(paths);
      }

      setResult(importResult);
      setStatus('completed');

      // Show summary toast
      const totalImported = importResult.success.length;
      const totalDuplicates = importResult.duplicates.length;
      const totalFailed = importResult.failed.length;

      if (totalImported > 0) {
        toast.success(
          `Imported ${totalImported} book${totalImported > 1 ? 's' : ''}`,
          totalDuplicates > 0 || totalFailed > 0
            ? `${totalDuplicates} duplicates, ${totalFailed} failed`
            : undefined
        );

        // Reload library
        const books = await api.getBooks();
        setBooks(books);
      } else {
        toast.warning('No books imported', 'All books were either duplicates or failed to import');
      }
    } catch (error) {
      console.error('Import failed:', error);
      setStatus('error');
      toast.error('Import failed', 'An error occurred during import');
    }
  };

  const handleClose = () => {
    setStatus('idle');
    setResult(null);
    setSelectedPath('');
    (window as any).__selectedFilePaths = null;
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto z-50">
          <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 z-10">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-xl font-semibold">Import Books</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Import Mode Selection */}
            {status === 'idle' && (
              <>
                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setMode('folder');
                      setSelectedPath('');
                    }}
                    className={`flex-1 flex flex-col items-center gap-3 px-6 py-8 rounded-lg border-2 transition-all ${
                      mode === 'folder'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <FolderOpen className="w-12 h-12 text-blue-600 dark:text-blue-400" />
                    <div className="text-center">
                      <div className="font-medium">Scan Folder</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Recursively scan a folder for eBooks
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setMode('files');
                      setSelectedPath('');
                    }}
                    className={`flex-1 flex flex-col items-center gap-3 px-6 py-8 rounded-lg border-2 transition-all ${
                      mode === 'files'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <File className="w-12 h-12 text-blue-600 dark:text-blue-400" />
                    <div className="text-center">
                      <div className="font-medium">Select Files</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Choose individual eBook files
                      </div>
                    </div>
                  </button>
                </div>

                {/* Path Selection */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {mode === 'folder' ? 'Folder Path' : 'Selected Files'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={selectedPath}
                      readOnly
                      placeholder={mode === 'folder' ? 'No folder selected' : 'No files selected'}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                    />
                    <button
                      onClick={mode === 'folder' ? handleSelectFolder : handleSelectFiles}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Browse...
                    </button>
                  </div>
                </div>

                {/* Supported Formats */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="text-sm font-medium mb-1">Supported Formats:</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    EPUB, PDF, MOBI, AZW3, TXT, FB2, DJVU
                  </div>
                </div>

                {/* Import Button */}
                <div className="flex justify-end gap-3 pt-4">
                  <Dialog.Close asChild>
                    <button className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    onClick={handleImport}
                    disabled={!selectedPath}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Start Import
                  </button>
                </div>
              </>
            )}

            {/* Importing Status */}
            {status === 'importing' && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-4" />
                <div className="text-lg font-medium">Importing books...</div>
                <div className="text-sm text-gray-500 mt-1">This may take a few moments</div>
              </div>
            )}

            {/* Import Results */}
            {status === 'completed' && result && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                  <div>
                    <div className="text-lg font-medium">Import Complete</div>
                    <div className="text-sm text-gray-500">
                      {result.success.length} book{result.success.length !== 1 ? 's' : ''} imported successfully
                    </div>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-600">{result.success.length}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Imported</div>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <div className="text-2xl font-bold text-amber-600">{result.duplicates.length}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Duplicates</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="text-2xl font-bold text-red-600">{result.failed.length}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Failed</div>
                  </div>
                </div>

                {/* Failed Files Details */}
                {result.failed.length > 0 && (
                  <div className="max-h-48 overflow-y-auto border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="bg-red-50 dark:bg-red-900/20 px-3 py-2 border-b border-red-200 dark:border-red-800 sticky top-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-red-900 dark:text-red-100">
                        <AlertCircle className="w-4 h-4" />
                        Failed Imports
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      {result.failed.map(([path, error], index) => (
                        <div key={index} className="text-xs">
                          <div className="font-mono text-gray-700 dark:text-gray-300 truncate" title={path}>
                            {path.split('/').pop()}
                          </div>
                          <div className="text-red-600 dark:text-red-400">{error}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Done Button */}
                <div className="flex justify-end pt-4">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Error State */}
            {status === 'error' && (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="w-16 h-16 text-red-600 mb-4" />
                <div className="text-lg font-medium">Import Failed</div>
                <div className="text-sm text-gray-500 mt-1">An error occurred during import</div>
                <button
                  onClick={() => setStatus('idle')}
                  className="mt-4 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
