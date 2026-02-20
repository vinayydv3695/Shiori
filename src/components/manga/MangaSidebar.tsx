import React, { memo } from 'react';
import {
    useMangaContentStore,
    useMangaUIStore,
    useMangaSettingsStore,
    type ReadingMode,
} from '@/store/mangaReaderStore';
import { X, Bookmark, Settings, AlertCircle } from 'lucide-react';

/**
 * Right sidebar overlay with reading controls.
 * Fixed overlay — no layout shift. Slides in via CSS transform.
 */
export const MangaSidebar = memo(function MangaSidebar() {
    const title = useMangaContentStore(s => s.title);
    const currentPage = useMangaContentStore(s => s.currentPage);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const setCurrentPage = useMangaContentStore(s => s.setCurrentPage);

    const isSidebarOpen = useMangaUIStore(s => s.isSidebarOpen);
    const closeSidebar = useMangaUIStore(s => s.closeSidebar);
    const toggleSettings = useMangaUIStore(s => s.toggleSettings);

    const readingMode = useMangaSettingsStore(s => s.readingMode);
    const setReadingMode = useMangaSettingsStore(s => s.setReadingMode);
    const readingDirection = useMangaSettingsStore(s => s.readingDirection);
    const setReadingDirection = useMangaSettingsStore(s => s.setReadingDirection);
    const fitMode = useMangaSettingsStore(s => s.fitMode);
    const setFitMode = useMangaSettingsStore(s => s.setFitMode);
    const stickyHeader = useMangaSettingsStore(s => s.stickyHeader);
    const toggleStickyHeader = useMangaSettingsStore(s => s.toggleStickyHeader);
    const showNavigationTips = useMangaSettingsStore(s => s.showNavigationTips);
    const toggleNavigationTips = useMangaSettingsStore(s => s.toggleNavigationTips);
    const progressBarPosition = useMangaSettingsStore(s => s.progressBarPosition);
    const setProgressBarPosition = useMangaSettingsStore(s => s.setProgressBarPosition);
    const theme = useMangaSettingsStore(s => s.theme);
    const toggleTheme = useMangaSettingsStore(s => s.toggleTheme);

    const modeOptions: { value: ReadingMode; label: string }[] = [
        { value: 'single', label: 'Single' },
        { value: 'double', label: 'Double' },
        { value: 'strip', label: 'Strip' },
    ];

    return (
        <>
            {/* Backdrop */}
            <div
                className={`manga-sidebar-backdrop ${!isSidebarOpen ? 'manga-sidebar-backdrop--hidden' : ''}`}
                onClick={closeSidebar}
            />

            {/* Sidebar */}
            <div className={`manga-sidebar ${isSidebarOpen ? 'manga-sidebar--open' : ''}`}>
                {/* Header */}
                <div className="manga-sidebar-header">
                    <span className="manga-sidebar-title">{title || 'Manga'}</span>
                    <button className="manga-sidebar-close" onClick={closeSidebar}>
                        <X />
                    </button>
                </div>

                {/* Content */}
                <div className="manga-sidebar-content">
                    {/* Reading Mode */}
                    <div className="manga-sidebar-section">
                        <div className="manga-sidebar-section-title">Reading Mode</div>
                        <div className="manga-mode-selector">
                            {modeOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    className={`manga-mode-btn ${readingMode === opt.value ? 'manga-mode-btn--active' : ''}`}
                                    onClick={() => setReadingMode(opt.value)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Navigation */}
                    <div className="manga-sidebar-section">
                        <div className="manga-sidebar-section-title">Navigation</div>
                        <div className="manga-sidebar-row">
                            <span className="manga-sidebar-label">Page</span>
                            <select
                                className="manga-select"
                                value={currentPage}
                                onChange={(e) => setCurrentPage(Number(e.target.value))}
                            >
                                {Array.from({ length: totalPages }, (_, i) => (
                                    <option key={i} value={i}>
                                        {i + 1} / {totalPages}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="manga-sidebar-divider" />

                    {/* Display Toggles */}
                    <div className="manga-sidebar-section">
                        <div className="manga-sidebar-section-title">Display</div>

                        <div className="manga-sidebar-row">
                            <span className="manga-sidebar-label">Dark Mode</span>
                            <div
                                className={`manga-toggle ${theme === 'dark' ? 'manga-toggle--active' : ''}`}
                                onClick={toggleTheme}
                            >
                                <div className="manga-toggle-knob" />
                            </div>
                        </div>

                        <div className="manga-sidebar-row">
                            <span className="manga-sidebar-label">Sticky Header</span>
                            <div
                                className={`manga-toggle ${stickyHeader ? 'manga-toggle--active' : ''}`}
                                onClick={toggleStickyHeader}
                            >
                                <div className="manga-toggle-knob" />
                            </div>
                        </div>

                        <div className="manga-sidebar-row">
                            <span className="manga-sidebar-label">RTL Direction</span>
                            <div
                                className={`manga-toggle ${readingDirection === 'rtl' ? 'manga-toggle--active' : ''}`}
                                onClick={() => setReadingDirection(readingDirection === 'rtl' ? 'ltr' : 'rtl')}
                            >
                                <div className="manga-toggle-knob" />
                            </div>
                        </div>

                        <div className="manga-sidebar-row">
                            <span className="manga-sidebar-label">Nav Hints</span>
                            <div
                                className={`manga-toggle ${showNavigationTips ? 'manga-toggle--active' : ''}`}
                                onClick={toggleNavigationTips}
                            >
                                <div className="manga-toggle-knob" />
                            </div>
                        </div>

                        <div className="manga-sidebar-row">
                            <span className="manga-sidebar-label">Fit Mode</span>
                            <div className="manga-mode-selector">
                                {(['width', 'height', 'original'] as const).map(mode => (
                                    <button
                                        key={mode}
                                        className={`manga-mode-btn ${fitMode === mode ? 'manga-mode-btn--active' : ''}`}
                                        onClick={() => setFitMode(mode)}
                                    >
                                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="manga-sidebar-row">
                            <span className="manga-sidebar-label">Progress Bar</span>
                            <div className="manga-position-pills">
                                {(['bottom', 'top', 'none'] as const).map(pos => (
                                    <button
                                        key={pos}
                                        className={`manga-position-pill ${progressBarPosition === pos ? 'manga-position-pill--active' : ''}`}
                                        onClick={() => setProgressBarPosition(pos)}
                                    >
                                        {pos.charAt(0).toUpperCase() + pos.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="manga-sidebar-divider" />

                    {/* Actions */}
                    <div className="manga-sidebar-section">
                        <button
                            className="manga-sidebar-btn manga-sidebar-btn--accent"
                            onClick={toggleSettings}
                        >
                            <Settings />
                            <span>Advanced Settings</span>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
});
