import { useOnboardingStore } from "../../../store/onboardingStore";
import { DEFAULT_MANGA_PREFERENCES, type MangaMode, type Direction, type ProgressBarPosition } from "../../../types/preferences";
import { cn } from "../../../lib/utils";
import { Layout, Type, Book, Rows3, ScrollText, Layers, ImageIcon } from "lucide-react";
import { motion } from "framer-motion";

export function MangaPrefsStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    const mangaPrefs = draftConfig.manga || DEFAULT_MANGA_PREFERENCES;

    const updateMangaPref = (key: keyof typeof DEFAULT_MANGA_PREFERENCES, value: MangaMode | Direction | number | boolean | ProgressBarPosition | string) => {
        setDraftValue('manga', { ...mangaPrefs, [key]: value });
    };

    const modes = [
        { id: "single" as const, name: "Single Page", icon: Layout, desc: "One page at a time" },
        { id: "double" as const, name: "Spread", icon: Book, desc: "Two pages side-by-side" },
        { id: "long-strip" as const, name: "Long Strip", icon: Type, desc: "Continuous vertical scroll" },
        { id: "webtoon" as const, name: "Webtoon", icon: Rows3, desc: "Seamless zero-gap scroll" },
        { id: "manhwa" as const, name: "Manhwa", icon: ScrollText, desc: "Korean webtoon style" },
        { id: "comic" as const, name: "Comic", icon: Layers, desc: "Western comic layout" },
    ];

    const directions = [
        { id: "ltr" as const, name: "Left to Right", desc: "Common for western comics" },
        { id: "rtl" as const, name: "Right to Left", desc: "Standard for Japanese Manga" },
    ];

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
        <div className="w-full space-y-10 py-6 px-4 max-w-3xl mx-auto">
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
            >
                <div className="mx-auto w-16 h-16 bg-primary/10 text-primary flex items-center justify-center rounded-2xl mb-6 shadow-inner ring-1 ring-primary/20">
                    <ImageIcon className="w-8 h-8" />
                </div>
                <h2 className="text-4xl font-extrabold tracking-tight">Comic & Manga Render</h2>
                <p className="text-lg text-muted-foreground font-medium max-w-xl mx-auto">
                    Set the default image rendering engine properties for CBZ/CBR files.
                </p>
            </motion.div>

            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="space-y-8"
            >
                {/* Reading Mode */}
                <motion.div variants={itemVariants} className="space-y-5 bg-card/60 backdrop-blur-sm border border-border/50 p-8 rounded-3xl shadow-xl shadow-black/5">
                    <div className="flex items-center gap-3 border-b border-border/50 pb-4">
                        <Layout className="w-5 h-5 text-primary" />
                        <h3 className="font-bold text-xl">Reading Mode</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                        {modes.map((m) => (
                            <button
                                key={m.id}
                                onClick={() => updateMangaPref('mode', m.id)}
                                className={cn(
                                    "flex flex-col items-start gap-3 p-5 rounded-2xl border-2 transition-all w-full text-left group",
                                    mangaPrefs.mode === m.id
                                        ? "border-primary bg-primary/5 shadow-md shadow-primary/10 scale-[1.02]"
                                        : "border-border/60 bg-background hover:border-primary/40 hover:-translate-y-0.5"
                                )}
                            >
                                <div className={cn(
                                    "p-2.5 rounded-xl transition-colors",
                                    mangaPrefs.mode === m.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
                                )}>
                                    <m.icon className="w-5 h-5 flex-shrink-0" />
                                </div>
                                <div>
                                    <div className="font-bold text-base">{m.name}</div>
                                    <div className="text-sm text-muted-foreground mt-1 font-medium">{m.desc}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </motion.div>

                {/* Direction */}
                <motion.div variants={itemVariants} className="space-y-5 bg-card/60 backdrop-blur-sm border border-border/50 p-8 rounded-3xl shadow-xl shadow-black/5">
                    <div className="flex items-center gap-3 border-b border-border/50 pb-4">
                        <Rows3 className="w-5 h-5 text-primary rotate-90" />
                        <h3 className="font-bold text-xl">Paging Direction</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        {directions.map((d) => (
                            <button
                                key={d.id}
                                onClick={() => updateMangaPref('direction', d.id)}
                                className={cn(
                                    "p-6 rounded-2xl border-2 transition-all text-left relative overflow-hidden group",
                                    mangaPrefs.direction === d.id
                                        ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                                        : "border-border/60 bg-background hover:border-primary/40 hover:-translate-y-0.5"
                                )}
                            >
                                {mangaPrefs.direction === d.id && (
                                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-primary/10 rounded-full blur-xl" />
                                )}
                                <div className="font-bold text-lg relative z-10">{d.name}</div>
                                <div className="text-sm text-muted-foreground mt-1.5 font-medium relative z-10">{d.desc}</div>
                            </button>
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
}
