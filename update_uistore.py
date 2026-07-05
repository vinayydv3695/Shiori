import re

with open('src/store/uiStore.ts', 'r') as f:
    content = f.read()

# Add viewHistory and goBack to UIStore interface
interface_pattern = r"(interface UIStore \{[^\}]+)(resetToHome: \(\) => void\n\})"
interface_replacement = r"\1resetToHome: () => void\n  viewHistory: CurrentView[]\n  goBack: () => void\n}"
content = re.sub(interface_pattern, interface_replacement, content)

# Add to initial state and modify methods
state_pattern = r"(sidebarCollapsed: false,\n\s+currentView: \"home\",\n\s+currentDomain: \"books\",)"
state_replacement = r"\1\n      viewHistory: [],"
content = re.sub(state_pattern, state_replacement, content)

set_current_view_pattern = r"(setCurrentView: \(view: CurrentView\) => set\(\{ currentView: view \}\),)"
set_current_view_replacement = r"""setCurrentView: (view: CurrentView) => 
        set((state) => {
          if (state.currentView === view) return {};
          return {
            currentView: view,
            viewHistory: [...state.viewHistory, state.currentView]
          };
        }),"""
content = re.sub(set_current_view_pattern, set_current_view_replacement, content)

reset_pattern = r"(resetToHome: \(\) => set\(\{ currentView: \"home\", currentDomain: \"books\" \}\),)"
reset_replacement = r"""resetToHome: () => set({ currentView: "home", currentDomain: "books", viewHistory: [] }),
      goBack: () =>
        set((state) => {
          if (state.viewHistory.length === 0) {
            return { currentView: "home", currentDomain: "books" };
          }
          const newHistory = [...state.viewHistory];
          const previousView = newHistory.pop()!;
          return { currentView: previousView, viewHistory: newHistory };
        }),"""
content = re.sub(reset_pattern, reset_replacement, content)

with open('src/store/uiStore.ts', 'w') as f:
    f.write(content)
