import { motion } from "framer-motion";
import { BookOpen, ScrollText, PlaySquare, Settings2 } from "lucide-react";

export function ReaderModesStep() {
    return (
        <div className="space-y-12 animate-in fade-in zoom-in-95 duration-700 max-w-4xl mx-auto py-8">
            <div className="text-center space-y-4 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-rose-500/10 blur-[120px] rounded-full pointer-events-none -z-10" />
                <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 100, delay: 0.1 }}
                    className="w-24 h-24 bg-rose-500/10 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner shadow-rose-500/20 mb-8 border border-rose-500/20"
                >
                    <BookOpen className="w-12 h-12 text-rose-500" />
                </motion.div>
                
                <h2 className="text-5xl font-black tracking-tight">Three Ways to Read</h2>
                <p className="text-muted-foreground text-xl max-w-2xl mx-auto leading-relaxed mt-4">
                    Shiori adapts to your content and reading style with specialized reader engines.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                {[
                    {
                        icon: BookOpen,
                        title: "EPUB Engine",
                        color: "rose",
                        delay: 0.3,
                        features: ["Custom Fonts & Margins", "Themes & Highlights", "TTS Integration"]
                    },
                    {
                        icon: ScrollText,
                        title: "PDF Viewer",
                        color: "blue",
                        delay: 0.4,
                        features: ["Continuous Scroll", "Page Fit Modes", "High Fidelity Rendering"]
                    },
                    {
                        icon: PlaySquare,
                        title: "Manga Reader",
                        color: "emerald",
                        delay: 0.5,
                        features: ["RTL Support", "Two-Page Spread", "Preloading & Caching"]
                    }
                ].map((mode, i) => {
                    const colorMap = {
                        rose: "text-rose-500 bg-rose-500/10 border-rose-500/20 hover:border-rose-500/50",
                        blue: "text-blue-500 bg-blue-500/10 border-blue-500/20 hover:border-blue-500/50",
                        emerald: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/50"
                    };

                    const Icon = mode.icon;

                    return (
                        <motion.div 
                            key={i}
                            initial={{ y: 30, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: mode.delay }}
                            className={`bg-card/40 backdrop-blur-md border rounded-3xl p-8 flex flex-col items-center text-center space-y-6 transition-all duration-500 group relative overflow-hidden ${colorMap[mode.color as keyof typeof colorMap]}`}
                        >
                            <div className={`absolute top-0 right-0 w-32 h-32 opacity-20 bg-gradient-to-bl from-${mode.color}-500 to-transparent rounded-bl-full -z-10 group-hover:scale-150 transition-transform duration-700`} />
                            
                            <div className="p-4 bg-background/50 rounded-2xl shadow-sm group-hover:scale-110 transition-transform duration-500">
                                <Icon className="w-8 h-8" />
                            </div>
                            
                            <div className="space-y-2">
                                <h3 className="text-2xl font-bold">{mode.title}</h3>
                            </div>

                            <ul className="space-y-3 w-full text-left text-sm text-muted-foreground pt-4 border-t border-border/50">
                                {mode.features.map((f, j) => (
                                    <li key={j} className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
                                        {f}
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    )
                })}
            </div>

            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="mt-12 text-center flex items-center justify-center gap-2 text-muted-foreground bg-muted/30 p-4 rounded-2xl max-w-sm mx-auto border border-border/50"
            >
                <Settings2 className="w-5 h-5" />
                <span className="text-sm font-medium">All settings available directly while reading</span>
            </motion.div>
        </div>
    );
}
