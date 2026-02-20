import { useEffect, useCallback } from 'react';
import { useMangaContentStore, useMangaUIStore, useMangaSettingsStore } from '@/store/mangaReaderStore';

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
    const setReadingMode = useMangaSettingsStore(s => s.setReadingMode);
    const toggleTheme = useMangaSettingsStore(s => s.toggleTheme);

    const rtl = readingDirection === 'rtl';

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
                rtl ? prevPage() : nextPage();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                rtl ? nextPage() : prevPage();
                break;
            case 'ArrowDown':
                e.preventDefault();
                nextPage();
                break;
            case 'ArrowUp':
                e.preventDefault();
                prevPage();
                break;
            case ' ':
                e.preventDefault();
                shift ? prevPage() : nextPage();
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
        rtl, nextPage, prevPage, setCurrentPage, totalPages,
        toggleSidebar, closeSidebar, isSidebarOpen,
        toggleSettings, isSettingsOpen, closeSettings,
        setReadingMode, toggleTheme, onClose
    ]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
