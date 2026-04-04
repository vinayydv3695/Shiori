import { useCallback, useState } from 'react';
import { api, type ImportResult as ApiImportResult } from '@/lib/tauri';
import { logger } from '@/lib/logger';

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

const mergeResults = (results: ApiImportResult[]): ApiImportResult => {
  return results.reduce<ApiImportResult>(
    (acc, current) => {
      acc.success.push(...current.success);
      acc.failed.push(...current.failed);
      acc.duplicates.push(...current.duplicates);
      return acc;
    },
    { success: [], failed: [], duplicates: [] }
  );
};

export function useImport(): UseImportResult {
  const [state, setState] = useState<UseImportState>(INITIAL_STATE);

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
        progress: 0,
        results: null,
        currentFile: `Scanning ${path}`,
        error: null,
      });

      const scanTasks: Array<Promise<ApiImportResult>> = [
        api.scanFolderForBooks(path),
        api.scanFolderForManga(path),
        api.scanFolderForComics(path),
      ];

      let completedScans = 0;
      const wrappedScans = scanTasks.map((task, index) =>
        task.then((result) => {
          completedScans += 1;
          const labels = ['books', 'manga', 'comics'];
          const currentType = labels[index];

          setState((prev) => ({
            ...prev,
            status: 'scanning',
            currentFile: `Scanned ${currentType}`,
            progress: Math.round((completedScans / scanTasks.length) * 60),
          }));

          return result;
        })
      );

      const scanResults = await Promise.all(wrappedScans);

      setState((prev) => ({
        ...prev,
        status: 'importing',
        currentFile: 'Finalizing import',
        progress: 85,
      }));

      const merged = mergeResults(scanResults);
      const counted = toCountResult(merged);

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
  }, []);

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
