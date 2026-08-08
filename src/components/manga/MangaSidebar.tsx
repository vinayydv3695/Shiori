import React, { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    useMangaContentStore,
    useMangaUIStore,
    useMangaSettingsStore,
    type ReadingMode,
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
    Gauge
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';

/**
 * Minimal right sidebar overlay with reading controls.
 * Dual-theme: Warm Sepia & Pure OLED Midnight.
 */
export const MangaSidebar = memo(function MangaSidebar() {
    const isMobile = useIsMobile();
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
    const theme = useMangaSettingsStore(s => s.theme);
    const toggleTheme = useMangaSettingsStore(s => s.toggleTheme);
    const autoScrollSpeed = useMangaSettingsStore(s => s.autoScrollSpeed);
    const setAutoScrollSpeed = useMangaSettingsStore(s => s.setAutoScrollSpeed);
    const isLight = theme === 'light';

    const modeOptions: { value: ReadingMode; label: string }[] = [
        { value: 'single', label: 'Single' },
        { value: 'strip', label: 'Strip' },
        { value: 'webtoon', label: 'Webtoon' },
        { value: 'manhwa', label: 'Manhwa' },
        { value: 'comic', label: 'Comic' },
    ];

    return (
        <AnimatePresence>
            {isSidebarOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 z-[140] bg-black/40"
                        onClick={closeSidebar}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                    />

                    {/* Sidebar */}
                    <motion.div 
                        className={cn(
                            "fixed top-0 right-0 bottom-0 z-[145] w-80 max-w-[85vw] flex flex-col transition-colors shadow-2xl",
                            isLight
                                ? "!bg-[#FAF6EC] !text-[#2C1E0F] !border-l !border-[#D9C9A3] shadow-2xl shadow-[#5C4430]/25"
                                : "!bg-[#09090b] !text-white !border-l !border-white/10 shadow-2xl shadow-black/95",
                            isMobile && "!top-auto !bottom-0 !right-0 !left-0 !h-[75vh] !w-full rounded-t-3xl !border-l-0 border-t"
                        )}
                        initial={isMobile ? { y: "100%" } : { x: "100%" }}
                        animate={isMobile ? { y: 0 } : { x: 0 }}
                        exit={isMobile ? { y: "100%" } : { x: "100%" }}
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
                                    {modeOptions.map(opt => {
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
                                                {opt.label}
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
                                {(readingMode === 'webtoon' || readingMode === 'strip' || readingMode === 'manhwa') && (
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
                </>
            )}
        </AnimatePresence>
    );
});

