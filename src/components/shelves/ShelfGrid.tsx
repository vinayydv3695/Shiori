import React, { useState, useEffect } from 'react';
import { Shelf, api } from '../../lib/tauri';
import * as ContextMenu from '@radix-ui/react-context-menu';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { convertFileSrc } from '@tauri-apps/api/core';

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
    <div className="relative w-full h-full flex items-center justify-center" style={{ perspective: '1000px' }}>
      {covers.slice(0, 3).reverse().map((cover, i) => {
        const revIdx = Math.min(covers.length - 1, 2) - i;
        
        let offset = 0;
        let rotate = 0;
        let rotateY = 0;
        const scale = 1 - revIdx * 0.06;
        const opacity = 1 - revIdx * 0.1;
        
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
          <img
            key={i}
            src={cover}
            alt=""
            className="absolute w-auto h-full max-w-full object-cover rounded-xl"
            style={{
              transform: `translateX(${offset}px) scale(${scale}) rotate(${rotate}deg) rotateY(${rotateY}deg)`,
              opacity,
              zIndex: 10 - revIdx,
              boxShadow: revIdx === 0 
                ? `0 10px 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.15)`
                : `0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)`,
            }}
          />
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
    : shelf.isSmart ? Zap : (shelf.shelfType === 'favorites' ? Heart : BookMarked);

  const color = shelf.color || (shelf.shelfType === 'favorites' ? '#f43f5e' : shelf.isSmart ? '#a855f7' : '#6366f1');
  const count = shelf.bookCount ?? 0;
  const hasCover = covers.length > 0;

  const button = (
    <motion.button
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(delay * 0.07, 0.5), duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      onClick={onClick}
      className="group relative flex flex-col text-left rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl bg-card border border-border w-full"
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
              className="absolute inset-0 opacity-20"
              style={{
                background: `radial-gradient(circle at 50% 30%, ${color}80 0%, transparent 75%)`
              }}
            />
            {/* Blurred background from first cover */}
            <div
              className="absolute inset-0 scale-[1.1] blur-[20px] opacity-[0.15] mix-blend-overlay dark:mix-blend-screen"
              style={{
                backgroundImage: `url(${covers[0]})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            {/* Cover stack in center - Made much larger to reduce free space */}
            <div className="absolute inset-0 flex items-center justify-center p-4 pt-6 pb-2">
              <div className="relative w-[70%] h-[95%]">
                <CoverStack covers={covers} color={color} />
              </div>
            </div>
          </>
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
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
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background/80 to-transparent opacity-50" />

        {/* Smart badge */}
        {shelf.isSmart && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase backdrop-blur-md shadow-lg"
            style={{ background: `${color}30`, border: `1px solid ${color}40`, color }}>
            <Zap className="w-3 h-3" />
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
        className="absolute bottom-0 inset-x-0 h-0.5 opacity-0 group-hover:opacity-60 transition-opacity duration-300"
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
  const [shelfCovers, setShelfCovers] = useState<ShelfCovers>({});

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

  const allShelves = flattenShelves(shelves || []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelves]);

  return (
    <div className="p-6 md:p-8 h-full overflow-y-auto w-full relative custom-scrollbar">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/3 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] bg-purple-500/4 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-[1440px] mx-auto relative z-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase mb-2">
              Your Collection
            </p>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground leading-none">
              Shelves
            </h1>
            {allShelves.length > 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                {allShelves.length} {allShelves.length === 1 ? 'shelf' : 'shelves'}
              </p>
            )}
          </div>

          {onCreateShelf && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={onCreateShelf}
              className="group flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground transition-all duration-300 border border-border bg-card hover:bg-muted"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90" />
              New Shelf
            </motion.button>
          )}
        </div>

        {/* Shelves grid */}
            {/* Shelves grid */}
        <AnimatePresence>
          {allShelves.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 md:gap-5">
              {allShelves.map((shelf, idx) => (
                <ShelfCard
                  key={shelf.id || idx}
                  shelf={shelf}
                  covers={shelfCovers[shelf.id!] || []}
                  onClick={() => onSelectShelf(shelf)}
                  onEdit={onEditShelf && shelf.shelfType !== 'favorites' && !shelf.isSmart ? () => onEditShelf(shelf) : undefined}
                  onDelete={onDeleteShelf && shelf.shelfType !== 'favorites' && !shelf.isSmart ? () => onDeleteShelf(shelf) : undefined}
                  delay={idx}
                />
              ))}

              {/* Add new shelf card */}
              {onCreateShelf && (
                <motion.button
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(allShelves.length * 0.07, 0.5) + 0.05, duration: 0.5 }}
                  onClick={onCreateShelf}
                  className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed transition-all duration-300 h-full min-h-[200px] border-border hover:border-primary/50 hover:bg-muted"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center group-hover:bg-primary/20 group-hover:border-primary/50 transition-all duration-300">
                    <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">New Shelf</span>
                </motion.button>
              )}
            </div>
          ) : (
            /* Empty state */
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
              <p className="text-muted-foreground text-sm max-w-xs leading-relaxed mb-10">
                Organize your reading collection by creating shelves — group books by genre, series, or any theme you like.
              </p>
              {onCreateShelf && (
                <button
                  onClick={onCreateShelf}
                  className="flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_30px_rgba(var(--primary),0.3)]"
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
