import { useEffect, useRef } from 'react';
import { useReaderUIStore, useReadingSettings } from '@/store/premiumReaderStore';

export interface PremiumReaderKeyboardHandlers {
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onScrollUp?: () => void;
  onScrollDown?: () => void;
  isPaginatedOrTwoPage?: boolean;
}

/**
 * Premium Reader Keyboard Shortcuts
 * 
 * Global shortcuts:
 * - Cmd/Ctrl + D: Toggle theme
 * - Cmd/Ctrl + +: Increase font size
 * - Cmd/Ctrl + -: Decrease font size
 * - Cmd/Ctrl + \: Cycle width (narrow → medium → wide → full)
 * - f: Toggle focus mode
 * - h: Toggle top bar visibility
 * - s: Toggle sidebar
 * - t: Open TOC sidebar
 * - Escape: Close sidebar or exit focus mode
 * - ArrowLeft / Left: Previous Page (in paginated/2-page) or Previous Chapter (in vertical mode)
 * - ArrowRight / Right: Next Page (in paginated/2-page) or Next Chapter (in vertical mode)
 * - ArrowUp / Up: Line scroll up (in vertical) or Previous Page (in paginated/2-page)
 * - ArrowDown / Down: Line scroll down (in vertical) or Next Page (in paginated/2-page)
 * - Space / PageDown: Next page / scroll down by screen
 * - Shift+Space / PageUp: Previous page / scroll up by screen
 */
export function usePremiumReaderKeyboard(handlers: PremiumReaderKeyboardHandlers = {}) {
  // Use a ref for handlers to avoid re-registering the event listener on every render
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Ignore shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key;

      // Cmd/Ctrl + D: Toggle theme
      if (isMod && key === 'd') {
        e.preventDefault();
        useReadingSettings.getState().toggleTheme();
        return;
      }

      // Cmd/Ctrl + =: Increase font size
      if (isMod && (key === '=' || key === '+')) {
        e.preventDefault();
        useReadingSettings.getState().increaseFontSize();
        return;
      }

      // Cmd/Ctrl + -: Decrease font size
      if (isMod && key === '-') {
        e.preventDefault();
        useReadingSettings.getState().decreaseFontSize();
        return;
      }

      // Cmd/Ctrl + \: Cycle width
      if (isMod && key === '\\') {
        e.preventDefault();
        useReadingSettings.getState().cycleWidth();
        return;
      }

      // f: Toggle focus mode
      if (key === 'f' || key === 'F') {
        e.preventDefault();
        useReaderUIStore.getState().toggleFocusMode();
        return;
      }

      // h: Toggle top bar visibility
      if (key === 'h' || key === 'H') {
        e.preventDefault();
        const state = useReaderUIStore.getState();
        state.setTopBarVisible(!state.isTopBarVisible);
        return;
      }

      // s: Toggle sidebar
      if (key === 's' || key === 'S') {
        e.preventDefault();
        useReaderUIStore.getState().toggleSidebar();
        return;
      }

      // t: Open TOC sidebar
      if (key === 't' || key === 'T') {
        e.preventDefault();
        useReaderUIStore.getState().setSidebarTab('toc');
        return;
      }

      // Escape: Close sidebar or exit focus mode
      if (key === 'Escape') {
        e.preventDefault();
        const state = useReaderUIStore.getState();
        if (state.isSidebarOpen) {
          state.closeSidebar();
        } else if (state.isFocusMode) {
          state.toggleFocusMode();
        }
        return;
      }

      // ArrowLeft / Left: Previous Page in 2-page/paginated, or Previous Chapter in vertical mode
      if (key === 'ArrowLeft' || key === 'Left') {
        e.preventDefault();
        if (isMod) {
          handlersRef.current.onPrevChapter?.();
        } else if (handlersRef.current.isPaginatedOrTwoPage) {
          handlersRef.current.onPrevPage?.();
        } else {
          handlersRef.current.onPrevChapter?.();
        }
        return;
      }

      // ArrowRight / Right: Next Page in 2-page/paginated, or Next Chapter in vertical mode
      if (key === 'ArrowRight' || key === 'Right') {
        e.preventDefault();
        if (isMod) {
          handlersRef.current.onNextChapter?.();
        } else if (handlersRef.current.isPaginatedOrTwoPage) {
          handlersRef.current.onNextPage?.();
        } else {
          handlersRef.current.onNextChapter?.();
        }
        return;
      }

      // ArrowUp / Up: Scroll line up in vertical mode, or Previous Page in 2-page/paginated mode
      if (key === 'ArrowUp' || key === 'Up') {
        e.preventDefault();
        if (handlersRef.current.isPaginatedOrTwoPage) {
          handlersRef.current.onPrevPage?.();
        } else if (handlersRef.current.onScrollUp) {
          handlersRef.current.onScrollUp();
        } else {
          handlersRef.current.onPrevPage?.();
        }
        return;
      }

      // ArrowDown / Down: Scroll line down in vertical mode, or Next Page in 2-page/paginated mode
      if (key === 'ArrowDown' || key === 'Down') {
        e.preventDefault();
        if (handlersRef.current.isPaginatedOrTwoPage) {
          handlersRef.current.onNextPage?.();
        } else if (handlersRef.current.onScrollDown) {
          handlersRef.current.onScrollDown();
        } else {
          handlersRef.current.onNextPage?.();
        }
        return;
      }

      // Shift+Space / PageUp: Previous Page / Scroll up by screen (must be checked BEFORE Space)
      if ((key === ' ' && e.shiftKey) || key === 'PageUp') {
        e.preventDefault();
        handlersRef.current.onPrevPage?.();
        return;
      }

      // Space / PageDown: Next Page / Scroll down by screen
      if (key === ' ' || key === 'PageDown') {
        e.preventDefault();
        handlersRef.current.onNextPage?.();
        return;
      }
    };

    // Use window listener for better global coverage
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
