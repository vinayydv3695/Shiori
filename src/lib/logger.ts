import { recordAction } from '@/store/actionLogStore'

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

// Mirror every log line into the (opt-in) action log so it captures how the app
// responded to user actions. recordAction is a no-op unless logging is enabled,
// and never throws — so a logging failure can't break the real log call.
const mirror = (category: string, args: unknown[]): void => {
  try {
    recordAction(category, ...args)
  } catch {
    // ignore
  }
}

export const logger = {
  debug: (...args: unknown[]): void => {
    mirror('debug', args)
    if (isDebugEnabled()) {
      console.debug('[Shiori]', ...args)
    }
  },
  info: (...args: unknown[]): void => {
    mirror('info', args)
    console.info('[Shiori]', ...args)
  },
  warn: (...args: unknown[]): void => {
    mirror('warn', args)
    console.warn('[Shiori]', ...args)
  },
  error: (...args: unknown[]): void => {
    mirror('error', args)
    console.error('[Shiori]', ...args)
  },
}
