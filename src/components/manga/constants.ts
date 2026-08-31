import { isAndroid } from '@/lib/tauri';

/**
 * Number of off-screen pages the manga virtualizers keep mounted.
 * Android devices get a smaller overscan to save memory/GPU.
 */
export const MANGA_OVERSCAN_DESKTOP = 8;
export const MANGA_OVERSCAN_ANDROID = 4;

/** Resolved overscan for the current platform. */
export const MANGA_OVERSCAN = isAndroid ? MANGA_OVERSCAN_ANDROID : MANGA_OVERSCAN_DESKTOP;