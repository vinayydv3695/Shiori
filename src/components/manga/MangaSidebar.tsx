import React, { memo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    useMangaContentStore,
    useMangaUIStore,
    useMangaSettingsStore,
    type ReadingMode,
    type FitMode,
    type ReadingDirection,
} from '@/store/mangaReaderStore';
import { 
    X, 
    SlidersHorizontal, 
    ChevronLeft, 
    ChevronRight, 
    ChevronRight as ArrowNext,
    Sun,
    Moon,
    Play,
    Pause,
    Gauge,
    BookOpen,
    Scroll,
    Smartphone,
    Columns,
    Layers,
    RotateCcw,
    Check,
    Maximize2,
    MoveHorizontal,
    MoveVertical,
    Scan,
    Eye,
    Hash,
    FileDigit,
    FileText,
    Bookmark,
    Sparkles,
    Infinity,
    ArrowLeftRight
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useIsMobile } from '@/hooks/useIsMobile';
import { isAndroid } from '@/lib/tauri';
import { cn } from '@/lib/utils';

/**
 * Manga Reader Sidebar & Settings.
 * - On Android / Mobile: Rendered as a sleek, touch-optimized bottom sheet drawer.
 * - On Desktop: Rendered as the classic right-side overlay drawer.
 * Dual-theme: Warm Sepia & Pure OLED Midnight.
 */
export const MangaSidebar = memo(function MangaSidebar() {
    const isMobile = useIsMobile();
    const isMobileOrAndroid = isAndroid || isMobile;

    const title = useMangaContentStore(s => s.title);
    const currentPage = useMangaContentStore(s => s.currentPage);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const setCurrentPage = useMangaContentStore(s => s.setCurrentPage);

    const isSidebarOpen = useMangaUIStore(s => s.isSidebarOpen);
    const closeSidebar = useMangaUIStore(s => s.closeSidebar);
    const toggleSettings = useMangaUIStore(s => s.toggleSettings);
    const isAutoScrolling = useMangaUIStore(s => s.isAutoScrolling);
    const toggleAutoScroll = useMangaUIStore(s => s.toggleAutoScroll);

    const readingMode = useMangaSettingsStore(s => s.readingMode);
    const setReadingMode = useMangaSettingsStore(s => s.setReadingMode);
    const readingDirection = useMangaSettingsStore(s => s.readingDirection);
    const setReadingDirection = useMangaSettingsStore(s => s.setReadingDirection);
    const fitMode = useMangaSettingsStore(s => s.fitMode);
    const setFitMode = useMangaSettingsStore(s => s.setFitMode);
    const stripMargin = useMangaSettingsStore(s => s.stripMargin);
    const setStripMargin = useMangaSettingsStore(s => s.setStripMargin);
    const continuousChapter = useMangaSettingsStore(s => s.continuousChapter);
    const toggleContinuousChapter = useMangaSettingsStore(s => s.toggleContinuousChapter);
    const showNavigationTips = useMangaSettingsStore(s => s.showNavigationTips);
    const toggleNavigationTips = useMangaSettingsStore(s => s.toggleNavigationTips);
    const showFloatingPageNumber = useMangaSettingsStore(s => s.showFloatingPageNumber);
    const toggleFloatingPageNumber = useMangaSettingsStore(s => s.toggleFloatingPageNumber);
    const preloadIntensity = useMangaSettingsStore(s => s.preloadIntensity);
    const setPreloadIntensity = useMangaSettingsStore(s => s.setPreloadIntensity);
    const resetToDefaults = useMangaSettingsStore(s => s.resetToDefaults);

    const theme = useMangaSettingsStore(s => s.theme);
    const toggleTheme = useMangaSettingsStore(s => s.toggleTheme);
    const autoScrollSpeed = useMangaSettingsStore(s => s.autoScrollSpeed);
    const setAutoScrollSpeed = useMangaSettingsStore(s => s.setAutoScrollSpeed);
    const isLight = theme === 'light';

    const modeCards: { value: ReadingMode; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
        { value: 'single', label: 'Single Page', desc: 'One page at a time', icon: BookOpen },
        { value: 'strip', label: 'Long Strip', desc: 'Continuous with gap', icon: Scroll },
        { value: 'webtoon', label: 'Webtoon', desc: 'Seamless vertical', icon: Smartphone },
        { value: 'manhwa', label: 'Manhwa', desc: 'Wide seamless', icon: Columns },
        { value: 'comic', label: 'Comic', desc: 'Western LTR mode', icon: Layers },
    ];

    const fitCards: { value: FitMode; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
        { value: 'contain', label: 'Fit Screen', desc: 'Auto-resize completely', icon: Maximize2 },
        { value: 'width', label: 'Fit Width', desc: 'Scale to width', icon: MoveHorizontal },
        { value: 'height', label: 'Fit Height', desc: 'Scale to height', icon: MoveVertical },
        { value: 'original', label: 'Original', desc: 'Actual resolution', icon: Scan },
    ];

    const isScrollMode = readingMode === 'webtoon' || readingMode === 'strip' || readingMode === 'manhwa';

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isSidebarOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 z-[180] bg-black/60 backdrop-blur-xs"
                        onClick={closeSidebar}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                    />

                    {/* Android / Mobile Bottom Sheet Drawer */}
                    {isMobileOrAndroid ? (
                        <motion.div 
                            className={`fixed bottom-0 inset-x-0 z-[200] flex flex-col rounded-t-[32px] border-t shadow-2xl max-h-[85vh] overflow-hidden select-none ${
                                isLight
                                    ? '!bg-[#FAF6EC] !text-[#2C1E0F] !border-[#D9C9A3] shadow-[#5C4430]/35 ring-1 ring-[#8A6A50]/20'
                                    : '!bg-[#121217] !text-white !border-white/15 shadow-black/95 ring-1 ring-white/10'
                            }`}
                            style={{
                                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)',
                            }}
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                        >
                            {/* Drag handle pill */}
                            <div className="w-12 h-1 rounded-full bg-muted-foreground/30 mx-auto mt-3 mb-1 shrink-0" />

                            {/* Header */}
                            <div className={`px-5 py-3.5 border-b flex items-center justify-between shrink-0 ${
                                isLight ? '!bg-[#F4ECD8] !border-[#D9C9A3]' : '!bg-[#1a1a22] !border-white/10'
                            }`}>
                                <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                                    <div className={`p-1.5 rounded-xl shrink-0 ${
                                        isLight ? 'bg-[#A0522D]/15 text-[#A0522D]' : 'bg-amber-400/15 text-amber-400'
                                    }`}>
                                        <SlidersHorizontal className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className={`font-bold text-sm tracking-tight truncate ${isLight ? 'text-[#2C1E0F]' : 'text-white'}`}>
                                            Reader Settings
                                        </h3>
                                        <p className={`text-[10px] truncate ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                            {isLight ? 'Warm Sepia Theme' : 'Pure OLED Midnight'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                        type="button"
                                        onClick={resetToDefaults}
                                        className={`p-2 rounded-xl transition-colors ${
                                            isLight 
                                                ? 'text-[#7D634B] hover:text-[#2C1E0F] hover:bg-[#E5D7BC]' 
                                                : 'text-zinc-400 hover:text-white hover:bg-white/10'
                                        }`}
                                        title="Reset all settings to default"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={closeSidebar} 
                                        className={`p-2 rounded-xl transition-colors ${
                                            isLight 
                                                ? 'text-[#7D634B] hover:text-[#2C1E0F] hover:bg-[#E5D7BC]' 
                                                : 'text-zinc-400 hover:text-white hover:bg-white/10'
                                        }`}
                                        title="Close Settings"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Settings Content */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6 overscroll-contain">
                                
                                {/* Section 1: Reading Mode */}
                                <div className="space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <label className={`text-xs font-bold uppercase tracking-wide ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                            Reading Mode
                                        </label>
                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                            isLight ? 'bg-[#E5D7BC] text-[#5C4430] border-[#D9C9A3]' : 'bg-white/10 text-white/80 border-white/10'
                                        }`}>
                                            {modeCards.find(m => m.value === readingMode)?.label}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {modeCards.map(opt => {
                                            const isActive = readingMode === opt.value;
                                            const Icon = opt.icon;

                                            return (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => setReadingMode(opt.value)}
                                                    className={`relative p-3 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                                                        isActive
                                                            ? isLight
                                                                ? 'bg-[#A0522D]/15 border-[#A0522D]/50 text-[#733516] shadow-xs'
                                                                : 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-inner'
                                                            : isLight
                                                                ? 'bg-[#F4ECD8] border-[#D9C9A3] text-[#2C1E0F] hover:bg-[#EAE0CB]'
                                                                : 'bg-white/[0.04] border-white/10 text-white/90 hover:bg-white/[0.08]'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <div className={`p-1.5 rounded-xl ${
                                                            isActive
                                                                ? isLight ? 'bg-[#A0522D] text-white' : 'bg-amber-400 text-black'
                                                                : isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/70'
                                                        }`}>
                                                            <Icon className="w-3.5 h-3.5" />
                                                        </div>
                                                        {isActive && (
                                                            <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                                                                isLight ? 'bg-[#A0522D] text-white' : 'bg-amber-400 text-black'
                                                            }`}>
                                                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-xs font-bold">{opt.label}</div>
                                                    <div className={`text-[10px] leading-tight mt-0.5 ${
                                                        isActive
                                                            ? isLight ? 'text-[#733516]/80 font-medium' : 'text-amber-200/80 font-medium'
                                                            : isLight ? 'text-[#7D634B]' : 'text-zinc-400'
                                                    }`}>
                                                        {opt.desc}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Section 2: Page Navigation */}
                                <div className={`p-4 rounded-2xl border space-y-3.5 ${
                                    isLight ? 'bg-[#F4ECD8] border-[#D9C9A3]' : 'bg-[#1a1a22] border-white/10'
                                }`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <BookOpen className={`w-4 h-4 ${isLight ? 'text-[#A0522D]' : 'text-amber-400'}`} />
                                            <span className="text-xs font-bold">Quick Page Jump</span>
                                        </div>
                                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border ${
                                            isLight ? 'bg-[#E5D7BC] text-[#5C4430] border-[#D9C9A3]' : 'bg-white/10 text-white border-white/10'
                                        }`}>
                                            Page {currentPage + 1} / {totalPages || 1}
                                        </span>
                                    </div>

                                    {/* Slider */}
                                    <div className="space-y-1 pt-1">
                                        <input
                                            type="range"
                                            min={0}
                                            max={Math.max(0, totalPages - 1)}
                                            step={1}
                                            value={currentPage}
                                            onChange={(e) => setCurrentPage(Number(e.target.value))}
                                            className="w-full accent-amber-500 cursor-pointer h-2 bg-black/20 rounded-lg"
                                        />
                                        <div className="flex justify-between text-[10px] font-mono opacity-60">
                                            <span>1</span>
                                            <span>{Math.round(totalPages / 2)}</span>
                                            <span>{totalPages || 1}</span>
                                        </div>
                                    </div>

                                    {/* Touch Prev/Next Buttons */}
                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                                            disabled={currentPage <= 0}
                                            className={`flex-1 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all disabled:opacity-30 active:scale-[0.98] ${
                                                isLight
                                                    ? 'bg-[#EAE0CB] hover:bg-[#E5D7BC] border-[#D9C9A3] text-[#2C1E0F]'
                                                    : 'bg-white/10 hover:bg-white/15 border-white/10 text-white'
                                            }`}
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                            <span>Previous</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                                            disabled={currentPage >= totalPages - 1}
                                            className={`flex-1 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all disabled:opacity-30 active:scale-[0.98] ${
                                                isLight
                                                    ? 'bg-[#EAE0CB] hover:bg-[#E5D7BC] border-[#D9C9A3] text-[#2C1E0F]'
                                                    : 'bg-white/10 hover:bg-white/15 border-white/10 text-white'
                                            }`}
                                        >
                                            <span>Next</span>
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Section 3: Display & Appearance */}
                                <div className="space-y-3">
                                    <label className={`text-xs font-bold uppercase tracking-wide ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                        Display & Theme
                                    </label>

                                    {/* Theme Mode Card */}
                                    <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                                        isLight ? 'bg-[#F4ECD8] border-[#D9C9A3]' : 'bg-[#1a1a22] border-white/10'
                                    }`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/80'}`}>
                                                {isLight ? <Sun className="w-4 h-4 text-amber-700" /> : <Moon className="w-4 h-4 text-amber-400" />}
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold">Theme Mode</div>
                                                <div className={`text-[10px] ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                                    {isLight ? 'Warm Sepia (Easy on eyes)' : 'Pure OLED Midnight'}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleTheme}
                                            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                                                theme === 'dark' 
                                                    ? isLight ? 'bg-[#A0522D]' : 'bg-amber-400'
                                                    : isLight ? 'bg-[#D9C9A3]' : 'bg-white/20'
                                            }`}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white transition-transform transform absolute top-1 ${
                                                theme === 'dark' ? 'translate-x-7' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>

                                    {/* Reading Direction */}
                                    <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                                        isLight ? 'bg-[#F4ECD8] border-[#D9C9A3]' : 'bg-[#1a1a22] border-white/10'
                                    }`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/80'}`}>
                                                <ArrowLeftRight className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold">Page Turn Direction</div>
                                                <div className={`text-[10px] ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                                    {readingDirection === 'rtl' ? 'Right-to-Left (Manga standard)' : 'Left-to-Right (Western)'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 p-1 rounded-xl bg-black/10 border border-white/5">
                                            <button
                                                type="button"
                                                onClick={() => setReadingDirection('ltr')}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                                    readingDirection === 'ltr'
                                                        ? isLight ? 'bg-[#A0522D] text-white shadow-xs' : 'bg-amber-400 text-black shadow-xs'
                                                        : isLight ? 'text-[#5C4430]' : 'text-white/60'
                                                }`}
                                            >
                                                LTR
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setReadingDirection('rtl')}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                                    readingDirection === 'rtl'
                                                        ? isLight ? 'bg-[#A0522D] text-white shadow-xs' : 'bg-amber-400 text-black shadow-xs'
                                                        : isLight ? 'text-[#5C4430]' : 'text-white/60'
                                                }`}
                                            >
                                                RTL
                                            </button>
                                        </div>
                                    </div>

                                    {/* Fit Mode Selector */}
                                    <div className="space-y-2 pt-1">
                                        <div className="text-xs font-semibold">Image Fit Mode</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {fitCards.map(f => {
                                                const isActive = fitMode === f.value;
                                                const Icon = f.icon;

                                                return (
                                                    <button
                                                        key={f.value}
                                                        type="button"
                                                        onClick={() => setFitMode(f.value)}
                                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                                                            isActive
                                                                ? isLight
                                                                    ? 'bg-[#A0522D]/15 border-[#A0522D]/50 text-[#733516] font-bold'
                                                                    : 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold'
                                                                : isLight
                                                                    ? 'bg-[#F4ECD8] border-[#D9C9A3] text-[#2C1E0F]'
                                                                    : 'bg-white/[0.04] border-white/10 text-white/80'
                                                        }`}
                                                    >
                                                        <Icon className="w-4 h-4 shrink-0" />
                                                        <div className="min-w-0">
                                                            <div className="text-xs truncate">{f.label}</div>
                                                            <div className={`text-[9px] truncate ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>{f.desc}</div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Section 4: Scroll & Continuous Settings */}
                                <div className="space-y-3">
                                    <label className={`text-xs font-bold uppercase tracking-wide ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                        Continuous & Scrolling
                                    </label>

                                    {/* Continuous Chapter */}
                                    <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                                        isLight ? 'bg-[#F4ECD8] border-[#D9C9A3]' : 'bg-[#1a1a22] border-white/10'
                                    }`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/80'}`}>
                                                <Infinity className={`w-4 h-4 ${isLight ? 'text-[#A0522D]' : 'text-amber-400'}`} />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold">Continuous Chapter</div>
                                                <div className={`text-[10px] ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                                    Auto load next chapter when scrolling
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleContinuousChapter}
                                            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                                                continuousChapter 
                                                    ? isLight ? 'bg-[#A0522D]' : 'bg-amber-400'
                                                    : isLight ? 'bg-[#D9C9A3]' : 'bg-white/20'
                                            }`}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white transition-transform transform absolute top-1 ${
                                                continuousChapter ? 'translate-x-7' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>

                                    {/* Auto-Scroll (if scroll mode) */}
                                    {isScrollMode && (
                                        <div className={`p-3.5 rounded-2xl border space-y-3 ${
                                            isLight ? 'bg-[#F4ECD8] border-[#D9C9A3]' : 'bg-[#1a1a22] border-white/10'
                                        }`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-xl ${isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/80'}`}>
                                                        {isAutoScrolling ? <Pause className="w-4 h-4 text-amber-600" /> : <Play className="w-4 h-4" />}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold">Auto-Scroll</div>
                                                        <div className={`text-[10px] ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                                            Hands-free continuous reading
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={toggleAutoScroll}
                                                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                                                        isAutoScrolling 
                                                            ? isLight ? 'bg-[#A0522D]' : 'bg-amber-400'
                                                            : isLight ? 'bg-[#D9C9A3]' : 'bg-white/20'
                                                    }`}
                                                >
                                                    <div className={`w-4 h-4 rounded-full bg-white transition-transform transform absolute top-1 ${
                                                        isAutoScrolling ? 'translate-x-7' : 'translate-x-1'
                                                    }`} />
                                                </button>
                                            </div>

                                            <div className="space-y-1 pt-1">
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span className={`flex items-center gap-1 font-semibold ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                                        <Gauge className="w-3.5 h-3.5" /> Scroll Speed
                                                    </span>
                                                    <span className="font-mono font-bold text-xs">{autoScrollSpeed.toFixed(1)}x</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="0.1" 
                                                    max="10" 
                                                    step="0.1" 
                                                    value={autoScrollSpeed}
                                                    onChange={(e) => setAutoScrollSpeed(parseFloat(e.target.value))}
                                                    className="w-full accent-amber-500 cursor-pointer h-2 bg-black/20 rounded-lg"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Strip Margin Slider */}
                                    {readingMode === 'strip' && (
                                        <div className={`p-3.5 rounded-2xl border space-y-2 ${
                                            isLight ? 'bg-[#F4ECD8] border-[#D9C9A3]' : 'bg-[#1a1a22] border-white/10'
                                        }`}>
                                            <div className="flex items-center justify-between text-xs font-bold">
                                                <span>Strip Gap Spacing</span>
                                                <span className="font-mono font-bold">{stripMargin}px</span>
                                            </div>
                                            <input 
                                                type="range" 
                                                min="0" 
                                                max="32" 
                                                step="2" 
                                                value={stripMargin}
                                                onChange={(e) => setStripMargin(parseInt(e.target.value))}
                                                className="w-full accent-amber-500 cursor-pointer h-2 bg-black/20 rounded-lg"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Section 5: Experience & Preload */}
                                <div className="space-y-3">
                                    <label className={`text-xs font-bold uppercase tracking-wide ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                        Experience & Preload
                                    </label>

                                    {/* Floating Page Number */}
                                    <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                                        isLight ? 'bg-[#F4ECD8] border-[#D9C9A3]' : 'bg-[#1a1a22] border-white/10'
                                    }`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/80'}`}>
                                                <FileDigit className={`w-4 h-4 ${isLight ? 'text-[#A0522D]' : 'text-amber-400'}`} />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold">Floating Page Number</div>
                                                <div className={`text-[10px] ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                                    Show bottom page badge
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleFloatingPageNumber}
                                            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                                                showFloatingPageNumber 
                                                    ? isLight ? 'bg-[#A0522D]' : 'bg-amber-400'
                                                    : isLight ? 'bg-[#D9C9A3]' : 'bg-white/20'
                                            }`}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white transition-transform transform absolute top-1 ${
                                                showFloatingPageNumber ? 'translate-x-7' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>

                                    {/* Navigation Tap Tips */}
                                    <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                                        isLight ? 'bg-[#F4ECD8] border-[#D9C9A3]' : 'bg-[#1a1a22] border-white/10'
                                    }`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/80'}`}>
                                                <Eye className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold">Navigation Tap Tips</div>
                                                <div className={`text-[10px] ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                                    Touch zone guides for page turns
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleNavigationTips}
                                            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                                                showNavigationTips 
                                                    ? isLight ? 'bg-[#A0522D]' : 'bg-amber-400'
                                                    : isLight ? 'bg-[#D9C9A3]' : 'bg-white/20'
                                            }`}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white transition-transform transform absolute top-1 ${
                                                showNavigationTips ? 'translate-x-7' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>

                                    {/* Preload Intensity */}
                                    <div className={`p-3.5 rounded-2xl border space-y-2.5 ${
                                        isLight ? 'bg-[#F4ECD8] border-[#D9C9A3]' : 'bg-[#1a1a22] border-white/10'
                                    }`}>
                                        <div className="text-xs font-bold">Image Preload Buffer</div>
                                        <div className="grid grid-cols-3 gap-1.5">
                                            {(['light', 'normal', 'aggressive'] as const).map(p => {
                                                const isActive = preloadIntensity === p;
                                                return (
                                                    <button
                                                        key={p}
                                                        type="button"
                                                        onClick={() => setPreloadIntensity(p)}
                                                        className={`py-2 px-1 rounded-xl text-xs font-bold capitalize transition-all ${
                                                            isActive
                                                                ? isLight
                                                                    ? 'bg-[#A0522D] text-white shadow-xs'
                                                                    : 'bg-amber-400 text-black shadow-xs'
                                                                : isLight
                                                                    ? 'bg-[#EAE0CB] text-[#5C4430] hover:bg-[#E5D7BC]'
                                                                    : 'bg-white/10 text-white/70 hover:bg-white/15'
                                                        }`}
                                                    >
                                                        {p}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        /* Classic Desktop Right Sidebar */
                        <motion.div 
                            className={cn(
                                "fixed top-0 right-0 bottom-0 z-[200] w-80 max-w-[85vw] flex flex-col transition-colors shadow-2xl",
                                isLight
                                    ? "!bg-[#FAF6EC] !text-[#2C1E0F] !border-l !border-[#D9C9A3] shadow-2xl shadow-[#5C4430]/25"
                                    : "!bg-[#09090b] !text-white !border-l !border-white/10 shadow-2xl shadow-black/95"
                            )}
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                        >
                            {/* Header */}
                            <div className={`px-5 py-4 border-b flex items-center justify-between shrink-0 ${
                                isLight ? '!bg-[#F4ECD8] !border-[#D9C9A3]' : '!bg-[#121216] !border-white/10'
                            }`}>
                                <div className="min-w-0 flex-1 mr-3">
                                    <h3 className={`font-semibold text-xs tracking-tight truncate ${isLight ? 'text-[#2C1E0F]' : 'text-white'}`}>
                                        {title || 'Reader Options'}
                                    </h3>
                                    <p className={`text-[10px] mt-0.5 ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                        {isLight ? 'Sepia Theme' : 'OLED Midnight'}
                                    </p>
                                </div>
                                <button 
                                    className={`p-1.5 rounded-lg transition-colors ${
                                        isLight ? 'text-[#7D634B] hover:text-[#2C1E0F] hover:bg-[#E5D7BC]' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                                    }`} 
                                    onClick={closeSidebar} 
                                    title="Close sidebar (Esc)"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Content */}
                            <motion.div 
                                className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6"
                                variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } }}
                                initial="hidden" 
                                animate="show"
                            >
                                {/* Reading Mode Section */}
                                <motion.div className="space-y-2" variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}>
                                    <label className={`text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                        Reading Mode
                                    </label>
                                    <div className={`flex items-center p-1 rounded-xl border ${
                                        isLight ? 'bg-[#EAE0CB] border-[#D9C9A3]' : 'bg-[#18181b] border-white/10'
                                    }`}>
                                        {modeCards.map(opt => {
                                            const isActive = readingMode === opt.value;
                                            return (
                                                <button
                                                    key={opt.value}
                                                    className={`flex-1 py-1.5 px-1 rounded-lg text-xs font-semibold transition-all ${
                                                        isActive
                                                            ? isLight
                                                                ? 'bg-[#A0522D] text-white shadow-xs'
                                                                : 'bg-white/20 text-white shadow-xs'
                                                            : isLight
                                                                ? 'text-[#5C4430] hover:text-[#2C1E0F] hover:bg-[#FAF6EC]/60'
                                                                : 'text-zinc-400 hover:text-white hover:bg-white/5'
                                                    }`}
                                                    onClick={() => setReadingMode(opt.value)}
                                                >
                                                    {opt.label.split(' ')[0]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </motion.div>

                                {/* Page Navigation */}
                                <motion.div className="space-y-2" variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}>
                                    <div className="flex items-center justify-between">
                                        <label className={`text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                            Navigation
                                        </label>
                                        <span className={`text-[10px] font-mono font-medium ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                            {currentPage + 1} / {totalPages}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                                            disabled={currentPage <= 0}
                                            className={`p-2 rounded-xl border flex items-center justify-center transition-all disabled:opacity-30 ${
                                                isLight
                                                    ? 'bg-[#EAE0CB] hover:bg-[#E5D7BC] border-[#D9C9A3] text-[#2C1E0F]'
                                                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                                            }`}
                                            title="Previous Page"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>

                                        <div className="flex-1">
                                            <Select
                                                value={String(currentPage)}
                                                onValueChange={(val) => setCurrentPage(Number(val))}
                                            >
                                                <SelectTrigger className={`w-full h-9 text-xs rounded-xl border font-medium ${
                                                    isLight 
                                                        ? 'bg-[#FAF6EC] border-[#D9C9A3] text-[#2C1E0F]' 
                                                        : 'bg-[#18181b] border-white/10 text-white'
                                                }`}>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className={`max-h-60 rounded-xl ${
                                                    isLight 
                                                        ? '!bg-[#FAF6EC] text-[#2C1E0F] border-[#D9C9A3]' 
                                                        : '!bg-[#121216] text-white border-white/10'
                                                }`}>
                                                    {Array.from({ length: totalPages }, (_, i) => (
                                                        <SelectItem key={i} value={String(i)} className="text-xs">
                                                            Page {i + 1} / {totalPages}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <button
                                            onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                                            disabled={currentPage >= totalPages - 1}
                                            className={`p-2 rounded-xl border flex items-center justify-center transition-all disabled:opacity-30 ${
                                                isLight
                                                    ? 'bg-[#EAE0CB] hover:bg-[#E5D7BC] border-[#D9C9A3] text-[#2C1E0F]'
                                                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                                            }`}
                                            title="Next Page"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </motion.div>

                                <div className={`border-t ${isLight ? 'border-[#D9C9A3]/60' : 'border-white/5'}`} />

                                {/* Display & Automation */}
                                <motion.div className="space-y-3" variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}>
                                    <label className={`text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                        Display & Theme
                                    </label>

                                    <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                                        isLight ? 'bg-[#F4ECD8] border-[#D9C9A3]' : 'bg-[#121216] border-white/10'
                                    }`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/80'}`}>
                                                {isLight ? <Sun className="w-4 h-4 text-amber-700" /> : <Moon className="w-4 h-4 text-amber-400" />}
                                            </div>
                                            <div>
                                                <div className="text-xs font-semibold">Theme Mode</div>
                                                <div className={`text-[10px] ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                                    {isLight ? 'Warm Sepia' : 'OLED Midnight'}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleTheme}
                                            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                                                theme === 'dark' 
                                                    ? isLight ? 'bg-[#A0522D]' : 'bg-amber-400'
                                                    : isLight ? 'bg-[#D9C9A3]' : 'bg-white/20'
                                            }`}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white transition-transform transform absolute top-1 ${
                                                theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>

                                    {/* Auto-Scroll (if scroll mode) */}
                                    {isScrollMode && (
                                        <div className={`p-3 rounded-2xl border space-y-3 ${
                                            isLight ? 'bg-[#F4ECD8] border-[#D9C9A3]' : 'bg-[#121216] border-white/10'
                                        }`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-xl ${isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/80'}`}>
                                                        {isAutoScrolling ? <Pause className="w-4 h-4 text-amber-600" /> : <Play className="w-4 h-4" />}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-semibold">Auto-Scroll</div>
                                                        <div className={`text-[10px] ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                                            Hands-free reading
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={toggleAutoScroll}
                                                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                                                        isAutoScrolling 
                                                            ? isLight ? 'bg-[#A0522D]' : 'bg-amber-400'
                                                            : isLight ? 'bg-[#D9C9A3]' : 'bg-white/20'
                                                    }`}
                                                >
                                                    <div className={`w-4 h-4 rounded-full bg-white transition-transform transform absolute top-1 ${
                                                        isAutoScrolling ? 'translate-x-6' : 'translate-x-1'
                                                    }`} />
                                                </button>
                                            </div>

                                            <div className="space-y-1.5 pt-1">
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span className={`flex items-center gap-1 ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                                        <Gauge className="w-3 h-3" /> Speed
                                                    </span>
                                                    <span className="font-mono font-bold text-xs">{autoScrollSpeed.toFixed(1)}x</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="0.1" 
                                                    max="10" 
                                                    step="0.1" 
                                                    value={autoScrollSpeed}
                                                    onChange={(e) => setAutoScrollSpeed(parseFloat(e.target.value))}
                                                    className="w-full accent-amber-500"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </motion.div>

                                <div className={`border-t ${isLight ? 'border-[#D9C9A3]/60' : 'border-white/5'}`} />

                                {/* Advanced Settings Button */}
                                <motion.div variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}>
                                    <button
                                        className={`w-full p-3 rounded-2xl border flex items-center justify-between group transition-all cursor-pointer ${
                                            isLight
                                                ? 'bg-[#F4ECD8] hover:bg-[#EAE0CB] border-[#D9C9A3] text-[#2C1E0F] shadow-xs'
                                                : 'bg-[#121216] hover:bg-[#1a1a20] border-white/10 text-white shadow-xs'
                                        }`}
                                        onClick={toggleSettings}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl transition-colors ${
                                                isLight ? 'bg-[#A0522D]/15 text-[#A0522D] group-hover:bg-[#A0522D]/25' : 'bg-amber-400/15 text-amber-400 group-hover:bg-amber-400/25'
                                            }`}>
                                                <SlidersHorizontal className="w-4 h-4" />
                                            </div>
                                            <div className="text-left">
                                                <div className="text-xs font-semibold">Advanced Settings</div>
                                                <div className={`text-[10px] ${isLight ? 'text-[#7D634B]' : 'text-zinc-400'}`}>
                                                    Layout, zoom, shortcuts
                                                </div>
                                            </div>
                                        </div>
                                        <ArrowNext className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                                    </button>
                                </motion.div>
                            </motion.div>
                        </motion.div>
                    )}
                </>
            )}
        </AnimatePresence>,
        document.body
    );
});
