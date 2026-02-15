import { Library, Tag, Settings, ChevronLeft, ChevronRight, FolderOpen } from "../icons"
import { useUIStore } from "../../store/uiStore"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { CollectionSidebar } from "../collections/CollectionSidebar"
import { CreateCollectionDialog } from "../collections/CreateCollectionDialog"
import { useState } from "react"
import { Collection } from "../../lib/tauri"

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const [showCollections, setShowCollections] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editCollection, setEditCollection] = useState<Collection | null>(null)
  const [parentId, setParentId] = useState<number | undefined>(undefined)

  const navItems = [
    { icon: Library, label: "Library", href: "/" },
    { icon: Tag, label: "Tags", href: "/tags" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ]

  const handleCreateCollection = (parentCollectionId?: number) => {
    setEditCollection(null)
    setParentId(parentCollectionId)
    setDialogOpen(true)
  }

  const handleEditCollection = (collection: Collection) => {
    setEditCollection(collection)
    setParentId(undefined)
    setDialogOpen(true)
  }

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
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
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

          {/* Collections Section */}
          {!sidebarCollapsed && (
            <div className="pt-4">
              <button
                onClick={() => setShowCollections(!showCollections)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <FolderOpen className="h-5 w-5 flex-shrink-0" />
                <span>Collections</span>
              </button>
              
              {showCollections && (
                <div className="mt-2">
                  <CollectionSidebar
                    onCreateCollection={handleCreateCollection}
                    onEditCollection={handleEditCollection}
                  />
                </div>
              )}
            </div>
          )}
        </nav>

        <CreateCollectionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editCollection={editCollection}
          parentId={parentId}
        />

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
