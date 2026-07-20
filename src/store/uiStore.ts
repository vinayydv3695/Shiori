import { create } from "zustand"
import { persist } from "zustand/middleware"

export type CurrentView =
  | "home"
  | "library"
  | "rss-feeds"
  | "rss-articles"
  | "annotations"
  | "history"
  | "statistics"
  | "online-books"
  | "online-manga"
  | "online-manga-reader"
  | "torbox-books"
  | "torbox-manga"
  | "torbox-discover"
  | "recycle-bin"
  | "anilist"
export type DomainView = "books" | "manga_comics"

interface UIStore {
  sidebarCollapsed: boolean
  currentView: CurrentView
  currentDomain: DomainView
  toggleSidebar: () => void
  setCurrentView: (view: CurrentView) => void
  setCurrentDomain: (domain: DomainView) => void
  resetToHome: () => void
  viewHistory: CurrentView[]
  goBack: () => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      currentView: "home",
      currentDomain: "books",
      viewHistory: [],
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setCurrentView: (view: CurrentView) => 
        set((state) => {
          if (state.currentView === view) return {};
          return {
            currentView: view,
            viewHistory: [...state.viewHistory, state.currentView]
          };
        }),
      setCurrentDomain: (domain: DomainView) => set({ currentDomain: domain }),
      resetToHome: () => set({ currentView: "home", currentDomain: "books", viewHistory: [] }),
      goBack: () =>
        set((state) => {
          if (state.viewHistory.length === 0) {
            return { currentView: "home", currentDomain: "books" };
          }
          const newHistory = [...state.viewHistory];
          const previousView = newHistory.pop()!;
          return { currentView: previousView, viewHistory: newHistory };
        }),
    }),
    {
      name: "shiori-ui-settings",
    }
  )
)
