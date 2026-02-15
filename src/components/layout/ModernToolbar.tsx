import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { 
  Plus, 
  FileEdit, 
  RefreshCw, 
  Eye, 
  Download, 
  Newspaper, 
  Settings, 
  Trash2,
  Database,
  Save,
  Share2,
  BookOpen,
  Search,
  Grid3x3,
  List,
  LayoutGrid,
  SlidersHorizontal,
  Moon,
  Sun,
  Command as CommandIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from '@/hooks/useTheme'

interface ToolbarButtonProps {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  shortcut?: string
  disabled?: boolean
}

const ToolbarButton = ({ icon, label, onClick, shortcut, disabled }: ToolbarButtonProps) => {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            disabled={disabled}
            className={cn(
              'flex flex-col items-center gap-1 h-auto py-2 px-3',
              'hover:bg-accent hover:text-accent-foreground',
              'transition-all duration-150',
              'group relative'
            )}
          >
            <div className="w-5 h-5 group-hover:scale-110 transition-transform duration-150">
              {icon}
            </div>
            <span className="text-xs font-medium">{label}</span>
            {shortcut && (
              <span className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <kbd className="text-xs bg-muted px-1 rounded">{shortcut}</kbd>
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-2">
          <span>{label}</span>
          {shortcut && (
            <kbd className="text-xs bg-muted px-1.5 py-0.5 rounded">{shortcut}</kbd>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const ToolbarDivider = () => (
  <div className="w-px h-8 bg-border mx-1" />
)

interface ModernToolbarProps {
  onAddBook: () => void
  onEditMetadata: () => void
  onConvert: () => void
  onView: () => void
  onDownload: () => void
  onFetchNews: () => void
  onSettings: () => void
  onRemove: () => void
  onSave: () => void
  onShare: () => void
  onEditBook: () => void
}

export const ModernToolbar = ({
  onAddBook,
  onEditMetadata,
  onConvert,
  onView,
  onDownload,
  onFetchNews,
  onSettings,
  onRemove,
  onSave,
  onShare,
  onEditBook,
}: ModernToolbarProps) => {
  const { theme, toggleTheme } = useTheme()
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div className="h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="h-full px-4 flex items-center justify-between gap-2">
        {/* Left: Main Actions */}
        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={<Plus className="w-full h-full" />}
            label="Add Book"
            onClick={onAddBook}
            shortcut="⌘N"
          />
          <ToolbarButton
            icon={<FileEdit className="w-full h-full" />}
            label="Edit Metadata"
            onClick={onEditMetadata}
            shortcut="⌘E"
          />
          <ToolbarButton
            icon={<RefreshCw className="w-full h-full" />}
            label="Convert"
            onClick={onConvert}
          />
          
          <ToolbarDivider />
          
          <ToolbarButton
            icon={<Eye className="w-full h-full" />}
            label="View"
            onClick={onView}
          />
          <ToolbarButton
            icon={<Download className="w-full h-full" />}
            label="Download"
            onClick={onDownload}
          />
          <ToolbarButton
            icon={<Newspaper className="w-full h-full" />}
            label="Fetch News"
            onClick={onFetchNews}
          />
          
          <ToolbarDivider />
          
          <ToolbarButton
            icon={<Save className="w-full h-full" />}
            label="Save to Disk"
            onClick={onSave}
          />
          <ToolbarButton
            icon={<Share2 className="w-full h-full" />}
            label="Share"
            onClick={onShare}
          />
          <ToolbarButton
            icon={<BookOpen className="w-full h-full" />}
            label="Edit Book"
            onClick={onEditBook}
          />
          
          <ToolbarDivider />
          
          <ToolbarButton
            icon={<Trash2 className="w-full h-full" />}
            label="Remove"
            onClick={onRemove}
            shortcut="⌫"
          />
        </div>

        {/* Center: Search */}
        <div className="flex-1 max-w-md">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              type="text"
              placeholder="Search books... (⌘K for advanced)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-20 h-9 bg-muted/50 border-0 focus-visible:ring-1 transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
                <CommandIcon className="w-3 h-3" />K
              </kbd>
            </div>
          </div>
        </div>

        {/* Right: Library & Settings */}
        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={<Database className="w-full h-full" />}
            label="Library"
            onClick={() => {}}
          />
          
          <ToolbarDivider />
          
          <ToolbarButton
            icon={<Settings className="w-full h-full" />}
            label="Settings"
            onClick={onSettings}
            shortcut="⌘,"
          />
          
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="w-9 h-9"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface ViewControlsProps {
  view: 'grid' | 'list' | 'table'
  onViewChange: (view: 'grid' | 'list' | 'table') => void
  onFilterClick: () => void
  selectedCount: number
}

export const ViewControls = ({ view, onViewChange, onFilterClick, selectedCount }: ViewControlsProps) => {
  return (
    <div className="h-12 border-b border-border bg-background px-4 flex items-center justify-between">
      {/* Left: Selection info */}
      <div className="text-sm text-muted-foreground">
        {selectedCount > 0 ? (
          <span className="font-medium text-foreground">
            {selectedCount} book{selectedCount !== 1 ? 's' : ''} selected
          </span>
        ) : (
          <span>All Books</span>
        )}
      </div>

      {/* Right: View controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onFilterClick}
          className="gap-2"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="text-xs">Filters</span>
        </Button>

        <div className="flex items-center bg-muted rounded-lg p-1">
          <Button
            variant={view === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => onViewChange('grid')}
            className="h-7 w-7"
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            variant={view === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => onViewChange('list')}
            className="h-7 w-7"
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant={view === 'table' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => onViewChange('table')}
            className="h-7 w-7"
          >
            <Grid3x3 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

interface StatusBarProps {
  totalBooks: number
  filteredBooks: number
  selectedBooks: number
  librarySize: string
  syncStatus: 'synced' | 'syncing' | 'error'
}

export const StatusBar = ({
  totalBooks,
  filteredBooks,
  selectedBooks,
  librarySize,
  syncStatus,
}: StatusBarProps) => {
  return (
    <div className="h-6 border-t border-border bg-muted/30 px-4 flex items-center justify-between text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span>
          {filteredBooks} of {totalBooks} books
        </span>
        {selectedBooks > 0 && (
          <span className="text-primary font-medium">
            {selectedBooks} selected
          </span>
        )}
        <span className="opacity-60">|</span>
        <span>{librarySize}</span>
      </div>

      <div className="flex items-center gap-2">
        {syncStatus === 'synced' && (
          <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <div className="w-1.5 h-1.5 rounded-full bg-green-600 dark:bg-green-400" />
            Synced
          </span>
        )}
        {syncStatus === 'syncing' && (
          <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" />
            Syncing...
          </span>
        )}
        {syncStatus === 'error' && (
          <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
            <div className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400" />
            Sync Error
          </span>
        )}
      </div>
    </div>
  )
}
