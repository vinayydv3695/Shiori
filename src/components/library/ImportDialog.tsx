import { useState, useRef, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { X, FolderOpen, File, Upload, Loader2, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { api, ImportResult, isAndroid } from '../../lib/tauri';
import { emptyImportResult, mergeImportResults } from '../../lib/importResults';
import { useTombstoneConfirm } from '../../hooks/useTombstoneConfirm';
import { logger } from '@/lib/logger';
import { useToast } from '../../store/toastStore';
import { useLibraryStore } from '../../store/libraryStore';
import { generateShelfSuggestions } from '../../lib/shelfSuggestions';
import { SmartShelfSuggestionDialog } from './SmartShelfSuggestionDialog';
import type { ShelfSuggestion } from '../../lib/shelfSuggestions';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

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
  const [suggestions, setSuggestions] = useState<ShelfSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const toast = useToast();
  const loadInitialBooks = useLibraryStore(state => state.loadInitialBooks);
  const { confirmTombstones, dismissTombstoneConfirm, tombstoneDialog } = useTombstoneConfirm();
  const closedRef = useRef(false);
  
  // Create refs to access the latest state inside useEffect
  const modeRef = useRef(mode);
  const selectedPathRef = useRef(selectedPath);
  const selectedFilePathsRef = useRef(selectedFilePaths);
  const hasAutoTriggeredRef = useRef(false);
  const handleImportRef = useRef<() => Promise<void>>(null as any);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { selectedPathRef.current = selectedPath; }, [selectedPath]);
  useEffect(() => { selectedFilePathsRef.current = selectedFilePaths; }, [selectedFilePaths]);

  useEffect(() => {
    if (autoTriggerMode) {
      setMode(autoTriggerMode);
      modeRef.current = autoTriggerMode;
    }
  }, [autoTriggerMode]);

  const handleSelectFolder = async () => {
    try {
      const path = await api.openFolderDialog();
      if (path) {
        setSelectedPath(path);
        selectedPathRef.current = path; // Immediate update for auto-trigger
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
        selectedFilePathsRef.current = paths; // Immediate update for auto-trigger
        
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

  /** Run the standard file import path (manga/comic vs book split) for a set of paths. */
  const runImportForPaths = async (paths: string[]): Promise<ImportResult> => {
    const importResult = emptyImportResult();
    const mangaFiles = paths.filter(p => MANGA_COMIC_EXTENSIONS.test(p));
    const bookFiles = paths.filter(p => !MANGA_COMIC_EXTENSIONS.test(p));

    if (mangaFiles.length > 0) {
      mergeImportResults(importResult, await api.importManga(mangaFiles));
    }

    if (bookFiles.length > 0) {
      mergeImportResults(importResult, await api.importBooks(bookFiles));
    }

    return importResult;
  };

  const finalizeImport = async (importResult: ImportResult) => {
    if (closedRef.current) return;

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
      
      // Fetch the full book metadata for newly imported paths
      // This allows generating shelf suggestions based on series metadata
      const importedBooks = await api.getBooksByPaths(importResult.success);

      const shelfSuggestions = generateShelfSuggestions(importedBooks);
      
      if (shelfSuggestions.length > 0) {
        setSuggestions(shelfSuggestions);
        setShowSuggestions(true);
      }
    } else {
      toast.warning(
        'No items imported',
        importResult.previouslyDeleted.length > 0
          ? 'All items were duplicates, failed, or previously deleted'
          : 'All items were either duplicates or failed to import'
      );
    }
  };

  const handleImport = async () => {
    setStatus('importing');
    setResult(null);
    closedRef.current = false;

    // Get latest state from refs since setTimeout might run with stale closures
    const currentMode = modeRef.current;
    const currentSelectedPath = selectedPathRef.current;
    const currentSelectedFilePaths = selectedFilePathsRef.current;

    try {
      const importResult = emptyImportResult();

      if (currentMode === 'folder') {
        if (!currentSelectedPath) {
          toast.error('No folder selected', 'Please select a folder to import from');
          setStatus('idle');
          return;
        }
        
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

          mergeImportResults(importResult, await runImportForPaths(localPaths));
        } else {
          mergeImportResults(importResult, await api.scanFolderUnified(currentSelectedPath));
        }
      } else {
        if (currentSelectedFilePaths.length === 0) {
          toast.error('No files selected', 'Please select files to import');
          setStatus('idle');
          return;
        }

        mergeImportResults(importResult, await runImportForPaths(currentSelectedFilePaths));
      }

      // Previously-deleted files: ask before re-importing them.
      if (importResult.previouslyDeleted.length > 0) {
        const importAnyway = await confirmTombstones(importResult.previouslyDeleted);
        if (closedRef.current) return;

        if (!importAnyway) {
          // Skipped — they stay in previouslyDeleted and show as skipped in the result view.
          await finalizeImport(importResult);
          return;
        }

        // Forget the deletions, then re-import exactly those paths.
        setStatus('importing');
        const cleared: string[] = [];
        for (const path of importResult.previouslyDeleted) {
          try {
            await api.clearTombstone(path);
            cleared.push(path);
          } catch (error) {
            logger.warn(`Failed to clear tombstone for ${path}`, error);
          }
        }

        if (cleared.length > 0) {
          const retryResult = await runImportForPaths(cleared);
          mergeImportResults(importResult, retryResult);
          // Paths we could not clear (or that came back tombstoned) stay skipped.
          importResult.previouslyDeleted = [
            ...importResult.previouslyDeleted.filter(path => !cleared.includes(path)),
            ...retryResult.previouslyDeleted,
          ];
        }
      }

      await finalizeImport(importResult);
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
    closedRef.current = true;
    dismissTombstoneConfirm();
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

  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      const filePaths = droppedFiles.map(f => (f as any).path || f.name).filter(Boolean);
      if (filePaths.length > 0) {
        setMode('files');
        setSelectedPath(`${filePaths.length} file(s) dropped`);
        setSelectedFilePaths(filePaths);
        selectedFilePathsRef.current = filePaths;
        toast.success(`Selected ${filePaths.length} file(s)`, 'Click Start Import to begin');
      }
    }
  };

  const isVisuallyOpen = open && (!autoTriggerMode || status !== 'idle');

  return (
    <>
      <Dialog.Root open={isVisuallyOpen} onOpenChange={handleClose}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[100] bg-black/75 backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content 
            aria-describedby={undefined} 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="dialog-content fixed left-[50%] top-[50%] z-[100] w-[92vw] sm:w-[96vw] md:w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] flex flex-col rounded-3xl border border-border/80 bg-background shadow-2xl overflow-hidden max-h-[90vh] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-4 border-b border-border/40 bg-secondary/15 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/12 border border-primary/25 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <Dialog.Title className="text-base font-extrabold text-foreground tracking-tight leading-none">
                    Import Library
                  </Dialog.Title>
                  <p className="text-xs text-muted-foreground font-medium mt-1">
                    Add books, manga, or comics to your library
                  </p>
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/40 transition-colors" title="Close">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5 relative">
              {/* Drag & Drop Visual Overlay */}
              {isDraggingOver && (
                <div className="absolute inset-4 z-50 bg-primary/95 backdrop-blur-md rounded-2xl border-2 border-dashed border-primary-foreground flex flex-col items-center justify-center text-primary-foreground p-6 text-center animate-in fade-in-0 duration-150 shadow-2xl">
                  <Upload className="w-12 h-12 mb-2 animate-bounce" />
                  <h3 className="text-lg font-extrabold tracking-tight">Drop files to import</h3>
                </div>
              )}

              {status === 'idle' && (
                <motion.div 
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  {/* Mode Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Folder Scan Card */}
                    <div 
                      onClick={() => { setMode('folder'); handleSelectFolder(); }}
                      className={cn(
                        "group cursor-pointer flex flex-col items-center justify-center p-6 text-center rounded-2xl border transition-all duration-200 gap-3",
                        mode === 'folder' && selectedPath
                          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                          : "border-border/60 bg-card hover:bg-secondary/30 hover:border-primary/40"
                      )}
                    >
                      <div className="w-14 h-14 rounded-2xl bg-primary/12 text-primary border border-primary/20 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                        <FolderOpen className="w-7 h-7" />
                      </div>
                      <h3 className="text-sm font-extrabold text-foreground tracking-tight">Scan Folder</h3>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full rounded-xl font-extrabold text-xs mt-1"
                      >
                        Browse Folder
                      </Button>
                    </div>

                    {/* Files Card */}
                    <div 
                      onClick={() => { setMode('files'); handleSelectFiles(); }}
                      className={cn(
                        "group cursor-pointer flex flex-col items-center justify-center p-6 text-center rounded-2xl border transition-all duration-200 gap-3",
                        mode === 'files' && selectedPath
                          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                          : "border-border/60 bg-card hover:bg-secondary/30 hover:border-primary/40"
                      )}
                    >
                      <div className="w-14 h-14 rounded-2xl bg-primary/12 text-primary border border-primary/20 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                        <File className="w-7 h-7" />
                      </div>
                      <h3 className="text-sm font-extrabold text-foreground tracking-tight">Select Files</h3>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full rounded-xl font-extrabold text-xs mt-1"
                      >
                        Browse Files
                      </Button>
                    </div>
                  </div>

                  {/* Selected Path Display Box */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80 px-0.5">
                      {mode === 'folder' ? 'Selected Directory' : 'Selected Files'}
                    </label>
                    <div className="flex items-center gap-2 p-2 bg-secondary/30 border border-border/60 rounded-xl focus-within:ring-1 focus-within:ring-primary/40 transition-all">
                      <input
                        type="text"
                        value={selectedPath}
                        readOnly
                        placeholder={mode === 'folder' ? 'No folder selected yet...' : 'No files selected yet...'}
                        className="flex-1 bg-transparent border-none focus:ring-0 text-xs font-bold text-foreground placeholder:text-muted-foreground/50 px-2 outline-none truncate"
                      />
                      {selectedPath && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setSelectedPath(''); setSelectedFilePaths([]); }}
                          className="h-7 px-2.5 rounded-lg text-xs font-bold text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Supported Formats Footnote */}
                  <p className="text-[11px] font-medium text-center text-muted-foreground/80 pt-1">
                    Supported: <span className="font-bold text-foreground/90">EPUB • PDF • MOBI • AZW3 • CBZ • CBR • TXT • FB2 • DJVU</span>
                  </p>
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

                  {result.previouslyDeleted.length > 0 && (
                    <div className="border border-amber-500/20 rounded-xl bg-card/40 backdrop-blur-md overflow-hidden">
                      <div className="bg-amber-500/10 px-4 py-3 border-b border-amber-500/20">
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-500 tracking-wide uppercase">
                          <Info className="w-4 h-4" />
                          Skipped (Previously Deleted)
                        </div>
                      </div>
                      <div className="p-3 space-y-1.5">
                        {result.previouslyDeleted.map((path, index) => (
                          <div key={index} className="text-xs font-mono text-muted-foreground truncate" title={path}>
                            {path.split('/').pop()}
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
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/50 bg-secondary/30 shrink-0">
                {status === 'idle' && (
                  <>
                    <Dialog.Close asChild>
                      <Button variant="ghost" className="rounded-xl font-bold text-xs px-4">
                        Cancel
                      </Button>
                    </Dialog.Close>
                    <Button
                      onClick={handleImport}
                      disabled={!selectedPath}
                      className="gap-2 rounded-xl font-extrabold text-xs px-6 shadow-lg shadow-primary/25 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all"
                    >
                      <Upload className="w-4 h-4" />
                      Start Import
                    </Button>
                  </>
                )}
                {status === 'completed' && result && !showSuggestions && (
                  <Button onClick={handleClose} className="rounded-xl font-extrabold text-xs px-6 shadow-lg shadow-primary/25">
                    Done
                  </Button>
                )}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {result && (
        <SmartShelfSuggestionDialog
          open={showSuggestions}
          onOpenChange={setShowSuggestions}
          suggestions={suggestions}
          successfulPaths={result.success}
          onComplete={handleSuggestionsComplete}
        />
      )}
      {tombstoneDialog}
    </>
  );
};
