import { useEffect, useCallback, useRef } from 'react';
import { useMangaContentStore, useMangaUIStore, useMangaSettingsStore } from '@/store/mangaReaderStore';
import { useToastStore } from '@/store/toastStore';

/**
 * Keyboard shortcut handler for the manga reader.
 * RTL-aware arrow key navigation.
 */
export function useMangaKeyboard(onClose: () => void) {
    const nextPage = useMangaContentStore(s => s.nextPage);
    const prevPage = useMangaContentStore(s => s.prevPage);
    const setCurrentPage = useMangaContentStore(s => s.setCurrentPage);
    const totalPages = useMangaContentStore(s => s.totalPages);

    const toggleSidebar = useMangaUIStore(s => s.toggleSidebar);
    const closeSidebar = useMangaUIStore(s => s.closeSidebar);
    const isSidebarOpen = useMangaUIStore(s => s.isSidebarOpen);
    const toggleSettings = useMangaUIStore(s => s.toggleSettings);
    const isSettingsOpen = useMangaUIStore(s => s.isSettingsOpen);
    const closeSettings = useMangaUIStore(s => s.closeSettings);

    const readingDirection = useMangaSettingsStore(s => s.readingDirection);
    const readingMode = useMangaSettingsStore(s => s.readingMode);
    const setReadingMode = useMangaSettingsStore(s => s.setReadingMode);
    const toggleTheme = useMangaSettingsStore(s => s.toggleTheme);

    const rtl = readingDirection === 'rtl';
    const step = readingMode === 'double' ? 2 : 1;

    // Debounce boundary toasts to avoid spam (same pattern as NavigationOverlay)
    const lastBoundaryToast = useRef(0);

    const showBoundaryToast = useCallback((direction: 'forward' | 'backward') => {
        const now = Date.now();
        if (now - lastBoundaryToast.current < 2000) return;
        lastBoundaryToast.current = now;
        useToastStore.getState().addToast({
            title: direction === 'backward' ? "You're at the first page" : "You've reached the last page",
            variant: 'info',
            duration: 1500,
        });
    }, []);

    const goForward = useCallback((s: number) => {
        const moved = nextPage(s);
        if (!moved) showBoundaryToast('forward');
    }, [nextPage, showBoundaryToast]);

    const goBackward = useCallback((s: number) => {
        const moved = prevPage(s);
        if (!moved) showBoundaryToast('backward');
    }, [prevPage, showBoundaryToast]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Don't handle if user is typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
            return;
        }

        const key = e.key;
        const shift = e.shiftKey;

        switch (key) {
            case 'ArrowRight':
                e.preventDefault();
                rtl ? goBackward(step) : goForward(step);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                rtl ? goForward(step) : goBackward(step);
                break;
            case 'ArrowDown':
                e.preventDefault();
                goForward(step);
                break;
            case 'ArrowUp':
                e.preventDefault();
                goBackward(step);
                break;
            case ' ':
                e.preventDefault();
                shift ? goBackward(step) : goForward(step);
                break;
            case 'Home':
                e.preventDefault();
                setCurrentPage(0);
                break;
            case 'End':
                e.preventDefault();
                setCurrentPage(totalPages - 1);
                break;
            case 'Escape':
                e.preventDefault();
                if (isSettingsOpen) {
                    closeSettings();
                } else if (isSidebarOpen) {
                    closeSidebar();
                } else {
                    onClose();
                }
                break;
            case 's':
            case 'S':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    toggleSidebar();
                }
                break;
            case '1':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    setReadingMode('single');
                }
                break;
            case '2':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    setReadingMode('double');
                }
                break;
            case '3':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    setReadingMode('strip');
                }
                break;
            case ',':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    toggleSettings();
                }
                break;
            case 'd':
            case 'D':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    toggleTheme();
                }
                break;
            default:
                break;
        }
    }, [
        rtl, step, goForward, goBackward, setCurrentPage, totalPages,
        toggleSidebar, closeSidebar, isSidebarOpen,
        toggleSettings, isSettingsOpen, closeSettings,
        setReadingMode, toggleTheme, onClose
    ]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
