import { useState } from "react";
import { useOnboardingStore } from "../../../store/onboardingStore";
import { api } from "../../../lib/tauri";
import { logger } from "@/lib/logger";
import { FolderOpen, MapPin, Search, Database } from "lucide-react";
import { Button } from "../../ui/button";
import { cn } from "../../../lib/utils";
import { motion } from "framer-motion";

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
             logger.error(e);
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
             logger.error(e);
        } finally {
            setIsSelectingManga(false);
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.15 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
    };

    return (
        <div className="space-y-8 py-6 w-full max-w-2xl mx-auto">
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4 mb-8"
            >
                <div className="mx-auto w-16 h-16 bg-primary/10 text-primary flex items-center justify-center rounded-2xl mb-6 shadow-inner ring-1 ring-primary/20">
                    <Database className="w-8 h-8" />
                </div>
                <h2 className="text-4xl font-extrabold tracking-tight">Library Directories</h2>
                <p className="text-lg text-muted-foreground font-medium max-w-md mx-auto">
                    Map your local folders so Shiori knows where to index your files.
                </p>
            </motion.div>

            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="space-y-6"
            >
                {/* Books Directory */}
                <motion.div variants={itemVariants} className="p-6 border border-border/60 rounded-3xl bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5 hover:border-primary/30 transition-colors">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 shadow-inner">
                            <MapPin className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg">Books Directory</h3>
                            <p className="text-sm text-muted-foreground font-medium">Default import path for EPUBs, PDFs, etc.</p>
                        </div>
                    </div>

                    <div className="flex gap-3 items-center">
                        <div className="flex-1 bg-background rounded-xl p-3 border border-border/50 text-sm font-mono truncate text-muted-foreground relative shadow-inner">
                            {bookPath || <span className="text-muted-foreground/50 italic">No folder selected</span>}
                        </div>
                        <Button onClick={handleSelectBookFolder} disabled={isSelectingBook} variant="outline" className="w-32 flex-shrink-0 rounded-xl hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all">
                            <FolderOpen className="w-4 h-4 mr-2" />
                            Browse
                        </Button>
                    </div>
                </motion.div>

                {/* Manga Directory */}
                <motion.div variants={itemVariants} className="p-6 border border-border/60 rounded-3xl bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5 hover:border-primary/30 transition-colors">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500 shadow-inner">
                            <MapPin className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg">Manga Directory</h3>
                            <p className="text-sm text-muted-foreground font-medium">Default import path for CBZ, Archives, Images.</p>
                        </div>
                    </div>

                    <div className="flex gap-3 items-center">
                        <div className="flex-1 bg-background rounded-xl p-3 border border-border/50 text-sm font-mono truncate text-muted-foreground relative shadow-inner">
                            {mangaPath || <span className="text-muted-foreground/50 italic">No folder selected</span>}
                        </div>
                        <Button onClick={handleSelectMangaFolder} disabled={isSelectingManga} variant="outline" className="w-32 flex-shrink-0 rounded-xl hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-all">
                            <FolderOpen className="w-4 h-4 mr-2" />
                            Browse
                        </Button>
                    </div>
                </motion.div>

                {/* Auto Scan Toggle */}
                <motion.button
                    variants={itemVariants}
                    onClick={() => setDraftValue('autoScanEnabled', !autoScan)}
                    className={cn(
                        "w-full p-6 rounded-3xl border-2 transition-all flex items-center gap-6 text-left mt-8 group",
                        autoScan ? "border-primary bg-primary/5 shadow-lg shadow-primary/5" : "border-border bg-card/50 backdrop-blur-sm hover:border-primary/30"
                    )}
                >
                    <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-inner",
                        autoScan ? "bg-primary text-primary-foreground scale-105 shadow-primary/30" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                    )}>
                        <Search className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <div className="font-bold text-lg">Auto-Scan on Startup</div>
                        <div className="text-sm text-muted-foreground mt-1 font-medium">Detect new files automatically when launching Shiori</div>
                    </div>

                    <div className={cn(
                        "w-14 h-8 rounded-full transition-all duration-300 relative shadow-inner",
                        autoScan ? "bg-primary" : "bg-muted"
                    )}>
                        <div className={cn(
                            "absolute top-1 w-6 h-6 rounded-full bg-background shadow-md transition-all duration-300",
                            autoScan ? "left-7" : "left-1"
                        )} />
                    </div>
                </motion.button>
            </motion.div>
        </div>
    );
}
