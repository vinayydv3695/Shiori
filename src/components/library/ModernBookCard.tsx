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
import { Heart, Info } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { api, type Book, type ReadingProgress } from '@/lib/tauri'
import {
  IconBookOpen,
  IconEditMeta,
  IconDelete,
  
  IconCheck,
} from '@/components/icons/ShioriIcons'
import { useLibraryStore } from '@/store/libraryStore'
import { useCoverImage } from '../common/hooks/useCoverImage'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Edit2, Trash2, Layers, Globe } from 'lucide-react'
import { SeriesAssignmentDialog } from './SeriesAssignmentDialog'

// ─── Format Badge ─────────────────────────────
const fmtColors: Record<string, string> = {
  EPUB: 'bg-neutral-800 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900',
  PDF: 'bg-red-900/80 text-red-100',
  MOBI: 'bg-neutral-700 text-neutral-200',
  AZW3: 'bg-neutral-600 text-neutral-100',
  FB2: 'bg-neutral-500 text-neutral-100',
  TXT: 'bg-neutral-400 text-neutral-900',
  DOCX: 'bg-neutral-300 text-neutral-900',
  HTML: 'bg-neutral-200 text-neutral-900',
  CBZ: 'bg-[var(--manga-accent)] text-white',
  CBR: 'bg-[var(--manga-accent)] text-white',
}


const FormatPill = ({ format, filePath, bookId }: { format?: string, filePath?: string, bookId?: number }) => {
  const [progress, setProgress] = useState<ReadingProgress | null>(null);

  useEffect(() => {
    if (format?.toLowerCase() === 'online-manga' && bookId) {
      api.getReadingProgress(bookId).then((prog: any) => {
        if (prog) setProgress(prog as ReadingProgress);
      }).catch(() => {});
    }
  }, [format, bookId]);

  if (!format) return null

  if (format.toLowerCase() === 'online-manga') {
    const sourceMatch = filePath?.match(/online-manga:\/\/([^/]+)\//);
    const source = sourceMatch ? sourceMatch[1] : 'Online';
    const displaySource = source === 'mangadex' ? 'MangaDex' : source.charAt(0).toUpperCase() + source.slice(1);

    let chapterText = '';
    if (progress && progress.currentLocation) {
        const parts = progress.currentLocation.split('|');
        if (parts.length > 1) {
            chapterText = parts[1];
        }
    }

    return (
      <span className="flex items-center gap-1 px-2 py-[3px] text-[9px] font-bold rounded-full tracking-wide shadow-md backdrop-blur-md bg-[var(--manga-accent)] text-white border border-white/20">
        <Globe size={10} className="opacity-80" />
        {displaySource}
        {chapterText && (
          <>
            <span className="w-[1px] h-3 bg-white/30 mx-0.5"></span>
            <span className="truncate max-w-[80px]">{chapterText}</span>
          </>
        )}
      </span>
    )
  }

  const fmt = format.toUpperCase()
  const isManga = fmt === 'CBZ' || fmt === 'CBR'
  const cls = fmtColors[fmt] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={cn(
      'px-2 py-[3px] text-[10px] font-bold rounded-full tracking-wide shadow-md backdrop-blur-md',
      isManga && 'ring-2 ring-white/30',
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
    'bg-white/10 text-white hover:bg-white/30 hover:scale-110',
    'transition-all duration-200 backdrop-blur-md',
    'border border-white/20',
    'shadow-sm'
  )

  const ActionTooltip = ({ content, children }: { content: string, children: React.ReactNode }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent sideOffset={8} className="bg-black/90 text-white border-white/10 backdrop-blur-md">
        <p className="text-xs font-medium">{content}</p>
      </TooltipContent>
    </Tooltip>
  )

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          'absolute inset-0 flex flex-col items-center justify-center gap-3',
          'bg-black/60 backdrop-blur-[2px]',
          'opacity-0 group-hover:opacity-100',
          'transition-all duration-300 ease-out',
          'rounded-t-[inherit]',
        )}
      >
        <ActionTooltip content={isManga ? 'Read manga' : 'Open book'}>
          <button 
            onClick={(e) => { e.stopPropagation(); onOpen() }} 
            className={cn(btnCls, 'w-12 h-12 bg-white/20 hover:bg-white/40 border-white/30 shadow-lg')}
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
              <IconEditMeta size={15} className="opacity-80" />
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

  // Cover is only requested once the card is visible in the viewport.
  // The coverCache batcher groups all cards visible in the same render
  // cycle into a single batch IPC call.
  const { coverUrl, loading: coverLoading } = useCoverImage(visible ? book.id : undefined, book.cover_path)

  const isManga = book.file_format === 'cbz' || book.file_format === 'cbr'

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

  return (
        <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
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
        'transition-all duration-[250ms] cubic-bezier(0.25, 0.8, 0.25, 1)',
        !visible && 'opacity-0 scale-95',
        visible && 'animate-card-in',
        isSelected
          ? 'ring-2 ring-primary border-primary shadow-[0_8px_20px_rgba(0,0,0,0.15)]'
          : 'hover:border-primary/50 hover:shadow-[0_12px_24px_rgba(0,0,0,0.15)] hover:-translate-y-1',
        isManga && 'border-[var(--manga-accent)]/30 hover:border-[var(--manga-accent)]/60',
      )}
    >
      <div className="relative aspect-[2/3] bg-muted overflow-hidden">
        {/* Skeleton */}
        {(coverLoading || !imgLoaded) && !imgError && <CoverSkeleton />}

        {/* Cover image */}
        {coverUrl && !imgError && (
          <img
            src={coverUrl}
            alt={book.title}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            className={cn(
              'absolute inset-0 w-full h-full object-cover bg-muted',
              'transition-opacity duration-300',
              imgLoaded ? 'opacity-100' : 'opacity-0',
            )}
          />
        )}

        {/* Fallback (no cover) */}
        {(!coverUrl || imgError) && imgLoaded === false && !coverLoading && (
          <div
            className={cn(
              'absolute inset-0 flex flex-col items-center justify-center gap-2',
              'bg-gradient-to-br from-muted to-muted/60',
            )}
          >
            <IconBookOpen size={32} className="text-muted-foreground/25" />
            <p className="text-[9px] text-muted-foreground/40 text-center px-2 line-clamp-2 font-medium">
              {book.title}
            </p>
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
            'absolute top-1.5 left-1.5 z-10',
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
            'absolute top-1.5 right-1.5 z-10',
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
        <div className="absolute top-1.5 left-1.5 z-10">
          <FormatPill format={book.file_format} filePath={book.file_path} />
        </div>

        {/* ── Info Strip (Tachiyomi Style) ── */}
        <div className={cn(
          'absolute bottom-0 left-0 right-0 z-10',
          'flex flex-col justify-end',
          'bg-gradient-to-t from-black/90 via-black/40 to-transparent text-white',
          coverSize === 'small' && 'px-1.5 pt-6 pb-1.5',
          coverSize === 'medium' && 'px-2 pt-8 pb-2',
          coverSize === 'large' && 'px-2.5 pt-10 pb-2.5',
        )}>
          <h3
            className={cn(
              'font-bold leading-tight drop-shadow-md text-white/95',
              book.file_format === 'online-manga' ? 'line-clamp-1 text-[13px]' : 'line-clamp-2',
              book.file_format !== 'online-manga' && coverSize === 'small' && 'text-xs',
              book.file_format !== 'online-manga' && coverSize === 'medium' && 'text-sm',
              book.file_format !== 'online-manga' && coverSize === 'large' && 'text-base',
            )}
            title={book.title}
          >
            {book.title}
          </h3>
          {authorStr && authorStr !== 'Unknown Author' && (
            <p
              className={cn(
                'truncate drop-shadow-md text-white/70 font-medium mt-0.5',
                coverSize === 'small' && 'text-[11px]',
                coverSize === 'medium' && 'text-xs',
                coverSize === 'large' && 'text-sm',
              )}
              title={authorStr}
            >
              {authorStr}
            </p>
          )}
        </div>
      </div>
          </motion.div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[160px] bg-background border border-border rounded-md shadow-md p-1 z-50 text-sm">
            <ContextMenu.Item 
              className="flex items-center px-2 py-1.5 rounded cursor-pointer hover:bg-muted outline-none"
              onClick={() => onOpen(book.id!)}
            >
              <IconBookOpen className="w-4 h-4 mr-2" />
              Open
            </ContextMenu.Item>
            
            {onViewDetails && (
              <ContextMenu.Item 
                className="flex items-center px-2 py-1.5 rounded cursor-pointer hover:bg-muted outline-none"
                onClick={() => onViewDetails(book.id!)}
              >
                <Info className="w-4 h-4 mr-2" />
                View Details
              </ContextMenu.Item>
            )}

            <ContextMenu.Item 
              className="flex items-center px-2 py-1.5 rounded cursor-pointer hover:bg-muted outline-none"
              onClick={() => onEdit(book.id!)}
            >
              <Edit2 className="w-4 h-4 mr-2" />
              Edit Metadata
            </ContextMenu.Item>

            {isManga && (
              <>
                <ContextMenu.Separator className="h-px bg-border my-1" />
                <ContextMenu.Item 
                  className="flex items-center px-2 py-1.5 rounded cursor-pointer hover:bg-muted outline-none"
                  onClick={() => setAssignOpen(true)}
                >
                  <Layers className="w-4 h-4 mr-2" />
                  Assign to Series...
                </ContextMenu.Item>
              </>
            )}

            <ContextMenu.Separator className="h-px bg-border my-1" />
            <ContextMenu.Item 
              className="flex items-center px-2 py-1.5 rounded cursor-pointer hover:bg-destructive/10 text-destructive outline-none"
              onClick={() => onDelete(book.id!)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {isManga && (
        <SeriesAssignmentDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          bookId={book.id!}
          bookTitle={book.title}
        />
      )}
    </>
  )
})

// ─── Keep old export name for backward compat ─
export { PremiumBookCard as ModernBookCard }
