import React, { useState, useEffect, useMemo } from 'react';
import { Shelf, api } from '../../lib/tauri';
import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { 
  Zap, 
  Library, 
  Star, 
  Heart, 
  Bookmark, 
  BookOpen, 
  Target, 
  Lightbulb, 
  Palette, 
  Flame, 
  Plus,
  ChevronRight,
  BookMarked,
  Edit,
  Trash2,
  MoreVertical,
  Search,
  ArrowUpDown,
  Filter,
  Layers,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { convertFileSrc } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useIsMobile';

const PRESET_ICONS: Record<string, React.ElementType> = {
  library: Library,
  star: Star,
  heart: Heart,
  bookmark: Bookmark,
  bookopen: BookOpen,
  target: Target,
  zap: Zap,
  sparkles: Zap,
  lightbulb: Lightbulb,
  palette: Palette,
  flame: Flame,
};

export type ShelfFilterType = 'all' | 'favorites' | 'smart' | 'with-books' | 'empty';
export type ShelfSortType = 'name-asc' | 'name-desc' | 'books-desc' | 'books-asc' | 'newest';

interface ShelfGridProps {
  shelves: Shelf[];
  onSelectShelf: (shelf: Shelf) => void;
  onCreateShelf?: () => void;
  onEditShelf?: (shelf: Shelf) => void;
  onDeleteShelf?: (shelf: Shelf) => void;
  onAddBooks?: (shelf: Shelf) => void;
}

interface ShelfCovers {
  [shelfId: number]: string[];
}

function EmptyShelfMockup({
  icon: Icon,
  color,
  onAddBooks,
  isSmart,
}: {
  icon: React.ElementType;
  color: string;
  onAddBooks?: () => void;
  isSmart?: boolean;
}) {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-4 select-none">
      {/* Soft ambient background glow */}
      <div 
        className="absolute inset-0 opacity-40 group-hover:opacity-75 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${color}35 0%, transparent 65%)`,
        }}
      />

      {/* Floating glass icon container */}
      <div
        className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center backdrop-blur-xl border transition-all duration-300 group-hover:scale-105 group-hover:-translate-y-0.5 shadow-sm group-hover:shadow-md mb-3"
        style={{
          background: `color-mix(in srgb, var(--card) 90%, ${color} 10%)`,
          borderColor: `${color}30`,
          color: color,
          boxShadow: `0 8px 24px -6px ${color}25`,
        }}
      >
        <Icon className="w-7 h-7 sm:w-8 sm:h-8 transition-transform duration-300 group-hover:scale-110" strokeWidth={1.75} />
      </div>

      {/* Add Books Action */}
      {onAddBooks && !isSmart && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddBooks();
          }}
          className="relative z-10 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-background/80 hover:bg-background text-foreground/90 hover:text-foreground border border-border/60 hover:border-primary/40 shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-primary" />
          <span>Add Books</span>
        </button>
      )}
    </div>
  );
}

function SingleBookMockup({ cover, color }: { cover: string; color: string }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center p-3" style={{ perspective: '1000px' }}>
      <div 
        className="relative w-auto h-full max-w-[85%] aspect-[2/3] rounded-lg overflow-hidden transition-transform duration-500 group-hover:scale-105 group-hover:-rotate-1"
        style={{
          boxShadow: `0 14px 28px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1), 0 0 30px ${color}30`,
          transform: 'rotateY(-6deg) rotateX(2deg)',
        }}
      >
        <img
          src={cover}
          alt=""
          className="w-full h-full object-cover"
        />
        {/* Book spine lighting & glare */}
        <div className="absolute top-0 bottom-0 left-0 w-2.5 bg-gradient-to-r from-black/60 via-black/20 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
    </div>
  );
}

function MultiBookFanStack({ covers, color, totalBooks }: { covers: string[]; color: string; totalBooks: number }) {
  const extraCount = totalBooks > covers.length ? totalBooks - covers.length : 0;

  return (
    <div className="relative w-full h-full flex items-center justify-center" style={{ perspective: '1000px' }}>
      {covers.slice(0, 3).reverse().map((cover, i) => {
        const revIdx = Math.min(covers.length - 1, 2) - i;
        
        let offset = 0;
        let rotate = 0;
        let rotateY = 0;
        const scale = 1 - revIdx * 0.07;
        const opacity = 1 - revIdx * 0.12;
        
        if (revIdx === 1) {
          offset = -18;
          rotate = -6;
          rotateY = -10;
        } else if (revIdx === 2) {
          offset = 18;
          rotate = 6;
          rotateY = 10;
        }

        return (
          <div
            key={i}
            className="absolute w-auto h-[90%] aspect-[2/3] rounded-lg overflow-hidden transition-all duration-300 group-hover:scale-105"
            style={{
              transform: `translateX(${offset}px) scale(${scale}) rotate(${rotate}deg) rotateY(${rotateY}deg)`,
              opacity,
              zIndex: 10 - revIdx,
              boxShadow: revIdx === 0 
                ? `0 12px 28px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.15)`
                : `0 4px 16px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05)`,
            }}
          >
            <img
              src={cover}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute top-0 bottom-0 left-0 w-2 bg-gradient-to-r from-black/50 to-transparent pointer-events-none" />
          </div>
        );
      })}

      {extraCount > 0 && (
        <div className="absolute bottom-2 right-2 z-20 px-2 py-0.5 rounded-full bg-background/90 backdrop-blur-md border border-border/60 text-[10px] font-extrabold text-foreground shadow-lg">
          +{extraCount} more
        </div>
      )}
    </div>
  );
}

function ShelfCard({
  shelf,
  covers,
  onClick,
  onEdit,
  onDelete,
  onAddBooks,
  delay,
}: {
  shelf: Shelf;
  covers: string[];
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAddBooks?: () => void;
  delay: number;
}) {
  const isMobile = useIsMobile();
  const Icon = shelf.icon && PRESET_ICONS[shelf.icon]
    ? PRESET_ICONS[shelf.icon]
    : shelf.isSmart ? Zap : (shelf.shelfType === 'favorites' ? Heart : BookMarked);

  const isCustomColor = Boolean(shelf.color && !['#3b82f6', '#2563eb', '#1d4ed8', '#60a5fa', '#6366f1'].includes(shelf.color.toLowerCase()));
  const color = isCustomColor 
    ? shelf.color! 
    : (shelf.shelfType === 'favorites' ? '#f43f5e' : shelf.isSmart ? '#a855f7' : 'hsl(var(--primary))');
  const count = shelf.bookCount ?? 0;
  const hasCover = covers.length > 0;
  const isFavorite = shelf.shelfType === 'favorites';

  const button = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(delay * 0.05, 0.4), duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      onClick={onClick}
      className="group relative flex flex-col text-left rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl bg-card border border-border w-full cursor-pointer select-none"
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
        style={{ boxShadow: `0 0 40px ${color}15 inset, 0 0 0 1px ${color}30` }}
      />

      {/* Cover / Hero area */}
      <div className="relative w-full aspect-[5/4] overflow-hidden rounded-t-2xl border-b border-border/50 bg-muted/20">
        {hasCover ? (
          <>
            {/* Ambient colored glow */}
            <div
              className="absolute inset-0 opacity-25"
              style={{
                background: `radial-gradient(circle at 50% 30%, ${color}90 0%, transparent 75%)`
              }}
            />
            {/* Blurred background from first cover */}
            <div
              className="absolute inset-0 scale-[1.1] blur-[22px] opacity-[0.2] mix-blend-overlay dark:mix-blend-screen pointer-events-none"
              style={{
                backgroundImage: `url(${covers[0]})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            {/* Cover display */}
            <div className="absolute inset-0 flex items-center justify-center p-3">
              {covers.length === 1 ? (
                <SingleBookMockup cover={covers[0]} color={color} />
              ) : (
                <MultiBookFanStack covers={covers} color={color} totalBooks={count} />
              )}
            </div>
          </>
        ) : (
          /* Rich 3D Bookshelf Empty State */
          <EmptyShelfMockup
            icon={Icon}
            color={color}
            onAddBooks={onAddBooks}
            isSmart={shelf.isSmart}
          />
        )}

        {/* Gradient overlay bottom */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background/80 to-transparent opacity-50 pointer-events-none" />

        {/* Top Badges & Actions */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-auto z-20">
          {/* Smart badge */}
          {shelf.isSmart ? (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase backdrop-blur-md shadow-md"
              style={{ background: `${color}30`, border: `1px solid ${color}40`, color }}
            >
              <Zap className="w-3 h-3" />
              Smart
            </div>
          ) : isFavorite ? (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase backdrop-blur-md shadow-md bg-rose-500/20 border border-rose-500/30 text-rose-400"
            >
              <Heart className="w-3 h-3 fill-current" />
              Fav
            </div>
          ) : <div />}

          {/* 3-Dots Action Dropdown */}
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Shelf actions"
                  className={cn(
                    "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center bg-background/80 hover:bg-background border border-border/50 text-foreground/80 hover:text-foreground backdrop-blur-md shadow-sm transition-all duration-200 cursor-pointer active:scale-95",
                    isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                  )}
                >
                  <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 p-1.5 rounded-2xl bg-popover text-popover-foreground border border-border shadow-2xl z-[150]">
                {onEdit && !isFavorite && !shelf.isSmart && (
                  <DropdownMenuItem
                    onClick={onEdit}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl cursor-pointer hover:bg-muted"
                  >
                    <Edit className="w-3.5 h-3.5 text-primary" />
                    <span>Edit Shelf</span>
                  </DropdownMenuItem>
                )}
                {onAddBooks && !shelf.isSmart && (
                  <DropdownMenuItem
                    onClick={onAddBooks}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl cursor-pointer hover:bg-muted"
                  >
                    <Plus className="w-3.5 h-3.5 text-primary" />
                    <span>Add Books</span>
                  </DropdownMenuItem>
                )}
                {onDelete && !isFavorite && !shelf.isSmart && (
                  <>
                    <DropdownMenuSeparator className="my-1 bg-border/50" />
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl cursor-pointer text-destructive hover:bg-destructive/15 focus:bg-destructive/15"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      <span>Delete Shelf</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Info footer */}
      <div className="relative z-10 p-3 sm:p-4 flex items-center justify-between bg-card">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="font-bold text-sm sm:text-base text-foreground truncate transition-colors leading-tight">
            {shelf.name}
          </h3>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 font-medium flex items-center gap-1.5">
            <span>{count} {count === 1 ? 'book' : 'books'}</span>
            {shelf.description && (
              <>
                <span className="opacity-40">•</span>
                <span className="truncate opacity-75">{shelf.description}</span>
              </>
            )}
          </p>
        </div>

        <div
          className="ml-2 shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0"
          style={{ background: `${color}20`, color }}
        >
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>

      {/* Bottom color line */}
      <div
        className="absolute bottom-0 inset-x-0 h-0.5 opacity-0 group-hover:opacity-70 transition-opacity duration-300"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
    </motion.div>
  );

  if (!onEdit && !onDelete) return button;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {button}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[160px] bg-popover text-popover-foreground backdrop-blur-md border border-border rounded-xl shadow-2xl p-1.5 z-50 text-sm animate-in fade-in zoom-in-95 duration-200"
        >
          {onEdit && (
            <ContextMenu.Item
              className="flex items-center px-3 py-2 rounded-lg cursor-pointer outline-none transition-all duration-150 select-none hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground text-foreground/90"
              onSelect={onEdit}
            >
              <Edit className="w-4 h-4 mr-2.5" />
              <span className="font-medium tracking-tight">Edit Shelf</span>
            </ContextMenu.Item>
          )}
          {onAddBooks && (
            <ContextMenu.Item
              className="flex items-center px-3 py-2 rounded-lg cursor-pointer outline-none transition-all duration-150 select-none hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground text-foreground/90"
              onSelect={onAddBooks}
            >
              <Plus className="w-4 h-4 mr-2.5" />
              <span className="font-medium tracking-tight">Add Books</span>
            </ContextMenu.Item>
          )}
          {onDelete && (
            <>
              {(onEdit || onAddBooks) && <ContextMenu.Separator className="h-px bg-border/50 my-1.5 mx-1" />}
              <ContextMenu.Item
                className="flex items-center px-3 py-2 rounded-lg cursor-pointer outline-none transition-all duration-150 select-none hover:bg-destructive/15 focus:bg-destructive/15 text-destructive"
                onSelect={onDelete}
              >
                <Trash2 className="w-4 h-4 mr-2.5" />
                <span className="font-medium tracking-tight">Delete Shelf</span>
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function ShelfGrid({
  shelves,
  onSelectShelf,
  onCreateShelf,
  onEditShelf,
  onDeleteShelf,
  onAddBooks,
}: ShelfGridProps) {
  const [shelfCovers, setShelfCovers] = useState<ShelfCovers>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<ShelfFilterType>('all');
  const [sortType, setSortType] = useState<ShelfSortType>('name-asc');

  const flattenShelves = (shelfs: Shelf[]): Shelf[] => {
    let result: Shelf[] = [];
    if (!shelfs) return result;
    for (const shelf of shelfs) {
      if (!shelf) continue;
      result.push(shelf);
      if (shelf.children && shelf.children.length > 0) {
        result = result.concat(flattenShelves(shelf.children));
      }
    }
    return result;
  };

  const allShelves = useMemo(() => flattenShelves(shelves || []), [shelves]);

  // Load book covers for each shelf
  useEffect(() => {
    let cancelled = false;

    async function loadCovers() {
      const results: ShelfCovers = {};

      await Promise.allSettled(
        allShelves
          .filter(s => s.id !== undefined)
          .map(async (shelf) => {
            try {
              const books = await api.getShelfBooks(shelf.id!);
              const coverPaths = books
                .filter(b => b.cover_path)
                .slice(0, 3)
                .map(b => {
                  const p = b.cover_path!;
                  if (p.startsWith('http://') || p.startsWith('https://')) return p;
                  return convertFileSrc(p.replace(/\\/g, '/'));
                });
              if (!cancelled) {
                results[shelf.id!] = coverPaths;
              }
            } catch {
              if (!cancelled) results[shelf.id!] = [];
            }
          })
      );

      if (!cancelled) setShelfCovers(results);
    }

    if (allShelves.length > 0) loadCovers();

    return () => { cancelled = true; };
  }, [allShelves]);

  // Filter & Sort Shelves
  const filteredAndSortedShelves = useMemo(() => {
    let list = [...allShelves];

    // Filter by type
    if (filterType === 'favorites') {
      list = list.filter(s => s.shelfType === 'favorites');
    } else if (filterType === 'smart') {
      list = list.filter(s => s.isSmart);
    } else if (filterType === 'with-books') {
      list = list.filter(s => (s.bookCount ?? 0) > 0);
    } else if (filterType === 'empty') {
      list = list.filter(s => (s.bookCount ?? 0) === 0);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s => 
        s.name.toLowerCase().includes(q) || 
        (s.description && s.description.toLowerCase().includes(q))
      );
    }

    // Sort
    list.sort((a, b) => {
      if (sortType === 'name-asc') {
        return a.name.localeCompare(b.name);
      } else if (sortType === 'name-desc') {
        return b.name.localeCompare(a.name);
      } else if (sortType === 'books-desc') {
        return (b.bookCount ?? 0) - (a.bookCount ?? 0);
      } else if (sortType === 'books-asc') {
        return (a.bookCount ?? 0) - (b.bookCount ?? 0);
      } else if (sortType === 'newest') {
        return (b.id ?? 0) - (a.id ?? 0);
      }
      return 0;
    });

    return list;
  }, [allShelves, filterType, searchQuery, sortType]);

  const counts = useMemo(() => {
    return {
      all: allShelves.length,
      favorites: allShelves.filter(s => s.shelfType === 'favorites').length,
      smart: allShelves.filter(s => s.isSmart).length,
      withBooks: allShelves.filter(s => (s.bookCount ?? 0) > 0).length,
      empty: allShelves.filter(s => (s.bookCount ?? 0) === 0).length,
    };
  }, [allShelves]);

  return (
    <div 
      className="p-4 sm:p-6 md:p-8 h-full overflow-y-auto overflow-x-hidden w-full relative custom-scrollbar pb-28 md:pb-8"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 16px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 16px)'
      }}
    >
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/3 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] bg-purple-500/4 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-[1440px] mx-auto relative z-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <p className="text-[11px] sm:text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase mb-1.5 sm:mb-2">
              Your Collection
            </p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground leading-none">
              Shelves
            </h1>
            {allShelves.length > 0 && (
              <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                {allShelves.length} {allShelves.length === 1 ? 'shelf' : 'shelves'}
                {searchQuery || filterType !== 'all' ? ` · showing ${filteredAndSortedShelves.length}` : ''}
              </p>
            )}
          </div>

          {onCreateShelf && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={onCreateShelf}
              className="group self-start sm:self-auto flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 shadow-md shadow-primary/20 transition-all duration-300 cursor-pointer active:scale-95"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90" />
              New Shelf
            </motion.button>
          )}
        </div>

        {/* Search, Filter & Sort Controls Toolbar */}
        {allShelves.length > 0 && (
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-6 p-2 rounded-2xl bg-card/60 border border-border/50 backdrop-blur-xl">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-full md:max-w-md group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Search shelves..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-8 py-2 text-xs sm:text-sm font-semibold bg-background/80 border border-border/50 focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl outline-none transition-all placeholder:text-muted-foreground/60 text-foreground"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-md"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Chips & Sort Controls */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
              {/* Filter Chips */}
              <div className="flex items-center gap-1 bg-background/80 p-1 rounded-xl border border-border/50 shrink-0">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    filterType === 'all'
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  All ({counts.all})
                </button>
                {counts.favorites > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterType('favorites')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                      filterType === 'favorites'
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <Heart className="w-3 h-3 fill-current" />
                    Fav
                  </button>
                )}
                {counts.smart > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterType('smart')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                      filterType === 'smart'
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <Zap className="w-3 h-3" />
                    Smart ({counts.smart})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFilterType('with-books')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    filterType === 'with-books'
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  With Books ({counts.withBooks})
                </button>
                {counts.empty > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterType('empty')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                      filterType === 'empty'
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    Empty ({counts.empty})
                  </button>
                )}
              </div>

              {/* Sort Selector Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-background/80 hover:bg-background border border-border/50 text-xs font-bold text-foreground transition-all shrink-0 cursor-pointer shadow-xs"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-primary" />
                    <span className="hidden sm:inline">Sort:</span>
                    <span className="capitalize">
                      {sortType === 'name-asc' ? 'A–Z' :
                       sortType === 'name-desc' ? 'Z–A' :
                       sortType === 'books-desc' ? 'Most Books' :
                       sortType === 'books-asc' ? 'Fewest Books' : 'Newest'}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 p-1.5 rounded-2xl bg-popover text-popover-foreground border border-border shadow-2xl z-[150]">
                  <DropdownMenuItem onClick={() => setSortType('name-asc')} className="text-xs font-semibold py-2 rounded-xl cursor-pointer">
                    Name (A–Z)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortType('name-desc')} className="text-xs font-semibold py-2 rounded-xl cursor-pointer">
                    Name (Z–A)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortType('books-desc')} className="text-xs font-semibold py-2 rounded-xl cursor-pointer">
                    Most Books
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortType('books-asc')} className="text-xs font-semibold py-2 rounded-xl cursor-pointer">
                    Fewest Books
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortType('newest')} className="text-xs font-semibold py-2 rounded-xl cursor-pointer">
                    Recently Created
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {/* Shelves grid */}
        <AnimatePresence>
          {filteredAndSortedShelves.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 md:gap-5">
              {filteredAndSortedShelves.map((shelf, idx) => (
                <ShelfCard
                  key={shelf.id || idx}
                  shelf={shelf}
                  covers={shelfCovers[shelf.id!] || []}
                  onClick={() => onSelectShelf(shelf)}
                  onEdit={onEditShelf && shelf.shelfType !== 'favorites' && !shelf.isSmart ? () => onEditShelf(shelf) : undefined}
                  onDelete={onDeleteShelf && shelf.shelfType !== 'favorites' && !shelf.isSmart ? () => onDeleteShelf(shelf) : undefined}
                  onAddBooks={onAddBooks && !shelf.isSmart ? () => onAddBooks(shelf) : undefined}
                  delay={idx}
                />
              ))}

              {/* Add new shelf card */}
              {onCreateShelf && !searchQuery && filterType === 'all' && (
                <motion.button
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(filteredAndSortedShelves.length * 0.05, 0.4) + 0.05, duration: 0.4 }}
                  onClick={onCreateShelf}
                  className="group relative flex flex-col text-left rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl bg-card/40 hover:bg-card border border-dashed border-border/70 hover:border-primary/50 w-full cursor-pointer select-none"
                >
                  <div className="relative w-full aspect-[5/4] flex flex-col items-center justify-center p-4">
                    <div className="w-12 h-12 rounded-2xl bg-secondary/80 border border-border/60 flex items-center justify-center group-hover:bg-primary/15 group-hover:border-primary/40 group-hover:scale-110 transition-all duration-300 shadow-xs">
                      <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                  <div className="relative z-10 p-3 sm:p-4 bg-card/60 border-t border-border/40 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm sm:text-base text-foreground group-hover:text-primary transition-colors leading-tight">
                        New Shelf
                      </h3>
                      <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 font-medium">
                        Create collection
                      </p>
                    </div>
                  </div>
                </motion.button>
              )}
            </div>
          ) : allShelves.length > 0 ? (
            /* No search results */
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border flex items-center justify-center mb-3">
                <Search className="w-6 h-6 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-1">No matching shelves</h2>
              <p className="text-muted-foreground text-xs max-w-xs mb-4">
                No shelves found matching &quot;{searchQuery}&quot; with filter &quot;{filterType}&quot;.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterType('all');
                }}
                className="px-4 py-2 rounded-full text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer"
              >
                Clear filters
              </button>
            </motion.div>
          ) : (
            /* Empty state (zero total shelves) */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-32 text-center"
            >
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-primary/10 blur-[40px] rounded-full scale-150" />
                <div className="relative w-20 h-20 rounded-2xl bg-muted border border-border flex items-center justify-center">
                  <BookOpen className="w-9 h-9 text-muted-foreground" strokeWidth={1.5} />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-3 tracking-tight">No shelves yet</h2>
              <p className="text-muted-foreground text-sm max-w-xs leading-relaxed mb-8">
                Organize your reading collection by creating shelves — group books by genre, series, or any theme you like.
              </p>
              {onCreateShelf && (
                <button
                  onClick={onCreateShelf}
                  className="flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_30px_rgba(var(--primary),0.3)] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Create your first shelf
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
