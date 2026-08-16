/**
 * SeriesCard — Shiori v3.0
 *
 * Displays a manga/comic series as a stacked 3D card with:
 * - 3-layer depth effect (two offset background layers behind the cover)
 * - 2:3 aspect ratio cover with lazy loading
 * - Volume count badge with Layers icon
 * - Series title + author metadata strip
 * - Hover animations matching PremiumBookCard
 * - Entrance animation via CSS class
 */

import { useState, useEffect, useRef, memo } from "react";
import { Layers, Rss } from "lucide-react";
import { cn, formatRssOrDateTitle } from "@/lib/utils";
import { useCoverImage } from "../common/hooks/useCoverImage";
import type { SeriesCardProps } from "./types";
import { IconBookOpen } from "@/components/icons/ShioriIcons";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Edit2, SplitSquareHorizontal, Trash2 } from "lucide-react";
import { SeriesManagementDialog } from "./SeriesManagementDialog";
import { api } from "@/lib/tauri";
import { useLibraryStore } from "@/store/libraryStore";
import { useToast } from "@/store/toastStore";

// ─── Shimmer Skeleton ─────────────────────────
const CoverSkeleton = () => (
  <div className="absolute inset-0 shimmer rounded-t-[inherit]" />
);

export interface EditorialCoverProps {
  title: string;
  bookCount: number;
  authors: string[];
  isRss?: boolean;
}

export function EditorialSeriesCover({ title, bookCount, authors, isRss }: EditorialCoverProps) {
  const authorStr = authors.filter(Boolean).join(", ") || (isRss ? "Daily RSS Feed" : "Unknown Author");
  const parsedTitle = formatRssOrDateTitle(title);

  return (
    <div className="absolute inset-0 z-0 flex flex-col justify-between p-3.5 select-none overflow-hidden bg-card border border-border/50 text-foreground">
      {/* Subtle Spine Accent */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary/35 pointer-events-none" />

      {/* Top Header Label */}
      <div className="relative z-10 flex items-center justify-between w-full pl-1">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {isRss ? (
            <Rss className="w-3.5 h-3.5 text-primary" />
          ) : (
            <Layers className="w-3.5 h-3.5 text-primary" />
          )}
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
            {isRss ? "RSS Digest" : "Series"}
          </span>
        </div>

        <span className="text-[10px] font-semibold text-muted-foreground">
          {bookCount} {bookCount === 1 ? "Vol" : "Vols"}
        </span>
      </div>

      {/* Center: Clean Icon + Title + Date */}
      <div className="relative z-10 my-auto flex flex-col items-center justify-center text-center px-1">
        <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-2 shadow-xs">
          {isRss ? (
            <Rss className="w-4 h-4 text-primary" />
          ) : (
            <IconBookOpen size={18} className="text-primary" />
          )}
        </div>
        
        <h3 className="font-bold text-foreground text-xs sm:text-sm leading-snug line-clamp-2 tracking-tight">
          {parsedTitle.mainTitle}
        </h3>

        {parsedTitle.dateSubtitle && (
          <span className="text-[11px] font-bold text-primary mt-0.5 tracking-tight">
            {parsedTitle.dateSubtitle}
          </span>
        )}
        
        {authorStr && (
          <p className="text-[11px] text-muted-foreground truncate w-full text-center mt-1 opacity-80">
            {authorStr}
          </p>
        )}
      </div>

      {/* Bottom Tag */}
      <div className="relative z-10 flex items-center justify-center w-full pt-1">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80 bg-secondary/80 px-2 py-0.5 rounded-full border border-border/40">
          {isRss ? "Daily Reading" : "Collected Edition"}
        </span>
      </div>
    </div>
  );
}

// ─── Main Card ────────────────────────────────
export const SeriesCard = memo(function SeriesCard({
  series,
  isSelected,
  onSelect,
  onOpen,
  animationDelay = 0,
  scrollRoot,
  forceVisible = false,
}: SeriesCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(forceVisible);

  const [managementOpen, setManagementOpen] = useState(false);
  const [managementTab, setManagementTab] = useState<
    "edit" | "volumes" | "merge"
  >("edit");
  const toast = useToast();

  const handleEditSeries = () => {
    setManagementTab("edit");
    setManagementOpen(true);
  };

  const handleManageVolumes = () => {
    setManagementTab("volumes");
    setManagementOpen(true);
  };

  const handleDeleteSeries = async () => {
    try {
      const list = await api.getMangaSeriesList(1000, 0);
      const targetSeries = list.find(s => s.title.toLowerCase() === series.title.toLowerCase());
      
      if (targetSeries && targetSeries.id !== undefined) {
          await api.deleteMangaSeries(targetSeries.id);
      }
      
      const bookIds = series.books.map(b => b.id).filter((id): id is number => id !== undefined);
      if (bookIds.length > 0) {
          await api.deleteBooks(bookIds);
      }
      
      toast.success("Series deleted");
      await useLibraryStore.getState().loadInitialBooks();
    } catch (err) {
        toast.error("Error", "Failed to delete series");
    }
  };

  const handleUngroupAll = async () => {
    try {
      for (const book of series.books) {
        if (book.id) {
          await api.removeBookFromSeries(book.id);
        }
      }
      toast.success("Ungrouped", "All volumes removed from series.");
      await useLibraryStore.getState().loadInitialBooks();
    } catch (err) {
      toast.error("Error", "Failed to ungroup volumes");
    }
  };

  // Use the first book's cover as the series cover
  const firstBook = series.books[0];
  const { coverUrl, loading: coverLoading } = useCoverImage(
    visible ? firstBook?.id : undefined,
    firstBook?.cover_path
  );

  const isRss = series.books.some((b) => b.tags?.some((t: any) => t.name === 'RSS')) ||
    /rss|feed|daily reading|daily digest|newsletter/i.test(series.title);
  const hasCover = !!coverUrl && !imgError;

  useEffect(() => {
    if (forceVisible) return;
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: scrollRoot ?? null, threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRoot, forceVisible]);

  const handleClick = (e: React.MouseEvent) => {
    if ((e.shiftKey || e.ctrlKey || e.metaKey) && onSelect) {
      onSelect(series.id);
    } else {
      onOpen?.(series);
    }
  };

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            ref={cardRef}
            onClick={handleClick}
            style={{ animationDelay: `${animationDelay}ms` }}
            className={cn(
              "group relative flex flex-col cursor-pointer select-none",
              !visible && "opacity-0",
              visible && "animate-card-in",
            )}
          >
            {/* ── Stacked Depth Effect Container ── */}
            <div className="relative">
              {/* Layer 3 (back-most) — offset right and down */}
              <div
                className={cn(
                  "absolute inset-0 rounded-md",
                  "bg-muted border border-border/40",
                  "translate-x-2 translate-y-2",
                  "transition-transform duration-[150ms]",
                  "group-hover:translate-x-2.5 group-hover:translate-y-2.5",
                )}
              />

              {/* Layer 2 (middle) — offset slightly */}
              <div
                className={cn(
                  "absolute inset-0 rounded-md",
                  "bg-muted/80 border border-border/50",
                  "translate-x-1 translate-y-1",
                  "transition-transform duration-[150ms]",
                  "group-hover:translate-x-1.5 group-hover:translate-y-1.5",
                )}
              />

              {/* Layer 1 (front cover) — the actual card */}
              <div
                className={cn(
                  "relative rounded-md overflow-hidden",
                  "bg-card border border-border",
                  "transition-all duration-[150ms]",
                  isSelected
                    ? "ring-2 ring-primary border-primary shadow-md"
                    : "hover:border-border/80 hover:shadow-md hover:-translate-y-px",
                  "border-[var(--manga-accent)]/20",
                )}
              >
                {/* ── Cover Area (2:3 ratio) ── */}
                <div className="relative aspect-[2/3] bg-muted overflow-hidden">
                  {/* Skeleton */}
                  {(coverLoading || !imgLoaded) && !imgError && (
                    <CoverSkeleton />
                  )}

                  {/* Cover image */}
                  {coverUrl && !imgError && (
                    <img
                      src={coverUrl}
                      alt={series.title}
                      loading="lazy"
                      decoding="async"
                      onLoad={() => setImgLoaded(true)}
                      onError={() => setImgError(true)}
                      className={cn(
                        "absolute inset-0 w-full h-full object-cover bg-muted",
                        "transition-opacity duration-300",
                        imgLoaded ? "opacity-100" : "opacity-0",
                      )}
                    />
                  )}

                  {/* Editorial Fallback (no cover) */}
                  {(!coverUrl || imgError) && !coverLoading && (
                    <EditorialSeriesCover
                      title={series.title}
                      bookCount={series.bookCount}
                      authors={Array.from(series.authors)}
                      isRss={isRss}
                    />
                  )}

                  {/* Hover overlay with "View Series" */}
                  <div
                    className={cn(
                      "absolute inset-0 flex items-center justify-center z-30",
                      "bg-background/60 backdrop-blur-[2px]",
                      "opacity-0 group-hover:opacity-100",
                      "transition-opacity duration-[150ms]",
                      "rounded-t-[inherit]",
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                        "bg-background/90 backdrop-blur-sm",
                        "border border-border/60",
                        "text-foreground/80 text-xs font-medium",
                        "shadow-sm",
                      )}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      View Series
                    </div>
                  </div>

                  {series.bookCount > 1 && hasCover && (
                    <div
                      className={cn(
                        "absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded shadow-sm z-30",
                        "bg-[var(--manga-accent)] text-white",
                        "text-[9px] font-bold tracking-wide",
                      )}
                    >
                      <Layers className="w-2.5 h-2.5" />
                      {series.bookCount}
                    </div>
                  )}

                  {/* ── Info Strip (Only when real cover image exists) ── */}
                  {hasCover && (
                    <div className={cn(
                      'absolute bottom-0 left-0 right-0 z-20',
                      'flex flex-col justify-end',
                      'bg-gradient-to-t from-black/95 via-black/80 to-transparent',
                      'px-2 pt-8 pb-2 rounded-b-[inherit]',
                    )}>
                      <h3
                        className={cn(
                          'font-bold leading-tight drop-shadow-sm text-white/95 line-clamp-2 text-sm',
                        )}
                        title={series.title}
                      >
                        {series.title}
                      </h3>
                      <p
                        className={cn(
                          'truncate drop-shadow-sm text-white/75 font-medium mt-0.5 text-xs',
                        )}
                        title={Array.from(series.authors).join(", ")}
                      >
                        {Array.from(series.authors).join(", ") || (isRss ? "Daily RSS Feed" : "Unknown Author")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[160px] bg-background border border-border rounded-md shadow-md p-1 z-50 text-sm">
            <ContextMenu.Item
              className="flex items-center px-2 py-1.5 rounded cursor-pointer hover:bg-muted outline-none"
              onClick={handleEditSeries}
            >
              <Edit2 className="w-4 h-4 mr-2" />
              Edit Series
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex items-center px-2 py-1.5 rounded cursor-pointer hover:bg-muted outline-none"
              onClick={handleManageVolumes}
            >
              <SplitSquareHorizontal className="w-4 h-4 mr-2" />
              Manage Volumes
            </ContextMenu.Item>
            <ContextMenu.Separator className="h-px bg-border my-1" />
            <ContextMenu.Item
              className="flex items-center px-2 py-1.5 rounded cursor-pointer hover:bg-destructive/10 text-destructive outline-none"
              onClick={handleUngroupAll}
            >
              <SplitSquareHorizontal className="w-4 h-4 mr-2" />
              Ungroup All
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex items-center px-2 py-1.5 rounded cursor-pointer hover:bg-destructive/10 text-destructive outline-none"
              onClick={handleDeleteSeries}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Series
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <SeriesManagementDialog
        open={managementOpen}
        onOpenChange={setManagementOpen}
        seriesTitle={series.title}
        ephemeralCover={series.firstCover}
        ephemeralBooks={series.books}
        initialTab={managementTab}
        onUpdated={() => useLibraryStore.getState().loadInitialBooks()}
      />
    </>
  );
});
