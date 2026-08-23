import { useCallback, useState, type ReactNode } from 'react';
import { api, type ImportResult as ApiImportResult } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { useLibraryStore } from '@/store/libraryStore';
import { useTombstoneConfirm } from '@/hooks/useTombstoneConfirm';
import { copyDocumentsWithRetry } from '@/lib/safImport';

type ImportStatus = 'idle' | 'scanning' | 'importing' | 'completed' | 'error';

export interface ImportResult {
  success: number;
  failed: number;
  duplicates: number;
  previouslyDeleted: number;
  /** Number of files found by the scanner (content:// branch only). */
  total?: number;
}

interface UseImportState {
  status: ImportStatus;
  progress: number;
  results: ImportResult | null;
  currentFile: string | null;
  error: string | null;
}

interface UseImportResult extends UseImportState {
  selectAndImportFolder: () => Promise<void>;
  importFromPath: (path: string) => Promise<void>;
  reset: () => void;
  tombstoneDialog: ReactNode;
}

const INITIAL_STATE: UseImportState = {
  status: 'idle',
  progress: 0,
  results: null,
  currentFile: null,
  error: null,
};

const EMPTY_IMPORT_RESULT: ApiImportResult = {
  success: [],
  failed: [],
  duplicates: [],
  previouslyDeleted: [],
};

const mergeResults = (acc: ApiImportResult, curr: ApiImportResult): ApiImportResult => ({
  success: [...acc.success, ...curr.success],
  failed: [...acc.failed, ...curr.failed],
  duplicates: [...acc.duplicates, ...curr.duplicates],
  previouslyDeleted: [...acc.previouslyDeleted, ...curr.previouslyDeleted],
});

const toCountResult = (result: ApiImportResult, total?: number): ImportResult => ({
  success: result.success.length,
  failed: result.failed.length,
  duplicates: result.duplicates.length,
  previouslyDeleted: result.previouslyDeleted.length,
  total,
});



export function useImport(): UseImportResult {
  const [state, setState] = useState<UseImportState>(INITIAL_STATE);
  const setBooks = useLibraryStore((s) => s.setBooks);
  const { confirmTombstones, dismissTombstoneConfirm, tombstoneDialog } = useTombstoneConfirm();

  const reset = useCallback(() => {
    dismissTombstoneConfirm();
    setState(INITIAL_STATE);
  }, [dismissTombstoneConfirm]);

  const importFromPath = useCallback(async (path: string) => {
    if (!path) {
      setState({
        ...INITIAL_STATE,
        status: 'error',
        error: 'No import path provided.',
      });
      return;
    }

    try {
      setState({
        status: 'scanning',
        progress: 10,
        results: null,
        currentFile: `Scanning & Importing ${path}`,
        error: null,
      });

      let result: ApiImportResult;
      let foundCount: number | undefined;

      if (path.startsWith('content://')) {
        // Android SAF Workflow
        const { files } = await api.enumerateTree(path);
        
        if (files.length === 0) {
          throw new Error('No supported book files found in this folder.');
        }

        foundCount = files.length;

        const { localPaths, failures } = await copyDocumentsWithRetry(files, (name, index, total) => {
          setState((prev) => ({
            ...prev,
            status: 'importing',
            currentFile: `Copying ${name}...`,
            progress: 10 + Math.round((index / total) * 40),
          }));
        });

        if (localPaths.length === 0) {
          throw new Error('Failed to copy any files from the selected folder.');
        }

        setState((prev) => ({
          ...prev,
          status: 'importing',
          currentFile: 'Adding to library...',
          progress: 60,
        }));

        const bookPaths = localPaths.filter(p => !/\.(cbz|cbr|zip)$/i.test(p));
        const mangaPaths = localPaths.filter(p => /\.(cbz|cbr|zip)$/i.test(p));

        const importPromises: Promise<ApiImportResult>[] = [];
        if (bookPaths.length > 0) importPromises.push(api.importBooks(bookPaths));
        if (mangaPaths.length > 0) importPromises.push(api.importManga(mangaPaths));

        const results = await Promise.all(importPromises);
        
        result = results.reduce(mergeResults, EMPTY_IMPORT_RESULT);

        // Copy failures are visible: count them in the `failed` bucket so the grid reports them.
        if (failures.length > 0) {
          result = {
            ...result,
            failed: [...result.failed, ...failures.map((f): [string, string] => [f.name, f.error])],
          };
        }
      } else {
        // Standard Workflow
        result = await api.scanFolderUnified(path);
      }

      // Previously-deleted files: ask before re-importing them, same prompt as the main dialog.
      if (result.previouslyDeleted.length > 0) {
        const restore = await confirmTombstones(result.previouslyDeleted);
        if (restore) {
          const cleared: string[] = [];
          for (const p of result.previouslyDeleted) {
            try {
              await api.clearTombstone(p);
              cleared.push(p);
            } catch (e) {
              logger.warn(`Failed to clear tombstone for ${p}`, e);
            }
          }

          if (cleared.length > 0) {
            const clearedManga = cleared.filter((p) => /\.(cbz|cbr|zip)$/i.test(p));
            const clearedBooks = cleared.filter((p) => !/\.(cbz|cbr|zip)$/i.test(p));

            const retryPromises: Promise<ApiImportResult>[] = [];
            if (clearedBooks.length > 0) retryPromises.push(api.importBooks(clearedBooks));
            if (clearedManga.length > 0) retryPromises.push(api.importManga(clearedManga));

            const retried = await Promise.all(retryPromises);
            result = mergeResults(result, retried.reduce(mergeResults, EMPTY_IMPORT_RESULT));
          }
        }
      }

      setState((prev) => ({
        ...prev,
        status: 'importing',
        currentFile: 'Finalizing import',
        progress: 85,
      }));

      const counted = toCountResult(result, foundCount);

      if (counted.success > 0) {
        const books = await api.getBooks();
        setBooks(books);
      }

      setState({
        status: 'completed',
        progress: 100,
        results: counted,
        currentFile: null,
        error: null,
      });
    } catch (error) {
      logger.error('Import failed:', error);
      setState({
        status: 'error',
        progress: 0,
        results: null,
        currentFile: null,
        error: error instanceof Error ? error.message : 'Import failed. Please try again.',
      });
    }
  }, [setBooks]);

  const selectAndImportFolder = useCallback(async () => {
    try {
      const selectedPath = await api.openFolderDialog();
      if (!selectedPath) {
        return;
      }
      await importFromPath(selectedPath);
    } catch (error) {
      logger.error('Failed to select folder:', error);
      setState({
        ...INITIAL_STATE,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to select folder.',
      });
    }
  }, [importFromPath]);

  return {
    ...state,
    selectAndImportFolder,
    importFromPath,
    reset,
    tombstoneDialog,
  };
}
