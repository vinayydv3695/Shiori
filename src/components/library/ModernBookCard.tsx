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
import { cn } from '@/lib/utils'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Edit2, Pencil, Trash2, Layers, Globe, FolderPlus, Tag as TagIcon, BookOpen, FileOutput } from 'lucide-react'
import { SeriesAssignmentDialog } from './SeriesAssignmentDialog'
import { ConvertToEpubMenuItem } from '@/components/conversion/ConvertToEpubMenuItem'

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
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen?.();
        }}
        className="flex items-center gap-1 px-2.5 py-[3px] text-[9.5px] font-bold rounded-full tracking-wide shadow-md bg-[var(--manga-accent,#ec4899)] hover:brightness-110 text-white border border-white/25 opacity-100 transition-all hover:scale-105 active:scale-95 cursor-pointer select-none"
        title={`Open ${displaySource} in Online Manga`}
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
  const btnCls = cn(
    'flex items-center justify-center w-8 h-8 rounded-full',
    'bg-secondary/90 text-foreground hover:bg-secondary hover:scale-110',
    'transition-all duration-200 backdrop-blur-md',
    'border border-border/50',
    'shadow-sm'
  )

  const ActionTooltip = ({ content, children }: { content: string, children: React.ReactNode }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent sideOffset={8} className="bg-popover text-popover-foreground border border-border/50 backdrop-blur-md">
        <p className="text-xs font-medium">{content}</p>
      </TooltipContent>
    </Tooltip>
  )

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          'absolute inset-0 flex flex-col items-center justify-center gap-3',
          'bg-card-overlay/60 backdrop-blur-[2px]',
          'opacity-0 group-hover:opacity-100',
          'transition-all duration-300 ease-out',
          'rounded-[inherit]',
          'hidden md:flex'
        )}
      >
        <ActionTooltip content={isManga ? 'Read manga' : 'Open book'}>
          <button 
            onClick={(e) => { e.stopPropagation(); onOpen() }} 
            className={cn(btnCls, 'w-12 h-12 bg-primary text-primary-foreground hover:bg-primary/90 border-primary/30 shadow-lg')}
          >
            <IconBookOpen size={22} className="opacity-90" />
          </button>
        </ActionTooltip>

        <div className="flex items-center gap-2">
          {onViewDetails && (
            <ActionTooltip content="View details">
              <button onClick={(e) => { e.stopPropagation(); onViewDetails() }} className={btnCls}>
                <Info className="w-4 h-4 opacity-80" />
              </button>
            </ActionTooltip>
          )}
          
          <ActionTooltip content="Edit metadata">
            <button onClick={(e) => { e.stopPropagation(); onEdit() }} className={btnCls}>
              <Pencil size={15} className="opacity-80" />
            </button>
          </ActionTooltip>
          

          
          <ActionTooltip content="Delete book">
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete() }} 
              className={cn(btnCls, 'hover:bg-red-500/80 hover:border-red-500/50 hover:text-white')}
            >
              <IconDelete size={15} className="opacity-80" />
            </button>
          </ActionTooltip>
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
  scrollRoot,
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

  useEffect(() => {
    if (forceVisible) return;
    const el = cardRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { root: scrollRoot ?? null, threshold: 0.05 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollRoot, forceVisible])

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      onSelect(book.id!)
    } else {
      onOpen(book.id!)
    }
  }

  const authorStr = book.authors?.map((a) => a.name).join(', ') || 'Unknown Author'
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
        'bg-card/90 backdrop-blur-lg border border-border/40',
        'cursor-pointer select-none',
        'transition-all duration-[400ms] cubic-bezier(0.25, 1, 0.5, 1)',
        !visible && 'opacity-0 scale-95',
        visible && 'animate-card-in',
        isSelected
          ? 'ring-2 ring-primary border-primary shadow-[0_8px_30px_rgba(var(--primary),0.4)]'
          : 'shadow-lg dark:shadow-[0_8px_20px_rgba(0,0,0,0.8)] ring-1 ring-black/10 dark:ring-white/10 hover:shadow-2xl hover:shadow-primary/20 dark:hover:shadow-primary/10 hover:-translate-y-1.5 hover:ring-black/20 dark:hover:ring-white/20',
        isManga && !isSelected && 'ring-[var(--manga-accent)]/40 hover:ring-[var(--manga-accent)]/80',
      )}
    >
      <div className="relative aspect-[2/3] bg-muted overflow-hidden rounded-[inherit]">
        {/* Skeleton */}
        {(coverLoading || !imgLoaded) && !imgError && <CoverSkeleton />}

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
                imgLoaded ? 'opacity-100' : 'opacity-0',
              )}
            />
            {/* Premium Inner Sheen / Glare */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/30 pointer-events-none mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] pointer-events-none z-20" />
          </>
        )}

        {/* Fallback (no cover) */}
        {(!coverUrl || imgError) && imgLoaded === false && !coverLoading && (
          <div 
            className="absolute inset-0 z-0 p-3 pt-9 flex flex-col justify-between"
            style={{
              background: `linear-gradient(135deg, ${coverColor} 0%, hsl(${hue}, 50%, 20%) 100%)`,
            }}
          >
            <div className={cn("font-serif text-white font-medium leading-tight line-clamp-4 drop-shadow-md text-left",
              coverSize === 'small' ? 'text-xs' : coverSize === 'medium' ? 'text-sm' : 'text-base'
            )}>
              {book.title}
            </div>
            <div className={cn("mt-auto text-white/80 font-medium truncate text-left w-full",
              coverSize === 'small' ? 'text-[10px]' : 'text-xs'
            )}>
              {authorStr}
            </div>
          </div>
        )}

        {/* Hover action overlay */}
        <HoverOverlay
          onOpen={() => onOpen(book.id!)}
          onViewDetails={onViewDetails ? () => onViewDetails(book.id!) : undefined}
          onEdit={() => onEdit(book.id!)}
          onDelete={() => onDelete(book.id!)}
          isManga={isManga}
        />

        {/* Selection checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(book.id!) }}
          aria-label={isSelected ? 'Deselect' : 'Select'}
          title={isSelected ? 'Deselect' : 'Select'}
          className={cn(
            'absolute top-2.5 left-2.5 z-10',
            'w-5 h-5 rounded flex items-center justify-center',
            'border transition-all duration-[100ms]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isSelected
              ? 'bg-primary border-primary shadow-sm opacity-100'
              : 'bg-background/80 backdrop-blur-sm border-border/70 opacity-0 group-hover:opacity-100',
          )}
        >
          {isSelected && <IconCheck size={11} className="text-primary-foreground" />}
        </button>

        {/* Favorite toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onFavorite?.(book.id!) }}
          aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          className={cn(
            'absolute top-2.5 right-2.5 z-10',
            'w-5 h-5 rounded flex items-center justify-center',
            'transition-all duration-[100ms]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isFavorited
              ? 'text-red-500 opacity-100'
              : 'text-white/70 opacity-0 group-hover:opacity-100 hover:text-red-400',
          )}
        >
          <Heart size={13} fill={isFavorited ? 'currentColor' : 'none'} />
        </button>

        {/* Format badge */}
        <div className="absolute top-2.5 left-2.5 z-10 flex flex-col gap-1.5">
          <FormatPill format={book.file_format} filePath={book.file_path} bookId={book.id} onOpen={() => onOpen(book.id!)} />
          {isRss && (
            <span className="flex items-center gap-1 px-2 py-[3px] text-[10px] font-bold rounded-full tracking-wide shadow-md backdrop-blur-md bg-orange-500/90 text-white border border-white/20">
              <Rss size={10} />
              RSS
            </span>
          )}
        </div>

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
            <h3
              className={cn(
                'font-bold leading-snug text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]',
                book.file_format === 'online-manga' ? 'line-clamp-1 text-[12px]' : 'line-clamp-2',
                book.file_format !== 'online-manga' && coverSize === 'small' && 'text-[11px]',
                book.file_format !== 'online-manga' && coverSize === 'medium' && 'text-xs sm:text-sm',
                book.file_format !== 'online-manga' && coverSize === 'large' && 'text-sm sm:text-base',
              )}
              title={book.title}
            >
              {book.title}
            </h3>
            {authorStr && authorStr !== 'Unknown Author' && (
              <p
                className={cn(
                  'truncate text-white/80 font-medium mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]',
                  coverSize === 'small' && 'text-[10px]',
                  coverSize === 'medium' && 'text-[11px]',
                  coverSize === 'large' && 'text-xs',
                )}
                title={authorStr}
              >
                {authorStr}
              </p>
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
