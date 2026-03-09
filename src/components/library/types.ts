import type { Book, MangaSeries } from '@/lib/tauri'
import type { SeriesGroup as HookSeriesGroup } from '@/hooks/useGroupedLibrary'

export type SeriesGroup = HookSeriesGroup

export interface SeriesCardProps {
  series: SeriesGroup
  isSelected?: boolean
  onSelect?: (id: string | number) => void
  onOpen?: (series: SeriesGroup) => void
  animationDelay?: number
  scrollRoot?: HTMLElement | null
}

export interface SeriesViewProps {
  series: SeriesGroup | null
  isOpen: boolean
  onClose: () => void
  onSelectBook: (id: number) => void
  onOpenBook: (id: number) => void
  onViewDetailsBook?: (id: number) => void
  onEditBook: (id: number) => void
  onDeleteBook: (id: number) => void
  onConvertBook?: (id: number) => void
  onFavoriteBook?: (id: number) => void
  selectedBookIds?: Set<number>
  favoritedBookIds?: Set<number>
}
