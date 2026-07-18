import React, { useEffect, useState } from 'react';
import { useMangaContentStore, useMangaSettingsStore } from '@/store/mangaReaderStore';
import { AnimatePresence, motion } from 'framer-motion';

export function FloatingPageNumber() {
    const currentPage = useMangaContentStore(s => s.currentPage);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const showFloatingPageNumber = useMangaSettingsStore(s => s.showFloatingPageNumber);
    const [isVisible, setIsVisible] = useState(true);

    // Auto-hide logic to not be annoying (show briefly when page changes)
    useEffect(() => {
        setIsVisible(true);
        const timer = setTimeout(() => {
            setIsVisible(false);
        }, 2000); // Hide after 2 seconds of inactivity
        return () => clearTimeout(timer);
    }, [currentPage]);
    
    if (!showFloatingPageNumber || totalPages <= 0) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-x-0 bottom-6 pointer-events-none z-[100] drop-shadow-md select-none flex justify-center"
                >
                    <div 
                        className="font-bold tabular-nums text-lg sm:text-xl tracking-widest"
                        style={{
                            color: 'var(--manga-accent)',
                            textShadow: `
                                -1px -1px 0 #fff,
                                1px -1px 0 #fff,
                                -1px 1px 0 #fff,
                                1px 1px 0 #fff,
                                0px 2px 4px rgba(0,0,0,0.4)
                            `,
                            WebkitTextStroke: '0.5px #fff',
                            fontFamily: "'Comic Sans MS', 'Comic Neue', cursive, sans-serif"
                        }}
                    >
                        {currentPage + 1} <span className="text-base sm:text-lg">/</span> {totalPages}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
