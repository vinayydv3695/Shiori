import { useState } from 'react';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Star, Trophy, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeUpdateMediaListEntry } from '@/lib/anilist';
import { useToast } from '@/store/toastStore';

interface CompletionPromptDialogProps {
    isOpen: boolean;
    onClose: () => void;
    mangaTitle: string;
    mediaId: number;
    anilistToken: string;
    totalChapters?: number;
    onComplete: () => void;
}

export function CompletionPromptDialog({
    isOpen,
    onClose,
    mangaTitle,
    mediaId,
    anilistToken,
    totalChapters = 0,
    onComplete
}: CompletionPromptDialogProps) {
    const [score, setScore] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { success, error } = useToast();
    
    // Convert 5-star score to AniList 100-point scale (or whatever the user uses, but 100 is safely scaled API-side now)
    const score100 = score * 20;

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            await safeUpdateMediaListEntry(
                mediaId,
                totalChapters, // Mark as having read all available chapters
                'COMPLETED',
                anilistToken,
                score100 > 0 ? score100 : undefined
            );
            success('Manga Completed', `Marked ${mangaTitle} as completed on AniList!`);
            onComplete();
            onClose();
        } catch (err) {
            console.error(err);
            error('Update Failed', 'Failed to update AniList. It will be synced later.');
            onClose(); // Still close on fail because safeUpdateMediaListEntry handles the offline queueing
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl">
                <DialogHeader className="flex flex-col items-center text-center pb-4">
                    <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
                        <Trophy className="w-8 h-8 text-yellow-500" />
                    </div>
                    <DialogTitle className="text-2xl font-bold tracking-tight">Congratulations!</DialogTitle>
                    <DialogDescription className="text-base mt-2">
                        You've reached the end of <span className="text-foreground font-semibold">{mangaTitle}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center py-6 space-y-4">
                    <p className="text-sm text-muted-foreground">How would you rate this manga?</p>
                    <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                type="button"
                                onClick={() => setScore(star)}
                                className="p-1 transition-transform hover:scale-110 focus:outline-none"
                            >
                                <Star 
                                    className={cn(
                                        "w-10 h-10 transition-colors",
                                        score >= star 
                                            ? "fill-yellow-500 text-yellow-500" 
                                            : "fill-transparent text-muted-foreground/30 hover:text-yellow-500/50"
                                    )} 
                                />
                            </button>
                        ))}
                    </div>
                    <div className="h-4 text-xs font-medium text-yellow-500/80">
                        {score === 1 && "Poor"}
                        {score === 2 && "Fair"}
                        {score === 3 && "Good"}
                        {score === 4 && "Very Good"}
                        {score === 5 && "Masterpiece"}
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
                    <Button 
                        variant="ghost" 
                        onClick={() => {
                            // Also mark complete but without score if they skip?
                            // Or just close? Let's just close.
                            onClose();
                        }}
                        className="sm:w-full"
                        disabled={isSubmitting}
                    >
                        Maybe Later
                    </Button>
                    <Button 
                        onClick={handleSubmit} 
                        className="sm:w-full bg-yellow-500 hover:bg-yellow-600 text-yellow-950 font-bold"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            "Complete & Rate"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
