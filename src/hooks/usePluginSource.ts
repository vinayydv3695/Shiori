import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import {
  pluginApi,
  type Chapter,
  type ContentType,
  type SearchResult,
  type SourceMeta,
} from '@/lib/pluginSources';
import { usePluginSourceStore } from '@/store/pluginSourceStore';

const DEBOUNCE_MS = 400;

function normalizeSourceId(sourceId: string): string {
  return sourceId.trim().toLowerCase().replace(/_/g, '-');
}

function resolveSourceId(sourceId: string, sources: SourceMeta[]): string {
  const normalized = normalizeSourceId(sourceId);
  const match = sources.find((source) => normalizeSourceId(source.id) === normalized);
  return match?.id ?? sourceId;
}

export function usePluginSources(type?: ContentType) {
  const {
    sources,
    selectedSourceId,
    isLoading,
    error,
    setSources,
    setLoading,
    setError,
    selectSource,
  } = usePluginSourceStore();

  useEffect(() => {
    let isMounted = true;

    const loadSources = async () => {
      setLoading(true);
      setError(null);

      try {
        const loaded = type ? await pluginApi.listByType(type) : await pluginApi.listSources();
        if (!isMounted) return;

        setSources(loaded);

        if (!selectedSourceId && loaded.length > 0) {
          selectSource(loaded[0].id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load plugin sources';
        logger.error('Failed to load plugin sources:', err);
        if (isMounted) {
          setError(message);
          setSources([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadSources();

    return () => {
      isMounted = false;
    };
  }, [type, selectSource, selectedSourceId, setError, setLoading, setSources]);

  const filteredSources = useMemo(() => {
    if (!type) return sources;
    return sources.filter((source) => source.content_type === type);
  }, [sources, type]);

  return {
    sources: filteredSources,
    selectedSourceId,
    selectSource,
    isLoading,
    error,
  };
}

export function usePluginSearch(sourceId: string | null | undefined, query: string, page: number = 1) {
  const { sources, searchResults, isLoading, error, setSearchResults, setLoading, setError } = usePluginSourceStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!sourceId || !query.trim()) {
      setSearchResults([]);
      setError(null);
      return;
    }

    timerRef.current = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);

        try {
          const resolvedSourceId = resolveSourceId(sourceId, sources);
          logger.debug('Plugin search request', { resolvedSourceId, page });
          const results = await pluginApi.search(resolvedSourceId, query.trim(), page);
          setSearchResults(Array.isArray(results) ? results : []);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Plugin search failed';
          logger.error('Plugin search failed:', err);
          setError(message);
          setSearchResults([]);
        } finally {
          setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [page, query, setError, setLoading, setSearchResults, sourceId, sources]);

  return {
    results: searchResults,
    isLoading,
    error,
  };
}

export function usePluginChapters(sourceId: string | null | undefined, contentId: string | null | undefined) {
  const { sources, chapters, isLoading, error, setChapters, setLoading, setError } = usePluginSourceStore();

  useEffect(() => {
    if (!sourceId || !contentId) {
      setChapters([]);
      return;
    }

    let isMounted = true;

    const loadChapters = async () => {
      setLoading(true);
      setError(null);

      try {
        const resolvedSourceId = resolveSourceId(sourceId, sources);
        const loaded = await pluginApi.getChapters(resolvedSourceId, contentId);
        if (!isMounted) return;
        setChapters(Array.isArray(loaded) ? loaded : []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load chapters';
        logger.error('Failed to load plugin chapters:', err);
        if (isMounted) {
          setError(message);
          setChapters([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadChapters();

    return () => {
      isMounted = false;
    };
  }, [contentId, setChapters, setError, setLoading, sourceId, sources]);

  return {
    chapters,
    isLoading,
    error,
  };
}

export function usePluginDownload() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const download = useCallback(async (sourceId: string, chapterId: string, dest_dir?: string) => {
    setIsDownloading(true);
    setProgress(0);

    try {
      setProgress(25);
      const result = await pluginApi.downloadChapter(sourceId, chapterId, dest_dir);
      setProgress(100);
      return result;
    } catch (err) {
      logger.error('Plugin chapter download failed:', err);
      throw err;
    } finally {
      setIsDownloading(false);
    }
  }, []);

  return {
    download,
    isDownloading,
    progress,
  };
}

export function useSetSourceApiKey() {
  const { setApiKey } = usePluginSourceStore();

  return useCallback(
    async (sourceId: string, key: string, value: string) => {
      await pluginApi.setConfig(sourceId, key, value);
      setApiKey(sourceId, value);
    },
    [setApiKey]
  );
}

export type { Chapter, SearchResult };
