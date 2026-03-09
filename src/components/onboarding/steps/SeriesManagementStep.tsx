import { Settings2, Pencil, Link2, Unlink, Trash2, MousePointer2 } from "lucide-react";

export function SeriesManagementStep() {
    return (
        <div className="space-y-8 py-4 animate-in fade-in duration-500">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Take Full Control of Series</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                    Easily fine-tune your collections. Edit details, merge split series, or ungroup volumes back to singles with our intuitive context menu.
                </p>
            </div>

            <div className="bg-muted/30 rounded-xl p-8 max-w-lg mx-auto border border-border/50 shadow-sm flex flex-col items-center">
                <div className="relative w-full max-w-xs mt-4 mb-6">
                    <div className="w-48 h-64 bg-card border border-border rounded-lg shadow-md mx-auto relative opacity-80">
                        <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                            Series
                        </div>
                        <div className="absolute inset-x-4 bottom-4 h-4 bg-muted/50 rounded" />
                        <div className="absolute inset-x-4 bottom-10 h-3 w-1/2 bg-muted/30 rounded" />
                    </div>
                    
                    <div className="absolute top-1/4 right-0 w-52 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-xl overflow-hidden z-10 transform translate-x-4">
                        <div className="p-1.5 space-y-0.5">
                            <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-foreground hover:bg-muted rounded-md cursor-default">
                                <Pencil className="w-4 h-4 text-muted-foreground" />
                                Edit Series Details
                            </div>
                            <div className="h-px w-full bg-border my-1" />
                            <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-foreground hover:bg-muted rounded-md cursor-default">
                                <Link2 className="w-4 h-4 text-muted-foreground" />
                                Merge with Series
                            </div>
                            <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-foreground hover:bg-muted rounded-md cursor-default">
                                <Unlink className="w-4 h-4 text-muted-foreground" />
                                Ungroup Series
                            </div>
                            <div className="h-px w-full bg-border my-1" />
                            <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 rounded-md cursor-default">
                                <Trash2 className="w-4 h-4" />
                                Remove from Library
                            </div>
                        </div>
                    </div>
                    
                    <div className="absolute top-1/2 right-12 text-foreground drop-shadow-md z-20">
                        <MousePointer2 className="w-6 h-6 fill-background" />
                        <div className="absolute top-0 right-0 w-3 h-3 bg-primary/20 rounded-full animate-ping -z-10" />
                    </div>
                </div>

                <div className="text-center z-10 relative bg-background/80 p-4 rounded-xl backdrop-blur-sm border border-border/50 w-full mt-4">
                    <p className="text-sm font-medium text-foreground">
                        Right-click any stacked series card to explore management options
                    </p>
                </div>
            </div>
        </div>
    );
}
