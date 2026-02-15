import { Library, Tag, Settings, ChevronLeft, ChevronRight } from "../icons"
import { useUIStore } from "../../store/uiStore"
import { cn } from "../../lib/utils"
import { Button } from "../ui/Button"

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()

  const navItems = [
    { icon: Library, label: "Library", href: "/" },
    { icon: Tag, label: "Tags", href: "/tags" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ]

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r border-border bg-card transition-all duration-300",
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
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => (
            <button
              key={item.href}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

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
