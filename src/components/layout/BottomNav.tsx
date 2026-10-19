import { useState, useMemo } from 'react'
import { 
  Home, 
  Library, 
  Compass, 
  Settings, 
  NotebookPen, 
  Menu, 
  BarChart2, 
  Rss, 
  Trash2, 
  History, 
  Bookmark, 
  Moon, 
  Sun,
  BookOpen,
  User,
  ShoppingBag,
  Search,
  LogOut
} from 'lucide-react'
import { AniListIcon, TorboxIcon } from '@/components/icons'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { BookshelfIcon } from '@/components/icons'
import { cn } from '@/lib/utils'
import type { CurrentView } from '@/store/uiStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useTorboxStore } from '@/store/useTorboxStore'
import { useTheme } from '@/hooks/useTheme'
import { useLibraryStore, EMPTY_FILTERS } from '@/store/libraryStore'
import { IS_STORE_BUILD } from '@/lib/storeConfig'
import { isAndroid } from '@/lib/tauri'
import { motion, AnimatePresence } from 'framer-motion'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.2, type: "spring" as const, stiffness: 350, damping: 24 }
  },
}

interface BottomNavProps {
  currentView: CurrentView
  onNavigateToView: (view: CurrentView) => void
  onOpenSettings: () => void
  onToggleDrawer: () => void
}

export function BottomNav({
  currentView,
  onNavigateToView,
  onOpenSettings,
  onToggleDrawer
}: BottomNavProps) {
  const preferredContentType = usePreferencesStore(s => s.preferences?.preferredContentType);
  const hasTorboxKey = useTorboxStore(s => s.hasApiKey);
  const { isDark, toggleTheme } = useTheme();
  const [isAndroidMoreOpen, setIsAndroidMoreOpen] = useState(false);

interface AndroidMoreItem {
  id: string;
  label: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  bgClass: string;
  onClick: () => void;
}

  // 3-Column circular grid items for Android matching media_1792385306724_e66bd916.png
  const androidMoreItems = useMemo(() => {
    // Primary 9 items exactly matching the 3x3 layout of media_1792385306724_e66bd916.png:
    // Row 1: Bookshelf | Bookmarks | Profile
    // Row 2: Reading now | Store | Dark mode
    // Row 3: Search | Settings | Log out
    const items: AndroidMoreItem[] = [
      {
        id: 'shelves',
        label: 'Bookshelf',
        subtitle: 'Shelves',
        icon: BookOpen,
        bgClass: 'bg-[#FDEBE3] dark:bg-rose-950/40',
        onClick: () => onNavigateToView('shelves'),
      },
      {
        id: 'favorites',
        label: 'Bookmarks',
        subtitle: 'Favorites',
        icon: Bookmark,
        bgClass: 'bg-[#E3F2FD] dark:bg-sky-950/40',
        onClick: () => {
          useLibraryStore.getState().setActiveFilters({
            ...EMPTY_FILTERS,
            isFavorite: true,
          });
          onNavigateToView('library');
        },
      },
      {
        id: 'profile',
        label: 'Profile',
        subtitle: 'Insights',
        icon: User,
        bgClass: 'bg-[#FFF3E0] dark:bg-amber-950/40',
        onClick: () => onNavigateToView('statistics'),
      },
      {
        id: 'history',
        label: 'Reading now',
        subtitle: 'History',
        icon: History,
        bgClass: 'bg-[#E8F5E9] dark:bg-emerald-950/40',
        onClick: () => onNavigateToView('history'),
      },
      {
        id: 'store',
        label: 'Store',
        subtitle: 'Browse',
        icon: ShoppingBag,
        bgClass: 'bg-[#FDFBE7] dark:bg-yellow-950/40',
        onClick: () => {
          if (IS_STORE_BUILD) {
            onNavigateToView('online-books');
            return;
          }
          onNavigateToView(preferredContentType === 'manga' ? 'online-manga' : 'online-books');
        },
      },
      {
        id: 'dark-mode',
        label: 'Dark mode',
        subtitle: isDark ? 'On' : 'Off',
        icon: Moon,
        bgClass: 'bg-[#EDE7F6] dark:bg-purple-950/40',
        onClick: () => toggleTheme(),
      },
      {
        id: 'search',
        label: 'Search',
        subtitle: 'Find',
        icon: Search,
        bgClass: 'bg-[#ECEFF1] dark:bg-slate-800/60',
        onClick: () => {
          useLibraryStore.getState().clearFilters();
          onNavigateToView('library');
        },
      },
      {
        id: 'settings',
        label: 'Settings',
        subtitle: 'App',
        icon: Settings,
        bgClass: 'bg-[#FCE4EC] dark:bg-pink-950/40',
        onClick: () => onOpenSettings(),
      },
      {
        id: 'logout',
        label: 'Log out',
        subtitle: 'Recycle',
        icon: LogOut,
        bgClass: 'bg-[#FFEBEE] dark:bg-red-950/40',
        onClick: () => onNavigateToView('recycle-bin'),
      },
    ];

    // Secondary items from Shiori desktop menu (Annotations, RSS Feeds, AniList, Torbox)
    if (preferredContentType === 'books' || preferredContentType === 'both') {
      items.push({
        id: 'annotations',
        label: 'Annotations',
        subtitle: 'Notes',
        icon: NotebookPen,
        bgClass: 'bg-[#E0F2F1] dark:bg-teal-950/40',
        onClick: () => onNavigateToView('annotations'),
      });
    }

    if (preferredContentType !== 'books') {
      items.push({
        id: 'anilist',
        label: 'AniList',
        subtitle: 'Tracker',
        icon: AniListIcon,
        bgClass: 'bg-[#E3F2FD] dark:bg-blue-950/40',
        onClick: () => onNavigateToView('anilist'),
      });

      if (!IS_STORE_BUILD && hasTorboxKey) {
        items.push({
          id: 'torbox',
          label: 'Torbox',
          subtitle: 'Debrid',
          icon: TorboxIcon,
          bgClass: 'bg-[#EDE7F6] dark:bg-violet-950/40',
          onClick: () => onNavigateToView('torbox-discover'),
        });
      }
    }

    items.push({
      id: 'rss',
      label: 'RSS Feeds',
      subtitle: 'News',
      icon: Rss,
      bgClass: 'bg-[#FFF3E0] dark:bg-orange-950/40',
      onClick: () => onNavigateToView('rss-articles'),
    });

    items.push({
      id: 'recycle-bin',
      label: 'Trash',
      subtitle: 'Bin',
      icon: Trash2,
      bgClass: 'bg-[#FFEBEE] dark:bg-red-950/40',
      onClick: () => onNavigateToView('recycle-bin'),
    });

    return items;
  }, [preferredContentType, hasTorboxKey, isDark, toggleTheme, onNavigateToView, onOpenSettings]);

  return (
    <>
      <nav 
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around min-h-[64px] bg-background md:hidden border-t border-border/50 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] outline-none ring-0"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)'
        }}
      >
        <NavItem
          icon={<Home className="w-[26px] h-[26px]" />}
          label="Home"
          isActive={currentView === 'home'}
          onClick={() => {
            setIsAndroidMoreOpen(false);
            onNavigateToView('home');
          }}
        />
        <NavItem
          icon={<Library className="w-[26px] h-[26px]" />}
          label="Library"
          isActive={currentView === 'library'}
          onClick={() => {
            setIsAndroidMoreOpen(false);
            onNavigateToView('library');
          }}
        />
        <NavItem
          icon={<Compass className="w-[26px] h-[26px]" />}
          label="Browse"
          isActive={currentView === 'online-books' || currentView === 'online-manga'}
          onClick={() => {
            setIsAndroidMoreOpen(false);
            if (IS_STORE_BUILD) {
              onNavigateToView('online-books');
              return;
            }
            onNavigateToView(preferredContentType === 'manga' ? 'online-manga' : 'online-books');
          }}
        />

        {/* More Trigger: On Android opens bottom sheet; on desktop opens dropdown */}
        {isAndroid ? (
          <button
            type="button"
            aria-label="More"
            onClick={() => setIsAndroidMoreOpen((prev) => !prev)}
            className={cn(
              "relative flex flex-col items-center justify-center w-full h-full transition-all duration-300 ease-out group gap-1 active:scale-95 cursor-pointer",
              isAndroidMoreOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className={cn(
              "flex items-center justify-center w-14 h-8 rounded-full transition-all duration-300",
              isAndroidMoreOpen ? "bg-primary/15" : "bg-transparent group-hover:bg-primary/5"
            )}>
              <Menu className="w-[26px] h-[26px]" />
            </div>
            <span className="text-[11px] font-semibold tracking-wide leading-none transition-all duration-300 hidden sm:block opacity-70">
              More
            </span>
          </button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="More" className="flex flex-col items-center justify-center w-full h-full gap-1 text-muted-foreground hover:text-foreground transition-all duration-300 active:scale-95 cursor-pointer">
                <Menu className="w-[26px] h-[26px]" />
                <span className="text-[11px] font-medium hidden sm:block">More</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="end" 
              side="top"
              sideOffset={20}
              asChild
            >
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="w-56 rounded-2xl border-border/50 shadow-2xl bg-background p-2 mb-2"
              >
                <DropdownMenuItem asChild onClick={() => onNavigateToView('shelves')}>
                  <motion.div variants={itemVariants} className="gap-3 p-3 cursor-pointer rounded-xl flex items-center transition-all duration-200">
                    <div className="p-2 bg-secondary/50 rounded-lg shrink-0 text-muted-foreground">
                      <BookshelfIcon className="w-[18px] h-[18px]" />
                    </div>
                    <span className="text-base font-medium">Shelves</span>
                  </motion.div>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="my-1 bg-border/50" />

                <DropdownMenuItem asChild onClick={() => onNavigateToView('statistics')}>
                  <motion.div variants={itemVariants} className="gap-3 p-3 cursor-pointer rounded-xl flex items-center transition-all duration-200">
                    <div className="p-2 bg-secondary/50 rounded-lg shrink-0 text-muted-foreground">
                      <BarChart2 size={18} />
                    </div>
                    <span className="text-base font-medium">Statistics</span>
                  </motion.div>
                </DropdownMenuItem>

                <DropdownMenuItem asChild onClick={() => onNavigateToView('history')}>
                  <motion.div variants={itemVariants} className="gap-3 p-3 cursor-pointer rounded-xl flex items-center transition-all duration-200">
                    <div className="p-2 bg-secondary/50 rounded-lg shrink-0 text-muted-foreground">
                      <History size={18} />
                    </div>
                    <span className="text-base font-medium">History</span>
                  </motion.div>
                </DropdownMenuItem>

                <DropdownMenuItem asChild onClick={() => onNavigateToView('rss-articles')}>
                  <motion.div variants={itemVariants} className="gap-3 p-3 cursor-pointer rounded-xl flex items-center transition-all duration-200">
                    <div className="p-2 bg-secondary/50 rounded-lg shrink-0 text-muted-foreground">
                      <Rss size={18} />
                    </div>
                    <span className="text-base font-medium">RSS Feeds</span>
                  </motion.div>
                </DropdownMenuItem>

                {preferredContentType !== 'books' && (
                  <>
                    <DropdownMenuItem asChild onClick={() => onNavigateToView('anilist')}>
                      <motion.div variants={itemVariants} className="gap-3 p-3 cursor-pointer rounded-xl flex items-center transition-all duration-200">
                        <div className="p-2 bg-secondary/50 rounded-lg shrink-0 text-muted-foreground">
                          <AniListIcon className="w-[18px] h-[18px]" />
                        </div>
                        <span className="text-base font-medium">AniList</span>
                      </motion.div>
                    </DropdownMenuItem>
                    
                    {!IS_STORE_BUILD && (
                      <DropdownMenuItem asChild onClick={() => onNavigateToView('torbox-discover')}>
                        <motion.div variants={itemVariants} className="gap-3 p-3 cursor-pointer rounded-xl flex items-center transition-all duration-200">
                          <div className="p-2 bg-secondary/50 rounded-lg shrink-0 text-muted-foreground">
                            <TorboxIcon className="w-[18px] h-[18px]" />
                          </div>
                          <span className="text-base font-medium">Torbox</span>
                        </motion.div>
                      </DropdownMenuItem>
                    )}
                  </>
                )}

                {(preferredContentType === 'books' || preferredContentType === 'both') && (
                  <DropdownMenuItem asChild onClick={() => onNavigateToView('annotations')}>
                    <motion.div variants={itemVariants} className="gap-3 p-3 cursor-pointer rounded-xl flex items-center transition-all duration-200">
                      <div className="p-2 bg-secondary/50 rounded-lg shrink-0 text-muted-foreground">
                        <NotebookPen size={18} />
                      </div>
                      <span className="text-base font-medium">Annotations</span>
                    </motion.div>
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem asChild onClick={() => onNavigateToView('recycle-bin')}>
                  <motion.div variants={itemVariants} className="gap-3 p-3 cursor-pointer rounded-xl flex items-center transition-all duration-200 text-destructive focus:bg-destructive/10 focus:text-destructive">
                    <div className="p-2 bg-destructive/10 rounded-lg shrink-0">
                      <Trash2 size={18} />
                    </div>
                    <span className="text-base font-medium">Trash</span>
                  </motion.div>
                </DropdownMenuItem>

                <DropdownMenuSeparator asChild>
                  <motion.div variants={itemVariants} className="my-1 bg-border/50" />
                </DropdownMenuSeparator>

                <DropdownMenuItem asChild onClick={onOpenSettings}>
                  <motion.div variants={itemVariants} className="gap-3 p-3 cursor-pointer rounded-xl flex items-center transition-all duration-200">
                    <div className="p-2 bg-primary/10 rounded-lg shrink-0 text-primary">
                      <Settings size={18} />
                    </div>
                    <span className="text-base font-medium">Settings</span>
                  </motion.div>
                </DropdownMenuItem>
              </motion.div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>

      {/* ── ANDROID MORE BOTTOM SHEET (Matches media_1792385306724_e66bd916.png) ── */}
      {isAndroid && (
        <AnimatePresence>
          {isAndroidMoreOpen && (
            <>
              {/* Dimmed backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setIsAndroidMoreOpen(false)}
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs"
              />

              {/* Bottom Sheet Modal */}
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                className="fixed bottom-0 inset-x-0 z-[101] flex flex-col rounded-t-[36px] bg-background/95 backdrop-blur-2xl border-t border-border/60 shadow-2xl overflow-y-auto max-h-[85vh] no-scrollbar select-none"
                style={{
                  paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)',
                }}
              >
                {/* Drag handle pill */}
                <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30 mx-auto mt-3.5 mb-5 shrink-0" />

                {/* 3-Column Circular Icon Grid */}
                <div className="grid grid-cols-3 gap-y-7 gap-x-4 px-6 pt-1 pb-8 max-w-sm mx-auto w-full">
                  {androidMoreItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        item.onClick();
                        if (item.id !== 'dark-mode') {
                          setIsAndroidMoreOpen(false);
                        }
                      }}
                      className="flex flex-col items-center justify-center group cursor-pointer active:scale-95 transition-transform"
                    >
                      {/* Pastel Tinted Circle Bubble */}
                      <div
                        className={cn(
                          'w-16 h-16 sm:w-[68px] sm:h-[68px] rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 group-hover:scale-105 active:scale-90',
                          item.bgClass
                        )}
                      >
                        <item.icon className="w-6 h-6 text-[#2D3748] dark:text-[#E2E8F0] stroke-[1.8]" />
                      </div>

                      {/* Primary Label */}
                      <span className="text-xs sm:text-sm font-bold text-foreground tracking-tight mt-2.5 truncate max-w-[95px] text-center">
                        {item.label}
                      </span>

                      {/* Optional Subtitle / Status */}
                      {item.subtitle && (
                        <span className="text-[11px] font-medium text-muted-foreground mt-0.5 truncate max-w-[95px]">
                          {item.subtitle}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}
    </>
  )
}

function NavItem({
  icon,
  label,
  isActive,
  onClick
}: {
  icon: React.ReactNode
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center w-full h-full transition-all duration-300 ease-out group gap-1 active:scale-95",
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <div className={cn(
        "flex items-center justify-center w-14 h-8 rounded-full transition-all duration-300",
        isActive ? "bg-primary/15" : "bg-transparent group-hover:bg-primary/5"
      )}>
        <div className={cn(
          "transition-transform duration-300",
          isActive ? "scale-110 drop-shadow-md" : "scale-100"
        )}>
          {icon}
        </div>
      </div>
      <span className={cn(
        "text-[11px] font-semibold tracking-wide leading-none transition-all duration-300 hidden sm:block",
        isActive ? "opacity-100" : "opacity-70"
      )}>
        {label}
      </span>
    </button>
  )
}
