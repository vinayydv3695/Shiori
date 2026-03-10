import { Layers, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function MangaSeriesGroupingStep() {
    return (
        <div className="space-y-10 py-6 max-w-2xl mx-auto">
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
            >
                <div className="mx-auto w-16 h-16 bg-primary/10 text-primary flex items-center justify-center rounded-2xl mb-6 shadow-inner ring-1 ring-primary/20">
                    <Sparkles className="w-8 h-8" />
                </div>
                <h2 className="text-4xl font-extrabold tracking-tight">Manga Series Grouping</h2>
                <p className="text-lg text-muted-foreground font-medium max-w-md mx-auto">
                    Multiple volumes of the same manga are elegantly stacked into a single, clean cover card to keep your shelves tidy.
                </p>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="bg-card/60 backdrop-blur-sm rounded-3xl p-10 border border-border/50 shadow-xl shadow-black/5 flex flex-col items-center justify-center relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-bl-[120px] -z-10 blur-md" />
                
                <div className="relative w-44 h-64 perspective-[1000px] mb-10 mt-6 group">
                    <motion.div 
                        initial={{ rotate: -12, x: 24, y: 16 }}
                        animate={{ rotate: -12, x: 24, y: 16 }}
                        whileHover={{ rotate: 0, x: 0, y: 0, scale: 1.05 }}
                        className="absolute inset-0 bg-background border-2 border-border/60 rounded-xl shadow-md opacity-40 transition-all duration-500 ease-out" 
                    />
                    <motion.div 
                        initial={{ rotate: -6, x: 12, y: 8 }}
                        animate={{ rotate: -6, x: 12, y: 8 }}
                        whileHover={{ rotate: 0, x: 0, y: 0, scale: 1.05 }}
                        className="absolute inset-0 bg-background border-2 border-border/80 rounded-xl shadow-lg opacity-70 transition-all duration-500 ease-out" 
                    />
                    <motion.div 
                        initial={{ rotate: 0, x: 0, y: 0 }}
                        whileHover={{ scale: 1.05 }}
                        className="absolute inset-0 bg-card border-2 border-primary/30 rounded-xl shadow-2xl flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/20 z-10 transition-all duration-500 ease-out"
                    >
                        <div className="w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 group-hover:scale-110 transition-transform duration-500">
                            <Layers className="w-10 h-10" />
                        </div>
                        <div className="absolute -top-3 -right-3 bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-full shadow-lg border-2 border-background">
                            13 Volumes
                        </div>
                    </motion.div>
                </div>

                <div className="text-center z-10 relative bg-background/90 p-5 rounded-2xl backdrop-blur-md border border-border/50 w-full shadow-sm">
                    <p className="text-base font-bold text-foreground">
                        Simply browse your newly decluttered manga library
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
