/**
 * FilterPanel — Shiori v3.0
 * Domain-aware, collapsible filter sidebar.
 * Premium theme-aligned accordion pattern.
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  IconChevronDown,
  IconX,
  IconSearch,
  IconFilter,
  IconStar,
} from '@/components/icons/ShioriIcons'
import { Users, Globe, Tag, FileType, Hash, BookMarked, BookOpen } from 'lucide-react'

export interface FilterItem {
  id: string
  label: string
  count: number
}

// ─── Reading Status ─────────────────────────────
type ReadingStatus = 'all' | 'unread' | 'reading' | 'completed'

// ─── Section Component ──────────────────────────
interface SectionProps {
  title: string
  icon: React.ReactNode
  items: FilterItem[]
  selected: string[]
  onToggle: (id: string) => void
  searchable?: boolean
  defaultOpen?: boolean
  maxVisible?: number
}

const FilterSection = ({
  title,
  icon,
  items,
  selected,
  onToggle,
  searchable = false,
  defaultOpen = true,
  maxVisible = 8,
}: SectionProps) => {
  const [open, setOpen] = useState(defaultOpen)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)

  const filtered = search
    ? items.filter((i) => i.label.toLowerCase().includes(search.toLowerCase()))
    : items

  const visible = showAll ? filtered : filtered.slice(0, maxVisible)
  const hasMore = filtered.length > maxVisible && !showAll
  const activeCount = selected.length

  return (
    <div className="border-b border-border/40 last:border-b-0 py-0.5">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center justify-between',
          'px-3 py-2 text-left mx-0.5 rounded-xl',
          'hover:bg-muted/60 transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
          'group select-none',
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 flex items-center justify-center">{icon}</span>
          <span className="text-xs font-bold text-foreground/90 group-hover:text-foreground truncate">{title}</span>
          {activeCount > 0 && (
            <span className="flex items-center justify-center px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 text-[10px] font-bold shrink-0">
              {activeCount}
            </span>
          )}
        </div>
        <IconChevronDown
          size={13}
          className={cn(
            'text-muted-foreground shrink-0 transition-transform duration-200 group-hover:text-foreground',
            open ? 'rotate-0' : '-rotate-90',
          )}
        />
      </button>

      {/* Body */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-in-out',
          open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        {/* Search */}
        {searchable && items.length > 5 && (
          <div className="px-2.5 pt-1 pb-1.5">
            <div className="relative">
              <IconSearch
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Filter ${title.toLowerCase()}…`}
                className={cn(
                  'w-full h-7 pl-7 pr-6 text-xs rounded-lg',
                  'bg-muted/40 border border-border/60 text-foreground',
                  'focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40',
                  'transition-all placeholder:text-muted-foreground/60',
                )}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <IconX size={11} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="px-1.5 pb-2 pt-0.5 max-h-56 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden space-y-0.5">
          {visible.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground italic">No items</p>
          ) : (
            <>
              {visible.map((item) => {
                const isActive = selected.includes(item.id)
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => onToggle(item.id)}
                    className={cn(
                      'w-full flex items-center justify-between',
                      'px-2.5 py-1.5 rounded-xl text-left gap-2',
                      'transition-all duration-150 border select-none',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
                      isActive
                        ? 'bg-primary/15 border-primary/25 text-foreground font-semibold shadow-xs'
                        : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                    )}
                  >
                    {/* Check indicator */}
                    <span
                      className={cn(
                        'w-3.5 h-3.5 rounded-md border shrink-0 flex items-center justify-center',
                        'transition-all duration-150',
                        isActive
                          ? 'bg-primary border-primary text-primary-foreground shadow-xs scale-105'
                          : 'border-border/80 bg-background/50',
                      )}
                    >
                      {isActive && (
                        <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-primary-foreground">
                          <path
                            d="M8.5 2.5L4 7.5L1.5 5"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 text-xs truncate">{item.label}</span>
                    {item.count > 0 && (
                      <span className="text-[10px] text-muted-foreground/80 font-mono tabular-nums shrink-0 px-1.5 py-0.5 rounded-md bg-muted/40 border border-border/30">
                        {item.count}
                      </span>
                    )}
                  </button>
                )
              })}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="w-full text-xs font-semibold text-primary hover:underline px-2.5 py-1.5 text-left transition-colors"
                >
                  +{filtered.length - maxVisible} more
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Reading Status Section ─────────────────────
interface ReadingStatusSectionProps {
  value: ReadingStatus
  onChange: (status: ReadingStatus) => void
}

const ReadingStatusSection = ({ value, onChange }: ReadingStatusSectionProps) => {
  const [open, setOpen] = useState(true)
  const options: { id: ReadingStatus; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'reading', label: 'Reading' },
    { id: 'completed', label: 'Completed' },
  ]

  return (
    <div className="border-b border-border/40 py-0.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 mx-0.5 rounded-xl hover:bg-muted/60 transition-all duration-200 group focus-visible:outline-none select-none"
      >
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          <span className="text-xs font-bold text-foreground/90 group-hover:text-foreground">Reading Status</span>
          {value !== 'all' && (
            <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center shadow-xs">
              1
            </span>
          )}
        </div>
        <IconChevronDown
          size={13}
          className={cn('text-muted-foreground transition-transform duration-200 group-hover:text-foreground', open ? 'rotate-0' : '-rotate-90')}
        />
      </button>
      <div className={cn('overflow-hidden transition-all duration-200 ease-in-out', open ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0')}>
        <div className="flex flex-col gap-0.5 px-1.5 pb-2 pt-0.5">
          {options.map((opt) => (
            <button
              type="button"
              key={opt.id}
              onClick={() => onChange(opt.id)}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left border select-none',
                'transition-all duration-150',
                value === opt.id
                  ? 'bg-primary/15 border-primary/25 text-foreground font-bold shadow-xs'
                  : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'w-3.5 h-3.5 rounded-full border shrink-0',
                  'flex items-center justify-center transition-all duration-150',
                  value === opt.id ? 'border-primary bg-primary/20' : 'border-border/80 bg-background/50',
                )}
              >
                {value === opt.id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-xs" />
                )}
              </span>
              <span className="text-xs">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Sidebar ────────────────────────────────
export interface FilterPanelProps {
  authors: FilterItem[]
  languages: FilterItem[]
  series: FilterItem[]
  formats: FilterItem[]
  publishers: FilterItem[]
  ratings: FilterItem[]
  tags: FilterItem[]
  identifiers: FilterItem[]
  selectedFilters: {
    authors: string[]
    languages: string[]
    series: string[]
    formats: string[]
    publishers: string[]
    ratings: string[]
    tags: string[]
    identifiers: string[]
  }
  onFilterToggle: (category: string, id: string) => void
  onClearAll: () => void
  domain?: 'books' | 'manga_comics'
}

export function FilterPanel({
  authors,
  languages,
  series,
  formats,
  publishers,
  ratings,
  tags,
  identifiers,
  selectedFilters,
  onFilterToggle,
  onClearAll,
  domain = 'books',
}: FilterPanelProps) {
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>('all')

  const totalActive = Object.values(selectedFilters).flat().length

  // For manga domain — filter formats to CBZ/CBR only
  const visibleFormats =
    domain === 'manga_comics'
      ? formats.filter((f) => ['CBZ', 'CBR'].includes(f.id.toUpperCase()))
      : formats

  return (
    <aside
      className={cn(
        'flex flex-col h-[calc(100%-12px)] my-1 ml-1.5 mb-2 rounded-2xl border border-border/40 bg-card/75 backdrop-blur-2xl overflow-hidden',
        'w-[var(--sidebar-width,224px)] shrink-0 select-none shadow-xs',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-12 px-3.5 border-b border-border/40 shrink-0 bg-card/40">
        <div className="flex items-center gap-2">
          <IconFilter size={14} className="text-primary" />
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground/90">Filters</span>
          {totalActive > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 text-[10px] font-bold">
              {totalActive}
            </span>
          )}
        </div>
        {totalActive > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold transition-all"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden p-1">
        <ReadingStatusSection value={readingStatus} onChange={setReadingStatus} />

        <FilterSection
          title="Authors"
          icon={<Users className="w-full h-full" />}
          items={authors}
          selected={selectedFilters.authors}
          onToggle={(id) => onFilterToggle('authors', id)}
          searchable
          defaultOpen
        />

        <FilterSection
          title="Tags"
          icon={<Tag className="w-full h-full" />}
          items={tags}
          selected={selectedFilters.tags}
          onToggle={(id) => onFilterToggle('tags', id)}
          searchable
          defaultOpen={false}
        />

        <FilterSection
          title="Series"
          icon={<BookMarked className="w-full h-full" />}
          items={series}
          selected={selectedFilters.series}
          onToggle={(id) => onFilterToggle('series', id)}
          searchable
          defaultOpen={false}
        />

        <FilterSection
          title={domain === 'manga_comics' ? 'Format' : 'Formats'}
          icon={<FileType className="w-full h-full" />}
          items={visibleFormats}
          selected={selectedFilters.formats}
          onToggle={(id) => onFilterToggle('formats', id)}
          defaultOpen={false}
        />

        <FilterSection
          title="Languages"
          icon={<Globe className="w-full h-full" />}
          items={languages}
          selected={selectedFilters.languages}
          onToggle={(id) => onFilterToggle('languages', id)}
          defaultOpen={false}
        />

        {domain === 'books' && (
          <>
            <FilterSection
              title="Publishers"
              icon={<Hash className="w-full h-full" />}
              items={publishers}
              selected={selectedFilters.publishers}
              onToggle={(id) => onFilterToggle('publishers', id)}
              searchable
              defaultOpen={false}
            />

            <FilterSection
              title="Rating"
              icon={<IconStar className="w-full h-full" size={14} />}
              items={ratings}
              selected={selectedFilters.ratings}
              onToggle={(id) => onFilterToggle('ratings', id)}
              defaultOpen={false}
            />
          </>
        )}
      </div>
    </aside>
  )
}
