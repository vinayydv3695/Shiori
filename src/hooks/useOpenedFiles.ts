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
 * - Subscribe before draining the authoritative backend queue; warm events
 *   wake the same serialized drain. Unsubscribe even after late registration.
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
  const queueRef = useRef(Promise.resolve());

  const showResultToast = useCallback(
    (result: IngestResult) => {
      const toast = toastForIngestResult(result);
      if (toast) addToast({ title: toast.title, variant: toast.variant });
      if ((result.status === 'imported' || result.status === 'duplicate') && result.bookId != null) {
        window.dispatchEvent(new CustomEvent('open-book', { detail: { bookId: result.bookId } }));
      }
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
        } catch (error) {
          logger.error('[OpenedFile] processing failed:', error);
          addToast({ title: 'Import failed', description: getErrorMessage(error), variant: 'error' });
        } finally {
          processingRef.current.delete(url);
        }
      }
    },
    [handleUrl, addToast],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const drain = () => {
      queueRef.current = queueRef.current.then(async () => {
        if (cancelled) return;
        const urls = await api.takeOpenedUrls();
        // Finish consumed requests even if StrictMode replays the effect.
        await processUrls(urls);
      }).catch(error => logger.error('[OpenedFile] takeOpenedUrls failed:', error));
    };

    api
      .onOpened(() => { drain(); })
      .then(fn => {
        if (cancelled) { fn(); return; }
        unlisten = fn;
        drain();
      })
      .catch(error => logger.error('[OpenedFile] onOpened subscribe failed:', error));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [processUrls]);

  return { tombstoneDialog };
}
