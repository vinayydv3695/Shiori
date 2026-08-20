import { api } from '@/lib/tauri';
import { clearOnlineImageCache } from '@/components/manga/hooks/useUnifiedImageDecode';
import { clearProcessedChapterCache } from '@/components/reader/PremiumEpubReader';

/**
 * Android low-memory handler (wired from MainActivity.onLowMemory via a
 * `shiori-low-memory` window event). Purges the largest cached structures so
 * the process survives OS memory pressure instead of being killed:
 * - processed chapter HTML (base64 PNG/font inlined — the biggest JS buffer)
 * - proxied online image blob URLs (revoked)
 * - Rust renderer cache (open books' cached chapter strings)
 */
export function initLowMemoryHandler(): () => void {
  const handler = () => {
    clearProcessedChapterCache();
    clearOnlineImageCache();
    api.clearRendererCache().catch(() => {
      // Cache clearing is best-effort under memory pressure.
    });
  };
  window.addEventListener('shiori-low-memory', handler);
  return () => window.removeEventListener('shiori-low-memory', handler);
}