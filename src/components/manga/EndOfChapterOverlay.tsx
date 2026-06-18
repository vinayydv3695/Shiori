import React from 'react';
import { useMangaUIStore } from '@/store/mangaReaderStore';
import { ChevronRight } from 'lucide-react';

export function EndOfChapterOverlay() {
    const onNextChapter = useMangaUIStore(s => s.onNextChapter);

    if (!onNextChapter) return null;

    return (
        <div className="w-full flex justify-center items-center py-16 mt-8 border-t border-white/5">
            <div className="text-center space-y-6 max-w-md w-full px-4">
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">End of Chapter</h2>
                    <p className="text-muted-foreground text-sm">Ready for the next one?</p>
                </div>
                <button
                    onClick={onNextChapter}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-14 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/20"
                >
                    <span>Next Chapter / Volume</span>
                    <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
}
