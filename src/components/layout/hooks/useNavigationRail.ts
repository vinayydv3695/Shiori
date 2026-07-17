import { useUIStore, type CurrentView } from "@/store/uiStore"
import { usePreferencesStore } from "@/store/preferencesStore"
import {
  BookOpen,
  Globe,
  Highlighter,
  Home,
  Library,
  Trash2,
  BarChart2,
} from "lucide-react"
import { AniListIcon, TorboxIcon } from "@/components/icons"

export type NavItem = {
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
    icon: TorboxIcon,
  },
  {
    label: "Annotations",
    targetView: "annotations",
    isActive: (view) => view === "annotations",
    icon: Highlighter,
  },
  {
    label: "AniList",
    targetView: "anilist",
    isActive: (view) => view === "anilist",
    icon: AniListIcon,
  },
  {
    label: "Statistics",
    targetView: "statistics",
    isActive: (view) => view === "statistics",
    icon: BarChart2,
  },
]

export function useNavigationRail() {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)
  const preferredContentType = usePreferencesStore((state) => state.preferences?.preferredContentType ?? 'both')
  const enableRecycleBin = usePreferencesStore((state) => state.preferences?.enableRecycleBin ?? false)

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (preferredContentType === 'books' && item.targetView === 'online-manga') return false;
    if (preferredContentType === 'manga' && item.targetView === 'online-books') return false;
    if (preferredContentType === 'manga' && item.targetView === 'annotations') return false;
    if (preferredContentType === 'books' && item.targetView === 'anilist') return false;
    return true;
  });

  if (enableRecycleBin) {
    visibleNavItems.push({
      label: "Recycle Bin",
      targetView: "recycle-bin",
      isActive: (view) => view === "recycle-bin",
      icon: Trash2,
    });
  }

  return {
    sidebarCollapsed,
    toggleSidebar,
    visibleNavItems,
  }
}
