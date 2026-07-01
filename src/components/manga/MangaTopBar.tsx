import React, { memo, useRef, useEffect } from 'react';
import { useMangaContentStore, useMangaUIStore, useMangaSettingsStore } from '@/store/mangaReaderStore';
import { PanelRightOpen, X, ZoomIn, ZoomOut, Library, CheckCircle2 } from 'lucide-react';
import { useOnlineMangaReaderStore } from '@/store/onlineMangaReaderStore';
import { useLibraryStore } from '@/store/libraryStore';

interface MangaTopBarProps {
    onClose: () => void;
}

/**
 * Top navigation bar with auto-hide on scroll down.
 * Uses DOM class manipulation for visibility — zero React re-renders.
 */
export const MangaTopBar = memo(function MangaTopBar({ onClose }: MangaTopBarProps) {
    const title = useMangaContentStore(s => s.title);
    const currentPage = useMangaContentStore(s => s.currentPage);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const toggleSidebar = useMangaUIStore(s => s.toggleSidebar);
    const isTopBarVisible = useMangaUIStore(s => s.isTopBarVisible);
    const stickyHeader = useMangaSettingsStore(s => s.stickyHeader);
    const zoomIn = useMangaSettingsStore(s => s.zoomIn);
    const zoomOut = useMangaSettingsStore(s => s.zoomOut);
    const sourceType = useMangaContentStore(s => s.sourceType);
    
    // Online specific
    const addToLibrary = useOnlineMangaReaderStore(s => s.addToLibrary);
    const onlineSourceId = useOnlineMangaReaderStore(s => s.sourceId);
    const onlineContentId = useOnlineMangaReaderStore(s => s.contentId);
    const libraryBooks = useLibraryStore(s => s.books);
    
    const isAlreadyInLibrary = React.useMemo(() => {
        if (sourceType !== 'online' || !onlineSourceId || !onlineContentId) return false;
        const expectedPath = `online-manga://${onlineSourceId}/${onlineContentId}`;
        return libraryBooks.some(b => b.file_path === expectedPath);
    }, [sourceType, onlineSourceId, onlineContentId, libraryBooks]);

    const topBarRef = useRef<HTMLDivElement>(null);

    // Auto-hide on scroll (controlled externally via class toggle)
    // When stickyHeader is enabled, always keep the bar visible.
    useEffect(() => {
        const el = topBarRef.current;
        if (!el) return;
        if (stickyHeader || isTopBarVisible) {
            el.classList.remove('manga-topbar--hidden');
        } else {
            el.classList.add('manga-topbar--hidden');
        }
    }, [isTopBarVisible, stickyHeader]);

    return (
        <div ref={topBarRef} className="manga-topbar">
            <div className="manga-topbar-content">
                {/* Left: Logo + Title */}
                <div className="manga-topbar-left">
                    <span className="manga-logo">栞</span>
                    <div className="manga-topbar-divider" />
                    <span
                        style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: 'var(--manga-text-primary)',
                            maxWidth: '240px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {title || 'Manga Reader'}
                    </span>
                </div>

                {/* Center: Page indicator */}
                <div className="manga-topbar-center">
                    <span className="manga-indicator">
                        Page {currentPage + 1} / {totalPages}
                    </span>
                </div>

                {/* Right: Actions */}
                <div className="manga-topbar-right">
                    <button
                        className="manga-topbar-btn"
                        onClick={zoomOut}
                        title="Zoom Out"
                    >
                        <ZoomOut />
                    </button>
                    <button
                        className="manga-topbar-btn"
                        onClick={zoomIn}
                        title="Zoom In"
                    >
                        <ZoomIn />
                    </button>
                    {sourceType === 'online' && (
                        <button
                            className="manga-topbar-btn"
                            onClick={addToLibrary}
                            disabled={isAlreadyInLibrary}
                            title={isAlreadyInLibrary ? "Already in Library" : "Add to Library"}
                        >
                            {isAlreadyInLibrary ? <CheckCircle2 className="text-green-500" /> : <Library />}
                        </button>
                    )}
                    <div className="manga-topbar-divider" />
                    <button
                        className="manga-topbar-btn"
                        onClick={toggleSidebar}
                        title="Toggle sidebar (S)"
                    >
                        <PanelRightOpen />
                    </button>
                    <div className="manga-topbar-divider" />
                    <button
                        className="manga-topbar-btn"
                        onClick={onClose}
                        title="Close reader (Esc)"
                    >
                        <X />
                    </button>
                </div>
            </div>
        </div>
    );
});
