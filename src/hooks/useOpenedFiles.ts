import { useCallback, useEffect, useRef } from 'react';
import { api, type IngestResult } from '@/lib/tauri';
import { useToastStore } from '@/store/toastStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useTombstoneConfirm } from './useTombstoneConfirm';
import { toastForIngestResult } from '@/lib/openedFiles';
import { getErrorMessage } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * Consumes "Open with Shiori" intents (Android/mobile).
 *
 * - On mount: drains the backend's cold-start buffer once (`takeOpenedUrls`)
 *   and subscribes to warm-start `opened` events (`onOpened`), unlistening on
 *   unmount. The backend handles the cold-start race, so mount is the only
 *   drain point.
 * - URLs are ingested strictly sequentially (a few files at most, avoids
 *   hammering the backend). A ref Set guards against concurrent duplicate
 *   processing when a warm event overlaps the cold batch.
 * - Outcomes: imported → success toast + library refresh; duplicate → neutral
 *   toast; previously_deleted → tombstone confirm dialog, and on confirm the
 *   tombstone is cleared and the file ingested once more (any non-imported
 *   retry outcome is given up silently); unsupported → warning toast; thrown
 *   errors → error toast.
 *
 * Render `tombstoneDialog` once in the consuming component.
 */
export function useOpenedFiles() {
  const addToast = useToastStore(s => s.addToast);
  const loadInitialBooks = useLibraryStore(s => s.loadInitialBooks);
  const { confirmTombstones, tombstoneDialog } = useTombstoneConfirm();
  const processingRef = useRef<Set<string>>(new Set());

  const showResultToast = useCallback(
    (result: IngestResult) => {
      const toast = toastForIngestResult(result);
      if (toast) addToast({ title: toast.title, variant: toast.variant });
    },
    [addToast],
  );

  const handleUrl = useCallback(
    async (url: string): Promise<void> => {
      let result: IngestResult;
      try {
        result = await api.ingestOpenedFile(url);
      } catch (error) {
        logger.error(`[OpenedFile] ingest failed for ${url}:`, error);
        addToast({ title: 'Import failed', description: getErrorMessage(error), variant: 'error' });
        return;
      }

      if (result.status === 'previously_deleted') {
        const importAnyway = await confirmTombstones([result.path]);
        if (!importAnyway) return;

        try {
          await api.clearTombstone(result.path);
          const retry = await api.ingestOpenedFile(url); // one retry only
          if (retry.status === 'imported') {
            showResultToast(retry);
            await loadInitialBooks();
          }
          // Any other retry outcome: give up silently.
        } catch (error) {
          logger.error(`[OpenedFile] re-import failed for ${url}:`, error);
          addToast({ title: 'Import failed', description: getErrorMessage(error), variant: 'error' });
        }
        return;
      }

      showResultToast(result);
      if (result.status === 'imported') await loadInitialBooks();
    },
    [addToast, confirmTombstones, loadInitialBooks, showResultToast],
  );

  const processUrls = useCallback(
    async (urls: string[]): Promise<void> => {
      for (const url of urls) {
        if (processingRef.current.has(url)) continue;
        processingRef.current.add(url);
        try {
          await handleUrl(url);
        } finally {
          processingRef.current.delete(url);
        }
      }
    },
    [handleUrl],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    api
      .takeOpenedUrls()
      .then(urls => {
        if (!cancelled && urls.length > 0) return processUrls(urls);
      })
      .catch(error => logger.error('[OpenedFile] takeOpenedUrls failed:', error));

    api
      .onOpened(urls => {
        void processUrls(urls);
      })
      .then(fn => {
        unlisten = fn;
      })
      .catch(error => logger.error('[OpenedFile] onOpened subscribe failed:', error));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [processUrls]);

  return { tombstoneDialog };
}
