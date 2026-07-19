import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { BookOpen, Loader2, Download } from "lucide-react";
import {
  useMangaDex,
  type MangaDexManga,
  type MangaDexChapter,
  type BrowseMode,
} from "@/hooks/useMangaDex";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSourceStore } from "@/store/sourceStore";
import { useOnlineSearchStore } from "@/store/onlineSearchStore";
import { OnlineSearchHeader } from "./OnlineSearchHeader";
import {
  pluginApi,
  type Chapter as PluginChapter,
  type SearchResult as PluginSearchResult,
} from "@/lib/pluginSources";
import { useUIStore } from "@/store/uiStore";
import { useOnlineMangaReaderStore } from "@/store/onlineMangaReaderStore";
import { useOnlineMangaBrowseStore } from "@/store/onlineMangaBrowseStore";
import { useLibraryStore } from "@/store/libraryStore";
import {
  OnlineMangaDetailView,
  type UnifiedChapter,
} from "./OnlineMangaDetailView";
import { MangaBrowseNavBar } from "./MangaBrowseNavBar";
import { MangaRankList } from "./MangaRankList";
import { OnlineResultCard } from "./OnlineResultCard";
import { ModernBookCard } from "./ModernBookCard";
import { SkeletonGrid } from "./SkeletonLoaders";
import { type CarouselItem } from "./ContentCarousel";
import { api, type ImportResult } from "@/lib/tauri";
import { parsePageUrl } from "@/lib/utils";
import { useToast } from "@/store/toastStore";
import { getErrorMessage } from "@/lib/errors";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

export function OnlineMangaView() {
  const isMobile = useIsMobile();
  const searchQuery = useOnlineSearchStore(
    (state) => state.queries["online-manga"],
  );
  const setSearchQuery = useOnlineSearchStore((state) => state.setQueryForKind);
  const [results, setResults] = useState<MangaDexManga[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(Boolean(searchQuery.trim()));
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
  const [chapters, setChapters] = useState<MangaDexChapter[]>([]);
  const [pluginResults, setPluginResults] = useState<PluginSearchResult[]>([]);
  const [pluginChapters, setPluginChapters] = useState<PluginChapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);
  const [queueingManga, setQueueingManga] = useState<Record<string, boolean>>(
    {},
  );
  const [hasTorboxKey, setHasTorboxKey] = useState(false);
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false);
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
    if (!activeSource) return;

    // We want to reload if the source changes, so we reset initialized if it changed
    // But since this is simple, we can just clear and reload every time activeSource changes.
    const loadBrowseData = async (mode: BrowseMode) => {
      setBrowseLoading((prev) => ({ ...prev, [mode]: true }));
      try {
        if (activeSource.id === "mangadex") {
          const data = await browseManga(mode, 20);
          setBrowseData((prev) => ({ ...prev, [mode]: data }));
        } else {
          const raw = await pluginApi.browse(activeSource.id, mode, 1, 20);
          const data: MangaDexManga[] = raw.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.summary || item.description || "",
            coverUrl: item.coverUrl || item.cover_url,
          }));
          setBrowseData((prev) => ({ ...prev, [mode]: data }));
        }
      } catch (err) {
        logger.error(
          `Failed to load ${mode} manga for ${activeSource.id}:`,
          err,
        );
        setBrowseData((prev) => ({ ...prev, [mode]: [] }));
      } finally {
        setBrowseLoading((prev) => ({ ...prev, [mode]: false }));
      }
    };

    // Reset data before fetching
    setBrowseData({ popular: [], latest: [], recent: [], "top-rated": [] });
    setBrowseInitialized(true);

    // Load all browse modes in parallel
    void loadBrowseData("popular");
    void loadBrowseData("latest");
    void loadBrowseData("recent");
    void loadBrowseData("top-rated");
  }, [activeSource?.id]); // Re-run when source ID changes

  // Load advanced browse data when filters change
  useEffect(() => {
    if (!activeSource || !isAdvancedFilterActive) return;

    const loadAdvancedBrowse = async () => {
      setIsAdvancedBrowseLoading(true);
      try {
        const mode = activeMode || "latest";
        const raw = await pluginApi.browse(
          activeSource.id,
          mode,
          1,
          40, // load more for grid
          activeGenres.length > 0 ? activeGenres : undefined,
          activeTypes.length > 0 ? activeTypes : undefined,
        );
        const data: MangaDexManga[] = raw.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.summary || item.description || "",
          coverUrl: item.coverUrl || item.cover_url,
        }));
        setAdvancedBrowseResults(data);
      } catch (err) {
        logger.error(
          `Failed to load advanced browse results for ${activeSource.id}:`,
          err,
        );
        setAdvancedBrowseResults([]);
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
  ]);

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
          setPluginError(message);
          setPluginResults([]);
        }
      }
    },
    [activePluginSourceId, isMangaDexEnabled, searchManga, searchQuery],
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
      setSelectedManga(manga);
      setSelectedPluginManga(null);
      setChapters([]);
      setChaptersLoading(true);
      setPluginError(null);

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
      setPluginError(message);
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
      }
    },
    [
      browseData,
      handleViewChapters,
      isMangaDexEnabled,
      handleViewPluginChapters,
    ],
  );

  const openInBrowser = useCallback((url: string) => {
    try {
      const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
      if (!openedWindow) {
        window.location.assign(url);
      }
    } catch {
      window.location.assign(url);
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
    if (selectedManga && isMangaDexEnabled) {
      return chapters.map((c) => ({
        id: c.id,
        volume: c.volume || "None",
        chapter: c.chapter || "?",
        title: c.title || "",
        pages: c.pages,
        sourceType: "mangadex",
        originalChapter: c,
        date: c.publishAt
          ? new Date(c.publishAt).toLocaleDateString()
          : undefined,
      }));
    }
    if (selectedPluginManga && isPluginMangaSource) {
      return pluginChapters.map((c) => ({
        id: c.id,
        volume: c.volume ? String(c.volume) : "None",
        chapter: c.number !== undefined ? String(c.number) : "?",
        title: c.title || "",
        pages: c.pages,
        sourceType: "plugin",
        originalChapter: c,
        date: c.date ? new Date(c.date).toLocaleDateString() : undefined,
      }));
    }
    return [];
  }, [
    chapters,
    pluginChapters,
    selectedManga,
    selectedPluginManga,
    isMangaDexEnabled,
    isPluginMangaSource,
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
      await api.addBook({
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
      });

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

  const handleDownloadChapters = async (selectedChapters: UnifiedChapter[]) => {
    if (selectedChapters.length === 0) return;
    const manga = selectedManga || selectedPluginManga;
    if (!manga) return;

    const isPlugin = !!selectedPluginManga;
    const effectiveSourceId = isPlugin
      ? ((selectedPluginManga!.extra as any)?.librarySourceId ??
        activePluginSourceId!)
      : "mangadex";
    const mangaTitle = manga.title;

    const pathsToImport: string[] = [];
    const downloadFailures: { chapter: string; reason: string }[] = [];
    showInfoToast(`Started downloading ${selectedChapters.length} chapters...`);

    let i = 0;
    for (const ch of selectedChapters) {
      i++;
      try {
        const uniqueChapterTitle = ch.title 
          ? (ch.title.toLowerCase().includes('chapter') ? ch.title : `Chapter ${ch.chapter} - ${ch.title}`)
          : `Chapter ${ch.chapter}`;
          
        setDownloadProgress({
          chapterTitle: uniqueChapterTitle,
          progress: 0,
          total: 1,
          chapterIndex: i,
          totalChapters: selectedChapters.length,
        });
        const cbzPath = await invoke<string>("download_manga_chapter_as_cbz", {
          sourceId: effectiveSourceId,
          mangaTitle: mangaTitle,
          chapterId: ch.id,
          chapterTitle: uniqueChapterTitle,
        });
        pathsToImport.push(cbzPath);
      } catch (err) {
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
      const result = await invoke<ImportResult>("import_manga", {
        paths: pathsToImport,
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

  const downloadProgressToast = downloadProgress ? (
    <div className="fixed bottom-6 right-6 z-50 bg-background/95 backdrop-blur-2xl border border-border rounded-xl shadow-[0_0_50px_-10px_rgba(0,0,0,0.7)] p-5 w-80 animate-in fade-in slide-in-from-bottom-6 flex flex-col gap-3">
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
            setSelectedManga(null);
            setSelectedPluginManga(null);
          }}
          onReadChapter={handleReadUnifiedChapter}
          onSaveToLibrary={handleSaveToLibrary}
          isInLibrary={!!libraryBook}
          lastReadChapterId={lastReadChapterId}
          onDownloadChapters={handleDownloadChapters}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Download Progress Toast Overlay */}
      {downloadProgressToast}
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
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  ToonGod has Cloudflare protection. To access it you need to
                  configure a bypass:
                </p>
                <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1 ml-1">
                  <li>
                    Open{" "}
                    <strong className="text-foreground">toongod.org</strong> in
                    your browser and solve the CAPTCHA
                  </li>
                  <li>
                    Open DevTools → Application → Cookies → copy{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                      cf_clearance
                    </code>
                  </li>
                  <li>
                    Go to{" "}
                    <strong className="text-foreground">
                      Settings → Download Services → ToonGod → Cloudflare Bypass
                    </strong>
                  </li>
                  <li>
                    Paste the value and click Save, then retry your search
                  </li>
                </ol>
                <p className="text-xs text-muted-foreground opacity-70 mt-1">
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
          isMobile ? "pb-24 p-3 pt-8" : "p-6",
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
              {/* Hero Banner Desktop */}
              <div className="hidden md:block">
                <MangaBrowseNavBar
                  activeGenres={activeGenres}
                  activeTypes={activeTypes}
                  activeMode={activeMode}
                  onFilterChange={(g, t, m) => {
                    setActiveGenres(g);
                    setActiveTypes(t);
                    setActiveMode(m);
                  }}
                  onRandomClick={handleRandomClick}
                />
              </div>

              <Dialog
                open={mobileFilterOpen}
                onOpenChange={setMobileFilterOpen}
              >
                <DialogContent className="max-w-[90vw] rounded-2xl p-6 bg-background/95 backdrop-blur-xl border-white/10">
                  <DialogHeader>
                    <DialogTitle>Browse Filters</DialogTitle>
                  </DialogHeader>
                  <div className="mt-4">
                    <MangaBrowseNavBar
                      activeGenres={activeGenres}
                      activeTypes={activeTypes}
                      activeMode={activeMode}
                      onFilterChange={(g, t, m) => {
                        setActiveGenres(g);
                        setActiveTypes(t);
                        setActiveMode(m);
                      }}
                      onRandomClick={handleRandomClick}
                      isMobileDialog={true}
                    />
                  </div>
                </DialogContent>
              </Dialog>

              <div className="flex flex-col xl:flex-row gap-8">
                {isAdvancedFilterActive ? (
                  <div className="flex-1 w-full flex flex-col items-center">
                    {isAdvancedBrowseLoading ? (
                      <div className="w-full">
                        <SkeletonGrid count={12} />
                      </div>
                    ) : (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-6 w-full max-w-[1920px] pb-12">
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
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-8 min-w-0">
                    {/* Popular Manga Carousel */}
                    <div className="mb-10">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold tracking-tight text-foreground">
                          {isMangaDexEnabled ? "Trending This Week" : "Popular"}
                        </h2>
                      </div>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-6 mt-4">
                        {browseLoading.popular ? (
                          <SkeletonGrid count={5} />
                        ) : (
                          toCarouselItems(browseData.popular)
                            .slice(0, 5)
                            .map((item) => (
                              <ModernBookCard
                                key={item.id}
                                id={item.id}
                                title={item.title}
                                coverUrl={item.coverUrl}
                                author={item.subtitle}
                                onClick={() => handleCarouselItemClick(item)}
                              />
                            ))
                        )}
                      </div>
                    </div>

                    {/* Latest Updates Carousel */}
                    <div className="mb-10">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold tracking-tight text-foreground">Latest Updates</h2>
                      </div>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-6 mt-4">
                        {browseLoading.latest ? (
                          <SkeletonGrid count={5} />
                        ) : (
                          toCarouselItems(browseData.latest)
                            .slice(0, 5)
                            .map((item) => (
                              <ModernBookCard
                                key={item.id}
                                id={item.id}
                                title={item.title}
                                coverUrl={item.coverUrl}
                                author={item.subtitle}
                                onClick={() => handleCarouselItemClick(item)}
                              />
                            ))
                        )}
                      </div>
                    </div>

                    {/* You Should Read (Recent) */}
                    <div className="mb-10">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold tracking-tight text-foreground">
                          {isMangaDexEnabled
                            ? "Staff Picks / You Should Read"
                            : "Recent"}
                        </h2>
                      </div>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-6 mt-4">
                        {browseLoading.recent ? (
                          <SkeletonGrid count={5} />
                        ) : (
                          toCarouselItems(browseData.recent)
                            .slice(0, 5)
                            .map((item) => (
                              <ModernBookCard
                                key={item.id}
                                id={item.id}
                                title={item.title}
                                coverUrl={item.coverUrl}
                                author={item.subtitle}
                                onClick={() => handleCarouselItemClick(item)}
                              />
                            ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* Sidebar (Right) */}
                {!isAdvancedFilterActive && (
                  <div className="w-full xl:w-80 2xl:w-96 flex-shrink-0">
                    <MangaRankList
                      title="Top Rated"
                      items={toCarouselItems(browseData["top-rated"])}
                      loading={browseLoading["top-rated"]}
                      onItemClick={handleCarouselItemClick}
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

                <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-6">
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

                <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-6">
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
