import React, { useState } from 'react';
import {
    useMangaUIStore,
    useMangaSettingsStore,
    type ReadingMode,
    type FitMode,
    type ProgressBarPosition,
} from '@/store/mangaReaderStore';
import { X } from 'lucide-react';

type SettingsTab = 'layout' | 'image' | 'shortcuts';

/**
 * Advanced settings modal with tabbed interface.
 * Page Layout, Image, and Shortcuts tabs.
 */
export function AdvancedSettingsPanel() {
    const isOpen = useMangaUIStore(s => s.isSettingsOpen);
    const closeSettings = useMangaUIStore(s => s.closeSettings);

    const readingMode = useMangaSettingsStore(s => s.readingMode);
    const setReadingMode = useMangaSettingsStore(s => s.setReadingMode);
    const readingDirection = useMangaSettingsStore(s => s.readingDirection);
    const setReadingDirection = useMangaSettingsStore(s => s.setReadingDirection);
    const fitMode = useMangaSettingsStore(s => s.fitMode);
    const setFitMode = useMangaSettingsStore(s => s.setFitMode);
    const stripMargin = useMangaSettingsStore(s => s.stripMargin);
    const setStripMargin = useMangaSettingsStore(s => s.setStripMargin);
    const progressBarPosition = useMangaSettingsStore(s => s.progressBarPosition);
    const setProgressBarPosition = useMangaSettingsStore(s => s.setProgressBarPosition);
    const showNavigationTips = useMangaSettingsStore(s => s.showNavigationTips);
    const toggleNavigationTips = useMangaSettingsStore(s => s.toggleNavigationTips);
    const imageQuality = useMangaSettingsStore(s => s.imageQuality);
    const setImageQuality = useMangaSettingsStore(s => s.setImageQuality);
    const resetToDefaults = useMangaSettingsStore(s => s.resetToDefaults);

    const [activeTab, setActiveTab] = useState<SettingsTab>('layout');

    const tabs: { value: SettingsTab; label: string }[] = [
        { value: 'layout', label: 'Page Layout' },
        { value: 'image', label: 'Image' },
        { value: 'shortcuts', label: 'Shortcuts' },
    ];

    const shortcuts = [
        { action: 'Next Page', key: '→ / ↓ / Space' },
        { action: 'Prev Page', key: '← / ↑ / Shift+Space' },
        { action: 'First Page', key: 'Home' },
        { action: 'Last Page', key: 'End' },
        { action: 'Single Page Mode', key: '1' },
        { action: 'Double Page Mode', key: '2' },
        { action: 'Long Strip Mode', key: '3' },
        { action: 'Toggle Sidebar', key: 'S' },
        { action: 'Toggle Settings', key: ',' },
        { action: 'Toggle Theme', key: 'D' },
        { action: 'Close / Back', key: 'Esc' },
    ];

    return (
        <div
            className={`manga-settings-overlay ${isOpen ? 'manga-settings-overlay--open' : ''}`}
            onClick={(e) => {
                if (e.target === e.currentTarget) closeSettings();
            }}
        >
            <div className="manga-settings-panel">
                {/* Header */}
                <div className="manga-settings-header">
                    <span className="manga-settings-title">Settings</span>
                    <button className="manga-sidebar-close" onClick={closeSettings}>
                        <X />
                    </button>
                </div>

                {/* Tabs */}
                <div className="manga-settings-tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.value}
                            className={`manga-settings-tab ${activeTab === tab.value ? 'manga-settings-tab--active' : ''}`}
                            onClick={() => setActiveTab(tab.value)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div className="manga-settings-body">
                    {/* Page Layout Tab */}
                    {activeTab === 'layout' && (
                        <>
                            <div className="manga-settings-group">
                                <div className="manga-settings-group-title">Reading Mode</div>
                                <div className="manga-radio-cards">
                                    {([
                                        { value: 'single' as ReadingMode, label: 'Single Page', desc: 'One page at a time' },
                                        { value: 'double' as ReadingMode, label: 'Double Page', desc: 'Two pages side by side' },
                                        { value: 'strip' as ReadingMode, label: 'Long Strip', desc: 'Continuous scrolling' },
                                    ]).map(opt => (
                                        <button
                                            key={opt.value}
                                            className={`manga-radio-card ${readingMode === opt.value ? 'manga-radio-card--active' : ''}`}
                                            onClick={() => setReadingMode(opt.value)}
                                        >
                                            <div style={{ fontWeight: 600, marginBottom: '2px' }}>{opt.label}</div>
                                            <div style={{ fontSize: '10px', opacity: 0.7 }}>{opt.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="manga-settings-group">
                                <div className="manga-settings-group-title">Layout Options</div>
                                <div className="manga-settings-option">
                                    <div>
                                        <div className="manga-settings-option-label">Strip Margin</div>
                                        <div className="manga-settings-option-hint">{stripMargin}px gap between pages</div>
                                    </div>
                                    <input
                                        type="range"
                                        className="manga-slider"
                                        min="0"
                                        max="32"
                                        value={stripMargin}
                                        onChange={(e) => setStripMargin(Number(e.target.value))}
                                    />
                                </div>

                                <div className="manga-settings-option">
                                    <div>
                                        <div className="manga-settings-option-label">Reading Direction</div>
                                        <div className="manga-settings-option-hint">Arrow key and click-zone direction</div>
                                    </div>
                                    <div className="manga-mode-selector">
                                        <button
                                            className={`manga-mode-btn ${readingDirection === 'ltr' ? 'manga-mode-btn--active' : ''}`}
                                            onClick={() => setReadingDirection('ltr')}
                                        >
                                            LTR →
                                        </button>
                                        <button
                                            className={`manga-mode-btn ${readingDirection === 'rtl' ? 'manga-mode-btn--active' : ''}`}
                                            onClick={() => setReadingDirection('rtl')}
                                        >
                                            ← RTL
                                        </button>
                                    </div>
                                </div>

                                <div className="manga-settings-option">
                                    <div>
                                        <div className="manga-settings-option-label">Progress Bar</div>
                                    </div>
                                    <div className="manga-position-pills">
                                        {(['bottom', 'top', 'left', 'right', 'none'] as ProgressBarPosition[]).map(pos => (
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

                                <div className="manga-settings-option">
                                    <div className="manga-settings-option-label">Navigation Tips</div>
                                    <div
                                        className={`manga-toggle ${showNavigationTips ? 'manga-toggle--active' : ''}`}
                                        onClick={toggleNavigationTips}
                                    >
                                        <div className="manga-toggle-knob" />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Image Tab */}
                    {activeTab === 'image' && (
                        <>
                            <div className="manga-settings-group">
                                <div className="manga-settings-group-title">Image Fit</div>
                                <div className="manga-radio-cards">
                                    {([
                                        { value: 'contain' as FitMode, label: 'Fit Screen', desc: 'Auto-resize to fit completely' },
                                        { value: 'width' as FitMode, label: 'Fit Width', desc: 'Scale to viewport width' },
                                        { value: 'height' as FitMode, label: 'Fit Height', desc: 'Scale to viewport height' },
                                        { value: 'original' as FitMode, label: 'Original', desc: 'Actual image size' },
                                    ]).map(opt => (
                                        <button
                                            key={opt.value}
                                            className={`manga-radio-card ${fitMode === opt.value ? 'manga-radio-card--active' : ''}`}
                                            onClick={() => setFitMode(opt.value)}
                                        >
                                            <div style={{ fontWeight: 600, marginBottom: '2px' }}>{opt.label}</div>
                                            <div style={{ fontSize: '10px', opacity: 0.7 }}>{opt.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="manga-settings-group">
                                <div className="manga-settings-group-title">Quality</div>
                                <div className="manga-settings-option">
                                    <div>
                                        <div className="manga-settings-option-label">Image Quality</div>
                                        <div className="manga-settings-option-hint">{Math.round(imageQuality * 100)}% — Lower = faster loading</div>
                                    </div>
                                    <input
                                        type="range"
                                        className="manga-slider"
                                        min="50"
                                        max="100"
                                        value={Math.round(imageQuality * 100)}
                                        onChange={(e) => setImageQuality(Number(e.target.value) / 100)}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* Shortcuts Tab */}
                    {activeTab === 'shortcuts' && (
                        <div className="manga-settings-group">
                            <div className="manga-settings-group-title">Keyboard Shortcuts</div>
                            <div className="manga-shortcuts-list">
                                {shortcuts.map(s => (
                                    <div key={s.action} className="manga-shortcut-row">
                                        <span className="manga-shortcut-label">{s.action}</span>
                                        <span className="manga-shortcut-key">{s.key}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="manga-settings-footer">
                    <button className="manga-btn-reset" onClick={resetToDefaults}>
                        Reset to Defaults
                    </button>
                    <button className="manga-btn-done" onClick={closeSettings}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
