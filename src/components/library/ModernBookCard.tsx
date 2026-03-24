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
import { cn } from '@/lib/utils'
import type { Book } from '@/lib/tauri'
import {
  IconBookOpen,
  IconEditMeta,
  IconDelete,
  IconConvert,
  IconCheck,
} from '@/components/icons/ShioriIcons'
import { useCoverImage } from '../common/hooks/useCoverImage'
import { usePreferencesStore } from '@/store/preferencesStore'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { Edit2, Trash2, Layers } from 'lucide-react'
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

const FormatPill = ({ format }: { format?: string }) => {
  if (!format) return null
  const fmt = format.toUpperCase()
  const isManga = fmt === 'CBZ' || fmt === 'CBR'
  const cls = fmtColors[fmt] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={cn(
      'px-2 py-1 text-[11px] font-bold rounded tracking-wide shadow-md',
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
  onConvert?: () => void
  isManga: boolean
}

const HoverOverlay = ({ onOpen, onViewDetails, onEdit, onDelete, onConvert, isManga }: OverlayProps) => {
  const btnCls = cn(
    'flex items-center justify-center w-8 h-8 rounded-lg',
    'bg-background/90 backdrop-blur-sm',
    'border border-border/60',
    'text-foreground/80 hover:text-foreground hover:bg-background',
    'transition-all duration-[100ms]',
    'shadow-sm',
  )

  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center gap-1.5',
        'bg-black/50 backdrop-blur-[2px]',
        'opacity-0 group-hover:opacity-100',
        'transition-opacity duration-[150ms]',
        'rounded-t-[inherit]',
      )}
    >
      <button onClick={(e) => { e.stopPropagation(); onOpen() }} className={btnCls} title={isManga ? 'Read manga' : 'Open book'}>
        <IconBookOpen size={15} />
      </button>
      <div className="flex items-center gap-1.5">
        {onViewDetails && (
          <button onClick={(e) => { e.stopPropagation(); onViewDetails() }} className={btnCls} title="View details">
            <Info className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onEdit() }} className={btnCls} title="Edit metadata">
          <IconEditMeta size={14} />
        </button>
        {onConvert && (
          <button onClick={(e) => { e.stopPropagation(); onConvert() }} className={btnCls} title="Convert format">
            <IconConvert size={14} />
          </button>
        )}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete() }} className={cn(btnCls, 'text-destructive hover:text-destructive-foreground hover:bg-destructive hover:border-transparent')} title="Delete">
        <IconDelete size={14} />
      </button>
    </div>
  )
}

// ─── Shimmer Skeleton ─────────────────────────
const CoverSkeleton = () => (
  <div className="absolute inset-0 shimmer rounded-t-[inherit]" />
)

// ─── Main Card ────────────────────────────────
interface BookCardProps {
  book: Book
  isSelected: boolean
  onSelect: (id: number) => void
  onOpen: (id: number) => void
  onViewDetails?: (id: number) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  onConvert?: (id: number) => void
  isFavorited?: boolean
  onFavorite?: (id: number) => void
  animationDelay?: number
  scrollRoot?: HTMLElement | null
}

export const PremiumBookCard = memo(function PremiumBookCard({
  book,
  isSelected,
  onSelect,
  onOpen,
  onViewDetails,
  onEdit,
  onDelete,
  onConvert,
  isFavorited,
  onFavorite,
  animationDelay = 0,
  scrollRoot,
}: BookCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)

  const coverSize = usePreferencesStore((s) => s.preferences?.coverSize ?? 'medium')

  const { coverUrl, loading: coverLoading } = useCoverImage(visible ? book.id : undefined, null)

  const isManga = book.file_format === 'cbz' || book.file_format === 'cbr'

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { root: scrollRoot ?? null, threshold: 0.05 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollRoot])

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
          <div
            ref={cardRef}
      data-cover-size={coverSize}
      onClick={handleClick}
      style={{ animationDelay: `${animationDelay}ms` }}
      className={cn(
        'group relative flex flex-col rounded-md overflow-hidden',
        'bg-card border border-border',
        'cursor-pointer select-none',
        'transition-all duration-[150ms]',
        !visible && 'opacity-0',
        visible && 'animate-card-in',
        isSelected
          ? 'ring-2 ring-primary border-primary shadow-md'
          : 'hover:border-border/80 hover:shadow-md hover:-translate-y-px',
        isManga && 'border-[var(--manga-accent)]/20',
      )}
    >
      {/* ── Cover Area (2:3 ratio) ── */}
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
          onConvert={onConvert ? () => onConvert(book.id!) : undefined}
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
        <div className="absolute bottom-1.5 left-1.5 z-10">
          <FormatPill format={book.file_format} />
        </div>
      </div>

      {/* ── Info Strip ── */}
      <div className={cn(
        'flex flex-col gap-0.5',
        coverSize === 'small' && 'px-1.5 pt-1.5 pb-2',
        coverSize === 'medium' && 'px-2 pt-2 pb-2.5',
        coverSize === 'large' && 'px-2.5 pt-2.5 pb-3',
      )}>
        <h3
          className={cn(
            'font-semibold leading-tight text-foreground',
            coverSize === 'small' && 'text-[10px] line-clamp-1',
            coverSize === 'medium' && 'text-[11px] line-clamp-2',
            coverSize === 'large' && 'text-xs line-clamp-3',
          )}
          title={book.title}
        >
          {book.title}
        </h3>
        <p
          className={cn(
            'text-muted-foreground',
            coverSize === 'small' && 'text-[9px] truncate',
            coverSize === 'medium' && 'text-[10px] truncate',
            coverSize === 'large' && 'text-[11px] line-clamp-2',
          )}
          title={authorStr}
        >
          {authorStr}
        </p>
      </div>
          </div>
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
