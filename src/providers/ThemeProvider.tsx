/**
 * ThemeProvider with No-Flash Loading
 * 
 * CRITICAL: This provider ensures the theme is applied BEFORE React renders
 * to prevent any flash of unstyled content (FOUC).
 * 
 * How it works:
 * 1. Theme is loaded synchronously from backend during HTML load
 * 2. Applied to <html data-theme="..."> before React hydration
 * 3. Shows loading screen until theme is applied
 * 4. Then loads full preferences asynchronously
 */

import { ReactNode, useEffect, useState } from "react";
import { isTauri } from "../lib/tauri";
import { logger } from "../lib/logger";
import { usePreferencesStore } from "../store/preferencesStore";

import '../styles/themes/rose-pine-moon.css';
import '../styles/themes/catppuccin-mocha.css';
import '../styles/themes/nord.css';
import '../styles/themes/dracula.css';
import '../styles/themes/tokyo-night.css';

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const loadPreferences = usePreferencesStore((state) => state.loadPreferences);

  useEffect(() => {
    const initializeTheme = async () => {
      if (!isTauri) {
        // Browser mode: use default theme
        document.documentElement.setAttribute("data-theme", "white");
        setIsReady(true);
        return;
      }

      try {
        // Step 1: Load full preferences (includes theme, book/manga defaults, overrides)
        await loadPreferences();
        setIsReady(true);
      } catch (error) {
        logger.error("Failed to initialize theme:", error);
        // Fallback to light theme on error
        document.documentElement.setAttribute("data-theme", "white");
        setIsReady(true);
      }
    };

    initializeTheme();
  }, [loadPreferences]);

  // Show minimal loading screen while theme loads
  // Apply default theme early to avoid flash
  if (!isReady && isTauri) {
    // For Tauri mode: ensure default theme is set before showing loading screen
    if (!document.documentElement.hasAttribute("data-theme")) {
      document.documentElement.setAttribute("data-theme", "white");
    }
  }

  if (!isReady) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-muted border-t-foreground rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm opacity-80">Loading Shiori...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
