import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FolderOpen, File, Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { api, ImportResult } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import { useToast } from '../../store/toastStore';
import { useLibraryStore } from '../../store/libraryStore';
import { generateCollectionSuggestions } from '../../lib/collectionSuggestions';
import { SmartCollectionSuggestionDialog } from './SmartCollectionSuggestionDialog';
import type { CollectionSuggestion } from '../../lib/collectionSuggestions';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFilePaths?: string[];
}

type ImportMode = 'files' | 'folder';
type ImportStatus = 'idle' | 'importing' | 'completed' | 'error';

export const ImportDialog = ({ open, onOpenChange, initialFilePaths }: ImportDialogProps) => {
  const [mode, setMode] = useState<ImportMode>(initialFilePaths && initialFilePaths.length > 0 ? 'files' : 'folder');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>(
    initialFilePaths && initialFilePaths.length > 0 ? `${initialFilePaths.length} file(s) selected` : ''
  );
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>(initialFilePaths || []);
  const [suggestions, setSuggestions] = useState<CollectionSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const toast = useToast();
  const setBooks = useLibraryStore(state => state.setBooks);

  const handleSelectFolder = async () => {
    try {
      const path = await api.openFolderDialog();
      if (path) {
        setSelectedPath(path);
      }
     } catch (error) {
       logger.error('Failed to select folder:', error);
       toast.error('Failed to select folder', 'Could not open folder selection dialog');
     }
  };

  const handleSelectFiles = async () => {
    try {
      const paths = await api.openFileDialog();
      if (paths && paths.length > 0) {
        setSelectedPath(`${paths.length} file(s) selected`);
        setSelectedFilePaths(paths);
      }
     } catch (error) {
       logger.error('Failed to select files:', error);
       toast.error('Failed to select files', 'Could not open file selection dialog');
     }
  };

  const MANGA_COMIC_EXTENSIONS = /\.(cbz|cbr)$/i;

  const handleImport = async () => {
    setStatus('importing');
    setResult(null);

    try {
      let importResult: ImportResult = { success: [], failed: [], duplicates: [] };

      if (mode === 'folder') {
        if (!selectedPath) {
          toast.error('No folder selected', 'Please select a folder to import from');
          setStatus('idle');
          return;
        }
        // Scan folder for both books and manga/comics in parallel
        const [bookResult, mangaResult] = await Promise.all([
          api.scanFolderForBooks(selectedPath),
          api.scanFolderForManga(selectedPath),
        ]);
        importResult.success.push(...bookResult.success, ...mangaResult.success);
        importResult.failed.push(...bookResult.failed, ...mangaResult.failed);
        importResult.duplicates.push(...bookResult.duplicates, ...mangaResult.duplicates);
      } else {
        if (selectedFilePaths.length === 0) {
          toast.error('No files selected', 'Please select files to import');
          setStatus('idle');
          return;
        }
        
        const mangaFiles = selectedFilePaths.filter(p => MANGA_COMIC_EXTENSIONS.test(p));
        const bookFiles = selectedFilePaths.filter(p => !MANGA_COMIC_EXTENSIONS.test(p));
        
        if (mangaFiles.length > 0) {
          const mangaResult = await api.importManga(mangaFiles);
          importResult.success.push(...mangaResult.success);
          importResult.failed.push(...mangaResult.failed);
          importResult.duplicates.push(...mangaResult.duplicates);
        }
        
        if (bookFiles.length > 0) {
          const bookResult = await api.importBooks(bookFiles);
          importResult.success.push(...bookResult.success);
          importResult.failed.push(...bookResult.failed);
          importResult.duplicates.push(...bookResult.duplicates);
        }
      }

      setResult(importResult);
      setStatus('completed');

      const totalImported = importResult.success.length;
      const totalDuplicates = importResult.duplicates.length;
      const totalFailed = importResult.failed.length;

      if (totalImported > 0) {
        toast.success(
          `Imported ${totalImported} item${totalImported > 1 ? 's' : ''}`,
          totalDuplicates > 0 || totalFailed > 0
            ? `${totalDuplicates} duplicates, ${totalFailed} failed`
            : undefined
        );

        const books = await api.getBooks();
        setBooks(books);

        const collectionSuggestions = generateCollectionSuggestions(
          importResult.success
        );
        
        if (collectionSuggestions.length > 0) {
          setSuggestions(collectionSuggestions);
          setShowSuggestions(true);
        }
      } else {
        toast.warning('No items imported', 'All items were either duplicates or failed to import');
      }
     } catch (error) {
       logger.error('Import failed:', error);
       setStatus('error');
       toast.error('Import failed', 'An error occurred during import');
     }
  };

  const handleClose = () => {
    setStatus('idle');
    setResult(null);
    setSelectedPath('');
    setSelectedFilePaths([]);
    setSuggestions([]);
    setShowSuggestions(false);
    onOpenChange(false);
  };

  const handleSuggestionsComplete = () => {
    setShowSuggestions(false);
    setTimeout(() => {
      handleClose();
    }, 500);
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleClose}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card/40 backdrop-blur-2xl border border-border/50 rounded-[2rem] shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-500 custom-scrollbar">
            <div className="sticky top-0 bg-transparent backdrop-blur-xl border-b border-border/50 px-6 py-5 z-10">
              <div className="flex items-center justify-between">
                <Dialog.Title className="text-3xl font-black tracking-tight text-foreground">Import Books, Manga & Comics</Dialog.Title>
                <Dialog.Close asChild>
                 <button className="p-2.5 bg-card/40 hover:bg-card/80 border border-border/50 rounded-2xl transition-all duration-300 text-muted-foreground hover:text-foreground" title="Close">
                     <X className="w-5 h-5" />
                   </button>
                </Dialog.Close>
              </div>
            </div>

            <div className="p-8 space-y-8">
              {status === 'idle' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        setMode('folder');
                        setSelectedPath('');
                      }}
                      className={`group flex-1 flex flex-col items-center text-center gap-6 px-6 py-10 rounded-3xl border transition-all duration-500 relative overflow-hidden ${
                        mode === 'folder'
                          ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.15)]'
                          : 'border-border/50 bg-card/40 backdrop-blur-md hover:border-emerald-500/50 hover:bg-card/60'
                      }`}
                    >
                      <div className={`absolute top-0 right-0 w-32 h-32 opacity-20 bg-gradient-to-bl from-emerald-500 to-transparent rounded-bl-full -z-10 transition-transform duration-700 ${mode === 'folder' ? 'scale-150' : 'group-hover:scale-150'}`} />
                      <div className={`p-5 rounded-2xl shadow-sm transition-transform duration-500 ${mode === 'folder' ? 'bg-background/80 scale-110 text-emerald-500' : 'bg-background/50 text-muted-foreground group-hover:text-emerald-500 group-hover:scale-110'}`}>
                        <FolderOpen className="w-10 h-10" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold text-foreground">Scan Folder</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Recursively scan a folder for eBooks, Manga & Comics
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setMode('files');
                        setSelectedPath('');
                      }}
                      className={`group flex-1 flex flex-col items-center text-center gap-6 px-6 py-10 rounded-3xl border transition-all duration-500 relative overflow-hidden ${
                        mode === 'files'
                          ? 'border-blue-500/50 bg-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.15)]'
                          : 'border-border/50 bg-card/40 backdrop-blur-md hover:border-blue-500/50 hover:bg-card/60'
                      }`}
                    >
                      <div className={`absolute top-0 right-0 w-32 h-32 opacity-20 bg-gradient-to-bl from-blue-500 to-transparent rounded-bl-full -z-10 transition-transform duration-700 ${mode === 'files' ? 'scale-150' : 'group-hover:scale-150'}`} />
                      <div className={`p-5 rounded-2xl shadow-sm transition-transform duration-500 ${mode === 'files' ? 'bg-background/80 scale-110 text-blue-500' : 'bg-background/50 text-muted-foreground group-hover:text-blue-500 group-hover:scale-110'}`}>
                        <File className="w-10 h-10" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold text-foreground">Select Files</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Choose individual eBook, Manga, or Comic files
                        </p>
                      </div>
                    </button>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-foreground tracking-tight">
                      {mode === 'folder' ? 'Folder Path' : 'Selected Files'}
                    </label>
                    <div className="flex gap-3">
                      <div className="flex-1 relative group">
                        <div className="absolute inset-0 bg-primary/5 blur-md rounded-2xl group-hover:bg-primary/10 transition-colors" />
                        <input
                          type="text"
                          value={selectedPath}
                          readOnly
                          placeholder={mode === 'folder' ? 'No folder selected' : 'No files selected'}
                          className="relative w-full px-5 py-4 border border-border/50 rounded-2xl bg-card/40 backdrop-blur-md text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:border-primary/50 outline-none transition-all shadow-sm"
                        />
                      </div>
                      <button
                        onClick={mode === 'folder' ? handleSelectFolder : handleSelectFiles}
                        className="px-8 py-4 bg-card/40 hover:bg-card/80 text-foreground border border-border/50 rounded-2xl transition-all duration-300 font-medium whitespace-nowrap shadow-sm hover:shadow backdrop-blur-md hover:border-primary/30"
                      >
                        Browse...
                      </button>
                    </div>
                  </div>

                  <div className="bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl p-6 flex items-start gap-5 group hover:border-primary/30 transition-colors duration-500">
                    <div className="p-3 bg-background/50 rounded-xl text-primary mt-0.5 shadow-sm group-hover:scale-110 transition-transform duration-500">
                      <Loader2 className="w-6 h-6" />
                    </div>
                    <div className="space-y-1.5">
                      <h4 className="text-base font-bold text-foreground tracking-tight">Supported Formats</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        EPUB, PDF, MOBI, AZW3, TXT, FB2, DJVU, CBZ, CBR
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-8 border-t border-border/50">
                    <Dialog.Close asChild>
                      <button className="px-6 py-3 bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl hover:bg-card/80 transition-all duration-300 font-medium text-muted-foreground hover:text-foreground">
                        Cancel
                      </button>
                    </Dialog.Close>
                    <button
                      onClick={handleImport}
                      disabled={!selectedPath}
                      className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/30 disabled:text-white/50 disabled:cursor-not-allowed text-white rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all duration-300 flex items-center gap-2 font-bold"
                    >
                      <Upload className="w-5 h-5" />
                      Start Import
                    </button>
                  </div>
                </motion.div>
              )}

              {status === 'importing' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-20 text-center"
                >
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full" />
                    <div className="p-6 bg-card/40 backdrop-blur-md border border-primary/20 rounded-[2rem] shadow-inner shadow-primary/10">
                      <Loader2 className="w-16 h-16 text-primary animate-spin" />
                    </div>
                  </div>
                        <h3 className="text-3xl font-black text-foreground tracking-tight">Importing Items</h3>
                  <p className="text-muted-foreground text-lg mt-4 max-w-[280px] leading-relaxed">
                    This may take a few moments. We are processing your files.
                  </p>
                </motion.div>
              )}

              {status === 'completed' && result && !showSuggestions && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <div className="flex items-center gap-6 pb-6 border-b border-border/50">
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-[2rem] shadow-inner shadow-emerald-500/10">
                      <CheckCircle className="w-12 h-12 text-emerald-500" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-3xl font-black text-foreground tracking-tight">Import Complete</h3>
                      <p className="text-lg text-muted-foreground">
                        {result.success.length} item{result.success.length !== 1 ? 's' : ''} imported successfully
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-5">
                    <div className="bg-card/40 backdrop-blur-md border border-emerald-500/20 rounded-3xl p-6 text-center transition-all duration-500 hover:border-emerald-500/50 hover:bg-emerald-500/5 group">
                      <div className="text-4xl font-black text-emerald-500 mb-2 group-hover:scale-110 transition-transform duration-500">{result.success.length}</div>
                      <div className="text-xs font-bold text-emerald-500/70 uppercase tracking-[0.2em]">Imported</div>
                    </div>
                    <div className="bg-card/40 backdrop-blur-md border border-amber-500/20 rounded-3xl p-6 text-center transition-all duration-500 hover:border-amber-500/50 hover:bg-amber-500/5 group">
                      <div className="text-4xl font-black text-amber-500 mb-2 group-hover:scale-110 transition-transform duration-500">{result.duplicates.length}</div>
                      <div className="text-xs font-bold text-amber-500/70 uppercase tracking-[0.2em]">Duplicates</div>
                    </div>
                    <div className="bg-card/40 backdrop-blur-md border border-rose-500/20 rounded-3xl p-6 text-center transition-all duration-500 hover:border-rose-500/50 hover:bg-rose-500/5 group">
                      <div className="text-4xl font-black text-rose-500 mb-2 group-hover:scale-110 transition-transform duration-500">{result.failed.length}</div>
                      <div className="text-xs font-bold text-rose-500/70 uppercase tracking-[0.2em]">Failed</div>
                    </div>
                  </div>

                  {result.failed.length > 0 && (
                    <div className="max-h-48 overflow-y-auto border border-rose-500/20 rounded-3xl bg-card/40 backdrop-blur-md custom-scrollbar relative">
                      <div className="bg-rose-500/10 px-6 py-4 border-b border-rose-500/20 sticky top-0 backdrop-blur-xl z-10">
                        <div className="flex items-center gap-3 text-sm font-bold text-rose-500 tracking-wide uppercase">
                          <AlertCircle className="w-5 h-5" />
                          Failed Imports
                        </div>
                      </div>
                      <div className="p-5 space-y-3">
                        {result.failed.map(([path, error], index) => (
                          <div key={index} className="text-sm bg-background/50 p-4 rounded-2xl border border-rose-500/10 transition-colors hover:border-rose-500/30">
                            <div className="font-mono text-foreground/80 truncate mb-1.5" title={path}>
                              {path.split('/').pop()}
                            </div>
                            <div className="text-rose-500 text-xs font-semibold">{error}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-6 border-t border-border/50">
                    <button
                      onClick={handleClose}
                      className="px-10 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-[0_0_20px_rgba(var(--primary),0.2)] transition-all duration-300 font-bold"
                    >
                      Done
                    </button>
                  </div>
                </motion.div>
              )}

              {status === 'error' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-20 text-center relative"
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-rose-500/10 blur-[80px] rounded-full pointer-events-none -z-10" />
                  <div className="p-6 bg-card/40 backdrop-blur-md border border-rose-500/20 rounded-[2rem] shadow-inner shadow-rose-500/10 mb-8">
                    <AlertCircle className="w-16 h-16 text-rose-500" />
                  </div>
                  <h3 className="text-3xl font-black text-foreground tracking-tight">Import Failed</h3>
                  <p className="text-muted-foreground text-lg mt-4 max-w-sm leading-relaxed">
                    An unexpected error occurred while trying to import your files. Please try again.
                  </p>
                  <button
                    onClick={() => setStatus('idle')}
                    className="mt-10 px-8 py-3 bg-card/40 hover:bg-card/80 text-foreground border border-border/50 rounded-2xl transition-all duration-300 font-bold shadow-sm"
                  >
                    Try Again
                  </button>
                </motion.div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {result && (
        <SmartCollectionSuggestionDialog
          open={showSuggestions}
          onOpenChange={setShowSuggestions}
          suggestions={suggestions}
          successfulPaths={result.success}
          onComplete={handleSuggestionsComplete}
        />
      )}
    </>
  );
};
