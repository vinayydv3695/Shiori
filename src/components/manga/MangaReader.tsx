import React, { useEffect, useCallback, useRef } from 'react';
import {
    useMangaContentStore,
    useMangaSettingsStore,
} from '@/store/mangaReaderStore';
import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { useToastStore } from '@/store/toastStore';
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

const PLACEHOLDER: [number, number] = [800, 1200];

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
    const pageDimensions = useMangaContentStore(s => s.pageDimensions);
    const mergePageDimensions = useMangaContentStore(s => s.mergePageDimensions);
    const isLoading = useMangaContentStore(s => s.isLoading);
    const error = useMangaContentStore(s => s.error);
    const setLoading = useMangaContentStore(s => s.setLoading);
    const setError = useMangaContentStore(s => s.setError);
    const theme = useMangaSettingsStore(s => s.theme);

    // Guard: don't save progress until initialization + resume is complete
    const initCompleteRef = useRef(false);

    // Initialize manga state and load reading progress
    useEffect(() => {
        let cancelled = false;

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

                if (cancelled) return;

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
                     if (cancelled) return;
                     if (progress && progress.currentPage !== undefined) {
                         logger.debug('[MangaReader] Resuming from page:', progress.currentPage);
                         setCurrentPage(progress.currentPage);
                         if (progress.currentPage > 0) {
                             useToastStore.getState().addToast({
                                 title: 'Resuming reading',
                                 description: `Page ${progress.currentPage + 1} of ${metadata.page_count}`,
                                 variant: 'info',
                                 duration: 3000,
                             });
                         }
                     }
                 } catch (progressErr) {
                     logger.warn('[MangaReader] Failed to load reading progress:', progressErr);
                 }

                 if (!cancelled) {
                     initCompleteRef.current = true;
                 }
             } catch (err) {
                 if (cancelled) return;
                 // Fallback: use provided props if IPC not available yet
                 logger.warn('[MangaReader] IPC open_manga not available, using props:', err);
                 openManga(bookId, bookPath, title, totalPages);
                 initCompleteRef.current = true;
             }
            if (!cancelled) {
                setLoading(false);
            }
        };

        init();

        return () => {
            cancelled = true;
            initCompleteRef.current = false;
             // Release the backend ZIP archive to free ~200MB/book
             api.closeManga(bookId).catch(err =>
                 logger.warn('[MangaReader] Failed to close manga backend:', err)
             );
            // Cleanup frontend state
            closeManga();
            imageCache.clear();
        };
    }, [bookId, bookPath, title, totalPages, openManga, closeManga, setLoading, setError, setCurrentPage]);

    // Apply theme on mount
    useEffect(() => {
        document.documentElement.setAttribute('data-manga-theme', theme);
    }, [theme]);

    // Progressively fetch real page dimensions (backend returns placeholder 800x1200 on open).
    // On each page change, request dimensions for a window of ±10 pages around the viewport.
    const fetchedDimsRef = useRef(new Set<number>());

    useEffect(() => {
        if (!bookId || mangaTotalPages === 0 || !initCompleteRef.current) return;

        const start = Math.max(0, currentPage - 10);
        const end = Math.min(mangaTotalPages, currentPage + 20);
        const needed: number[] = [];

        for (let i = start; i < end; i++) {
            if (!fetchedDimsRef.current.has(i)) {
                // Check if still placeholder
                const dim = pageDimensions[i];
                if (!dim || (dim[0] === PLACEHOLDER[0] && dim[1] === PLACEHOLDER[1])) {
                    needed.push(i);
                } else {
                    // Already real, mark as fetched
                    fetchedDimsRef.current.add(i);
                }
            }
        }

        if (needed.length === 0) return;

        let cancelled = false;
        api.getMangaPageDimensions(bookId, needed).then(dims => {
            if (cancelled) return;
            for (const idx of needed) fetchedDimsRef.current.add(idx);
            mergePageDimensions(needed, dims);
         }).catch(err => {
             logger.warn('[MangaReader] Failed to fetch page dimensions:', err);
         });

        return () => { cancelled = true; };
    }, [bookId, currentPage, mangaTotalPages, pageDimensions, mergePageDimensions]);

    // Save reading progress when page changes
    useEffect(() => {
        // Skip saving until initialization + resume is complete
        if (!initCompleteRef.current) return;

        if (currentPage === 0 && mangaTotalPages === 0) {
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
                 logger.debug('[MangaReader] Saved progress:', { currentPage, total: mangaTotalPages, percent: progressPercent });
             } catch (err) {
                 logger.warn('[MangaReader] Failed to save reading progress:', err);
            }
        };

        // Debounce saves to avoid excessive calls
        const timeoutId = setTimeout(saveProgress, 1000);
        return () => clearTimeout(timeoutId);
    }, [bookId, currentPage, mangaTotalPages]);

     // Close handler
     const handleClose = useCallback(() => {
         // Release the backend ZIP archive to free memory
         api.closeManga(bookId).catch(err =>
             logger.warn('[MangaReader] Failed to close manga backend:', err)
         );
        closeManga();
        imageCache.clear();
        onClose();
    }, [bookId, closeManga, onClose]);

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
