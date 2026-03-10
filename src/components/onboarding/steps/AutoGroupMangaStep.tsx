import { Wand2, MousePointerClick, ChevronDown, Plus } from "lucide-react";
import { motion } from "framer-motion";

export function AutoGroupMangaStep() {
    return (
        <div className="space-y-10 py-6 max-w-2xl mx-auto">
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
            >
                <div className="mx-auto w-16 h-16 bg-primary/10 text-primary flex items-center justify-center rounded-2xl mb-6 shadow-inner ring-1 ring-primary/20">
                    <Wand2 className="w-8 h-8" />
                </div>
                <h2 className="text-4xl font-extrabold tracking-tight">Magically Organize Your Collection</h2>
                <p className="text-lg text-muted-foreground font-medium max-w-md mx-auto">
                    Let Shiori do the heavy lifting. Automatically detect and group loose manga volumes into their correct series with a single click.
                </p>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="bg-card/60 backdrop-blur-sm rounded-3xl p-10 border border-border/50 shadow-xl shadow-black/5 flex flex-col items-center relative overflow-hidden"
            >
                <div className="absolute top-0 left-0 w-32 h-32 bg-primary/10 rounded-br-[120px] -z-10 blur-md" />

                <div className="relative w-full max-w-[280px] mt-2 mb-16 z-10">
                    <div className="flex items-center justify-end w-full mb-3">
                        <div className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg shadow-primary/20 text-sm font-bold">
                            <Plus className="w-4 h-4" />
                            Import
                            <ChevronDown className="w-4 h-4 ml-1 opacity-70" />
                        </div>
                    </div>
                    
                    <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 20 }}
                        className="absolute right-0 top-full mt-1 w-64 bg-card border-2 border-border/80 rounded-xl shadow-2xl overflow-hidden z-10"
                    >
                        <div className="p-2 space-y-1">
                            <div className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground rounded-lg opacity-60">
                                <div className="w-4 h-4 bg-muted-foreground/30 rounded-sm" />
                                <span className="font-medium">Add Files</span>
                            </div>
                            <div className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground rounded-lg opacity-60">
                                <div className="w-4 h-4 bg-muted-foreground/30 rounded-sm" />
                                <span className="font-medium">Add Folder</span>
                            </div>
                            <div className="h-px w-full bg-border/80 my-2" />
                            <div className="flex items-center gap-3 px-3 py-3 text-sm text-primary bg-primary/10 rounded-lg border border-primary/20 relative font-bold shadow-inner">
                                <Wand2 className="w-4 h-4" />
                                <span>Auto-group Series</span>
                                <motion.div 
                                    animate={{ y: [0, -5, 0] }}
                                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                                    className="absolute -right-3 -bottom-4 text-foreground drop-shadow-xl z-20"
                                >
                                    <MousePointerClick className="w-8 h-8" />
                                </motion.div>
                            </div>
                        </div>
                    </motion.div>
                </div>

                <div className="text-center z-10 relative bg-background/90 p-5 rounded-2xl backdrop-blur-md border border-border/50 w-full shadow-sm mt-4">
                    <p className="text-base font-bold text-foreground">
                        Click "Auto-group" from Import dropdown in Manga section
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
