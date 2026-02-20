import React, { useEffect, useCallback } from 'react';
import {
    useMangaContentStore,
    useMangaUIStore,
    useMangaSettingsStore,
} from '@/store/mangaReaderStore';
import { MangaTopBar } from './MangaTopBar';
import { MangaCanvas } from './MangaCanvas';
import { MangaSidebar } from './MangaSidebar';
import { AdvancedSettingsPanel } from './AdvancedSettingsPanel';
import { MangaProgressBar } from './MangaProgressBar';
import { NavigationOverlay } from './NavigationOverlay';
import { useMangaKeyboard } from './hooks/useMangaKeyboard';
import { imageCache } from './hooks/useMangaPreloader';

// Import manga reader styles
import '@/styles/manga-reader.css';

interface MangaReaderProps {
    bookId: number;
    bookPath: string;
    title?: string;
    totalPages?: number;
    onClose: () => void;
}

/**
 * Root manga reader component.
 * Full-screen overlay orchestrating all sub-components.
 */
export function MangaReader({
    bookId,
    bookPath,
    title = '',
    totalPages = 0,
    onClose,
}: MangaReaderProps) {
    const openManga = useMangaContentStore(s => s.openManga);
    const closeManga = useMangaContentStore(s => s.closeManga);
    const isLoading = useMangaContentStore(s => s.isLoading);
    const error = useMangaContentStore(s => s.error);
    const setLoading = useMangaContentStore(s => s.setLoading);
    const setError = useMangaContentStore(s => s.setError);
    const theme = useMangaSettingsStore(s => s.theme);

    // Initialize manga state
    useEffect(() => {
        const init = async () => {
            setLoading(true);
            setError(null);
            try {
                // Try to open via IPC
                const { invoke } = await import('@tauri-apps/api/core');
                const metadata = await invoke<{
                    title: string;
                    page_count: number;
                    page_dimensions?: [number, number][];
                }>('open_manga', { bookId, path: bookPath });

                openManga(
                    bookId,
                    bookPath,
                    metadata.title || title,
                    metadata.page_count || totalPages,
                    metadata.page_dimensions
                );
            } catch (err) {
                // Fallback: use provided props if IPC not available yet
                console.warn('[MangaReader] IPC open_manga not available, using props:', err);
                openManga(bookId, bookPath, title, totalPages);
            }
            setLoading(false);
        };

        init();

        return () => {
            // Cleanup on unmount
            closeManga();
            imageCache.clear();
        };
    }, [bookId, bookPath]);

    // Apply theme on mount
    useEffect(() => {
        document.documentElement.setAttribute('data-manga-theme', theme);
    }, [theme]);

    // Close handler
    const handleClose = useCallback(() => {
        closeManga();
        imageCache.clear();
        onClose();
    }, [closeManga, onClose]);

    // Register keyboard shortcuts
    useMangaKeyboard(handleClose);

    if (isLoading) {
        return (
            <div className="manga-reader" data-manga-theme={theme}>
                <div className="manga-loading-screen">
                    <div className="manga-loading-spinner" />
                    <span className="manga-loading-text">Loading manga…</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="manga-reader" data-manga-theme={theme}>
                <div className="manga-loading-screen">
                    <span className="manga-loading-text" style={{ color: 'var(--manga-accent)' }}>
                        Error: {error}
                    </span>
                    <button className="manga-btn-done" onClick={handleClose}>
                        Close
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="manga-reader" tabIndex={-1}>
            <MangaTopBar onClose={handleClose} />
            <MangaCanvas />
            <NavigationOverlay />
            <MangaSidebar />
            <AdvancedSettingsPanel />
            <MangaProgressBar />
        </div>
    );
}
