import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { BookOpen, Loader2, Download, ArrowRight, Search, Filter, X, Flame, Clock, Trophy, Compass } from "lucide-react";
import { useInView } from "react-intersection-observer";
import {
  useMangaDex,
  type MangaDexManga,
  type MangaDexChapter,
  type BrowseMode,
} from "@/hooks/useMangaDex";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";


import { useSourceStore } from "@/store/sourceStore";
import { useSourceHealthStore } from "@/store/sourceHealthStore";
import { useOnlineSearchStore } from "@/store/onlineSearchStore";
import { OnlineSearchHeader } from "./OnlineSearchHeader";
import { OnlineSourceSelector } from "./OnlineSourceSelector";
import { DownloadsButton } from "./DownloadQueuePanel";
import {
  pluginApi,
  type Chapter as PluginChapter,
  type SearchResult as PluginSearchResult,
} from "@/lib/pluginSources";
import { solveCfChallenge } from "@/cloudflare";
import { useUIStore } from "@/store/uiStore";
import { useOnlineMangaReaderStore } from "@/store/onlineMangaReaderStore";
import { useOnlineMangaBrowseStore } from "@/store/onlineMangaBrowseStore";
import { launchCacheGet, launchCacheSet } from "@/lib/launchCache";
import { useLibraryStore } from "@/store/libraryStore";
import {
  OnlineMangaDetailView,
  type UnifiedChapter,
} from "./OnlineMangaDetailView";
import { MangaBrowseNavBar } from "./MangaBrowseNavBar";
import { HeroMangaBanner } from "./HeroMangaBanner";
import { MangaContentRow } from "./MangaContentRow";
import { ModernBookCard } from "./ModernBookCard";
import { SkeletonGrid } from "./SkeletonLoaders";
import { type CarouselItem } from "./ContentCarousel";
import { api, type ImportResult, type Book } from "@/lib/tauri";
import { parsePageUrl } from "@/lib/utils";
import { useToast } from "@/store/toastStore";
import { getErrorMessage, isErrorKind } from "@/lib/errors";
import { useTombstoneConfirm } from "@/hooks/useTombstoneConfirm";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MobileFilterSheet } from "./MobileFilterSheet";
import { openExternal } from "@/lib/externalLinks";
import { isAndroid, isTauri } from "@/lib/tauri";
import { useOnlineDownloadStore } from "@/store/onlineDownloadStore";
import { MangaDownloadDock } from "./MangaDownloadDock";
import { MangaDownloadOptionsDialog } from "./MangaDownloadOptionsDialog";
import {
  buildChapterDownloadTitle,
  countChapterStatuses,
  extractChapterVolume,
  type ChapterDownloadStatus,
  type ChapterDownloadStatusMap,
} from "./mangaDownloadUtils";

interface NetIpv6Diagnostics {
  hasGlobalIpv6: boolean;
  attestationReachable: boolean;
  suggestions: string[];
}

let onlineMangaSearchTimeout: number | undefined;
const SUPPORTED_QUEUE_FORMATS = [
  "cbz",
  "cbr",
  "epub",
  "pdf",
  "mobi",
  "azw3",
  "docx",
] as const;
const SUPPORTED_QUEUE_FORMATS_LABEL = SUPPORTED_QUEUE_FORMATS.join(", ");

function extractSupportedFormatToken(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const regex =
    /(?:^|[^a-z0-9])(cbz|cbr|epub|pdf|mobi|azw3|docx)(?:[^a-z0-9]|$)/i;
  const match = normalized.match(regex);
  return match?.[1]?.toLowerCase() ?? null;
}

function extractSupportedFormatFromHttpUrl(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const regex = /\.(cbz|cbr|epub|pdf|mobi|azw3|docx)(?=($|[?#&]))/i;
  const match = normalized.match(regex);
  return match?.[1]?.toLowerCase() ?? null;
}

function getUnsupportedFormatMessage(): string {
  return `Unsupported file type for Torbox queue. Supported formats: ${SUPPORTED_QUEUE_FORMATS_LABEL}. Use a direct link ending with one of these extensions, or a magnet/torrent result with clear format metadata.`;
}

function hasStrongFormatHint(result: PluginSearchResult): boolean {
  const titleHint = extractSupportedFormatToken(result.title);
  if (titleHint) return true;

  const extraFormat = result.extra?.format;
  if (
    typeof extraFormat === "string" &&
    extractSupportedFormatToken(extraFormat)
  )
    return true;

  return false;
}

function isQueueableTorboxCandidate(
  kind: string,
  url: string,
  result: PluginSearchResult,
): boolean {
  const normalizedKind =
    kind === "direct"
      ? url.trim().toLowerCase().startsWith("magnet:")
        ? "magnet"
        : url.trim().toLowerCase().includes(".torrent") ||
            url.trim().toLowerCase().includes("/torrent")
          ? "torrent"
          : "direct"
      : kind;

  if (normalizedKind === "magnet" || normalizedKind === "torrent") {
    return hasStrongFormatHint(result);
  }

  if (normalizedKind === "direct") {
    const normalized = url.trim().toLowerCase();
    const isHttp =
      normalized.startsWith("http://") || normalized.startsWith("https://");
    return isHttp && extractSupportedFormatFromHttpUrl(url) !== null;
  }

  return false;
}

function getUiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const asObj = error as Record<string, unknown>;
    const maybeMessage = asObj.message;
    if (typeof maybeMessage === "string" && maybeMessage.trim())
      return maybeMessage;
    const maybeError = asObj.error;
    if (typeof maybeError === "string" && maybeError.trim()) return maybeError;
    const maybeData = asObj.data;
    if (maybeData && typeof maybeData === "object") {
      const nested = maybeData as Record<string, unknown>;
      if (typeof nested.message === "string" && nested.message.trim())
        return nested.message;
      if (typeof nested.error === "string" && nested.error.trim())
        return nested.error;
    }
  }
  return fallback;
}

const CF_SOURCE_FALLBACK_URLS: Record<string, string> = {
  toongod: "https://www.toongod.org",
  mangafire: "https://mangafire.to",
};

function getCfVerifyUrl(
  sourceId: string | null | undefined,
  website?: string | null,
): string | null {
  if (!sourceId) return null;
  return website?.trim() || CF_SOURCE_FALLBACK_URLS[sourceId] || null;
}

export function OnlineMangaView() {
  const isMobile = useIsMobile();
  const searchQuery = useOnlineSearchStore(
    (state) => state.queries["online-manga"],
  );
  const setSearchQuery = useOnlineSearchStore((state) => state.setQueryForKind);
  const [results, setResults] = useState<MangaDexManga[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);
  const selectedManga = useOnlineMangaBrowseStore(
    (state) => state.selectedManga,
  );
  const selectedPluginManga = useOnlineMangaBrowseStore(
    (state) => state.selectedPluginManga,
  );
  const setSelectedManga = useOnlineMangaBrowseStore(
    (state) => state.setSelectedManga,
  );
  const setSelectedPluginManga = useOnlineMangaBrowseStore(
    (state) => state.setSelectedPluginManga,
  );
  const clearSelection = useOnlineMangaBrowseStore(
    (state) => state.clearSelection,
  );
  const [chapters, setChapters] = useState<MangaDexChapter[]>([]);
  const [pluginResults, setPluginResults] = useState<PluginSearchResult[]>([]);
  const [pluginChapters, setPluginChapters] = useState<PluginChapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);
  const [cfVerifying, setCfVerifying] = useState(false);
  const [cfVerifyUrl, setCfVerifyUrl] = useState<string | null>(null);
  const [cfVerifyMsg, setCfVerifyMsg] = useState<string | null>(null);
  const [netDiag, setNetDiag] = useState<NetIpv6Diagnostics | null>(null);
  const [netDiagChecking, setNetDiagChecking] = useState(false);
  const [netDiagError, setNetDiagError] = useState<string | null>(null);
  const [queueingManga, setQueueingManga] = useState<Record<string, boolean>>(
    {},
  );
  const [hasTorboxKey, setHasTorboxKey] = useState(false);
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false);
  const { confirmTombstones, tombstoneDialog } = useTombstoneConfirm();
  const libraryBooks = useLibraryStore((s) => s.books);
  const [lastReadChapterId, setLastReadChapterId] = useState<
    string | undefined
  >();
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const {
    success: showSuccessToast,
    error: showErrorToast,
    info: showInfoToast,
  } = useToast();
  const setSource = useOnlineMangaReaderStore((state) => state.setSource);
  const setContent = useOnlineMangaReaderStore((state) => state.setContent);
  const setChapter = useOnlineMangaReaderStore((state) => state.setChapter);
  const sources = useSourceStore((state) => state.sources);
  const primarySourceByKind = useSourceStore(
    (state) => state.primarySourceByKind,
  );

  const mangaSources = useMemo(
    () => sources.filter((source) => source.kind === "manga"),
    [sources],
  );
  const enabledSources = useMemo(
    () => mangaSources.filter((source) => source.enabled && source.implemented),
    [mangaSources],
  );
  const activeSource = useMemo(() => {
    const preferredId = primarySourceByKind.manga;
    const preferred = enabledSources.find(
      (source) => source.id === preferredId,
    );
    return preferred ?? enabledSources[0];
  }, [enabledSources, primarySourceByKind.manga]);

  const isMangaDexEnabled = activeSource?.id === "mangadex";
  const isPluginMangaSource =
    activeSource?.id !== "mangadex" && activeSource?.kind === "manga";
  const activePluginSourceId = isPluginMangaSource ? activeSource?.id : null;

  const getSourceWebsite = useCallback(
    (sourceId: string | null | undefined): string | undefined => {
      if (!sourceId) return undefined;
      return sources.find((s) => s.id === sourceId)?.website;
    },
    [sources],
  );

  const reportPluginError = useCallback(
    (sourceId: string | null | undefined, message: string) => {
      setPluginError(message);
      if (message.includes("Cloudflare")) {
        setCfVerifyUrl(getCfVerifyUrl(sourceId, getSourceWebsite(sourceId)));
      } else {
        setCfVerifyUrl(null);
      }
    },
    [getSourceWebsite],
  );

  const [lastSearchedQuery, setLastSearchedQuery] = useState("");

  // Browse mode state
  const [activeGenres, setActiveGenres] = useState<string[]>([]);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [activeMode, setActiveMode] = useState<string>("");
  const [advancedBrowseResults, setAdvancedBrowseResults] = useState<
    MangaDexManga[]
  >([]);
  const [isAdvancedBrowseLoading, setIsAdvancedBrowseLoading] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const [browsePage, setBrowsePage] = useState(1);
  const [hasMoreBrowseResults, setHasMoreBrowseResults] = useState(true);

  const { ref: loadMoreRef, inView: loadMoreInView } = useInView({
    threshold: 0.1,
    rootMargin: "400px",
  });

  const isAdvancedFilterActive =
    activeGenres.length > 0 || activeTypes.length > 0 || activeMode !== "";

  const [browseData, setBrowseData] = useState<
    Record<BrowseMode, MangaDexManga[]>
  >({
    popular: [],
    latest: [],
    recent: [],
    "top-rated": [],
  });
  const {
    searchManga,
    browseManga,
    getChapters,
    error: mangadexError,
    setError: setMangadexError,
  } = useMangaDex();
  const [browseLoading, setBrowseLoading] = useState<
    Record<BrowseMode, boolean>
  >({
    popular: false,
    latest: false,
    recent: false,
    "top-rated": false,
  });
  const [searchLoading, setSearchLoading] = useState(false);

  // We determine the overall "loading" state.
  // For others, it's the active browse modes that are loading.
  const isAnyBrowseLoading = Object.values(browseLoading).some(Boolean);
  const isAnySearchLoading = searchLoading;

  // Overall display loading

  const [browseInitialized, setBrowseInitialized] = useState(false);

  const [downloadProgress, setDownloadProgress] = useState<{
    chapterTitle: string;
    progress: number;
    total: number;
    chapterIndex?: number;
    totalChapters?: number;
  } | null>(null);
  const [chapterDownloadStatus, setChapterDownloadStatus] =
    useState<ChapterDownloadStatusMap>({});
  const [downloadOptionsOpen, setDownloadOptionsOpen] =
    useState(false);

  useEffect(() => {
    const unlisten = listen<{
      chapter_id: string;
      chapter_title: string;
      pages_downloaded: number;
      total_pages: number;
    }>("online-manga-download-progress", (event) => {
      setDownloadProgress((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          chapterTitle: event.payload.chapter_title,
          progress: event.payload.pages_downloaded,
          total: event.payload.total_pages,
        };
      });
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    api
      .getTorboxKey()
      .then((key) => setHasTorboxKey(Boolean(key)))
      .catch(() => setHasTorboxKey(false));
  }, []);

  const hasEnabledMangaSource = enabledSources.length > 0;
  const sourceSupportsTorboxTorrents = Boolean(activeSource?.torboxCompatible);

  useEffect(() => {
    let expectedPath: string | undefined;
    if (selectedPluginManga) {
      const sourceIdForLib =
        (selectedPluginManga.extra as any)?.librarySourceId ??
        activePluginSourceId!;
      expectedPath = `online-manga://${sourceIdForLib}/${selectedPluginManga.id}`;
    } else if (selectedManga) {
      expectedPath = `online-manga://mangadex/${selectedManga.id}`;
    }

    if (expectedPath) {
      const libraryBook = libraryBooks.find(
        (b) => b.file_path === expectedPath,
      );
      if (libraryBook?.id) {
        api
          .getReadingProgress(libraryBook.id)
          .then((progress) => {
            if (progress && progress.currentLocation) {
              const parts = progress.currentLocation.split("|");
              setLastReadChapterId(parts[0]);
            } else {
              setLastReadChapterId(undefined);
            }
          })
          .catch(console.error);
      } else {
        setLastReadChapterId(undefined);
      }
    } else {
      setLastReadChapterId(undefined);
    }
  }, [selectedManga, selectedPluginManga, libraryBooks, activePluginSourceId]);

  // Load browse data on mount or when active source changes
  useEffect(() => {
    // Slice 8: background health warm-up — probe every source in parallel
    // once per mount and record the results for badges. Never blocks paint.
    pluginApi
      .sourceHealthAll()
      .then((healths) => {
        const st = useSourceHealthStore.getState();
        for (const [id, health] of Object.entries(healths)) {
          st.recordHealth(id, health);
        }
      })
      .catch(() => {
        // Silent — health is cosmetic; failures surface in Settings.
      });
  }, []);

  // Load browse data on mount or when active source changes
  useEffect(() => {
    if (!activeSource) return;

    // We want to reload if the source changes, so we reset initialized if it changed
    // But since this is simple, we can just clear and reload every time activeSource changes.
    const loadBrowseData = async (mode: BrowseMode) => {
      // Slice 10 (instant launch): seed from the launch cache first so the
      // section paints last session's rows in a split second — no skeleton —
      // then refresh in the background and swap when fresh data arrives.
      const cacheKey = `browse:${activeSource.id}:${mode}:20`;
      const cached = launchCacheGet<MangaDexManga[]>(cacheKey);
      if (cached && cached.length > 0) {
        setBrowseData((prev) => ({ ...prev, [mode]: cached }));
      }
      setBrowseLoading((prev) => ({ ...prev, [mode]: true }));
      try {
        if (activeSource.id === "mangadex") {
          const data = await browseManga(mode, 20);
          launchCacheSet(cacheKey, data);
          setBrowseData((prev) => ({ ...prev, [mode]: data }));
        } else {
          const raw = await pluginApi.browse(activeSource.id, mode, 1, 20);
          const data: MangaDexManga[] = raw.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.summary || item.description || "",
            coverUrl: item.coverUrl || item.cover_url,
          }));
          launchCacheSet(cacheKey, data);
          setBrowseData((prev) => ({ ...prev, [mode]: data }));
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : `Failed to load ${mode} manga`;
        logger.error(
          `Failed to load ${mode} manga for ${activeSource.id}:`,
          err,
        );
        // Surface the graceful source error (e.g. Cloudflare block) instead
        // of leaving the section silently empty.
        reportPluginError(activeSource.id, message);
        setBrowseData((prev) => ({ ...prev, [mode]: [] }));
      } finally {
        setBrowseLoading((prev) => ({ ...prev, [mode]: false }));
      }
    };

    // Reset data before fetching
    setBrowseData({ popular: [], latest: [], recent: [], "top-rated": [] });
    setBrowseInitialized(true);

    // Load browse modes: MangaDex supports high concurrency; plugins use sequential loading to prevent RPC bridge contention
    if (activeSource.id === "mangadex") {
      void loadBrowseData("popular");
      void loadBrowseData("latest");
      void loadBrowseData("recent");
      void loadBrowseData("top-rated");
    } else {
      const loadSequentially = async () => {
        await loadBrowseData("popular");
        await loadBrowseData("latest");
        await loadBrowseData("recent");
        await loadBrowseData("top-rated");
      };
      void loadSequentially();
    }

    // Reset browse page
    setBrowsePage(1);
    setHasMoreBrowseResults(true);
    setAdvancedBrowseResults([]);
  }, [activeSource?.id]); // Re-run when source ID changes

  // Trigger search if we arrive with a pre-filled query (e.g. from AniList "Read Online")
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed && !hasSearched && !isAnySearchLoading && (isMangaDexEnabled || activePluginSourceId)) {
      void handleSearch(1, trimmed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePluginSourceId, isMangaDexEnabled]);

  // Load advanced browse data when filters change or page increments
  useEffect(() => {
    if (!activeSource || !isAdvancedFilterActive) return;

    const loadAdvancedBrowse = async () => {
      if (browsePage === 1) {
        setIsAdvancedBrowseLoading(true);
      }
      try {
        const mode = activeMode || "latest";
        const limit = 40;
        
        let data: MangaDexManga[] = [];
        if (activeSource.id === "mangadex") {
          // For MangaDex we still use pluginApi behind the scenes, but useMangaDex manages it.
          // Since MangaDex browse by genre via plugin might not support genres nicely if not mapped,
          // but we will pass it anyway if supported by plugin
          const raw = await pluginApi.browse(
            "mangadex",
            mode,
            browsePage,
            limit,
            activeGenres.length > 0 ? activeGenres : undefined,
            activeTypes.length > 0 ? activeTypes : undefined
          );
          data = raw.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.summary || item.description || "",
            coverUrl: item.coverUrl || item.cover_url,
          }));
        } else {
          const raw = await pluginApi.browse(
            activeSource.id,
            mode,
            browsePage,
            limit,
            activeGenres.length > 0 ? activeGenres : undefined,
            activeTypes.length > 0 ? activeTypes : undefined,
          );
          data = raw.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.summary || item.description || "",
            coverUrl: item.coverUrl || item.cover_url,
          }));
        }
        
        if (data.length === 0) {
          setHasMoreBrowseResults(false);
        } else {
          // If the API returns fewer than 10 results, it's highly likely to be the last page,
          // but relying on data.length === 0 is the most bulletproof for all plugins.
          // However, if we get nothing, we definitely stop.
          setHasMoreBrowseResults(true);
        }

        setAdvancedBrowseResults(prev => browsePage === 1 ? data : [...prev, ...data]);
      } catch (err) {
        logger.error(
          `Failed to load advanced browse results for ${activeSource.id}:`,
          err,
        );
        if (browsePage === 1) setAdvancedBrowseResults([]);
        setHasMoreBrowseResults(false);
      } finally {
        setIsAdvancedBrowseLoading(false);
      }
    };

    void loadAdvancedBrowse();
  }, [
    activeSource?.id,
    activeGenres,
    activeTypes,
    activeMode,
    isAdvancedFilterActive,
    browsePage
  ]);

  // Handle infinite scroll
  useEffect(() => {
    if (loadMoreInView && hasMoreBrowseResults && !isAdvancedBrowseLoading) {
      setBrowsePage(prev => prev + 1);
    }
  }, [loadMoreInView, hasMoreBrowseResults, isAdvancedBrowseLoading]);

  // Reset page when filter changes
  useEffect(() => {
    setBrowsePage(1);
    setHasMoreBrowseResults(true);
  }, [activeGenres, activeTypes, activeMode, activeSource?.id]);

  const handleRandomClick = () => {
    const listToChooseFrom = isAdvancedFilterActive
      ? advancedBrowseResults
      : browseData.popular;
    if (listToChooseFrom.length > 0) {
      const randomIndex = Math.floor(Math.random() * listToChooseFrom.length);
      const randomManga = listToChooseFrom[randomIndex];

      if (isPluginMangaSource) {
        // Need to find the plugin result that matches this mangadex format
        const matchingResult = pluginResults.find(
          (r) => r.id === randomManga.id,
        );
        if (matchingResult) {
          void handleViewPluginChapters(matchingResult);
        } else {
          // It might be from browse, not search. Since handleSelectPluginManga takes a PluginSearchResult
          // we can construct one
          void handleViewPluginChapters({
            id: randomManga.id,
            title: randomManga.title,
            cover_url: randomManga.coverUrl || "",
            summary: randomManga.description,
          });
        }
      } else {
        void handleViewChapters(randomManga);
      }
    }
  };
  // Convert MangaDexManga to CarouselItem
  const toCarouselItems = useCallback(
    (manga: MangaDexManga[]): CarouselItem[] => {
      return manga.map((m) => ({
        id: m.id,
        title: m.title,
        coverUrl: m.coverUrl,
        subtitle: m.author || m.status,
      }));
    },
    [],
  );

  const handleSearch = useCallback(
    async (page: number = 1, queryOverride?: string) => {
      const query = (queryOverride ?? searchQuery).trim();
      if (!query) return;

      if (isMangaDexEnabled) {
        logger.info("Searching MangaDex:", { query, page });

        const result = await searchManga(query, page, 20);

        if (result) {
          setResults(result.data);
          setTotalResults(result.total);
          setCurrentPage(page);
          setHasSearched(true);
          setLastSearchedQuery(query);
        }

        return;
      }

      if (activePluginSourceId) {
        setPluginError(null);
        setCfVerifyUrl(null);
        setCfVerifyMsg(null);
        setChapters([]);
        setResults([]);
        setTotalResults(0);
        setCurrentPage(1);

        try {
          logger.info("Searching plugin manga source:", {
            query,
            sourceId: activePluginSourceId,
          });
          const result = await pluginApi.search(
            activePluginSourceId,
            query,
            page,
          );
          setPluginResults(result);
          setHasSearched(true);
          setLastSearchedQuery(query);
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to search plugin source";
          logger.error("Plugin manga search failed:", err);
          reportPluginError(activePluginSourceId, message);
          setPluginResults([]);
        }
      }
    },
    [
      activePluginSourceId,
      isMangaDexEnabled,
      reportPluginError,
      searchManga,
      searchQuery,
    ],
  );

  const visibleResults = useMemo(() => {
    if (!isMangaDexEnabled || searchQuery.trim().length === 0) return [];
    return results;
  }, [isMangaDexEnabled, searchQuery, results]);

  const visiblePluginResults = useMemo(() => {
    if (!isPluginMangaSource || searchQuery.trim().length === 0) return [];
    return pluginResults;
  }, [isPluginMangaSource, searchQuery, pluginResults]);

  const visibleTotalResults =
    searchQuery.trim().length === 0 || !isMangaDexEnabled ? 0 : totalResults;
  const visibleCurrentPage =
    searchQuery.trim().length === 0 || !isMangaDexEnabled ? 1 : currentPage;
  const hasVisibleSearched =
    hasSearched &&
    searchQuery.trim().length > 0 &&
    (isMangaDexEnabled || isPluginMangaSource);
  const displayLoading = hasVisibleSearched
    ? isAnySearchLoading
    : isAnyBrowseLoading;
  const totalPages = Math.ceil(visibleTotalResults / 20);

  const scheduleSearch = useCallback(
    (value: string) => {
      setSearchQuery("manga", value);

      const trimmed = value.trim();
      if (!trimmed || (!isMangaDexEnabled && !isPluginMangaSource)) {
        setHasSearched(false);
        window.clearTimeout(onlineMangaSearchTimeout);
        return;
      }

      window.clearTimeout(onlineMangaSearchTimeout);
      onlineMangaSearchTimeout = window.setTimeout(() => {
        if (trimmed === lastSearchedQuery) return;
        void handleSearch(1, trimmed);
      }, 300);
    },
    [
      handleSearch,
      isMangaDexEnabled,
      isPluginMangaSource,
      lastSearchedQuery,
      setSearchQuery,
    ],
  );

  const handleViewChapters = useCallback(
    async (manga: MangaDexManga) => {
      console.log("handleViewChapters FIRED!");
      // setSelectedManga already clears the plugin selection via the store
      // action — do NOT call setSelectedPluginManga(null) here: it would
      // null selectedManga too (batched), silently killing the navigation.
      setSelectedManga(manga);
      setChapters([]);
      setChaptersLoading(true);
      setPluginError(null);
      setChapterDownloadStatus({});

      try {
        const chapterList = await getChapters(manga.id);
        setChapters(chapterList);
      } catch (err) {
        logger.error("Failed to load MangaDex chapters:", err);
        setPluginError(
          err instanceof Error ? err.message : "Failed to load chapters",
        );
        setChapters([]);
      } finally {
        setChaptersLoading(false);
      }
    },
    [getChapters],
  );

  const handleViewPluginChapters = async (manga: PluginSearchResult) => {
    // If the manga was opened from the library, use the stored sourceId; otherwise fall back to the active one
    const effectiveSourceId =
      (manga.extra as any)?.librarySourceId ?? activePluginSourceId;
    if (!effectiveSourceId) return;

    setSelectedManga(null);
    setSelectedPluginManga(manga);
    setPluginChapters([]);
    setChaptersLoading(true);
    setChapterDownloadStatus({});
    setPluginError(null);
    setCfVerifyUrl(null);
    setCfVerifyMsg(null);

    try {
      const chapterList = await pluginApi.getChapters(
        effectiveSourceId,
        manga.id,
      );
      setPluginChapters(chapterList);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load plugin chapters";
      logger.error("Plugin chapters load failed:", err);
      reportPluginError(effectiveSourceId, message);
      setPluginChapters([]);
    } finally {
      setChaptersLoading(false);
    }
  };

  // Handle carousel item click - find manga in browse data and show chapters
  const handleCarouselItemClick = useCallback(
    (item: CarouselItem) => {
      // Find the full manga data from browse data
      const allBrowseManga = [
        ...browseData.popular,
        ...browseData.latest,
        ...browseData.recent,
        ...browseData["top-rated"],
      ];
      const manga = allBrowseManga.find((m) => m.id === item.id);
      if (manga) {
        if (isMangaDexEnabled) {
          void handleViewChapters(manga);
        } else {
          void handleViewPluginChapters({
            id: manga.id,
            title: manga.title,
            description: manga.description,
            coverUrl: manga.coverUrl,
          });
        }
      } else {
        // Diagnostic: a card rendered without matching browse data is a
        // silent no-op. If you see this in the console, the card's item id
        // ({item.id}) doesn't exist in browseData — stale HMR/vite cache is
        // the usual cause (clear node_modules/.vite and restart the dev server).
        console.warn(
          `[MangaView] card click ignored: no browse item for id "${item.id}" ` +
            `(popular=${browseData.popular.length} latest=${browseData.latest.length} ` +
            `recent=${browseData.recent.length} top=${browseData["top-rated"].length})`,
        );
      }
    },
    [
      browseData,
      handleViewChapters,
      isMangaDexEnabled,
      handleViewPluginChapters,
    ],
  );

  const openInBrowser = useCallback(async (url: string) => {
    try {
      // On Android/Tauri, window.open() returns null and location.assign()
      // would hijack the entire app webview — use the system browser instead.
      // openExternal handles Android (ACTION_VIEW intent via `open_url`)
      // and desktop Tauri (shell plugin) internally.
      if (isTauri && isAndroid) {
        await openExternal(url);
        return;
      }
      const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
      if (!openedWindow) {
        // Desktop Tauri: shell open as fallback (never navigate the app)
        if (isTauri) {
          await openExternal(url);
        }
        // Web browser fallback only — safe because desktop browsers support multi-window
      }
    } catch {
      // Silently fail — never navigate the app away
    }
  }, []);

  const extractTorboxCandidate = useCallback(
    (manga: PluginSearchResult): { kind: string; url: string } | null => {
      const extra = manga.extra ?? {};
      const fallbackDescription =
        typeof manga.description === "string"
          ? manga.description.trim()
          : typeof manga.summary === "string"
            ? manga.summary.trim()
            : "";

      const candidates = [
        { raw: extra.magnet_url, hint: "magnet" },
        { raw: extra.torrent_url, hint: "torrent" },
        { raw: extra.magnet, hint: "magnet" },
        { raw: extra.magnet_link, hint: "magnet" },
        { raw: extra.magnetLink, hint: "magnet" },
        { raw: extra.torrent, hint: "torrent" },
        { raw: extra.torrent_link, hint: "torrent" },
        { raw: extra.torrentLink, hint: "torrent" },
        { raw: manga.url, hint: undefined },
        {
          raw:
            fallbackDescription.toLowerCase().startsWith("magnet:") ||
            fallbackDescription.toLowerCase().startsWith("magnet|")
              ? fallbackDescription
              : undefined,
          hint: "magnet",
        },
      ];

      for (const candidate of candidates) {
        if (typeof candidate.raw !== "string") continue;
        const parsed = parsePageUrl(candidate.raw);
        if (!parsed.url) continue;

        let kind = parsed.kind;
        if (kind === "direct" && candidate.hint) {
          kind = candidate.hint;
        }

        return { kind, url: parsed.url };
      }

      return null;
    },
    [],
  );

  const pluginResultWithTorboxSource = useMemo(
    () =>
      visiblePluginResults.map((item) => ({
        item,
        torboxSource: extractTorboxCandidate(item),
      })),
    [extractTorboxCandidate, visiblePluginResults],
  );

  const handleQueueInTorbox = useCallback(
    async (manga: PluginSearchResult) => {
      const torboxSource = extractTorboxCandidate(manga);
      if (!torboxSource) {
        const message = "No Torbox source link found for this manga result.";
        setPluginError(message);
        showErrorToast("Torbox source missing", message);
        return;
      }

      setQueueingManga((prev) => ({ ...prev, [manga.id]: true }));
      setPluginError(null);

      try {
        const normalizedKind = (() => {
          if (torboxSource.kind !== "direct") return torboxSource.kind;
          const normalized = torboxSource.url.trim().toLowerCase();
          if (normalized.startsWith("magnet:")) return "magnet";
          if (
            normalized.includes(".torrent") ||
            normalized.includes("/torrent")
          )
            return "torrent";
          return "direct";
        })();

        if (
          normalizedKind === "magnet" ||
          normalizedKind === "torrent" ||
          normalizedKind === "direct"
        ) {
          if (
            !isQueueableTorboxCandidate(normalizedKind, torboxSource.url, manga)
          ) {
            const message = getUnsupportedFormatMessage();
            setPluginError(message);
            showErrorToast("Cannot send to Torbox", message);
            return;
          }

          await api.addToTorboxQueue(torboxSource.url);
          showSuccessToast(
            "Queued in Torbox",
            `${manga.title} was queued. Opening Torbox view now.`,
          );
          setCurrentView("torbox-manga");
        } else if (normalizedKind === "anna" || normalizedKind === "external") {
          openInBrowser(torboxSource.url);
          showInfoToast(
            "Opened source in browser",
            "This result should be opened directly in your browser.",
          );
        } else {
          const message = `Unsupported source kind '${normalizedKind}' for Torbox queue.`;
          setPluginError(message);
          showErrorToast("Cannot send to Torbox", message);
        }
      } catch (err) {
        const message = getUiErrorMessage(
          err,
          "Failed to queue manga in Torbox",
        );
        setPluginError(message);
        showErrorToast("Torbox queue failed", message);
      } finally {
        setQueueingManga((prev) => {
          const next = { ...prev };
          delete next[manga.id];
          return next;
        });
      }
    },
    [
      extractTorboxCandidate,
      openInBrowser,
      setCurrentView,
      showErrorToast,
      showInfoToast,
      showSuccessToast,
    ],
  );

  const handleReadChapter = async (
    sourceId: string,
    contentId: string,
    chapter: PluginChapter,
    allChapters: PluginChapter[],
    contentTitle?: string,
    coverUrl?: string,
    description?: string,
  ) => {
    // Filter duplicates to make Next/Prev predictable
    const uniqueChapters = [];
    const seenNumbers = new Set();
    for (const c of allChapters) {
      if (c.number !== undefined) {
        if (!seenNumbers.has(c.number)) {
          seenNumbers.add(c.number);
          uniqueChapters.push(c);
        }
      } else {
        uniqueChapters.push(c);
      }
    }

    const expectedPath = `online-manga://${sourceId}/${contentId}`;
    const libBook = useLibraryStore
      .getState()
      .books.find((b) => b.file_path === expectedPath);

    setSource(sourceId);
    setContent(
      contentId,
      uniqueChapters,
      contentTitle,
      coverUrl,
      description,
      libBook?.id,
    );
    await setChapter(chapter.id);
    setCurrentView("online-manga-reader");
  };

  const mapMangaDexChapterToPlugin = useCallback(
    (chapter: MangaDexChapter): PluginChapter => ({
      id: chapter.id,
      title:
        chapter.title ||
        (chapter.chapter ? `Chapter ${chapter.chapter}` : "Chapter"),
      number: chapter.chapter ? Number(chapter.chapter) : undefined,
    }),
    [],
  );

  const mangaDexPluginChapters = useMemo(
    () => chapters.map(mapMangaDexChapterToPlugin),
    [chapters, mapMangaDexChapterToPlugin],
  );

  const unifiedChapters = useMemo((): UnifiedChapter[] => {
    // Gate on what is actually selected, not on which source is currently
    // "active": a manga opened from the library (e.g. a ToonGod series while
    // MangaDex is the active source) must still list chapters and offer
    // downloads. selectedManga / selectedPluginManga are mutually exclusive.
    if (selectedManga) {
      return chapters.map((c) => {
        const parsedVol = extractChapterVolume(c.volume, c.title, c.chapter);
        return {
          id: c.id,
          volume: parsedVol || c.volume || "None",
          chapter: c.chapter || "?",
          title: c.title || "",
          pages: c.pages,
          sourceType: "mangadex",
          originalChapter: c,
          date: c.publishAt
            ? new Date(c.publishAt).toLocaleDateString()
            : undefined,
        };
      });
    }
    if (selectedPluginManga) {
      return pluginChapters.map((c) => {
        const parsedVol = extractChapterVolume(
          c.volume ? String(c.volume) : undefined,
          c.title,
          c.number !== undefined ? String(c.number) : ""
        );
        return {
          id: c.id,
          volume: parsedVol || (c.volume ? String(c.volume) : "None"),
          chapter: c.number !== undefined ? String(c.number) : "?",
          title: c.title || "",
          pages: c.pages,
          sourceType: "plugin",
          originalChapter: c,
          date: c.date ? new Date(c.date).toLocaleDateString() : undefined,
        };
      });
    }
    return [];
  }, [
    chapters,
    pluginChapters,
    selectedManga,
    selectedPluginManga,
  ]);

  const handleReadUnifiedChapter = async (unifiedCh: UnifiedChapter) => {
    if (unifiedCh.sourceType === "mangadex") {
      const pluginFormat = mapMangaDexChapterToPlugin(
        unifiedCh.originalChapter,
      );
      await handleReadChapter(
        "mangadex",
        selectedManga!.id,
        pluginFormat,
        mangaDexPluginChapters,
        selectedManga!.title,
      );
    } else {
      const effectiveSourceId =
        (selectedPluginManga!.extra as any)?.librarySourceId ??
        activePluginSourceId!;
      await handleReadChapter(
        effectiveSourceId,
        selectedPluginManga!.id,
        unifiedCh.originalChapter,
        pluginChapters,
        selectedPluginManga!.title,
      );
    }
  };

  const handleSaveToLibrary = async () => {
    const manga = selectedManga || selectedPluginManga;
    if (!manga || isSavingToLibrary) return;

    const isPlugin = !!selectedPluginManga;
    const effectiveSourceId = isPlugin
      ? ((selectedPluginManga!.extra as any)?.librarySourceId ??
        activePluginSourceId!)
      : "mangadex";

    const contentId = manga.id;
    const title = manga.title;
    const coverUrl = isPlugin
      ? selectedPluginManga!.coverUrl || selectedPluginManga!.cover_url
      : selectedManga!.coverUrl;
    const description = isPlugin
      ? selectedPluginManga!.summary || selectedPluginManga!.description
      : selectedManga!.description;

    setIsSavingToLibrary(true);
    try {
      const now = new Date().toISOString();
      const book: Book = {
        title,
        file_path: `online-manga://${effectiveSourceId}/${contentId}`,
        file_format: "online-manga",
        domain: "manga",
        added_date: now,
        modified_date: now,
        language: "en",
        is_favorite: false,
        cover_path: coverUrl,
        uuid: crypto.randomUUID(),
        notes: description || "",
      };

      try {
        await api.addBook(book);
      } catch (err) {
        if (!isErrorKind(err, "tombstoned") || !book.file_path) {
          throw err;
        }
        // Previously deleted: offer to forget the deletion and retry once.
        const importAnyway = await confirmTombstones([book.file_path]);
        if (!importAnyway) {
          return; // skipped — user declined
        }
        await api.clearTombstone(book.file_path);
        await api.addBook(book);
      }

      showSuccessToast(`"${title}" added to your library!`);

      // Refresh library in background
      const { useLibraryStore } = await import("@/store/libraryStore");
      void useLibraryStore.getState().loadInitialBooks();
    } catch (err) {
      showErrorToast(`Failed to add to library: ${getErrorMessage(err)}`);
    } finally {
      setIsSavingToLibrary(false);
    }
  };

  const handleDownloadChapters = async (selectedChapters: UnifiedChapter[], seriesMetadata?: any) => {
    if (selectedChapters.length === 0) return;
    const manga = selectedManga || selectedPluginManga;
    if (!manga) return;

    const isPlugin = !!selectedPluginManga;
    const effectiveSourceId = isPlugin
      ? ((selectedPluginManga!.extra as any)?.librarySourceId ??
        activePluginSourceId!)
      : "mangadex";
    const mangaTitle = manga.title;

    const pathsToImport: { path: string; chapter: string | null }[] = [];
    const downloadFailures: { chapter: string; reason: string }[] = [];
    showInfoToast(`Started downloading ${selectedChapters.length} chapters...`);

    // Mark the whole batch as queued so the dock can show per-chapter status.
    setChapterDownloadStatus(
      Object.fromEntries(
        selectedChapters.map((ch) => [ch.id, "queued" as ChapterDownloadStatus]),
      ),
    );

    let i = 0;
    for (const ch of selectedChapters) {
      i++;
      const uniqueChapterTitle = buildChapterDownloadTitle(ch);
      const fullDisplayTitle = `${mangaTitle} - ${uniqueChapterTitle}`;
      try {
        useOnlineDownloadStore.getState().registerDownload(ch.id, fullDisplayTitle, 'pages');

        setDownloadProgress({
          chapterTitle: uniqueChapterTitle,
          progress: 0,
          total: 1,
          chapterIndex: i,
          totalChapters: selectedChapters.length,
        });
        setChapterDownloadStatus((prev) => ({
          ...prev,
          [ch.id]: "downloading",
        }));
        const cbzPath = await invoke<string>("download_manga_chapter_as_cbz", {
          sourceId: effectiveSourceId,
          mangaTitle: mangaTitle,
          chapterId: ch.id,
          chapterTitle: uniqueChapterTitle,
        });
        setChapterDownloadStatus((prev) => ({ ...prev, [ch.id]: "done" }));
        useOnlineDownloadStore.getState().setDownload(ch.id, {
          target_id: ch.id,
          status: 'completed',
          downloaded_bytes: 1,
          total_bytes: 1,
          title: fullDisplayTitle,
          unit: 'pages',
        });
        pathsToImport.push({ path: cbzPath, chapter: ch.chapter !== '?' ? ch.chapter : null });
      } catch (err) {
        setChapterDownloadStatus((prev) => ({ ...prev, [ch.id]: "failed" }));
        useOnlineDownloadStore.getState().setDownload(ch.id, {
          target_id: ch.id,
          status: 'error',
          downloaded_bytes: 0,
          total_bytes: 1,
          title: fullDisplayTitle,
          unit: 'pages',
        });
        const reason = getErrorMessage(err);
        downloadFailures.push({ chapter: String(ch.chapter), reason });
        showErrorToast(`Failed to download chapter ${ch.chapter}: ${reason}`);
      }
    }

    setDownloadProgress(null);

    if (pathsToImport.length === 0) {
      if (downloadFailures.length > 0) {
        showErrorToast(
          `All ${downloadFailures.length} chapter download(s) failed`,
          downloadFailures[0].reason,
        );
      }
      return;
    }

    try {
      const isPlugin = !!selectedPluginManga;
      const coverUrl = isPlugin
        ? selectedPluginManga!.coverUrl || selectedPluginManga!.cover_url
        : selectedManga!.coverUrl;
      const description = isPlugin
        ? selectedPluginManga!.summary || selectedPluginManga!.description
        : selectedManga!.description;

      const result = await invoke<ImportResult>("import_online_manga_chapters", {
        pathsWithChapters: pathsToImport,
        seriesMetadata: {
          title: seriesMetadata?.title?.english || seriesMetadata?.title?.romaji || mangaTitle,
          anilistId: seriesMetadata?.id ? String(seriesMetadata.id) : null,
          coverUrl: coverUrl || null,
          description: description || seriesMetadata?.description || null,
        }
      });
      const importedCount = result.success.length;
      const importFailedCount = result.failed.length;
      const totalFailedCount = importFailedCount + downloadFailures.length;

      if (importedCount > 0) {
        const { useLibraryStore } = await import("@/store/libraryStore");
        void useLibraryStore.getState().loadInitialBooks();
      }

      if (totalFailedCount === 0) {
        showSuccessToast(
          `Imported ${importedCount} chapter${importedCount === 1 ? "" : "s"} to library!`,
        );
      } else if (importedCount > 0) {
        showSuccessToast(
          `Imported ${importedCount} of ${importedCount + totalFailedCount} chapters`,
          `${totalFailedCount} failed to import — see below for details`,
        );
      } else {
        showErrorToast(
          `Failed to import any of the ${totalFailedCount} downloaded chapter${totalFailedCount === 1 ? "" : "s"}`,
          result.failed[0]?.[1] ?? downloadFailures[0]?.reason,
        );
      }

      // Surface the real per-file reason for every chapter that failed to import
      // (as opposed to one generic toast for the whole batch).
      for (const [path, reason] of result.failed) {
        const fileName = path.split(/[/\\]/).pop() ?? path;
        showErrorToast(`Failed to import ${fileName}`, reason);
      }
    } catch (err) {
      showErrorToast(`Failed to import chapters: ${getErrorMessage(err)}`);
    }
  };

  // Auto-fetch chapters if we navigated from the library and they haven't been fetched
  useEffect(() => {
    if (selectedManga && chapters.length === 0 && !chaptersLoading) {
      void handleViewChapters(selectedManga);
    }
  }, [selectedManga?.id]);

  useEffect(() => {
    if (
      selectedPluginManga &&
      pluginChapters.length === 0 &&
      !chaptersLoading
    ) {
      // handleViewPluginChapters will use extra.librarySourceId if present
      void handleViewPluginChapters(selectedPluginManga);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPluginManga?.id]);

  const chapterStatusCounts = countChapterStatuses(chapterDownloadStatus);

  const downloadProgressToast = (isAndroid && downloadProgress) ? (
    <div className="fixed bottom-6 right-6 z-50 bg-card/95 backdrop-blur-2xl border border-border/60 rounded-2xl shadow-2xl p-5 w-80 animate-in fade-in slide-in-from-bottom-6 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-primary animate-pulse" />
          <h4 className="font-semibold text-sm text-foreground truncate max-w-[180px]">
            {downloadProgress.totalChapters && downloadProgress.totalChapters > 1 
              ? `Downloading Chapters (${downloadProgress.chapterIndex}/${downloadProgress.totalChapters})`
              : 'Downloading Chapter'}
          </h4>
        </div>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
      </div>
      
      {/* Chapter Title */}
      <p className="text-xs text-muted-foreground truncate" title={downloadProgress.chapterTitle}>
        {downloadProgress.chapterTitle}
      </p>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary h-full transition-all duration-300 rounded-full"
            style={{
              width: `${Math.max(2, (downloadProgress.progress / downloadProgress.total) * 100)}%`,
            }}
          />
        </div>
        <div className="flex justify-between items-center text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
          <span>{Math.round((downloadProgress.progress / downloadProgress.total) * 100)}%</span>
          <span>{downloadProgress.progress} / {downloadProgress.total} pages</span>
        </div>
      </div>

      {/* Overall batch progress: X/Y chapters done */}
      {downloadProgress.totalChapters && downloadProgress.totalChapters > 1 && (
        <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-t border-border/40 pt-2">
          <span>
            {chapterStatusCounts.done + chapterStatusCounts.failed} /{" "}
            {downloadProgress.totalChapters} chapters done
          </span>
          {chapterStatusCounts.failed > 0 && (
            <span className="text-red-400 normal-case">
              {chapterStatusCounts.failed} failed
            </span>
          )}
        </div>
      )}
    </div>
  ) : null;

  if (selectedManga || selectedPluginManga) {
    const isPlugin = !!selectedPluginManga;
    const title = isPlugin ? selectedPluginManga!.title : selectedManga!.title;
    const description = isPlugin
      ? selectedPluginManga!.summary || selectedPluginManga!.description
      : selectedManga!.description;
    const coverUrl = isPlugin
      ? selectedPluginManga!.coverUrl || selectedPluginManga!.cover_url
      : selectedManga!.coverUrl;
    const author = isPlugin ? undefined : selectedManga!.author;
    const status = isPlugin ? undefined : selectedManga!.status;
    const year = isPlugin ? undefined : selectedManga!.year;

    const sourceIdForLib = isPlugin
      ? ((selectedPluginManga!.extra as any)?.librarySourceId ??
        activePluginSourceId!)
      : "mangadex";
    const contentIdForLib = isPlugin
      ? selectedPluginManga!.id
      : selectedManga!.id;
    const expectedPath = `online-manga://${sourceIdForLib}/${contentIdForLib}`;
    const libraryBook = libraryBooks.find((b) => b.file_path === expectedPath);

    return (
      <div className="flex flex-col h-full bg-background relative">
        {downloadProgressToast}
        <OnlineMangaDetailView
          sourceId={sourceIdForLib}
          contentId={contentIdForLib}
          title={title}
          coverUrl={coverUrl}
          description={description}
          author={author}
          status={status}
          year={year}
          chaptersLoading={chaptersLoading}
          chaptersError={isPlugin ? pluginError : mangadexError}
          unifiedChapters={unifiedChapters}
          onBack={() => {
            // clearSelection, not the individual setters: with the hardened
            // store actions, setSelectedManga(null) would leave a stale
            // plugin selection (and vice versa).
            clearSelection();
          }}
          onReadChapter={handleReadUnifiedChapter}
          onSaveToLibrary={handleSaveToLibrary}
          isInLibrary={!!libraryBook}
          lastReadChapterId={lastReadChapterId}
          chapterDownloadStatus={chapterDownloadStatus}
          onDownloadChapter={(ch) => void handleDownloadChapters([ch])}
          onDownloadChapters={(chs) => void handleDownloadChapters(chs)}
          onDownloadAll={() => setDownloadOptionsOpen(true)}
        />

        {/* Uniform download options on Android; on desktop, queue lives in the top bar Downloads panel */}
        {isAndroid && !downloadProgress && unifiedChapters.length > 0 && (
          <MangaDownloadDock
            chapters={unifiedChapters}
            status={chapterDownloadStatus}
            onDownloadChapter={(ch) => void handleDownloadChapters([ch])}
            onDownloadAll={() => setDownloadOptionsOpen(true)}
          />
        )}
        <MangaDownloadOptionsDialog
          open={downloadOptionsOpen}
          onOpenChange={setDownloadOptionsOpen}
          title={title}
          chapters={unifiedChapters}
          onDownload={(chapters) => void handleDownloadChapters(chapters)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Download Progress Toast Overlay */}
      {downloadProgressToast}
      {tombstoneDialog}
      {/* ── Mobile Search Header ── */}
      <div className="md:hidden">
        <OnlineSearchHeader
          kind="manga"
          title="Online Manga"
          subtitle="Search and explore manga from online providers"
          searchValue={searchQuery}
          loading={displayLoading}
          disabled={!hasEnabledMangaSource}
          disabledMessage="No active manga source. Enable MangaDex in Settings → Online Sources."
          onSearchValueChange={scheduleSearch}
          onSubmit={() => {
            const q = searchQuery.trim();
            if (!q) return;
            void handleSearch(1, q);
          }}
          onMobileFilterClick={() => setMobileFilterOpen(true)}
        />
      </div>

      {/* ── Desktop Unified Compact Toolbar ── */}
      <div className="hidden md:flex items-center justify-between gap-4 lg:gap-6 px-6 lg:px-10 py-3.5 border-b border-border/50 bg-background/85 dark:bg-background/85 backdrop-blur-2xl sticky top-0 z-30 transition-colors shadow-xs">
        {/* Left: Source Selector Dropdown / Pill */}
        <div className="flex items-center gap-2 shrink-0">
          <OnlineSourceSelector 
            kind="manga" 
            variant="secondary" 
            className="h-11 px-5 bg-card/85 hover:bg-card text-foreground border border-border/60 hover:border-primary/40 rounded-full shadow-xs backdrop-blur-xl text-sm font-bold transition-all cursor-pointer gap-2.5" 
          />
        </div>

        {/* Center: Search Bar with Filters & Submit */}
        <div className="flex-1 max-w-2xl lg:max-w-3xl relative group">
          <div className="flex items-center bg-card/85 hover:bg-card focus-within:bg-card border border-border/60 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15 rounded-2xl p-1.5 transition-all duration-300 shadow-xs backdrop-blur-xl">
            <Search className="w-5 h-5 text-muted-foreground ml-3.5 shrink-0 transition-colors duration-300 group-focus-within:text-primary stroke-[2.2]" />
            <input
              value={searchQuery}
              onChange={(e) => scheduleSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const q = searchQuery.trim();
                  if (q) void handleSearch(1, q);
                }
              }}
              placeholder="Search manga by title or author..."
              className="w-full bg-transparent border-none outline-none text-sm md:text-base font-semibold text-foreground placeholder:text-muted-foreground/50 focus:ring-0 py-2 px-3.5 h-10 transition-all"
            />

            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("manga", "");
                  setHasSearched(false);
                }}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors mr-1.5 cursor-pointer"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center gap-2 shrink-0 pr-1">
              <button
                type="button"
                onClick={() => setMobileFilterOpen(true)}
                className={cn(
                  "p-2.5 rounded-xl transition-all flex items-center justify-center cursor-pointer",
                  isAdvancedFilterActive
                    ? "bg-primary/20 text-primary hover:bg-primary/30 border border-primary/25 shadow-inner"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 bg-transparent"
                )}
                title="Filters"
              >
                <Filter className="w-4 h-4 stroke-[2.2]" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const q = searchQuery.trim();
                  if (q) void handleSearch(1, q);
                }}
                disabled={displayLoading || !searchQuery.trim()}
                className="px-5 py-2 text-sm rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 disabled:opacity-40 transition-all shadow-xs shadow-primary/20 active:scale-95 cursor-pointer h-10"
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Right: Downloads Button */}
        <div className="flex items-center gap-2 shrink-0">
          <DownloadsButton />
        </div>
      </div>

      <div className="px-3 md:px-6 pt-1 md:pt-3 max-w-5xl mx-auto w-full">
        {mangadexError && (
          <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {mangadexError}
          </div>
        )}

        {pluginError && (
          <div className="mt-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <div className="font-medium mb-1">
              {pluginError.includes("Cloudflare")
                ? "🔒 Blocked by Cloudflare"
                : "Search Failed"}
            </div>
            {pluginError.includes("Cloudflare") ? (
              <div className="space-y-2.5">
                <p className="text-sm text-muted-foreground">{pluginError}</p>
                {pluginError.includes("IPv6") && (
                  <p className="text-xs text-amber-500 opacity-90">
                    💡 This network appears to lack IPv6 — Cloudflare
                    verification needs it. Try a phone hotspot, enable IPv6 on
                    your router, or use a VPN with IPv6.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  This source requires browser verification and cannot be
                  accessed automatically.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (!activeSource) return;
                      setCfVerifying(true);
                      setCfVerifyMsg(null);
                      try {
                        const verifyUrl =
                          cfVerifyUrl ??
                          getCfVerifyUrl(activeSource.id, activeSource.website);
                        if (!verifyUrl) {
                          setCfVerifyMsg(
                            "Verification failed: no source URL available",
                          );
                          return;
                        }
                        await solveCfChallenge(verifyUrl, "visible");
                        setCfVerifyMsg(
                          "Verification completed — retry your search now.",
                        );
                      } catch (err) {
                        console.warn("[CF] verify failed:", err);
                        setCfVerifyMsg(
                          `Verification failed: ${
                            err instanceof Error ? err.message : String(err)
                          }`,
                        );
                      } finally {
                        setCfVerifying(false);
                      }
                    }}
                    disabled={cfVerifying}
                    className="gap-2"
                  >
                    {cfVerifying && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    {cfVerifying ? "Verifying…" : "Verify in browser"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      setNetDiagChecking(true);
                      setNetDiagError(null);
                      try {
                        const result = await invoke<NetIpv6Diagnostics>(
                          "network_ipv6_diagnostics",
                        );
                        setNetDiag(result);
                      } catch (err) {
                        console.warn("[CF] network check failed:", err);
                        setNetDiagError(getErrorMessage(err));
                      } finally {
                        setNetDiagChecking(false);
                      }
                    }}
                    disabled={netDiagChecking}
                    className="gap-2"
                  >
                    {netDiagChecking && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    {netDiagChecking ? "Checking…" : "Check network"}
                  </Button>
                </div>
                {cfVerifyMsg && (
                  <p
                    className={cn(
                      "text-xs",
                      cfVerifyMsg.startsWith("Verification failed")
                        ? "text-amber-500"
                        : "text-green-600",
                    )}
                  >
                    {cfVerifyMsg}
                  </p>
                )}
                {netDiagError && (
                  <p className="text-xs text-amber-500">
                    Network check failed: {netDiagError}
                  </p>
                )}
                {netDiag && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1.5">
                    <p
                      className={cn(
                        "text-xs",
                        netDiag.attestationReachable
                          ? "text-green-600"
                          : "text-amber-500",
                      )}
                    >
                      {!netDiag.hasGlobalIpv6
                        ? "No IPv6 detected — Cloudflare verification cannot complete on this network."
                        : netDiag.attestationReachable
                          ? "IPv6 OK — verification should work; try the Verify button."
                          : "IPv6 present, but Cloudflare's verification server is unreachable."}
                    </p>
                    {netDiag.suggestions.length > 0 && (
                      <ul className="list-disc pl-4 space-y-0.5">
                        {netDiag.suggestions.map((suggestion, i) => (
                          <li
                            key={i}
                            className="text-xs text-amber-500 opacity-90"
                          >
                            {suggestion}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground opacity-80">
                  After verifying, retry your search.
                </p>
                <p className="text-xs text-muted-foreground opacity-70">
                  Alternative: switch to <strong>MangaDex</strong> for
                  unrestricted access.
                </p>
              </div>
            ) : (
              <div className="text-sm">{pluginError}</div>
            )}
          </div>
        )}
      </div>

      <div
        className={cn(
          "flex-1 overflow-y-auto",
          isMobile ? "pb-28 p-3 pt-3 sm:p-6" : "p-6",
        )}
      >
        <div className="max-w-7xl mx-auto">
          {displayLoading && (
            <div className="py-8">
              <SkeletonGrid count={12} />
            </div>
          )}

          {!displayLoading &&
            hasVisibleSearched &&
            !isPluginMangaSource &&
            visibleResults.length === 0 &&
            hasEnabledMangaSource && (
              <div className="text-center py-12">
                <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-medium text-muted-foreground">
                  No manga found
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try a different search query
                </p>
              </div>
            )}

          {!displayLoading &&
            hasVisibleSearched &&
            isPluginMangaSource &&
            visiblePluginResults.length === 0 &&
            hasEnabledMangaSource && (
              <div className="text-center py-12">
                <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-medium text-muted-foreground">
                  No manga found
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try a different search query
                </p>
              </div>
            )}

          {!displayLoading && !hasVisibleSearched && hasEnabledMangaSource && (
            <div className="space-y-4">
              <MobileFilterSheet
                open={mobileFilterOpen}
                onOpenChange={setMobileFilterOpen}
                activeGenres={activeGenres}
                activeTypes={activeTypes}
                activeMode={activeMode}
                onApply={(g, t, m) => {
                  setActiveGenres(g);
                  setActiveTypes(t);
                  setActiveMode(m);
                }}
                onRandomClick={handleRandomClick}
              />

              <div className="flex flex-col xl:flex-row gap-8">
                {isAdvancedFilterActive ? (
                  <div className="flex-1 w-full flex flex-col items-center">
                    {isAdvancedBrowseLoading ? (
                      <div className="w-full">
                        <SkeletonGrid count={12} />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-6 w-full max-w-[1920px] pb-12">
                          {advancedBrowseResults.map((manga, i) => (
                          <div
                            key={`${manga.id}-${i}`}
                            className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both"
                            style={{
                              animationDelay: `${i * 50}ms`,
                              animationDuration: "500ms",
                            }}
                          >
                            <ModernBookCard
                              id={manga.id}
                              title={manga.title}
                              coverUrl={manga.coverUrl || ""}
                              author={manga.author}
                              onClick={() => {
                                if (isPluginMangaSource) {
                                  void handleViewPluginChapters({
                                    id: manga.id,
                                    title: manga.title,
                                    cover_url: manga.coverUrl || "",
                                    summary: manga.description,
                                  });
                                } else {
                                  void handleViewChapters(manga);
                                }
                              }}
                            />
                          </div>
                        ))}
                        {advancedBrowseResults.length === 0 && (
                          <div className="col-span-full text-center text-muted-foreground p-12 text-lg">
                            No manga found matching the selected filters.
                          </div>
                        )}
                      </div>
                      {/* Infinite Scroll Trigger */}
                      {hasMoreBrowseResults && advancedBrowseResults.length > 0 && (
                        <div ref={loadMoreRef} className="w-full py-8 flex justify-center">
                          <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
                        </div>
                      )}
                    </>
                  )}
                </div>
                ) : (
                  <div className="w-full flex flex-col min-w-0">
                    {/* Featured Hero Spotlight Banner */}
                    <HeroMangaBanner
                      items={toCarouselItems(browseData.popular)}
                      loading={browseLoading.popular}
                      onReadClick={handleCarouselItemClick}
                      sourceId={activeSource?.id || ''}
                    />

                    {/* Trending / Popular Rail */}
                    <MangaContentRow
                      title={isMangaDexEnabled ? "Trending This Week" : "Popular"}
                      icon={<Flame className="w-5 h-5 text-primary" />}
                      items={toCarouselItems(browseData.popular)}
                      loading={browseLoading.popular}
                      onItemClick={handleCarouselItemClick}
                      onViewAll={() => setActiveMode('popular')}
                    />

                    {/* Latest Updates Rail */}
                    <MangaContentRow
                      title="Latest Chapter Updates"
                      icon={<Clock className="w-5 h-5 text-primary" />}
                      items={toCarouselItems(browseData.latest)}
                      loading={browseLoading.latest}
                      onItemClick={handleCarouselItemClick}
                      onViewAll={() => setActiveMode('latest')}
                    />

                    {/* Top Rated Favorites Rail */}
                    <MangaContentRow
                      title="Top Rated & Community Favorites"
                      icon={<Trophy className="w-5 h-5 text-primary" />}
                      items={toCarouselItems(browseData["top-rated"])}
                      loading={browseLoading["top-rated"]}
                      onItemClick={handleCarouselItemClick}
                      onViewAll={() => setActiveMode('top-rated')}
                    />

                    {/* Staff Picks / Hidden Gems Rail */}
                    <MangaContentRow
                      title={isMangaDexEnabled ? "Staff Picks & Hidden Gems" : "Recently Added"}
                      icon={<Compass className="w-5 h-5 text-primary" />}
                      items={toCarouselItems(browseData.recent)}
                      loading={browseLoading.recent}
                      onItemClick={handleCarouselItemClick}
                      onViewAll={() => setActiveMode('recent')}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {!displayLoading &&
            visibleResults.length > 0 &&
            isMangaDexEnabled && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Found{" "}
                    <span className="font-medium text-foreground">
                      {visibleTotalResults.toLocaleString()}
                    </span>{" "}
                    results
                  </p>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSearch(visibleCurrentPage - 1)}
                        disabled={visibleCurrentPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {visibleCurrentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSearch(visibleCurrentPage + 1)}
                        disabled={visibleCurrentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-6">
                  {visibleResults.map((manga) => (
                    <ModernBookCard
                      key={manga.id}
                      id={manga.id}
                      title={manga.title}
                      coverUrl={manga.coverUrl}
                      author={manga.author}
                      onClick={() => {
                        if (isPluginMangaSource) {
                          void handleViewPluginChapters({
                            id: manga.id,
                            title: manga.title,
                            cover_url: manga.coverUrl || "",
                            summary: manga.description,
                          });
                        } else {
                          void handleViewChapters(manga);
                        }
                      }}
                    />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => handleSearch(visibleCurrentPage - 1)}
                      disabled={visibleCurrentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground px-4">
                      Page {visibleCurrentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => handleSearch(visibleCurrentPage + 1)}
                      disabled={visibleCurrentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}

          {!displayLoading &&
            visiblePluginResults.length > 0 &&
            isPluginMangaSource && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Found{" "}
                    <span className="font-medium text-foreground">
                      {visiblePluginResults.length.toLocaleString()}
                    </span>{" "}
                    results
                  </p>
                </div>

                <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-6">
                  {pluginResultWithTorboxSource.map(({ item: manga }) => (
                    <ModernBookCard
                      key={manga.id}
                      id={manga.id}
                      title={manga.title}
                      coverUrl={manga.coverUrl || manga.cover_url}
                      author={manga.author}
                      onClick={() => handleViewPluginChapters(manga)}
                    />
                  ))}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
