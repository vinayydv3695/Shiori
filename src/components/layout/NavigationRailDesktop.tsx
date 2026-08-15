import { useState } from "react"
import type { CurrentView } from "@/store/uiStore"
import { ChevronLeft, ChevronRight, ChevronDown, Settings, Compass, Globe, LayoutGrid, SlidersHorizontal, ListFilter } from "lucide-react"
import { SolidHomeIcon } from "@/components/icons/ShioriIcons"
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
  onToggleFilters?: () => void
  isFiltersOpen?: boolean
}

const SECTION_TITLES: Record<NavSection, string> = {
  NAVIGATE: "Home",
  DISCOVER: "Discover",
  WORKSPACE: "Workspace",
  SYSTEM: "System",
}

const SECTION_ICONS: Record<NavSection, React.ComponentType<{ className?: string }>> = {
  NAVIGATE: SolidHomeIcon,
  DISCOVER: Globe,
  WORKSPACE: LayoutGrid,
  SYSTEM: SlidersHorizontal,
}

export function NavigationRailDesktop({
  currentView,
  onNavigateToView,
  onCreateShelf,
  onOpenSettings,
  onToggleFilters,
  isFiltersOpen,
}: NavigationRailDesktopProps) {
  const { sidebarCollapsed, toggleSidebar, groupedNavItems } = useNavigationRail()

  const sections: NavSection[] = ["NAVIGATE", "DISCOVER", "WORKSPACE", "SYSTEM"]

  // Initialize section open state: all sections open by default so sidebar reaches the end cleanly
  const [openSections, setOpenSections] = useState<Record<NavSection, boolean>>({
    NAVIGATE: true,
    DISCOVER: true,
    WORKSPACE: true,
    SYSTEM: true,
  })

  const toggleSection = (section: NavSection) => {
    if (sidebarCollapsed) {
      toggleSidebar()
      setOpenSections({
        NAVIGATE: true,
        DISCOVER: true,
        WORKSPACE: true,
        SYSTEM: true,
      })
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
    <TooltipProvider delayDuration={0}>
      <nav
        aria-label="Primary Desktop Navigation"
        className={cn(
          "flex h-[calc(100%-12px)] my-1 ml-2 mb-2 flex-col bg-card/80 backdrop-blur-3xl border border-border/40 rounded-2xl transition-all duration-300 ease-out z-20 select-none shadow-xs max-md:hidden overflow-hidden",
          sidebarCollapsed ? "w-[72px]" : "w-64"
        )}
      >
        {/* Top Header Bar */}
        <div className="flex h-14 items-center justify-between px-3.5 shrink-0 border-b border-border/30">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2 select-none min-w-0 px-1">
              <span className="text-base font-bold text-primary select-none leading-none">
                栞
              </span>
              <span className="text-xs font-black tracking-[0.18em] text-foreground/90 uppercase select-none">
                SHIORI
              </span>
            </div>
          ) : (
            <span className="sr-only">SHIORI</span>
          )}

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1.5">
            {/* Collapse / Expand Rail Toggle (Left button) */}
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label={sidebarCollapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar"}
                  aria-expanded={!sidebarCollapsed}
                  className={cn(
                    "flex items-center justify-center transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer",
                    sidebarCollapsed
                      ? "w-12 h-12 rounded-2xl mx-auto bg-primary/10 text-primary border border-primary/25 hover:bg-primary hover:text-primary-foreground shadow-xs group"
                      : "h-8 w-8 rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {sidebarCollapsed ? (
                    <span className="text-base font-bold leading-none group-hover:scale-110 transition-transform select-none">
                      栞
                    </span>
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent
                side={sidebarCollapsed ? "right" : "bottom"}
                sideOffset={sidebarCollapsed ? 14 : 8}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/40 bg-popover/95 backdrop-blur-md shadow-xl text-xs font-semibold"
              >
                {sidebarCollapsed ? "Expand sidebar (栞 SHIORI)" : "Collapse sidebar"}
              </TooltipContent>
            </Tooltip>

            {/* Toggle Filters Sidebar Button (Right button, next to collapse sidebar — visible only on library and shelves) */}
            {!sidebarCollapsed && onToggleFilters && (currentView === "library" || currentView === "shelves") && (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onToggleFilters}
                    aria-label={isFiltersOpen ? "Hide filter panel" : "Show filter panel"}
                    aria-pressed={isFiltersOpen}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer",
                      isFiltersOpen
                        ? "bg-primary/15 text-primary border border-primary/30 shadow-xs"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <ListFilter className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  sideOffset={8}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-border/40 bg-popover/95 backdrop-blur-md shadow-xl text-xs font-semibold"
                >
                  {isFiltersOpen ? "Hide filter panel" : "Toggle filter panel"}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Main Content Area — No Scrollbar Slider */}
        <div className={cn(
          "flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-3.5",
          sidebarCollapsed ? "px-2.5 flex flex-col items-center space-y-3" : "px-3 space-y-3.5"
        )}>
          {sections.map((sectionKey) => {
            const items = [...(groupedNavItems[sectionKey] || [])]
            const isSystemSection = sectionKey === "SYSTEM"
            
            // Add settings to items count for system section if not present
            const totalCount = isSystemSection && onOpenSettings ? items.length + 1 : items.length
            if (totalCount === 0) return null

            const isOpen = openSections[sectionKey]
            const SectionIcon = SECTION_ICONS[sectionKey]
            const hasActiveChild = items.some((item) => item.isActive(currentView))

            return (
              <div key={sectionKey} className={cn("w-full", sidebarCollapsed ? "flex flex-col items-center" : "space-y-1.5")}>
                {/* Section Header */}
                {!sidebarCollapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleSection(sectionKey)}
                    className={cn(
                      "flex items-center justify-between w-full px-3 py-2.5 rounded-2xl text-sm font-bold transition-all duration-200 group border select-none",
                      hasActiveChild
                        ? "bg-primary/10 border-primary/25 text-foreground shadow-sm"
                        : "bg-secondary/30 border-transparent text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Icon Badge Container */}
                      <div className={cn(
                        "flex items-center justify-center w-8.5 h-8.5 rounded-xl transition-all duration-200 shrink-0",
                        hasActiveChild
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-105"
                          : "bg-secondary/80 text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary group-hover:scale-105"
                      )}>
                        <SectionIcon className="w-5 h-5" />
                      </div>

                      <span className="tracking-wide text-sm font-bold truncate">{SECTION_TITLES[sectionKey]}</span>

                      <span className={cn(
                        "text-xs font-extrabold px-2 py-0.5 rounded-full border transition-colors shrink-0",
                        hasActiveChild
                          ? "bg-primary/20 text-primary border-primary/30"
                          : "bg-secondary/90 text-muted-foreground/80 border-border/40 group-hover:border-primary/20"
                      )}>
                        {totalCount}
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
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionKey)}
                        aria-label={SECTION_TITLES[sectionKey]}
                        className={cn(
                          "relative flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 group select-none cursor-pointer",
                          hasActiveChild
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-102 font-bold border border-primary/30"
                            : "bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/40 hover:border-primary/40 shadow-xs hover:scale-105 active:scale-95"
                        )}
                      >
                        <SectionIcon className={cn(
                          "h-6 w-6 transition-transform duration-200",
                          hasActiveChild ? "scale-105" : "group-hover:scale-110"
                        )} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      sideOffset={14}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border/40 bg-popover/95 backdrop-blur-md shadow-xl text-xs font-semibold"
                    >
                      <span className="text-foreground">{SECTION_TITLES[sectionKey]}</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold">
                        {totalCount}
                      </span>
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
                      className="overflow-hidden relative ml-3.5 pl-3.5 border-l border-border/30 space-y-1.5 pt-1.5 pb-1"
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
                              "group relative flex items-center h-9 w-full rounded-xl transition-all duration-150 text-sm px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
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
                                "shrink-0 transition-transform duration-200 w-4 h-4 mr-2.5",
                                active ? "text-primary scale-110" : "group-hover:scale-110"
                              )}
                            />

                            <span className="truncate tracking-wide text-xs sm:text-[13px] font-semibold">{label}</span>
                          </button>
                        )
                      })}

                      {/* Settings in System Section */}
                      {isSystemSection && onOpenSettings && (
                        <button
                          type="button"
                          aria-label="Settings"
                          onClick={() => {
                            onOpenSettings()
                            if (!sidebarCollapsed) {
                              toggleSidebar()
                            }
                          }}
                          className="group relative flex items-center h-9 w-full rounded-xl transition-all duration-150 text-sm px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-muted-foreground font-medium hover:bg-accent/60 hover:text-foreground"
                        >
                          <Settings className="shrink-0 transition-transform duration-200 w-4 h-4 mr-2.5 group-hover:scale-110" />
                          <span className="truncate tracking-wide text-xs sm:text-[13px] font-semibold">Settings</span>
                        </button>
                      )}
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
