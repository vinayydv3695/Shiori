import React, { useEffect, useCallback } from 'react';
import {
    useMangaContentStore,
    useMangaUIStore,
    useMangaSettingsStore,
} from '@/store/mangaReaderStore';
import { api } from '@/lib/tauri';
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
    const currentPage = useMangaContentStore(s => s.currentPage);
    const setCurrentPage = useMangaContentStore(s => s.setCurrentPage);
    const mangaTotalPages = useMangaContentStore(s => s.totalPages);
    const isLoading = useMangaContentStore(s => s.isLoading);
    const error = useMangaContentStore(s => s.error);
    const setLoading = useMangaContentStore(s => s.setLoading);
    const setError = useMangaContentStore(s => s.setError);
    const theme = useMangaSettingsStore(s => s.theme);

    // Initialize manga state and load reading progress
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

                // Load reading progress and resume from last page
                try {
                    const progress = await api.getReadingProgress(bookId);
                    if (progress && progress.currentPage !== undefined) {
                        console.log('[MangaReader] Resuming from page:', progress.currentPage);
                        setCurrentPage(progress.currentPage);
                    }
                } catch (progressErr) {
                    console.warn('[MangaReader] Failed to load reading progress:', progressErr);
                }
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

    // Save reading progress when page changes
    useEffect(() => {
        if (currentPage === 0 && mangaTotalPages === 0) {
            // Skip saving during initialization
            return;
        }

        const saveProgress = async () => {
            try {
                const progressPercent = mangaTotalPages > 0 
                    ? ((currentPage + 1) / mangaTotalPages) * 100 
                    : 0;
                
                await api.saveReadingProgress(
                    bookId,
                    `page_${currentPage}`,
                    progressPercent,
                    currentPage,
                    mangaTotalPages
                );
                console.log('[MangaReader] Saved progress:', { currentPage, total: mangaTotalPages, percent: progressPercent });
            } catch (err) {
                console.warn('[MangaReader] Failed to save reading progress:', err);
            }
        };

        // Debounce saves to avoid excessive calls
        const timeoutId = setTimeout(saveProgress, 1000);
        return () => clearTimeout(timeoutId);
    }, [bookId, currentPage, mangaTotalPages]);

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
