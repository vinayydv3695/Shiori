import { Home, Library, Compass, Cloud, Settings, Highlighter, Tv, Menu, BarChart2, Rss, Trash2, History } from 'lucide-react'
import { AniListIcon, TorboxIcon } from '@/components/icons'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { CurrentView } from '@/store/uiStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useTorboxStore } from '@/store/useTorboxStore'
import { motion } from 'framer-motion'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 15, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, type: "spring" as const, stiffness: 300, damping: 24 }
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
  
  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around h-16 bg-background/85 backdrop-blur-xl md:hidden border-t border-border/50 shadow-none outline-none ring-0"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)'
      }}
    >
      <NavItem
        icon={<Home className="w-[22px] h-[22px]" />}
        label="Home"
        isActive={currentView === 'home'}
        onClick={() => onNavigateToView('home')}
      />
      <NavItem
        icon={<Library className="w-[22px] h-[22px]" />}
        label="Library"
        isActive={currentView === 'library'}
        onClick={() => onNavigateToView('library')}
      />
      <NavItem
        icon={<Compass className="w-[22px] h-[22px]" />}
        label="Browse"
        isActive={currentView === 'online-books' || currentView === 'online-manga'}
        onClick={() => {
          onNavigateToView(preferredContentType === 'manga' ? 'online-manga' : 'online-books');
        }}
      />
      {preferredContentType === 'books' ? (
        <NavItem
          icon={<Highlighter className="w-[22px] h-[22px]" />}
          label="Highlights"
          isActive={currentView === 'annotations'}
          onClick={() => onNavigateToView('annotations')}
        />
      ) : hasTorboxKey ? (
        <NavItem
          icon={<TorboxIcon className="w-[22px] h-[22px]" />}
          label="Torbox"
          isActive={currentView.startsWith('torbox')}
          onClick={() => onNavigateToView('torbox-discover')}
        />
      ) : (
        <NavItem
          icon={<AniListIcon className="w-[22px] h-[22px]" />}
          label="AniList"
          isActive={currentView === 'anilist'}
          onClick={() => onNavigateToView('anilist')}
        />
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex flex-col items-center justify-center w-full h-full gap-1 text-muted-foreground hover:text-foreground transition-all duration-300 active:scale-95">
            <Menu className="w-[22px] h-[22px]" />
            <span className="text-[10px] font-medium hidden sm:block">More</span>
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
            className="w-56 rounded-2xl border-border/50 shadow-2xl bg-background/90 backdrop-blur-2xl p-2 mb-2"
          >
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

          <DropdownMenuItem asChild onClick={() => onNavigateToView('rss-feeds')}>
            <motion.div variants={itemVariants} className="gap-3 p-3 cursor-pointer rounded-xl flex items-center transition-all duration-200">
              <div className="p-2 bg-secondary/50 rounded-lg shrink-0 text-muted-foreground">
                <Rss size={18} />
              </div>
              <span className="text-base font-medium">RSS Feeds</span>
            </motion.div>
          </DropdownMenuItem>

          {preferredContentType !== 'books' && (
            <>
              {hasTorboxKey ? (
                <DropdownMenuItem asChild onClick={() => onNavigateToView('anilist')}>
                  <motion.div variants={itemVariants} className="gap-3 p-3 cursor-pointer rounded-xl flex items-center transition-all duration-200">
                    <div className="p-2 bg-secondary/50 rounded-lg shrink-0 text-muted-foreground">
                      <AniListIcon className="w-[18px] h-[18px]" />
                    </div>
                    <span className="text-base font-medium">AniList</span>
                  </motion.div>
                </DropdownMenuItem>
              ) : (
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

          {preferredContentType === 'both' && (
            <DropdownMenuItem asChild onClick={() => onNavigateToView('annotations')}>
              <motion.div variants={itemVariants} className="gap-3 p-3 cursor-pointer rounded-xl flex items-center transition-all duration-200">
                <div className="p-2 bg-secondary/50 rounded-lg shrink-0 text-muted-foreground">
                  <Highlighter size={18} />
                </div>
                <span className="text-base font-medium">Highlights</span>
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
    </nav>
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
        "flex items-center justify-center w-12 h-7 rounded-full transition-all duration-300",
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
        "text-[10px] font-semibold tracking-wide leading-none transition-all duration-300 hidden sm:block",
        isActive ? "opacity-100" : "opacity-70"
      )}>
        {label}
      </span>
    </button>
  )
}
