import React, { memo, useRef, useEffect, useCallback } from 'react';
import { useMangaContentStore, useMangaUIStore } from '@/store/mangaReaderStore';
import { Search, SlidersHorizontal, PanelRightOpen, X } from 'lucide-react';

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

    const topBarRef = useRef<HTMLDivElement>(null);

    // Auto-hide on scroll (controlled externally via class toggle)
    useEffect(() => {
        const el = topBarRef.current;
        if (!el) return;
        if (isTopBarVisible) {
            el.classList.remove('manga-topbar--hidden');
        } else {
            el.classList.add('manga-topbar--hidden');
        }
    }, [isTopBarVisible]);

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
