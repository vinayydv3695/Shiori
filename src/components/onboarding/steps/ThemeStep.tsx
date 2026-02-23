import { useEffect } from "react";
import { useOnboardingStore } from "../../../store/onboardingStore";
import { Moon, Sun } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { Theme } from "../../../types/preferences";

export function ThemeStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    const currentTheme = (draftConfig.theme as Theme) || "white";

    // Live preview effect
    useEffect(() => {
        document.documentElement.setAttribute("data-theme", currentTheme);
    }, [currentTheme]);

    const themes = [
        { id: "white" as Theme, name: "Light Mode", icon: Sun, desc: "Crisp and clear" },
        { id: "black" as Theme, name: "Dark Mode", icon: Moon, desc: "Easy on the eyes" },
    ];

    return (
        <div className="space-y-8 py-4 w-full max-w-lg mx-auto">
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Choose Your Theme</h2>
                <p className="text-muted-foreground">
                    What vibe are we going for? You can change this later at any time.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {themes.map((theme) => (
                    <button
                        key={theme.id}
                        onClick={() => setDraftValue('theme', theme.id)}
                        className={cn(
                            "p-8 rounded-xl border-2 transition-all duration-300 space-y-4 hover:border-primary/50 relative overflow-hidden",
                            currentTheme === theme.id
                                ? "border-primary bg-primary/10 ring-4 ring-primary/20 scale-[1.02]"
                                : "border-border bg-card"
                        )}
                    >
                        <div className="flex justify-center relative z-10">
                            <theme.icon className={cn(
                                "w-12 h-12 transition-colors",
                                currentTheme === theme.id ? "text-primary" : "text-muted-foreground"
                            )} />
                        </div>
                        <div className="space-y-1 relative z-10">
                            <div className="font-bold text-lg">{theme.name}</div>
                            <div className="text-sm text-muted-foreground">{theme.desc}</div>
                        </div>

                        {/* Background flourish */}
                        {currentTheme === theme.id && (
                            <div className="absolute -bottom-8 -right-8 opacity-10">
                                <theme.icon className="w-32 h-32" />
                            </div>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
