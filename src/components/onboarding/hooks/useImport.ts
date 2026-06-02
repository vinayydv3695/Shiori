import { useCallback, useState } from 'react';
import { api, type ImportResult as ApiImportResult } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { useLibraryStore } from '@/store/libraryStore';

type ImportStatus = 'idle' | 'scanning' | 'importing' | 'completed' | 'error';

export interface ImportResult {
  success: number;
  failed: number;
  duplicates: number;
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
}

const INITIAL_STATE: UseImportState = {
  status: 'idle',
  progress: 0,
  results: null,
  currentFile: null,
  error: null,
};

const toCountResult = (result: ApiImportResult): ImportResult => ({
  success: result.success.length,
  failed: result.failed.length,
  duplicates: result.duplicates.length,
});



export function useImport(): UseImportResult {
  const [state, setState] = useState<UseImportState>(INITIAL_STATE);
  const setBooks = useLibraryStore((s) => s.setBooks);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

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

      const result = await api.scanFolderUnified(path);

      setState((prev) => ({
        ...prev,
        status: 'importing',
        currentFile: 'Finalizing import',
        progress: 85,
      }));

      const counted = toCountResult(result);

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
  };
}
