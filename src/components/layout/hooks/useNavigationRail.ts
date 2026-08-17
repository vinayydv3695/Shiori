import { useUIStore, type CurrentView } from "@/store/uiStore"
import { usePreferencesStore } from "@/store/preferencesStore"
import {
  BookOpen,
  Globe,
  Highlighter,
  Home,
  Library,
  Trash2,
  History,
  BarChart2,
  Settings,
} from "lucide-react"
import { AniListIcon, TorboxIcon, BookshelfIcon } from "@/components/icons"

export type NavSection = 'NAVIGATE' | 'DISCOVER' | 'WORKSPACE' | 'SYSTEM';

export type NavItem = {
  label: string
  targetView: CurrentView
  isActive: (view: CurrentView) => boolean
  icon: React.ComponentType<{ className?: string }>
  section: NavSection
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Home",
    targetView: "home",
    isActive: (view) => view === "home",
    icon: Home,
    section: "NAVIGATE",
  },
  {
    label: "Library",
    targetView: "library",
    isActive: (view) => view === "library",
    icon: Library,
    section: "NAVIGATE",
  },
  {
    label: "Shelves",
    targetView: "shelves",
    isActive: (view) => view === "shelves",
    icon: BookshelfIcon,
    section: "NAVIGATE",
  },
  {
    label: "Online Books",
    targetView: "online-books",
    isActive: (view) => view === "online-books",
    icon: Globe,
    section: "DISCOVER",
  },
  {
    label: "Online Manga",
    targetView: "online-manga",
    isActive: (view) => view === "online-manga",
    icon: BookOpen,
    section: "DISCOVER",
  },
  {
    label: "Torbox",
    targetView: "torbox-discover",
    isActive: (view) => view === "torbox-discover" || view === "torbox-books" || view === "torbox-manga",
    icon: TorboxIcon,
    section: "DISCOVER",
  },
  {
    label: "Annotations",
    targetView: "annotations",
    isActive: (view) => view === "annotations",
    icon: Highlighter,
    section: "WORKSPACE",
  },
  {
    label: "History",
    targetView: "history",
    isActive: (view) => view === "history",
    icon: History,
    section: "WORKSPACE",
  },
  {
    label: "AniList",
    targetView: "anilist",
    isActive: (view) => view === "anilist",
    icon: AniListIcon,
    section: "WORKSPACE",
  },
  {
    label: "Statistics",
    targetView: "statistics",
    isActive: (view) => view === "statistics",
    icon: BarChart2,
    section: "WORKSPACE",
  },
]

export function useNavigationRail() {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)
  const preferredContentType = usePreferencesStore((state) => state.preferences?.preferredContentType ?? 'both')
  const enableRecycleBin = usePreferencesStore((state) => state.preferences?.enableRecycleBin ?? false)

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (preferredContentType === 'books' && item.targetView === 'online-manga') return false;
    if (preferredContentType === 'books' && item.targetView === 'anilist') return false;
    if (preferredContentType === 'books' && item.targetView === 'torbox-discover') return false;
    if (preferredContentType === 'manga' && item.targetView === 'online-books') return false;
    if (preferredContentType === 'manga' && item.targetView === 'annotations') return false;
    return true;
  });

  if (enableRecycleBin) {
    visibleNavItems.push({
      label: "Recycle Bin",
      targetView: "recycle-bin",
      isActive: (view) => view === "recycle-bin",
      icon: Trash2,
      section: "SYSTEM",
    });
  }

  const groupedNavItems = visibleNavItems.reduce<Record<NavSection, NavItem[]>>(
    (acc, item) => {
      acc[item.section].push(item);
      return acc;
    },
    { NAVIGATE: [], DISCOVER: [], WORKSPACE: [], SYSTEM: [] }
  );

  return {
    sidebarCollapsed,
    toggleSidebar,
    visibleNavItems,
    groupedNavItems,
  }
}
