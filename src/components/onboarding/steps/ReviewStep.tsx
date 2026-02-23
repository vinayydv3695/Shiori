import { useOnboardingStore } from "../../../store/onboardingStore";
import { Check, Settings } from "lucide-react";

export function ReviewStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);

    return (
        <div className="w-full space-y-8 py-4 px-2 max-w-xl mx-auto animate-in fade-in duration-500">
            <div className="text-center space-y-2 mb-8">
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                        <Settings className="w-10 h-10 text-primary animate-[spin_4s_linear_infinite]" />
                    </div>
                </div>
                <h2 className="text-3xl font-bold tracking-tight">You're All Set!</h2>
                <p className="text-muted-foreground text-sm">
                    Shiori has been tuned to your system and library preferences.
                </p>
            </div>

            <div className="bg-muted border border-border rounded-xl p-8 shadow-inner shadow-black/5 text-sm space-y-4">

                <div className="flex justify-between items-center border-b border-border/50 pb-3">
                    <span className="text-muted-foreground font-medium">Content Profile</span>
                    <span className="font-semibold capitalize text-foreground">{draftConfig.preferredContentType || 'Both Books & Manga'}</span>
                </div>

                <div className="flex justify-between items-center border-b border-border/50 pb-3">
                    <span className="text-muted-foreground font-medium">Performance Engine</span>
                    <span className="font-semibold capitalize text-foreground">
                        {draftConfig.performanceMode?.replace('_', ' ') || 'Standard Mode'}
                    </span>
                </div>

                <div className="flex justify-between items-center border-b border-border/50 pb-3">
                    <span className="text-muted-foreground font-medium">Global Theme</span>
                    <span className="font-semibold capitalize text-foreground">{draftConfig.theme || 'Default'}</span>
                </div>

                <div className="flex justify-between items-center border-b border-border/50 pb-3">
                    <span className="text-muted-foreground font-medium">Automatic Metadata Enrichment</span>
                    <span className="font-semibold capitalize text-foreground">{draftConfig.metadataMode || 'Online'} Flow</span>
                </div>

                <div className="flex justify-between items-center pt-1">
                    <span className="text-muted-foreground font-medium">File Auto-Scan</span>
                    <span className="font-semibold capitalize text-foreground">
                        {draftConfig.autoScanEnabled !== false ? "Enabled" : "Disabled"}
                    </span>
                </div>

            </div>

            <div className="flex items-center justify-center gap-3 text-sm font-medium text-green-600 bg-green-500/10 p-4 rounded-xl">
                <Check className="w-5 h-5 flex-shrink-0" />
                Settings will be securely committed to the SQLite database.
            </div>

        </div>
    );
}
