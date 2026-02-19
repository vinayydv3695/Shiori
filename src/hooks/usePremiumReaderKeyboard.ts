import { useEffect } from 'react';
import { useUIStore, useReadingSettings } from '@/store/premiumReaderStore';

interface PremiumReaderKeyboardHandlers {
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
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
 * - ArrowLeft: Previous chapter
 * - ArrowRight: Next chapter
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
      
      // Cmd/Ctrl + D: Toggle theme
      if (isMod && e.key === 'd') {
        e.preventDefault();
        toggleTheme();
        return;
      }
      
      // Cmd/Ctrl + =: Increase font size
      if (isMod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        increaseFontSize();
        return;
      }
      
      // Cmd/Ctrl + -: Decrease font size
      if (isMod && e.key === '-') {
        e.preventDefault();
        decreaseFontSize();
        return;
      }
      
      // Cmd/Ctrl + \: Cycle width
      if (isMod && e.key === '\\') {
        e.preventDefault();
        cycleWidth();
        return;
      }
      
      // f: Toggle focus mode
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFocusMode();
        return;
      }
      
      // s: Toggle sidebar
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      
      // t: Open TOC sidebar
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setSidebarTab('toc');
        return;
      }
      
      // Escape: Close sidebar or exit focus mode
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isSidebarOpen) {
          closeSidebar();
        } else if (isFocusMode) {
          toggleFocusMode();
        }
        return;
      }
      
      // ArrowLeft: Previous chapter
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlers.onPrevChapter?.();
        return;
      }
      
      // ArrowRight: Next chapter
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handlers.onNextChapter?.();
        return;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    handlers,
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
