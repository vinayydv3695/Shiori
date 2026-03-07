import { BookImage, Library, ArrowRight } from "lucide-react";

export function ComicSetupStep() {
    return (
        <div className="space-y-8 py-4 animate-in fade-in duration-500">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Comic Books Collection</h2>
                <p className="text-muted-foreground">
                    Organize your Western comics separately from your Manga.
                </p>
            </div>

            <div className="bg-muted/30 rounded-xl p-6 max-w-lg mx-auto border border-border/50 shadow-sm space-y-6">
                <p className="text-sm text-center text-muted-foreground mb-6">
                    Shiori can now distinguish between traditional Japanese Manga and general Comic books, 
                    allowing you to keep your collections perfectly organized.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
                    <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-card border border-border w-full sm:w-1/2">
                        <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center">
                            <Library className="w-6 h-6 text-indigo-500" />
                        </div>
                        <div className="text-center">
                            <div className="font-bold text-foreground">Manga</div>
                            <div className="text-xs text-muted-foreground mt-1">Right-to-Left reading</div>
                        </div>
                    </div>

                    <ArrowRight className="hidden sm:block w-6 h-6 text-muted-foreground/50" />

                    <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-card border-primary/30 ring-1 ring-primary/20 w-full sm:w-1/2">
                        <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                            <BookImage className="w-6 h-6 text-orange-500" />
                        </div>
                        <div className="text-center">
                            <div className="font-bold text-foreground">Comics</div>
                            <div className="text-xs text-muted-foreground mt-1">Left-to-Right reading</div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm text-center text-foreground font-medium">
                        Access your dedicated Comics collection anytime from the new tab in the top toolbar!
                    </p>
                </div>
            </div>
        </div>
    );
}
