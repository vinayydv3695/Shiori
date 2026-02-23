import { useOnboardingStore } from "../../../store/onboardingStore";
import { Cpu, HardDrive, Zap } from "lucide-react";
import { cn } from "../../../lib/utils";

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
            features: ["File-based temp store", "Disabled image cache", "Limited async workers"]
        },
    ];

    return (
        <div className="space-y-8 py-4 w-full px-2">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Performance Profile</h2>
                <p className="text-muted-foreground max-w-lg mx-auto">
                    We can tune the internal SQLite engine and image caching based on your hardware and library size.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {options.map((opt) => (
                    <button
                        key={opt.id}
                        onClick={() => setDraftValue('performanceMode', opt.id)}
                        className={cn(
                            "p-6 text-left rounded-xl transition-all duration-200 border-2 relative select-none",
                            perfMode === opt.id
                                ? "border-primary bg-primary/5 shadow-md shadow-primary/10 ring-2 ring-primary/20 scale-[1.02] z-10"
                                : "border-border bg-card hover:border-primary/40 hover:bg-muted"
                        )}
                    >
                        <div className={cn(
                            "w-12 h-12 rounded-lg mb-4 flex items-center justify-center",
                            perfMode === opt.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}>
                            <opt.icon className="w-6 h-6" />
                        </div>

                        <h3 className="font-bold text-lg mb-1">{opt.name}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed h-12 mb-4">
                            {opt.desc}
                        </p>

                        <ul className="space-y-2 mt-auto border-t border-border pt-4">
                            {opt.features.map((feat, i) => (
                                <li key={i} className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                                    {feat}
                                </li>
                            ))}
                        </ul>
                    </button>
                ))}
            </div>
        </div>
    );
}
