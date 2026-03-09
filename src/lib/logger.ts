const isDev = import.meta.env.DEV

// Lazy import to avoid circular dependency
// (preferencesStore imports logger, so logger must not import preferencesStore at top level)
const isDebugEnabled = (): boolean => {
  if (isDev) return true
  
  try {
    // Dynamically import store to check debug flag (only after store is initialized)
    const storeModule = (window as any).__PREFERENCES_STORE__
    return storeModule?.getState?.()?.preferences?.debugLogging ?? false
  } catch {
    return false
  }
}

export const logger = {
  debug: (...args: unknown[]): void => {
    if (isDebugEnabled()) {
      console.debug('[Shiori]', ...args)
    }
  },
  info: (...args: unknown[]): void => {
    console.info('[Shiori]', ...args)
  },
  warn: (...args: unknown[]): void => {
    console.warn('[Shiori]', ...args)
  },
  error: (...args: unknown[]): void => {
    console.error('[Shiori]', ...args)
  },
}
