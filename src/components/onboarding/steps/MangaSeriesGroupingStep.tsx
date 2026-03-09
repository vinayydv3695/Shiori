import { Layers } from "lucide-react";

export function MangaSeriesGroupingStep() {
    return (
        <div className="space-y-8 py-4 animate-in fade-in duration-500">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Manga Series, Beautifully Grouped Together</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                    Multiple volumes of the same manga are elegantly stacked into a single, clean cover card to keep your shelves tidy.
                </p>
            </div>

            <div className="bg-muted/30 rounded-xl p-8 max-w-lg mx-auto border border-border/50 shadow-sm flex flex-col items-center justify-center">
                <div className="relative w-40 h-56 perspective-[1000px] mb-8 mt-4">
                    <div className="absolute inset-0 bg-card border border-border rounded-lg shadow-sm transform -rotate-12 translate-x-6 translate-y-4 opacity-50 transition-all duration-700 hover:rotate-0 hover:translate-x-0 hover:translate-y-0" />
                    <div className="absolute inset-0 bg-card border border-border rounded-lg shadow-md transform -rotate-6 translate-x-3 translate-y-2 opacity-75 transition-all duration-700 hover:rotate-0 hover:translate-x-0 hover:translate-y-0" />
                    <div className="absolute inset-0 bg-card border border-border rounded-lg shadow-xl flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/20 z-10 transition-all duration-700">
                        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center shadow-inner">
                            <Layers className="w-8 h-8 text-primary" />
                        </div>
                        <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                            13 Volumes
                        </div>
                    </div>
                </div>

                <div className="text-center z-10 relative bg-background/80 p-4 rounded-xl backdrop-blur-sm border border-border/50 w-full">
                    <p className="text-sm font-medium text-foreground">
                        Simply browse your newly decluttered manga library
                    </p>
                </div>
            </div>
        </div>
    );
}
