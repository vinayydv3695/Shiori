import { useEffect, useRef } from 'react';
import { isAndroid } from '@/lib/tauri';
import { useUIStore } from '@/store/uiStore';
import { useReaderStore } from '@/store/readerStore';

/**
 * Wires the Android hardware back button to in-app view navigation.
 *
 * Modals and the readers already intercept the back button via `useBackButton`,
 * which pushes *hash* history entries (`#view-xxx`). Plain view navigation
 * (home → library → statistics …) pushes onto `uiStore.viewHistory` but never
 * touched the browser history, so the hardware back button fell straight through
 * to the WebView's base entry and exited the app instead of returning to the
 * previous view.
 *
 * This hook keeps exactly one "nav guard" history entry present whenever the
 * user is away from the root (`home`) view. When the back button pops that
 * guard we run `goBack()` and re-arm, so back walks the view stack one step at a
 * time and only exits the app once we're back at `home`.
 *
 * Coexistence with the hash-based modal guards is handled via a state marker:
 *   - our guard entries carry `history.state = { __shioriNav: true }`
 *   - when a modal/reader entry stacked on top of our guard is popped we land
 *     back *on* our guard (its marker is present) and defer to the modal's own
 *     handler instead of navigating the view stack.
 */
const NAV_STATE_KEY = '__shioriNav';

export function useAndroidViewBack() {
  const currentView = useUIStore((s) => s.currentView);
  const armedRef = useRef(false);

  // Single popstate listener for the lifetime of the app.
  useEffect(() => {
    if (!isAndroid) return;

    const handlePopState = (e: PopStateEvent) => {
      // We landed back on our own guard → an entry above it (a modal/reader)
      // was popped and its handler will deal with the dismissal. Stay armed.
      if ((e.state as Record<string, unknown> | null)?.[NAV_STATE_KEY]) return;

      // Our guard was consumed by this back press (or there was no guard, e.g. a
      // modal closing while on home — in which case we do nothing).
      if (!armedRef.current) return;
      armedRef.current = false;

      const reader = useReaderStore.getState();
      // Reader / online-manga-reader own their own back guards; if one is somehow
      // active, leave it to them and re-arm so we keep intercepting.
      if (reader.isReaderOpen) {
        armedRef.current = true;
        window.history.pushState({ [NAV_STATE_KEY]: true }, '');
        return;
      }

      useUIStore.getState().goBack();
      // Re-arm unless goBack landed us at the root (handled by the sync effect).
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Keep exactly one guard entry present while away from home; drop it at home.
  useEffect(() => {
    if (!isAndroid) return;

    if (currentView === 'home') {
      if (armedRef.current) {
        armedRef.current = false;
        // Only pop if our guard is still the current entry (i.e. the view changed
        // programmatically, not via a back press that already consumed it).
        if ((window.history.state as Record<string, unknown> | null)?.[NAV_STATE_KEY]) {
          window.history.back();
        }
      }
      return;
    }

    if (!armedRef.current) {
      armedRef.current = true;
      window.history.pushState({ [NAV_STATE_KEY]: true }, '');
    }
  }, [currentView]);
}
