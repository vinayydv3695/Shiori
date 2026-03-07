import { create } from "zustand"
import { persist } from "zustand/middleware"

export type CurrentView = "home" | "library" | "rss-feeds" | "rss-articles" | "annotations" | "statistics"
export type DomainView = "books" | "manga" | "comics"

interface UIStore {
  sidebarCollapsed: boolean
  currentView: CurrentView
  currentDomain: DomainView
  toggleSidebar: () => void
  setCurrentView: (view: CurrentView) => void
  setCurrentDomain: (domain: DomainView) => void
  resetToHome: () => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      currentView: "home",
      currentDomain: "books",
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setCurrentView: (view: CurrentView) => set({ currentView: view }),
      setCurrentDomain: (domain: DomainView) => set({ currentDomain: domain }),
      resetToHome: () => set({ currentView: "home", currentDomain: "books" }),
    }),
    {
      name: "shiori-ui-settings",
    }
  )
)
