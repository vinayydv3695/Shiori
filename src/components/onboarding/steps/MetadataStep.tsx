import { useOnboardingStore } from "../../../store/onboardingStore";
import { CloudOff, Globe, HelpCircle, DatabaseZap } from "lucide-react";
import { cn } from "../../../lib/utils";
import { motion } from "framer-motion";

export function MetadataStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    const metadataMode = draftConfig.metadataMode || "online";

    const options = [
        {
            id: "online",
            name: "Always Online",
            icon: Globe,
            desc: "Automatically fetch high-res covers, tags, and summaries from external sources.",
        },
        {
            id: "ask",
            name: "Ask First",
            icon: HelpCircle,
            desc: "Prompt for confirmation before reaching out to external APIs. Conserves bandwidth.",
        },
        {
            id: "offline",
            name: "Strict Offline",
            icon: CloudOff,
            desc: "Never connect to the internet. Uses only embedded file metadata.",
        },
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
        <div className="space-y-10 py-6 w-full max-w-2xl mx-auto">
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
            >
                <div className="mx-auto w-16 h-16 bg-primary/10 text-primary flex items-center justify-center rounded-2xl mb-6 shadow-inner ring-1 ring-primary/20">
                    <DatabaseZap className="w-8 h-8" />
                </div>
                <h2 className="text-4xl font-extrabold tracking-tight">Metadata Enrichment</h2>
                <p className="text-lg text-muted-foreground font-medium max-w-md mx-auto">
                    How should Shiori handle missing book covers and descriptions?
                </p>
            </motion.div>

            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="space-y-4 pt-4"
            >
                {options.map((opt) => (
                    <motion.button
                        variants={itemVariants}
                        key={opt.id}
                        onClick={() => setDraftValue('metadataMode', opt.id)}
                        className={cn(
                            "w-full p-6 rounded-3xl border-2 transition-all duration-300 flex items-center gap-6 text-left group relative overflow-hidden",
                            metadataMode === opt.id
                                ? "border-primary bg-primary/5 shadow-lg shadow-primary/10 scale-[1.02]"
                                : "border-border/60 bg-card/60 backdrop-blur-sm hover:border-primary/40 hover:-translate-y-0.5"
                        )}
                    >
                        {metadataMode === opt.id && (
                            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-bl-[100px] -z-10" />
                        )}

                        <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300 shadow-inner",
                            metadataMode === opt.id ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-105" : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
                        )}>
                            <opt.icon className="w-6 h-6" />
                        </div>

                        <div className="flex-1 pr-4 relative z-10">
                            <div className="font-bold text-xl mb-1">{opt.name}</div>
                            <div className="text-sm text-muted-foreground font-medium leading-relaxed">{opt.desc}</div>
                        </div>

                        <div className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 relative z-10",
                            metadataMode === opt.id ? "border-primary bg-background" : "border-muted-foreground/30 bg-background"
                        )}>
                            <motion.div 
                                initial={false}
                                animate={{ scale: metadataMode === opt.id ? 1 : 0 }}
                                className="w-3 h-3 rounded-full bg-primary" 
                            />
                        </div>
                    </motion.button>
                ))}
            </motion.div>
        </div>
    );
}
