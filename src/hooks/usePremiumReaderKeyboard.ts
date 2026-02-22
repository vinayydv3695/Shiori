import { useEffect, useRef } from 'react';
import { useUIStore, useReadingSettings } from '@/store/premiumReaderStore';

interface PremiumReaderKeyboardHandlers {
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  onPrevPage?: () => void;
  onNextPage?: () => void;
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
 * - s: Toggle sidebar
 * - t: Open TOC sidebar
 * - Escape: Close sidebar or exit focus mode
 * - ArrowLeft / Left: Previous chapter
 * - ArrowRight / Right: Next chapter
 * - Space / PageDown: Next page/scroll
 * - Shift+Space / PageUp: Previous page/scroll
 */
export function usePremiumReaderKeyboard(handlers: PremiumReaderKeyboardHandlers = {}) {
  const {
    toggleSidebar,
    closeSidebar,
    toggleFocusMode,
    isSidebarOpen,
    isFocusMode,
    setSidebarTab,
  } = useUIStore();

  const {
    toggleTheme,
    increaseFontSize,
    decreaseFontSize,
    cycleWidth,
  } = useReadingSettings();

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
        toggleTheme();
        return;
      }

      // Cmd/Ctrl + =: Increase font size
      if (isMod && (key === '=' || key === '+')) {
        e.preventDefault();
        increaseFontSize();
        return;
      }

      // Cmd/Ctrl + -: Decrease font size
      if (isMod && key === '-') {
        e.preventDefault();
        decreaseFontSize();
        return;
      }

      // Cmd/Ctrl + \: Cycle width
      if (isMod && key === '\\') {
        e.preventDefault();
        cycleWidth();
        return;
      }

      // f: Toggle focus mode
      if (key === 'f' || key === 'F') {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      // s: Toggle sidebar
      if (key === 's' || key === 'S') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // t: Open TOC sidebar
      if (key === 't' || key === 'T') {
        e.preventDefault();
        setSidebarTab('toc');
        return;
      }

      // Escape: Close sidebar or exit focus mode
      if (key === 'Escape') {
        e.preventDefault();
        if (isSidebarOpen) {
          closeSidebar();
        } else if (isFocusMode) {
          toggleFocusMode();
        }
        return;
      }

      // ArrowLeft: Previous chapter
      if (key === 'ArrowLeft' || key === 'Left') {
        e.preventDefault();
        handlersRef.current.onPrevChapter?.();
        return;
      }

      // ArrowRight: Next chapter
      if (key === 'ArrowRight' || key === 'Right') {
        e.preventDefault();
        handlersRef.current.onNextChapter?.();
        return;
      }

      // Space / PageDown: Next Page
      if (key === ' ' || key === 'PageDown') {
        // Only prevent default if we have a handler, otherwise let browser scroll
        if (handlersRef.current.onNextPage) {
          e.preventDefault();
          handlersRef.current.onNextPage();
        }
        return;
      }

      // Shift+Space / PageUp: Previous Page
      if ((key === ' ' && e.shiftKey) || key === 'PageUp') {
        if (handlersRef.current.onPrevPage) {
          e.preventDefault();
          handlersRef.current.onPrevPage();
        }
        return;
      }
    };

    // Use window listener for better global coverage
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    toggleSidebar,
    closeSidebar,
    toggleFocusMode,
    isSidebarOpen,
    isFocusMode,
    setSidebarTab,
    toggleTheme,
    increaseFontSize,
    decreaseFontSize,
    cycleWidth,
  ]);
}
