import { Search, Database, Globe, ArrowRight, BookMarked, Download } from "lucide-react";

export function MetadataSearchStep() {
    return (
        <div className="space-y-8 py-4 animate-in fade-in duration-500">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Enrich Your Library</h2>
                <p className="text-muted-foreground">
                    Automatically pull beautiful covers and detailed metadata from the web.
                </p>
            </div>

            <div className="bg-muted/30 rounded-xl p-6 max-w-lg mx-auto border border-border/50 shadow-sm space-y-6">
                
                <div className="flex items-center justify-center gap-4 py-4">
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <Search className="w-6 h-6 text-primary" />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">Search</span>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                            <Download className="w-6 h-6 text-primary" />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">Fetch</span>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                            <BookMarked className="w-6 h-6 text-primary-foreground" />
                        </div>
                        <span className="text-xs font-medium text-primary">Apply</span>
                    </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-border">
                    <p className="text-sm font-medium mb-3">Supported Sources:</p>
                    
                    <div className="flex items-start gap-4 p-4 rounded-lg bg-card border border-border">
                        <div className="w-10 h-10 rounded-full bg-[#02A9FF]/10 flex items-center justify-center flex-shrink-0">
                            <Database className="w-5 h-5 text-[#02A9FF]" />
                        </div>
                        <div>
                            <div className="font-semibold text-foreground">AniList</div>
                            <div className="text-sm text-muted-foreground mt-1">Perfect for finding detailed metadata, genres, and high-quality covers for your Manga collection.</div>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 rounded-lg bg-card border border-border">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                            <Globe className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                            <div className="font-semibold text-foreground">OpenLibrary</div>
                            <div className="text-sm text-muted-foreground mt-1">A massive catalog to automatically find book descriptions, authors, and cover art.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
