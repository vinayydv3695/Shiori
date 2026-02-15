import { useState } from 'react'
import { 
  ChevronDown, 
  ChevronRight, 
  Search, 
  X,
  Users,
  Globe,
  BookMarked,
  FileType,
  Building,
  Star,
  Tag,
  Hash,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface FilterItem {
  id: string
  label: string
  count: number
}

interface FilterSectionProps {
  title: string
  icon: React.ReactNode
  items: FilterItem[]
  selectedItems: string[]
  onToggle: (id: string) => void
  defaultExpanded?: boolean
  searchable?: boolean
}

const FilterSection = ({
  title,
  icon,
  items,
  selectedItems,
  onToggle,
  defaultExpanded = true,
  searchable = false,
}: FilterSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredItems = items.filter(item =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Section Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2.5',
          'hover:bg-accent/50 transition-colors',
          'group'
        )}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <div className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors">
            {icon}
          </div>
          <span>{title}</span>
          <span className="text-xs text-muted-foreground">({items.length})</span>
        </div>
        <div className="w-4 h-4 text-muted-foreground transition-transform duration-200" style={{
          transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'
        }}>
          <ChevronDown className="w-full h-full" />
        </div>
      </button>

      {/* Section Content */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          isExpanded ? 'max-h-96' : 'max-h-0'
        )}
      >
        {searchable && items.length > 5 && (
          <div className="px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder={`Search ${title.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  'w-full h-7 pl-8 pr-7 text-xs',
                  'bg-muted/50 border border-border rounded-md',
                  'focus:outline-none focus:ring-1 focus:ring-primary',
                  'transition-all'
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="max-h-64 overflow-y-auto custom-scrollbar px-2 pb-2">
          {filteredItems.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No items found
            </div>
          ) : (
            filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onToggle(item.id)}
                className={cn(
                  'w-full flex items-center justify-between px-2 py-1.5 rounded-md',
                  'hover:bg-accent/50 transition-colors',
                  'group text-left',
                  selectedItems.includes(item.id) && 'bg-accent text-accent-foreground'
                )}
              >
                <span className="text-xs truncate flex-1">{item.label}</span>
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full',
                  'bg-muted text-muted-foreground',
                  'group-hover:bg-background',
                  selectedItems.includes(item.id) && 'bg-primary/10 text-primary'
                )}>
                  {item.count}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

interface ModernSidebarProps {
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
}

export const ModernSidebar = ({
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
}: ModernSidebarProps) => {
  const totalFiltersActive = Object.values(selectedFilters).flat().length

  return (
    <div className="w-60 border-r border-border bg-background flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="h-12 border-b border-border px-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Filters</h2>
        {totalFiltersActive > 0 && (
          <button
            onClick={onClearAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all ({totalFiltersActive})
          </button>
        )}
      </div>

      {/* Filter Sections */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <FilterSection
          title="Authors"
          icon={<Users />}
          items={authors}
          selectedItems={selectedFilters.authors}
          onToggle={(id) => onFilterToggle('authors', id)}
          searchable
        />

        <FilterSection
          title="Languages"
          icon={<Globe />}
          items={languages}
          selectedItems={selectedFilters.languages}
          onToggle={(id) => onFilterToggle('languages', id)}
        />

        <FilterSection
          title="Series"
          icon={<BookMarked />}
          items={series}
          selectedItems={selectedFilters.series}
          onToggle={(id) => onFilterToggle('series', id)}
          searchable
        />

        <FilterSection
          title="Formats"
          icon={<FileType />}
          items={formats}
          selectedItems={selectedFilters.formats}
          onToggle={(id) => onFilterToggle('formats', id)}
        />

        <FilterSection
          title="Publishers"
          icon={<Building />}
          items={publishers}
          selectedItems={selectedFilters.publishers}
          onToggle={(id) => onFilterToggle('publishers', id)}
          searchable
        />

        <FilterSection
          title="Rating"
          icon={<Star />}
          items={ratings}
          selectedItems={selectedFilters.ratings}
          onToggle={(id) => onFilterToggle('ratings', id)}
        />

        <FilterSection
          title="Tags"
          icon={<Tag />}
          items={tags}
          selectedItems={selectedFilters.tags}
          onToggle={(id) => onFilterToggle('tags', id)}
          searchable
        />

        <FilterSection
          title="Identifiers"
          icon={<Hash />}
          items={identifiers}
          selectedItems={selectedFilters.identifiers}
          onToggle={(id) => onFilterToggle('identifiers', id)}
        />
      </div>
    </div>
  )
}

// Custom scrollbar styles (add to globals.css)
/*
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.3);
}
*/
