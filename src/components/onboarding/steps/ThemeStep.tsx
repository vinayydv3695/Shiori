import { useEffect } from "react";
import { useOnboardingStore } from "../../../store/onboardingStore";
import { Moon, Sun, Palette, Flower, Coffee, Snowflake, Ghost, Star } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { Theme } from "../../../types/preferences";
import { motion } from "framer-motion";

export function ThemeStep() {
    const draftConfig = useOnboardingStore(state => state.draftConfig);
    const setDraftValue = useOnboardingStore(state => state.setDraftValue);

    const currentTheme = (draftConfig.theme as Theme) || "light";

    // Live preview effect
    useEffect(() => {
        document.documentElement.setAttribute("data-theme", currentTheme);
    }, [currentTheme]);

    const themes = [
        { id: "light" as Theme, name: "Light", icon: Sun, desc: "Crisp & clear" },
        { id: "dark" as Theme, name: "Dark", icon: Moon, desc: "Easy on eyes" },
        { id: "rose-pine-moon" as Theme, name: "Rosé Pine", icon: Flower, desc: "Soho vibes" },
        { id: "catppuccin-mocha" as Theme, name: "Catppuccin", icon: Coffee, desc: "Warm & cozy" },
        { id: "nord" as Theme, name: "Nord", icon: Snowflake, desc: "Arctic cold" },
        { id: "dracula" as Theme, name: "Dracula", icon: Ghost, desc: "Vampire aesthetics" },
        { id: "tokyo-night" as Theme, name: "Tokyo Night", icon: Star, desc: "Neon city lights" },
    ];

    return (
        <div className="space-y-8 py-4 w-full max-w-4xl mx-auto h-[70vh] flex flex-col">
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-3 shrink-0"
            >
                <div className="mx-auto w-12 h-12 bg-primary/10 text-primary flex items-center justify-center rounded-2xl mb-4 shadow-inner ring-1 ring-primary/20">
                    <Palette className="w-6 h-6" />
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight">Choose Your Theme</h2>
                <p className="text-base text-muted-foreground font-medium max-w-md mx-auto">
                    What vibe are we going for? You can always change this later.
                </p>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto custom-scrollbar p-2 flex-grow"
            >
                {themes.map((theme, i) => (
                    <motion.button
                        key={theme.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 + (i * 0.05) }}
                        onClick={() => setDraftValue('theme', theme.id)}
                        className={cn(
                            "p-5 rounded-3xl border-2 transition-all duration-300 space-y-4 hover:border-primary/50 relative overflow-hidden group flex flex-col items-center justify-center min-h-[160px]",
                            currentTheme === theme.id
                                ? "border-primary bg-primary/5 ring-4 ring-primary/20 shadow-xl shadow-primary/10"
                                : "border-border bg-card hover:-translate-y-1 hover:shadow-lg"
                        )}
                    >
                        {currentTheme === theme.id && (
                            <div className="absolute top-0 right-0 w-20 h-20 bg-primary/10 rounded-bl-[80px] -z-10" />
                        )}

                        <div className="flex justify-center relative z-10">
                            <div className={cn(
                                "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500",
                                currentTheme === theme.id 
                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/40 scale-110" 
                                    : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
                            )}>
                                <theme.icon className={cn(
                                    "w-7 h-7 transition-colors",
                                    currentTheme === theme.id ? "text-primary-foreground" : ""
                                )} />
                            </div>
                        </div>

                        <div className="space-y-1 relative z-10 text-center">
                            <div className="font-bold text-lg">{theme.name}</div>
                            <div className="text-xs text-muted-foreground font-medium">{theme.desc}</div>
                        </div>

                        {/* Background flourish */}
                        {currentTheme === theme.id && (
                            <motion.div 
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 0.05 }}
                                transition={{ duration: 0.4 }}
                                className="absolute -bottom-6 -right-6 pointer-events-none"
                            >
                                <theme.icon className="w-32 h-32" />
                            </motion.div>
                        )}
                    </motion.button>
                ))}
            </motion.div>
        </div>
    );
}
