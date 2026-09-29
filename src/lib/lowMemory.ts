import { api } from '@/lib/tauri';

/**
 * Android low-memory handler (wired from MainActivity.onLowMemory via a
 * `shiori-low-memory` window event). Purges the largest cached structures so
 * the process survives OS memory pressure instead of being killed:
 * - processed chapter HTML (base64 PNG/font inlined — the biggest JS buffer)
 * - proxied online image blob URLs (revoked)
 * - Rust renderer cache (open books' cached chapter strings)
 *
 * Slice F5: the purge targets are loaded with DYNAMIC imports. This module is
 * imported eagerly by App.tsx, and its former static imports of
 * PremiumEpubReader / useUnifiedImageDecode dragged the whole reader stack
 * (react-markdown, TTS, AniList literals) into the 1.5 MB entry chunk —
 * verified with perf/tools/eager-graph.mjs. On a low-memory event the dynamic
 * import resolves immediately (the reader is usually the thing that was open).
 */
export function initLowMemoryHandler(): () => void {
  const handler = () => {
    void import('@/components/reader/PremiumEpubReader')
      .then((m) => m.clearProcessedChapterCache())
      .catch(() => { /* best-effort */ });
    void import('@/components/manga/hooks/useUnifiedImageDecode')
      .then((m) => m.clearOnlineImageCache())
      .catch(() => { /* best-effort */ });
    api.clearRendererCache().catch(() => {
      // Cache clearing is best-effort under memory pressure.
    });
  };
  window.addEventListener('shiori-low-memory', handler);
  return () => window.removeEventListener('shiori-low-memory', handler);
}