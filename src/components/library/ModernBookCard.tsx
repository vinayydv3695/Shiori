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

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { Book } from '@/lib/tauri'
import {
  IconBookOpen,
  IconEditMeta,
  IconDelete,
  IconConvert,
  IconShare,
  IconCheck,
} from '@/components/icons/ShioriIcons'
import { useCoverImage } from '../common/hooks/useCoverImage'

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
  const cls = fmtColors[fmt] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={cn('px-1.5 py-0.5 text-[9px] font-bold rounded tracking-wide', cls)}>
      {fmt}
    </span>
  )
}

// ─── Hover Overlay Actions ─────────────────────
interface OverlayProps {
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onConvert?: () => void
  onShare?: () => void
  isManga: boolean
}

const HoverOverlay = ({ onOpen, onEdit, onDelete, onConvert, onShare, isManga }: OverlayProps) => {
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
        <button onClick={(e) => { e.stopPropagation(); onEdit() }} className={btnCls} title="Edit metadata">
          <IconEditMeta size={14} />
        </button>
        {onConvert && (
          <button onClick={(e) => { e.stopPropagation(); onConvert() }} className={btnCls} title="Convert format">
            <IconConvert size={14} />
          </button>
        )}
        {onShare && (
          <button onClick={(e) => { e.stopPropagation(); onShare() }} className={btnCls} title="Share">
            <IconShare size={14} />
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
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  onDownload: (id: number) => void
  onConvert?: (id: number) => void
  onShare?: (id: number) => void
  animationDelay?: number
}

export function PremiumBookCard({
  book,
  isSelected,
  onSelect,
  onOpen,
  onEdit,
  onDelete,
  onDownload,
  onConvert,
  onShare,
  animationDelay = 0,
}: BookCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  const { coverUrl, loading: coverLoading } = useCoverImage(book.id, null)

  const isManga = book.file_format === 'cbz' || book.file_format === 'cbr'

  // Intersection Observer for entrance animation
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.05 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      onSelect(book.id!)
    } else {
      onOpen(book.id!)
    }
  }

  const authorStr = book.authors?.map((a) => a.name).join(', ') || 'Unknown Author'

  return (
    <div
      ref={cardRef}
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
              'absolute inset-0 w-full h-full object-cover',
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
          onEdit={() => onEdit(book.id!)}
          onDelete={() => onDelete(book.id!)}
          onConvert={onConvert ? () => onConvert(book.id!) : undefined}
          onShare={onShare ? () => onShare(book.id!) : undefined}
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

        {/* Format badge */}
        <div className="absolute bottom-1.5 left-1.5 z-10">
          <FormatPill format={book.file_format} />
        </div>
      </div>

      {/* ── Info Strip ── */}
      <div className="flex flex-col px-2 pt-2 pb-2.5 gap-0.5">
        <h3
          className="text-[11px] font-semibold leading-tight line-clamp-2 text-foreground"
          title={book.title}
        >
          {book.title}
        </h3>
        <p className="text-[10px] text-muted-foreground truncate" title={authorStr}>
          {authorStr}
        </p>
      </div>
    </div>
  )
}

// ─── Keep old export name for backward compat ─
export { PremiumBookCard as ModernBookCard }
