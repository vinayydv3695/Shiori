import { Home, Library, Compass, Cloud, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CurrentView } from '@/store/uiStore'
import { usePreferencesStore } from '@/store/preferencesStore'

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
  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around h-[72px] bg-background/85 backdrop-blur-xl md:hidden border-0 border-transparent shadow-none outline-none ring-0"
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
          const preferredContentType = usePreferencesStore.getState().preferences?.preferredContentType;
          onNavigateToView(preferredContentType === 'manga' ? 'online-manga' : 'online-books');
        }}
      />
      <NavItem
        icon={<Cloud className="w-[22px] h-[22px]" />}
        label="Torbox"
        isActive={currentView.startsWith('torbox')}
        onClick={() => onNavigateToView('torbox-discover')}
      />

      <NavItem
        icon={<Settings className="w-[22px] h-[22px]" />}
        label="Settings"
        isActive={false}
        onClick={onOpenSettings}
      />
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
        "relative flex flex-col items-center justify-center w-full h-full transition-all duration-300 ease-out group gap-1.5",
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
        "text-[10px] font-semibold tracking-wide leading-none transition-all duration-300",
        isActive ? "opacity-100" : "opacity-70"
      )}>
        {label}
      </span>
    </button>
  )
}
