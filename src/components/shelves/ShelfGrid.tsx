import React, { useState, useEffect, useCallback } from 'react';
import { Shelf, api, Book } from '../../lib/tauri';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { 
  Folder, 
  Sparkles, 
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { convertFileSrc } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';

const PRESET_ICONS: Record<string, React.ElementType> = {
  library: Library,
  star: Star,
  heart: Heart,
  bookmark: Bookmark,
  bookopen: BookOpen,
  target: Target,
  sparkles: Sparkles,
  lightbulb: Lightbulb,
  palette: Palette,
  flame: Flame,
};

interface ShelfGridProps {
  shelves: Shelf[];
  onSelectShelf: (shelf: Shelf) => void;
  onCreateShelf?: () => void;
  onEditShelf?: (shelf: Shelf) => void;
  onDeleteShelf?: (shelf: Shelf) => void;
}

interface ShelfCovers {
  [shelfId: number]: string[];
}

function CoverStack({ covers, color }: { covers: string[]; color: string }) {
  if (covers.length === 0) return null;

  return (
    <div className="relative w-full h-full flex items-center justify-center" style={{ perspective: '1200px' }}>
      {covers.slice(0, 3).reverse().map((cover, i) => {
        const revIdx = Math.min(covers.length - 1, 2) - i;
        
        let offset = 0;
        let rotate = 0;
        let rotateY = 0;
        let scale = 1 - revIdx * 0.06;
        let opacity = 1 - revIdx * 0.15;
        
        if (revIdx === 1) {
          offset = -20;
          rotate = -6;
          rotateY = -12;
        } else if (revIdx === 2) {
          offset = 20;
          rotate = 6;
          rotateY = 12;
        }

        return (
          <div
            key={i}
            className="absolute rounded-xl overflow-hidden bg-muted group-hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] transition-all duration-500 ease-out"
            style={{
              transform: `translateX(${offset}px) scale(${scale}) rotate(${rotate}deg) rotateY(${rotateY}deg)`,
              opacity,
              zIndex: 10 - revIdx,
              boxShadow: revIdx === 0 
                ? `0 10px 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.15)`
                : `0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)`,
              aspectRatio: '2/3',
              height: '100%'
            }}
          >
            <img
              src={cover}
              alt=""
              className="w-full h-full object-cover"
            />
            {/* Premium Inner Sheen / Glare */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/30 pointer-events-none mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] pointer-events-none z-20" />
          </div>
        );
      })}
    </div>
  );
}

function ShelfCard({
  shelf,
  covers,
  onClick,
  onEdit,
  onDelete,
  delay,
}: {
  shelf: Shelf;
  covers: string[];
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  delay: number;
}) {
  const Icon = shelf.icon && PRESET_ICONS[shelf.icon]
    ? PRESET_ICONS[shelf.icon]
    : shelf.isSmart ? Sparkles : (shelf.shelfType === 'favorites' ? Heart : BookMarked);

  const color = shelf.color || (shelf.shelfType === 'favorites' ? '#f43f5e' : shelf.isSmart ? '#a855f7' : '#6366f1');
  const count = shelf.bookCount ?? 0;
  const hasCover = covers.length > 0;

  const button = (
    <motion.button
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(delay * 0.07, 0.5), duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      onClick={onClick}
      className={cn(
        "group relative flex flex-col text-left rounded-xl overflow-hidden w-full cursor-pointer select-none",
        "transition-all duration-[400ms] cubic-bezier(0.25, 1, 0.5, 1)",
        "bg-card/90 backdrop-blur-lg border border-border/40",
        "shadow-lg dark:shadow-[0_8px_20px_rgba(0,0,0,0.8)] ring-1 ring-black/10 dark:ring-white/10 hover:shadow-2xl hover:shadow-primary/20 dark:hover:shadow-primary/10 hover:-translate-y-1.5 hover:ring-black/20 dark:hover:ring-white/20"
      )}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl"
        style={{ boxShadow: `0 0 40px ${color}15 inset, 0 0 0 1px ${color}30` }}
      />

      {/* Cover / Hero area */}
      <div className="relative w-full aspect-[5/4] overflow-hidden rounded-t-xl border-b border-border/50 bg-muted/20">
        {hasCover ? (
          <>
            {/* Ambient colored glow */}
            <div
              className="absolute inset-0 opacity-20 transition-opacity duration-500 group-hover:opacity-40"
              style={{
                background: `radial-gradient(circle at 50% 30%, ${color}80 0%, transparent 75%)`
              }}
            />
            {/* Blurred background from first cover */}
            <div
              className="absolute inset-0 scale-[1.15] blur-[24px] opacity-[0.25] mix-blend-overlay dark:mix-blend-screen transition-transform duration-700 group-hover:scale-[1.2]"
              style={{
                backgroundImage: `url(${covers[0]})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            {/* Cover stack in center - Made much larger to reduce free space */}
            <div className="absolute inset-0 flex items-center justify-center p-4 pt-6 pb-2 transition-transform duration-500 group-hover:-translate-y-1">
              <div className="relative w-[70%] h-[95%]">
                <CoverStack covers={covers} color={color} />
              </div>
            </div>
          </>
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center transition-transform duration-500 group-hover:scale-105"
            style={{ background: `radial-gradient(circle at 50% 50%, ${color}15, transparent 70%)` }}
          >
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center border shadow-lg transition-transform group-hover:scale-110"
              style={{ background: `${color}10`, borderColor: `${color}30`, color, boxShadow: `0 8px 32px ${color}15` }}
            >
              <Icon className="w-10 h-10 opacity-80" strokeWidth={1.5} />
            </div>
          </div>
        )}

        {/* Gradient overlay bottom */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-card/80 to-transparent opacity-80 pointer-events-none" />

        {/* Smart badge */}
        {shelf.isSmart && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase backdrop-blur-md shadow-lg"
            style={{ background: `${color}30`, border: `1px solid ${color}40`, color }}>
            <Sparkles className="w-3 h-3" />
            Smart
          </div>
        )}
      </div>

      {/* Info footer */}
      <div className="relative z-10 p-5 flex items-center justify-between bg-card">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="font-bold text-base text-foreground truncate transition-colors leading-tight">
            {shelf.name}
          </h3>
          <p className="text-xs mt-0.5 font-medium text-muted-foreground">
            {count} {count === 1 ? 'book' : 'books'}
          </p>
        </div>

        <div
          className="ml-3 shrink-0 w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0"
          style={{ background: `${color}20`, color }}
        >
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>

      {/* Bottom color line */}
      <div
        className="absolute bottom-0 inset-x-0 h-1 opacity-0 group-hover:opacity-80 transition-opacity duration-300 rounded-b-xl"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
    </motion.button>
  );

  if (!onEdit && !onDelete) return button;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {button}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[160px] bg-background/80 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl p-1.5 z-50 text-sm animate-in fade-in zoom-in-95 duration-200"
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
          {onDelete && (
            <>
              {onEdit && <ContextMenu.Separator className="h-px bg-border/50 my-1.5 mx-1" />}
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

export function ShelfGrid({ shelves, onSelectShelf, onCreateShelf, onEditShelf, onDeleteShelf }: ShelfGridProps) {
  const [covers, setCovers] = useState<ShelfCovers>({});

  // Fetch covers for each shelf
  useEffect(() => {
    async function loadCovers() {
      const newCovers: ShelfCovers = {};
      
      for (const shelf of shelves) {
        if (!shelf.id) continue;
        
        try {
          let shelfBooks = await api.getShelfBooks(shelf.id);
          
          if (shelfBooks && shelfBooks.length > 0) {
            // Get up to 3 covers, fallback to empty string if no cover
            const shelfCovers = shelfBooks
              .filter((b: Book) => b.cover_path)
              .slice(0, 3)
              .map((b: Book) => {
                const p = b.cover_path!;
                if (p.startsWith('http://') || p.startsWith('https://')) return p;
                return convertFileSrc(p.replace(/\\\\/g, '/'));
              });
              
            newCovers[shelf.id] = shelfCovers;
          }
        } catch (error) {
          console.error(`Failed to load covers for shelf ${shelf.id}:`, error);
        }
      }
      
      setCovers(newCovers);
    }
    
    loadCovers();
  }, [shelves]);

  return (
    <div className="p-4 sm:p-8 h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <div className="text-[11px] font-bold tracking-[0.2em] text-muted-foreground uppercase mb-3">
              Your Collection
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground" style={{ fontFamily: 'var(--font-serif)', letterSpacing: '-0.02em' }}>
              Shelves
            </h1>
            <p className="text-muted-foreground mt-2 font-medium">
              {shelves.length} {shelves.length === 1 ? 'shelf' : 'shelves'}
            </p>
          </div>
          
          {onCreateShelf && (
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onCreateShelf}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-semibold"
            >
              <Plus className="w-5 h-5" />
              <span>New Shelf</span>
            </motion.button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 sm:gap-8 pb-12">
          {shelves.map((shelf, i) => (
            <ShelfCard 
              key={shelf.id || `temp-${i}`}
              shelf={shelf} 
              covers={covers[shelf.id!] || []} 
              onClick={() => onSelectShelf(shelf)}
              onEdit={onEditShelf ? () => onEditShelf(shelf) : undefined}
              onDelete={onDeleteShelf ? () => onDeleteShelf(shelf) : undefined}
              delay={i}
            />
          ))}
          
          {onCreateShelf && (
            <motion.button
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(shelves.length * 0.07, 0.5), duration: 0.5 }}
              onClick={onCreateShelf}
              className="group relative flex flex-col items-center justify-center h-full min-h-[300px] rounded-xl border-2 border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              <div className="w-14 h-14 rounded-full bg-border/50 group-hover:bg-primary/20 flex items-center justify-center transition-colors mb-4 text-muted-foreground group-hover:text-primary">
                <Plus className="w-6 h-6" />
              </div>
              <span className="font-medium text-muted-foreground group-hover:text-primary transition-colors">
                New Shelf
              </span>
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
