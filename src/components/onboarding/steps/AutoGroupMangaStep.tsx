import { Wand2, MousePointerClick, ChevronDown, Plus } from "lucide-react";

export function AutoGroupMangaStep() {
    return (
        <div className="space-y-8 py-4 animate-in fade-in duration-500">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Magically Organize Your Comic Collection</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                    Let Shiori do the heavy lifting. Automatically detect and group loose manga volumes into their correct series with a single click.
                </p>
            </div>

            <div className="bg-muted/30 rounded-xl p-8 max-w-lg mx-auto border border-border/50 shadow-sm flex flex-col items-center">
                <div className="relative w-full max-w-[280px] mt-2 mb-10">
                    <div className="flex items-center justify-end w-full mb-2">
                        <div className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 rounded-md shadow-md text-sm font-medium">
                            <Plus className="w-4 h-4" />
                            Import
                            <ChevronDown className="w-4 h-4 ml-1 opacity-70" />
                        </div>
                    </div>
                    
                    <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-10 animate-in fade-in slide-in-from-top-2">
                        <div className="p-1 space-y-1">
                            <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground rounded-md opacity-60">
                                <div className="w-4 h-4 bg-muted-foreground/30 rounded-sm" />
                                Add Files
                            </div>
                            <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground rounded-md opacity-60">
                                <div className="w-4 h-4 bg-muted-foreground/30 rounded-sm" />
                                Add Folder
                            </div>
                            <div className="h-px w-full bg-border my-1" />
                            <div className="flex items-center gap-2 px-2 py-2 text-sm text-foreground bg-primary/10 rounded-md border border-primary/20 relative">
                                <Wand2 className="w-4 h-4 text-primary" />
                                <span className="font-medium">Auto-group Series</span>
                                <div className="absolute -right-2 -bottom-3 text-foreground drop-shadow-md animate-bounce z-20">
                                    <MousePointerClick className="w-6 h-6" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="text-center z-10 relative bg-background/80 p-4 rounded-xl backdrop-blur-sm border border-border/50 w-full mt-6">
                    <p className="text-sm font-medium text-foreground">
                        Click "Auto-group" from Import dropdown in Manga/Comics section
                    </p>
                </div>
            </div>
        </div>
    );
}
