import { create } from "zustand"
import { persist } from "zustand/middleware"

export type CurrentView = "library" | "rss-feeds" | "rss-articles"
export type DomainView = "books" | "manga"

interface UIStore {
  theme: "light" | "dark"
  sidebarCollapsed: boolean
  currentView: CurrentView
  currentDomain: DomainView
  toggleTheme: () => void
  setTheme: (theme: "light" | "dark") => void
  toggleSidebar: () => void
  setCurrentView: (view: CurrentView) => void
  setCurrentDomain: (domain: DomainView) => void
  resetToHome: () => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      theme: "dark",
      sidebarCollapsed: false,
      currentView: "library",
      currentDomain: "books",
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "light" ? "dark" : "light",
        })),
      setTheme: (theme: "light" | "dark") => set({ theme }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setCurrentView: (view: CurrentView) => set({ currentView: view }),
      setCurrentDomain: (domain: DomainView) => set({ currentDomain: domain }),
      resetToHome: () => set({ currentView: "library", currentDomain: "books" }),
    }),
    {
      name: "shiori-ui-settings",
    }
  )
)
