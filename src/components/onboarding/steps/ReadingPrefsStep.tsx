import { useOnboardingStore } from "../../../store/onboardingStore";
import { DEFAULT_BOOK_PREFERENCES, type ScrollMode, type Justification } from "../../../types/preferences";
import { Type, AlignLeft, Search } from "lucide-react";
import { motion } from "framer-motion";

export function ReadingPrefsStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    // Initialize nested config if missing
    const bookPrefs = draftConfig.book || DEFAULT_BOOK_PREFERENCES;

    const updateBookPref = (key: keyof typeof DEFAULT_BOOK_PREFERENCES, value: string | number | boolean | ScrollMode | Justification) => {
        setDraftValue('book', { ...bookPrefs, [key]: value });
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 15 },
        show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
    };

    return (
        <div className="w-full space-y-10 py-6 px-4 max-w-2xl mx-auto">
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4 mb-8"
            >
                <div className="mx-auto w-16 h-16 bg-primary/10 text-primary flex items-center justify-center rounded-2xl mb-6 shadow-inner ring-1 ring-primary/20">
                    <Type className="w-8 h-8" />
                </div>
                <h2 className="text-4xl font-extrabold tracking-tight">Book Typography</h2>
                <p className="text-lg text-muted-foreground font-medium max-w-md mx-auto">
                    Set up your ideal reading environment.
                </p>
            </motion.div>

            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="space-y-8 bg-card/60 backdrop-blur-sm border border-border/50 p-8 rounded-3xl shadow-xl shadow-black/5"
            >
                {/* Font Size */}
                <motion.div variants={itemVariants} className="space-y-6">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <Search className="w-5 h-5 text-primary" />
                            <label className="font-bold text-lg">Base Font Size</label>
                        </div>
                        <span className="font-mono bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-bold shadow-md shadow-primary/20">
                            {bookPrefs.fontSize}px
                        </span>
                    </div>
                    <div className="flex items-center gap-6 bg-background/50 p-4 rounded-2xl border border-border/50 shadow-inner">
                        <span className="text-sm text-muted-foreground font-bold w-8 text-right">12px</span>
                        <input
                            type="range"
                            min="12"
                            max="32"
                            step="1"
                            value={bookPrefs.fontSize}
                            onChange={(e) => updateBookPref('fontSize', Number(e.target.value))}
                            className="flex-1 accent-primary cursor-pointer h-2 bg-muted rounded-full appearance-none"
                        />
                        <span className="text-sm text-muted-foreground font-bold w-10 text-left">32px</span>
                    </div>
                </motion.div>

                {/* Line Height */}
                <motion.div variants={itemVariants} className="space-y-6 pt-6 border-t border-border/50">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <AlignLeft className="w-5 h-5 text-primary" />
                            <label className="font-bold text-lg">Line Spacing</label>
                        </div>
                        <span className="font-mono bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-bold shadow-md shadow-primary/20">
                            {bookPrefs.lineHeight.toFixed(1)}
                        </span>
                    </div>
                    <div className="flex items-center gap-6 bg-background/50 p-4 rounded-2xl border border-border/50 shadow-inner">
                        <span className="text-sm text-muted-foreground font-bold w-12 text-right">Tight</span>
                        <input
                            type="range"
                            min="1.2"
                            max="2.4"
                            step="0.1"
                            value={bookPrefs.lineHeight}
                            onChange={(e) => updateBookPref('lineHeight', Number(e.target.value))}
                            className="flex-1 accent-primary cursor-pointer h-2 bg-muted rounded-full appearance-none"
                        />
                        <span className="text-sm text-muted-foreground font-bold w-12 text-left">Loose</span>
                    </div>
                </motion.div>

                {/* Live Preview Box */}
                <motion.div variants={itemVariants} className="mt-8 pt-8 border-t border-border/50">
                    <div
                        className="p-8 rounded-2xl bg-background border-2 border-primary/20 shadow-inner relative"
                        style={{
                            fontFamily: bookPrefs.fontFamily,
                            fontSize: `${bookPrefs.fontSize}px`,
                            lineHeight: bookPrefs.lineHeight,
                        }}
                    >
                        <div className="absolute -top-3 left-4 bg-primary text-primary-foreground text-[10px] font-sans uppercase tracking-widest font-bold px-3 py-1 rounded-full shadow-md">Preview</div>
                        <p className="mt-2 text-foreground/90 selection:bg-primary/20">
                            The quick brown fox jumps over the lazy dog.
                            Reading should be an effortless experience. Every word flows smoothly into the next, allowing your mind to get lost in the narrative rather than fighting the typography.
                        </p>
                    </div>
                </motion.div>

            </motion.div>
        </div>
    );
}
