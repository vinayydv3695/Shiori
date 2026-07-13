import { useState, useRef, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { X, FolderOpen, File, Upload, Loader2, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { api, ImportResult, isAndroid } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import { useToast } from '../../store/toastStore';
import { useLibraryStore } from '../../store/libraryStore';
import { generateCollectionSuggestions } from '../../lib/collectionSuggestions';
import { SmartCollectionSuggestionDialog } from './SmartCollectionSuggestionDialog';
import type { CollectionSuggestion } from '../../lib/collectionSuggestions';
import { Button } from '../ui/button';

function isPermissionDeniedError(error: unknown) {
  if (typeof error === 'string') {
    return error.toLowerCase().includes('permission denied');
  }

  if (error instanceof Error) {
    return error.message.toLowerCase().includes('permission denied');
  }

  return false;
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFilePaths?: string[];
  autoTriggerMode?: 'files' | 'folder' | null;
}

type ImportMode = 'files' | 'folder';
type ImportStatus = 'idle' | 'importing' | 'completed' | 'error';

export const ImportDialog = ({ open, onOpenChange, initialFilePaths, autoTriggerMode }: ImportDialogProps) => {
  const [mode, setMode] = useState<ImportMode>(autoTriggerMode || (initialFilePaths && initialFilePaths.length > 0 ? 'files' : 'folder'));
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>(
    initialFilePaths && initialFilePaths.length > 0 ? `${initialFilePaths.length} file(s) selected` : ''
  );
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>(initialFilePaths || []);
  const [suggestions, setSuggestions] = useState<CollectionSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const toast = useToast();
  const loadInitialBooks = useLibraryStore(state => state.loadInitialBooks);
  
  // Create refs to access the latest state inside useEffect
  const modeRef = useRef(mode);
  const selectedPathRef = useRef(selectedPath);
  const selectedFilePathsRef = useRef(selectedFilePaths);
  const hasAutoTriggeredRef = useRef(false);
  const handleImportRef = useRef<() => Promise<void>>();

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { selectedPathRef.current = selectedPath; }, [selectedPath]);
  useEffect(() => { selectedFilePathsRef.current = selectedFilePaths; }, [selectedFilePaths]);

  const handleSelectFolder = async () => {
    try {
      const path = await api.openFolderDialog();
      if (path) {
        setSelectedPath(path);
        // On Android, we need to enumerate the folder contents now to get the total count
        if (isAndroid) {
            try {
                const result = await api.enumerateTree(path);
                toast.success('Folder scanned', `${result.files.length} file(s) found in folder`);
            } catch (error) {
                logger.error('[API] SAF folder enumeration error:', error);
                toast.error('Failed to scan folder', 'Could not read the contents of the selected folder');
            }
        }
        
        // Auto start import if triggered from FAB
        if (autoTriggerMode) {
            setTimeout(() => handleImportRef.current?.(), 100);
        }
      } else if (autoTriggerMode) {
        // User cancelled, close dialog
        onOpenChange(false);
      }
    } catch (error: unknown) {
      logger.error('Failed to select folder:', error);
      if (isPermissionDeniedError(error)) {
        toast.error('Permission denied', 'Please grant "All files access" or storage permissions in Android Settings to import your library.');
      } else {
        toast.error('Failed to select folder', 'Could not open folder selection dialog');
      }
    }
  };

  const handleSelectFiles = async () => {
    try {
      const paths = await api.openFileDialog();
      if (paths && paths.length > 0) {
        setSelectedPath(`${paths.length} file(s) selected`);
        setSelectedFilePaths(paths);
        
        // Auto start import if triggered from FAB
        if (autoTriggerMode) {
            setTimeout(() => handleImportRef.current?.(), 100);
        }
      } else if (autoTriggerMode) {
        // User cancelled, close dialog
        onOpenChange(false);
      }
    } catch (error: unknown) {
      logger.error('Failed to select files:', error);
      if (isPermissionDeniedError(error)) {
        toast.error('Permission denied', 'Please grant "All files access" or storage permissions in Android Settings to import your library.');
      } else {
        toast.error('Failed to select files', 'Could not open file selection dialog');
      }
    }
  };

  useEffect(() => {
    if (open && autoTriggerMode && !hasAutoTriggeredRef.current) {
        hasAutoTriggeredRef.current = true;
        if (autoTriggerMode === 'folder') {
            handleSelectFolder();
        } else {
            handleSelectFiles();
        }
    }
    
    if (!open) {
        hasAutoTriggeredRef.current = false;
    }
  }, [open, autoTriggerMode]);

  const MANGA_COMIC_EXTENSIONS = /\.(cbz|cbr|zip)$/i;

  const handleImport = async () => {
    setStatus('importing');
    setResult(null);

    // Get latest state from refs since setTimeout might run with stale closures
    const currentMode = modeRef.current;
    const currentSelectedPath = selectedPathRef.current;
    const currentSelectedFilePaths = selectedFilePathsRef.current;

    try {
      const importResult: ImportResult = { success: [], failed: [], duplicates: [] };

      if (currentMode === 'folder') {
        if (!currentSelectedPath) {
          toast.error('No folder selected', 'Please select a folder to import from');
          setStatus('idle');
          return;
        }
        
        let result: ImportResult;
        
        if (currentSelectedPath.startsWith('content://')) {
          // Android SAF Workflow
          const { files } = await api.enumerateTree(currentSelectedPath);
          if (files.length === 0) {
            throw new Error('No supported book files found in this folder.');
          }

          const localPaths: string[] = [];
          for (const file of files) {
            try {
              const { path: localPath } = await api.copyDocument(file.uri, file.name);
              localPaths.push(localPath);
            } catch (e) {
              logger.warn(`Failed to copy document ${file.name}`, e);
            }
          }

          if (localPaths.length === 0) {
            throw new Error('Failed to copy any files from the selected folder.');
          }

          const mangaFiles = localPaths.filter(p => MANGA_COMIC_EXTENSIONS.test(p));
          const bookFiles = localPaths.filter(p => !MANGA_COMIC_EXTENSIONS.test(p));

          result = { success: [], failed: [], duplicates: [] };
          
          if (mangaFiles.length > 0) {
            const mangaResult = await api.importManga(mangaFiles);
            result.success.push(...mangaResult.success);
            result.failed.push(...mangaResult.failed);
            result.duplicates.push(...mangaResult.duplicates);
          }
          
          if (bookFiles.length > 0) {
            const bookResult = await api.importBooks(bookFiles);
            result.success.push(...bookResult.success);
            result.failed.push(...bookResult.failed);
            result.duplicates.push(...bookResult.duplicates);
          }
        } else {
          result = await api.scanFolderUnified(currentSelectedPath);
        }
        
        importResult.success.push(...result.success);
        importResult.failed.push(...result.failed);
        importResult.duplicates.push(...result.duplicates);
      } else {
        if (currentSelectedFilePaths.length === 0) {
          toast.error('No files selected', 'Please select files to import');
          setStatus('idle');
          return;
        }
        
        const mangaFiles = currentSelectedFilePaths.filter(p => MANGA_COMIC_EXTENSIONS.test(p));
        const bookFiles = currentSelectedFilePaths.filter(p => !MANGA_COMIC_EXTENSIONS.test(p));
        
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

        await loadInitialBooks();

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

  useEffect(() => {
    handleImportRef.current = handleImport;
  }, [mode, selectedPath, selectedFilePaths]);

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
    handleClose();
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleClose}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content aria-describedby={undefined} className="dialog-content fixed left-[50%] top-[50%] z-50 w-[92vw] sm:w-[96vw] md:w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] flex flex-col rounded-2xl border border-border/50 bg-background/95 backdrop-blur-3xl shadow-2xl overflow-hidden max-h-[90vh] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
            
            {/* Header */}
            <div className="flex flex-col border-b border-border/50 shrink-0 bg-muted/20">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Upload className="h-5 w-5 text-primary" />
                  </div>
                  <Dialog.Title className="text-lg font-bold text-foreground">Import Books, Manga & Comics</Dialog.Title>
                </div>
                <Dialog.Close asChild>
                  <button className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Close">
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
              {status === 'idle' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6 sm:space-y-8"
                >
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={() => {
                        setMode('folder');
                        setSelectedPath('');
                      }}
                      className={`group flex-1 flex flex-col items-center text-center gap-3 sm:gap-4 px-4 sm:px-6 py-6 sm:py-8 rounded-2xl border transition-all duration-300 relative overflow-hidden ${
                        mode === 'folder'
                          ? 'border-primary bg-primary/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] shadow-primary/20 scale-[1.02]'
                          : 'border-white/5 bg-secondary/20 hover:bg-secondary/40 hover:border-white/10'
                      }`}
                    >
                      {mode === 'folder' && (
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
                      )}
                      <div className={`p-4 rounded-full transition-transform duration-300 ${mode === 'folder' ? 'bg-primary/20 text-primary scale-110 shadow-inner' : 'bg-secondary text-muted-foreground group-hover:text-foreground group-hover:scale-105'}`}>
                        <FolderOpen className="w-8 h-8" />
                      </div>
                      <div className="space-y-1 relative z-10">
                        <h3 className={`text-base font-semibold tracking-tight transition-colors ${mode === 'folder' ? 'text-primary' : 'text-foreground'}`}>Scan Folder</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                          Recursively scan a folder for eBooks, Manga & Comics
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setMode('files');
                        setSelectedPath('');
                      }}
                      className={`group flex-1 flex flex-col items-center text-center gap-3 sm:gap-4 px-4 sm:px-6 py-6 sm:py-8 rounded-2xl border transition-all duration-300 relative overflow-hidden ${
                        mode === 'files'
                          ? 'border-primary bg-primary/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] shadow-primary/20 scale-[1.02]'
                          : 'border-white/5 bg-secondary/20 hover:bg-secondary/40 hover:border-white/10'
                      }`}
                    >
                      {mode === 'files' && (
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
                      )}
                      <div className={`p-4 rounded-full transition-transform duration-300 ${mode === 'files' ? 'bg-primary/20 text-primary scale-110 shadow-inner' : 'bg-secondary text-muted-foreground group-hover:text-foreground group-hover:scale-105'}`}>
                        <File className="w-8 h-8" />
                      </div>
                      <div className="space-y-1 relative z-10">
                        <h3 className={`text-base font-semibold tracking-tight transition-colors ${mode === 'files' ? 'text-primary' : 'text-foreground'}`}>Select Files</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                          Choose individual eBook, Manga, or Comic files
                        </p>
                      </div>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-foreground px-1">
                      {mode === 'folder' ? 'Selected Folder' : 'Selected Files'}
                    </label>
                    <div className="flex items-center p-1 bg-secondary/10 border border-border/50 rounded-xl focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all">
                      <input
                        type="text"
                        value={selectedPath}
                        readOnly
                        placeholder={mode === 'folder' ? 'No folder selected' : 'No files selected'}
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-3 placeholder:text-muted-foreground truncate w-full outline-none"
                      />
                      <Button
                        onClick={mode === 'folder' ? handleSelectFolder : handleSelectFiles}
                        variant="secondary"
                        size="sm"
                        className="shrink-0 rounded-lg shadow-sm"
                      >
                        Browse
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Info className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      Supported: EPUB, PDF, MOBI, AZW3, TXT, FB2, DJVU, CBZ, CBR
                    </p>
                  </div>
                </motion.div>
              )}

              {status === 'importing' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-16 text-center"
                >
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-primary/20 blur-[40px] rounded-full" />
                    <div className="p-4 bg-card/40 backdrop-blur-md border border-primary/20 rounded-2xl shadow-inner shadow-primary/10">
                      <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-foreground tracking-tight">Importing Items</h3>
                  <p className="text-muted-foreground text-sm mt-2 max-w-[280px] leading-relaxed">
                    This may take a few moments. We are processing your files.
                  </p>
                </motion.div>
              )}

              {status === 'completed' && result && !showSuggestions && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="flex items-center gap-4 pb-4 border-b border-border/50">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl shadow-inner shadow-emerald-500/10">
                      <CheckCircle className="w-8 h-8 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground tracking-tight">Import Complete</h3>
                      <p className="text-sm text-muted-foreground">
                        {result.success.length} item{result.success.length !== 1 ? 's' : ''} imported successfully
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-card/40 backdrop-blur-md border border-emerald-500/20 rounded-xl p-4 text-center transition-all duration-300 hover:border-emerald-500/50 hover:bg-emerald-500/5 group">
                      <div className="text-3xl font-black text-emerald-500 mb-1 group-hover:scale-110 transition-transform duration-300">{result.success.length}</div>
                      <div className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-[0.1em]">Imported</div>
                    </div>
                    <div className="bg-card/40 backdrop-blur-md border border-amber-500/20 rounded-xl p-4 text-center transition-all duration-300 hover:border-amber-500/50 hover:bg-amber-500/5 group">
                      <div className="text-3xl font-black text-amber-500 mb-1 group-hover:scale-110 transition-transform duration-300">{result.duplicates.length}</div>
                      <div className="text-[10px] font-bold text-amber-500/70 uppercase tracking-[0.1em]">Duplicates</div>
                    </div>
                    <div className="bg-card/40 backdrop-blur-md border border-rose-500/20 rounded-xl p-4 text-center transition-all duration-300 hover:border-rose-500/50 hover:bg-rose-500/5 group">
                      <div className="text-3xl font-black text-rose-500 mb-1 group-hover:scale-110 transition-transform duration-300">{result.failed.length}</div>
                      <div className="text-[10px] font-bold text-rose-500/70 uppercase tracking-[0.1em]">Failed</div>
                    </div>
                  </div>

                  {result.failed.length > 0 && (
                    <div className="max-h-48 overflow-y-auto border border-rose-500/20 rounded-xl bg-card/40 backdrop-blur-md custom-scrollbar relative">
                      <div className="bg-rose-500/10 px-4 py-3 border-b border-rose-500/20 sticky top-0 backdrop-blur-xl z-10">
                        <div className="flex items-center gap-2 text-xs font-bold text-rose-500 tracking-wide uppercase">
                          <AlertCircle className="w-4 h-4" />
                          Failed Imports
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        {result.failed.map(([path, error], index) => (
                          <div key={index} className="text-xs bg-background/50 p-3 rounded-lg border border-rose-500/10 transition-colors hover:border-rose-500/30">
                            <div className="font-mono text-foreground/80 truncate mb-1" title={path}>
                              {path.split('/').pop()}
                            </div>
                            <div className="text-rose-500 font-medium">{error}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {status === 'error' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-16 text-center relative"
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-rose-500/10 blur-[60px] rounded-full pointer-events-none -z-10" />
                  <div className="p-4 bg-card/40 backdrop-blur-md border border-rose-500/20 rounded-2xl shadow-inner shadow-rose-500/10 mb-6">
                    <AlertCircle className="w-12 h-12 text-rose-500" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground tracking-tight">Import Failed</h3>
                  <p className="text-muted-foreground text-sm mt-2 max-w-sm leading-relaxed">
                    An unexpected error occurred while trying to import your files. Please try again.
                  </p>
                  <Button
                    onClick={() => setStatus('idle')}
                    variant="outline"
                    className="mt-6"
                  >
                    Try Again
                  </Button>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            {status !== 'importing' && status !== 'error' && (
              <div className="flex items-center justify-end gap-3 p-4 border-t border-border/50 bg-muted/10 shrink-0">
                {status === 'idle' && (
                  <>
                    <Dialog.Close asChild>
                      <Button variant="outline">
                        Cancel
                      </Button>
                    </Dialog.Close>
                    <Button
                      onClick={handleImport}
                      disabled={!selectedPath}
                      className="gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Start Import
                    </Button>
                  </>
                )}
                {status === 'completed' && result && !showSuggestions && (
                  <Button onClick={handleClose}>
                    Done
                  </Button>
                )}
              </div>
            )}
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
