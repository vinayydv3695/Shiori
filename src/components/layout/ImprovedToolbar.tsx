import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Plus,
  Search,
  Settings,
  Moon,
  Sun,
  BookMarked,
  Image as ImageIcon,
  FolderUp,
  LayoutGrid,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTheme } from '@/hooks/useTheme'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type DomainView = 'books' | 'manga'

interface ImprovedToolbarProps {
  onAddBook: () => void
  onAddFolder: () => void
  onSettings: () => void
  onSearch?: (query: string) => void
  currentDomain: DomainView
  onDomainChange: (domain: DomainView) => void
}

export const ImprovedToolbar = ({
  onAddBook,
  onAddFolder,
  onSettings,
  onSearch,
  currentDomain,
  onDomainChange,
}: ImprovedToolbarProps) => {
  const { theme, toggleTheme } = useTheme()
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      if (onSearch) {
        onSearch(searchQuery)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, onSearch])

  return (
    <div className="h-16 border-b border-border bg-background sticky top-0 z-50 shadow-sm">
      <div className="h-full px-6 flex items-center justify-between gap-6">
        {/* Left: Domain Selector */}
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-primary">Shiori</h1>
          
          <div className="flex items-center gap-2 p-1 rounded-lg bg-muted/50 border border-border">
            <Button
              variant={currentDomain === 'books' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onDomainChange('books')}
              className="h-9 px-4 gap-2 font-medium"
            >
              <BookMarked className="w-4 h-4" />
              Books
            </Button>
            <Button
              variant={currentDomain === 'manga' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onDomainChange('manga')}
              className="h-9 px-4 gap-2 font-medium"
            >
              <ImageIcon className="w-4 h-4" />
              Manga
            </Button>
          </div>
        </div>

        {/* Center: Search */}
        <div className="flex-1 max-w-2xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={`Search ${currentDomain}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 bg-background border-border"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add {currentDomain === 'manga' ? 'Manga' : 'Books'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={onAddBook}>
                <Plus className="w-4 h-4 mr-2" />
                Add {currentDomain === 'manga' ? 'Manga' : 'Book'} File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAddFolder}>
                <FolderUp className="w-4 h-4 mr-2" />
                Import Folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="w-10 h-10"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onSettings}
            className="w-10 h-10"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// Simplified View Controls
interface ViewControlsProps {
  selectedCount: number
  totalCount: number
}

export const ViewControls = ({ selectedCount, totalCount }: ViewControlsProps) => {
  return (
    <div className="h-12 border-b border-border bg-muted/30 px-6 flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        {selectedCount > 0 ? (
          <span className="font-medium text-foreground">
            {selectedCount} selected
          </span>
        ) : (
          <span>
            {totalCount} {totalCount === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-2">
          <LayoutGrid className="w-4 h-4" />
          Grid View
        </Button>
      </div>
    </div>
  )
}
