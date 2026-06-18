import { useUIStore, type CurrentView } from "@/store/uiStore"
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Globe,
  Highlighter,
  Home,
  Library,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface NavigationRailProps {
  currentView: CurrentView
  onNavigateToView?: (view: CurrentView) => void
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
    label: "Torbox",
    targetView: "torbox-discover",
    isActive: (view) => view === "torbox-discover" || view === "torbox-books" || view === "torbox-manga",
    icon: Cloud,
  },
  {
    label: "Annotations",
    targetView: "annotations",
    isActive: (view) => view === "annotations",
    icon: Highlighter,
  },
]


export function NavigationRail({ currentView, onNavigateToView }: NavigationRailProps) {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)

  return (
    <TooltipProvider delayDuration={120}>
      <nav
        aria-label="Primary"
        className={`flex h-full flex-col border-r border-border/40 bg-background/60 backdrop-blur-xl p-3 transition-[width] duration-300 ease-in-out z-10 shadow-[1px_0_10px_rgba(0,0,0,0.02)] ${
          sidebarCollapsed ? "w-[72px]" : "w-60"
        }`}
      >
        <div className={`mb-6 flex ${sidebarCollapsed ? "justify-center" : "justify-end"}`}>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expand navigation rail" : "Collapse navigation rail"}
            aria-expanded={!sidebarCollapsed}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <div className={`flex flex-1 flex-col gap-2 ${sidebarCollapsed ? "items-center" : "items-stretch"}`}>
          {NAV_ITEMS.map(({ label, targetView, isActive, icon: Icon }) => {
            const active = isActive(currentView)
            const navButton = (
              <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={() => onNavigateToView?.(targetView)}
                className={`group relative flex h-11 items-center rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  active 
                    ? "bg-primary/10 text-primary font-medium shadow-sm" 
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                } ${
                  sidebarCollapsed ? "w-11 justify-center" : "w-full justify-start px-3.5"
                }`}
                data-active={active}
              >
                {active && !sidebarCollapsed && (
                  <div className="absolute left-0 top-1/2 -mt-2.5 h-5 w-1 rounded-r-full bg-primary" />
                )}
                {active && sidebarCollapsed && (
                  <div className="absolute left-0 top-1/2 -mt-2 h-4 w-1 rounded-r-full bg-primary" />
                )}
                <Icon className={`shrink-0 transition-transform duration-200 ${sidebarCollapsed ? "h-5 w-5" : "h-[18px] w-[18px] mr-3"} ${active ? "scale-110" : "group-hover:scale-110"}`} />
                {!sidebarCollapsed && <span className="truncate text-sm tracking-wide">{label}</span>}
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
      </nav>
    </TooltipProvider>
  )
}
