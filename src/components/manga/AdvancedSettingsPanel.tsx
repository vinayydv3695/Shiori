import React, { useState } from 'react';
import {
    useMangaUIStore,
    useMangaSettingsStore,
    type ReadingMode,
    type FitMode,
    type ProgressBarPosition,
} from '@/store/mangaReaderStore';
import { 
    X, 
    SlidersHorizontal, 
    LayoutGrid, 
    Image as ImageIcon, 
    Keyboard, 
    BookOpen, 
    Scroll, 
    Smartphone, 
    Columns, 
    Layers, 
    ArrowRight, 
    ArrowLeft, 
    Maximize2, 
    MoveHorizontal, 
    MoveVertical, 
    RotateCcw, 
    Check, 
    ZoomIn, 
    ZoomOut, 
    Scan, 
    Eye, 
    Hash, 
    FileDigit,
    Infinity,
    Repeat 
} from 'lucide-react';
import { isAndroid } from '@/lib/tauri';
import { useIsMobile } from '@/hooks/useIsMobile';

type SettingsTab = 'layout' | 'image' | 'shortcuts';

/**
 * Advanced settings modal with tabbed interface.
 * Page Layout, Image, and Shortcuts tabs.
 * Supports both Light (Sepia/Cream) and Dark (OLED Midnight) themes.
 */
export function AdvancedSettingsPanel() {
    const isOpen = useMangaUIStore(s => s.isSettingsOpen);
    const closeSettings = useMangaUIStore(s => s.closeSettings);

    const theme = useMangaSettingsStore(s => s.theme);
    const isLight = theme === 'light';

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
    const showFloatingPageNumber = useMangaSettingsStore(s => s.showFloatingPageNumber);
    const toggleFloatingPageNumber = useMangaSettingsStore(s => s.toggleFloatingPageNumber);
    const imageQuality = useMangaSettingsStore(s => s.imageQuality);
    const setImageQuality = useMangaSettingsStore(s => s.setImageQuality);
    const preloadIntensity = useMangaSettingsStore(s => s.preloadIntensity);
    const setPreloadIntensity = useMangaSettingsStore(s => s.setPreloadIntensity);
    const resetToDefaults = useMangaSettingsStore(s => s.resetToDefaults);
    const zoomLevel = useMangaSettingsStore(s => s.zoomLevel);
    const zoomIn = useMangaSettingsStore(s => s.zoomIn);
    const zoomOut = useMangaSettingsStore(s => s.zoomOut);
    const continuousChapter = useMangaSettingsStore(s => s.continuousChapter);
    const toggleContinuousChapter = useMangaSettingsStore(s => s.toggleContinuousChapter);

    const isMobile = useIsMobile();
    const isMobileOrAndroid = isAndroid || isMobile;

    const [activeTab, setActiveTab] = useState<SettingsTab>('layout');

    if (!isOpen) return null;

    const tabs: { value: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
        { value: 'layout', label: 'Page Layout', icon: LayoutGrid },
        { value: 'image', label: 'Image & Zoom', icon: ImageIcon },
        ...(isAndroid ? [] : [{ value: 'shortcuts' as SettingsTab, label: 'Shortcuts', icon: Keyboard }]),
    ];

    const modeCards: { value: ReadingMode; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
        { value: 'single', label: 'Single Page', desc: 'One page at a time', icon: BookOpen },
        { value: 'strip', label: 'Long Strip', desc: 'Continuous scroll with gap', icon: Scroll },
        { value: 'webtoon', label: 'Webtoon', desc: 'Seamless vertical scroll', icon: Smartphone },
        { value: 'manhwa', label: 'Manhwa', desc: 'Wide seamless scroll', icon: Columns },
        { value: 'comic', label: 'Comic', desc: 'Western LTR single page', icon: Layers },
    ];

    const fitCards: { value: FitMode; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
        { value: 'contain', label: 'Fit Screen', desc: 'Auto-resize completely', icon: Maximize2 },
        { value: 'width', label: 'Fit Width', desc: 'Scale to viewport width', icon: MoveHorizontal },
        { value: 'height', label: 'Fit Height', desc: 'Scale to viewport height', icon: MoveVertical },
        { value: 'original', label: 'Original', desc: 'Actual image resolution', icon: Scan },
    ];

    const shortcuts = [
        { action: 'Next Page', key: '→ / ↓ / Space' },
        { action: 'Prev Page', key: '← / ↑ / Shift+Space' },
        { action: 'First Page', key: 'Home' },
        { action: 'Last Page', key: 'End' },
        { action: 'Single Page Mode', key: '1' },
        { action: 'Long Strip Mode', key: '3' },
        { action: 'Webtoon Mode', key: '4' },
        { action: 'Manhwa Mode', key: '5' },
        { action: 'Comic Mode', key: '6' },
        { action: 'Toggle Top Bar', key: 'H' },
        { action: 'Toggle Sidebar', key: 'S' },
        { action: 'Toggle Settings', key: ',' },
        { action: 'Toggle Theme', key: 'D' },
        { action: 'Close / Back', key: 'Esc' },
    ];

    return (
        <div
            className="fixed inset-0 z-[250] bg-black/65 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in-0 duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) closeSettings();
            }}
        >
            <div 
                className={`w-full max-w-xl max-h-[85vh] flex flex-col rounded-t-[32px] sm:rounded-3xl overflow-hidden shadow-2xl transition-all animate-in zoom-in-95 duration-200 ${
                    isLight
                        ? 'bg-[#FAF6EC] text-[#2C1E0F] border border-[#D9C9A3] shadow-2xl shadow-[#5C4430]/25 ring-1 ring-[#8A6A50]/15'
                        : 'bg-[#121217] text-white border border-white/10 shadow-2xl shadow-black/90 ring-1 ring-white/5'
                }`}
                style={isMobileOrAndroid ? {
                    paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
                } : undefined}
            >
                {/* Drag handle pill on mobile */}
                {isMobileOrAndroid && (
                    <div className="w-12 h-1 rounded-full bg-muted-foreground/30 mx-auto mt-3 mb-1 shrink-0" />
                )}

                {/* Header */}
                <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
                    isLight ? 'bg-[#F0E6CE]/70 border-[#D9C9A3]' : 'bg-white/[0.03] border-white/10'
                }`}>
                    <div className="flex items-center gap-2.5">
                        <div className={`p-2 rounded-xl ${isLight ? 'bg-[#A0522D]/15 text-[#A0522D]' : 'bg-amber-400/15 text-amber-400'}`}>
                            <SlidersHorizontal className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className={`font-semibold text-base tracking-tight ${isLight ? 'text-[#2C1E0F]' : 'text-white'}`}>
                                Reader Settings
                            </h2>
                            <p className={`text-xs ${isLight ? 'text-[#5C4430]' : 'text-white/50'}`}>
                                Customize reading layout, fit modes & controls
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={closeSettings}
                        className={`p-2 rounded-full transition-colors ${
                            isLight ? 'text-[#5C4430] hover:text-[#2C1E0F] hover:bg-[#E5D7BC]' : 'text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                        title="Close settings (Esc)"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className={`px-6 pt-3 pb-2 border-b shrink-0 ${
                    isLight ? 'bg-[#F0E6CE]/40 border-[#D9C9A3]' : 'bg-white/[0.01] border-white/10'
                }`}>
                    <div className={`flex items-center gap-1 p-1 rounded-2xl border ${
                        isLight ? 'bg-[#EAE0CB]/70 border-[#D9C9A3]' : 'bg-black/40 border-white/5'
                    }`}>
                        {tabs.map(tab => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.value;
                            return (
                                <button
                                    key={tab.value}
                                    onClick={() => setActiveTab(tab.value)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                                        isActive
                                            ? isLight
                                                ? 'bg-[#A0522D] text-white shadow-sm shadow-[#A0522D]/30'
                                                : 'bg-amber-400 text-black shadow-sm shadow-amber-400/30'
                                            : isLight
                                                ? 'text-[#5C4430] hover:text-[#2C1E0F] hover:bg-[#FAF6EC]/80'
                                                : 'text-white/60 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    {/* Page Layout Tab */}
                    {activeTab === 'layout' && (
                        <>
                            {/* Reading Mode Section */}
                            <div className="space-y-3">
                                <div>
                                    <label className={`text-xs font-semibold uppercase tracking-wider ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                        Reading Mode
                                    </label>
                                    <p className={`text-xs mt-0.5 ${isLight ? 'text-[#5C4430]' : 'text-white/60'}`}>
                                        Select how pages should be displayed and navigated
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                    {modeCards.map(opt => {
                                        const Icon = opt.icon;
                                        const isSelected = readingMode === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                onClick={() => setReadingMode(opt.value)}
                                                className={`p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between gap-2 ${
                                                    isSelected
                                                        ? isLight
                                                            ? 'bg-[#A0522D]/15 border-[#A0522D] shadow-sm ring-1 ring-[#A0522D]/20 text-[#2C1E0F]'
                                                            : 'bg-amber-400/15 border-amber-400 shadow-sm ring-1 ring-amber-400/20 text-white'
                                                        : isLight
                                                            ? 'bg-[#FAF6EC] hover:bg-[#F0E6CE] border-[#D9C9A3] text-[#2C1E0F]'
                                                            : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-white'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className={`p-1.5 rounded-lg ${
                                                        isSelected
                                                            ? isLight ? 'bg-[#A0522D] text-white' : 'bg-amber-400 text-black'
                                                            : isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/70'
                                                    }`}>
                                                        <Icon className="w-4 h-4" />
                                                    </div>
                                                    {isSelected && (
                                                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                                                            isLight ? 'bg-[#A0522D] text-white' : 'bg-amber-400 text-black'
                                                        }`}>
                                                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-xs">{opt.label}</div>
                                                    <div className={`text-[10px] mt-0.5 line-clamp-1 ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                                        {opt.desc}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Layout Options */}
                            <div className="space-y-4 pt-2">
                                <label className={`text-xs font-semibold uppercase tracking-wider ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                    Layout & Controls
                                </label>

                                {readingMode === 'strip' && (
                                    <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                                        isLight ? 'bg-[#FAF6EC] border-[#D9C9A3]' : 'bg-white/[0.03] border-white/10'
                                    }`}>
                                        <div>
                                            <div className="text-xs font-semibold">Strip Gap Margin</div>
                                            <div className={`text-[11px] ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                                {stripMargin}px gap between pages
                                            </div>
                                        </div>
                                        <input
                                            type="range"
                                            className="w-36 accent-amber-400"
                                            min="0"
                                            max="32"
                                            value={stripMargin}
                                            onChange={(e) => setStripMargin(Number(e.target.value))}
                                        />
                                    </div>
                                )}

                                {/* Reading Direction */}
                                <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                                    isLight ? 'bg-[#FAF6EC] border-[#D9C9A3]' : 'bg-white/[0.03] border-white/10'
                                }`}>
                                    <div>
                                        <div className="text-xs font-semibold">Reading Direction</div>
                                        <div className={`text-[11px] ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                            Arrow keys and click navigation
                                        </div>
                                    </div>
                                    <div className={`flex items-center gap-1 p-1 rounded-xl border ${
                                        isLight ? 'bg-[#EAE0CB] border-[#D9C9A3]' : 'bg-black/40 border-white/5'
                                    }`}>
                                        <button
                                            onClick={() => setReadingDirection('ltr')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                                                readingDirection === 'ltr'
                                                    ? isLight ? 'bg-[#A0522D] text-white shadow-xs' : 'bg-amber-400 text-black shadow-xs'
                                                    : isLight ? 'text-[#5C4430] hover:text-[#2C1E0F]' : 'text-white/60 hover:text-white'
                                            }`}
                                        >
                                            <span>LTR</span>
                                            <ArrowRight className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => setReadingDirection('rtl')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                                                readingDirection === 'rtl'
                                                    ? isLight ? 'bg-[#A0522D] text-white shadow-xs' : 'bg-amber-400 text-black shadow-xs'
                                                    : isLight ? 'text-[#5C4430] hover:text-[#2C1E0F]' : 'text-white/60 hover:text-white'
                                            }`}
                                        >
                                            <ArrowLeft className="w-3 h-3" />
                                            <span>RTL</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Progress Bar Position */}
                                <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                    isLight ? 'bg-[#FAF6EC] border-[#D9C9A3]' : 'bg-white/[0.03] border-white/10'
                                }`}>
                                    <div>
                                        <div className="text-xs font-semibold">Progress Bar Position</div>
                                        <div className={`text-[11px] ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                            Reading track placement
                                        </div>
                                    </div>
                                    <div className={`flex items-center gap-1 p-1 rounded-xl border flex-wrap ${
                                        isLight ? 'bg-[#EAE0CB] border-[#D9C9A3]' : 'bg-black/40 border-white/5'
                                    }`}>
                                        {(['bottom', 'top', 'left', 'right', 'none'] as ProgressBarPosition[]).map(pos => (
                                            <button
                                                key={pos}
                                                onClick={() => setProgressBarPosition(pos)}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                                    progressBarPosition === pos
                                                        ? isLight ? 'bg-[#A0522D] text-white shadow-xs' : 'bg-amber-400 text-black shadow-xs'
                                                        : isLight ? 'text-[#5C4430] hover:text-[#2C1E0F]' : 'text-white/60 hover:text-white'
                                                }`}
                                            >
                                                {pos.charAt(0).toUpperCase() + pos.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Toggle Switches */}
                                <div className={`p-4 rounded-2xl border space-y-4 ${
                                    isLight ? 'bg-[#FAF6EC] border-[#D9C9A3]' : 'bg-white/[0.03] border-white/10'
                                }`}>
                                    {/* Navigation Tips */}
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/70'}`}>
                                                <Eye className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-semibold">Navigation Tips</div>
                                                <div className={`text-[11px] ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                                    Show on-screen guidance overlays
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleNavigationTips}
                                            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                                                showNavigationTips 
                                                    ? isLight ? 'bg-[#A0522D]' : 'bg-amber-400'
                                                    : isLight ? 'bg-[#D9C9A3]' : 'bg-white/20'
                                            }`}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white transition-transform transform absolute top-1 ${
                                                showNavigationTips ? 'translate-x-6' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>

                                    <div className={`border-t ${isLight ? 'border-[#D9C9A3]/60' : 'border-white/5'}`} />

                                    {/* Floating Page Number */}
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/70'}`}>
                                                <FileDigit className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-semibold">Floating Page Number</div>
                                                <div className={`text-[11px] ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                                    Display styled page number indicator
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleFloatingPageNumber}
                                            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                                                showFloatingPageNumber 
                                                    ? isLight ? 'bg-[#A0522D]' : 'bg-amber-400'
                                                    : isLight ? 'bg-[#D9C9A3]' : 'bg-white/20'
                                            }`}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white transition-transform transform absolute top-1 ${
                                                showFloatingPageNumber ? 'translate-x-6' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>

                                    <div className={`border-t ${isLight ? 'border-[#D9C9A3]/60' : 'border-white/5'}`} />

                                    {/* Continuous Chapter Flow */}
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/70'}`}>
                                                <Infinity className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-semibold">Continuous Chapter Flow</div>
                                                <div className={`text-[11px] ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                                    Seamlessly load next chapter in scroll views
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleContinuousChapter}
                                            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                                                continuousChapter 
                                                    ? isLight ? 'bg-[#A0522D]' : 'bg-amber-400'
                                                    : isLight ? 'bg-[#D9C9A3]' : 'bg-white/20'
                                            }`}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white transition-transform transform absolute top-1 ${
                                                continuousChapter ? 'translate-x-6' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Image Tab */}
                    {activeTab === 'image' && (
                        <>
                            {/* Image Fit */}
                            <div className="space-y-3">
                                <div>
                                    <label className={`text-xs font-semibold uppercase tracking-wider ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                        Image Fit Mode
                                    </label>
                                    <p className={`text-xs mt-0.5 ${isLight ? 'text-[#5C4430]' : 'text-white/60'}`}>
                                        Choose how images scale to your window or display
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    {fitCards.map(opt => {
                                        const Icon = opt.icon;
                                        const isSelected = fitMode === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                onClick={() => setFitMode(opt.value)}
                                                className={`p-3 rounded-2xl border text-left transition-all relative flex items-center justify-between gap-3 ${
                                                    isSelected
                                                        ? isLight
                                                            ? 'bg-[#A0522D]/15 border-[#A0522D] shadow-sm ring-1 ring-[#A0522D]/20 text-[#2C1E0F]'
                                                            : 'bg-amber-400/15 border-amber-400 shadow-sm ring-1 ring-amber-400/20 text-white'
                                                        : isLight
                                                            ? 'bg-[#FAF6EC] hover:bg-[#F0E6CE] border-[#D9C9A3] text-[#2C1E0F]'
                                                            : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-white'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-xl ${
                                                        isSelected
                                                            ? isLight ? 'bg-[#A0522D] text-white' : 'bg-amber-400 text-black'
                                                            : isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/70'
                                                    }`}>
                                                        <Icon className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-xs">{opt.label}</div>
                                                        <div className={`text-[10px] mt-0.5 ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                                            {opt.desc}
                                                        </div>
                                                    </div>
                                                </div>
                                                {isSelected && (
                                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                                                        isLight ? 'bg-[#A0522D] text-white' : 'bg-amber-400 text-black'
                                                    }`}>
                                                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Zoom Controls */}
                            <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                                isLight ? 'bg-[#FAF6EC] border-[#D9C9A3]' : 'bg-white/[0.03] border-white/10'
                            }`}>
                                <div>
                                    <div className="text-xs font-semibold">Zoom Level</div>
                                    <div className={`text-[11px] ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                        {(zoomLevel * 100).toFixed(0)}% magnification
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={zoomOut}
                                        className={`p-2 rounded-xl border flex items-center justify-center transition-all ${
                                            isLight ? 'bg-[#EAE0CB] hover:bg-[#E5D7BC] border-[#D9C9A3] text-[#2C1E0F]' : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'
                                        }`}
                                        title="Zoom out"
                                    >
                                        <ZoomOut className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={zoomIn}
                                        className={`p-2 rounded-xl border flex items-center justify-center transition-all ${
                                            isLight ? 'bg-[#EAE0CB] hover:bg-[#E5D7BC] border-[#D9C9A3] text-[#2C1E0F]' : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'
                                        }`}
                                        title="Zoom in"
                                    >
                                        <ZoomIn className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Preload Intensity */}
                            <div className={`p-4 rounded-2xl border space-y-3 ${
                                isLight ? 'bg-[#FAF6EC] border-[#D9C9A3]' : 'bg-white/[0.03] border-white/10'
                            }`}>
                                <div>
                                    <div className="text-xs font-semibold">Preload Cache Intensity</div>
                                    <div className={`text-[11px] ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                        {preloadIntensity === 'light' ? 'Light — Low memory usage, fetch on demand' :
                                         preloadIntensity === 'normal' ? 'Normal — Balanced page prefetching' :
                                         'Aggressive — Preload entire chapter for instant flipping'}
                                    </div>
                                </div>
                                <div className={`flex items-center gap-1 p-1 rounded-xl border ${
                                    isLight ? 'bg-[#EAE0CB] border-[#D9C9A3]' : 'bg-black/40 border-white/5'
                                }`}>
                                    {(['light', 'normal', 'aggressive'] as const).map(level => (
                                        <button
                                            key={level}
                                            onClick={() => setPreloadIntensity(level)}
                                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                                preloadIntensity === level
                                                    ? isLight ? 'bg-[#A0522D] text-white shadow-xs' : 'bg-amber-400 text-black shadow-xs'
                                                    : isLight ? 'text-[#5C4430] hover:text-[#2C1E0F]' : 'text-white/60 hover:text-white'
                                            }`}
                                        >
                                            {level.charAt(0).toUpperCase() + level.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Image Quality */}
                            <div className={`p-4 rounded-2xl border space-y-3 ${
                                isLight ? 'bg-[#FAF6EC] border-[#D9C9A3]' : 'bg-white/[0.03] border-white/10'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-xs font-semibold">Render Quality</div>
                                        <div className={`text-[11px] ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                            {Math.round(imageQuality * 100)}% resolution scaling
                                        </div>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold border ${
                                        isLight ? 'bg-[#E5D7BC] text-[#5C4430] border-[#D9C9A3]' : 'bg-white/10 text-white border-white/10'
                                    }`}>
                                        {Math.round(imageQuality * 100)}%
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    className="w-full accent-amber-400"
                                    min="50"
                                    max="100"
                                    value={Math.round(imageQuality * 100)}
                                    onChange={(e) => setImageQuality(Number(e.target.value) / 100)}
                                />
                            </div>
                        </>
                    )}

                    {/* Shortcuts Tab */}
                    {activeTab === 'shortcuts' && (
                        <div className="space-y-2.5">
                            <div>
                                <label className={`text-xs font-semibold uppercase tracking-wider ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                    Keyboard Controls
                                </label>
                                <p className={`text-xs mt-0.5 ${isLight ? 'text-[#5C4430]' : 'text-white/60'}`}>
                                    Quick shortcuts for seamless reading
                                </p>
                            </div>
                            <div className={`rounded-2xl border overflow-hidden divide-y ${
                                isLight ? 'bg-[#FAF6EC] border-[#D9C9A3] divide-[#D9C9A3]/60' : 'bg-white/[0.03] border-white/10 divide-white/5'
                            }`}>
                                {shortcuts.map(s => (
                                    <div key={s.action} className="px-4 py-2.5 flex items-center justify-between">
                                        <span className={`text-xs font-medium ${isLight ? 'text-[#2C1E0F]' : 'text-white/90'}`}>{s.action}</span>
                                        <kbd className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded-lg border shadow-xs ${
                                            isLight 
                                                ? 'bg-[#EAE0CB] text-[#5C4430] border-[#D9C9A3]' 
                                                : 'bg-white/10 text-white/90 border-white/10'
                                        }`}>
                                            {s.key}
                                        </kbd>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={`px-6 py-4 border-t flex items-center justify-between shrink-0 ${
                    isLight ? 'bg-[#F0E6CE]/70 border-[#D9C9A3]' : 'bg-white/[0.03] border-white/10'
                }`}>
                    <button
                        onClick={resetToDefaults}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                            isLight 
                                ? 'text-[#5C4430] hover:text-[#2C1E0F] hover:bg-[#E5D7BC] border-[#D9C9A3]' 
                                : 'text-white/70 hover:text-white hover:bg-white/10 border-white/10'
                        }`}
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset to Defaults</span>
                    </button>
                    <button
                        onClick={closeSettings}
                        className={`px-6 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all ${
                            isLight
                                ? 'bg-[#A0522D] hover:bg-[#8B4513] text-white shadow-[#A0522D]/30'
                                : 'bg-amber-400 hover:bg-amber-300 text-black shadow-amber-400/30'
                        }`}
                    >
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>Done</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

