import React from 'react';
import { Loader2 } from 'lucide-react';

interface ChapterSeparatorCardProps {
    currentChapterTitle: string;
    nextChapterTitle?: string;
    isLoadingNext?: boolean;
}

export function ChapterSeparatorCard({
    currentChapterTitle,
    nextChapterTitle,
    isLoadingNext
}: ChapterSeparatorCardProps) {
    return (
        <div className="w-full flex justify-center items-center py-16 my-8 border-t border-b border-white/5 bg-background/50">
            <div className="text-center space-y-8 max-w-md w-full px-4">
                <div className="space-y-2">
                    <p className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">Finished</p>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">{currentChapterTitle}</h2>
                </div>
                
                {nextChapterTitle ? (
                    <div className="space-y-2 pt-4 border-t border-white/10">
                        <p className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">Next</p>
                        <h2 className="text-xl font-bold tracking-tight text-foreground/90">{nextChapterTitle}</h2>
                        {isLoadingNext && (
                            <div className="flex items-center justify-center gap-2 mt-4 text-muted-foreground">
                                <Loader2 className="animate-spin" size={16} />
                                <span className="text-sm">Loading next chapter...</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2 pt-4 border-t border-white/10">
                        <p className="text-muted-foreground text-sm">No next chapter available.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
