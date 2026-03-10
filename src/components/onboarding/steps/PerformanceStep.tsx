import { useOnboardingStore } from "../../../store/onboardingStore";
import { Cpu, HardDrive, Zap, Rocket } from "lucide-react";
import { cn } from "../../../lib/utils";
import { motion } from "framer-motion";

export function PerformanceStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    const perfMode = draftConfig.performanceMode || "standard";

    const options = [
        {
            id: "standard",
            name: "Standard Mode",
            icon: Zap,
            desc: "Balanced resource usage. Best for most users.",
            features: ["Memory-based caching", "Standard pagination", "Instant search"]
        },
        {
            id: "large_library",
            name: "Large Library Mode",
            icon: HardDrive,
            desc: "Optimized for 5000+ books. Uses more disk space.",
            features: ["SQLite WAL Mode", "Aggressive Virtualization", "Increased Connections"]
        },
        {
            id: "low_memory",
            name: "Low Memory Mode",
            icon: Cpu,
            desc: "For older PCs or laptops. Conserves RAM.",
            features: ["File-based temp store", "Disabled image cache", "Limited workers"]
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
        <div className="space-y-10 py-6 w-full px-4 max-w-5xl mx-auto">
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
            >
                <div className="mx-auto w-16 h-16 bg-primary/10 text-primary flex items-center justify-center rounded-2xl mb-6 shadow-inner ring-1 ring-primary/20">
                    <Rocket className="w-8 h-8" />
                </div>
                <h2 className="text-4xl font-extrabold tracking-tight">Performance Profile</h2>
                <p className="text-lg text-muted-foreground font-medium max-w-xl mx-auto">
                    We can tune the internal SQLite engine and image caching based on your hardware and library size.
                </p>
            </motion.div>

            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8"
            >
                {options.map((opt) => (
                    <motion.button
                        variants={itemVariants}
                        key={opt.id}
                        onClick={() => setDraftValue('performanceMode', opt.id)}
                        className={cn(
                            "flex flex-col p-8 text-left rounded-3xl transition-all duration-300 border-2 relative overflow-hidden group h-full",
                            perfMode === opt.id
                                ? "border-primary bg-primary/5 shadow-xl shadow-primary/10 ring-4 ring-primary/20 scale-[1.02] z-10"
                                : "border-border/60 bg-card hover:border-primary/40 hover:-translate-y-1 hover:shadow-lg"
                        )}
                    >
                        {perfMode === opt.id && (
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-bl-[120px] -z-10" />
                        )}

                        <div className={cn(
                            "w-16 h-16 rounded-2xl mb-6 flex items-center justify-center transition-all duration-300",
                            perfMode === opt.id ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                        )}>
                            <opt.icon className="w-8 h-8" />
                        </div>

                        <h3 className="font-bold text-2xl mb-2">{opt.name}</h3>
                        <p className="text-sm text-muted-foreground font-medium leading-relaxed mb-8 flex-grow">
                            {opt.desc}
                        </p>

                        <ul className="space-y-3 w-full border-t border-border/50 pt-6">
                            {opt.features.map((feat, i) => (
                                <li key={i} className="text-sm font-semibold text-foreground/80 flex items-center gap-3">
                                    <div className={cn(
                                        "w-2 h-2 rounded-full",
                                        perfMode === opt.id ? "bg-primary" : "bg-primary/40"
                                    )} />
                                    {feat}
                                </li>
                            ))}
                        </ul>
                        
                        {/* Background flourish */}
                        {perfMode === opt.id && (
                            <motion.div 
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 0.05 }}
                                transition={{ duration: 0.4 }}
                                className="absolute -bottom-8 -right-8 pointer-events-none"
                            >
                                <opt.icon className="w-48 h-48" />
                            </motion.div>
                        )}
                    </motion.button>
                ))}
            </motion.div>
        </div>
    );
}
