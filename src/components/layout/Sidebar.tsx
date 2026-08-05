import { Library, Tag, Settings, ChevronLeft, ChevronRight, FolderOpen, Highlighter, AniListIcon } from "../icons"
import { Globe, BookOpen, Trash2, BarChart2 } from "lucide-react"
import { useUIStore } from "../../store/uiStore"
import { usePreferencesStore } from "../../store/preferencesStore"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { motion } from "framer-motion"
import { ShelfSidebar } from "../shelves/ShelfSidebar"

import { Shelf } from "../../lib/tauri"

interface SidebarProps {
  onOpenSettings?: () => void
  onCreateShelf?: (parentId?: number) => void
  onEditShelf?: (shelf: Shelf) => void
}

export function Sidebar({ onOpenSettings, onCreateShelf, onEditShelf }: SidebarProps) {
  const sidebarCollapsed = useUIStore(state => state.sidebarCollapsed)
  const toggleSidebar = useUIStore(state => state.toggleSidebar)
  const currentView = useUIStore(state => state.currentView)
  const setCurrentView = useUIStore(state => state.setCurrentView)

  const preferredContentType = usePreferencesStore(state => state.preferences?.preferredContentType ?? 'both')
  const enableRecycleBin = usePreferencesStore(state => state.preferences?.enableRecycleBin ?? false)

  const navItems = [
    { icon: Library, label: "Library", action: () => setCurrentView("library") },
    { icon: FolderOpen, label: "Shelves", action: () => setCurrentView("shelves") },
    { icon: Globe, label: "Online Books", action: () => setCurrentView("online-books") },
    { icon: BookOpen, label: "Online Manga", action: () => setCurrentView("online-manga") },
    { icon: Highlighter, label: "Annotations", action: () => setCurrentView("annotations") },
    { icon: AniListIcon, label: "AniList", action: () => setCurrentView("anilist") },
    { icon: Tag, label: "Tags", action: () => setCurrentView("library") },
    { icon: BarChart2, label: "Statistics", action: () => setCurrentView("statistics") },
  ].filter(item => {
    if (preferredContentType === 'books' && item.label === 'Online Manga') return false;
    if (preferredContentType === 'manga' && item.label === 'Online Books') return false;
    if (preferredContentType === 'manga' && item.label === 'Annotations') return false;
    return true;
  })

  if (enableRecycleBin) {
    navItems.push({
      icon: Trash2 as any,
      label: "Recycle Bin",
      action: () => setCurrentView("recycle-bin" as any)
    });
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-card transition-all duration-300",
        sidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-border px-4">
          {!sidebarCollapsed && (
            <h1 className="text-xl font-bold text-primary">Shiori</h1>
          )}
          {sidebarCollapsed && (
            <span className="text-xl font-bold text-primary">栞</span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 p-3 overflow-y-auto relative">
          {navItems.map((item) => {
            const isActive = 
              (item.label === "Library" && currentView === "library") ||
              (item.label === "Shelves" && currentView === "shelves") ||
              (item.label === "Online Books" && currentView === "online-books") ||
              (item.label === "Online Manga" && currentView === "online-manga") ||
              (item.label === "Recycle Bin" && currentView === "recycle-bin" as any) ||
              (item.label === "Annotations" && currentView === "annotations") ||
              (item.label === "RSS Feeds" && currentView === "rss-feeds") ||
              (item.label === "AniList" && currentView === "anilist") ||
              (item.label === "Statistics" && currentView === "statistics");

            return (
              <button
                key={item.label}
                onClick={item.action}
                className={cn(
                  "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors z-10",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "text-accent-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-tab"
                    className="absolute inset-0 bg-accent rounded-lg -z-10 shadow-sm border border-border/50"
                    initial={false}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="flex-1 overflow-hidden border-t border-border/50">
            <div className="h-full scale-95 origin-top w-[105%] -ml-1">
              <ShelfSidebar 
                onCreateShelf={onCreateShelf || (() => {})} 
                onEditShelf={onEditShelf || (() => {})} 
              />
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="w-full"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </aside>
  )
}
