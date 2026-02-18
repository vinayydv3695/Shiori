import { create } from "zustand"
import { persist } from "zustand/middleware"

interface UIStore {
  theme: "light" | "dark"
  sidebarCollapsed: boolean
  toggleTheme: () => void
  setTheme: (theme: "light" | "dark") => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      theme: "light",
      sidebarCollapsed: false,
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "light" ? "dark" : "light",
        })),
      setTheme: (theme: "light" | "dark") => set({ theme }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    {
      name: "shiori-ui-settings",
    }
  )
)
