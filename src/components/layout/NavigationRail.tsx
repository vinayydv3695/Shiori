import { useUIStore, type CurrentView } from "@/store/uiStore"
import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Globe,
  Highlighter,
  Home,
  Library,
  Settings,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface NavigationRailProps {
  currentView: CurrentView
  onNavigateToView?: (view: CurrentView) => void
  onOpenSettings?: () => void
}

type NavItem = {
  label: string
  targetView: CurrentView
  isActive: (view: CurrentView) => boolean
  icon: React.ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Home",
    targetView: "home",
    isActive: (view) => view === "home",
    icon: Home,
  },
  {
    label: "Library",
    targetView: "library",
    isActive: (view) => view === "library",
    icon: Library,
  },
  {
    label: "Online Books",
    targetView: "online-books",
    isActive: (view) => view === "online-books",
    icon: Globe,
  },
  {
    label: "Online Manga",
    targetView: "online-manga",
    isActive: (view) => view === "online-manga",
    icon: BookOpen,
  },
  {
    label: "Annotations",
    targetView: "annotations",
    isActive: (view) => view === "annotations",
    icon: Highlighter,
  },
  {
    label: "Statistics",
    targetView: "statistics",
    isActive: (view) => view === "statistics",
    icon: BarChart3,
  },
]


export function NavigationRail({ currentView, onNavigateToView, onOpenSettings }: NavigationRailProps) {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)

  return (
    <TooltipProvider delayDuration={120}>
      <nav
        aria-label="Primary"
        className={`flex h-full flex-col border-r border-border bg-card p-2 transition-[width] duration-200 ${
          sidebarCollapsed ? "w-16" : "w-56"
        }`}
      >
        <div className={`mb-2 flex ${sidebarCollapsed ? "justify-center" : "justify-end"}`}>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expand navigation rail" : "Collapse navigation rail"}
            aria-expanded={!sidebarCollapsed}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {sidebarCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        </div>

        <div className={`flex flex-1 flex-col gap-1 ${sidebarCollapsed ? "items-center" : "items-stretch"}`}>
          {NAV_ITEMS.map(({ label, targetView, isActive, icon: Icon }) => {
            const active = isActive(currentView)
            const navButton = (
              <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={() => onNavigateToView?.(targetView)}
                className={`inline-flex h-10 items-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[active=true]:border-border data-[active=true]:bg-accent data-[active=true]:text-accent-foreground ${
                  sidebarCollapsed ? "w-10 justify-center" : "w-full justify-start gap-3 px-3"
                }`}
                data-active={active}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!sidebarCollapsed && <span className="truncate text-sm">{label}</span>}
              </button>
            )

            return (
              <Tooltip key={label}>
                <TooltipTrigger asChild>{navButton}</TooltipTrigger>
                {sidebarCollapsed && <TooltipContent side="right">{label}</TooltipContent>}
              </Tooltip>
            )
          })}
        </div>

        <div className="mt-2 border-t border-border pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Settings"
                onClick={onOpenSettings}
                className={`inline-flex h-10 items-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  sidebarCollapsed ? "w-10 justify-center" : "w-full justify-start gap-3 px-3"
                }`}
              >
                <Settings className="h-5 w-5 shrink-0" />
                {!sidebarCollapsed && <span className="truncate text-sm">Settings</span>}
              </button>
            </TooltipTrigger>
            {sidebarCollapsed && <TooltipContent side="right">Settings</TooltipContent>}
          </Tooltip>
        </div>
      </nav>
    </TooltipProvider>
  )
}
