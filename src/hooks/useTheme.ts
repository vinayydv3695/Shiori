import { usePreferencesStore } from '@/store/preferencesStore'
import type { Theme } from '@/types/preferences'

export const isDarkTheme = (t: Theme | string) => {
  return (
    t === 'premium-dark' ||
    t === 'dark' ||
    t === 'black' ||
    t === 'midnight-pink' ||
    t === 'catppuccin-mocha' ||
    t === 'dracula' ||
    t === 'nord' ||
    t === 'tokyo-night' ||
    t === 'rose-pine-moon' ||
    t === 'high-contrast'
  )
}

/**
 * Compatibility wrapper around preferencesStore for theme access.
 * Defaults to 'sepia' mode with 'premium-dark' as the primary dark mode.
 */
export function useTheme() {
  const preferences = usePreferencesStore((s) => s.preferences)
  const updateTheme = usePreferencesStore((s) => s.updateTheme)

  const theme: Theme = preferences?.theme ?? 'sepia'
  const isDark = isDarkTheme(theme)

  const setTheme = (t: Theme) => {
    updateTheme(t)
  }

  const toggleTheme = () => {
    updateTheme(isDark ? 'sepia' : 'premium-dark')
  }

  return { theme, setTheme, toggleTheme, isDark }
}
