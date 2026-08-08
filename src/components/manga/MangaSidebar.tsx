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
    BookOpen, 
    Scroll, 
    Smartphone, 
    Columns, 
    Layers, 
    Moon, 
    Sun, 
    Play, 
    Pause, 
    ChevronLeft, 
    ChevronRight, 
    ChevronRight as ArrowNext,
    Gauge,
    BookMarked
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
 * Right sidebar overlay with reading controls.
 * Fixed overlay with GPU acceleration & rich Light/Dark theme adaptation.
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

    const modeOptions: { value: ReadingMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
        { value: 'single', label: 'Single', icon: BookOpen },
        { value: 'strip', label: 'Strip', icon: Scroll },
        { value: 'webtoon', label: 'Webtoon', icon: Smartphone },
        { value: 'manhwa', label: 'Manhwa', icon: Columns },
        { value: 'comic', label: 'Comic', icon: Layers },
    ];

    return (
        <AnimatePresence>
            {isSidebarOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 z-[140] bg-black/50 backdrop-blur-xs"
                        onClick={closeSidebar}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                    />

                    {/* Sidebar */}
                    <motion.div 
                        className={cn(
                            "fixed top-0 right-0 bottom-0 z-[145] w-84 max-w-[90vw] flex flex-col backdrop-blur-2xl transition-colors shadow-2xl",
                            isLight
                                ? "bg-[#FAF6EC]/98 text-[#2C1E0F] border-l border-[#D9C9A3] shadow-2xl shadow-[#5C4430]/25 ring-1 ring-[#8A6A50]/10"
                                : "bg-[#121217]/98 text-white border-l border-white/10 shadow-2xl shadow-black/90 ring-1 ring-white/5",
                            isMobile && "!top-auto !bottom-0 !right-0 !left-0 !h-[80vh] !w-full rounded-t-3xl !border-l-0 border-t"
                        )}
                        initial={isMobile ? { y: "100%" } : { x: "100%" }}
                        animate={isMobile ? { y: 0 } : { x: 0 }}
                        exit={isMobile ? { y: "100%" } : { x: "100%" }}
                        transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                    >
                        {/* Header */}
                        <div className={`px-5 py-4 border-b flex items-center justify-between shrink-0 ${
                            isLight ? 'bg-[#F0E6CE]/70 border-[#D9C9A3]' : 'bg-white/[0.03] border-white/10'
                        }`}>
                            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
                                <div className={`p-1.5 rounded-xl ${isLight ? 'bg-[#A0522D]/15 text-[#A0522D]' : 'bg-amber-400/15 text-amber-400'}`}>
                                    <BookMarked className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className={`font-semibold text-xs truncate ${isLight ? 'text-[#2C1E0F]' : 'text-white'}`}>
                                        {title || 'Reader Options'}
                                    </h3>
                                    <p className={`text-[10px] ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                        Reading controls
                                    </p>
                                </div>
                            </div>
                            <button 
                                className={`p-1.5 rounded-full transition-colors ${
                                    isLight ? 'text-[#5C4430] hover:text-[#2C1E0F] hover:bg-[#E5D7BC]' : 'text-white/60 hover:text-white hover:bg-white/10'
                                }`} 
                                onClick={closeSidebar} 
                                title="Close sidebar"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Content */}
                        <motion.div 
                            className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6"
                            variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.05 } } }}
                            initial="hidden" 
                            animate="show"
                        >
                            {/* Reading Mode Section */}
                            <motion.div className="space-y-2.5" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
                                <label className={`text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                    Reading Mode
                                </label>
                                <div className={`flex items-center gap-1 p-1 rounded-2xl border ${
                                    isLight ? 'bg-[#EAE0CB]/70 border-[#D9C9A3]' : 'bg-black/40 border-white/5'
                                }`}>
                                    {modeOptions.map(opt => {
                                        const Icon = opt.icon;
                                        const isActive = readingMode === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[11px] font-semibold transition-all ${
                                                    isActive
                                                        ? isLight
                                                            ? 'bg-[#A0522D] text-white shadow-xs'
                                                            : 'bg-amber-400 text-black shadow-xs'
                                                        : isLight
                                                            ? 'text-[#5C4430] hover:text-[#2C1E0F] hover:bg-[#FAF6EC]/80'
                                                            : 'text-white/60 hover:text-white hover:bg-white/5'
                                                }`}
                                                onClick={() => setReadingMode(opt.value)}
                                                title={opt.label}
                                            >
                                                <Icon className="w-3.5 h-3.5 mb-1" />
                                                <span className="text-[10px] leading-tight">{opt.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.div>

                            {/* Page Navigation */}
                            <motion.div className="space-y-2.5" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
                                <div className="flex items-center justify-between">
                                    <label className={`text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                        Navigation
                                    </label>
                                    <span className={`text-[10px] font-mono font-medium ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                        {currentPage + 1} of {totalPages}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                                        disabled={currentPage <= 0}
                                        className={`p-2 rounded-xl border flex items-center justify-center transition-all disabled:opacity-30 ${
                                            isLight
                                                ? 'bg-[#EAE0CB] hover:bg-[#E5D7BC] border-[#D9C9A3] text-[#2C1E0F]'
                                                : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'
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
                                            <SelectTrigger className={`w-full h-9 text-xs rounded-xl border ${
                                                isLight 
                                                    ? 'bg-[#EFE6D2] border-[#D9C9A3] text-[#2C1E0F]' 
                                                    : 'bg-white/[0.06] border-white/10 text-white'
                                            }`}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className={`max-h-60 rounded-2xl ${
                                                isLight 
                                                    ? 'bg-[#FAF6EC] text-[#2C1E0F] border-[#D9C9A3]' 
                                                    : 'bg-[#121217] text-white border-white/10'
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
                                                : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'
                                        }`}
                                        title="Next Page"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>

                            <div className={`border-t ${isLight ? 'border-[#D9C9A3]/60' : 'border-white/5'}`} />

                            {/* Display & Automation */}
                            <motion.div className="space-y-3" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
                                <label className={`text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                    Display
                                </label>

                                <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                                    isLight ? 'bg-[#FAF6EC] border-[#D9C9A3]' : 'bg-white/[0.03] border-white/10'
                                }`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-xl ${isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/70'}`}>
                                            {isLight ? <Sun className="w-4 h-4 text-amber-600" /> : <Moon className="w-4 h-4 text-amber-300" />}
                                        </div>
                                        <div>
                                            <div className="text-xs font-semibold">Theme Mode</div>
                                            <div className={`text-[10px] ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
                                                {isLight ? 'Sepia Cream' : 'Dark Obsidian'}
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
                                    <div className={`p-3.5 rounded-2xl border space-y-3 ${
                                        isLight ? 'bg-[#FAF6EC] border-[#D9C9A3]' : 'bg-white/[0.03] border-white/10'
                                    }`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-xl ${isLight ? 'bg-[#E5D7BC] text-[#5C4430]' : 'bg-white/10 text-white/70'}`}>
                                                    {isAutoScrolling ? <Pause className="w-4 h-4 text-amber-500" /> : <Play className="w-4 h-4" />}
                                                </div>
                                                <div>
                                                    <div className="text-xs font-semibold">Auto-Scroll</div>
                                                    <div className={`text-[10px] ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
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
                                                <span className={`flex items-center gap-1 ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
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
                                                className="w-full accent-amber-400"
                                            />
                                        </div>
                                    </div>
                                )}
                            </motion.div>

                            <div className={`border-t ${isLight ? 'border-[#D9C9A3]/60' : 'border-white/5'}`} />

                            {/* Advanced Settings Button */}
                            <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
                                <button
                                    className={`w-full p-3.5 rounded-2xl border flex items-center justify-between group transition-all ${
                                        isLight
                                            ? 'bg-[#EAE0CB] hover:bg-[#E5D7BC] border-[#D9C9A3] text-[#2C1E0F] shadow-xs'
                                            : 'bg-white/[0.06] hover:bg-white/[0.1] border-white/10 text-white shadow-xs'
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
                                            <div className={`text-[10px] ${isLight ? 'text-[#8A6A50]' : 'text-white/50'}`}>
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

