import React, { useEffect, useCallback, useRef } from 'react';
import {
    useMangaContentStore,
    useMangaSettingsStore,
    type OnlineSourceConfig,
} from '@/store/mangaReaderStore';
import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { useToastStore } from '@/store/toastStore';
import { MangaCanvas } from './MangaCanvas';
import { MangaSidebar } from './MangaSidebar';
import { AdvancedSettingsPanel } from './AdvancedSettingsPanel';
import { MangaProgressBar } from './MangaProgressBar';
import { NavigationOverlay } from './NavigationOverlay';
import { MangaReaderHeader } from './MangaReaderHeader';
import { useMangaKeyboard } from './hooks/useMangaKeyboard';
import { imageCache } from './hooks/useMangaPreloader';
import { clearOnlineImageCache } from './hooks/useUnifiedImageDecode';

// Import manga reader styles
import '@/styles/manga-reader.css';

const PLACEHOLDER: [number, number] = [800, 1200];

// Props for local manga
interface LocalMangaReaderProps {
    mode: 'local';
    bookId: number;
    bookPath: string;
    title?: string;
    totalPages?: number;
    onClose: () => void;
}

// Props for online manga
interface OnlineMangaReaderProps {
    mode: 'online';
    sourceConfig: OnlineSourceConfig;
    onClose: () => void;
    onChapterChange?: (chapterId: string) => Promise<{ pageUrls: string[]; chapterTitle: string }>;
}

export type MangaReaderProps = LocalMangaReaderProps | OnlineMangaReaderProps;

/**
 * Root manga reader component.
 * Full-screen overlay orchestrating all sub-components.
 * Supports both local files and online sources.
 */
export function MangaReader(props: MangaReaderProps) {
    const { onClose } = props;
    const mode = props.mode;
    
    const openManga = useMangaContentStore(s => s.openManga);
    const openOnlineManga = useMangaContentStore(s => s.openOnlineManga);
    const closeManga = useMangaContentStore(s => s.closeManga);
    const sourceType = useMangaContentStore(s => s.sourceType);
    const currentPage = useMangaContentStore(s => s.currentPage);
    const setCurrentPage = useMangaContentStore(s => s.setCurrentPage);
    const mangaTotalPages = useMangaContentStore(s => s.totalPages);
    const pageDimensions = useMangaContentStore(s => s.pageDimensions);
    const mergePageDimensions = useMangaContentStore(s => s.mergePageDimensions);
    const isLoading = useMangaContentStore(s => s.isLoading);
    const error = useMangaContentStore(s => s.error);
    const setLoading = useMangaContentStore(s => s.setLoading);
    const setError = useMangaContentStore(s => s.setError);
    const bookId = useMangaContentStore(s => s.bookId);
    const onlineSource = useMangaContentStore(s => s.onlineSource);
    const theme = useMangaSettingsStore(s => s.theme);

    // Guard: don't save progress until initialization + resume is complete
    const initCompleteRef = useRef(false);

    // Extract stable values from props for dependencies
    const localBookId = mode === 'local' ? props.bookId : null;
    const localBookPath = mode === 'local' ? props.bookPath : null;
    const localTitle = mode === 'local' ? (props.title ?? '') : '';
    const localTotalPages = mode === 'local' ? (props.totalPages ?? 0) : 0;
    const onlineConfig = mode === 'online' ? props.sourceConfig : null;

    // Initialize manga state based on mode
    useEffect(() => {
        let cancelled = false;

        const initLocal = async () => {
            if (localBookId === null || localBookPath === null) return;
            
            setLoading(true);
            setError(null);
            try {
                // Try to open via IPC
                const { invoke } = await import('@tauri-apps/api/core');
                const metadata = await invoke<{
                    title: string;
                    page_count: number;
                    page_dimensions?: [number, number][];
                }>('open_manga', { bookId: localBookId, path: localBookPath });

                if (cancelled) return;

                openManga(
                    localBookId,
                    localBookPath,
                    metadata.title || localTitle,
                    metadata.page_count || localTotalPages,
                    metadata.page_dimensions
                );

                // Load reading progress and resume from last page
                try {
                    const progress = await api.getReadingProgress(localBookId);
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
                openManga(localBookId, localBookPath, localTitle, localTotalPages);
                initCompleteRef.current = true;
            }
            if (!cancelled) {
                setLoading(false);
            }
        };

        const initOnline = async () => {
            if (!onlineConfig) return;
            
            setLoading(true);
            setError(null);
            
            try {
                openOnlineManga(onlineConfig);
                
                // Try to load saved progress for this online manga
                const progressKey = `online:${onlineConfig.sourceId}:${onlineConfig.contentId}`;
                try {
                    const savedProgress = localStorage.getItem(`shiori-manga-progress:${progressKey}`);
                    if (savedProgress) {
                        const { chapterId, page } = JSON.parse(savedProgress);
                        if (chapterId === onlineConfig.chapterId && page > 0) {
                            setCurrentPage(page);
                            useToastStore.getState().addToast({
                                title: 'Resuming reading',
                                description: `Page ${page + 1} of ${onlineConfig.pageUrls.length}`,
                                variant: 'info',
                                duration: 3000,
                            });
                        }
                    }
                } catch {
                    // Ignore progress load errors
                }
                
                initCompleteRef.current = true;
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : 'Failed to load online manga');
            }
            
            if (!cancelled) {
                setLoading(false);
            }
        };

        if (mode === 'local') {
            initLocal();
        } else {
            initOnline();
        }

        return () => {
            cancelled = true;
            initCompleteRef.current = false;
            
            // Cleanup based on mode
            if (mode === 'local' && localBookId !== null) {
                // Release the backend ZIP archive to free ~200MB/book
                api.closeManga(localBookId).catch(err =>
                    logger.warn('[MangaReader] Failed to close manga backend:', err)
                );
                imageCache.clear();
            } else {
                // Clear online image cache
                clearOnlineImageCache();
            }
            
            // Cleanup frontend state
            closeManga();
        };
    }, [mode, localBookId, localBookPath, localTitle, localTotalPages, onlineConfig, 
        openManga, openOnlineManga, closeManga, setLoading, setError, setCurrentPage]);

    // Apply theme on mount
    useEffect(() => {
        document.documentElement.setAttribute('data-manga-theme', theme);
    }, [theme]);

    // Progressively fetch real page dimensions (local only)
    const fetchedDimsRef = useRef(new Set<number>());

    useEffect(() => {
        if (sourceType !== 'local' || !bookId || mangaTotalPages === 0 || !initCompleteRef.current) return;

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
    }, [sourceType, bookId, currentPage, mangaTotalPages, pageDimensions, mergePageDimensions]);

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
                
                if (sourceType === 'local' && bookId) {
                    await api.saveReadingProgress(
                        bookId,
                        `page_${currentPage}`,
                        progressPercent,
                        currentPage,
                        mangaTotalPages
                    );
                    logger.debug('[MangaReader] Saved local progress:', { currentPage, total: mangaTotalPages, percent: progressPercent });
                } else if (sourceType === 'online' && onlineSource) {
                    // Save online progress to localStorage
                    const progressKey = `online:${onlineSource.sourceId}:${onlineSource.contentId}`;
                    localStorage.setItem(`shiori-manga-progress:${progressKey}`, JSON.stringify({
                        chapterId: onlineSource.chapterId,
                        page: currentPage,
                        timestamp: Date.now(),
                    }));
                    logger.debug('[MangaReader] Saved online progress:', { 
                        sourceId: onlineSource.sourceId,
                        contentId: onlineSource.contentId,
                        chapterId: onlineSource.chapterId,
                        currentPage, 
                        total: mangaTotalPages 
                    });
                }
            } catch (err) {
                logger.warn('[MangaReader] Failed to save reading progress:', err);
            }
        };

        // Debounce saves to avoid excessive calls
        const timeoutId = setTimeout(saveProgress, 1000);
        return () => clearTimeout(timeoutId);
    }, [sourceType, bookId, onlineSource, currentPage, mangaTotalPages]);

    // Close handler
    const handleClose = useCallback(() => {
        if (sourceType === 'local' && bookId) {
            // Release the backend ZIP archive to free memory
            api.closeManga(bookId).catch(err =>
                logger.warn('[MangaReader] Failed to close manga backend:', err)
            );
            imageCache.clear();
        } else {
            clearOnlineImageCache();
        }
        closeManga();
        onClose();
    }, [sourceType, bookId, closeManga, onClose]);

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
                    <button type="button" className="manga-btn-done" onClick={handleClose}>
                        Close
                    </button>
                </div>
            </div>
        );
    }

    // Get onChapterChange from props if online mode
    const onChapterChange = props.mode === 'online' ? props.onChapterChange : undefined;

    return (
        <div className="manga-reader" tabIndex={-1}>
            <MangaReaderHeader 
                onClose={handleClose} 
                onChapterChange={onChapterChange}
            />
            <MangaCanvas />
            <NavigationOverlay />
            <MangaSidebar />
            <AdvancedSettingsPanel />
            <MangaProgressBar />
        </div>
    );
}
