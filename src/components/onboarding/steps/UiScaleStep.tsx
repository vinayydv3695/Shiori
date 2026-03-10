import { useEffect } from "react";
import { useOnboardingStore } from "../../../store/onboardingStore";
import { MonitorSmartphone, SlidersHorizontal, Maximize } from "lucide-react";
import { cn } from "../../../lib/utils";
import { motion } from "framer-motion";

export function UiScaleStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    const uiScale = draftConfig.uiScale ?? 1.0;
    const uiDensity = draftConfig.uiDensity ?? "comfortable";

    // Live preview effect
    useEffect(() => {
        document.documentElement.style.setProperty('--ui-scale', String(uiScale));
    }, [uiScale]);

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
        <div className="w-full max-w-2xl mx-auto space-y-10 py-6">
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
            >
                <div className="mx-auto w-16 h-16 bg-primary/10 text-primary flex items-center justify-center rounded-2xl mb-6 shadow-inner ring-1 ring-primary/20">
                    <MonitorSmartphone className="w-8 h-8" />
                </div>
                <h2 className="text-4xl font-extrabold tracking-tight">Interface Sizing</h2>
                <p className="text-lg text-muted-foreground font-medium max-w-md mx-auto">
                    Adjust the global text and spacing density to fit your monitor.
                </p>
            </motion.div>

            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="space-y-8 bg-card/60 backdrop-blur-sm border border-border/50 rounded-3xl p-8 shadow-xl shadow-black/5"
            >
                <motion.div variants={itemVariants} className="space-y-6">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <Maximize className="w-5 h-5 text-primary" />
                            <label className="font-bold text-lg">Global Scale</label>
                        </div>
                        <span className="font-mono bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-bold shadow-md shadow-primary/20">
                            {Math.round(uiScale * 100)}%
                        </span>
                    </div>
                    <div className="flex items-center gap-6 bg-background/50 p-4 rounded-2xl border border-border/50 shadow-inner">
                        <span className="text-sm text-muted-foreground font-bold w-8 text-right">75%</span>
                        <input
                            type="range"
                            min="0.75"
                            max="1.5"
                            step="0.05"
                            value={uiScale}
                            onChange={(e) => setDraftValue('uiScale', Number(e.target.value))}
                            className="flex-1 accent-primary cursor-pointer h-2 bg-muted rounded-full appearance-none"
                        />
                        <span className="text-sm text-muted-foreground font-bold w-10 text-left">150%</span>
                    </div>
                </motion.div>

                <motion.div variants={itemVariants} className="pt-8 border-t border-border/50 space-y-6">
                    <div className="flex items-center gap-3">
                        <SlidersHorizontal className="w-5 h-5 text-primary" />
                        <label className="font-bold text-lg">Layout Density</label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                            { value: "compact" as const, label: "Compact", desc: "Less padding, more data on screen" },
                            { value: "comfortable" as const, label: "Comfortable", desc: "More spacing, easier boundaries" }
                        ].map((option) => (
                            <button
                                key={option.value}
                                onClick={() => setDraftValue('uiDensity', option.value)}
                                className={cn(
                                    "p-6 rounded-2xl border-2 transition-all text-left relative overflow-hidden group",
                                    uiDensity === option.value
                                        ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                                        : "border-border/60 bg-background hover:border-primary/40 hover:-translate-y-0.5"
                                )}
                            >
                                {uiDensity === option.value && (
                                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-primary/10 rounded-full blur-xl" />
                                )}
                                <div className="font-bold text-lg relative z-10">{option.label}</div>
                                <div className="text-sm text-muted-foreground mt-1.5 font-medium relative z-10">{option.desc}</div>
                            </button>
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
}
