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
import { api, isTauri } from "../lib/tauri";
import { usePreferencesStore } from "../store/preferencesStore";

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
        console.error("Failed to initialize theme:", error);
        // Fallback to white theme on error
        document.documentElement.setAttribute("data-theme", "white");
        setIsReady(true);
      }
    };

    initializeTheme();
  }, [loadPreferences]);

  // Show minimal loading screen while theme loads
  if (!isReady) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000000", // Assume black while loading
          color: "#ffffff",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "3px solid rgba(255, 255, 255, 0.2)",
              borderTopColor: "#ffffff",
              borderRadius: "50%",
              animation: "spin 0.6s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ fontSize: "14px", opacity: 0.8 }}>Loading Shiori...</p>
        </div>
        <style>
          {`
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
          `}
        </style>
      </div>
    );
  }

  return <>{children}</>;
}
