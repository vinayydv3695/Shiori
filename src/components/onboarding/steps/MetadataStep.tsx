import { useOnboardingStore } from "../../../store/onboardingStore";
import { CloudOff, Globe, HelpCircle } from "lucide-react";
import { cn } from "../../../lib/utils";

export function MetadataStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    const metadataMode = draftConfig.metadataMode || "online";

    const options = [
        {
            id: "online",
            name: "Always Online",
            icon: Globe,
            desc: "Automatically fetch high-res covers, tags, and summaries from AniList and OpenLibrary.",
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

    return (
        <div className="space-y-8 py-4 w-full max-w-2xl mx-auto">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Metadata Enrichment</h2>
                <p className="text-muted-foreground">
                    How should Shiori handle missing book covers and descriptions?
                </p>
            </div>

            <div className="space-y-4 pt-4">
                {options.map((opt) => (
                    <button
                        key={opt.id}
                        onClick={() => setDraftValue('metadataMode', opt.id)}
                        className={cn(
                            "w-full p-4 rounded-xl border-2 transition-all flex items-center gap-6 text-left hover:bg-muted",
                            metadataMode === opt.id
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                : "border-border bg-card"
                        )}
                    >
                        <div className={cn(
                            "w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                            metadataMode === opt.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}>
                            <opt.icon className="w-6 h-6" />
                        </div>

                        <div className="flex-1">
                            <div className="font-bold text-lg">{opt.name}</div>
                            <div className="text-sm text-muted-foreground">{opt.desc}</div>
                        </div>

                        <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                            metadataMode === opt.id ? "border-primary" : "border-muted-foreground/30"
                        )}>
                            {metadataMode === opt.id && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
