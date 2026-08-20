import { isAndroid } from '@/lib/tauri';

/**
 * Triggers subtle haptic vibration feedback on Android / mobile touch devices.
 * Default 12ms tick for crisp tactile feedback during page turns and tap navigation.
 */
export function triggerHaptic(ms = 12) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(ms);
    } catch {
      // Best effort — ignore if disabled or unsupported
    }
  }
}
