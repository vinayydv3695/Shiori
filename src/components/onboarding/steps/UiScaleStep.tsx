import { useEffect } from "react";
import { useOnboardingStore } from "../../../store/onboardingStore";
import { MonitorSmartphone } from "lucide-react";
import { cn } from "../../../lib/utils";

export function UiScaleStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    const uiScale = draftConfig.uiScale ?? 1.0;
    const uiDensity = draftConfig.uiDensity ?? "comfortable";

    // Live preview effect
    useEffect(() => {
        document.documentElement.style.setProperty('--ui-scale', String(uiScale));
    }, [uiScale]);

    return (
        <div className="w-full max-w-xl mx-auto space-y-8">
            <div className="text-center space-y-2 mb-8">
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <MonitorSmartphone className="w-8 h-8 text-primary" />
                    </div>
                </div>
                <h2 className="text-3xl font-bold tracking-tight">Interface Sizing</h2>
                <p className="text-muted-foreground text-sm">
                    Adjust the global text and spacing density to fit your monitor.
                </p>
            </div>

            <div className="space-y-6 bg-card border border-border rounded-xl p-6">
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <label className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Global Scale</label>
                        <span className="font-mono bg-primary/10 text-primary px-2 py-1 rounded text-sm font-semibold">
                            {Math.round(uiScale * 100)}%
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground font-medium w-8 text-right">75%</span>
                        <input
                            type="range"
                            min="0.75"
                            max="1.5"
                            step="0.05"
                            value={uiScale}
                            onChange={(e) => setDraftValue('uiScale', Number(e.target.value))}
                            className="flex-1 accent-primary"
                        />
                        <span className="text-xs text-muted-foreground font-medium w-10 text-left">150%</span>
                    </div>
                </div>

                <div className="pt-6 border-t border-border space-y-4">
                    <label className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Layout Density</label>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { value: "compact" as const, label: "Compact", desc: "Less padding, more data on screen" },
                            { value: "comfortable" as const, label: "Comfortable", desc: "More spacing, easier boundaries" }
                        ].map((option) => (
                            <button
                                key={option.value}
                                onClick={() => setDraftValue('uiDensity', option.value)}
                                className={cn(
                                    "p-4 rounded-lg border-2 transition-all text-left",
                                    uiDensity === option.value
                                        ? "border-primary bg-primary/5"
                                        : "border-border bg-background hover:bg-muted"
                                )}
                            >
                                <div className="font-semibold text-sm">{option.label}</div>
                                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{option.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
