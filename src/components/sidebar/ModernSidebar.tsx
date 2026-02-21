/**
 * FilterPanel — Shiori v3.0
 * Domain-aware, collapsible filter sidebar.
 * Replaces ModernSidebar with a cleaner accordion pattern.
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
    <div className="border-b border-border last:border-b-0">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center justify-between',
          'px-3 py-2 text-left',
          'hover:bg-accent/60 transition-colors duration-[120ms]',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'group',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-3.5 h-3.5 text-muted-foreground shrink-0">{icon}</span>
          <span className="text-xs font-semibold text-foreground truncate">{title}</span>
          {activeCount > 0 && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold shrink-0">
              {activeCount}
            </span>
          )}
        </div>
        <IconChevronDown
          size={13}
          className={cn(
            'text-muted-foreground shrink-0 transition-transform duration-200',
            open ? 'rotate-0' : '-rotate-90',
          )}
        />
      </button>

      {/* Body */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          open ? 'max-h-96' : 'max-h-0',
        )}
      >
        {/* Search */}
        {searchable && items.length > 5 && (
          <div className="px-2 pt-1 pb-0.5">
            <div className="relative">
              <IconSearch
                size={11}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Filter ${title.toLowerCase()}…`}
                className={cn(
                  'w-full h-6 pl-6 pr-6 text-[11px] rounded',
                  'bg-muted/60 border border-border',
                  'focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring',
                  'transition-colors',
                  'placeholder:text-muted-foreground/60',
                )}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <IconX size={10} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="px-1.5 pb-1.5 pt-0.5 max-h-52 overflow-y-auto custom-scrollbar">
          {visible.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">No items</p>
          ) : (
            <>
              {visible.map((item) => {
                const isActive = selected.includes(item.id)
                return (
                  <button
                    key={item.id}
                    onClick={() => onToggle(item.id)}
                    className={cn(
                      'w-full flex items-center justify-between',
                      'px-2 py-1 rounded text-left gap-2',
                      'transition-colors duration-[100ms]',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      isActive
                        ? 'bg-primary/10 text-foreground'
                        : 'hover:bg-accent/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {/* Check indicator */}
                    <span
                      className={cn(
                        'w-3 h-3 rounded-sm border shrink-0 flex items-center justify-center',
                        'transition-all duration-[100ms]',
                        isActive
                          ? 'bg-primary border-primary'
                          : 'border-border',
                      )}
                    >
                      {isActive && (
                        <svg viewBox="0 0 10 10" className="w-2 h-2 text-primary-foreground">
                          <path
                            d="M8.5 2.5L4 7.5L1.5 5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 text-[11px] truncate">{item.label}</span>
                    {item.count > 0 && (
                      <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0">
                        {item.count}
                      </span>
                    )}
                  </button>
                )
              })}
              {hasMore && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 text-left transition-colors"
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
    <div className="border-b border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/60 transition-colors group focus-visible:outline-none"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">Reading Status</span>
          {value !== 'all' && (
            <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              1
            </span>
          )}
        </div>
        <IconChevronDown
          size={13}
          className={cn('text-muted-foreground transition-transform duration-200', open ? '' : '-rotate-90')}
        />
      </button>
      <div className={cn('overflow-hidden transition-all duration-200', open ? 'max-h-40' : 'max-h-0')}>
        <div className="flex flex-col gap-0.5 px-1.5 pb-1.5 pt-0.5">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              className={cn(
                'flex items-center gap-2 px-2 py-1 rounded text-left',
                'transition-colors duration-[100ms]',
                value === opt.id
                  ? 'bg-primary/10 text-foreground'
                  : 'hover:bg-accent/60 text-muted-foreground hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'w-3 h-3 rounded-full border shrink-0',
                  'flex items-center justify-center transition-all duration-[100ms]',
                  value === opt.id ? 'border-primary' : 'border-border',
                )}
              >
                {value === opt.id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </span>
              <span className="text-[11px]">{opt.label}</span>
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
  domain?: 'books' | 'manga'
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
    domain === 'manga'
      ? formats.filter((f) => ['CBZ', 'CBR'].includes(f.id.toUpperCase()))
      : formats

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-background',
        'border-r border-border',
        'w-[var(--sidebar-width,224px)] shrink-0',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-10 px-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <IconFilter size={13} className="text-muted-foreground" />
          <span className="text-xs font-semibold">Filters</span>
          {totalActive > 0 && (
            <span className="text-[10px] text-muted-foreground">({totalActive})</span>
          )}
        </div>
        {totalActive > 0 && (
          <button
            onClick={onClearAll}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
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
          title={domain === 'manga' ? 'Format' : 'Formats'}
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
