import { useState, useEffect, useMemo, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Checkbox from '@radix-ui/react-checkbox'
import { X, Filter, Save, Trash2, ChevronDown, Check, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { useLibraryStore } from '@/store/libraryStore'
import type { FilterCriteria, FilterPreset, ReadingStatus } from '@/store/libraryStore'
import { matchesAdvancedFilters, countActiveFilterCriteria } from '@/store/libraryStore'

const STORAGE_KEY = 'shiori_filter_presets'

function loadPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    logger.error('Failed to load filter presets:', e)
    return []
  }
}

function savePresets(presets: FilterPreset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch (e) {
    logger.error('Failed to save filter presets:', e)
  }
}

const EMPTY_FILTERS: FilterCriteria = {
  textSearch: '',
  authors: [],
  tags: [],
  formats: [],
  ratingMin: 0,
  ratingMax: 5,
  dateFrom: '',
  dateTo: '',
  readingStatus: [],
}

const READING_STATUSES: { value: ReadingStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'reading', label: 'Reading' },
  { value: 'completed', label: 'Completed' },
]

interface AdvancedFilterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AdvancedFilterDialog({ open, onOpenChange }: AdvancedFilterDialogProps) {
  const books = useLibraryStore(state => state.books)
  const activeFilters = useLibraryStore(state => state.activeFilters)
  const setActiveFilters = useLibraryStore(state => state.setActiveFilters)

  const [filters, setFilters] = useState<FilterCriteria>({ ...EMPTY_FILTERS })
  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [showPresetInput, setShowPresetInput] = useState(false)
  const [showPresetsDropdown, setShowPresetsDropdown] = useState(false)
  const [debouncedTextSearch, setDebouncedTextSearch] = useState('')

  useEffect(() => {
    if (open) {
      setFilters(activeFilters ? { ...activeFilters } : { ...EMPTY_FILTERS })
      setPresets(loadPresets())
      setShowPresetInput(false)
      setShowPresetsDropdown(false)
    }
  }, [open, activeFilters])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTextSearch(filters.textSearch ?? ''), 300)
    return () => clearTimeout(timer)
  }, [filters.textSearch])

  const filtersForCount = useMemo<FilterCriteria>(
    () => ({ ...filters, textSearch: debouncedTextSearch }),
    [filters, debouncedTextSearch]
  )

  const { uniqueAuthors, uniqueTags, uniqueFormats } = useMemo(() => {
    const authorsSet = new Set<string>()
    const tagsSet = new Set<string>()
    const formatsSet = new Set<string>()

    for (const book of books) {
      book.authors?.forEach(a => { if (a.name) authorsSet.add(a.name) })
      book.tags?.forEach(t => { if (t.name) tagsSet.add(t.name) })
      if (book.file_format) formatsSet.add(book.file_format.toUpperCase())
    }

    return {
      uniqueAuthors: Array.from(authorsSet).sort(),
      uniqueTags: Array.from(tagsSet).sort(),
      uniqueFormats: Array.from(formatsSet).sort(),
    }
  }, [books])

  const matchingCount = useMemo(() => {
    const hasAny = countActiveFilterCriteria(filtersForCount) > 0
    if (!hasAny) return books.length
    return books.filter(b => matchesAdvancedFilters(b, filtersForCount)).length
  }, [books, filtersForCount])

  const updateFilter = useCallback(<K extends keyof FilterCriteria>(key: K, value: FilterCriteria[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const toggleArrayItem = useCallback(<T extends string>(arr: T[] | undefined, item: T): T[] => {
    const current = arr ?? []
    return current.includes(item) ? current.filter(i => i !== item) : [...current, item]
  }, [])

  const handleApply = () => {
    const hasAny = countActiveFilterCriteria(filters) > 0
    setActiveFilters(hasAny ? { ...filters } : null)
    onOpenChange(false)
    logger.debug('[AdvancedFilter] Applied filters:', filters)
  }

  const handleClearAll = () => {
    setFilters({ ...EMPTY_FILTERS })
  }

  const handleSavePreset = () => {
    if (!presetName.trim()) return
    const newPreset: FilterPreset = { name: presetName.trim(), filters: { ...filters } }
    const updated = [...presets.filter(p => p.name !== newPreset.name), newPreset]
    setPresets(updated)
    savePresets(updated)
    setPresetName('')
    setShowPresetInput(false)
    logger.debug('[AdvancedFilter] Saved preset:', newPreset.name)
  }

  const handleLoadPreset = (preset: FilterPreset) => {
    setFilters({ ...EMPTY_FILTERS, ...preset.filters })
    setShowPresetsDropdown(false)
    logger.debug('[AdvancedFilter] Loaded preset:', preset.name)
  }

  const handleDeletePreset = (name: string) => {
    const updated = presets.filter(p => p.name !== name)
    setPresets(updated)
    savePresets(updated)
    logger.debug('[AdvancedFilter] Deleted preset:', name)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-2xl w-[640px] max-w-[95vw] max-h-[90vh] flex flex-col z-50">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <Dialog.Title className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Filter size={18} />
              Advanced Filters
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Close">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            <FilterSection title="Text Search">
              <input
                type="text"
                value={filters.textSearch ?? ''}
                onChange={e => updateFilter('textSearch', e.target.value)}
                placeholder="Search in title, author..."
                className="w-full h-9 px-3 text-sm rounded-md border border-border bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
              />
            </FilterSection>

            <FilterSection title="Authors">
              <MultiSelectCheckboxList
                items={uniqueAuthors}
                selected={filters.authors ?? []}
                onToggle={item => updateFilter('authors', toggleArrayItem(filters.authors, item))}
                maxVisible={6}
              />
            </FilterSection>

            <FilterSection title="Tags">
              <TagChips
                items={uniqueTags}
                selected={filters.tags ?? []}
                onToggle={item => updateFilter('tags', toggleArrayItem(filters.tags, item))}
              />
            </FilterSection>

            <FilterSection title="Formats">
              <div className="flex flex-wrap gap-2">
                {uniqueFormats.map(fmt => (
                  <label key={fmt} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <Checkbox.Root
                      checked={(filters.formats ?? []).includes(fmt)}
                      onCheckedChange={() => updateFilter('formats', toggleArrayItem(filters.formats, fmt))}
                      className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                        (filters.formats ?? []).includes(fmt)
                          ? 'bg-primary border-primary'
                          : 'border-border bg-muted/40'
                      )}
                    >
                      <Checkbox.Indicator>
                        <Check size={12} className="text-primary-foreground" />
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                    <span className="text-xs font-medium text-foreground">{fmt}</span>
                  </label>
                ))}
                {uniqueFormats.length === 0 && (
                  <span className="text-xs text-muted-foreground">No formats available</span>
                )}
              </div>
            </FilterSection>

            <FilterSection title="Rating">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Min:</span>
                  <StarRating
                    value={filters.ratingMin ?? 0}
                    onChange={v => updateFilter('ratingMin', v)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Max:</span>
                  <StarRating
                    value={filters.ratingMax ?? 5}
                    onChange={v => updateFilter('ratingMax', v)}
                  />
                </div>
              </div>
            </FilterSection>

            <FilterSection title="Date Added">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-muted-foreground mb-1">From</label>
                  <input
                    type="date"
                    value={filters.dateFrom ?? ''}
                    onChange={e => updateFilter('dateFrom', e.target.value)}
                    className="w-full h-9 px-3 text-sm rounded-md border border-border bg-muted/40 text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:dark]"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-muted-foreground mb-1">To</label>
                  <input
                    type="date"
                    value={filters.dateTo ?? ''}
                    onChange={e => updateFilter('dateTo', e.target.value)}
                    className="w-full h-9 px-3 text-sm rounded-md border border-border bg-muted/40 text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:dark]"
                  />
                </div>
              </div>
            </FilterSection>

            <FilterSection title="Reading Status">
              <div className="flex flex-wrap gap-3">
                {READING_STATUSES.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <Checkbox.Root
                      checked={(filters.readingStatus ?? []).includes(value)}
                      onCheckedChange={() =>
                        updateFilter('readingStatus', toggleArrayItem(filters.readingStatus, value))
                      }
                      className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                        (filters.readingStatus ?? []).includes(value)
                          ? 'bg-primary border-primary'
                          : 'border-border bg-muted/40'
                      )}
                    >
                      <Checkbox.Indicator>
                        <Check size={12} className="text-primary-foreground" />
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                    <span className="text-xs font-medium text-foreground">{label}</span>
                  </label>
                ))}
              </div>
            </FilterSection>
          </div>

          <div className="px-6 py-4 border-t border-border space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{matchingCount}</span>
                {' '}of{' '}
                <span className="font-semibold text-foreground">{books.length}</span>
                {' '}books match
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                {showPresetInput ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={presetName}
                      onChange={e => setPresetName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setShowPresetInput(false) }}
                      placeholder="Preset name..."
                      autoFocus
                      className="h-8 w-36 px-2 text-xs rounded-md border border-border bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      onClick={handleSavePreset}
                      disabled={!presetName.trim()}
                      className="h-8 px-2.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/85 disabled:opacity-40 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowPresetInput(false)}
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowPresetInput(true)}
                    className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <Save size={13} />
                    Save Filter
                  </button>
                )}
              </div>

              {presets.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowPresetsDropdown(p => !p)}
                    className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    Load Filter
                    <ChevronDown size={12} />
                  </button>
                  {showPresetsDropdown && (
                    <div className="absolute bottom-full left-0 mb-1 w-56 bg-popover border border-border rounded-md shadow-lg py-1 z-10">
                      {presets.map(preset => (
                        <div key={preset.name} className="flex items-center justify-between px-3 py-1.5 hover:bg-accent group">
                          <button
                            onClick={() => handleLoadPreset(preset)}
                            className="flex-1 text-left text-xs text-foreground truncate"
                          >
                            {preset.name}
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeletePreset(preset.name) }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-all"
                            title="Delete preset"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1" />

              <button
                onClick={handleClearAll}
                className="h-8 px-3 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Clear All
              </button>
              <Dialog.Close asChild>
                <button className="h-8 px-3 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleApply}
                className="h-8 px-4 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/85 shadow-sm transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  )
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(-1)

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => {
        const filled = star <= (hover >= 0 ? hover : value)
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star === value ? 0 : star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(-1)}
            className="p-0.5 transition-colors"
          >
            <Star
              size={16}
              className={cn(
                'transition-colors',
                filled ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

function MultiSelectCheckboxList({
  items,
  selected,
  onToggle,
  maxVisible = 6,
}: {
  items: string[]
  selected: string[]
  onToggle: (item: string) => void
  maxVisible?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(i => i.toLowerCase().includes(q))
  }, [items, search])

  const visible = expanded ? filtered : filtered.slice(0, maxVisible)
  const hasMore = filtered.length > maxVisible

  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">No authors available</span>
  }

  return (
    <div className="space-y-2">
      {items.length > maxVisible && (
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter authors..."
          className="w-full h-8 px-2.5 text-xs rounded-md border border-border bg-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      )}
      <div className={cn('space-y-1', expanded && 'max-h-40 overflow-y-auto pr-1')}>
        {visible.map(item => (
          <label key={item} className="flex items-center gap-2 cursor-pointer select-none py-0.5">
            <Checkbox.Root
              checked={selected.includes(item)}
              onCheckedChange={() => onToggle(item)}
              className={cn(
                'w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0',
                selected.includes(item)
                  ? 'bg-primary border-primary'
                  : 'border-border bg-muted/40'
              )}
            >
              <Checkbox.Indicator>
                <Check size={12} className="text-primary-foreground" />
              </Checkbox.Indicator>
            </Checkbox.Root>
            <span className="text-xs text-foreground truncate">{item}</span>
          </label>
        ))}
      </div>
      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-primary hover:underline"
        >
          Show {filtered.length - maxVisible} more...
        </button>
      )}
      {expanded && hasMore && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-primary hover:underline"
        >
          Show less
        </button>
      )}
    </div>
  )
}

function TagChips({
  items,
  selected,
  onToggle,
}: {
  items: string[]
  selected: string[]
  onToggle: (item: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, 12)
  const hasMore = items.length > 12

  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">No tags available</span>
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {visible.map(tag => {
          const isSelected = selected.includes(tag)
          return (
            <button
              key={tag}
              onClick={() => onToggle(tag)}
              className={cn(
                'h-6 px-2.5 rounded-full text-xs font-medium transition-colors',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {tag}
            </button>
          )
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setShowAll(p => !p)}
          className="text-xs text-primary hover:underline"
        >
          {showAll ? 'Show less' : `Show ${items.length - 12} more...`}
        </button>
      )}
    </div>
  )
}
