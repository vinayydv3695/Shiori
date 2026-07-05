import { Home, Library, Settings, Compass, Menu, Cloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CurrentView } from '@/store/uiStore'

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
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around h-16 bg-background/80 backdrop-blur-xl border-t border-border pb-[env(safe-area-inset-bottom,0px)] md:hidden">
      <NavItem
        icon={<Home className="w-5 h-5" />}
        label="Home"
        isActive={currentView === 'home'}
        onClick={() => onNavigateToView('home')}
      />
      <NavItem
        icon={<Library className="w-5 h-5" />}
        label="Library"
        isActive={currentView === 'library'}
        onClick={() => onNavigateToView('library')}
      />
      <NavItem
        icon={<Compass className="w-5 h-5" />}
        label="Browse"
        isActive={currentView === 'online-books' || currentView === 'online-manga'}
        onClick={() => onNavigateToView('online-books')}
      />
      <NavItem
        icon={<Cloud className="w-5 h-5" />}
        label="Torbox"
        isActive={currentView.startsWith('torbox')}
        onClick={() => onNavigateToView('torbox-discover')}
      />
      <NavItem
        icon={<Settings className="w-5 h-5" />}
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
        "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  )
}
