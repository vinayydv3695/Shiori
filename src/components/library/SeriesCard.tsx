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

import { useState, useEffect, useRef, memo } from 'react'
import { Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCoverImage } from '../common/hooks/useCoverImage'
import type { SeriesCardProps } from './types'
import { IconBookOpen } from '@/components/icons/ShioriIcons'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { Edit2, SplitSquareHorizontal, Trash2 } from 'lucide-react'
import { SeriesManagementDialog } from './SeriesManagementDialog'
import { api } from '@/lib/tauri'
import { useToast } from '@/store/toastStore'
import { FeatureHint } from '@/components/ui/FeatureHint'

// ─── Shimmer Skeleton ─────────────────────────
const CoverSkeleton = () => (
  <div className="absolute inset-0 shimmer rounded-t-[inherit]" />
)

// ─── Main Card ────────────────────────────────
export const SeriesCard = memo(function SeriesCard({
  series,
  isSelected,
  onSelect,
  onOpen,
  animationDelay = 0,
  scrollRoot,
}: SeriesCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  const [managementOpen, setManagementOpen] = useState(false)
  const [managementTab, setManagementTab] = useState<'edit' | 'volumes' | 'merge'>('edit')
  const toast = useToast()

  const handleEditSeries = () => {
    setManagementTab('edit')
    setManagementOpen(true)
  }

  const handleManageVolumes = () => {
    setManagementTab('volumes')
    setManagementOpen(true)
  }

  const handleDeleteSeries = async () => {
    toast.info('Not Implemented', 'Series deletion requires backend series ID.')
  }

  const handleUngroupAll = async () => {
    try {
      for (const book of series.books) {
        if (book.id) {
          await api.removeBookFromSeries(book.id)
        }
      }
      toast.success('Ungrouped', 'All volumes removed from series.')
    } catch (err) {
      toast.error('Error', 'Failed to ungroup volumes')
    }
  }


  // Use the first book's cover as the series cover
  const firstBook = series.books[0]
  const { coverUrl, loading: coverLoading } = useCoverImage(
    visible ? firstBook?.id : undefined,
    null,
  )

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { root: scrollRoot ?? null, threshold: 0.05 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollRoot])

  const handleClick = (e: React.MouseEvent) => {
    if ((e.shiftKey || e.ctrlKey || e.metaKey) && onSelect) {
      onSelect(series.id)
    } else {
      onOpen?.(series)
    }
  }

  return (
        <>
      <FeatureHint
        featureId="series-management"
        title="Manage Your Series"
        description="Right-click on a series card to edit details, manage volumes, merge series, or ungroup all volumes."
        position="top"
      >
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
          <div
            ref={cardRef}
      onClick={handleClick}
      style={{ animationDelay: `${animationDelay}ms` }}
      className={cn(
        'group relative flex flex-col cursor-pointer select-none',
        !visible && 'opacity-0',
        visible && 'animate-card-in',
      )}
    >
      {/* ── Stacked Depth Effect Container ── */}
      <div className="relative">
        {/* Layer 3 (back-most) — offset right and down */}
        <div
          className={cn(
            'absolute inset-0 rounded-md',
            'bg-muted border border-border/40',
            'translate-x-2 translate-y-2',
            'transition-transform duration-[150ms]',
            'group-hover:translate-x-2.5 group-hover:translate-y-2.5',
          )}
        />

        {/* Layer 2 (middle) — offset slightly */}
        <div
          className={cn(
            'absolute inset-0 rounded-md',
            'bg-muted/80 border border-border/50',
            'translate-x-1 translate-y-1',
            'transition-transform duration-[150ms]',
            'group-hover:translate-x-1.5 group-hover:translate-y-1.5',
          )}
        />

        {/* Layer 1 (front cover) — the actual card */}
        <div
          className={cn(
            'relative rounded-md overflow-hidden',
            'bg-card border border-border',
            'transition-all duration-[150ms]',
            isSelected
              ? 'ring-2 ring-primary border-primary shadow-md'
              : 'hover:border-border/80 hover:shadow-md hover:-translate-y-px',
            'border-[var(--manga-accent)]/20',
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
                alt={series.title}
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
            {(!coverUrl || imgError) && !imgLoaded && !coverLoading && (
              <div
                className={cn(
                  'absolute inset-0 flex flex-col items-center justify-center gap-2',
                  'bg-gradient-to-br from-muted to-muted/60',
                )}
              >
                <IconBookOpen size={32} className="text-muted-foreground/25" />
                <p className="text-[9px] text-muted-foreground/40 text-center px-2 line-clamp-2 font-medium">
                  {series.title}
                </p>
              </div>
            )}

            {/* Hover overlay with "View Series" */}
            <div
              className={cn(
                'absolute inset-0 flex items-center justify-center',
                'bg-black/50 backdrop-blur-[2px]',
                'opacity-0 group-hover:opacity-100',
                'transition-opacity duration-[150ms]',
                'rounded-t-[inherit]',
              )}
            >
              <div
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
                  'bg-background/90 backdrop-blur-sm',
                  'border border-border/60',
                  'text-foreground/80 text-xs font-medium',
                  'shadow-sm',
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                View Series
              </div>
            </div>

            {/* Volume count badge */}
            <div
              className={cn(
                'absolute bottom-1.5 right-1.5 z-10',
                'flex items-center gap-1 px-1.5 py-0.5 rounded',
                'bg-[var(--manga-accent)] text-white',
                'text-[9px] font-bold tracking-wide',
              )}
            >
              <Layers className="w-2.5 h-2.5" />
              {series.bookCount}
            </div>
          </div>
        </div>
      </div>

      {/* ── Info Strip ── */}
      <div className="flex flex-col px-2 pt-2 pb-2.5 gap-0.5">
        <h3
          className="text-[11px] font-semibold leading-tight line-clamp-2 text-foreground"
          title={series.title}
        >
          {series.title}
        </h3>
        <p
          className="text-[10px] text-muted-foreground truncate"
          title={Array.from(series.authors).join(', ')}
        >
          {Array.from(series.authors).join(', ') || 'Unknown Author'}
        </p>
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
        initialTab={managementTab}
      />
      </FeatureHint>
    </>
  )
})
