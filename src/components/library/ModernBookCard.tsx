/**
 * PremiumBookCard — Shiori v3.0
 *
 * Features:
 * - Lazy cover load with shimmer skeleton
 * - Hover overlay with centered action buttons
 * - Selection checkbox (top-left), appears on hover or when active
 * - Format badge (bottom of cover)
 * - Bottom metadata strip: title + author
 * - Manga variant: slightly different styling
 * - Entrance animation via CSS class
 */

import { useState, useEffect, useRef, memo } from 'react'
import { Heart, Info, Rss } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn, formatRssOrDateTitle } from '@/lib/utils'
import { type Book, type ReadingProgress } from '@/lib/tauri'
import { requestReadingProgress } from '@/lib/readingProgressCache'
import {
  IconBookOpen,
  IconDelete,
  
  IconCheck,
} from '@/components/icons/ShioriIcons'
import { useLibraryStore } from '@/store/libraryStore'
import { useCoverImage } from '../common/hooks/useCoverImage'
import { LibraryContextMenu, type LibraryMenuItem } from '@/components/ui/LibraryContextMenu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, AppTooltip } from '@/components/ui/tooltip'
import { Edit2, Pencil, Trash2, Layers, Globe, FolderPlus, Tag as TagIcon, BookOpen, FileOutput } from 'lucide-react'
import { SeriesAssignmentDialog } from './SeriesAssignmentDialog'
import { ConvertToEpubMenuItem } from '@/components/conversion/ConvertToEpubMenuItem'
import { FallbackBookCover } from './FallbackBookCover'

// ─── Format Badge ─────────────────────────────
const fmtColors: Record<string, string> = {
  EPUB: 'bg-primary text-primary-foreground border-primary shadow-sm',
  PDF: 'bg-destructive text-destructive-foreground border-destructive shadow-sm',
  MOBI: 'bg-secondary text-secondary-foreground border-border shadow-sm',
  AZW3: 'bg-secondary text-secondary-foreground border-border shadow-sm',
  FB2: 'bg-amber-600 text-white border-amber-700 shadow-sm',
  TXT: 'bg-muted text-foreground border-border shadow-sm',
  DOCX: 'bg-blue-600 text-white border-blue-700 shadow-sm',
  HTML: 'bg-purple-600 text-white border-purple-700 shadow-sm',
  MD: 'bg-emerald-600 text-white border-emerald-700 shadow-sm',
  MARKDOWN: 'bg-emerald-600 text-white border-emerald-700 shadow-sm',
  CBZ: 'bg-[var(--manga-accent,#ec4899)] text-white border-pink-700 shadow-sm',
  CBR: 'bg-[var(--manga-accent,#ec4899)] text-white border-pink-700 shadow-sm',
}


const FormatPill = ({
  format,
  filePath,
  bookId,
  onOpen,
}: {
  format?: string
  filePath?: string
  bookId?: number
  onOpen?: () => void
}) => {
  const [progress, setProgress] = useState<ReadingProgress | null>(null);

  // Batch reading-progress lookups through readingProgressCache (one
  // get_reading_progress_batch invoke per frame instead of one IPC per card).
  useEffect(() => {
    if (format?.toLowerCase() === 'online-manga' && bookId) {
      requestReadingProgress(bookId).then((prog) => {
        if (prog) setProgress(prog as ReadingProgress);
      }).catch(() => {});
    }
  }, [format, bookId]);

  if (!format) return null

  if (format.toLowerCase() === 'online-manga') {
    const sourceMatch = filePath?.match(/online-manga:\/\/([^/]+)\//);
    const rawSource = sourceMatch ? sourceMatch[1] : 'Online';
    const displaySource = (rawSource === 'mangadex' || rawSource.toLowerCase() === 'mangafire')
      ? 'MangaFire'
      : rawSource.charAt(0).toUpperCase() + rawSource.slice(1);

    let chapterText = '';
    if (progress && progress.currentLocation) {
        const parts = progress.currentLocation.split('|');
        if (parts.length > 1) {
            chapterText = parts[1];
        }
    }

    return (
      <AppTooltip content={`Open ${displaySource} in Online Manga`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen?.();
          }}
          className="flex items-center gap-1 px-2.5 py-[3px] text-[9.5px] font-bold rounded-full tracking-wide shadow-md bg-[var(--manga-accent,#ec4899)] hover:brightness-110 text-white border border-white/25 opacity-100 transition-all hover:scale-105 active:scale-95 cursor-pointer select-none"
        >
          <Globe size={10} className="opacity-90 shrink-0" />
          <span>{displaySource}</span>
          {chapterText && (
            <>
              <span className="w-[1px] h-3 bg-white/40 mx-0.5"></span>
              <span className="truncate max-w-[80px]">{chapterText}</span>
            </>
          )}
        </button>
      </AppTooltip>
    )
  }

  const fmt = format.toUpperCase()
  const isManga = fmt === 'CBZ' || fmt === 'CBR'
  const cls = fmtColors[fmt] ?? 'bg-secondary text-secondary-foreground border border-border shadow-sm'
  return (
    <span className={cn(
      'px-2 py-[3px] text-[10px] font-extrabold rounded-full tracking-wide shadow-md opacity-100 border select-none',
      isManga && 'ring-2 ring-primary/40',
      cls
    )}>
      {fmt}
    </span>
  )
}

// ─── Hover Overlay Actions ─────────────────────
interface OverlayProps {
  onOpen: () => void
  onViewDetails?: () => void
  onEdit: () => void
  onDelete: () => void
  isManga: boolean
}

const HoverOverlay = ({ onOpen, onViewDetails, onEdit, onDelete, isManga }: OverlayProps) => {
  const ActionTooltip = ({ content, children }: { content: string, children: React.ReactNode }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent sideOffset={8} className="bg-popover/95 text-popover-foreground border border-border/60 backdrop-blur-md shadow-md">
        <p className="text-xs font-semibold">{content}</p>
      </TooltipContent>
    </Tooltip>
  )

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'absolute inset-0 z-20 flex flex-col items-center justify-center gap-3',
          'bg-gradient-to-t from-black/85 via-black/50 to-black/35 backdrop-blur-[3px] dark:from-black/90 dark:via-black/60 dark:to-black/40',
          'opacity-0 group-hover:opacity-100',
          'transition-all duration-250 ease-out',
          'rounded-[inherit]',
          'hidden md:flex'
        )}
      >
        <div className="flex flex-col items-center justify-center gap-2.5 scale-95 group-hover:scale-100 transition-transform duration-250 ease-out">
          {/* Primary Action: Tactile "Read" / "Read Manga" Pill */}
          <ActionTooltip content={isManga ? 'Read manga' : 'Open book'}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpen() }}
              className={cn(
                'group/btn relative flex items-center gap-2 px-5 py-2 rounded-full',
                'bg-gradient-to-b from-primary via-primary to-[color-mix(in_srgb,var(--primary)_82%,black)]',
                'text-primary-foreground font-bold text-xs tracking-wide select-none',
                'border-t border-white/30',
                'shadow-[0_4px_16px_rgba(0,0,0,0.4),0_1px_2px_rgba(0,0,0,0.2)]',
                'hover:shadow-[0_6px_22px_rgba(0,0,0,0.5)] hover:scale-105 hover:brightness-105',
                'active:scale-95 transition-all duration-150 cursor-pointer'
              )}
            >
              <BookOpen size={15} strokeWidth={2.4} className="transition-transform duration-200 group-hover/btn:scale-110" />
              <span>{isManga ? 'Read Manga' : 'Read'}</span>
            </button>
          </ActionTooltip>

          {/* Secondary Actions: Floating Frosted Glass Island / Dock */}
          <div className="flex items-center gap-1 p-1 rounded-full bg-black/40 dark:bg-white/10 backdrop-blur-md border border-white/20 dark:border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.3)] select-none">
            {onViewDetails && (
              <ActionTooltip content="View details">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onViewDetails() }}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white/85 hover:text-white hover:bg-white/20 active:scale-90 transition-all duration-150 cursor-pointer"
                >
                  <Info size={14} strokeWidth={2.2} />
                </button>
              </ActionTooltip>
            )}

            <ActionTooltip content="Edit metadata">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit() }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white/85 hover:text-white hover:bg-white/20 active:scale-90 transition-all duration-150 cursor-pointer"
              >
                <Pencil size={13} strokeWidth={2.2} />
              </button>
            </ActionTooltip>

            <ActionTooltip content="Delete book">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white/85 hover:text-rose-200 hover:bg-rose-500/80 active:scale-90 transition-all duration-150 cursor-pointer"
              >
                <Trash2 size={13} strokeWidth={2.2} />
              </button>
            </ActionTooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

// ─── Shimmer Skeleton ─────────────────────────
const CoverSkeleton = () => (
  <div className="absolute inset-0 shimmer rounded-t-[inherit]" />
)

// ─── Main Card ────────────────────────────────
interface BookCardProps {
  book: Book
  /** Passed from LibraryGrid — avoids a per-card Zustand subscription.
   *  Defaults to 'medium' for dialogs (SeriesView, etc.) that don't need
   *  the dynamic size setting. */
  coverSize?: 'small' | 'medium' | 'large'
  isSelected?: boolean
  onSelect: (id: number) => void
  onOpen: (id: number) => void
  onViewDetails?: (id: number) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  onAddToShelf?: (id: number) => void
  onManageTags?: (id: number) => void
  isFavorited?: boolean
  onFavorite?: (id: number) => void
  animationDelay?: number
  scrollRoot?: HTMLElement | null
  forceVisible?: boolean
}

export const PremiumBookCard = memo(function PremiumBookCard({
  book,
  coverSize = 'medium',
  isSelected: propIsSelected,
  onSelect,
  onOpen,
  onViewDetails,
  onEdit,
  onDelete,
  onAddToShelf,
  onManageTags,
  isFavorited: propIsFavorited,
  onFavorite,
  animationDelay = 0,
  forceVisible = false,
}: BookCardProps) {
  const storeIsSelected = useLibraryStore((s) => s.selectedBookIds.has(book.id!))
  const storeIsFavorited = useLibraryStore((s) => s.favoriteBookIds.has(book.id!))
  const isSelected = propIsSelected ?? storeIsSelected
  const isFavorited = propIsFavorited ?? storeIsFavorited
  
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(forceVisible)
  const [assignOpen, setAssignOpen] = useState(false)
  const [convertBookId, setConvertBookId] = useState<number | null>(null)

  // Cover is only requested once the card is visible in the viewport.
  // The coverCache batcher groups all cards visible in the same render
  // cycle into a single batch IPC call.
  const { coverUrl, loading: coverLoading } = useCoverImage(visible ? book.id : undefined, book.cover_path)

  const isManga = book.file_format === 'cbz' || book.file_format === 'cbr'
  const isRss = book.tags?.some((t: any) => t.name === 'RSS') ?? false;

  // Reveal is driven by the grid's single IntersectionObserver — no per-card
  // observers (hundreds of native observers = JS↔native churn on Android
  // WebView). The grid dispatches a batched `shiori:reveal-cover` event for
  // every wrapper that enters the viewport; this card reveals on match.
  useEffect(() => {
    if (forceVisible) return;
    const onReveal = (e: Event) => {
      const ids = (e as CustomEvent<{ ids: string[] }>).detail?.ids;
      if (ids?.includes(String(book.id))) {
        setVisible(true);
        window.removeEventListener('shiori:reveal-cover', onReveal);
      }
    };
    window.addEventListener('shiori:reveal-cover', onReveal);
    return () => window.removeEventListener('shiori:reveal-cover', onReveal);
  }, [forceVisible, book.id])

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      onSelect(book.id!)
    } else {
      onOpen(book.id!)
    }
  }

  const authorStr = book.authors?.map((a) => a.name).join(', ') || 'Unknown Author'
  const parsedTitle = formatRssOrDateTitle(book.title);
  const hue = (book.id || 0) * 137.508 % 360;
  const coverColor = `hsl(${hue}, 40%, 30%)`;

  const menuItems: LibraryMenuItem[] = [
    { label: 'Open', icon: BookOpen, onClick: () => onOpen(book.id!) },
    ...(onViewDetails ? [{ label: 'View Details', icon: Info, onClick: () => onViewDetails(book.id!) }] : []),
    ...(book.file_format && !['epub', 'online-manga', 'cbz', 'cbr'].includes(book.file_format.toLowerCase())
      ? [{ label: 'Convert to EPUB', icon: FileOutput, onClick: () => setConvertBookId(book.id!) }]
      : []),
    { label: 'Edit Metadata', icon: Pencil, onClick: () => onEdit(book.id!) },
    ...(onAddToShelf ? [{ label: 'Add to Shelf...', icon: FolderPlus, onClick: () => onAddToShelf(book.id!) }] : []),
    ...(isManga ? [
      { isSeparator: true as const },
      { label: 'Assign to Series...', icon: Layers, onClick: () => setAssignOpen(true) }
    ] : []),
    { isSeparator: true as const },
    { label: 'Delete', icon: Trash2, onClick: () => onDelete(book.id!), destructive: true },
  ];

  return (
        <>
      <LibraryContextMenu items={menuItems}>
          <motion.div
            ref={cardRef}
      data-cover-size={coverSize}
      onClick={handleClick}
      style={{ 
        animationDelay: `${animationDelay}ms`
      }}
      className={cn(
        'group relative flex flex-col rounded-xl max-md:rounded-ui-xl overflow-hidden',
        'bg-card border border-border/40',
        'cursor-pointer select-none',
        'transition-transform duration-300 ease-out',
        !visible && 'opacity-0 scale-[0.96] translate-y-2',
        visible && 'animate-card-in',
        isSelected
          ? 'ring-2 ring-primary border-primary shadow-[0_8px_30px_rgba(var(--primary),0.4)]'
          : 'shadow-lg dark:shadow-[0_8px_20px_rgba(0,0,0,0.8)] ring-1 ring-black/10 dark:ring-white/10 hover:shadow-2xl hover:shadow-primary/20 dark:hover:shadow-primary/10 hover:-translate-y-1.5 hover:ring-black/20 dark:hover:ring-white/20',
        isManga && !isSelected && 'ring-[color-mix(in_srgb,var(--manga-accent,#ec4899)_40%,transparent)] hover:ring-[color-mix(in_srgb,var(--manga-accent,#ec4899)_80%,transparent)]',
      )}
    >
      <div className="relative aspect-[2/3] bg-muted overflow-hidden rounded-[inherit]">
        {/* Skeleton */}
        {Boolean(book.cover_path) && (coverLoading || !imgLoaded) && !imgError && <CoverSkeleton />}

        {/* Cover image */}
        {coverUrl && !imgError && (
          <>
            <img
              src={coverUrl}
              alt={book.title}
              loading="lazy"
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              className={cn(
                'absolute inset-0 w-full h-full object-cover bg-muted',
                'transition-all duration-500 ease-out group-hover:scale-105',
                imgLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.02]',
              )}
            />
            {/* Premium Inner Sheen / Glare */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/30 pointer-events-none mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] pointer-events-none z-20" />
          </>
        )}

        {/* Fallback (no cover) */}
        {(!book.cover_path || ((!coverUrl || imgError) && imgLoaded === false && !coverLoading)) && (
          <FallbackBookCover
            title={parsedTitle.mainTitle}
            author={authorStr}
            format={book.file_format}
            isRss={isRss}
            dateSubtitle={parsedTitle.dateSubtitle}
            coverSize={coverSize}
          />
        )}

        {/* Hover action overlay */}
        <HoverOverlay
          onOpen={() => onOpen(book.id!)}
          onViewDetails={onViewDetails ? () => onViewDetails(book.id!) : undefined}
          onEdit={() => onEdit(book.id!)}
          onDelete={() => onDelete(book.id!)}
          isManga={isManga}
        />

        {/* Top-Left: Selection Checkbox & Format Pill */}
        <div className="absolute top-2.5 left-2.5 z-30 flex items-center gap-1.5 pointer-events-auto">
          {/* Animated Selection Checkbox */}
          <div
            className={cn(
              'transition-all duration-200 ease-out overflow-hidden flex items-center justify-center',
              isSelected
                ? 'w-5 opacity-100 scale-100'
                : 'w-0 opacity-0 scale-75 group-hover:w-5 group-hover:opacity-100 group-hover:scale-100'
            )}
          >
            <AppTooltip content={isSelected ? 'Deselect' : 'Select'} side="top">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(book.id!) }}
                aria-label={isSelected ? 'Deselect' : 'Select'}
                className={cn(
                  'w-5 h-5 rounded-md flex items-center justify-center shrink-0 cursor-pointer',
                  'border transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected
                    ? 'bg-primary border-primary shadow-sm text-primary-foreground'
                    : 'bg-black/50 hover:bg-black/70 border-white/40 text-white backdrop-blur-sm shadow-xs',
                )}
              >
                {isSelected && <IconCheck size={11} className="text-primary-foreground" />}
              </button>
            </AppTooltip>
          </div>

          <FormatPill format={book.file_format} filePath={book.file_path} bookId={book.id} onOpen={() => onOpen(book.id!)} />

          {isRss && (coverUrl && !imgError) && (
            <span className="flex items-center gap-1 px-2 py-[3px] text-[10px] font-bold rounded-full tracking-wide shadow-md bg-orange-500 text-white border border-white/20 select-none">
              <Rss size={10} />
              RSS
            </span>
          )}
        </div>

        {/* Favorite toggle */}
        <AppTooltip content={isFavorited ? 'Remove from favorites' : 'Add to favorites'} side="top">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFavorite?.(book.id!) }}
            aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            className={cn(
              'absolute top-2.5 right-2.5 z-30',
              'w-6 h-6 rounded-full flex items-center justify-center cursor-pointer',
              'transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isFavorited
                ? 'text-rose-500 fill-current bg-rose-500/20 border border-rose-500/30 shadow-xs opacity-100 scale-100 hover:scale-110 active:scale-95'
                : 'text-white/80 bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/20 opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:scale-110 active:scale-95',
            )}
          >
            <Heart size={12} fill={isFavorited ? 'currentColor' : 'none'} strokeWidth={2.4} />
          </button>
        </AppTooltip>

        {/* ── Info Strip (Tachiyomi Style) ── */}
        {(coverUrl && !imgError) && (
          <div className={cn(
            'absolute bottom-0 left-0 right-0 z-10',
            'flex flex-col justify-end',
            'bg-gradient-to-t from-black/85 via-black/40 to-transparent',
            'rounded-b-[inherit]',
            coverSize === 'small' && 'px-2 pt-4 pb-1.5',
            coverSize === 'medium' && 'px-2.5 pt-5 pb-2',
            coverSize === 'large' && 'px-3 pt-6 pb-2.5',
          )}>
            <AppTooltip content={parsedTitle.fullFormattedTitle} side="top" className="max-w-xs text-center">
              <h3
                className={cn(
                  'font-bold leading-snug text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]',
                  book.file_format === 'online-manga' ? 'line-clamp-1 text-[12px]' : 'line-clamp-2',
                  book.file_format !== 'online-manga' && coverSize === 'small' && 'text-[11px]',
                  book.file_format !== 'online-manga' && coverSize === 'medium' && 'text-xs sm:text-sm',
                  book.file_format !== 'online-manga' && coverSize === 'large' && 'text-sm sm:text-base',
                )}
              >
                {parsedTitle.fullFormattedTitle}
              </h3>
            </AppTooltip>
            {authorStr && authorStr !== 'Unknown Author' && (
              <AppTooltip content={authorStr} side="top" className="max-w-xs text-center">
                <p
                  className={cn(
                    'truncate text-white/80 font-medium mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]',
                    coverSize === 'small' && 'text-[10px]',
                    coverSize === 'medium' && 'text-[11px]',
                    coverSize === 'large' && 'text-xs',
                  )}
                >
                  {authorStr}
                </p>
              </AppTooltip>
            )}
          </div>
        )}
      </div>
          </motion.div>
      </LibraryContextMenu>

      {isManga && (
        <SeriesAssignmentDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          bookId={book.id!}
          bookTitle={book.title}
        />
      )}

      {convertBookId !== null && (
        <ConvertToEpubMenuItem
          bookId={convertBookId}
          bookTitle={book.title}
          format={book.file_format}
          variant="overlay"
          onDone={() => setConvertBookId(null)}
        />
      )}
    </>
  )
})

// ─── Keep old export name for backward compat ─
export { PremiumBookCard as ModernBookCard }
