import { usePreferencesStore } from '@/store/preferencesStore'
import type { Theme } from '@/types/preferences'

/**
 * Legacy compatibility wrapper around preferencesStore for theme access.
 * Prefer using `usePreferencesStore` directly in new code.
 */
export function useTheme() {
  const preferences = usePreferencesStore((s) => s.preferences)
  const updateTheme = usePreferencesStore((s) => s.updateTheme)

  const theme: Theme = preferences?.theme ?? 'white'

  const setTheme = (t: Theme) => {
    updateTheme(t)
  }

  const toggleTheme = () => {
    updateTheme(theme === 'black' ? 'white' : 'black')
  }

  return { theme, setTheme, toggleTheme }
}
