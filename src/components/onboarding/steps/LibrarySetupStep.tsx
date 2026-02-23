import { useState } from "react";
import { useOnboardingStore } from "../../../store/onboardingStore";
import { api } from "../../../lib/tauri";
import { FolderOpen, MapPin, Search } from "lucide-react";
import { Button } from "../../ui/button";
import { cn } from "../../../lib/utils";

export function LibrarySetupStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    const [isSelectingBook, setIsSelectingBook] = useState(false);
    const [isSelectingManga, setIsSelectingManga] = useState(false);

    const bookPath = draftConfig.defaultImportPath || "";
    const mangaPath = draftConfig.defaultMangaPath || "";
    const autoScan = draftConfig.autoScanEnabled ?? true;

    const handleSelectBookFolder = async () => {
        setIsSelectingBook(true);
        try {
            const folder = await api.openFolderDialog();
            if (folder) setDraftValue('defaultImportPath', folder);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSelectingBook(false);
        }
    };

    const handleSelectMangaFolder = async () => {
        setIsSelectingManga(true);
        try {
            const folder = await api.openFolderDialog();
            if (folder) setDraftValue('defaultMangaPath', folder);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSelectingManga(false);
        }
    };

    return (
        <div className="space-y-8 py-4 w-full">
            <div className="text-center space-y-2 mb-8">
                <h2 className="text-3xl font-bold tracking-tight">Library Directories</h2>
                <p className="text-muted-foreground">
                    Map your local folders so Shiori knows where to index your files.
                </p>
            </div>

            <div className="space-y-6">

                {/* Books Directory */}
                <div className="p-5 border border-border rounded-xl bg-card space-y-4 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <MapPin className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="font-semibold">Books Directory</h3>
                            <p className="text-xs text-muted-foreground">Default import path for EPUBs, PDFs, etc.</p>
                        </div>
                    </div>

                    <div className="flex gap-2 items-center">
                        <div className="flex-1 bg-muted rounded-lg p-3 border border-border/50 text-sm font-mono truncate text-muted-foreground relative">
                            {bookPath || <span className="text-muted-foreground/50 italic">No folder selected</span>}
                        </div>
                        <Button onClick={handleSelectBookFolder} disabled={isSelectingBook} variant="outline" className="w-32 flex-shrink-0">
                            <FolderOpen className="w-4 h-4 mr-2" />
                            Browse
                        </Button>
                    </div>
                </div>

                {/* Manga Directory */}
                <div className="p-5 border border-border rounded-xl bg-card space-y-4 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                            <MapPin className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="font-semibold">Manga Directory</h3>
                            <p className="text-xs text-muted-foreground">Default import path for CBZ, Archives, Images.</p>
                        </div>
                    </div>

                    <div className="flex gap-2 items-center">
                        <div className="flex-1 bg-muted rounded-lg p-3 border border-border/50 text-sm font-mono truncate text-muted-foreground relative">
                            {mangaPath || <span className="text-muted-foreground/50 italic">No folder selected</span>}
                        </div>
                        <Button onClick={handleSelectMangaFolder} disabled={isSelectingManga} variant="outline" className="w-32 flex-shrink-0">
                            <FolderOpen className="w-4 h-4 mr-2" />
                            Browse
                        </Button>
                    </div>
                </div>

                {/* Auto Scan Toggle */}
                <button
                    onClick={() => setDraftValue('autoScanEnabled', !autoScan)}
                    className={cn(
                        "w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 text-left mt-8",
                        autoScan ? "border-primary bg-primary/5" : "border-border bg-card"
                    )}
                >
                    <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                        autoScan ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                        <Search className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <div className="font-semibold">Auto-Scan on Startup</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Detect new files automatically when launching Shiori</div>
                    </div>

                    <div className={cn(
                        "w-10 h-6 rounded-full transition-colors relative",
                        autoScan ? "bg-primary" : "bg-muted"
                    )}>
                        <div className={cn(
                            "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                            autoScan ? "left-5" : "left-1"
                        )} />
                    </div>
                </button>

            </div>
        </div>
    );
}
