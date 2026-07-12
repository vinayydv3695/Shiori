/**
 * LibraryGrid — Shiori v3.1 (performance)
 *
 * CSS Grid auto-fill + IntersectionObserver lazy entrance.
 * Domain filtering: books vs manga is hard-separated.
 * Staggered card animation based on render index.
 *
 * Performance improvements vs v3.0:
 * - coverSize read once at grid level, passed as prop (removes N Zustand subscriptions)
 * - onFavorite memoized with useCallback (stable reference across renders)
 * - handleOpen uses a Map lookup instead of O(n) Array.find()
 * - cover prefetch is windowed to virtual rows (not full dataset)
 */

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import type { Book } from "@/lib/tauri";
import { api } from "@/lib/tauri";
import { PremiumBookCard } from "./ModernBookCard";
import { SeriesCard } from "./SeriesCard";
import { useLibraryStore } from "@/store/libraryStore";
import type { DomainView } from "@/store/uiStore";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useGroupedLibrary, type SeriesGroup } from "@/hooks/useGroupedLibrary";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  IconBookOpen,
  IconManga,
  IconImportBook,
  IconImportManga,
} from "@/components/icons/ShioriIcons";
import { usePreferencesStore } from "@/store/preferencesStore";
import { prefetchCovers } from "@/lib/coverCache";
import { MobileStickyHeader } from "../layout/MobileStickyHeader";

import { cn, isMangaDomain } from "@/lib/utils";

const COVER_PREFETCH_BATCH_LIMIT = 120;

interface LibraryGridProps {
  books: Book[];
  currentDomain?: DomainView;
  onBookClick?: (bookId: number) => void;
  onViewDetails?: (bookId: number) => void;
  onEditBook?: (bookId: number) => void;
  onDeleteBook?: (bookId: number) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onOpenAdvancedFilter?: () => void;

  onImport?: () => void;
  onViewSeries?: (series: SeriesGroup) => void;
}

// ─── Domain Empty State ──────────────────────
interface EmptyStateProps {
  domain: DomainView;
  hasFilters: boolean;
  onImport?: () => void;
}

const EmptyState = ({ domain, hasFilters, onImport }: EmptyStateProps) => {
  const isMangaComics = domain === "manga_comics";

  const iconVariants = {
    initial: { y: 0 },
    animate: {
      y: [-8, 8, -8],
      transition: { duration: 6, repeat: Infinity, ease: "easeInOut" },
    },
  };

  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center gap-3">
        <motion.div
          variants={iconVariants as any}
          initial="initial"
          animate="animate"
          className="w-14 h-14 rounded-2xl bg-muted/80 backdrop-blur-sm border border-border/50 shadow-sm flex items-center justify-center"
        >
          {isMangaComics ? (
            <IconManga size={28} className="text-muted-foreground/60" />
          ) : (
            <IconBookOpen size={28} className="text-muted-foreground/60" />
          )}
        </motion.div>
        <div className="mt-2">
          <p className="text-sm font-semibold text-foreground">No results</p>
          <p className="text-xs text-muted-foreground mt-1">
            Try clearing your filters
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full py-20 text-center gap-4 px-8">
      <motion.div
        variants={iconVariants as any}
        initial="initial"
        animate="animate"
        className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/20 shadow-inner flex items-center justify-center relative"
      >
        <div className="absolute inset-0 bg-primary/10 rounded-2xl blur-xl" />
        {isMangaComics ? (
          <IconManga size={32} className="text-primary/70 relative z-10" />
        ) : (
          <IconBookOpen size={32} className="text-primary/70 relative z-10" />
        )}
      </motion.div>
      <div className="mt-2">
        <p className="text-base font-semibold text-foreground">
          {isMangaComics
            ? "Your manga & comics library is empty"
            : "Your book library is empty"}
        </p>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-[280px] mx-auto leading-relaxed">
          {isMangaComics
            ? "Import CBZ or CBR archives to start reading manga and comics here."
            : "Import ePub, PDF, or other ebook formats to get started."}
        </p>
      </div>
      {onImport && (
        <button
          onClick={onImport}
          className="mt-2 flex items-center gap-2 h-9 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all"
        >
          {isMangaComics ? (
            <IconImportManga size={16} />
          ) : (
            <IconImportBook size={16} />
          )}
          Import Books/Manga/Comics
        </button>
      )}
    </div>
  );
};

// ─── Grid ─────────────────────────────────────
export function LibraryGrid({
  books,
  currentDomain = "books",
  onBookClick,
  onViewDetails,
  onEditBook,
  onDeleteBook,
  searchQuery = "",
  onSearchChange = () => {},
  onOpenAdvancedFilter = () => {},

  onImport,
  onViewSeries,
}: LibraryGridProps) {
  const setSelectedBook = useLibraryStore((state) => state.setSelectedBook);
  const toggleBookSelection = useLibraryStore(
    (state) => state.toggleBookSelection,
  );
  const hasMore = useLibraryStore((state) => state.hasMore);
  const isLoading = useLibraryStore((state) => state.isLoading);
  const loadMoreBooks = useLibraryStore((state) => state.loadMoreBooks);
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  // Read preferences once at grid level — avoids N subscriptions inside each card
  const libraryDensity = usePreferencesStore(
    (state) => state.preferences?.libraryDensity,
  );
  const coverSize = usePreferencesStore(
    (state) => state.preferences?.coverSize ?? "medium",
  );
  const autoGroupManga = usePreferencesStore(
    (state) => state.preferences?.autoGroupManga,
  );
  
  const isMobile = useIsMobile();

  const baseDensityColumnSize =
    libraryDensity === "compact"
      ? 140
      : libraryDensity === "spacious"
        ? 240
        : 180;
        
  // Scale down column size slightly on mobile for better fit
  const densityColumnSize = isMobile ? Math.min(baseDensityColumnSize, 140) : baseDensityColumnSize;

  const [containerWidth, setContainerWidth] = useState(0);
  const [columns, setColumns] = useState(6);

  const estimatedRowHeight = useMemo(() => {
    if (!containerWidth || columns === 0) {
      const coverHeight = densityColumnSize * 1.5; // 2:3 aspect ratio
      const rowPadding = 8; // 4px top + 4px bottom
      return Math.ceil(coverHeight + rowPadding);
    }

    // Row has padding "4px 8px" (16px total horiz) and gap "8px"
    const horizontalPadding = 16;
    const totalGapWidth = (columns - 1) * 8;
    const availableWidth = containerWidth - horizontalPadding - totalGapWidth;
    
    // Calculate exact rendered width of each column to perfectly match the CSS flex grid
    const actualColumnWidth = availableWidth / columns;
    const actualCoverHeight = actualColumnWidth * 1.5;
    
    const rowPadding = 8; // 4px top + 4px bottom
    return Math.ceil(actualCoverHeight + rowPadding);
  }, [containerWidth, columns, densityColumnSize]);

  const [isFirstSeries, setIsFirstSeries] = useState(true);
  const prefetchedCoverIdsRef = useRef<Set<number>>(new Set());

  // Hard domain filter — strict separation between books and manga & comics
  const visibleLibrary = useMemo(() => {
    return books.filter((book) => {
      const isMangaComics = isMangaDomain(book);
      return currentDomain === "manga_comics" ? isMangaComics : !isMangaComics;
    });
  }, [books, currentDomain]);

  // Group books and manga when auto-grouping is enabled.
  const groupedItems = useGroupedLibrary(
    visibleLibrary,
    autoGroupManga !== false,
  );

  // O(1) book lookup by ID (replaces O(n) Array.find on every click)
  const bookById = useMemo(() => {
    const map = new Map<number, Book>();
    for (const book of books) {
      if (book.id != null) map.set(book.id, book);
    }
    return map;
  }, [books]);

  const handleOpen = useCallback(
    (bookId: number) => {
      const book = bookById.get(bookId);
      if (book) setSelectedBook(book);
      onBookClick?.(bookId);
    },
    [bookById, setSelectedBook, onBookClick],
  );

  // Stable favorite handler — not recreated on every render
  const handleFavorite = useCallback(
    async (id: number) => {
      await api.toggleBookFavorite(id);
      toggleFavorite(id);
    },
    [toggleFavorite],
  );

  const isEmpty = visibleLibrary.length === 0;

  const handleEditBook = useCallback((id: number) => onEditBook?.(id), [onEditBook]);
  const handleDeleteBook = useCallback((id: number) => onDeleteBook?.(id), [onDeleteBook]);

  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) {
        setContainerWidth(width);
        // Force at least 2 columns on mobile for normal density, but allow 1 if spacious
        const minCols = (isMobile && libraryDensity === "spacious") ? 1 : 2;
        setColumns(Math.max(minCols, Math.floor(width / densityColumnSize)));
      }
    });

    if (parentRef.current) {
      observer.observe(parentRef.current);
    }

    return () => observer.disconnect();
  }, [densityColumnSize, isMobile, libraryDensity]);

  const rowsCount = Math.ceil(groupedItems.length / columns);

  // TanStack Virtual v3 is compatible with React 19
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rowsCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 3,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastItem = virtualItems[virtualItems.length - 1];

  useEffect(() => {
    if (!lastItem) return;

    if (lastItem.index >= rowsCount - 2 && hasMore && !isLoading) {
      loadMoreBooks();
    }
  }, [lastItem, hasMore, isLoading, loadMoreBooks, rowsCount]);

  // Windowed cover prefetch: only prefetch books in/near current virtual rows.
  useEffect(() => {
    if (virtualItems.length === 0) return;

    const idsToPrefetch: number[] = [];

    for (const virtualRow of virtualItems) {
      const startIndex = virtualRow.index * columns;
      const rowItems = groupedItems.slice(startIndex, startIndex + columns);

      for (const item of rowItems) {
        if (item.type === "book") {
          if (item.data.id != null) idsToPrefetch.push(item.data.id);
          continue;
        }

        const firstVolumeId = item.data.books[0]?.id;
        if (firstVolumeId != null) idsToPrefetch.push(firstVolumeId);
      }
    }

    if (idsToPrefetch.length === 0) return;

    const uniqueNewIds = Array.from(new Set(idsToPrefetch)).filter(
      (id) => !prefetchedCoverIdsRef.current.has(id),
    );
    if (uniqueNewIds.length === 0) return;

    const batch = uniqueNewIds.slice(0, COVER_PREFETCH_BATCH_LIMIT);
    for (const id of batch) prefetchedCoverIdsRef.current.add(id);

    void prefetchCovers(batch);
  }, [virtualItems, groupedItems, columns]);

  return (
    <div
      className={cn("flex flex-col h-full w-full relative overflow-y-auto", isMobile ? "pb-24 pt-2" : "pb-4")}
      ref={parentRef}
    >
      <MobileStickyHeader 
        searchQuery={searchQuery} 
        onSearchChange={onSearchChange} 
        onOpenAdvancedFilter={onOpenAdvancedFilter}
      />

      {isEmpty ? (
        <EmptyState
          domain={currentDomain}
          hasFilters={books.length > 0}
          onImport={onImport}
        />
      ) : (
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
          role="grid"
          aria-label={`${currentDomain === "manga_comics" ? "Manga & Comics" : "Books"} library`}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const startIndex = virtualRow.index * columns;
            const rowItems = groupedItems.slice(
              startIndex,
              startIndex + columns,
            );

            return (
              <div
                key={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: "flex",
                  gap: "8px",
                  padding: "4px calc(8px + env(safe-area-inset-right, 0px)) 4px calc(8px + env(safe-area-inset-left, 0px))",
                }}
                role="row"
              >
                {rowItems.map((item, idx) => {
                  const absoluteIndex = startIndex + idx;
                  return (
                    <div
                      key={
                        item.type === "book"
                          ? `book-${item.data.id}`
                          : `series-${item.data.id}`
                      }
                      role="gridcell"
                      style={{ flex: "1 1 0", minWidth: 0 }}
                    >
                      {item.type === "book" ? (
                        <PremiumBookCard
                          book={item.data}
                          coverSize={coverSize}
                          onSelect={toggleBookSelection}
                          onOpen={handleOpen}
                          onViewDetails={onViewDetails}
                          onEdit={handleEditBook}
                          onDelete={handleDeleteBook}

                          onFavorite={handleFavorite}
                          animationDelay={Math.min(absoluteIndex * 10, 150)}
                          scrollRoot={parentRef.current}
                          forceVisible={true}
                        />
                      ) : (
                        <SeriesCard
                          series={item.data}
                          isSelected={false}
                          onSelect={() => {}}
                          onOpen={(series) => {
                            if (isFirstSeries) setIsFirstSeries(false);
                            onViewSeries?.(series);
                          }}
                          animationDelay={Math.min(absoluteIndex * 10, 150)}
                          scrollRoot={parentRef.current}
                          forceVisible={true}
                        />
                      )}
                    </div>
                  );
                })}
                {Array.from({ length: columns - rowItems.length }).map(
                  (_, i) => (
                    <div key={`empty-${i}`} style={{ flex: "1 1 0" }} />
                  ),
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
