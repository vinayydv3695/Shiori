import { useState } from "react"
import type { CurrentView } from "@/store/uiStore"
import { ChevronLeft, ChevronRight, ChevronDown, Settings, Compass, Globe, LayoutGrid, SlidersHorizontal } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useNavigationRail, type NavSection } from "./hooks/useNavigationRail"
import { ShelfSidebar } from "../shelves/ShelfSidebar"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface NavigationRailDesktopProps {
  currentView: CurrentView
  onNavigateToView?: (view: CurrentView) => void
  onCreateShelf?: () => void
  onOpenSettings?: () => void
}

const SECTION_TITLES: Record<NavSection, string> = {
  NAVIGATE: "Navigate",
  DISCOVER: "Discover",
  WORKSPACE: "Workspace",
  SYSTEM: "System",
}

const SECTION_ICONS: Record<NavSection, React.ComponentType<{ className?: string }>> = {
  NAVIGATE: Compass,
  DISCOVER: Globe,
  WORKSPACE: LayoutGrid,
  SYSTEM: SlidersHorizontal,
}

export function NavigationRailDesktop({
  currentView,
  onNavigateToView,
  onCreateShelf,
  onOpenSettings,
}: NavigationRailDesktopProps) {
  const { sidebarCollapsed, toggleSidebar, groupedNavItems } = useNavigationRail()

  const sections: NavSection[] = ["NAVIGATE", "DISCOVER", "WORKSPACE", "SYSTEM"]

  // Initialize section open state: closed by default, only active section starts open
  const [openSections, setOpenSections] = useState<Record<NavSection, boolean>>(() => {
    const initial: Record<NavSection, boolean> = {
      NAVIGATE: false,
      DISCOVER: false,
      WORKSPACE: false,
      SYSTEM: false,
    }
    for (const sec of sections) {
      if (groupedNavItems[sec]?.some((item) => item.isActive(currentView))) {
        initial[sec] = true
        break
      }
    }
    return initial
  })

  const toggleSection = (section: NavSection) => {
    if (sidebarCollapsed) {
      toggleSidebar()
      setOpenSections((prev) => ({
        ...prev,
        [section]: true,
      }))
      return
    }

    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  // Handle navigating and auto-minimizing the sidebar upon selection
  const handleItemClick = (targetView: CurrentView) => {
    onNavigateToView?.(targetView)
    if (!sidebarCollapsed) {
      toggleSidebar()
    }
  }

  return (
    <TooltipProvider delayDuration={100}>
      <nav
        aria-label="Primary Desktop Navigation"
        className={cn(
          "flex h-full flex-col bg-card/75 backdrop-blur-3xl border-r border-border/40 transition-all duration-300 ease-out z-20 select-none shadow-[1px_0_20px_rgba(0,0,0,0.03)] max-md:hidden",
          sidebarCollapsed ? "w-[76px]" : "w-64"
        )}
      >
        {/* Top Header Bar */}
        <div className="flex h-14 items-center justify-between px-4 shrink-0 border-b border-border/30">
          {!sidebarCollapsed && (
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground/80">
              Navigation
            </span>
          )}

          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar"}
            aria-expanded={!sidebarCollapsed}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              sidebarCollapsed && "mx-auto"
            )}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Main Content Area — No Scrollbar Slider */}
        <div className={cn(
          "flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-3 space-y-2.5",
          sidebarCollapsed ? "px-2 flex flex-col items-center" : "px-3"
        )}>
          {sections.map((sectionKey) => {
            const items = groupedNavItems[sectionKey]
            if (!items || items.length === 0) return null

            const isOpen = openSections[sectionKey]
            const SectionIcon = SECTION_ICONS[sectionKey]
            const hasActiveChild = items.some((item) => item.isActive(currentView))

            return (
              <div key={sectionKey} className={cn("w-full space-y-1", sidebarCollapsed && "flex flex-col items-center")}>
                {/* Section Header */}
                {!sidebarCollapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleSection(sectionKey)}
                    className={cn(
                      "flex items-center justify-between w-full px-2.5 py-2 rounded-2xl text-xs font-bold transition-all duration-200 group border select-none",
                      hasActiveChild
                        ? "bg-primary/10 border-primary/25 text-foreground shadow-sm"
                        : "bg-secondary/30 border-transparent text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Icon Badge Container */}
                      <div className={cn(
                        "flex items-center justify-center w-7 h-7 rounded-xl transition-all duration-200 shrink-0",
                        hasActiveChild
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-105"
                          : "bg-secondary/80 text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary group-hover:scale-105"
                      )}>
                        <SectionIcon className="w-3.5 h-3.5" />
                      </div>

                      <span className="tracking-wide text-xs sm:text-[13px] font-bold truncate">{SECTION_TITLES[sectionKey]}</span>

                      <span className={cn(
                        "text-[10px] font-extrabold px-2 py-0.5 rounded-full border transition-colors shrink-0",
                        hasActiveChild
                          ? "bg-primary/20 text-primary border-primary/30"
                          : "bg-secondary/90 text-muted-foreground/80 border-border/40 group-hover:border-primary/20"
                      )}>
                        {items.length}
                      </span>
                    </div>

                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-muted-foreground/60 transition-transform duration-200 group-hover:text-foreground shrink-0 ml-1",
                        !isOpen && "-rotate-90"
                      )}
                    />
                  </button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionKey)}
                        aria-label={SECTION_TITLES[sectionKey]}
                        className={cn(
                          "relative flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                          hasActiveChild
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-105"
                            : "text-muted-foreground hover:bg-accent/80 hover:text-foreground hover:scale-105"
                        )}
                      >
                        <SectionIcon className="h-5 w-5" />
                        {hasActiveChild && (
                          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary ring-2 ring-background" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={12} className="font-medium text-xs">
                      {SECTION_TITLES[sectionKey]} ({items.length})
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Sub-Items Accordion with Tree Connector Line */}
                <AnimatePresence initial={false}>
                  {isOpen && !sidebarCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0, y: -4 }}
                      animate={{ height: "auto", opacity: 1, y: 0 }}
                      exit={{ height: 0, opacity: 0, y: -4 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden relative ml-3 pl-3.5 border-l border-border/30 space-y-1 pt-1 pb-0.5"
                    >
                      {items.map(({ label, targetView, isActive, icon: Icon }) => {
                        const active = isActive(currentView)

                        return (
                          <button
                            key={label}
                            type="button"
                            aria-label={label}
                            aria-pressed={active}
                            onClick={() => handleItemClick(targetView)}
                            className={cn(
                              "group relative flex items-center h-9 w-full rounded-xl transition-all duration-150 text-xs px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                              active
                                ? "text-primary font-bold bg-primary/12 border border-primary/25 shadow-sm shadow-primary/5"
                                : "text-muted-foreground font-medium hover:bg-accent/60 hover:text-foreground"
                            )}
                          >
                            {active && (
                              <motion.div
                                layoutId="rail-active-pill"
                                className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.6)]"
                                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                              />
                            )}

                            <Icon
                              className={cn(
                                "shrink-0 transition-transform duration-200 h-4 w-4 mr-2.5",
                                active ? "text-primary scale-110" : "group-hover:scale-110"
                              )}
                            />

                            <span className="truncate tracking-wide text-xs">{label}</span>
                          </button>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}

          {/* Shelves Nested Tree when expanded */}
          {!sidebarCollapsed && currentView === "shelves" && (
            <div className="mt-3 pt-3 border-t border-border/30 px-1">
              <ShelfSidebar
                onCreateShelf={onCreateShelf || (() => {})}
                onEditShelf={() => {}}
              />
            </div>
          )}
        </div>

      </nav>
    </TooltipProvider>
  )
}
